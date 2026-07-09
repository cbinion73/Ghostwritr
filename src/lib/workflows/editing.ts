import { ArtifactType, BookWorkflowType, StageKey, StageStatus } from "@prisma/client";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import type { ChapterDraftBundle, ChapterReviewBundle } from "../chapter-draft-types";
import type { ParagraphOutline } from "../paragraph-outline-types";
import type {
  DraftQualityRollup,
  EditorialAssessment,
  EditorialAssessmentChapterNote,
  EditorialPreferenceProfile,
  EditorialReadinessGate,
  EditorialRevisionPlan,
  EditorialRevisionPlanExecution,
  EditorialMode,
  EditingChapterSnapshot,
  EditingMessage,
  ManuscriptAssembly,
  ManuscriptRevision,
  MarketingHandoffPackage,
  PublishPackageSyncState,
  PublishingPackage,
  ProvenanceReport,
  SuggestedEditorialRevisionTarget,
} from "../editing-types";
import type { FictionDraftArtifact } from "../fiction-types";
import { getModelForRole } from "../llm/routing";
import { getBookBySlugOrThrow, getStageForBook, updateBookMetadata, updateStageForBook } from "../repositories/books";
import { getChapterArtifactVersions } from "../repositories/chapter-draft-artifacts";
import {
  commitEditingArtifact,
  createEditingArtifactVersion,
  getEditingArtifactVersionById,
  getEditingArtifactVersions,
  getLatestEditingArtifactVersion,
} from "../repositories/editing-artifacts";
import { getCommittedBookSetup } from "../repositories/book-setup-artifacts";
import { getCommittedFictionArtifactVersion } from "../repositories/fiction-artifacts";
import { getCommittedOutlineExpansion } from "../repositories/outline-artifacts";
import { clearStageStaleDependency } from "../workflow-dependencies";
import { BookSetupProfileSchema } from "../artifact-schemas";
import { estimatePagesFromWords } from "../manuscript-metrics";
import { buildPublishPackageSyncState } from "../publish-sync";

const ManuscriptAssemblySchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  assembledAt: z.string(),
  sourceDraftSignature: z.string().default(""),
  chapterCount: z.number(),
  totalWords: z.number(),
  editorialOverview: z.string(),
  outstandingConcerns: z.array(z.string()).default([]),
  chapters: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      sectionTitle: z.string(),
      wordCount: z.number(),
      reviewSummary: z.string().nullable(),
      chapterText: z.string(),
      quality: z
        .object({
          score: z.number(),
          readiness: z.enum(["strong", "watch", "needs attention"]),
          needsRevision: z.boolean(),
          revisionPasses: z.number(),
          signals: z
            .array(
              z.object({
                label: z.string(),
                state: z.enum(["pass", "warn", "fail"]),
                detail: z.string(),
              }),
            )
            .default([]),
        })
        .nullable()
        .optional(),
    }),
  ),
  fullText: z.string(),
  chapterKeys: z.array(z.string()).default([]),
});

const PublishingPackageSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  preparedAt: z.string(),
  totalWords: z.number(),
  chapterCount: z.number(),
  trimSize: z.string(),
  targetPageCount: z.number().nullable().optional(),
  outputFormats: z.array(z.enum(["PRINT", "EBOOK", "AUDIO"])).default([]),
  exportFormats: z.array(z.enum(["docx", "html", "markdown", "json"])).default([]),
  frontMatter: z.array(z.string()).default([]),
  backMatter: z.array(z.string()).default([]),
  packageComponents: z.array(z.string()).default([]),
  exportProfiles: z
    .array(
      z.object({
        format: z.enum(["PRINT", "EBOOK", "AUDIO"]),
        status: z.enum(["ready", "not_requested"]),
        notes: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  draftQualitySummary: z
    .object({
      averageScore: z.number(),
      chaptersNeedingRevision: z.number(),
      strongChapters: z.number(),
      watchChapters: z.number(),
      attentionChapters: z.number(),
      totalRevisionPasses: z.number(),
      weakestChapterLabel: z.string().nullable(),
      headline: z.string(),
      blockers: z.array(z.string()).default([]),
    })
    .nullable()
    .optional(),
  typesettingPlan: z
    .object({
      trimProfile: z.string().default("Trim profile pending refresh."),
      chapterOpenerStyle: z.string(),
      runningHeads: z.string(),
      tocIncluded: z.boolean(),
      widowOrphanControl: z.boolean(),
      sectionStartsOnRecto: z.boolean().default(true),
      signaturePageMultiple: z.number().default(16),
      estimatedSignatureCount: z.number().default(0),
      estimatedBlankPages: z.number().default(0),
      estimatedFrontMatterPages: z.number().default(0),
      estimatedBodyPages: z.number().default(0),
      estimatedBackMatterPages: z.number().default(0),
      estimatedTotalPages: z.number().default(0),
      notes: z.array(z.string()).default([]),
    })
    .default({
      trimProfile: "Trim profile pending refresh.",
      chapterOpenerStyle: "Chapter opener plan pending refresh.",
      runningHeads: "Running head plan pending refresh.",
      tocIncluded: true,
      widowOrphanControl: true,
      sectionStartsOnRecto: true,
      signaturePageMultiple: 16,
      estimatedSignatureCount: 0,
      estimatedBlankPages: 0,
      estimatedFrontMatterPages: 0,
      estimatedBodyPages: 0,
      estimatedBackMatterPages: 0,
      estimatedTotalPages: 0,
      notes: ["Refresh the publishing package to generate the full typesetting plan."],
    }),
  preflightChecks: z
    .array(
      z.object({
        name: z.string(),
        status: z.enum(["pass", "warn", "fail"]),
        detail: z.string(),
      }),
    )
    .default([]),
  notes: z.array(z.string()).default([]),
  packageStatus: z.enum(["draft", "prepared_needs_editorial_revision", "ready_to_publish"]),
});

const ProvenanceReportSchema = z.object({
  generatedAt: z.string(),
  workflowType: z.enum(["NONFICTION", "FICTION", "WORKBOOK"]),
  title: z.string(),
  artifactTrail: z.array(
    z.object({
      stage: z.string(),
      status: z.string(),
      source: z.string(),
    }),
  ).default([]),
  editorialActions: z.array(
    z.object({
      kind: z.string(),
      detail: z.string(),
    }),
  ).default([]),
  packageReadiness: z.object({
    packageStatus: z.enum(["draft", "prepared_needs_editorial_revision", "ready_to_publish"]),
    totalWords: z.number(),
    chapterCount: z.number(),
  }),
  notes: z.array(z.string()).default([]),
});

const MarketingHandoffPackageSchema = z.object({
  generatedAt: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  audience: z.array(z.string()).default([]),
  positioning: z.array(z.string()).default([]),
  hooks: z.array(z.string()).default([]),
  synopsis: z.string(),
  exportReadiness: z.array(z.string()).default([]),
});

const EditorialAssessmentSchema = z.object({
  assessedAt: z.string(),
  mode: z.enum([
    "structural-edit",
    "clarity-pass",
    "pacing-pass",
    "continuity-pass",
    "voice-consistency-pass",
    "line-edit",
  ]),
  chapterKey: z.string().nullable().optional(),
  assessmentSummary: z.string(),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  chapterNotes: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      observation: z.string(),
      priority: z.enum(["high", "medium", "low"]),
    }),
  ).default([]),
  nextActions: z.array(z.string()).default([]),
  // The manuscript signature (see buildSourceDraftSignature) this assessment
  // was actually generated against — lets generateEditorialAssessmentWorkflow
  // skip a redundant ~73K-token full-manuscript LLM call when nothing has
  // changed since the last assessment for the same mode/chapter.
  sourceDraftSignature: z.string().default(""),
});

const EditorialPreferenceProfileSchema = z.object({
  updatedAt: z.string(),
  styleNotes: z.string(),
  preserveVoice: z.boolean().default(true),
  preferTighterProse: z.boolean().default(true),
  preferBolderCuts: z.boolean().default(false),
  acceptedRevisionCount: z.number().default(0),
  rejectedRevisionCount: z.number().default(0),
  acceptedModes: z
    .array(
      z.enum([
        "structural-edit",
        "clarity-pass",
        "pacing-pass",
        "continuity-pass",
        "voice-consistency-pass",
        "line-edit",
      ]),
    )
    .default([]),
  rejectedModes: z
    .array(
      z.enum([
        "structural-edit",
        "clarity-pass",
        "pacing-pass",
        "continuity-pass",
        "voice-consistency-pass",
        "line-edit",
      ]),
    )
    .default([]),
});

const EditorialRevisionPlanSchema = z.object({
  generatedAt: z.string(),
  focus: z.enum(["whole-book", "chapter-specific"]),
  chapterKey: z.string().nullable().optional(),
  summary: z.string(),
  globalObjectives: z.array(z.string()).default([]),
  coherenceRisks: z.array(z.string()).default([]),
  passes: z.array(z.string()).default([]),
  chapterQueue: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      reason: z.string(),
      targetOutcome: z.string().default("Deliver a cleaner revision that resolves the highest-risk issue in this chapter."),
      preserveNotes: z.array(z.string()).default([]),
      recommendedMode: z.enum([
        "structural-edit",
        "clarity-pass",
        "pacing-pass",
        "continuity-pass",
        "voice-consistency-pass",
        "line-edit",
      ]),
    }),
  ),
});

const EditorialRevisionPlanExecutionSchema = z.object({
  executedAt: z.string(),
  generatedCount: z.number().default(0),
  autoAppliedCount: z.number().default(0),
  executedChapterKeys: z.array(z.string()).default([]),
  modes: z
    .array(
      z.enum([
        "structural-edit",
        "clarity-pass",
        "pacing-pass",
        "continuity-pass",
        "voice-consistency-pass",
        "line-edit",
      ]),
    )
    .default([]),
});

const SuggestedEditorialRevisionTargetSchema = z.object({
  mode: z.enum([
    "structural-edit",
    "clarity-pass",
    "pacing-pass",
    "continuity-pass",
    "voice-consistency-pass",
    "line-edit",
  ]),
  chapterKey: z.string().nullable().optional(),
  selectedChapterKeys: z.array(z.string()).default([]),
  brief: z.string(),
  preserveNotes: z.array(z.string()).default([]),
});

const EditorialReadinessGateSchema = z.object({
  evaluatedAt: z.string(),
  score: z.number(),
  recommendation: z.enum(["ready_for_commit", "needs_revision", "blocked"]),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  nextActions: z.array(z.string()).default([]),
});

const FinalHandoffStateSchema = z.object({
  finalizedAt: z.string(),
  archivedAt: z.string().nullable().optional(),
  packageVersionId: z.string().nullable().optional(),
  packagePreparedAt: z.string().nullable().optional(),
  notes: z.array(z.string()).default([]),
});

const ManuscriptRevisionSchema = z.object({
  revisedAt: z.string(),
  mode: z.enum([
    "structural-edit",
    "clarity-pass",
    "pacing-pass",
    "continuity-pass",
    "voice-consistency-pass",
    "line-edit",
  ]),
  chapterKey: z.string().nullable().optional(),
  selectedChapterKeys: z.array(z.string()).default([]),
  revisionSummary: z.string(),
  rationale: z.string(),
  changedChapters: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      originalText: z.string(),
      revisedText: z.string(),
      changeSummary: z.string(),
    }),
  ),
});

const EditingConversationReplySchema = z.object({
  reply: z.string(),
  wholeBookAssessment: z.string(),
  focusChapterKey: z.string().nullable().optional(),
  nextActions: z.array(z.string()).default([]),
  suggestedRevision: z
    .object({
      mode: z.enum([
        "structural-edit",
        "clarity-pass",
        "pacing-pass",
        "continuity-pass",
        "voice-consistency-pass",
        "line-edit",
      ]),
      chapterKey: z.string().nullable().optional(),
      selectedChapterKeys: z.array(z.string()).default([]),
      brief: z.string(),
      preserveNotes: z.array(z.string()).default([]),
    })
    .nullable()
    .optional(),
});

const EditorialAssessmentReplySchema = z.object({
  assessmentSummary: z.string(),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  // Every sibling array field here defaults to [] -- chapterNotes was the
  // one exception, so a whole-book assessment (no chapterKey focus) that
  // reasonably omitted per-chapter notes failed Zod validation entirely,
  // discarding an otherwise good, expensive LLM response and silently
  // falling back to the generic deterministic assessment. Confirmed live
  // in production 2026-07-08 (Dust, cb584c9a...): a detailed, specific
  // assessment (named actual repeated passages, an embedded planning
  // artifact leaking into Chapter 7, etc.) thrown away over this.
  chapterNotes: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      observation: z.string(),
      priority: z.enum(["high", "medium", "low"]),
    }),
  ).default([]),
  nextActions: z.array(z.string()).default([]),
});

const ManuscriptRevisionReplySchema = z.object({
  revisionSummary: z.string(),
  rationale: z.string(),
  changedChapters: z
    .array(
      z.object({
        chapterKey: z.string(),
        chapterLabel: z.string(),
        revisedText: z.string(),
        changeSummary: z.string(),
      }),
    )
    .default([]),
});

const EditorialRevisionPlanReplySchema = z.object({
  summary: z.string(),
  globalObjectives: z.array(z.string()).default([]),
  coherenceRisks: z.array(z.string()).default([]),
  passes: z.array(z.string()).default([]),
  chapterQueue: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      reason: z.string(),
      targetOutcome: z.string().default("Deliver a cleaner revision that resolves the highest-risk issue in this chapter."),
      preserveNotes: z.array(z.string()).default([]),
      recommendedMode: z.enum([
        "structural-edit",
        "clarity-pass",
        "pacing-pass",
        "continuity-pass",
        "voice-consistency-pass",
        "line-edit",
      ]),
    }),
  ).default([]),
});

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function countWords(value: string | null | undefined) {
  return value?.split(/\s+/).filter(Boolean).length ?? 0;
}

function parseEditingMessages(value: unknown): EditingMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is EditingMessage => {
    return Boolean(
      entry &&
        typeof entry === "object" &&
        "role" in entry &&
        "content" in entry &&
        typeof (entry as { role?: unknown }).role === "string" &&
        typeof (entry as { content?: unknown }).content === "string",
    );
  });
}

function modeLabel(mode: EditorialMode) {
  switch (mode) {
    case "structural-edit":
      return "structural edit";
    case "clarity-pass":
      return "clarity pass";
    case "pacing-pass":
      return "pacing pass";
    case "continuity-pass":
      return "continuity pass";
    case "voice-consistency-pass":
      return "voice consistency pass";
    case "line-edit":
      return "line edit";
  }
}

