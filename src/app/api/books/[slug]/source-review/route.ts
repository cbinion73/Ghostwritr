import { NextResponse } from "next/server";
import { ArtifactType, SourceAdmissionDecision, SourceEvidenceKind } from "@prisma/client";

import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import {
  appendSourceAdmissionReview,
  isCurrentHumanAdmission,
  listCanonicalCommittedSourcePackVersions,
  listLatestSourceAdmissionReviews,
  listSourceVerificationResultsForChapter,
} from "@/lib/repositories/source-verification";
import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";
import { enqueueSourceVerification } from "@/lib/workflows/source-verification/jobs";
import { summarizeSourceAdmissionReadiness, validateSourceAdmissionDecision } from "@/lib/workflows/source-verification/admission-policy";
import { RequestLimitError, parseLimitedJson, requestLimitResponse } from "@/lib/request-limits";

export const dynamic = "force-dynamic";

async function ownedBook(slug: string) {
  const user = await requireAuthenticatedAppUser();
  try {
    return { user, book: await getBookHeaderBySlugForUserOrThrow(slug, user.id) };
  } catch {
    return null;
  }
}

async function committedSourceVersions(bookId: string) {
  return listCanonicalCommittedSourcePackVersions(bookId);
}

function canonicalRecordId(metadataJson: unknown, fallback: string) {
  return metadataJson && typeof metadataJson === "object" && !Array.isArray(metadataJson) &&
    typeof (metadataJson as Record<string, unknown>).artifactRecordId === "string"
    ? (metadataJson as Record<string, string>).artifactRecordId
    : fallback;
}

