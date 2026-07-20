import { createHash } from "node:crypto";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ArtifactType, StageKey } from "@prisma/client";
import { z } from "zod";

import type {
  PublicationPassCategory,
  PublicationPassFinding,
  PublicationPassReport,
} from "../../editing-types";
import { assertIndependentPublicationPassRouting, getModelForRole } from "../../llm/routing";
import { getBookBySlugOrThrow, getStageForBook, updateStageForBook } from "../../repositories/books";
import {
  createEditingArtifactVersion,
  getLatestEditingArtifactVersion,
} from "../../repositories/editing-artifacts";
import { buildSourceDraftSignature } from "./revision-support";
import { parseJson, parseJsonWithSchema } from "./workspace-support";
import { ManuscriptAssemblySchema } from "./workspace-schemas";

export const PUBLICATION_PASS_POLICY_VERSION = "publication-pass-v2";

const PublicationPassCategorySchema = z.enum([
  "developmental",
  "repetition",
  "copyedit",
  "theology",
  "history",
  "greek-hebrew",
  "scripture",
  "citation",
  "formatting",
  "author-decision",
]);

const ProposedFindingSchema = z.object({
  category: PublicationPassCategorySchema,
  severity: z.enum(["blocker", "required", "recommended", "advisory"]),
  findThis: z.string().min(1),
  changeTo: z.string().nullable().default(null),
  reason: z.string().min(1),
  sourceTitle: z.string().nullable().default(null),
  sourceUrl: z.string().nullable().default(null),
  confidence: z.enum(["high", "medium", "low"]),
});

const ChapterAuditReplySchema = z.object({
  summary: z.string(),
  findings: z.array(ProposedFindingSchema).max(50).default([]),
});

const AdjudicationReplySchema = z.object({
  summary: z.string(),
  decisions: z.array(z.object({
    findingId: z.string(),
    verdict: z.enum(["keep", "reject", "downgrade", "upgrade"]),
    severity: z.enum(["blocker", "required", "recommended", "advisory"]).nullable().default(null),
    note: z.string(),
  })).default([]),
  styleSheet: z.object({
    voicePrinciples: z.array(z.string()).default([]),
    capitalization: z.array(z.string()).default([]),
    scripture: z.array(z.string()).default([]),
    originalLanguages: z.array(z.string()).default([]),
    citations: z.array(z.string()).default([]),
  }),
});

export const PublicationPassReportSchema = z.object({
  policyVersion: z.string(),
  auditedAt: z.string(),
  sourceDraftSignature: z.string(),
  status: z.enum(["ready", "needs-changes", "blocked", "stale"]),
  modelStatus: z.enum(["complete", "specialist-unavailable", "adjudicator-unavailable", "partial"]),
  adversarialReviewed: z.boolean(),
  summary: z.string(),
  findings: z.array(z.object({
    id: z.string(),
    chapterKey: z.string(),
    chapterLabel: z.string(),
    locator: z.string(),
    category: PublicationPassCategorySchema,
    severity: z.enum(["blocker", "required", "recommended", "advisory"]),
    findThis: z.string(),
    changeTo: z.string().nullable(),
    reason: z.string(),
    sourceTitle: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    confidence: z.enum(["high", "medium", "low"]),
    disposition: z.enum(["open", "resolved", "accepted-risk", "rejected"]),
    resolutionNote: z.string().nullable(),
    adversarialNote: z.string().nullable(),
  })),
  specialistPasses: z.array(z.object({
    key: PublicationPassCategorySchema,
    label: z.string(),
    status: z.enum(["pass", "warn", "fail"]),
    findingCount: z.number(),
    summary: z.string(),
  })),
  styleSheet: z.object({
    voicePrinciples: z.array(z.string()).default([]),
    capitalization: z.array(z.string()).default([]),
    scripture: z.array(z.string()).default([]),
    originalLanguages: z.array(z.string()).default([]),
    citations: z.array(z.string()).default([]),
  }),
  blockers: z.array(z.string()).default([]),
  invalidFindingCount: z.number().default(0),
});

const PASS_LABELS: Record<PublicationPassCategory, string> = {
  developmental: "Developmental structure and size",
  repetition: "Repetition and redundancy",
  copyedit: "Grammar, punctuation, and line editing",
  theology: "Theological claims",
  history: "Historical and scientific claims",
  "greek-hebrew": "Greek and Hebrew",
  scripture: "Scripture quotations and capitalization",
  citation: "Citations, bibliography, URLs, and DOIs",
  formatting: "Formatting and document integrity",
  "author-decision": "Author decisions and permissions",
};

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 20);
}