function parseJsonWithSchema<T>(value: unknown, schema: z.ZodType<T>): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function getEditorialPreferenceProfile(metadata: Record<string, unknown>): EditorialPreferenceProfile {
  return (
    parseJsonWithSchema(metadata.editorialPreferences, EditorialPreferenceProfileSchema) ?? {
      updatedAt: new Date(0).toISOString(),
      styleNotes: "",
      preserveVoice: true,
      preferTighterProse: true,
      preferBolderCuts: false,
      acceptedRevisionCount: 0,
      rejectedRevisionCount: 0,
      acceptedModes: [],
      rejectedModes: [],
    }
  );
}

async function getEditorModel() {
  // Do not pass maxOutputTokens here -- getModelForRole only applies the
  // routing table's per-role ceiling (16000 for final-editor:polish, sized
  // for a full chapter rewrite) when the caller hasn't already specified
  // one. This used to hardcode 4000, silently shadowing that higher
  // ceiling. Confirmed live in production 2026-07-08 (Dust, cb584c9a...):
  // a 2,955-word chapter came back as a 795-word "revision" that reads as
  // complete (ends on a clean sentence) but is missing most of the
  // chapter -- Opus ran out of room mid-rewrite well before the actual
  // 4000-token cap would suggest, once the JSON wrapper (summary,
  // rationale, changeSummary) is counted against the same budget.
  return getModelForRole("final-editor:polish", {
    temperature: 0.2,
    timeoutMs: 120000,
  });
}

/**
 * Every editing call in this file used to route through getEditorModel()
 * (Opus) regardless of task — including the assessment, conversation, and
 * revision-plan calls below, none of which rewrite prose. Those are
 * analytical/planning/dialogue tasks over the whole manuscript; the routing
 * table already defines "final-editor:assess" (Sonnet) specifically for
 * this ("full manuscript audit — analytical, Sonnet sufficient"), it just
 * was never wired up here. Opus stays reserved for
 * generateManuscriptRevisionWorkflow, the one call that actually rewrites
 * chapter prose.
 */
async function getEditorAssessModel() {
  // Same fix as getEditorModel above -- let the routing table's 16000
  // ceiling for final-editor:assess apply instead of shadowing it with a
  // hardcoded 4000.
  return getModelForRole("final-editor:assess", {
    temperature: 0.2,
    timeoutMs: 120000,
  });
}

async function loadNonfictionEditingChapters(bookId: string) {
  const committedOutlineVersion = await getCommittedOutlineExpansion(bookId);
  const outline = parseJson<ParagraphOutline | null>(committedOutlineVersion?.contentJson, null);
  if (!outline) {
    throw new Error("Committed paragraph-level Outline is required before Editing can begin.");
  }

  const chapters: EditingChapterSnapshot[] = [];

  for (const section of outline.sections) {
    for (const chapter of section.chapters) {
      const [draftVersions, reviewVersions] = await Promise.all([
        getChapterArtifactVersions(bookId, chapter.chapterId, ArtifactType.CHAPTER_DRAFT, 1),
        getChapterArtifactVersions(bookId, chapter.chapterId, ArtifactType.EDITORIAL_REVIEW, 1),
      ]);
      const draft = draftVersions[0]
        ? parseJson<ChapterDraftBundle | null>(draftVersions[0].contentJson, null)
        : null;
      const review = reviewVersions[0]
        ? parseJson<ChapterReviewBundle | null>(reviewVersions[0].contentJson, null)
        : null;
      // Some chapters were committed through the plain conversational
      // agent-chat path rather than the structured chapter-draft flow, so
      // their contentJson is a bare `{ text }` blob instead of a full
      // ChapterDraftBundle -- draft.chapterText comes back undefined even
      // though the prose is right there under a different key. Same
      // fallback shape already handled for Research/External Stories in
      // chapter-linked-notes.ts.
      const rawDraftContent = draftVersions[0]?.contentJson as { text?: unknown } | null | undefined;
      const resolvedChapterText =
        draft?.chapterText ?? (typeof rawDraftContent?.text === "string" ? rawDraftContent.text : "");

      chapters.push({
        chapterKey: chapter.chapterId,
        chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`,
        sectionTitle: section.sectionTitle,
        wordCount: countWords(resolvedChapterText),
        reviewSummary: review?.overallAssessment ?? null,
        chapterText: resolvedChapterText,
        quality: draft?.quality ?? null,
      });
    }
  }

  return { outline, chapters };
}

async function loadFictionEditingChapters(bookId: string) {
  const committedDraft = await getCommittedFictionArtifactVersion(
    bookId,
    ArtifactType.FICTION_DRAFT_MANUSCRIPT,
  );
  const draft = parseJson<FictionDraftArtifact | null>(committedDraft?.contentJson, null);
  if (!draft || draft.chapters.length === 0) {
    throw new Error("Committed fiction Draft is required before Editing can begin.");
  }

  const chapters: EditingChapterSnapshot[] = draft.chapters.map((chapter) => ({
    chapterKey: chapter.chapterKey,
    chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.title}`,
    sectionTitle: "Narrative Draft",
    wordCount: chapter.wordCount,
    reviewSummary: null,
    chapterText: chapter.text,
    quality: chapter.quality ?? null,
  }));

  return { outline: null, chapters };
}

async function loadEditingChapters(book: { id: string; workflowType: BookWorkflowType }) {
  if (book.workflowType === BookWorkflowType.FICTION) {
    return loadFictionEditingChapters(book.id);
  }

  return loadNonfictionEditingChapters(book.id);
}

function buildEditorialOverview(chapters: EditingChapterSnapshot[]) {
  const reviewed = chapters.filter((chapter) => chapter.reviewSummary);
  const qualityAware = chapters.filter((chapter) => chapter.quality);
  if (reviewed.length === 0) {
    if (qualityAware.length > 0) {
      const averageScore = Math.round(
        qualityAware.reduce((sum, chapter) => sum + (chapter.quality?.score ?? 0), 0) / qualityAware.length,
      );
      return `The manuscript is assembled and draft quality signals average ${averageScore}/100, but no chapter-level editorial reviews exist yet.`;
    }

    return "The manuscript is assembled, but no chapter-level editorial reviews exist yet.";
  }

  return `The manuscript is assembled from ${chapters.length} drafted chapters. ${reviewed.length} chapters already have editorial review notes that can guide the next whole-book revision pass.`;
}

function buildOutstandingConcerns(chapters: EditingChapterSnapshot[]) {
  const concerns = chapters
    .filter((chapter) => !chapter.reviewSummary)
    .slice(0, 4)
    .map((chapter) => `${chapter.chapterLabel} still lacks chapter-level editorial review notes.`);

  for (const chapter of chapters) {
    if (chapter.quality?.needsRevision) {
      concerns.push(
        `${chapter.chapterLabel} still shows ${chapter.quality.readiness} draft quality (${chapter.quality.score}/100).`,
      );
    }
    if (concerns.length >= 6) {
      break;
    }
  }

  return concerns;
}

function buildFullText(chapters: EditingChapterSnapshot[]) {
  return chapters
    .map((chapter) => `# ${chapter.chapterLabel}\n\n${chapter.chapterText}`)
    .join("\n\n");
}

function buildSourceDraftSignature(chapters: EditingChapterSnapshot[]) {
  return chapters
    .map(
      (chapter) =>
        `${chapter.chapterKey}:${countWords(chapter.chapterText)}:${chapter.chapterText}:${chapter.quality?.score ?? "na"}:${chapter.quality?.revisionPasses ?? 0}`,
    )
    .join("\n---\n");
}

function buildDraftQualityRollup(chapters: EditingChapterSnapshot[]): DraftQualityRollup | null {
  const qualityChapters = chapters.filter(
    (chapter): chapter is EditingChapterSnapshot & { quality: NonNullable<EditingChapterSnapshot["quality"]> } =>
      Boolean(chapter.quality),
  );
  if (qualityChapters.length === 0) {
    return null;
  }

  const averageScore = Math.round(
    qualityChapters.reduce((sum, chapter) => sum + chapter.quality.score, 0) / qualityChapters.length,
  );
  const chaptersNeedingRevision = qualityChapters.filter((chapter) => chapter.quality.needsRevision).length;
  const strongChapters = qualityChapters.filter((chapter) => chapter.quality.readiness === "strong").length;
  const watchChapters = qualityChapters.filter((chapter) => chapter.quality.readiness === "watch").length;
  const attentionChapters = qualityChapters.filter(
    (chapter) => chapter.quality.readiness === "needs attention",
  ).length;
  const totalRevisionPasses = qualityChapters.reduce(
    (sum, chapter) => sum + chapter.quality.revisionPasses,
    0,
  );
  const weakestChapter =
    [...qualityChapters].sort((a, b) => a.quality.score - b.quality.score)[0] ?? null;

  return {
    averageScore,
    chaptersNeedingRevision,
    strongChapters,
    watchChapters,
    attentionChapters,
    totalRevisionPasses,
    weakestChapterLabel: weakestChapter?.chapterLabel ?? null,
    headline:
      chaptersNeedingRevision === 0
        ? `Draft quality is stable across ${qualityChapters.length} chapters.`
        : `${chaptersNeedingRevision} chapter${chaptersNeedingRevision === 1 ? "" : "s"} still need another draft pass before the editorial finish is truly clean.`,
    blockers: qualityChapters
      .filter((chapter) => chapter.quality.needsRevision)
      .slice(0, 4)
      .map(
        (chapter) =>
          `${chapter.chapterLabel} is at ${chapter.quality.score}/100 with ${chapter.quality.readiness} readiness. ${buildExcerpt(describeChapterQualityHotspots(chapter), 160)}`,
      ),
  };
}

function describeChapterQualityHotspots(chapter: EditingChapterSnapshot) {
  const weakSignals = (chapter.quality?.signals ?? []).filter((signal) => signal.state !== "pass");
  if (weakSignals.length === 0) {
    return chapter.reviewSummary ?? "No major quality hotspots are currently recorded.";
  }

  return weakSignals
    .slice(0, 3)
    .map((signal) => `${signal.label}: ${signal.detail}`)
    .join(" ");
}

function getChapterQualityPrioritySignals(chapter: EditingChapterSnapshot) {
  return (chapter.quality?.signals ?? []).filter((signal) => signal.state !== "pass").slice(0, 3);
}

function buildChapterQualityDirective(chapter: EditingChapterSnapshot) {
  const weakSignals = getChapterQualityPrioritySignals(chapter);
  if (weakSignals.length === 0) {
    return chapter.reviewSummary ?? `${chapter.chapterLabel} needs a cleaner editorial pass without losing its current role in the manuscript.`;
  }

  return weakSignals
    .map((signal) => `${signal.label}: ${signal.detail}`)
    .join(" ");
}

function buildExcerpt(text: string, maxLength = 400) {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength).trimEnd()}...`;
}

function buildRevisionTargetOutcome(chapter: EditingChapterSnapshot, note?: EditorialAssessmentChapterNote) {
  const quality = chapter.quality;
  if (note?.observation) {
    return note.observation;
  }
  if (quality?.needsRevision) {
    return `Raise ${chapter.chapterLabel} above its current ${quality.score}/100 quality signal and resolve the main weak spots from the last draft pass, especially ${buildExcerpt(buildChapterQualityDirective(chapter), 200)}.`;
  }
  if (chapter.reviewSummary) {
    return chapter.reviewSummary;
  }

  return `Deliver a cleaner, more coherent revision of ${chapter.chapterLabel} that resolves its highest-leverage issue without drifting from the book's intent.`;
}

function buildRevisionPreserveNotes(chapter: EditingChapterSnapshot) {
  const notes = new Set<string>();

  notes.add(`Preserve the role ${chapter.chapterLabel} plays inside the full manuscript arc.`);

  if (chapter.sectionTitle) {
    notes.add(`Keep this chapter aligned with the surrounding ${chapter.sectionTitle} section logic.`);
  }

  if (chapter.reviewSummary) {
    notes.add(`Do not lose the existing chapter throughline: ${buildExcerpt(chapter.reviewSummary, 180)}.`);
  }

  for (const signal of chapter.quality?.signals ?? []) {
    if (signal.state === "pass") {
      notes.add(`Keep this strength intact: ${signal.label}.`);
    }
    if (signal.state === "warn") {
      notes.add(`Tighten this without distorting the chapter's role: ${signal.label}.`);
    }
  }

  const weakSignals = getChapterQualityPrioritySignals(chapter);
  if (weakSignals.length > 0) {
    notes.add(`When revising, specifically protect the chapter's current wins while addressing ${weakSignals.map((signal) => signal.label).join(", ")}.`);
  }

  return Array.from(notes).slice(0, 4);
}

function buildGlobalRevisionObjectives(params: {
  chapters: EditingChapterSnapshot[];
  assessment: EditorialAssessment | null;
  focusChapterKey?: string | null;
}) {
  const { chapters, assessment, focusChapterKey } = params;
  const selected = focusChapterKey
    ? chapters.filter((chapter) => chapter.chapterKey === focusChapterKey)
    : chapters;
  const objectives = new Set<string>();

  if (focusChapterKey) {
    objectives.add("Resolve the selected chapter's highest-risk issue without breaking the manuscript's larger arc.");
  } else {
    objectives.add("Improve the highest-leverage chapters first, then preserve book-level coherence across the untouched material.");
    objectives.add("Keep the manuscript voice, pacing, and structural throughline aligned across revision passes.");
  }

  if (assessment?.assessmentSummary) {
    objectives.add(buildExcerpt(assessment.assessmentSummary, 180));
  }

  for (const action of assessment?.nextActions ?? []) {
    objectives.add(buildExcerpt(action, 180));
    if (objectives.size >= 4) {
      break;
    }
  }

  const weakestChapters = [...selected]
    .filter((chapter) => chapter.quality?.needsRevision)
    .sort((a, b) => (a.quality?.score ?? 100) - (b.quality?.score ?? 100))
    .slice(0, 2);
  for (const chapter of weakestChapters) {
    objectives.add(`Lift ${chapter.chapterLabel} above its current ${chapter.quality?.score ?? "unscored"}/100 draft signal while preserving what already works.`);
    objectives.add(`Resolve the pressure inside ${chapter.chapterLabel}: ${buildExcerpt(buildChapterQualityDirective(chapter), 200)}`);
  }

  return Array.from(objectives).slice(0, 5);
}