async function chapterReadiness(bookId: string, versions: Awaited<ReturnType<typeof committedSourceVersions>>) {
  const chapterKeys = [...new Set(versions.map((value) => value.chapterKey))];
  return Promise.all(chapterKeys.map(async (chapterKey) => {
    const chapterVersions = versions.filter((value) => value.chapterKey === chapterKey);
    const versionIds = chapterVersions.map((value) => value.versionId);
    const [results, reviews, researchItems, storyItems] = await Promise.all([
      listSourceVerificationResultsForChapter(bookId, chapterKey, versionIds),
      listLatestSourceAdmissionReviews(bookId, chapterKey),
      db.researchItem.findMany({ where: { researchArtifactVersionId: { in: versionIds } }, select: { id: true, metadataJson: true } }),
      db.externalStoryItem.findMany({ where: { storyArtifactVersionId: { in: versionIds } }, select: { id: true, metadataJson: true } }),
    ]);
    const latestResults = new Map<string, (typeof results)[number]>();
    for (const result of results) {
      const key = `${result.evidenceKind}:${result.evidenceRecordId}`;
      if (!latestResults.has(key)) latestResults.set(key, result);
    }
    const latestReviews = new Map<string, (typeof reviews)[number]>();
    for (const review of reviews) {
      const key = `${review.evidenceKind}:${review.evidenceRecordId}`;
      if (!latestReviews.has(key)) latestReviews.set(key, review);
    }
    const keys = [
      ...researchItems.map((item) => `${SourceEvidenceKind.RESEARCH_CLAIM}:${canonicalRecordId(item.metadataJson, item.id)}`),
      ...storyItems.map((item) => `${SourceEvidenceKind.EXTERNAL_STORY}:${canonicalRecordId(item.metadataJson, item.id)}`),
    ];
    const recordStates = keys.map((key) => {
      const result = latestResults.get(key);
      const review = latestReviews.get(key);
      const decided = Boolean(result && review && review.artifactVersionId === result.artifactVersionId && review.verificationResultId === result.id && review.verificationFingerprint === result.verificationFingerprint && review.decision !== SourceAdmissionDecision.REOPEN);
      if (!result) return { admitted: false, decided: false, kind: key.startsWith("RESEARCH_CLAIM:") ? "RESEARCH_CLAIM" as const : "EXTERNAL_STORY" as const };
      return { decided, kind: result.evidenceKind as "RESEARCH_CLAIM" | "EXTERNAL_STORY", admitted: isCurrentHumanAdmission({
        artifactVersionId: result.artifactVersionId,
        verificationResultId: result.id,
        verificationFingerprint: result.verificationFingerprint,
        verdict: result.verdict,
        review,
      }) };
    });
    const hasResearchPack = chapterVersions.some((v) => v.artifactType === ArtifactType.RESEARCH_PACK);
    const hasExternalStoryPack = chapterVersions.some((v) => v.artifactType === ArtifactType.EXTERNAL_STORY_PACK);
    return {
      chapterKey,
      ...summarizeSourceAdmissionReadiness({
        hasResearchPack,
        hasExternalStoryPack,
        records: recordStates,
      }),
    };
  }));
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const owned = await ownedBook(slug);
  if (!owned) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  const versions = await committedSourceVersions(owned.book.id);
  const requested = new URL(request.url).searchParams.get("chapter")?.trim();
  const chapterKeys = [...new Set(versions.map((version) => version.chapterKey))];
  const chapterKey = requested && chapterKeys.includes(requested) ? requested : chapterKeys[0] ?? null;
  if (!chapterKey) return NextResponse.json({ chapterKeys: [], chapterKey: null, records: [], chapterReadiness: [], allChaptersReady: false });

  const chapterVersions = versions.filter((version) => version.chapterKey === chapterKey);
  const versionIds = chapterVersions.map((version) => version.versionId);
  const [results, reviews, researchItems, storyItems, researchSources, storySources] = await Promise.all([
    listSourceVerificationResultsForChapter(owned.book.id, chapterKey, versionIds),
    listLatestSourceAdmissionReviews(owned.book.id, chapterKey),
    db.researchItem.findMany({ where: { researchArtifactVersionId: { in: versionIds } } }),
    db.externalStoryItem.findMany({ where: { storyArtifactVersionId: { in: versionIds } } }),
    db.researchSource.findMany({ where: { researchArtifactVersionId: { in: versionIds } } }),
    db.externalStorySource.findMany({ where: { storyArtifactVersionId: { in: versionIds } } }),
  ]);
  const latestResult = new Map<string, (typeof results)[number]>();
  for (const result of results) {
    const key = `${result.evidenceKind}:${result.evidenceRecordId}`;
    if (!latestResult.has(key)) latestResult.set(key, result);
  }
  const reviewByKey = new Map(reviews.map((review) => [`${review.evidenceKind}:${review.evidenceRecordId}`, review]));
  const researchSourceById = new Map(researchSources.map((source) => [source.id, source]));
  const storySourceById = new Map(storySources.map((source) => [source.id, source]));
  const records = [
    ...researchItems.map((item) => ({ kind: SourceEvidenceKind.RESEARCH_CLAIM, item, source: researchSourceById.get(item.sourceRecordId), text: item.claimText })),
    ...storyItems.map((item) => ({ kind: SourceEvidenceKind.EXTERNAL_STORY, item, source: storySourceById.get(item.sourceRecordId), text: item.summary })),
  ].map(({ kind, item, source, text }) => {
    const recordId = canonicalRecordId(item.metadataJson, item.id);
    const key = `${kind}:${recordId}`;
    const result = latestResult.get(key);
    const review = reviewByKey.get(key);
    return {
      kind,
      recordId,
      artifactVersionId: kind === SourceEvidenceKind.RESEARCH_CLAIM ? item.researchArtifactVersionId : item.storyArtifactVersionId,
      text,
      source: source ? { id: source.id, title: source.title, url: source.url, author: source.author, publisher: source.publisher } : null,
      verification: result ? {
        id: result.id,
        fingerprint: result.verificationFingerprint,
        verdict: result.verdict,
        supportingExcerpt: result.supportingExcerpt,
        contradictingExcerpt: result.contradictingExcerpt,
        reasonCodes: result.reasonCodesJson,
        corrections: result.correctionsJson,
        notes: result.notes,
      } : null,
      review: review ? { decision: review.decision, notes: review.notes, fingerprint: review.verificationFingerprint } : null,
    };
  });
  const verificationRun = await db.workflowRun.findFirst({
    where: {
      bookId: owned.book.id,
      AND: [
        { inputJson: { path: ["kind"], equals: "adversarial_source_verification" } },
        { inputJson: { path: ["chapterKey"], equals: chapterKey } },
      ],
    },
    select: { id: true, status: true, errorText: true, outputJson: true },
    orderBy: { startedAt: "desc" },
  });
  const readiness = await chapterReadiness(owned.book.id, versions);
  return NextResponse.json({
    chapterKeys,
    chapterKey,
    versions: chapterVersions,
    records,
    verificationRun,
    chapterReadiness: readiness,
    allChaptersReady: readiness.length > 0 && readiness.every((entry) => entry.ready),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const owned = await ownedBook(slug);
  if (!owned) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await parseLimitedJson(request, { label: "Source review decision" });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const chapterKey = typeof body.chapterKey === "string" ? body.chapterKey.trim() : "";
  const versions = (await committedSourceVersions(owned.book.id)).filter((version) => version.chapterKey === chapterKey);
  if (!chapterKey || versions.length === 0) return NextResponse.json({ error: "Chapter source pack not found" }, { status: 404 });
  if (body.action === "VERIFY") {
    const run = await enqueueSourceVerification({
      bookId: owned.book.id,
      chapterKey,
      researchArtifactVersionId: versions.find((version) => version.artifactType === ArtifactType.RESEARCH_PACK)?.versionId,
      externalStoryArtifactVersionId: versions.find((version) => version.artifactType === ArtifactType.EXTERNAL_STORY_PACK)?.versionId,
      forceRerun: true,
    });
    triggerWorkflowRunInBackground(run.id);
    return NextResponse.json({ success: true, runId: run.id });
  }

  const kind = body.kind === "RESEARCH_CLAIM" ? SourceEvidenceKind.RESEARCH_CLAIM : body.kind === "EXTERNAL_STORY" ? SourceEvidenceKind.EXTERNAL_STORY : null;
  const recordId = typeof body.recordId === "string" ? body.recordId : "";
  const fingerprint = typeof body.verificationFingerprint === "string" ? body.verificationFingerprint : "";
  const artifactVersionId = typeof body.artifactVersionId === "string" ? body.artifactVersionId : "";
  const decision = typeof body.decision === "string" && Object.values(SourceAdmissionDecision).includes(body.decision as SourceAdmissionDecision)
    ? body.decision as SourceAdmissionDecision
    : null;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!kind || !recordId || !fingerprint || !artifactVersionId || !decision) return NextResponse.json({ error: "Invalid source review decision" }, { status: 400 });
  if (!versions.some((version) => version.versionId === artifactVersionId)) return NextResponse.json({ error: "Source pack changed; reload this chapter before deciding." }, { status: 409 });
  const latest = await db.sourceVerificationResult.findFirst({ where: { bookId: owned.book.id, chapterKey, artifactVersionId, evidenceKind: kind, evidenceRecordId: recordId }, orderBy: { createdAt: "desc" } });
  if (!latest || latest.verificationFingerprint !== fingerprint || latest.artifactVersionId !== artifactVersionId) {
    return NextResponse.json({ error: "Verification changed; reload this chapter before deciding." }, { status: 409 });
  }
  const policyError = validateSourceAdmissionDecision({ decision, verdict: latest.verdict, corrections: latest.correctionsJson, notes });
  if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });
  const review = await appendSourceAdmissionReview({
    bookId: owned.book.id,
    chapterKey,
    artifactVersionId,
    evidenceKind: kind,
    evidenceRecordId: recordId,
    verificationResultId: latest.id,
    verificationFingerprint: fingerprint,
    decision,
    reviewerUserId: owned.user.id,
    notes: notes || null,
  });
  return NextResponse.json({ success: true, reviewId: review.id });
}
