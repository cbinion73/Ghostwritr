import { CitationAuditDecision, CitationAuditChapterStatus, CitationStyle } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import {
  approveCitationAuditChapter,
  getCitationAuditWorkspace,
  invalidateCitationPublicationOutputs,
  loadExactApprovedFinalChapter,
  lockApprovedCitationLedger,
  reopenCitationAuditChapter,
  reviewCitationFinding,
} from "@/lib/repositories/citation-audit";
import { enqueueCitationAudit } from "@/lib/workflows/citation-audit/jobs";
import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";
import { parseLimitedJson, RequestLimitError, requestLimitResponse } from "@/lib/request-limits";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

async function owned(slug: string) {
  const user = await requireAuthenticatedAppUser();
  try { return { user, book: await getBookHeaderBySlugForUserOrThrow(slug, user.id) }; } catch { return null; }
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const value = await owned(slug);
  if (!value) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  const chapter = new URL(request.url).searchParams.get("chapter") ?? undefined;
  const workspace = await getCitationAuditWorkspace(value.book.id, chapter);
  const auditRun = workspace.selectedChapterKey ? await db.workflowRun.findFirst({ where: { bookId: value.book.id, AND: [{ inputJson: { path: ["kind"], equals: "final_citation_audit" } }, { inputJson: { path: ["chapterKey"], equals: workspace.selectedChapterKey } }] }, select: { id: true, status: true, errorText: true, outputJson: true }, orderBy: { startedAt: "desc" } }) : null;
  const finalChapter = workspace.selectedChapterKey ? await loadExactApprovedFinalChapter(value.book.id, workspace.selectedChapterKey).catch(() => null) : null;
  return NextResponse.json({ ...workspace, finalChapter, auditRun });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const value = await owned(slug);
  if (!value) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await parseLimitedJson(request, { label: "Citation Audit action" }); }
  catch (error) { if (error instanceof RequestLimitError) return requestLimitResponse(error); throw error; }
  const chapterKey = typeof body.chapterKey === "string" ? body.chapterKey : "";
  try {
    if (body.action === "SET_STYLE") {
      const style = typeof body.citationStyle === "string" && Object.values(CitationStyle).includes(body.citationStyle as CitationStyle) ? body.citationStyle as CitationStyle : null;
      if (!style) return NextResponse.json({ error: "Invalid citation style." }, { status: 400 });
      await db.$transaction([
        db.book.update({ where: { id: value.book.id }, data: { citationStyle: style } }),
        db.citationAuditChapterState.updateMany({ where: { bookId: value.book.id, citationStyle: { not: style } }, data: { status: CitationAuditChapterStatus.STALE, staleReason: "Citation style changed.", approvedAt: null, approvedByUserId: null } }),
      ]);
      await invalidateCitationPublicationOutputs(value.book.id);
      return NextResponse.json({ success: true });
    }
    if (body.action === "RUN") {
      const run = await enqueueCitationAudit({ bookId: value.book.id, chapterKey });
      triggerWorkflowRunInBackground(run.id);
      return NextResponse.json({ success: true, runId: run.id });
    }
    if (body.action === "LOCK_LEDGER") {
      const ledger = await lockApprovedCitationLedger(value.book.id, value.user.id);
      return NextResponse.json({ success: true, ledgerId: ledger.id, fingerprint: ledger.ledgerFingerprint });
    }
    const expectedAuditFingerprint = typeof body.expectedAuditFingerprint === "string" ? body.expectedAuditFingerprint : "";
    if (body.action === "APPROVE_CHAPTER") {
      const state = await approveCitationAuditChapter({ bookId: value.book.id, chapterKey, expectedAuditFingerprint, reviewerUserId: value.user.id });
      return NextResponse.json({ success: true, state });
    }
    if (body.action === "REOPEN_CHAPTER") {
      const state = await reopenCitationAuditChapter({ bookId: value.book.id, chapterKey, expectedAuditFingerprint, reviewerUserId: value.user.id, reason: typeof body.reason === "string" ? body.reason : null });
      return NextResponse.json({ success: true, state });
    }
    if (body.action === "REVIEW") {
      const findingId = typeof body.findingId === "string" ? body.findingId : "";
      const decision = typeof body.decision === "string" && Object.values(CitationAuditDecision).includes(body.decision as CitationAuditDecision) ? body.decision as CitationAuditDecision : null;
      if (!findingId || !decision) return NextResponse.json({ error: "Invalid Citation Audit review." }, { status: 400 });
      await reviewCitationFinding({ bookId: value.book.id, chapterKey, findingId, decision, expectedAuditFingerprint, reviewerUserId: value.user.id, reason: typeof body.reason === "string" ? body.reason : null });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown Citation Audit action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Citation Audit action failed.";
    return NextResponse.json({ error: message }, { status: /STALE_CONFLICT|became stale/.test(message) ? 409 : 400 });
  }
}