function buildCoherenceRiskWatchlist(params: {
  chapters: EditingChapterSnapshot[];
  assessment: EditorialAssessment | null;
  focusChapterKey?: string | null;
}) {
  const { chapters, assessment, focusChapterKey } = params;
  const selected = focusChapterKey
    ? chapters.filter((chapter) => chapter.chapterKey === focusChapterKey)
    : chapters;
  const risks = new Set<string>();

  for (const risk of assessment?.risks ?? []) {
    risks.add(buildExcerpt(risk, 180));
    if (risks.size >= 3) {
      break;
    }
  }

  for (const chapter of selected) {
    if (chapter.quality?.needsRevision) {
      risks.add(
        `${chapter.chapterLabel} still carries a ${chapter.quality.readiness} draft signal at ${chapter.quality.score}/100. ${buildExcerpt(buildChapterQualityDirective(chapter), 200)}`,
      );
    }
    if (!chapter.reviewSummary) {
      risks.add(`${chapter.chapterLabel} still lacks a chapter-level editorial review note.`);
    }
    if (risks.size >= 5) {
      break;
    }
  }

  if (!focusChapterKey) {
    const untouchedCount = chapters.length - selected.length;
    if (untouchedCount > 0) {
      risks.add(`Revisions must avoid continuity drift across ${untouchedCount} untouched chapter${untouchedCount === 1 ? "" : "s"}.`);
    }
  }

  return Array.from(risks).slice(0, 5);
}

function buildSuggestedRevisionTarget(params: {
  mode: EditorialMode;
  chapterKey?: string | null;
  selectedChapterKeys?: string[];
  brief: string;
  preserveNotes?: string[] | null;
}): SuggestedEditorialRevisionTarget {
  return {
    mode: params.mode,
    chapterKey: params.chapterKey ?? null,
    selectedChapterKeys: (params.selectedChapterKeys ?? []).filter(Boolean).slice(0, 6),
    brief: params.brief.trim(),
    preserveNotes: (params.preserveNotes ?? [])
      .map((note) => note.trim())
      .filter(Boolean)
      .slice(0, 5),
  };
}

function inferEditorialModeFromInput(input: string): EditorialMode {
  const normalized = input.toLowerCase();
  if (normalized.includes("continuity")) {
    return "continuity-pass";
  }
  if (normalized.includes("pacing")) {
    return "pacing-pass";
  }
  if (normalized.includes("voice")) {
    return "voice-consistency-pass";
  }
  if (normalized.includes("line edit") || normalized.includes("line-edit") || normalized.includes("copy edit")) {
    return "line-edit";
  }
  if (normalized.includes("structure") || normalized.includes("structural")) {
    return "structural-edit";
  }

  return "clarity-pass";
}

function buildConversationSuggestedRevisionTarget(params: {
  manuscript: ManuscriptAssembly;
  chapterKey?: string | null;
  userInput: string;
}) {
  const { manuscript, chapterKey, userInput } = params;
  const mode = inferEditorialModeFromInput(userInput);

  if (chapterKey && manuscript.chapters.some((chapter) => chapter.chapterKey === chapterKey)) {
    return buildSuggestedRevisionTarget({
      mode,
      chapterKey,
      brief: `Revise ${chapterKey} based on the latest editor conversation without breaking its role in the full manuscript.`,
      preserveNotes: [
        "Preserve the current chapter's role inside the full book arc.",
        "Avoid introducing continuity drift against untouched chapters.",
      ],
    });
  }

  const normalized = userInput.toLowerCase();
  const prefersMultiSectionTarget =
    normalized.includes("whole-book") ||
    normalized.includes("whole book") ||
    normalized.includes("opening") ||
    normalized.includes("first chapters") ||
    normalized.includes("first two") ||
    normalized.includes("beginning") ||
    normalized.includes("multi-chapter") ||
    normalized.includes("multi chapter") ||
    normalized.includes("connected sections") ||
    normalized.includes("across chapters") ||
    normalized.includes("shared momentum") ||
    normalized.includes("continuity");

  const sortedByRisk = [...manuscript.chapters].sort((left, right) => {
    const leftScore = left.quality?.score ?? (left.reviewSummary ? 70 : 55);
    const rightScore = right.quality?.score ?? (right.reviewSummary ? 70 : 55);
    return leftScore - rightScore;
  });

  const selectedChapters = prefersMultiSectionTarget
    ? sortedByRisk.slice(0, Math.min(2, sortedByRisk.length))
    : sortedByRisk.slice(0, 1);
  const selectedChapterKeys = selectedChapters.map((chapter) => chapter.chapterKey);
  const hotspotSummary = selectedChapters
    .map((chapter) => `${chapter.chapterLabel}: ${buildExcerpt(buildChapterQualityDirective(chapter), 140)}`)
    .join(" ");

  return buildSuggestedRevisionTarget({
    mode,
    chapterKey: selectedChapterKeys.length === 1 ? selectedChapterKeys[0] : null,
    selectedChapterKeys,
    brief:
      selectedChapters.length > 1
        ? `Run a ${modeLabel(mode)} across the linked sections that carry the heaviest coherence pressure from the current manuscript state. Focus especially on ${hotspotSummary}`
        : `Run a ${modeLabel(mode)} on the highest-leverage chapter without losing its role in the book. Focus especially on ${hotspotSummary}`,
    preserveNotes: [
      "Preserve the manuscript's existing whole-book throughline while revising the selected material.",
      "Do not introduce continuity drift against untouched chapters.",
      ...selectedChapters.flatMap((chapter) => buildRevisionPreserveNotes(chapter).slice(0, 2)),
    ],
  });
}

function resolveRevisionTargetChapters(params: {
  manuscript: ManuscriptAssembly;
  chapterKey?: string | null;
  selectedChapterKeys?: string[];
}) {
  const selectedChapterKeys = [...new Set((params.selectedChapterKeys ?? []).filter(Boolean))];
  if (selectedChapterKeys.length > 0) {
    const targetSet = new Set(selectedChapterKeys);
    const chapters = params.manuscript.chapters.filter((chapter) => targetSet.has(chapter.chapterKey));
    return {
      focusChapters: chapters,
      selectedChapterKeys,
      targetDescriptor:
        chapters.length === 1
          ? `${chapters[0]?.chapterLabel ?? "selected chapter"}`
          : `${chapters.length} selected sections`,
    };
  }

  if (params.chapterKey) {
    const chapters = params.manuscript.chapters.filter(
      (chapter) => chapter.chapterKey === params.chapterKey,
    );
    return {
      focusChapters: chapters,
      selectedChapterKeys: chapters.map((chapter) => chapter.chapterKey),
      targetDescriptor: chapters[0]?.chapterLabel ?? "selected chapter",
    };
  }

  const chapters = params.manuscript.chapters.slice(0, Math.min(3, params.manuscript.chapters.length));
  return {
    focusChapters: chapters,
    selectedChapterKeys: chapters.map((chapter) => chapter.chapterKey),
    targetDescriptor:
      chapters.length === 1 ? chapters[0]?.chapterLabel ?? "highest-leverage chapter" : "highest-leverage chapters",
  };
}

function buildEditorialPromptChapterContext(chapter: EditingChapterSnapshot) {
  return {
    chapterKey: chapter.chapterKey,
    chapterLabel: chapter.chapterLabel,
    sectionTitle: chapter.sectionTitle,
    reviewSummary: chapter.reviewSummary,
    wordCount: chapter.wordCount,
    quality: chapter.quality,
    qualityDirective: buildChapterQualityDirective(chapter),
    strengthsToPreserve: (chapter.quality?.signals ?? [])
      .filter((signal) => signal.state === "pass")
      .slice(0, 3)
      .map((signal) => `${signal.label}: ${signal.detail}`),
    weakSignals: getChapterQualityPrioritySignals(chapter).map((signal) => ({
      label: signal.label,
      detail: signal.detail,
    })),
  };
}

function buildDeterministicRevisionPlan(params: {
  chapters: EditingChapterSnapshot[];
  assessment: EditorialAssessment | null;
  focusChapterKey?: string | null;
}): EditorialRevisionPlan {
  const { chapters, assessment, focusChapterKey } = params;
  const selected = focusChapterKey
    ? chapters.filter((chapter) => chapter.chapterKey === focusChapterKey)
    : chapters;
  const noteMap = new Map(
    (assessment?.chapterNotes ?? []).map((note) => [note.chapterKey, note]),
  );

  const chapterQueue = selected
    .map((chapter) => {
      const note = noteMap.get(chapter.chapterKey);
      return {
        chapterKey: chapter.chapterKey,
        chapterLabel: chapter.chapterLabel,
        priority: note?.priority ?? (!chapter.reviewSummary ? "high" : "medium"),
        reason:
          note?.observation ??
          chapter.reviewSummary ??
          "This chapter needs a fresh editorial pass based on the current manuscript state.",
        targetOutcome: buildRevisionTargetOutcome(chapter, note),
        preserveNotes: buildRevisionPreserveNotes(chapter),
        recommendedMode: assessment?.mode ?? "clarity-pass",
      };
    })
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      return rank[a.priority] - rank[b.priority];
    });

  return {
    generatedAt: new Date().toISOString(),
    focus: focusChapterKey ? "chapter-specific" : "whole-book",
    chapterKey: focusChapterKey ?? null,
    summary: focusChapterKey
      ? "Start with the selected chapter, resolve its highest-risk issue, then reassemble the manuscript to see the full-book effect."
      : "Tackle the highest-priority chapters first, then reassemble and run a lighter continuity or voice pass over the full manuscript.",
    globalObjectives: buildGlobalRevisionObjectives({
      chapters,
      assessment,
      focusChapterKey,
    }),
    coherenceRisks: buildCoherenceRiskWatchlist({
      chapters,
      assessment,
      focusChapterKey,
    }),
    passes: [
      "Run the highest-leverage revision first.",
      "Reassemble the manuscript after accepted changes.",
      "Follow with a lighter continuity or voice consistency pass.",
    ],
    chapterQueue,
  };
}