function paragraphLocator(text: string, needle: string, chapterLabel: string) {
  const offset = text.indexOf(needle);
  if (offset < 0) return null;
  const paragraph = text.slice(0, offset).split(/\n\s*\n/).length;
  const occurrenceCount = text.split(needle).length - 1;
  return `${chapterLabel} — paragraph ${paragraph}${occurrenceCount > 1 ? ` — occurrence 1 of ${occurrenceCount}` : ""}`;
}

function normalizeFindings(input: {
  chapterKey: string;
  chapterLabel: string;
  chapterText: string;
  proposed: z.input<typeof ProposedFindingSchema>[];
}) {
  const findings: PublicationPassFinding[] = [];
  let invalid = 0;
  const seen = new Set<string>();

  for (const candidate of input.proposed) {
    const findThis = candidate.findThis.trim();
    const locator = paragraphLocator(input.chapterText, findThis, input.chapterLabel);
    if (!locator) {
      invalid += 1;
      continue;
    }
    const dedupeKey = `${candidate.category}:${findThis.toLocaleLowerCase()}:${candidate.changeTo?.trim() ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const sourceUrl = candidate.sourceUrl?.trim() || null;
    const sourceTitle = candidate.sourceTitle?.trim() || null;
    findings.push({
      id: hash(`${input.chapterKey}:${dedupeKey}`),
      chapterKey: input.chapterKey,
      chapterLabel: input.chapterLabel,
      locator,
      category: candidate.category,
      severity: candidate.severity,
      findThis,
      changeTo: candidate.changeTo?.trim() || null,
      reason: candidate.reason.trim(),
      sourceTitle: sourceTitle && input.chapterText.includes(sourceTitle) ? sourceTitle : null,
      sourceUrl: sourceUrl && /^https:\/\//i.test(sourceUrl) && input.chapterText.includes(sourceUrl) ? sourceUrl : null,
      confidence: candidate.confidence,
      disposition: "open",
      resolutionNote: null,
      adversarialNote: null,
    });
  }

  return { findings, invalid };
}

function normalizedRepetitionKey(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[“”‘’'".,:;!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findCrossChapterRepetition(
  chapters: Array<{ chapterKey: string; chapterLabel: string; chapterText: string }>,
) {
  const firstUse = new Map<string, { chapterKey: string; chapterLabel: string; text: string }>();
  const findings: PublicationPassFinding[] = [];

  for (const chapter of chapters) {
    const units = chapter.chapterText
      .split(/\n\s*\n|(?<=[.!?])\s+/)
      .map((value) => value.trim())
      .filter((value) => value.split(/\s+/).length >= 16);
    const seenInChapter = new Set<string>();
    for (const unit of units) {
      const key = normalizedRepetitionKey(unit);
      if (!key || seenInChapter.has(key)) continue;
      seenInChapter.add(key);
      const prior = firstUse.get(key);
      if (!prior) {
        firstUse.set(key, { chapterKey: chapter.chapterKey, chapterLabel: chapter.chapterLabel, text: unit });
        continue;
      }
      if (prior.chapterKey === chapter.chapterKey) continue;
      const locator = paragraphLocator(chapter.chapterText, unit, chapter.chapterLabel);
      if (!locator) continue;
      findings.push({
        id: hash(`cross-chapter-repetition:${prior.chapterKey}:${chapter.chapterKey}:${key}`),
        chapterKey: chapter.chapterKey,
        chapterLabel: chapter.chapterLabel,
        locator,
        category: "repetition",
        severity: "recommended",
        findThis: unit,
        changeTo: null,
        reason: `This passage repeats wording already used in ${prior.chapterLabel}. Decide whether the echo earns its place; otherwise compress, recast, or delete it.`,
        sourceTitle: null,
        sourceUrl: null,
        confidence: "high",
        disposition: "open",
        resolutionNote: null,
        adversarialNote: null,
      });
    }
  }

  return findings;
}

export function evaluatePublicationPassReport(
  report: PublicationPassReport | null,
  currentSourceDraftSignature: string,
) {
  if (!report) {
    return { status: "blocked" as const, blockers: ["A publication pass has not been run on the final manuscript."] };
  }
  if (report.policyVersion !== PUBLICATION_PASS_POLICY_VERSION) {
    return { status: "stale" as const, blockers: ["The publication policy changed after this pass. Run it again."] };
  }
  if (report.sourceDraftSignature !== currentSourceDraftSignature) {
    return { status: "stale" as const, blockers: ["The manuscript changed after the publication pass. Run it again."] };
  }

  const blockers: string[] = [];
  if (report.modelStatus !== "complete" || !report.adversarialReviewed) {
    blockers.push("The specialist and independent adversarial reviews did not both complete.");
  }
  if (report.invalidFindingCount > 0) {
    blockers.push(`${report.invalidFindingCount} proposed correction(s) failed exact-text validation.`);
  }
  const openBlocking = report.findings.filter(
    (finding) => finding.disposition === "open" &&
      (finding.severity === "blocker" || finding.severity === "required" || finding.category === "author-decision"),
  );
  if (openBlocking.length > 0) {
    blockers.push(`${openBlocking.length} required correction(s) or author decision(s) remain open.`);
  }
  if (blockers.length > 0) return { status: "blocked" as const, blockers };

  const openRecommended = report.findings.filter(
    (finding) => finding.disposition === "open" && finding.severity === "recommended",
  );
  if (openRecommended.length > 0) {
    return {
      status: "needs-changes" as const,
      blockers: [`${openRecommended.length} recommended publication correction(s) remain open.`],
    };
  }
  return { status: "ready" as const, blockers: [] };
}

function buildSpecialistPasses(findings: PublicationPassFinding[]) {
  return (Object.keys(PASS_LABELS) as PublicationPassCategory[]).map((key) => {
    const categoryFindings = findings.filter((finding) => finding.category === key && finding.disposition === "open");
    const hasFail = categoryFindings.some((finding) => finding.severity === "blocker" || finding.severity === "required");
    return {
      key,
      label: PASS_LABELS[key],
      status: hasFail ? "fail" as const : categoryFindings.length > 0 ? "warn" as const : "pass" as const,
      findingCount: categoryFindings.length,
      summary: categoryFindings.length === 0
        ? "No unresolved findings in this pass."
        : `${categoryFindings.length} unresolved finding${categoryFindings.length === 1 ? "" : "s"}.`,
    };
  });
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

export async function generatePublicationPassWorkflow(bookSlug: string) {
  assertIndependentPublicationPassRouting();
  const book = await getBookBySlugOrThrow(bookSlug);
  const manuscriptVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.MANUSCRIPT_ASSEMBLY);
  const manuscript = parseJsonWithSchema(manuscriptVersion?.contentJson, ManuscriptAssemblySchema);
  if (!manuscript) throw new Error("Assemble the manuscript before running the Publication Pass.");

  const sourceDraftSignature = buildSourceDraftSignature(manuscript.chapters);
  const priorVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.EDITORIAL_REVIEW);
  const prior = parseJsonWithSchema(priorVersion?.contentJson, PublicationPassReportSchema);
  if (prior?.sourceDraftSignature === sourceDraftSignature && prior.policyVersion === PUBLICATION_PASS_POLICY_VERSION) {
    return prior;
  }

  const specialist = await getModelForRole("publication-pass:specialist", { temperature: 0.1, timeoutMs: 180000 });
  const adjudicator = await getModelForRole("publication-pass:adjudicator", { temperature: 0.1, timeoutMs: 180000 });
  let findings: PublicationPassFinding[] = [];
  let invalidFindingCount = 0;
  let specialistFailureCount = 0;

  if (specialist) {
    const chapterResults = await mapWithConcurrency(manuscript.chapters, 2, async (chapter) => {
      try {
        const structured = specialist.withStructuredOutput(ChapterAuditReplySchema);
        const result = await structured.invoke([
          new SystemMessage(`
You are a publication-grade book editor performing a final, line-by-line audit.

Audit every sentence supplied. Report only concrete, defensible findings with exact FIND THIS text copied verbatim from the chapter. Cover developmental compression, repetition, grammar and punctuation, theology, historical and scientific claims, Greek/Hebrew and transliteration, Scripture quotations and capitalization, citations/URLs/DOIs, formatting, permissions, privacy, and author decisions.

Rules:
- Preserve the author's voice and theological position while distinguishing interpretation from historical fact.
- Do not invent a source, URL, quotation, correction, or locator.
- Populate sourceTitle or sourceUrl only when that exact value already appears in the supplied chapter. The separate Citation Audit verifies current external evidence.
- Use author-decision when truth depends on consent, identity, lived experience, or author intent.
- A factual claim lacking evidence is needs-source work: explain that in reason; never mark it verified from memory.
- Every named authority must have traceable evidence for the particular work, quotation, paraphrase, or claim attributed to that authority. A generic bibliography entry does not cure an unsupported anecdote or quotation.
- Distinguish later traditions from first-century evidence, suggestive images from documented history, related but different historical practices from one another, and theological application from historical fact.
- Treat exact dates, percentages, device-use figures, interruption findings, scientific mechanisms, biographical episodes, and attributed sayings as source-sensitive claims.
- Audit both directions of the citation relationship: every authority used must be represented in the source record, and source material must not appear in a reader bibliography unless the final prose actually uses it.
- For direct quotations, require exact wording, translation or edition where relevant, and a traceable source. Never repair an unverified quotation by merely removing quotation marks.
- Do not let a citation conceal overstatement. Narrow the prose to what the source actually supports.
- Give exact replacement text when safe. Use null when the author or a verified source must decide.
- Greek or Hebrew should remain only where it materially advances the argument; correct morphology and transliteration.
- Count and examine all non-English terms. Prefer a clear English sentence when the original language is ornamental rather than argumentative.
- Read as a human reader as well as a copyeditor: flag repeated openings, repeated scenes, conclusion drag, over-explanation, and material that has already earned its point elsewhere.
- Return no praise and no generic advice. Return only actionable findings grounded in the supplied prose.
          `),
          new HumanMessage(JSON.stringify({
            bookTitle: manuscript.title,
            workflowType: book.workflowType,
            chapterKey: chapter.chapterKey,
            chapterLabel: chapter.chapterLabel,
            sectionTitle: chapter.sectionTitle,
            manuscriptWordCount: manuscript.totalWords,
            editorialOverview: manuscript.editorialOverview,
            chapterText: chapter.chapterText,
          })),
        ]);
        return { chapter, result };
      } catch (error) {
        console.error(`[publication-pass] specialist failed for ${bookSlug}/${chapter.chapterKey}:`, error);
        specialistFailureCount += 1;
        return { chapter, result: { summary: "Specialist audit failed.", findings: [] } };
      }
    });

    for (const { chapter, result } of chapterResults) {
      const normalized = normalizeFindings({
        chapterKey: chapter.chapterKey,
        chapterLabel: chapter.chapterLabel,
        chapterText: chapter.chapterText,
        proposed: result.findings ?? [],
      });
      findings.push(...normalized.findings);
      invalidFindingCount += normalized.invalid;
    }
  }

  findings.push(...findCrossChapterRepetition(manuscript.chapters));

  findings = [...new Map(findings.map((finding) => [
    `${finding.chapterKey}:${finding.category}:${finding.findThis.toLocaleLowerCase()}:${finding.changeTo ?? ""}`,
    finding,
  ])).values()];

  let adjudarialSummary = "Independent adversarial review did not complete.";
  let adversarialReviewed = false;
  let styleSheet: PublicationPassReport["styleSheet"] = {
    voicePrinciples: [], capitalization: [], scripture: [], originalLanguages: [], citations: [],
  };

  if (specialist && adjudicator && specialistFailureCount === 0) {
    try {
      const structured = adjudicator.withStructuredOutput(AdjudicationReplySchema);
      const result = await structured.invoke([
        new SystemMessage(`
You are the independent senior editor adjudicating another editor's proposed publication corrections.

Challenge every finding. Reject preferences presented as facts, unsupported theological certainty, invented sources, non-verbatim anchors, changes that flatten voice, and corrections that are not publication-relevant. Keep genuine factual, grammatical, citation, repetition, permissions, and author-decision issues. You may change severity but may not create new prose or findings. Return one decision for every finding ID and a compact manuscript style sheet.
        `),
        new HumanMessage(JSON.stringify({
          bookTitle: manuscript.title,
          editorialOverview: manuscript.editorialOverview,
          findings,
        })),
      ]);
      const decisions = result.decisions ?? [];
      const decisionById = new Map(decisions.map((decision) => [decision.findingId, decision]));
      findings = findings.map((finding) => {
        const decision = decisionById.get(finding.id);
        if (!decision) return finding;
        return {
          ...finding,
          severity: decision.severity ?? finding.severity,
          disposition: decision.verdict === "reject" ? "rejected" as const : finding.disposition,
          adversarialNote: decision.note.trim() || null,
        };
      });
      adjudarialSummary = result.summary;
      styleSheet = {
        voicePrinciples: result.styleSheet.voicePrinciples ?? [],
        capitalization: result.styleSheet.capitalization ?? [],
        scripture: result.styleSheet.scripture ?? [],
        originalLanguages: result.styleSheet.originalLanguages ?? [],
        citations: result.styleSheet.citations ?? [],
      };
      adversarialReviewed = decisions.length === findings.length;
    } catch (error) {
      console.error(`[publication-pass] adjudication failed for ${bookSlug}:`, error);
    }
  }

  const modelStatus: PublicationPassReport["modelStatus"] = !specialist
    ? "specialist-unavailable"
    : specialistFailureCount > 0
      ? "partial"
      : !adjudicator || !adversarialReviewed
        ? "adjudicator-unavailable"
        : "complete";

  const provisional: PublicationPassReport = {
    policyVersion: PUBLICATION_PASS_POLICY_VERSION,
    auditedAt: new Date().toISOString(),
    sourceDraftSignature,
    status: "blocked",
    modelStatus,
    adversarialReviewed,
    summary: adjudarialSummary,
    findings,
    specialistPasses: buildSpecialistPasses(findings),
    styleSheet,
    blockers: [],
    invalidFindingCount,
  };
  const evaluation = evaluatePublicationPassReport(provisional, sourceDraftSignature);
  const report: PublicationPassReport = { ...provisional, status: evaluation.status, blockers: evaluation.blockers };

  await createEditingArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.EDITORIAL_REVIEW,
    title: "Publication Pass",
    summary: `${report.status}: ${report.findings.filter((finding) => finding.disposition === "open").length} open finding(s).`,
    contentJson: report,
    contentText: JSON.stringify(report, null, 2),
    promptTemplateVersion: PUBLICATION_PASS_POLICY_VERSION,
    modelName: modelStatus === "complete" ? "publication-pass:specialist+adjudicator" : modelStatus,
  });

  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...metadata,
      publicationPassStatus: report.status,
      publicationPassSourceDraftSignature: sourceDraftSignature,
      publicationPassUpdatedAt: report.auditedAt,
    },
  });

  return report;
}

export async function resolvePublicationPassFindingWorkflow(
  bookSlug: string,
  findingId: string,
  disposition: "resolved" | "accepted-risk" | "rejected",
  resolutionNote: string,
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const manuscriptVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.MANUSCRIPT_ASSEMBLY);
  const manuscript = parseJsonWithSchema(manuscriptVersion?.contentJson, ManuscriptAssemblySchema);
  if (!manuscript) throw new Error("The manuscript assembly is missing.");
  const currentSignature = buildSourceDraftSignature(manuscript.chapters);
  const reportVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.EDITORIAL_REVIEW);
  const report = parseJsonWithSchema(reportVersion?.contentJson, PublicationPassReportSchema);
  if (!report) throw new Error("Run the Publication Pass before resolving findings.");
  if (report.sourceDraftSignature !== currentSignature) throw new Error("The Publication Pass is stale. Run it again.");
  if (!resolutionNote.trim()) throw new Error("Record why this finding is resolved or accepted.");
  if (!report.findings.some((finding) => finding.id === findingId)) throw new Error("Publication Pass finding not found.");

  const next: PublicationPassReport = {
    ...report,
    auditedAt: new Date().toISOString(),
    findings: report.findings.map((finding) => finding.id === findingId
      ? { ...finding, disposition, resolutionNote: resolutionNote.trim() }
      : finding),
  };
  next.specialistPasses = buildSpecialistPasses(next.findings);
  const evaluation = evaluatePublicationPassReport(next, currentSignature);
  next.status = evaluation.status;
  next.blockers = evaluation.blockers;

  await createEditingArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.EDITORIAL_REVIEW,
    title: "Publication Pass",
    summary: `Finding ${findingId} marked ${disposition}.`,
    contentJson: next,
    contentText: JSON.stringify(next, null, 2),
    promptTemplateVersion: PUBLICATION_PASS_POLICY_VERSION,
    modelName: "human-resolution",
  });
  return next;
}
