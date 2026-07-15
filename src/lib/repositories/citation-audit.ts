import {
  ArtifactType,
  ArtifactStatus,
  BookWorkflowType,
  ChapterApprovalStatus,
  CitationAuditChapterStatus,
  CitationAuditDecision,
  CitationAuditFindingKind,
  CitationStyle,
  Prisma,
  SourceAdmissionDecision,
  SourceEvidenceKind,
  StageKey,
} from "@prisma/client";
import { z } from "zod";

import { db } from "../db";
import { isCurrentHumanAdmission, listCanonicalCommittedSourcePackVersions } from "./source-verification";
import { getCommittedOutlineExpansion } from "./outline-artifacts";
import {
  CITATION_AUDIT_POLICY_VERSION,
  buildAuditFingerprint,
  buildSourceLedgerFingerprint,
  stableHash,
  type CitationAuditFinding,
  type CitationEvidence,
} from "../workflows/citation-audit/contracts";
import { commitStageAndUnlockNext, ensureStageStarted, markStageReadyForReview, reopenStageForRevision, resetStageToNotStarted } from "../workflows/stage-transition-service";

const FinalRevisionSchema = z.object({
  changedChapters: z.array(z.object({
    chapterKey: z.string(),
    chapterLabel: z.string(),
    revisedText: z.string(),
  })),
});

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function corrections(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.flatMap((entry) => {
    const item = objectValue(entry);
    return typeof item.field === "string" && typeof item.corrected === "string"
      ? [{ field: item.field, corrected: item.corrected }]
      : [];
  }) : [];
}

export async function getCanonicalFinalChapterKeys(bookId: string) {
  const outline = await getCommittedOutlineExpansion(bookId);
  const content = objectValue(outline?.contentJson);
  const sections = Array.isArray(content.sections) ? content.sections : [];
  return sections.flatMap((section) => {
    const chapters = Array.isArray(objectValue(section).chapters) ? objectValue(section).chapters as unknown[] : [];
    return chapters.flatMap((chapter) => typeof objectValue(chapter).chapterId === "string" ? [objectValue(chapter).chapterId as string] : []);
  });
}

export async function loadExactApprovedFinalChapter(bookId: string, chapterKey: string) {
  const approval = await db.chapterApprovalState.findUnique({ where: { bookId_chapterId: { bookId, chapterId: chapterKey } } });
  if (!approval || approval.status !== ChapterApprovalStatus.FINAL_REVISION_APPROVED || approval.isStale || !approval.approvedFinalVersionId) {
    throw new Error(`Chapter ${chapterKey} has no current approved final revision.`);
  }
  const version = await db.artifactVersion.findUnique({
    where: { id: approval.approvedFinalVersionId },
    include: { artifact: { select: { bookId: true, artifactType: true } } },
  });
  if (!version || version.artifact.bookId !== bookId || version.artifact.artifactType !== ArtifactType.MANUSCRIPT_REVISION) {
    throw new Error(`Approved final version ${approval.approvedFinalVersionId} is not a current manuscript revision.`);
  }
  const chapter = FinalRevisionSchema.parse(version.contentJson).changedChapters.find((item) => item.chapterKey === chapterKey);
  if (!chapter) throw new Error(`Approved final version does not contain chapter ${chapterKey}.`);
  return { approvedFinalVersionId: version.id, chapterKey, chapterLabel: chapter.chapterLabel, finalText: chapter.revisedText };
}