function buildPublishingPackage(params: {
  assembly: ManuscriptAssembly;
  workflowType: BookWorkflowType;
  bookSetup: z.infer<typeof BookSetupProfileSchema> | null;
  draftQualityRollup?: DraftQualityRollup | null;
  editorialRecommendation?: EditorialReadinessGate["recommendation"] | null;
}): PublishingPackage {
  const {
    assembly,
    workflowType,
    bookSetup,
    draftQualityRollup = null,
    editorialRecommendation = null,
  } = params;
  const trimSize = bookSetup?.trimSize ?? "6 x 9 in";
  const outputFormats = bookSetup?.outputFormats ?? ["PRINT", "EBOOK"];
  const tocIncluded = workflowType !== BookWorkflowType.FICTION;
  const frontMatter =
    workflowType === BookWorkflowType.FICTION
      ? ["Title page", "Copyright page", "Dedication", "Author note (optional)"]
      : ["Title page", "Copyright page", "Table of contents", "Introduction or preface"];
  const backMatter =
    workflowType === BookWorkflowType.FICTION
      ? ["Acknowledgments", "About the author", "Reader discussion questions (optional)"]
      : ["Acknowledgments", "About the author", "Notes / references", "Call to action"];
  const averageChapterWords =
    assembly.chapterCount > 0 ? Math.round(assembly.totalWords / assembly.chapterCount) : 0;
  const shortestChapterWords = assembly.chapters.reduce(
    (smallest, chapter) => Math.min(smallest, chapter.wordCount),
    Number.POSITIVE_INFINITY,
  );
  const longestChapterWords = assembly.chapters.reduce(
    (largest, chapter) => Math.max(largest, chapter.wordCount),
    0,
  );
  const estimatedFrontMatterPages = Math.max(2, frontMatter.length + (tocIncluded ? 1 : 0));
  const estimatedBodyPages = Math.max(
    assembly.chapterCount,
    estimatePagesFromWords(assembly.totalWords, trimSize) + Math.ceil(assembly.chapterCount / 2),
  );
  const estimatedBackMatterPages = Math.max(1, backMatter.length);
  const estimatedTotalPages = estimatedFrontMatterPages + estimatedBodyPages + estimatedBackMatterPages;
  const signaturePageMultiple = 16;
  const estimatedBlankPages =
    estimatedTotalPages % signaturePageMultiple === 0
      ? 0
      : signaturePageMultiple - (estimatedTotalPages % signaturePageMultiple);
  const estimatedSignatureCount = Math.max(
    1,
    Math.ceil((estimatedTotalPages + estimatedBlankPages) / signaturePageMultiple),
  );
  const targetPageCount = bookSetup?.targetPageCount ?? null;
  const pageDelta = targetPageCount ? estimatedTotalPages - targetPageCount : null;
  const chapterLengthVariance =
    averageChapterWords > 0 ? longestChapterWords / Math.max(1, averageChapterWords) : 1;
  const trimProfile = `${trimSize} trade layout with ${averageChapterWords.toLocaleString()} average words per chapter and an estimated ${estimatedTotalPages.toLocaleString()} interior pages.`;
  const typesettingPlan: PublishingPackage["typesettingPlan"] = {
    trimProfile,
    chapterOpenerStyle:
      workflowType === BookWorkflowType.FICTION
        ? "Full-bleed chapter opener with title-only spread and scene-forward spacing."
        : "Clean chapter opener with chapter number, title, and generous top margin.",
    runningHeads:
      workflowType === BookWorkflowType.FICTION
        ? "Book title on verso, chapter title on recto."
        : "Book title on verso, section or chapter title on recto.",
    tocIncluded,
    widowOrphanControl: true,
    sectionStartsOnRecto: true,
    signaturePageMultiple,
    estimatedSignatureCount,
    estimatedBlankPages,
    estimatedFrontMatterPages,
    estimatedBodyPages,
    estimatedBackMatterPages,
    estimatedTotalPages,
    notes: [
      `Estimated interior: ${estimatedFrontMatterPages} front-matter pages, ${estimatedBodyPages} body pages, ${estimatedBackMatterPages} back-matter pages.`,
      `The current estimate fills ${estimatedSignatureCount} print signature(s) of ${signaturePageMultiple} pages with ${estimatedBlankPages} blank page(s) reserved for recto starts and production fit.`,
      "Final interior pass should confirm chapter openers, page turns, and blank-page handling.",
      "Manual QA should confirm that extracted front and back matter map cleanly into the final layout toolchain.",
    ],
  };
  const preflightChecks: PublishingPackage["preflightChecks"] = [
    {
      name: "Manuscript assembly committed",
      status: "pass",
      detail: "The manuscript exists as a full assembled artifact ready for export.",
    },
    {
      name: "Front matter mapped",
      status: frontMatter.length > 0 ? "pass" : "fail",
      detail: frontMatter.length > 0
        ? `${frontMatter.length} front matter elements are defined for layout.`
        : "No front matter elements are defined yet.",
    },
    {
      name: "Back matter mapped",
      status: backMatter.length > 0 ? "pass" : "fail",
      detail: backMatter.length > 0
        ? `${backMatter.length} back matter elements are defined for layout.`
        : "No back matter elements are defined yet.",
    },
    {
      name: "Draft quality baseline",
      status:
        !draftQualityRollup
          ? "warn"
          : draftQualityRollup.chaptersNeedingRevision === 0
            ? "pass"
            : draftQualityRollup.chaptersNeedingRevision >= 3
              ? "fail"
              : "warn",
      detail: !draftQualityRollup
        ? "No chapter-level draft quality telemetry was available when this package was prepared."
        : `Average draft quality is ${draftQualityRollup.averageScore}/100, with ${draftQualityRollup.chaptersNeedingRevision} chapter(s) still marked for revision.`,
    },
    {
      name: "Print profile",
      status: outputFormats.includes("PRINT") ? "pass" : "warn",
      detail: outputFormats.includes("PRINT")
        ? `Print output is enabled for ${trimSize}.`
        : "Print output is not requested in Book Setup.",
    },
    {
      name: "Ebook profile",
      status: outputFormats.includes("EBOOK") ? "pass" : "warn",
      detail: outputFormats.includes("EBOOK")
        ? "Ebook output is enabled and can use HTML/Markdown exports."
        : "Ebook output is not requested in Book Setup.",
    },
    {
      name: "Target page count",
      status: targetPageCount ? "pass" : "warn",
      detail: targetPageCount
        ? `Target page count is set to ${targetPageCount}.`
        : "No target page count is set; final pagination will need manual direction.",
    },
    {
      name: "Interior page estimate",
      status: assembly.totalWords > 0 ? "pass" : "fail",
      detail:
        assembly.totalWords > 0
          ? `Estimated ${estimatedTotalPages} total pages from ${assembly.totalWords.toLocaleString()} manuscript words at ${trimSize}.`
          : "The manuscript has no words yet, so the interior page estimate cannot be trusted.",
    },
    {
      name: "Page target alignment",
      status:
        targetPageCount == null
          ? "warn"
          : Math.abs(pageDelta ?? 0) <= Math.max(10, Math.round(targetPageCount * 0.1))
            ? "pass"
            : "warn",
      detail:
        targetPageCount == null
          ? "No target page count is available for page-fit comparison."
          : pageDelta === 0
            ? `Estimated interior lands exactly on the ${targetPageCount}-page target.`
            : `Estimated interior is ${Math.abs(pageDelta ?? 0)} pages ${pageDelta! > 0 ? "over" : "under"} the ${targetPageCount}-page target.`,
    },
    {
      name: "Chapter length balance",
      status:
        averageChapterWords === 0
          ? "fail"
          : chapterLengthVariance > 1.9 || shortestChapterWords < Math.round(averageChapterWords * 0.45)
            ? "warn"
            : "pass",
      detail:
        averageChapterWords === 0
          ? "No drafted chapters are available for balance analysis."
          : `Average chapter length is ${averageChapterWords.toLocaleString()} words; shortest is ${shortestChapterWords.toLocaleString()} and longest is ${longestChapterWords.toLocaleString()}.`,
    },
    {
      name: "Running head guidance",
      status: typesettingPlan.runningHeads.trim().length > 0 ? "pass" : "warn",
      detail:
        typesettingPlan.runningHeads.trim().length > 0
          ? `Running head plan is defined: ${typesettingPlan.runningHeads}`
          : "Running head guidance is still missing from the typesetting plan.",
    },
    {
      name: "Signature fit",
      status: estimatedBlankPages <= Math.max(2, Math.round(signaturePageMultiple * 0.15)) ? "pass" : "warn",
      detail:
        estimatedBlankPages === 0
          ? `Estimated interior fits exactly into ${estimatedSignatureCount} ${signaturePageMultiple}-page signature(s).`
          : `Estimated interior leaves ${estimatedBlankPages} blank page(s) inside ${estimatedSignatureCount} ${signaturePageMultiple}-page signature(s).`,
    },
  ];
  const packageStatus =
    editorialRecommendation === "blocked"
      ? "prepared_needs_editorial_revision"
      : preflightChecks.some((check) => check.status === "fail")
        ? "draft"
        : "ready_to_publish";

  return {
    title: assembly.title,
    subtitle: assembly.subtitle ?? null,
    preparedAt: new Date().toISOString(),
    totalWords: assembly.totalWords,
    chapterCount: assembly.chapterCount,
    trimSize,
    targetPageCount: bookSetup?.targetPageCount ?? null,
    outputFormats,
    exportFormats: ["docx", "html", "markdown", "json"],
    frontMatter,
    backMatter,
    packageComponents: [
      "Manuscript assembly",
      "Publishing notes",
      "Format export set",
      "Front matter plan",
      "Back matter plan",
      "Typesetting plan",
      "Preflight report",
    ],
    exportProfiles: [
      {
        format: "PRINT",
        status: outputFormats.includes("PRINT") ? "ready" : "not_requested",
        notes: [
          `Interior prepared for ${trimSize} trim assumptions.`,
          "Final print layout should confirm page breaks, running heads, and chapter opener spacing.",
        ],
      },
      {
        format: "EBOOK",
        status: outputFormats.includes("EBOOK") ? "ready" : "not_requested",
        notes: [
          "HTML and Markdown exports can feed ebook conversion.",
          "Final ebook QA should verify linked TOC, device spacing, and heading hierarchy.",
        ],
      },
      {
        format: "AUDIO",
        status: outputFormats.includes("AUDIO") ? "ready" : "not_requested",
        notes: [
          "Narration prep should remove purely visual cues and confirm pronunciation notes.",
        ],
      },
    ],
    draftQualitySummary: draftQualityRollup
      ? {
          averageScore: draftQualityRollup.averageScore,
          chaptersNeedingRevision: draftQualityRollup.chaptersNeedingRevision,
          strongChapters: draftQualityRollup.strongChapters,
          watchChapters: draftQualityRollup.watchChapters,
          attentionChapters: draftQualityRollup.attentionChapters,
          totalRevisionPasses: draftQualityRollup.totalRevisionPasses,
          weakestChapterLabel: draftQualityRollup.weakestChapterLabel,
          headline: draftQualityRollup.headline,
          blockers: draftQualityRollup.blockers,
        }
      : null,
    typesettingPlan,
    preflightChecks,
    notes: [
      "The manuscript is assembled and export-ready from the Editing stage.",
      "A true final typesetting pass may still adjust pagination and front/back matter.",
      ...(draftQualityRollup
        ? [`Draft quality headline: ${draftQualityRollup.headline}`]
        : []),
    ],
    packageStatus,
  };
}

