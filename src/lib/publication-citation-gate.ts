import { BookWorkflowType, ChapterApprovalStatus, CitationAuditChapterStatus } from "@prisma/client";
import { z } from "zod";

import { db } from "./db";
import { getCanonicalFinalChapterKeys, getCurrentLockedCitationLedger } from "./repositories/citation-audit";
import { CITATION_AUDIT_POLICY_VERSION } from "./workflows/citation-audit/contracts";

export const PROOF_ONLY_NOTICE = "PROOF ONLY — CITATION AUDIT INCOMPLETE — NOT FOR PUBLICATION";

export function buildPublicationProofMetadata(input: { ready: boolean; proofOnly: boolean; proofNotice: string | null; citationStyle: string; ledgerFingerprint?: string | null; bibliography: string[] }) {
  return {
    proofOnly: input.proofOnly,
    proofNotice: input.proofNotice,
    printReady: input.ready && !input.proofOnly,
    ebookReady: input.ready && !input.proofOnly,
    citationLedgerFingerprint: input.ledgerFingerprint ?? null,
    citationStyle: input.citationStyle,
    bibliography: input.bibliography,
  };
}

const LedgerEntrySchema = z.object({
  sourceRecordId: z.string(), evidenceKeys: z.array(z.string()).min(1), title: z.string(), author: z.string().nullable(), publisher: z.string().nullable(),
  publishedAt: z.string().nullable(), accessedAt: z.string().nullable(), url: z.string(), chapters: z.array(z.string()),
  doi: z.string().nullable().optional(),
  citationOverride: z.string().optional(),
});

export function evaluatePublicationCitationGate(input: {
  workflowType: BookWorkflowType;
  canonicalChapterKeys: string[];
  approvals: Array<{ chapterId: string; approvedFinalVersionId: string | null }>;
  states: Array<{ chapterKey: string; approvedFinalVersionId: string; status: CitationAuditChapterStatus; policyVersion: string; citationStyle: string }>;
  citationStyle: string;
  hasCurrentLedger: boolean;
  ledgerValid: boolean;
}) {
  if (input.workflowType !== BookWorkflowType.NONFICTION) return { ready: true, blockers: [] as string[] };
  const approvalByChapter = new Map(input.approvals.map((approval) => [approval.chapterId, approval]));
  const stateByChapter = new Map(input.states.map((state) => [state.chapterKey, state]));
  const blockers: string[] = [];
  if (input.canonicalChapterKeys.length === 0) blockers.push("The canonical chapter set is missing.");
  for (const chapterKey of input.canonicalChapterKeys) {
    const approval = approvalByChapter.get(chapterKey);
    const state = stateByChapter.get(chapterKey);
    if (!approval?.approvedFinalVersionId) {
      blockers.push(`Chapter ${chapterKey} has no current approved final revision.`);
      continue;
    }
    if (state?.status !== CitationAuditChapterStatus.APPROVED || state.approvedFinalVersionId !== approval.approvedFinalVersionId || state.policyVersion !== CITATION_AUDIT_POLICY_VERSION || state.citationStyle !== input.citationStyle) {
      blockers.push(`Chapter ${chapterKey} has no current approved Citation Audit.`);
    }
  }
  if (input.approvals.some((approval) => !input.canonicalChapterKeys.includes(approval.chapterId))) {
    blockers.push("Final approvals contain a chapter outside the canonical outline.");
  }
  if (!input.hasCurrentLedger) blockers.push("The approved citation ledger is missing or stale.");
  if (input.hasCurrentLedger && !input.ledgerValid) blockers.push("The approved citation ledger is invalid.");
  return { ready: blockers.length === 0, blockers };
}

export async function getPublicationCitationGate(bookId: string) {
  const book = await db.book.findUniqueOrThrow({ where: { id: bookId }, select: { workflowType: true, citationStyle: true } });
  if (book.workflowType !== BookWorkflowType.NONFICTION) return { ready: true as const, ledger: null, entries: [], citationStyle: book.citationStyle, blockers: [] };
  const [canonicalChapterKeys, approvals, states, ledger] = await Promise.all([
    getCanonicalFinalChapterKeys(bookId),
    db.chapterApprovalState.findMany({ where: { bookId, status: ChapterApprovalStatus.FINAL_REVISION_APPROVED, isStale: false, approvedFinalVersionId: { not: null } } }),
    db.citationAuditChapterState.findMany({ where: { bookId } }),
    getCurrentLockedCitationLedger(bookId),
  ]);
  const parsed = ledger ? z.array(LedgerEntrySchema).safeParse(ledger.entriesJson) : null;
  const evaluation = evaluatePublicationCitationGate({
    workflowType: book.workflowType,
    canonicalChapterKeys,
    approvals,
    states,
    citationStyle: book.citationStyle,
    hasCurrentLedger: Boolean(ledger),
    ledgerValid: parsed?.success ?? false,
  });
  return { ...evaluation, ledger, entries: parsed?.success ? parsed.data : [], citationStyle: book.citationStyle };
}

export async function requirePublicationCitationReady(bookId: string, proofMode = false) {
  const gate = await getPublicationCitationGate(bookId);
  if (!gate.ready && !proofMode) throw new Error(`PUBLICATION_CITATION_BLOCKED: ${gate.blockers.join(" ")}`);
  return { ...gate, proofOnly: !gate.ready && proofMode, proofNotice: !gate.ready && proofMode ? PROOF_ONLY_NOTICE : null };
}