export async function loadCurrentAdmittedEvidence(bookId: string, chapterKey: string): Promise<CitationEvidence[]> {
  const committedPacks = (await listCanonicalCommittedSourcePackVersions(bookId)).filter((pack) => pack.chapterKey === chapterKey);
  const committedVersionIds = [...new Set(committedPacks.map((artifact) => artifact.versionId))];
  if (!committedVersionIds.length) return [];
  const results = await db.sourceVerificationResult.findMany({
    where: { bookId, chapterKey, artifactVersionId: { in: committedVersionIds } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const latest = new Map<string, (typeof results)[number]>();
  for (const result of results) {
    const key = `${result.evidenceKind}:${result.evidenceRecordId}`;
    if (!latest.has(key)) latest.set(key, result);
  }
  const reviews = await db.sourceAdmissionReview.findMany({ where: { bookId, chapterKey }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const latestReviews = new Map<string, (typeof reviews)[number]>();
  for (const review of reviews) {
    const key = `${review.evidenceKind}:${review.evidenceRecordId}`;
    if (!latestReviews.has(key)) latestReviews.set(key, review);
  }
  const admitted = [...latest].filter(([key, result]) => isCurrentHumanAdmission({
    artifactVersionId: result.artifactVersionId,
    verificationResultId: result.id,
    verificationFingerprint: result.verificationFingerprint,
    verdict: result.verdict,
    review: latestReviews.get(key),
  }));
  const evidence: CitationEvidence[] = [];
  for (const [key, result] of admitted) {
    const review = latestReviews.get(key);
    const manual = review?.decision === SourceAdmissionDecision.MANUAL_EXCEPTION;
    if (!result.supportingExcerpt && !manual) continue;
    const correctionMap = new Map(corrections(result.correctionsJson).map((item) => [item.field, item.corrected]));
    if (result.evidenceKind === SourceEvidenceKind.RESEARCH_CLAIM) {
      const source = await db.researchSource.findUnique({ where: { id: result.sourceRecordId } });
      const items = await db.researchItem.findMany({ where: { bookId, chapterKey, sourceRecordId: result.sourceRecordId, researchArtifactVersionId: result.artifactVersionId } });
      const item = items.find((value) => value.id === result.evidenceRecordId || objectValue(value.metadataJson).artifactRecordId === result.evidenceRecordId);
      if (!source || !item) continue;
      evidence.push({ key, kind: "RESEARCH_CLAIM", recordId: result.evidenceRecordId, sourceRecordId: source.id, claimOrStory: item.claimText, supportingExcerpt: result.supportingExcerpt ?? item.evidenceExcerpt ?? "Manual exception", verificationFingerprint: result.verificationFingerprint, admissionDecision: review?.decision, admissionFingerprint: stableHash({ artifactVersionId: review?.artifactVersionId, verificationFingerprint: review?.verificationFingerprint, decision: review?.decision, notes: review?.notes ?? null }), sourceFingerprint: result.sourceFingerprint, citation: { title: correctionMap.get("title") ?? source.title, author: correctionMap.get("author") ?? source.author, publisher: correctionMap.get("publisher") ?? source.publisher, publishedAt: correctionMap.get("publishedAt") ?? source.publishedAt?.toISOString() ?? null, accessedAt: source.accessedAt.toISOString(), url: correctionMap.get("url") ?? source.canonicalUrl ?? source.url, citationOverride: correctionMap.get("citation") } });
    } else {
      const source = await db.externalStorySource.findUnique({ where: { id: result.sourceRecordId } });
      const items = await db.externalStoryItem.findMany({ where: { bookId, chapterKey, sourceRecordId: result.sourceRecordId, externalStoryArtifactVersionId: result.artifactVersionId } });
      const item = items.find((value) => value.id === result.evidenceRecordId || objectValue(value.metadataJson).artifactRecordId === result.evidenceRecordId);
      if (!source || !item) continue;
      evidence.push({ key, kind: "EXTERNAL_STORY", recordId: result.evidenceRecordId, sourceRecordId: source.id, claimOrStory: [item.title, item.summary].filter(Boolean).join(" — "), supportingExcerpt: result.supportingExcerpt ?? "Manual exception", verificationFingerprint: result.verificationFingerprint, admissionDecision: review?.decision, admissionFingerprint: stableHash({ artifactVersionId: review?.artifactVersionId, verificationFingerprint: review?.verificationFingerprint, decision: review?.decision, notes: review?.notes ?? null }), sourceFingerprint: result.sourceFingerprint, citation: { title: correctionMap.get("title") ?? source.title, author: correctionMap.get("author") ?? source.author, publisher: correctionMap.get("publisher") ?? source.publisher, publishedAt: correctionMap.get("publishedAt") ?? source.publishedAt?.toISOString() ?? null, accessedAt: source.accessedAt.toISOString(), url: correctionMap.get("url") ?? source.canonicalUrl ?? source.url, citationOverride: correctionMap.get("citation") } });
    }
  }
  return evidence.sort((a, b) => a.key.localeCompare(b.key));
}

export function assertCitationAuditPersistenceInput(finalText: string, findings: CitationAuditFinding[]) {
  if (finalText.trim() && findings.length === 0) {
    throw new Error("Citation Audit rejected an empty finding set for nonempty final prose.");
  }
}

export async function persistCitationAudit(input: {
  bookId: string; chapterKey: string; approvedFinalVersionId: string; citationStyle: CitationStyle;
  finalText: string; evidence: CitationEvidence[]; findings: CitationAuditFinding[]; workflowRunId?: string;
}) {
  assertCitationAuditPersistenceInput(input.finalText, input.findings);
  const sourceLedgerFingerprint = buildSourceLedgerFingerprint(input.evidence);
  const auditFingerprint = buildAuditFingerprint({ approvedFinalVersionId: input.approvedFinalVersionId, finalText: input.finalText, sourceLedgerFingerprint, citationStyle: input.citationStyle });
  await db.$transaction(async (tx) => {
    for (const finding of input.findings) {
      const evidence = finding.evidenceKey ? input.evidence.find((item) => item.key === finding.evidenceKey) : undefined;
      const exactFindingFingerprint = stableHash({ auditFingerprint, claimFingerprint: finding.claimFingerprint, evidenceKey: finding.evidenceKey, assessment: finding.assessment, supportingExcerpt: finding.supportingExcerpt ?? null, notes: finding.notes ?? null });
      await tx.citationAuditFinding.upsert({
        where: { bookId_chapterKey_approvedFinalVersionId_findingFingerprint: { bookId: input.bookId, chapterKey: input.chapterKey, approvedFinalVersionId: input.approvedFinalVersionId, findingFingerprint: exactFindingFingerprint } },
        create: { bookId: input.bookId, chapterKey: input.chapterKey, approvedFinalVersionId: input.approvedFinalVersionId, claimText: finding.claimText, claimStart: finding.claimStart, claimEnd: finding.claimEnd, claimFingerprint: finding.claimFingerprint, sourceLedgerFingerprint, policyVersion: finding.policyVersion, findingFingerprint: exactFindingFingerprint, kind: finding.assessment as CitationAuditFindingKind, evidenceKind: evidence?.kind as SourceEvidenceKind | undefined, evidenceRecordId: evidence?.recordId, sourceRecordId: evidence?.sourceRecordId, supportingExcerpt: finding.supportingExcerpt, notes: finding.notes, workflowRunId: input.workflowRunId },
        update: {},
      });
    }
    await tx.citationAuditChapterState.upsert({
      where: { bookId_chapterKey: { bookId: input.bookId, chapterKey: input.chapterKey } },
      create: { bookId: input.bookId, chapterKey: input.chapterKey, approvedFinalVersionId: input.approvedFinalVersionId, sourceLedgerFingerprint, policyVersion: CITATION_AUDIT_POLICY_VERSION, citationStyle: input.citationStyle, auditFingerprint, currentWorkflowRunId: input.workflowRunId, status: CitationAuditChapterStatus.READY_FOR_REVIEW },
      update: { approvedFinalVersionId: input.approvedFinalVersionId, sourceLedgerFingerprint, policyVersion: CITATION_AUDIT_POLICY_VERSION, citationStyle: input.citationStyle, auditFingerprint, currentWorkflowRunId: input.workflowRunId, status: CitationAuditChapterStatus.READY_FOR_REVIEW, approvedAt: null, approvedByUserId: null, staleReason: null },
    });
  });
  await reopenStageForRevision({ bookId: input.bookId, stageKey: StageKey.CITATION_AUDIT });
  return auditFingerprint;
}

export async function getCitationAuditWorkspace(bookId: string, chapterKey?: string) {
  const [book, approvals, states] = await Promise.all([
    db.book.findUniqueOrThrow({ where: { id: bookId }, select: { citationStyle: true } }),
    db.chapterApprovalState.findMany({ where: { bookId, status: ChapterApprovalStatus.FINAL_REVISION_APPROVED, isStale: false }, orderBy: { chapterId: "asc" } }),
    db.citationAuditChapterState.findMany({ where: { bookId }, orderBy: { chapterKey: "asc" } }),
  ]);
  const selected = chapterKey ?? approvals[0]?.chapterId ?? null;
  const state = states.find((item) => item.chapterKey === selected) ?? null;
  const findings = selected && state ? await db.citationAuditFinding.findMany({ where: { bookId, chapterKey: selected, approvedFinalVersionId: state.approvedFinalVersionId, sourceLedgerFingerprint: state.sourceLedgerFingerprint, ...(state.currentWorkflowRunId ? { workflowRunId: state.currentWorkflowRunId } : {}) }, orderBy: { claimStart: "asc" } }) : [];
  const reviews = selected ? await db.citationAuditReview.findMany({ where: { bookId, chapterKey: selected }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }) : [];
  return { citationStyle: book.citationStyle, chapters: approvals.map((approval) => ({ chapterKey: approval.chapterId, approvedFinalVersionId: approval.approvedFinalVersionId, state: states.find((item) => item.chapterKey === approval.chapterId) ?? null })), selectedChapterKey: selected, state, findings, reviews };
}

export async function reviewCitationFinding(input: {
  bookId: string; chapterKey: string; findingId: string; decision: CitationAuditDecision;
  expectedAuditFingerprint: string; reviewerUserId?: string | null; reason?: string | null;
}) {
  const result = await db.$transaction(async (tx) => {
    const state = await tx.citationAuditChapterState.findUnique({ where: { bookId_chapterKey: { bookId: input.bookId, chapterKey: input.chapterKey } } });
    if (!state || state.auditFingerprint !== input.expectedAuditFingerprint) throw new Error("CITATION_AUDIT_STALE_CONFLICT");
    const finding = await tx.citationAuditFinding.findFirst({ where: { id: input.findingId, bookId: input.bookId, chapterKey: input.chapterKey, approvedFinalVersionId: state.approvedFinalVersionId, sourceLedgerFingerprint: state.sourceLedgerFingerprint, ...(state.currentWorkflowRunId ? { workflowRunId: state.currentWorkflowRunId } : {}) } });
    if (!finding) throw new Error("CITATION_AUDIT_STALE_CONFLICT");
    if (input.decision === CitationAuditDecision.MANUAL_EXCEPTION && !input.reason?.trim()) throw new Error("A documented reason is required for a citation exception.");
    await tx.citationAuditReview.create({ data: { bookId: input.bookId, chapterKey: input.chapterKey, findingId: finding.id, approvedFinalVersionId: state.approvedFinalVersionId, findingFingerprint: finding.findingFingerprint, sourceLedgerFingerprint: state.sourceLedgerFingerprint, policyVersion: state.policyVersion, decision: input.decision, reviewerUserId: input.reviewerUserId, reason: input.reason } });
    if (input.decision === CitationAuditDecision.REQUEST_REVISION) {
      await tx.citationAuditChapterState.update({ where: { id: state.id }, data: { status: CitationAuditChapterStatus.BLOCKED, approvedAt: null, staleReason: "Final prose requires citation remediation." } });
      await tx.chapterApprovalState.update({ where: { bookId_chapterId: { bookId: input.bookId, chapterId: input.chapterKey } }, data: { status: ChapterApprovalStatus.STALE, isStale: true, staleReason: "Citation audit requested final-prose revision.", staleAt: new Date() } });
    }
    if (input.decision === CitationAuditDecision.REOPEN) await tx.citationAuditChapterState.update({ where: { id: state.id }, data: { status: CitationAuditChapterStatus.READY_FOR_REVIEW, approvedAt: null, approvedByUserId: null } });
    return finding;
  });
  if (input.decision === CitationAuditDecision.REQUEST_REVISION) {
    await invalidateCitationPublicationOutputs(input.bookId);
  }
  return result;
}

export async function approveCitationAuditChapter(input: { bookId: string; chapterKey: string; expectedAuditFingerprint: string; reviewerUserId?: string | null }) {
  const [currentFinal, currentEvidence, book] = await Promise.all([
    loadExactApprovedFinalChapter(input.bookId, input.chapterKey),
    loadCurrentAdmittedEvidence(input.bookId, input.chapterKey),
    db.book.findUniqueOrThrow({ where: { id: input.bookId }, select: { citationStyle: true } }),
  ]);
  const currentSourceLedgerFingerprint = buildSourceLedgerFingerprint(currentEvidence);
  const currentAuditFingerprint = buildAuditFingerprint({ approvedFinalVersionId: currentFinal.approvedFinalVersionId, finalText: currentFinal.finalText, sourceLedgerFingerprint: currentSourceLedgerFingerprint, citationStyle: book.citationStyle, policyVersion: CITATION_AUDIT_POLICY_VERSION });
  return db.$transaction(async (tx) => {
    const state = await tx.citationAuditChapterState.findUnique({ where: { bookId_chapterKey: { bookId: input.bookId, chapterKey: input.chapterKey } } });
    const approval = await tx.chapterApprovalState.findUnique({ where: { bookId_chapterId: { bookId: input.bookId, chapterId: input.chapterKey } } });
    if (!state || state.auditFingerprint !== input.expectedAuditFingerprint || state.auditFingerprint !== currentAuditFingerprint || state.policyVersion !== CITATION_AUDIT_POLICY_VERSION || state.citationStyle !== book.citationStyle || state.sourceLedgerFingerprint !== currentSourceLedgerFingerprint || state.approvedFinalVersionId !== approval?.approvedFinalVersionId) throw new Error("CITATION_AUDIT_STALE_CONFLICT");
    const findings = await tx.citationAuditFinding.findMany({ where: { bookId: input.bookId, chapterKey: input.chapterKey, approvedFinalVersionId: state.approvedFinalVersionId, sourceLedgerFingerprint: state.sourceLedgerFingerprint, ...(state.currentWorkflowRunId ? { workflowRunId: state.currentWorkflowRunId } : {}) } });
    const reviews = await tx.citationAuditReview.findMany({ where: { bookId: input.bookId, chapterKey: input.chapterKey }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    const latest = new Map<string, (typeof reviews)[number]>(); for (const review of reviews) if (!latest.has(review.findingFingerprint)) latest.set(review.findingFingerprint, review);
    const unresolved = findings.filter((finding) => finding.kind !== CitationAuditFindingKind.SUPPORTED && finding.kind !== CitationAuditFindingKind.UNUSED).filter((finding) => latest.get(finding.findingFingerprint)?.decision !== CitationAuditDecision.MANUAL_EXCEPTION);
    if (unresolved.length) throw new Error(`Citation audit has ${unresolved.length} unresolved blocking finding(s).`);
    return tx.citationAuditChapterState.update({ where: { id: state.id }, data: { status: CitationAuditChapterStatus.APPROVED, approvedAt: new Date(), approvedByUserId: input.reviewerUserId, staleReason: null } });
  });
}

export async function reopenCitationAuditChapter(input: { bookId: string; chapterKey: string; expectedAuditFingerprint: string; reviewerUserId?: string | null; reason?: string | null }) {
  const result = await db.$transaction(async (tx) => {
    const state = await tx.citationAuditChapterState.findUnique({ where: { bookId_chapterKey: { bookId: input.bookId, chapterKey: input.chapterKey } } });
    if (!state || state.auditFingerprint !== input.expectedAuditFingerprint) throw new Error("CITATION_AUDIT_STALE_CONFLICT");
    await tx.citationAuditReview.create({ data: { bookId: input.bookId, chapterKey: input.chapterKey, approvedFinalVersionId: state.approvedFinalVersionId, findingFingerprint: state.auditFingerprint, sourceLedgerFingerprint: state.sourceLedgerFingerprint, policyVersion: state.policyVersion, decision: CitationAuditDecision.REOPEN, reviewerUserId: input.reviewerUserId, reason: input.reason } });
    return tx.citationAuditChapterState.update({ where: { id: state.id }, data: { status: CitationAuditChapterStatus.READY_FOR_REVIEW, approvedAt: null, approvedByUserId: null, staleReason: input.reason ?? "Citation Audit reopened." } });
  });
  await invalidateCitationPublicationOutputs(input.bookId);
  return result;
}

export async function invalidateCitationPublicationOutputs(bookId: string) {
  await reopenStageForRevision({ bookId, stageKey: StageKey.CITATION_AUDIT });
  const typeset = await db.bookStage.findUnique({ where: { bookId_stageKey: { bookId, stageKey: StageKey.TYPESET } }, select: { id: true } });
  if (!typeset) return;
  await db.$transaction([
    db.artifactVersion.updateMany({ where: { artifact: { bookId, stageId: typeset.id }, lifecycleState: { not: ArtifactStatus.SUPERSEDED } }, data: { lifecycleState: ArtifactStatus.SUPERSEDED } }),
    db.artifact.updateMany({ where: { bookId, stageId: typeset.id, status: { not: ArtifactStatus.SUPERSEDED } }, data: { status: ArtifactStatus.SUPERSEDED, currentVersionId: null, committedVersionId: null } }),
  ]);
  await resetStageToNotStarted({ bookId, stageKey: StageKey.TYPESET });
}

export type LockedCitationEntry = CitationEvidence["citation"] & { sourceRecordId: string; evidenceKeys: string[]; chapters: string[] };

function normalizedDoi(value: string | null | undefined) {
  const normalized = value?.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").toLowerCase() || "";
  return /^10\.\d{4,9}\/.+/.test(normalized) ? normalized : null;
}

function normalizedCanonicalUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const doi = normalizedDoi(url.hostname.toLowerCase().endsWith("doi.org") ? url.pathname.slice(1) : null);
    if (doi) return `doi:${doi}`;
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `url:${url.toString()}`;
  } catch {
    return "";
  }
}

export function canonicalCitationIdentity(evidence: CitationEvidence) {
  const doi = normalizedDoi(evidence.citation.doi) ?? normalizedDoi(evidence.citation.url);
  if (doi) return `doi:${doi}`;
  const url = normalizedCanonicalUrl(evidence.citation.url);
  if (url) return url;
  return `metadata:${stableHash({
    title: evidence.citation.title.trim().toLowerCase(),
    author: evidence.citation.author?.trim().toLowerCase() ?? null,
    publisher: evidence.citation.publisher?.trim().toLowerCase() ?? null,
    publishedAt: evidence.citation.publishedAt?.trim() ?? null,
  })}`;
}

function lockedMetadataFingerprint(citation: CitationEvidence["citation"]) {
  return stableHash({
    title: citation.title.trim(), author: citation.author?.trim() ?? null,
    publisher: citation.publisher?.trim() ?? null, publishedAt: citation.publishedAt?.trim() ?? null,
    url: normalizedCanonicalUrl(citation.url), doi: normalizedDoi(citation.doi) ?? normalizedDoi(citation.url),
    citationOverride: citation.citationOverride?.trim() ?? null,
  });
}

export function mergeLockedCitationEntry(entries: Map<string, LockedCitationEntry>, evidence: CitationEvidence, chapterKey: string) {
  const identity = canonicalCitationIdentity(evidence);
  const existing = entries.get(identity);
  if (existing) {
    if (lockedMetadataFingerprint(existing) !== lockedMetadataFingerprint(evidence.citation)) {
      throw new Error(`Conflicting locked citation metadata for canonical source ${identity}.`);
    }
    existing.evidenceKeys = [...new Set([...existing.evidenceKeys, evidence.key])].sort();
    existing.chapters = [...new Set([...existing.chapters, chapterKey])].sort();
  } else {
    entries.set(identity, { sourceRecordId: evidence.sourceRecordId, evidenceKeys: [evidence.key], ...evidence.citation, chapters: [chapterKey] });
  }
}

export async function lockApprovedCitationLedger(bookId: string, createdByUserId?: string | null) {
  let states = await db.citationAuditChapterState.findMany({ where: { bookId }, orderBy: { chapterKey: "asc" } });
  const approvals = await db.chapterApprovalState.findMany({ where: { bookId, status: ChapterApprovalStatus.FINAL_REVISION_APPROVED, isStale: false, approvedFinalVersionId: { not: null } } });
  const canonicalChapterKeys = await getCanonicalFinalChapterKeys(bookId);
  states = states.filter((state) => canonicalChapterKeys.includes(state.chapterKey));
  const approvalByChapter = new Map(approvals.map((item) => [item.chapterId, item]));
  if (!canonicalChapterKeys.length || canonicalChapterKeys.some((key) => !approvalByChapter.has(key)) || approvals.some((item) => !canonicalChapterKeys.includes(item.chapterId))) {
    throw new Error("Citation ledger cannot lock until the complete canonical outline chapter set has current final approvals.");
  }
  const book = await db.book.findUniqueOrThrow({ where: { id: bookId }, select: { citationStyle: true } });
  // A citation-metadata-only correction may refresh the source fingerprint
  // without changing proposition support. Preserve chapter approval only when
  // every previously used evidence key and exact supporting excerpt still match.
  for (const state of states.filter((item) => item.status === CitationAuditChapterStatus.APPROVED)) {
    const evidence = await loadCurrentAdmittedEvidence(bookId, state.chapterKey);
    const currentSourceFingerprint = buildSourceLedgerFingerprint(evidence);
    if (currentSourceFingerprint === state.sourceLedgerFingerprint) continue;
    const findings = await db.citationAuditFinding.findMany({ where: { bookId, chapterKey: state.chapterKey, approvedFinalVersionId: state.approvedFinalVersionId, sourceLedgerFingerprint: state.sourceLedgerFingerprint, kind: CitationAuditFindingKind.SUPPORTED, ...(state.currentWorkflowRunId ? { workflowRunId: state.currentWorkflowRunId } : {}) } });
    const propositionUnchanged = !evidence.some((item) => item.admissionDecision === SourceAdmissionDecision.MANUAL_EXCEPTION) && findings.length > 0 && findings.every((finding) => evidence.some((item) => item.kind === finding.evidenceKind && item.recordId === finding.evidenceRecordId && item.supportingExcerpt.trim() === finding.supportingExcerpt?.trim()));
    if (!propositionUnchanged) continue;
    const chapter = await loadExactApprovedFinalChapter(bookId, state.chapterKey);
    const auditFingerprint = buildAuditFingerprint({ approvedFinalVersionId: chapter.approvedFinalVersionId, finalText: chapter.finalText, sourceLedgerFingerprint: currentSourceFingerprint, citationStyle: book.citationStyle });
    await db.citationAuditChapterState.update({ where: { id: state.id }, data: { sourceLedgerFingerprint: currentSourceFingerprint, auditFingerprint } });
  }
  states = await db.citationAuditChapterState.findMany({ where: { bookId }, orderBy: { chapterKey: "asc" } });
  states = states.filter((state) => canonicalChapterKeys.includes(state.chapterKey));
  if (states.length !== canonicalChapterKeys.length || canonicalChapterKeys.some((chapterKey) => {
    const approval = approvalByChapter.get(chapterKey); const state = states.find((item) => item.chapterKey === chapterKey);
    return !approval?.approvedFinalVersionId || !state || state.status !== CitationAuditChapterStatus.APPROVED || state.policyVersion !== CITATION_AUDIT_POLICY_VERSION || state.citationStyle !== book.citationStyle || state.approvedFinalVersionId !== approval.approvedFinalVersionId;
  })) throw new Error("All canonical final chapters require a current approved Citation Audit for the exact approved version before publication.");
  const entries = new Map<string, LockedCitationEntry>();
  for (const state of states.filter((item) => item.status === CitationAuditChapterStatus.APPROVED)) {
    const evidence = await loadCurrentAdmittedEvidence(bookId, state.chapterKey);
    const allFindings = await db.citationAuditFinding.findMany({ where: { bookId, chapterKey: state.chapterKey, approvedFinalVersionId: state.approvedFinalVersionId, ...(state.currentWorkflowRunId ? { workflowRunId: state.currentWorkflowRunId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    const reviews = await db.citationAuditReview.findMany({ where: { bookId, chapterKey: state.chapterKey }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    const latestReviews = new Map<string, (typeof reviews)[number]>(); for (const review of reviews) if (!latestReviews.has(review.findingFingerprint)) latestReviews.set(review.findingFingerprint, review);
    const findings = new Map<string, (typeof allFindings)[number]>();
    for (const finding of allFindings) if (!findings.has(finding.claimFingerprint)) findings.set(finding.claimFingerprint, finding);
    for (const finding of findings.values()) {
      if (finding.kind !== CitationAuditFindingKind.SUPPORTED && latestReviews.get(finding.findingFingerprint)?.decision !== CitationAuditDecision.MANUAL_EXCEPTION) continue;
      const item = evidence.find((candidate) => candidate.recordId === finding.evidenceRecordId && candidate.kind === finding.evidenceKind);
      if (!item) continue;
      mergeLockedCitationEntry(entries, item, state.chapterKey);
    }
  }
  const ordered = [...entries.values()].sort((a, b) => `${a.author ?? ""}:${a.title}`.localeCompare(`${b.author ?? ""}:${b.title}`));
  const finalVersionsFingerprint = stableHash(canonicalChapterKeys.map((key) => [key, approvalByChapter.get(key)?.approvedFinalVersionId]));
  const sourceLedgerFingerprint = stableHash(states.map((item) => [item.chapterKey, item.sourceLedgerFingerprint]).sort());
  const ledgerFingerprint = stableHash({ finalVersionsFingerprint, sourceLedgerFingerprint, citationStyle: book.citationStyle, entries: ordered, policyVersion: CITATION_AUDIT_POLICY_VERSION });
  const ledger = await db.citationLedger.upsert({ where: { bookId_ledgerFingerprint: { bookId, ledgerFingerprint } }, create: { bookId, ledgerFingerprint, finalVersionsFingerprint, sourceLedgerFingerprint, policyVersion: CITATION_AUDIT_POLICY_VERSION, citationStyle: book.citationStyle, entriesJson: ordered as unknown as Prisma.InputJsonValue, chapterAuditIdsJson: states.map((item) => item.id), createdByUserId }, update: {} });
  const stage = await ensureStageStarted({ bookId, stageKey: StageKey.CITATION_AUDIT });
  if (stage.status !== "COMMITTED") {
    await markStageReadyForReview({ bookId, stageKey: StageKey.CITATION_AUDIT });
    await commitStageAndUnlockNext({ bookId, stageKey: StageKey.CITATION_AUDIT, workflowType: BookWorkflowType.NONFICTION });
  }
  return ledger;
}

export async function getCurrentLockedCitationLedger(bookId: string) {
  const ledgers = await db.citationLedger.findMany({ where: { bookId, policyVersion: CITATION_AUDIT_POLICY_VERSION }, orderBy: [{ lockedAt: "desc" }, { id: "desc" }] });
  if (!ledgers.length) return null;
  const approvals = await db.chapterApprovalState.findMany({ where: { bookId, status: ChapterApprovalStatus.FINAL_REVISION_APPROVED, isStale: false, approvedFinalVersionId: { not: null } } });
  const allStates = await db.citationAuditChapterState.findMany({ where: { bookId, status: CitationAuditChapterStatus.APPROVED, policyVersion: CITATION_AUDIT_POLICY_VERSION } });
  const canonicalChapterKeys = await getCanonicalFinalChapterKeys(bookId);
  const states = allStates.filter((state) => canonicalChapterKeys.includes(state.chapterKey));
  const approvalByChapter = new Map(approvals.map((item) => [item.chapterId, item]));
  const stateByChapter = new Map(states.map((item) => [item.chapterKey, item]));
  if (!canonicalChapterKeys.length || approvals.length !== canonicalChapterKeys.length || states.length !== canonicalChapterKeys.length || canonicalChapterKeys.some((key) => {
    const approval = approvalByChapter.get(key); const state = stateByChapter.get(key);
    return !approval?.approvedFinalVersionId || !state || state.policyVersion !== CITATION_AUDIT_POLICY_VERSION || state.approvedFinalVersionId !== approval.approvedFinalVersionId;
  })) return null;
  const book = await db.book.findUniqueOrThrow({ where: { id: bookId }, select: { citationStyle: true } });
  if (states.some((state) => state.citationStyle !== book.citationStyle)) return null;
  const finalVersionsFingerprint = stableHash(canonicalChapterKeys.map((key) => [key, approvalByChapter.get(key)?.approvedFinalVersionId]));
  const currentSources = await Promise.all(canonicalChapterKeys.map(async (key) => [key, buildSourceLedgerFingerprint(await loadCurrentAdmittedEvidence(bookId, key))] as const));
  const sourceLedgerFingerprint = stableHash(currentSources.sort());
  return ledgers.find((ledger) => ledger.finalVersionsFingerprint === finalVersionsFingerprint && ledger.sourceLedgerFingerprint === sourceLedgerFingerprint && ledger.citationStyle === book.citationStyle) ?? null;
}