function buildProvenanceReport(params: {
  workflowType: BookWorkflowType;
  bookTitle: string;
  publishingPackage: PublishingPackage;
  editorialPreferences: EditorialPreferenceProfile;
  revisionPlanExecution: EditorialRevisionPlanExecution | null;
}) {
  const {
    workflowType,
    bookTitle,
    publishingPackage,
    editorialPreferences,
    revisionPlanExecution,
  } = params;

  const artifactTrail: ProvenanceReport["artifactTrail"] =
    workflowType === BookWorkflowType.FICTION
      ? [
          { stage: "Story Setup", status: "committed", source: "Fiction planning workflow" },
          { stage: "Story Core", status: "committed", source: "Fiction story-engine workflow" },
          { stage: "World & Cast", status: "committed", source: "Story memory / cast bible" },
          { stage: "Plot Blueprint", status: "committed", source: "Chapter-based story structure" },
          { stage: "Scene Plan", status: "committed", source: "Scene sequencing and continuity planning" },
          { stage: "Draft", status: "committed", source: "Generated chapter prose from scene plan" },
          { stage: "Editing", status: "committed", source: "Editorial loop and publishing package" },
        ]
      : [
          { stage: "Promise", status: "committed", source: "Strategic book foundation and positioning" },
          { stage: "Outline", status: "committed", source: "Section, chapter, and paragraph structure" },
          { stage: "Base Story", status: "committed", source: "Book-wide narrative spine" },
          { stage: "Research", status: "committed", source: "Verified research dossiers" },
          { stage: "External Stories", status: "committed", source: "Case studies and external examples" },
          { stage: "Personal Stories", status: "committed", source: "Author-sourced lived experience" },
          { stage: "Chapter Draft", status: "committed", source: "Chapter synthesis from all prior artifacts" },
          { stage: "Editing", status: "committed", source: "Editorial loop and publishing package" },
        ];

  const editorialActions: ProvenanceReport["editorialActions"] = [
    {
      kind: "editor-memory",
      detail: `Accepted revisions: ${editorialPreferences.acceptedRevisionCount}; rejected revisions: ${editorialPreferences.rejectedRevisionCount}.`,
    },
    {
      kind: "style-preferences",
      detail: editorialPreferences.styleNotes || "No custom style notes saved.",
    },
  ];

  if (revisionPlanExecution) {
    editorialActions.push({
      kind: "autonomous-revision-plan",
      detail: `Executed ${revisionPlanExecution.generatedCount} planned revision item(s); auto-applied ${revisionPlanExecution.autoAppliedCount}.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    workflowType,
    title: bookTitle,
    artifactTrail,
    editorialActions,
    packageReadiness: {
      packageStatus: publishingPackage.packageStatus,
      totalWords: publishingPackage.totalWords,
      chapterCount: publishingPackage.chapterCount,
    },
    notes: [
      "This provenance report summarizes the artifact chain that produced the final manuscript package.",
      "Use it as a handoff note for internal review, publisher conversations, or AI-authorship traceability.",
    ],
  } satisfies ProvenanceReport;
}

function buildMarketingHandoffPackage(params: {
  workflowType: BookWorkflowType;
  assembly: ManuscriptAssembly;
  publishingPackage: PublishingPackage;
}) {
  const { workflowType, assembly, publishingPackage } = params;

  const synopsis =
    workflowType === BookWorkflowType.FICTION
      ? `A ${assembly.chapterCount}-chapter narrative about what it costs to tell the truth when comfort, loyalty, and inherited systems all push in the opposite direction.`
      : `A ${assembly.chapterCount}-chapter leadership manuscript that helps readers move from reactive compensation toward structural influence grounded in trust, alignment, and accountability.`;

  return {
    generatedAt: new Date().toISOString(),
    title: assembly.title,
    subtitle: assembly.subtitle ?? null,
    audience:
      workflowType === BookWorkflowType.FICTION
        ? ["Readers of character-driven suspense", "Book clubs", "Readers who enjoy family-system intrigue"]
        : ["Leaders in growth-stage companies", "Operators scaling teams", "Readers of practical leadership frameworks"],
    positioning:
      workflowType === BookWorkflowType.FICTION
        ? ["Planning-first fiction workflow output", "Scene-driven suspense with emotional systems pressure"]
        : ["Systems-first leadership book", "Practical trust and alignment operating model"],
    hooks:
      workflowType === BookWorkflowType.FICTION
        ? [
            "A family inheritance becomes the doorway into a conspiracy.",
            "Every chapter tightens the cost of truth versus comfort.",
          ]
        : [
            "Most leadership exhaustion is a system smell, not a personal failure.",
            "Influence is something leaders build, not perform.",
          ],
    synopsis,
    exportReadiness: [
      `Package status: ${publishingPackage.packageStatus}`,
      `Available formats: ${publishingPackage.exportFormats.join(", ")}`,
      `Trim size: ${publishingPackage.trimSize}`,
    ],
  } satisfies MarketingHandoffPackage;
}

async function syncPublishDerivedArtifacts(params: {
  bookId: string;
  workflowType: BookWorkflowType;
  assembly: ManuscriptAssembly;
  publishingPackage: PublishingPackage;
  editorialPreferences: EditorialPreferenceProfile;
  revisionPlanExecution: EditorialRevisionPlanExecution | null;
  refreshDerivedOnly?: boolean;
}) {
  const {
    bookId,
    workflowType,
    assembly,
    publishingPackage,
    editorialPreferences,
    revisionPlanExecution,
    refreshDerivedOnly = false,
  } = params;

  const provenanceReport = buildProvenanceReport({
    workflowType,
    bookTitle: assembly.title,
    publishingPackage,
    editorialPreferences,
    revisionPlanExecution,
  });
  await createEditingArtifactVersion({
    bookId,
    artifactType: ArtifactType.PROVENANCE_REPORT,
    title: "Provenance Report",
    summary: refreshDerivedOnly
      ? "Provenance report refreshed from the latest publishing package."
      : "Traceability report for the final manuscript and publishing package.",
    contentJson: provenanceReport,
    contentText: JSON.stringify(provenanceReport, null, 2),
    promptTemplateVersion: "editing-provenance-v1",
    modelName: "deterministic-packager",
    preserveStageCommit: true,
  });
  await commitEditingArtifact(bookId, ArtifactType.PROVENANCE_REPORT);

  const marketingHandoff = buildMarketingHandoffPackage({
    workflowType,
    assembly,
    publishingPackage,
  });
  await createEditingArtifactVersion({
    bookId,
    artifactType: ArtifactType.MARKETING_HANDOFF_PACKAGE,
    title: "Marketing Handoff Package",
    summary: refreshDerivedOnly
      ? "Marketing handoff refreshed from the latest publishing package."
      : "Reader-facing synopsis, hooks, and positioning notes for downstream packaging.",
    contentJson: marketingHandoff,
    contentText: JSON.stringify(marketingHandoff, null, 2),
    promptTemplateVersion: "editing-marketing-handoff-v1",
    modelName: "deterministic-packager",
    preserveStageCommit: true,
  });
  await commitEditingArtifact(bookId, ArtifactType.MARKETING_HANDOFF_PACKAGE);
}

function computeEditorialReadinessGate(params: {
  manuscript: ManuscriptAssembly | null;
  draftQualityRollup: DraftQualityRollup | null;
  latestAssessment: EditorialAssessment | null;
  revisionPlan: EditorialRevisionPlan | null;
  revisionPlanExecution: EditorialRevisionPlanExecution | null;
  appliedRevisionIds: string[];
  rejectedRevisionIds: string[];
  bookTargetWordCount?: number | null;
  bookTargetTolerance?: number | null;
}): EditorialReadinessGate {
  const {
    manuscript,
    draftQualityRollup,
    latestAssessment,
    revisionPlan,
    revisionPlanExecution,
    appliedRevisionIds,
    rejectedRevisionIds,
    bookTargetWordCount,
    bookTargetTolerance,
  } = params;

  if (!manuscript) {
    return {
      evaluatedAt: new Date().toISOString(),
      score: 0,
      recommendation: "blocked",
      strengths: [],
      risks: ["The full manuscript has not been assembled yet."],
      nextActions: ["Assemble the manuscript before asking the editor agent to commit the stage."],
    };
  }

  let score = 52;
  const strengths: string[] = [];
  const risks: string[] = [];
  const nextActions: string[] = [];

  if (manuscript.chapterCount > 0) {
    strengths.push(`The manuscript is assembled across ${manuscript.chapterCount} drafted chapters.`);
    score += 10;
  }

  if (manuscript.totalWords > 0) {
    strengths.push(`The current assembly contains ${manuscript.totalWords.toLocaleString()} words of prose.`);
    score += 8;
  }

  if (bookTargetWordCount && bookTargetWordCount > 0) {
    const tolerance = Math.max(500, bookTargetTolerance ?? 0);
    const minimumTarget = Math.max(0, bookTargetWordCount - tolerance);
    const maximumTarget = bookTargetWordCount + tolerance;
    if (manuscript.totalWords < minimumTarget || manuscript.totalWords > maximumTarget) {
      const delta = manuscript.totalWords - bookTargetWordCount;
      risks.push(
        `The assembled manuscript is ${Math.abs(delta).toLocaleString()} words ${delta > 0 ? "over" : "under"} the requested ${bookTargetWordCount.toLocaleString()}-word target.`,
      );
      nextActions.push("Run another draft-length pass before treating Editing as final.");
      score -= Math.abs(delta) > Math.max(4000, Math.round(bookTargetWordCount * 0.2)) ? 22 : 12;
    } else {
      strengths.push(
        `The assembled manuscript is inside the requested ${minimumTarget.toLocaleString()}-${maximumTarget.toLocaleString()} word range.`,
      );
      score += 6;
    }
  }

  if (draftQualityRollup) {
    strengths.push(`Draft quality signals average ${draftQualityRollup.averageScore}/100 across the manuscript.`);
    score += Math.round((draftQualityRollup.averageScore - 50) / 4);

    if (draftQualityRollup.chaptersNeedingRevision > 0) {
      risks.push(
        `${draftQualityRollup.chaptersNeedingRevision} chapter${draftQualityRollup.chaptersNeedingRevision === 1 ? "" : "s"} still carry draft-level revision flags.`,
      );
      nextActions.push("Use the draft quality blockers to target the weakest chapters before final commit.");
      score -= draftQualityRollup.chaptersNeedingRevision >= 3 ? 14 : 8;
    } else {
      strengths.push("No chapter is currently flagged as needing another draft pass.");
      score += 5;
    }

    if (draftQualityRollup.weakestChapterLabel) {
      strengths.push(`Weakest visible chapter signal: ${draftQualityRollup.weakestChapterLabel}.`);
    }
  }

  if ((latestAssessment?.strengths.length ?? 0) > 0) {
    strengths.push("A structured editorial assessment already exists for the current manuscript.");
    score += 6;
  } else {
    risks.push("No editorial assessment has been generated for the current manuscript assembly yet.");
    nextActions.push("Run an editorial assessment before committing the Editing stage.");
    score -= 16;
  }

  const outstandingConcerns = manuscript.outstandingConcerns.length;
  if (outstandingConcerns === 0) {
    strengths.push("No outstanding concerns are currently attached to the assembly.");
    score += 6;
  } else if (outstandingConcerns <= 2) {
    risks.push(`${outstandingConcerns} editorial concern(s) are still attached to the current assembly.`);
    nextActions.push("Resolve the remaining editorial concerns or accept them explicitly before commit.");
    score -= 6;
  } else {
    risks.push(`${outstandingConcerns} editorial concerns are still attached to the current assembly.`);
    nextActions.push("Run another revision pass before committing the Editing stage.");
    score -= 14;
  }

  const assessmentRiskCount = latestAssessment?.risks.length ?? 0;
  if (assessmentRiskCount >= 4) {
    risks.push(`The latest assessment still lists ${assessmentRiskCount} material editorial risks.`);
    nextActions.push("Use the revision plan to reduce the highest-risk chapters before commit.");
    score -= 18;
  } else if (assessmentRiskCount > 0) {
    risks.push(`The latest assessment still lists ${assessmentRiskCount} editorial risk(s).`);
    score -= 8;
  } else if (latestAssessment) {
    strengths.push("The latest assessment does not list explicit editorial risks.");
    score += 5;
  }

  if (revisionPlan && revisionPlan.chapterQueue.length > 0) {
    strengths.push(`A revision plan exists with ${revisionPlan.chapterQueue.length} queued item(s).`);
    score += 4;
  }

  if (revisionPlanExecution) {
    strengths.push(
      `The editorial loop has already executed ${revisionPlanExecution.generatedCount} planned revision item(s).`,
    );
    score += 8;
    if (revisionPlanExecution.autoAppliedCount > 0) {
      strengths.push(
        `${revisionPlanExecution.autoAppliedCount} revision(s) have already been auto-applied back into the manuscript.`,
      );
      score += 4;
    }
  }

  if (appliedRevisionIds.length > 0) {
    strengths.push(`${appliedRevisionIds.length} accepted revision(s) are reflected in manuscript history.`);
    score += 5;
  }

  if (rejectedRevisionIds.length >= 3 && appliedRevisionIds.length === 0) {
    risks.push("Several revisions have been rejected without any accepted alternatives yet.");
    nextActions.push("Generate a narrower revision mode or save editor preferences before the next pass.");
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  const recommendation =
    !latestAssessment ||
    assessmentRiskCount >= 5 ||
    outstandingConcerns >= 4 ||
    (draftQualityRollup?.chaptersNeedingRevision ?? 0) >= 4 ||
    (bookTargetWordCount != null &&
      bookTargetWordCount > 0 &&
      manuscript.totalWords <
        Math.max(0, bookTargetWordCount - Math.max(500, bookTargetTolerance ?? 0)))
      ? "blocked"
      : score >= 78
        ? "ready_for_commit"
        : "needs_revision";

  if (recommendation === "ready_for_commit") {
    nextActions.push("The editorial state is strong enough to commit Editing and refresh the publishing package.");
  } else if (recommendation === "needs_revision") {
    nextActions.push("Run one more targeted revision pass before committing.");
  }

  return {
    evaluatedAt: new Date().toISOString(),
    score,
    recommendation,
    strengths: strengths.slice(0, 5),
    risks: risks.slice(0, 5),
    nextActions: [...new Set(nextActions)].slice(0, 5),
  };
}

export async function assembleManuscriptWorkflow(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { chapters } = await loadEditingChapters(book);
  const draftedChapters = chapters.filter((chapter) => chapter.chapterText.trim().length > 0);

  if (draftedChapters.length === 0) {
    throw new Error("No chapter drafts exist yet. Finish drafting chapters before assembling the manuscript.");
  }

  if (draftedChapters.length !== chapters.length) {
    throw new Error("Every chapter must have a draft before the full manuscript can be assembled.");
  }

  const assembly: ManuscriptAssembly = {
    title: book.titleWorking ?? "Untitled Book",
    subtitle: book.subtitle ?? null,
    assembledAt: new Date().toISOString(),
    sourceDraftSignature: buildSourceDraftSignature(chapters),
    chapterCount: chapters.length,
    totalWords: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    editorialOverview: buildEditorialOverview(chapters),
    outstandingConcerns: buildOutstandingConcerns(chapters),
    chapters,
    fullText: buildFullText(chapters),
    chapterKeys: chapters.map((chapter) => chapter.chapterKey),
  };

  await createEditingArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.MANUSCRIPT_ASSEMBLY,
    title: "Full Manuscript Assembly",
    summary: `${assembly.chapterCount} chapters assembled into a full manuscript.`,
    contentJson: assembly,
    contentText: assembly.fullText,
    promptTemplateVersion: "editing-assembly-v1",
    modelName: "deterministic-assembler",
  });

  return assembly;
}

export async function generateEditorialAssessmentWorkflow(
  bookSlug: string,
  mode: EditorialMode,
  chapterKey?: string | null,
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const manuscriptVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MANUSCRIPT_ASSEMBLY,
  );
  const manuscript = parseJsonWithSchema(manuscriptVersion?.contentJson, ManuscriptAssemblySchema);
  if (!manuscript) {
    throw new Error("Assemble the manuscript before generating an editorial assessment.");
  }

  const focusChapters = chapterKey
    ? manuscript.chapters.filter((chapter) => chapter.chapterKey === chapterKey)
    : manuscript.chapters;
  if (focusChapters.length === 0) {
    throw new Error("The selected chapter could not be found in the assembled manuscript.");
  }
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const stageMetadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const preferences = getEditorialPreferenceProfile(stageMetadata);
  const draftQualityRollup = buildDraftQualityRollup(manuscript.chapters);

  // Skip the ~73K-token full-manuscript assess call entirely when nothing
  // has changed since the last assessment for this same mode/chapter scope
  // — previously every call re-sent and re-assessed the whole manuscript
  // unconditionally, even back-to-back with no intervening edits.
  const currentDraftSignature = buildSourceDraftSignature(focusChapters);
  const priorAssessmentVersions = await getEditingArtifactVersions(
    book.id,
    ArtifactType.EDITORIAL_ASSESSMENT,
    1,
  );
  const priorAssessment = parseJsonWithSchema(
    priorAssessmentVersions[0]?.contentJson,
    EditorialAssessmentSchema,
  );
  if (
    priorAssessment &&
    priorAssessment.sourceDraftSignature &&
    priorAssessment.sourceDraftSignature === currentDraftSignature &&
    priorAssessment.mode === mode &&
    (priorAssessment.chapterKey ?? null) === (chapterKey ?? null)
  ) {
    return priorAssessment;
  }

  let assessment: EditorialAssessment = {
    assessedAt: new Date().toISOString(),
    mode,
    chapterKey: chapterKey ?? null,
    assessmentSummary: `A ${modeLabel(mode)} is ready for ${chapterKey ? "the selected chapter" : "the full manuscript"}.`,
    strengths: [
      "The manuscript has enough assembled prose to support a real editorial assessment.",
    ],
    risks: focusChapters
      .filter((chapter) => !chapter.reviewSummary)
      .slice(0, 4)
      .map((chapter) => `${chapter.chapterLabel} still lacks a chapter-level editorial review note.`),
    chapterNotes: focusChapters.slice(0, 4).map((chapter) => ({
      chapterKey: chapter.chapterKey,
      chapterLabel: chapter.chapterLabel,
      observation: chapter.reviewSummary ?? "This chapter needs a fresh editorial read in the requested mode.",
      priority: chapter.reviewSummary ? "medium" : "high",
    })),
    nextActions: [
      `Generate a ${modeLabel(mode)} revision${chapterKey ? " for this chapter" : ""}.`,
      "Apply the accepted revision back into the manuscript assembly before committing Editing.",
    ],
    sourceDraftSignature: currentDraftSignature,
  };

  const model = await getEditorAssessModel();
  if (model) {
    try {
      const structured = model.withStructuredOutput(EditorialAssessmentReplySchema);
      const result = await structured.invoke([
        new SystemMessage(`
You are the editor agent for a ghostwriting platform.

Produce a concise but serious editorial assessment in the requested mode.
- Evaluate the manuscript as a coherent book.
- If chapterKey is provided, focus on that chapter while still respecting book-level context.
- Prioritize actionable assessment over praise.
- Use the recorded draft-quality weak signals as real evidence, not as optional metadata.
- Return only the requested structured fields.
        `),
        new HumanMessage(
          JSON.stringify({
            workflowType: book.workflowType,
            bookTitle: manuscript.title,
            mode,
            chapterKey: chapterKey ?? null,
            preferences,
            editorialOverview: manuscript.editorialOverview,
            outstandingConcerns: manuscript.outstandingConcerns,
            draftQualityRollup,
            chapters: focusChapters.map((chapter) => ({
              ...buildEditorialPromptChapterContext(chapter),
              chapterText: chapter.chapterText.slice(0, 8000),
            })),
          }),
        ),
      ]);

      assessment = {
        assessedAt: new Date().toISOString(),
        mode,
        chapterKey: chapterKey ?? null,
        assessmentSummary: result.assessmentSummary,
        strengths: result.strengths ?? [],
        risks: result.risks ?? [],
        chapterNotes: result.chapterNotes ?? [],
        nextActions: result.nextActions ?? [],
        sourceDraftSignature: currentDraftSignature,
      };
    } catch (err) {
      console.error(`[editing] generateEditorialAssessmentWorkflow failed for ${bookSlug}, using deterministic fallback assessment:`, err);
      // Keep deterministic fallback assessment.
    }
  }

  await createEditingArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.EDITORIAL_ASSESSMENT,
    title: "Editorial Assessment",
    summary: `${chapterKey ? "Chapter-focused" : "Whole-book"} ${modeLabel(mode)} generated.`,
    contentJson: assessment,
    contentText: JSON.stringify(assessment, null, 2),
    promptTemplateVersion: "editing-assessment-v1",
    modelName: model ? "final-editor:assess" : "deterministic-fallback",
  });

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...stageMetadata,
      wholeBookAssessment: assessment.assessmentSummary,
      suggestedNextActions: assessment.nextActions,
      focusChapterKey: chapterKey ?? null,
      updatedAt: new Date().toISOString(),
    },
  });

  return assessment;
}

export async function generateManuscriptRevisionWorkflow(
  bookSlug: string,
  mode: EditorialMode,
  chapterKey?: string | null,
  revisionIntent?: {
    brief?: string | null;
    preserveNotes?: string[];
    globalObjective?: string | null;
    selectedChapterKeys?: string[];
  },
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const manuscriptVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MANUSCRIPT_ASSEMBLY,
  );
  const manuscript = parseJsonWithSchema(manuscriptVersion?.contentJson, ManuscriptAssemblySchema);
  if (!manuscript) {
    throw new Error("Assemble the manuscript before generating a revision.");
  }

  const { focusChapters, selectedChapterKeys, targetDescriptor } = resolveRevisionTargetChapters({
    manuscript,
    chapterKey,
    selectedChapterKeys: revisionIntent?.selectedChapterKeys,
  });
  if (focusChapters.length === 0) {
    throw new Error("The selected revision target could not be found.");
  }
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const preferences = getEditorialPreferenceProfile(metadata);
  const revisionBrief = revisionIntent?.brief?.trim() || null;
  const preserveNotes = (revisionIntent?.preserveNotes ?? [])
    .map((note) => note.trim())
    .filter(Boolean)
    .slice(0, 6);
  const globalObjective = revisionIntent?.globalObjective?.trim() || null;
  const draftQualityRollup = buildDraftQualityRollup(manuscript.chapters);
  const untouchedChapterContext = manuscript.chapters
    .filter((chapter) => !selectedChapterKeys.includes(chapter.chapterKey))
    .slice(0, 6)
    .map((chapter) => ({
      ...buildEditorialPromptChapterContext(chapter),
      excerpt: buildExcerpt(chapter.chapterText, 260),
    }));

  let revision: ManuscriptRevision = {
    revisedAt: new Date().toISOString(),
    mode,
    chapterKey: chapterKey ?? null,
    selectedChapterKeys,
    revisionSummary: `${targetDescriptor} ${modeLabel(mode)} prepared.`,
    rationale:
      selectedChapterKeys.length > 1
        ? `This revision rewrites ${selectedChapterKeys.length} selected sections while preserving whole-book coherence.`
        : chapterKey == null
          ? "A whole-book revision pass starts by rewriting the highest-leverage chapters first."
          : `This revision rewrites the selected chapter to address the requested ${modeLabel(mode)}.`,
    changedChapters: focusChapters.map((chapter) => ({
      chapterKey: chapter.chapterKey,
      chapterLabel: chapter.chapterLabel,
      originalText: chapter.chapterText,
      revisedText: chapter.chapterText,
      changeSummary: `No model rewrite was available, so this revision currently preserves the original text for ${chapter.chapterLabel}.`,
    })),
  };

  const model = await getEditorModel();
  if (model) {
    try {
      const structured = model.withStructuredOutput(ManuscriptRevisionReplySchema);
      const result = await structured.invoke([
        new SystemMessage(`
You are the editor agent for a ghostwriting platform.

Rewrite only the chapters you are given.
- Respect the requested editorial mode.
- Preserve the author's intent while improving the prose.
- Return only the changed chapters you actually rewrote.
- If the request is whole-book, choose the highest-leverage chapters first instead of attempting the entire manuscript at once.
- Treat the revision brief and preserve notes as hard constraints.
- Improve the selected chapters without creating continuity drift against untouched chapters.
- Use the untouched chapter summaries as book-context guardrails even though you are only rewriting selected sections.
- Use the stored quality weak signals to decide what must actually change on the page.
        `),
        new HumanMessage(
          JSON.stringify({
            workflowType: book.workflowType,
            bookTitle: manuscript.title,
            mode,
            chapterKey: chapterKey ?? null,
            preferences,
            revisionBrief,
            preserveNotes,
            globalObjective,
            draftQualityRollup,
            selectedChapterKeys,
            chapters: focusChapters.map((chapter) => ({
              ...buildEditorialPromptChapterContext(chapter),
              chapterText: chapter.chapterText.slice(0, 12000),
            })),
            untouchedChapterContext,
          }),
        ),
      ]);

      const modelChangedChapters = (result.changedChapters ?? [])
        .map((candidate) => {
          const original = manuscript.chapters.find((chapter) => chapter.chapterKey === candidate.chapterKey);
          if (!original) {
            return null;
          }

          return {
            chapterKey: candidate.chapterKey,
            chapterLabel: candidate.chapterLabel || original.chapterLabel,
            originalText: original.chapterText,
            revisedText: candidate.revisedText,
            changeSummary: candidate.changeSummary,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (modelChangedChapters.length === 0) {
        console.error(
          `[editing] generateManuscriptRevisionWorkflow for ${bookSlug}: model returned ${result.changedChapters?.length ?? 0} changedChapters, none matched a real chapterKey; keeping deterministic (unrewritten) fallback instead of failing the pass.`,
        );
      }

      // Same shape as the revision-plan bug fixed 2026-07-08: the model can
      // return a well-formed response with zero (or all-mismatched-key)
      // changedChapters, which used to silently overwrite the always-
      // populated deterministic fallback above and throw downstream
      // ("No rewritten chapters were generated for this revision pass.").
      // Keep the deterministic changedChapters as a floor.
      revision = {
        revisedAt: new Date().toISOString(),
        mode,
        chapterKey: chapterKey ?? null,
        selectedChapterKeys,
        revisionSummary: result.revisionSummary,
        rationale:
          [result.rationale, revisionBrief ? `Target outcome: ${revisionBrief}` : null]
            .filter(Boolean)
            .join("\n\n"),
        changedChapters: modelChangedChapters.length > 0 ? modelChangedChapters : revision.changedChapters,
      };
    } catch (err) {
      console.error(`[editing] generateManuscriptRevisionWorkflow failed for ${bookSlug}, using deterministic fallback revision:`, err);
    }
  }

  if (revisionBrief && !revision.rationale.includes("Target outcome:")) {
    revision = {
      ...revision,
      rationale: `${revision.rationale}\n\nTarget outcome: ${revisionBrief}`,
    };
  }

  if (globalObjective && !revision.rationale.includes("Whole-book objective:")) {
    revision = {
      ...revision,
      rationale: `${revision.rationale}\n\nWhole-book objective: ${globalObjective}`,
    };
  }

  if (revision.changedChapters.length === 0) {
    throw new Error("No rewritten chapters were generated for this revision pass.");
  }

  await createEditingArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.MANUSCRIPT_REVISION,
    title: "Manuscript Revision",
    summary: `${revision.changedChapters.length} chapter revision${revision.changedChapters.length === 1 ? "" : "s"} prepared for ${modeLabel(mode)}.`,
    contentJson: revision,
    contentText: JSON.stringify(revision, null, 2),
    promptTemplateVersion: "editing-revision-v1",
    modelName: model ? "final-editor:polish" : "deterministic-fallback",
    // Give each single-chapter revision (the only case the current UI
    // generates) its own Artifact so it can never crowd out another
    // chapter's revision — see the chapterKey doc comment on
    // CreateEditingArtifactVersionInput. A genuine multi-chapter batch has
    // no single chapter to key by, so it keeps the shared-artifact behavior.
    chapterKey: selectedChapterKeys.length === 1 ? selectedChapterKeys[0] : null,
  });

  return revision;
}

export async function applyManuscriptRevisionWorkflow(bookSlug: string, revisionVersionId: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const manuscriptVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MANUSCRIPT_ASSEMBLY,
  );
  const revisionVersion = await getEditingArtifactVersionById(revisionVersionId);
  const manuscript = parseJsonWithSchema(manuscriptVersion?.contentJson, ManuscriptAssemblySchema);
  const revision = parseJsonWithSchema(revisionVersion?.contentJson, ManuscriptRevisionSchema);

  if (!manuscript) {
    throw new Error("Assemble the manuscript before applying a revision.");
  }
  if (!revision) {
    throw new Error("The selected revision could not be found.");
  }

  const revisionMap = new Map(revision.changedChapters.map((chapter) => [chapter.chapterKey, chapter]));
  const nextChapters = manuscript.chapters.map((chapter) => {
    const candidate = revisionMap.get(chapter.chapterKey);
    if (!candidate) {
      return chapter;
    }

    return {
      ...chapter,
      chapterText: candidate.revisedText,
      wordCount: countWords(candidate.revisedText),
      reviewSummary: candidate.changeSummary,
      // The draft-quality signal that triggered this revision never gets
      // re-measured after Opus rewrites the chapter — computeEditorialReadinessGate
      // reads chaptersNeedingRevision straight off this flag, so leaving it
      // stale here means a revised chapter can permanently block commit and
      // the autopilot editorial loop keeps re-queuing it forever. Clear it
      // and record the pass; a later real reassessment can re-flag it.
      quality: chapter.quality
        ? {
            ...chapter.quality,
            needsRevision: false,
            revisionPasses: chapter.quality.revisionPasses + 1,
          }
        : chapter.quality,
    };
  });

  const nextAssembly: ManuscriptAssembly = {
    ...manuscript,
    assembledAt: new Date().toISOString(),
    totalWords: nextChapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    editorialOverview: revision.revisionSummary,
    outstandingConcerns: manuscript.outstandingConcerns.filter(
      (item) => !revision.changedChapters.some((chapter) => item.includes(chapter.chapterLabel)),
    ),
    chapters: nextChapters,
    fullText: buildFullText(nextChapters),
    chapterKeys: nextChapters.map((chapter) => chapter.chapterKey),
  };

  await createEditingArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.MANUSCRIPT_ASSEMBLY,
    title: "Full Manuscript Assembly",
    summary: `Applied ${modeLabel(revision.mode)} revision to ${revision.changedChapters.length} chapter${revision.changedChapters.length === 1 ? "" : "s"}.`,
    contentJson: nextAssembly,
    contentText: nextAssembly.fullText,
    promptTemplateVersion: "editing-assembly-v2",
    modelName: "deterministic-apply-revision",
  });

  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const preferences = getEditorialPreferenceProfile(metadata);
  const appliedRevisionIds = Array.isArray(metadata.appliedRevisionIds)
    ? metadata.appliedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...metadata,
      appliedRevisionIds: [...new Set([...appliedRevisionIds, revisionVersionId])],
      editorialPreferences: {
        ...preferences,
        updatedAt: new Date().toISOString(),
        acceptedRevisionCount: preferences.acceptedRevisionCount + 1,
        acceptedModes: [...new Set([...preferences.acceptedModes, revision.mode])],
      },
      updatedAt: new Date().toISOString(),
    },
  });

  const hasExistingPublishingPackage = Boolean(
    await getLatestEditingArtifactVersion(book.id, ArtifactType.PUBLISHING_PACKAGE),
  );
  const hasExistingDerivedArtifacts =
    Boolean(await getLatestEditingArtifactVersion(book.id, ArtifactType.PROVENANCE_REPORT)) ||
    Boolean(await getLatestEditingArtifactVersion(book.id, ArtifactType.MARKETING_HANDOFF_PACKAGE));
  if (hasExistingPublishingPackage || hasExistingDerivedArtifacts || stage?.status === StageStatus.COMMITTED) {
    await preparePublishingPackageWorkflow(bookSlug, {
      forceDerivedArtifactRefresh:
        hasExistingPublishingPackage || hasExistingDerivedArtifacts || stage?.status === StageStatus.COMMITTED,
    });
  }

  return nextAssembly;
}

export async function rejectManuscriptRevisionWorkflow(bookSlug: string, revisionVersionId: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const revisionVersion = await getEditingArtifactVersionById(revisionVersionId);
  const revision = parseJsonWithSchema(revisionVersion?.contentJson, ManuscriptRevisionSchema);
  const preferences = getEditorialPreferenceProfile(metadata);
  const rejectedRevisionIds = Array.isArray(metadata.rejectedRevisionIds)
    ? metadata.rejectedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...metadata,
      rejectedRevisionIds: [...new Set([...rejectedRevisionIds, revisionVersionId])],
      editorialPreferences: {
        ...preferences,
        updatedAt: new Date().toISOString(),
        rejectedRevisionCount: preferences.rejectedRevisionCount + 1,
        rejectedModes: revision ? [...new Set([...preferences.rejectedModes, revision.mode])] : preferences.rejectedModes,
      },
      updatedAt: new Date().toISOString(),
    },
  });

  return true;
}

export async function commitEditingStageWorkflow(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { chapters } = await loadEditingChapters(book);
  const committedBookSetupVersion = await getCommittedBookSetup(book.id);
  const bookSetup = committedBookSetupVersion?.contentJson
    ? BookSetupProfileSchema.safeParse(committedBookSetupVersion.contentJson).data ?? null
    : null;
  const manuscriptVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MANUSCRIPT_ASSEMBLY,
  );
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const editorialPreferences = getEditorialPreferenceProfile(metadata);
  const revisionPlanExecution = parseJsonWithSchema(
    metadata.revisionPlanExecution,
    EditorialRevisionPlanExecutionSchema,
  );
  const revisionPlan = parseJsonWithSchema(metadata.revisionPlan, EditorialRevisionPlanSchema);

  const assembly = manuscriptVersion?.contentJson
    ? ManuscriptAssemblySchema.safeParse(manuscriptVersion.contentJson).data ?? null
    : null;
  if (!assembly) {
    throw new Error("Assemble the full manuscript before committing the Editing stage.");
  }
  const currentDraftSignature = buildSourceDraftSignature(chapters);
  if (
    assembly.chapterCount !== chapters.length ||
    chapters.some((chapter, index) => assembly.chapters[index]?.chapterKey !== chapter.chapterKey)
  ) {
    throw new Error(
      "The manuscript assembly is stale. Reassemble the manuscript so Editing matches the latest chapter drafts before committing.",
    );
  }
  if (assembly.sourceDraftSignature !== currentDraftSignature) {
    throw new Error(
      "The chapter drafts changed after the current manuscript assembly was created. Reassemble the manuscript before committing Editing.",
    );
  }

  const latestAssessmentVersion = await getEditingArtifactVersions(
    book.id,
    ArtifactType.EDITORIAL_ASSESSMENT,
    1,
  );
  const latestAssessment = parseJsonWithSchema(
    latestAssessmentVersion[0]?.contentJson,
    EditorialAssessmentSchema,
  );
  const appliedRevisionIds = Array.isArray(metadata.appliedRevisionIds)
    ? metadata.appliedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const rejectedRevisionIds = Array.isArray(metadata.rejectedRevisionIds)
    ? metadata.rejectedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const editorialReadinessGate = computeEditorialReadinessGate({
    manuscript: assembly,
    draftQualityRollup: buildDraftQualityRollup(chapters),
    latestAssessment,
    revisionPlan,
    revisionPlanExecution,
    appliedRevisionIds,
    rejectedRevisionIds,
    bookTargetWordCount: bookSetup?.targetWordCount ?? null,
    bookTargetTolerance: bookSetup?.wordCountTolerance ?? null,
  });

  if (editorialReadinessGate.recommendation === "blocked") {
    await updateStageForBook(book.id, StageKey.EDITING, {
      metadataJson: {
        ...metadata,
        editorialReadinessGate,
        updatedAt: new Date().toISOString(),
      },
    });
    throw new Error(
      `Editing is not ready to commit yet. ${editorialReadinessGate.risks[0] ?? "Run another editorial pass first."}`,
    );
  }

  await commitEditingArtifact(book.id, ArtifactType.MANUSCRIPT_ASSEMBLY);

  const publishingPackage = buildPublishingPackage({
    assembly,
    workflowType: book.workflowType,
    bookSetup,
    draftQualityRollup: buildDraftQualityRollup(chapters),
    editorialRecommendation: editorialReadinessGate.recommendation,
  });

  await createEditingArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PUBLISHING_PACKAGE,
    title: "Publishing Package",
    summary: "Editing committed and manuscript export package prepared.",
    contentJson: publishingPackage,
    contentText: JSON.stringify(publishingPackage, null, 2),
    promptTemplateVersion: "editing-publishing-package-v1",
    modelName: "deterministic-packager",
  });

  await commitEditingArtifact(book.id, ArtifactType.PUBLISHING_PACKAGE);

  await syncPublishDerivedArtifacts({
    bookId: book.id,
    workflowType: book.workflowType,
    assembly,
    publishingPackage,
    editorialPreferences,
    revisionPlanExecution,
  });

  await updateStageForBook(book.id, StageKey.EDITING, {
    status: StageStatus.COMMITTED,
    committedAt: stage?.committedAt ?? new Date(),
    metadataJson: {
      ...metadata,
      automationStatus: "committed",
      assembledAt: assembly.assembledAt,
      preparedAt: publishingPackage.preparedAt,
      publishPackageSourceAssemblyVersionId: manuscriptVersion?.id ?? null,
      publishPackageRefreshedAt: publishingPackage.preparedAt,
      publishDerivedRefreshedAt: new Date().toISOString(),
      totalWords: assembly.totalWords,
      chapterCount: assembly.chapterCount,
      editorialReadinessGate,
    },
  });

  await clearStageStaleDependency(bookSlug, StageKey.EDITING);

  return publishingPackage;
}

export async function preparePublishingPackageWorkflow(
  bookSlug: string,
  options?: {
    forceDerivedArtifactRefresh?: boolean;
  },
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { chapters } = await loadEditingChapters(book);
  const committedBookSetupVersion = await getCommittedBookSetup(book.id);
  const bookSetup = committedBookSetupVersion?.contentJson
    ? BookSetupProfileSchema.safeParse(committedBookSetupVersion.contentJson).data ?? null
    : null;
  const manuscriptVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MANUSCRIPT_ASSEMBLY,
  );
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const assembly = manuscriptVersion?.contentJson
    ? ManuscriptAssemblySchema.safeParse(manuscriptVersion.contentJson).data ?? null
    : null;

  if (!assembly) {
    throw new Error("Assemble the manuscript before preparing the publishing package.");
  }

  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const revisionPlanExecution = parseJsonWithSchema(
    metadata.revisionPlanExecution,
    EditorialRevisionPlanExecutionSchema,
  );
  const revisionPlan = parseJsonWithSchema(metadata.revisionPlan, EditorialRevisionPlanSchema);
  const latestAssessmentVersion = await getEditingArtifactVersions(
    book.id,
    ArtifactType.EDITORIAL_ASSESSMENT,
    1,
  );
  const latestAssessment = parseJsonWithSchema(
    latestAssessmentVersion[0]?.contentJson,
    EditorialAssessmentSchema,
  );
  const appliedRevisionIds = Array.isArray(metadata.appliedRevisionIds)
    ? metadata.appliedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const rejectedRevisionIds = Array.isArray(metadata.rejectedRevisionIds)
    ? metadata.rejectedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const editorialReadinessGate = computeEditorialReadinessGate({
    manuscript: assembly,
    draftQualityRollup: buildDraftQualityRollup(chapters),
    latestAssessment,
    revisionPlan,
    revisionPlanExecution,
    appliedRevisionIds,
    rejectedRevisionIds,
    bookTargetWordCount: bookSetup?.targetWordCount ?? null,
    bookTargetTolerance: bookSetup?.wordCountTolerance ?? null,
  });

  const publishingPackage = buildPublishingPackage({
    assembly,
    workflowType: book.workflowType,
    bookSetup,
    draftQualityRollup: buildDraftQualityRollup(chapters),
    editorialRecommendation: editorialReadinessGate.recommendation,
  });

  await createEditingArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PUBLISHING_PACKAGE,
    title: "Publishing Package",
    summary: "Publishing package refreshed from the latest manuscript assembly and setup intent.",
    contentJson: publishingPackage,
    contentText: JSON.stringify(publishingPackage, null, 2),
    promptTemplateVersion: "editing-publishing-package-v2",
    modelName: "deterministic-packager",
  });

  await commitEditingArtifact(book.id, ArtifactType.PUBLISHING_PACKAGE);

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...metadata,
      preparedAt: publishingPackage.preparedAt,
      publishPackageSourceAssemblyVersionId: manuscriptVersion?.id ?? null,
      publishPackageRefreshedAt: new Date().toISOString(),
      publishDerivedRefreshedAt: new Date().toISOString(),
      editorialReadinessGate,
    },
  });

  const editorialPreferences = getEditorialPreferenceProfile(metadata);
  const hasDerivedArtifacts =
    Boolean(await getLatestEditingArtifactVersion(book.id, ArtifactType.PROVENANCE_REPORT)) ||
    Boolean(await getLatestEditingArtifactVersion(book.id, ArtifactType.MARKETING_HANDOFF_PACKAGE));

  if (options?.forceDerivedArtifactRefresh || stage?.status === StageStatus.COMMITTED || hasDerivedArtifacts) {
    await syncPublishDerivedArtifacts({
      bookId: book.id,
      workflowType: book.workflowType,
      assembly,
      publishingPackage,
      editorialPreferences,
      revisionPlanExecution,
      refreshDerivedOnly: true,
    });
  }

  return publishingPackage;
}

export async function finalizePublishingHandoffWorkflow(
  bookSlug: string,
  options?: {
    archiveReady?: boolean;
  },
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const stageMetadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const bookMetadata =
    book.metadataJson && typeof book.metadataJson === "object"
      ? (book.metadataJson as Record<string, unknown>)
      : {};

  let manuscriptVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.MANUSCRIPT_ASSEMBLY);
  let publishingVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.PUBLISHING_PACKAGE);
  let publishingPackage = publishingVersion?.contentJson
    ? parseJsonWithSchema(publishingVersion.contentJson, PublishingPackageSchema)
    : null;

  const syncState = buildPublishPackageSyncState({
    currentAssemblyVersionId: manuscriptVersion?.id ?? null,
    hasPublishingPackage: Boolean(publishingPackage),
    packageSourceAssemblyVersionId:
      typeof stageMetadata.publishPackageSourceAssemblyVersionId === "string"
        ? stageMetadata.publishPackageSourceAssemblyVersionId
        : null,
    lastRefreshedAt:
      typeof stageMetadata.publishPackageRefreshedAt === "string"
        ? stageMetadata.publishPackageRefreshedAt
        : publishingPackage?.preparedAt ?? null,
  });

  if (!publishingPackage || syncState.status !== "synced") {
    await preparePublishingPackageWorkflow(bookSlug);
    manuscriptVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.MANUSCRIPT_ASSEMBLY);
    publishingVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.PUBLISHING_PACKAGE);
    publishingPackage = publishingVersion?.contentJson
      ? parseJsonWithSchema(publishingVersion.contentJson, PublishingPackageSchema)
      : null;
  }

  if (!publishingPackage || !manuscriptVersion) {
    throw new Error("Prepare a synced publishing package before finalizing handoff.");
  }

  const finalizedAt = new Date().toISOString();
  const finalHandoffState = {
    finalizedAt,
    archivedAt: options?.archiveReady ? finalizedAt : null,
    packageVersionId: publishingVersion?.id ?? null,
    packagePreparedAt: publishingPackage.preparedAt,
    notes: [
      "Publishing package is locked to the latest synced manuscript assembly.",
      "Interior layout, cover brief, distribution manifest, provenance, and marketing handoff are ready for downstream production.",
      options?.archiveReady
        ? "The book is marked archive-ready for a final cold-storage export."
        : "Archive export remains available for long-term storage after handoff.",
    ],
  };

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...stageMetadata,
      finalHandoffState,
      updatedAt: new Date().toISOString(),
    },
  });

  await updateBookMetadata(book.id, {
    ...bookMetadata,
    finalHandoffState,
  });

  return finalHandoffState;
}

export async function sendEditingMessageWorkflow(
  bookSlug: string,
  userInput: string,
  chapterKey?: string | null,
) {
  const trimmed = userInput.trim();
  if (!trimmed) {
    return getEditingWorkspace(bookSlug);
  }

  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const manuscriptVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MANUSCRIPT_ASSEMBLY,
  );
  const manuscript = manuscriptVersion?.contentJson
    ? ManuscriptAssemblySchema.safeParse(manuscriptVersion.contentJson).data ?? null
    : null;

  if (!manuscript) {
    throw new Error("Assemble the manuscript before starting the editor-agent conversation.");
  }

  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const preferences = getEditorialPreferenceProfile(metadata);
  const transcript = parseEditingMessages(metadata.editorConversation);
  const nextTranscript: EditingMessage[] = [
    ...transcript,
    {
      role: "user",
      content: trimmed,
      chapterKey: chapterKey ?? null,
      createdAt: new Date().toISOString(),
    },
  ];

  let reply = "I reviewed your note and I’m ready to guide the next full-book revision pass.";
  let wholeBookAssessment = manuscript.editorialOverview;
  let focusChapterKey = chapterKey ?? null;
  let nextActions = manuscript.outstandingConcerns.slice(0, 4);
  let suggestedRevisionTarget: SuggestedEditorialRevisionTarget | null =
    buildConversationSuggestedRevisionTarget({
      manuscript,
      chapterKey,
      userInput: trimmed,
    });

  const model = await getEditorAssessModel();
  if (model) {
    try {
      const structured = model.withStructuredOutput(EditingConversationReplySchema);
      const result = await structured.invoke([
        new SystemMessage(`
You are the editor agent for a ghostwriting platform.

Your job:
- read the full manuscript as one coherent book
- respond conversationally to the author's revision requests
- think at both full-book level and chapter-by-chapter level
- keep advice actionable, concise, and editorial
- prioritize structure, clarity, repetition, pacing, continuity, credibility, and voice consistency
- when appropriate, propose one concrete revision target that can be executed next
        `),
        new HumanMessage(
          JSON.stringify({
            bookTitle: book.titleWorking ?? "Untitled Book",
              chapterFocus: chapterKey ?? null,
              preferences,
              latestUserInput: trimmed,
              transcript: nextTranscript.slice(-12),
            manuscript: {
              title: manuscript.title,
              chapterCount: manuscript.chapterCount,
              totalWords: manuscript.totalWords,
              editorialOverview: manuscript.editorialOverview,
              outstandingConcerns: manuscript.outstandingConcerns,
              chapters: manuscript.chapters.map((chapter) => ({
                chapterKey: chapter.chapterKey,
                chapterLabel: chapter.chapterLabel,
                reviewSummary: chapter.reviewSummary,
                excerpt: chapter.chapterText.slice(0, 2000),
              })),
            },
          }),
        ),
      ]);

      reply = result.reply;
      wholeBookAssessment = result.wholeBookAssessment;
      focusChapterKey = result.focusChapterKey ?? focusChapterKey;
      nextActions = result.nextActions ?? [];
      suggestedRevisionTarget = result.suggestedRevision
        ? buildSuggestedRevisionTarget(result.suggestedRevision)
        : suggestedRevisionTarget;
    } catch {
      // Keep deterministic fallback reply below.
    }
  }

  const finalTranscript: EditingMessage[] = [
    ...nextTranscript,
    {
      role: "assistant",
      content: reply,
      chapterKey: focusChapterKey,
      createdAt: new Date().toISOString(),
    },
  ];

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...metadata,
      editorConversation: finalTranscript.slice(-20),
      wholeBookAssessment,
      suggestedNextActions: nextActions,
      focusChapterKey,
      suggestedRevisionTarget,
      updatedAt: new Date().toISOString(),
    },
  });

  return getEditingWorkspace(bookSlug);
}

export async function updateEditorialPreferencesWorkflow(
  bookSlug: string,
  input: {
    styleNotes: string;
    preserveVoice: boolean;
    preferTighterProse: boolean;
    preferBolderCuts: boolean;
  },
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const current = getEditorialPreferenceProfile(metadata);

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...metadata,
      editorialPreferences: {
        ...current,
        updatedAt: new Date().toISOString(),
        styleNotes: input.styleNotes.trim(),
        preserveVoice: input.preserveVoice,
        preferTighterProse: input.preferTighterProse,
        preferBolderCuts: input.preferBolderCuts,
      },
      updatedAt: new Date().toISOString(),
    },
  });

  return getEditingWorkspace(bookSlug);
}

export async function generateEditorialRevisionPlanWorkflow(bookSlug: string, chapterKey?: string | null) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const manuscriptVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.MANUSCRIPT_ASSEMBLY);
  const manuscript = parseJsonWithSchema(manuscriptVersion?.contentJson, ManuscriptAssemblySchema);
  if (!manuscript) {
    throw new Error("Assemble the manuscript before generating a revision plan.");
  }

  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const latestAssessment = (
    await getEditingArtifactVersions(book.id, ArtifactType.EDITORIAL_ASSESSMENT, 1)
  )[0];
  const assessment = parseJsonWithSchema(latestAssessment?.contentJson, EditorialAssessmentSchema);
  const draftQualityRollup = buildDraftQualityRollup(manuscript.chapters);

  let plan = buildDeterministicRevisionPlan({
    chapters: manuscript.chapters,
    assessment,
    focusChapterKey: chapterKey ?? null,
  });

  const model = await getEditorAssessModel();
  if (model) {
    try {
      const structured = model.withStructuredOutput(EditorialRevisionPlanReplySchema);
      const result = await structured.invoke([
        new SystemMessage(`
You are the editor agent for a ghostwriting platform.

Create a pragmatic revision plan.
- Prioritize highest-leverage chapters first.
- Recommend the best editorial mode for each chapter.
- Keep the plan concrete and sequenced.
- Give each queued item a crisp target outcome.
- Add preserve notes that protect whole-book coherence while the chapter is being rewritten.
- Return a short whole-book objective list and a coherence-risk watchlist that should govern every queued revision.
- Use the manuscript's stored quality weak signals to decide which chapters are truly highest leverage.
        `),
        new HumanMessage(
          JSON.stringify({
            workflowType: book.workflowType,
            chapterKey: chapterKey ?? null,
            assessment,
            draftQualityRollup,
            preferences: getEditorialPreferenceProfile(metadata),
            wholeBookAssessment:
              typeof metadata.wholeBookAssessment === "string" ? metadata.wholeBookAssessment : null,
            suggestedNextActions: Array.isArray(metadata.suggestedNextActions)
              ? metadata.suggestedNextActions.filter((entry): entry is string => typeof entry === "string")
              : [],
            chapters: manuscript.chapters.map((chapter) => buildEditorialPromptChapterContext(chapter)),
          }),
        ),
      ]);

      const modelChapterQueue = (result.chapterQueue ?? []).map((item) => ({
        ...item,
        targetOutcome: item.targetOutcome ?? item.reason,
        preserveNotes: item.preserveNotes ?? [],
      }));

      plan = {
        generatedAt: new Date().toISOString(),
        focus: chapterKey ? "chapter-specific" : "whole-book",
        chapterKey: chapterKey ?? null,
        summary: result.summary,
        globalObjectives: result.globalObjectives ?? [],
        coherenceRisks: result.coherenceRisks ?? [],
        passes: result.passes ?? [],
        // The model sometimes returns a fully-formed narrative (summary,
        // objectives, risks -- even naming specific chapters and issues)
        // but an empty chapterQueue array: a structurally valid response
        // that's still useless downstream. Confirmed in production
        // 2026-07-08: a rich, chapter-specific summary paired with zero
        // chapterQueue entries, which made executeEditorialRevisionPlanWorkflow
        // throw immediately ("Generate a revision plan before executing
        // it.") even though a plan had just been generated. Keep the
        // deterministic one-entry-per-chapter queue as a floor rather than
        // let an empty model queue silently discard it.
        chapterQueue: modelChapterQueue.length > 0 ? modelChapterQueue : plan.chapterQueue,
      };
    } catch (err) {
      console.error(`[editing] generateEditorialRevisionPlanWorkflow failed for ${bookSlug}, using deterministic fallback plan:`, err);
    }
  }

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...metadata,
      revisionPlan: plan,
      updatedAt: new Date().toISOString(),
    },
  });

  return getEditingWorkspace(bookSlug);
}

export async function executeEditorialRevisionPlanWorkflow(
  bookSlug: string,
  input?: {
    limit?: number;
    autoApply?: boolean;
  },
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const revisionPlan = parseJsonWithSchema(metadata.revisionPlan, EditorialRevisionPlanSchema);

  if (!revisionPlan || revisionPlan.chapterQueue.length === 0) {
    throw new Error("Generate a revision plan before executing it.");
  }

  const limit = Math.max(1, Math.min(5, input?.limit ?? 3));
  const autoApply = input?.autoApply === true;
  const queue = revisionPlan.chapterQueue.slice(0, limit);

  let generatedCount = 0;
  let autoAppliedCount = 0;
  const executedChapterKeys: string[] = [];
  const modes: EditorialMode[] = [];

  for (const item of queue) {
    await generateManuscriptRevisionWorkflow(
      bookSlug,
      item.recommendedMode,
      item.chapterKey,
      {
        brief: item.targetOutcome || item.reason,
        preserveNotes: [...item.preserveNotes, ...revisionPlan.globalObjectives].slice(0, 8),
        globalObjective: [revisionPlan.summary, ...revisionPlan.globalObjectives, ...revisionPlan.coherenceRisks]
          .filter(Boolean)
          .join(" "),
      },
    );
    generatedCount += 1;
    executedChapterKeys.push(item.chapterKey);
    modes.push(item.recommendedMode);

    if (autoApply) {
      const latestRevision = (
        await getEditingArtifactVersions(book.id, ArtifactType.MANUSCRIPT_REVISION, 1)
      )[0];
      if (latestRevision) {
        await applyManuscriptRevisionWorkflow(bookSlug, latestRevision.id);
        autoAppliedCount += 1;
      }
    }
  }

  const execution: EditorialRevisionPlanExecution = {
    executedAt: new Date().toISOString(),
    generatedCount,
    autoAppliedCount,
    executedChapterKeys,
    modes,
  };

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...metadata,
      revisionPlanExecution: execution,
      updatedAt: new Date().toISOString(),
    },
  });

  return getEditingWorkspace(bookSlug);
}

export async function generateSuggestedRevisionFromConversationWorkflow(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const suggestedRevisionTarget = parseJsonWithSchema(
    metadata.suggestedRevisionTarget,
    SuggestedEditorialRevisionTargetSchema,
  );

  if (!suggestedRevisionTarget) {
    throw new Error("Start or continue the editor conversation before generating a suggested revision.");
  }

  await generateManuscriptRevisionWorkflow(
    bookSlug,
    suggestedRevisionTarget.mode,
    suggestedRevisionTarget.chapterKey ?? null,
    {
      brief: suggestedRevisionTarget.brief,
      preserveNotes: suggestedRevisionTarget.preserveNotes,
      selectedChapterKeys: suggestedRevisionTarget.selectedChapterKeys,
      globalObjective:
        typeof metadata.wholeBookAssessment === "string" ? metadata.wholeBookAssessment : null,
    },
  );

  return getEditingWorkspace(bookSlug);
}

export async function runFullEditorialLoopWorkflow(
  bookSlug: string,
  input?: {
    assessmentMode?: EditorialMode;
    planLimit?: number;
    autoApply?: boolean;
    commitAfter?: boolean;
  },
) {
  const assessmentMode = input?.assessmentMode ?? "structural-edit";
  const planLimit = input?.planLimit ?? 3;
  const autoApply = input?.autoApply ?? true;
  const commitAfter = input?.commitAfter ?? false;

  let workspace = await getEditingWorkspace(bookSlug);
  if (!workspace.manuscriptAssembly) {
    await assembleManuscriptWorkflow(bookSlug);
    workspace = await getEditingWorkspace(bookSlug);
  }

  await generateEditorialAssessmentWorkflow(bookSlug, assessmentMode, null);
  await generateEditorialRevisionPlanWorkflow(bookSlug, null);
  workspace = await executeEditorialRevisionPlanWorkflow(bookSlug, {
    limit: planLimit,
    autoApply,
  });

  if (autoApply) {
    await preparePublishingPackageWorkflow(bookSlug);
  }

  if (commitAfter) {
    const committed = await getBookBySlugOrThrow(bookSlug);
    const stage = await getStageForBook(committed.id, StageKey.EDITING);
    const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
    const latestWorkspace = await getEditingWorkspace(bookSlug);
    const editorialReadinessGate = computeEditorialReadinessGate({
      manuscript: latestWorkspace.manuscriptAssembly,
      draftQualityRollup: latestWorkspace.draftQualityRollup,
      latestAssessment: latestWorkspace.latestAssessment,
      revisionPlan: latestWorkspace.revisionPlan,
      revisionPlanExecution: latestWorkspace.revisionPlanExecution,
      appliedRevisionIds: latestWorkspace.appliedRevisionIds,
      rejectedRevisionIds: latestWorkspace.rejectedRevisionIds,
      bookTargetWordCount: latestWorkspace.bookSetup?.targetWordCount ?? null,
      bookTargetTolerance: latestWorkspace.bookSetup?.wordCountTolerance ?? null,
    });

    await updateStageForBook(committed.id, StageKey.EDITING, {
      metadataJson: {
        ...metadata,
        editorialReadinessGate,
        updatedAt: new Date().toISOString(),
      },
    });

    if (editorialReadinessGate.recommendation === "ready_for_commit") {
      await commitEditingStageWorkflow(bookSlug);
    }
  }

  return getEditingWorkspace(bookSlug);
}

export async function getEditingWorkspace(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const bookSetupVersion = await getCommittedBookSetup(book.id);
  const bookSetup = parseJsonWithSchema(bookSetupVersion?.contentJson, BookSetupProfileSchema);

  let blockingReason: string | null = null;
  let chapters: EditingChapterSnapshot[] = [];

  try {
    ({ chapters } = await loadEditingChapters(book));
  } catch (error) {
    blockingReason = error instanceof Error ? error.message : "Editing inputs are not ready.";
  }

  const draftedChapters = chapters.filter((chapter) => chapter.chapterText.trim().length > 0);
  const manuscriptReady = chapters.length > 0 && draftedChapters.length === chapters.length;
  const totalWords = draftedChapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);

  const manuscriptVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MANUSCRIPT_ASSEMBLY,
  );
  const publishingVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.PUBLISHING_PACKAGE,
  );
  const provenanceVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.PROVENANCE_REPORT,
  );
  const marketingHandoffVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MARKETING_HANDOFF_PACKAGE,
  );
  const assessmentVersions = await getEditingArtifactVersions(
    book.id,
    ArtifactType.EDITORIAL_ASSESSMENT,
    5,
  );
  // Every "Generate Revision" click for any chapter shares one Artifact row
  // and appends a new version, so a small take limit here silently drops
  // older chapters' revisions from the queue once enough other chapters get
  // revised afterward — confirmed live: 6 of 16 chapters' already-applied
  // revisions stopped showing up once the 10-version window filled with
  // other chapters' revisions, even though appliedRevisionIds still had
  // every one of them recorded. Large headroom here is the immediate fix;
  // generateManuscriptRevisionWorkflow below is the structural one.
  const revisionVersions = await getEditingArtifactVersions(book.id, ArtifactType.MANUSCRIPT_REVISION, 500);
  const manuscriptAssembly = manuscriptVersion?.contentJson
    ? parseJsonWithSchema(manuscriptVersion.contentJson, ManuscriptAssemblySchema)
    : null;
  const publishingPackage = publishingVersion?.contentJson
    ? parseJsonWithSchema(publishingVersion.contentJson, PublishingPackageSchema)
    : null;
  const provenanceReport = provenanceVersion?.contentJson
    ? parseJsonWithSchema(provenanceVersion.contentJson, ProvenanceReportSchema)
    : null;
  const marketingHandoffPackage = marketingHandoffVersion?.contentJson
    ? parseJsonWithSchema(marketingHandoffVersion.contentJson, MarketingHandoffPackageSchema)
    : null;
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const editorConversation = parseEditingMessages(metadata.editorConversation);
  const editorialPreferences = getEditorialPreferenceProfile(metadata);
  const revisionPlan = parseJsonWithSchema(metadata.revisionPlan, EditorialRevisionPlanSchema);
  const revisionPlanExecution = parseJsonWithSchema(
    metadata.revisionPlanExecution,
    EditorialRevisionPlanExecutionSchema,
  );
  const latestAssessment = parseJsonWithSchema(
    assessmentVersions[0]?.contentJson,
    EditorialAssessmentSchema,
  );
  const suggestedRevisionTarget = parseJsonWithSchema(
    metadata.suggestedRevisionTarget,
    SuggestedEditorialRevisionTargetSchema,
  );
  const manuscriptHistory = (
    await getEditingArtifactVersions(book.id, ArtifactType.MANUSCRIPT_ASSEMBLY, 8)
  )
    .map((version) => {
      const assembly = parseJsonWithSchema(version.contentJson, ManuscriptAssemblySchema);
      if (!assembly) {
        return null;
      }

      return {
        id: version.id,
        versionNumber: version.versionNumber,
        lifecycleState: version.lifecycleState,
        createdAt: version.createdAt.toISOString(),
        summary: version.summary,
        totalWords: assembly.totalWords,
        chapterCount: assembly.chapterCount,
        editorialOverview: assembly.editorialOverview,
        excerpt: buildExcerpt(assembly.fullText),
        chapters: assembly.chapters,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const publishingHistory = (
    await getEditingArtifactVersions(book.id, ArtifactType.PUBLISHING_PACKAGE, 6)
  )
    .map((version) => {
      const parsed = parseJsonWithSchema(version.contentJson, PublishingPackageSchema);
      if (!parsed) {
        return null;
      }

      return {
        id: version.id,
        versionNumber: version.versionNumber,
        lifecycleState: version.lifecycleState,
        createdAt: version.createdAt.toISOString(),
        summary: version.summary,
        packageStatus: parsed.packageStatus,
        totalWords: parsed.totalWords,
        chapterCount: parsed.chapterCount,
        trimSize: parsed.trimSize,
        targetPageCount: parsed.targetPageCount ?? null,
        outputFormats: parsed.outputFormats,
        exportFormats: parsed.exportFormats,
        frontMatter: parsed.frontMatter,
        backMatter: parsed.backMatter,
        packageComponents: parsed.packageComponents,
        exportProfiles: parsed.exportProfiles,
        typesettingPlan: parsed.typesettingPlan,
        preflightChecks: parsed.preflightChecks,
        notes: parsed.notes,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const revisions = revisionVersions
    .map((version) => {
      const parsed = parseJsonWithSchema(version.contentJson, ManuscriptRevisionSchema);
      if (!parsed) {
        return null;
      }

      return {
        id: version.id,
        versionNumber: version.versionNumber,
        lifecycleState: version.lifecycleState,
        summary: version.summary,
        createdAt: version.createdAt.toISOString(),
        revision: parsed,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const appliedRevisionIds = Array.isArray(metadata.appliedRevisionIds)
    ? metadata.appliedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const rejectedRevisionIds = Array.isArray(metadata.rejectedRevisionIds)
    ? metadata.rejectedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const draftQualityRollup = buildDraftQualityRollup(chapters);
  const editorialReadinessGate = computeEditorialReadinessGate({
    manuscript: manuscriptAssembly,
    draftQualityRollup,
    latestAssessment,
    revisionPlan,
    revisionPlanExecution,
    appliedRevisionIds,
    rejectedRevisionIds,
    bookTargetWordCount: bookSetup?.targetWordCount ?? null,
    bookTargetTolerance: bookSetup?.wordCountTolerance ?? null,
  });
  const publishPackageSyncState = buildPublishPackageSyncState({
    currentAssemblyVersionId: manuscriptVersion?.id ?? null,
    hasPublishingPackage: Boolean(publishingPackage),
    packageSourceAssemblyVersionId:
      typeof metadata.publishPackageSourceAssemblyVersionId === "string"
        ? metadata.publishPackageSourceAssemblyVersionId
        : null,
    lastRefreshedAt:
      typeof metadata.publishPackageRefreshedAt === "string"
        ? metadata.publishPackageRefreshedAt
        : publishingPackage?.preparedAt ?? null,
  });
  const finalHandoffState = parseJsonWithSchema(metadata.finalHandoffState, FinalHandoffStateSchema);

  return {
    book,
    bookSetup,
    stage,
    blockingReason,
    chapters,
    draftedChapters: draftedChapters.length,
    totalChapters: chapters.length,
    totalWords,
    manuscriptReady,
    draftQualityRollup,
    manuscriptAssembly,
    publishingPackage,
    publishPackageSyncState,
    finalHandoffState,
    provenanceReport,
    marketingHandoffPackage,
    latestAssessment,
    manuscriptHistory,
    publishingHistory,
    revisionQueue: revisions,
    appliedRevisionIds,
    rejectedRevisionIds,
    editorialReadinessGate,
    editorialPreferences,
    revisionPlan,
    revisionPlanExecution,
    editorConversation,
    wholeBookAssessment:
      typeof metadata.wholeBookAssessment === "string"
        ? metadata.wholeBookAssessment
        : latestAssessment?.assessmentSummary ?? manuscriptAssembly?.editorialOverview ?? null,
    suggestedNextActions: Array.isArray(metadata.suggestedNextActions)
      ? metadata.suggestedNextActions.filter((entry): entry is string => typeof entry === "string")
      : latestAssessment?.nextActions ?? manuscriptAssembly?.outstandingConcerns ?? [],
    focusChapterKey:
      typeof metadata.focusChapterKey === "string" ? metadata.focusChapterKey : null,
    suggestedRevisionTarget,
  };
}
