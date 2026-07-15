import {
  ArtifactType,
  Prisma,
  SourceAdmissionDecision,
  SourceEvidenceKind,
  SourceVerificationVerdict,
} from "@prisma/client";

import { db } from "../db";
import type { AdversarialVerificationResult } from "../workflows/source-verification/contracts";

export type CommittedSourcePackCandidate = {
  id: string;
  artifactType: ArtifactType;
  chapterId: string | null;
  committedVersionId: string | null;
  updatedAt: Date;
  title?: string | null;
};

export function selectCanonicalCommittedSourcePacks<T extends CommittedSourcePackCandidate>(artifacts: T[]) {
  const canonical = new Map<string, T & { chapterKey: string; versionId: string }>();
  for (const artifact of artifacts) {
    if (!artifact.chapterId || !artifact.committedVersionId) continue;
    const key = `${artifact.artifactType}:${artifact.chapterId}`;
    if (!canonical.has(key)) canonical.set(key, { ...artifact, chapterKey: artifact.chapterId, versionId: artifact.committedVersionId });
  }
  return [...canonical.values()];
}

export async function listCanonicalCommittedSourcePackVersions(bookId: string) {
  const artifacts = await db.artifact.findMany({
    where: {
      bookId,
      artifactType: { in: [ArtifactType.RESEARCH_PACK, ArtifactType.EXTERNAL_STORY_PACK] },
      committedVersionId: { not: null },
    },
    select: { id: true, artifactType: true, chapterId: true, committedVersionId: true, title: true, updatedAt: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  return selectCanonicalCommittedSourcePacks(artifacts);
}

function parseCorrections(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const field = entry.field;
    const corrected = entry.corrected;
    if (
      !["title", "author", "publisher", "publishedAt", "citation", "url", "doi", "sourceRole"].includes(String(field)) ||
      typeof corrected !== "string"
    ) return [];
    return [{
      field: field as "title" | "author" | "publisher" | "publishedAt" | "citation" | "url" | "doi" | "sourceRole",
      original: typeof entry.original === "string" ? entry.original : null,
      corrected,
    }];
  });
}

export async function findCachedSourceVerification(
  inputFingerprint: string,
  scope?: { artifactVersionId: string; evidenceRecordId: string },
) {
  return db.sourceVerificationResult.findFirst({
    where: {
      inputFingerprint,
      ...(scope ? {
        artifactVersionId: scope.artifactVersionId,
        evidenceRecordId: scope.evidenceRecordId,
      } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function appendSourceVerificationResult(
  result: AdversarialVerificationResult,
  workflowRunId?: string,
) {
  return db.sourceVerificationResult.upsert({
    where: {
      artifactVersionId_evidenceKind_evidenceRecordId_verificationFingerprint: {
        artifactVersionId: result.candidate.artifactVersionId,
        evidenceKind: result.candidate.kind as SourceEvidenceKind,
        evidenceRecordId: result.candidate.recordId,
        verificationFingerprint: result.verificationFingerprint,
      },
    },
    create: {
      bookId: result.candidate.bookId,
      chapterKey: result.candidate.chapterKey,
      artifactVersionId: result.candidate.artifactVersionId,
      evidenceKind: result.candidate.kind as SourceEvidenceKind,
      evidenceRecordId: result.candidate.recordId,
      sourceRecordId: result.candidate.sourceRecordId,
      workflowRunId,
      policyVersion: result.policyVersion,
      sourceFingerprint: result.sourceFingerprint,
      claimFingerprint: result.claimFingerprint,
      inputFingerprint: result.inputFingerprint,
      verificationFingerprint: result.verificationFingerprint,
      verdict: result.verdict as SourceVerificationVerdict,
      supportingExcerpt: result.supportingExcerpt,
      contradictingExcerpt: result.contradictingExcerpt,
      reasonCodesJson: result.reasonCodes as Prisma.InputJsonValue,
      correctionsJson: result.corrections as Prisma.InputJsonValue,
      notes: result.notes,
    },
    update: {},
  });
}

export async function reuseCachedSourceVerificationResult(input: {
  cached: Awaited<ReturnType<typeof findCachedSourceVerification>>;
  candidate: AdversarialVerificationResult["candidate"];
  workflowRunId?: string;
}) {
  if (!input.cached) throw new Error("Cached source verification result is required.");
  return db.sourceVerificationResult.upsert({
    where: {
      artifactVersionId_evidenceKind_evidenceRecordId_verificationFingerprint: {
        artifactVersionId: input.candidate.artifactVersionId,
        evidenceKind: input.candidate.kind as SourceEvidenceKind,
        evidenceRecordId: input.candidate.recordId,
        verificationFingerprint: input.cached.verificationFingerprint,
      },
    },
    create: {
      bookId: input.candidate.bookId,
      chapterKey: input.candidate.chapterKey,
      artifactVersionId: input.candidate.artifactVersionId,
      evidenceKind: input.candidate.kind as SourceEvidenceKind,
      evidenceRecordId: input.candidate.recordId,
      sourceRecordId: input.candidate.sourceRecordId,
      workflowRunId: input.workflowRunId,
      policyVersion: input.cached.policyVersion,
      sourceFingerprint: input.cached.sourceFingerprint,
      claimFingerprint: input.cached.claimFingerprint,
      inputFingerprint: input.cached.inputFingerprint,
      verificationFingerprint: input.cached.verificationFingerprint,
      verdict: input.cached.verdict,
      supportingExcerpt: input.cached.supportingExcerpt,
      contradictingExcerpt: input.cached.contradictingExcerpt,
      reasonCodesJson: input.cached.reasonCodesJson as Prisma.InputJsonValue,
      correctionsJson: input.cached.correctionsJson as Prisma.InputJsonValue,
      notes: `Reused cached independent verdict ${input.cached.id}. ${input.cached.notes ?? ""}`.trim(),
    },
    update: {},
  });
}

export async function listSourceVerificationResultsForChapter(
  bookId: string,
  chapterKey: string,
  artifactVersionIds?: string[],
) {
  return db.sourceVerificationResult.findMany({
    where: {
      bookId,
      chapterKey,
      ...(artifactVersionIds ? { artifactVersionId: { in: artifactVersionIds } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function appendSourceAdmissionReview(input: {
  bookId: string;
  chapterKey: string;
  artifactVersionId: string;
  evidenceKind: SourceEvidenceKind;
  evidenceRecordId: string;
  verificationResultId: string;
  verificationFingerprint: string;
  decision: SourceAdmissionDecision;
  reviewerUserId?: string | null;
  notes?: string | null;
}) {
  const result = await db.sourceVerificationResult.findFirst({ where: {
    id: input.verificationResultId,
    bookId: input.bookId,
    chapterKey: input.chapterKey,
    artifactVersionId: input.artifactVersionId,
    evidenceKind: input.evidenceKind,
    evidenceRecordId: input.evidenceRecordId,
    verificationFingerprint: input.verificationFingerprint,
  } });
  if (!result) throw new Error("Source admission rejected a stale or mismatched verification result.");
  const latest = await db.sourceAdmissionReview.findFirst({
    where: {
      bookId: input.bookId,
      chapterKey: input.chapterKey,
      evidenceKind: input.evidenceKind,
      evidenceRecordId: input.evidenceRecordId,
    },
    orderBy: { createdAt: "desc" },
  });
  const sameAsLatest = latest && shouldReuseLatestAdmissionReview(latest, input);
  return sameAsLatest ? latest : db.sourceAdmissionReview.create({ data: input });
}

export function shouldReuseLatestAdmissionReview(
  latest: {
    artifactVersionId: string;
    verificationFingerprint: string;
    decision: SourceAdmissionDecision;
    reviewerUserId: string | null;
    notes: string | null;
  },
  input: {
    artifactVersionId: string;
    verificationFingerprint: string;
    decision: SourceAdmissionDecision;
    reviewerUserId?: string | null;
    notes?: string | null;
  },
) {
  return (
    latest.artifactVersionId === input.artifactVersionId &&
    latest.verificationFingerprint === input.verificationFingerprint &&
    latest.decision === input.decision &&
    latest.reviewerUserId === (input.reviewerUserId ?? null) &&
    latest.notes === (input.notes ?? null)
  );
}

export async function listLatestSourceAdmissionReviews(
  bookId: string,
  chapterKey: string,
) {
  const reviews = await db.sourceAdmissionReview.findMany({
    where: { bookId, chapterKey },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const latest = new Map<string, (typeof reviews)[number]>();
  for (const review of reviews) {
    const key = `${review.evidenceKind}:${review.evidenceRecordId}`;
    if (!latest.has(key)) latest.set(key, review);
  }
  return [...latest.values()];
}

export async function getCurrentSourceAdmissions(input: {
  bookId: string;
  chapterKey: string;
  artifactVersionIds: string[];
}) {
  const [results, reviews] = await Promise.all([
    listSourceVerificationResultsForChapter(input.bookId, input.chapterKey, input.artifactVersionIds),
    listLatestSourceAdmissionReviews(input.bookId, input.chapterKey),
  ]);
  const latestResult = new Map<string, (typeof results)[number]>();
  for (const result of results) {
    const key = `${result.evidenceKind}:${result.evidenceRecordId}`;
    if (!latestResult.has(key)) latestResult.set(key, result);
  }
  const reviewByKey = new Map(
    reviews.map((review) => [`${review.evidenceKind}:${review.evidenceRecordId}`, review]),
  );
  return new Map(
    [...latestResult].map(([key, result]) => {
      const review = reviewByKey.get(key);
      const currentReview = review && review.artifactVersionId === result.artifactVersionId && review.verificationResultId === result.id && review.verificationFingerprint === result.verificationFingerprint ? review : null;
      return [key, {
        artifactVersionId: result.artifactVersionId,
        verificationResultId: result.id,
        verificationFingerprint: result.verificationFingerprint,
        verdict: result.verdict,
        supportingExcerpt: result.supportingExcerpt,
        corrections: parseCorrections(result.correctionsJson),
        decision: currentReview?.decision ?? null,
        manualException: currentReview?.decision === SourceAdmissionDecision.MANUAL_EXCEPTION,
        reviewNotes: currentReview?.notes ?? null,
        review: currentReview,
        admitted: isCurrentHumanAdmission({
          artifactVersionId: result.artifactVersionId,
          verificationResultId: result.id,
          verificationFingerprint: result.verificationFingerprint,
          verdict: result.verdict,
          review,
        }),
      }] as const;
    }),
  );
}

export function isCurrentHumanAdmission(input: {
  artifactVersionId: string;
  verificationResultId: string;
  verificationFingerprint: string;
  verdict: SourceVerificationVerdict;
  review?: {
    artifactVersionId: string;
    verificationFingerprint: string;
    decision: SourceAdmissionDecision;
    verificationResultId?: string | null;
  } | null;
}) {
  const review = input.review;
  if (!review) return false;
  if (
    review.artifactVersionId !== input.artifactVersionId ||
    review.verificationFingerprint !== input.verificationFingerprint
  ) return false;
  if (review.verificationResultId !== input.verificationResultId) return false;
  if (review.decision === SourceAdmissionDecision.MANUAL_EXCEPTION) return true;
  if (
    input.verdict === SourceVerificationVerdict.VERIFIED &&
    review.decision === SourceAdmissionDecision.APPROVE
  ) return true;
  return (
    input.verdict === SourceVerificationVerdict.VERIFIED_WITH_CORRECTION &&
    review.decision === SourceAdmissionDecision.APPROVE_CORRECTED
  );
}
