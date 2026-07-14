import { ArtifactType, StageKey, StageStatus } from "@prisma/client";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import type {
  EditorialMode,
  EditorialRevisionPlanExecution,
  ManuscriptRevision,
} from "../../editing-types";
import { getModelForRole } from "../../llm/routing";
import { getBookBySlugOrThrow, getStageForBook, updateStageForBook } from "../../repositories/books";
import { markFinalRevisionApproved } from "../../repositories/chapter-approval-state";
import {
  createEditingArtifactVersion,
  getEditingArtifactVersionById,
  getEditingArtifactVersions,
  getLatestEditingArtifactVersion,
} from "../../repositories/editing-artifacts";
import {
  buildDeterministicRevisionPlan,
  buildEditorialPromptChapterContext,
  buildFinalRevisionInstructions,
  modeLabel,
  resolveRevisionTargetChapters,
} from "./revision-support";
import { getEditingWorkspace } from "./workspace";
import { buildDraftQualityRollup, buildExcerpt, getEditorialPreferenceProfile, parseJson, parseJsonWithSchema } from "./workspace-support";
import {
  EditorialAssessmentSchema,
  EditorialRevisionPlanSchema,
  ManuscriptAssemblySchema,
  ManuscriptRevisionSchema,
  SuggestedEditorialRevisionTargetSchema,
} from "./workspace-schemas";
import { preparePublishingPackageWorkflow } from "./publishing";

// 8.2e3a revision extraction map.
//
// Editing revision code still lives in `../editing` until the 8.2e3
// subpackages move it in small, tested slices. Keep this map as the
// dependency contract for that extraction; do not pull publishing/commit
// orchestration into this module while moving assessment and revision logic.
export const EDITING_REVISION_EXTRACTION_DEPENDENCIES = {
  publicEntrypoint: "src/lib/workflows/editing-public.ts",
  temporarySource: "src/lib/workflows/editing.ts",
  assessmentOwner: "src/lib/workflows/editing/assessment.ts",
  revisionOwner: "src/lib/workflows/editing/revision.ts",
  publicWorkflows: [
    "generateEditorialAssessmentWorkflow",
    "generateManuscriptRevisionWorkflow",
    "applyManuscriptRevisionWorkflow",
    "rejectManuscriptRevisionWorkflow",
    "generateEditorialRevisionPlanWorkflow",
    "executeEditorialRevisionPlanWorkflow",
    "generateSuggestedRevisionFromConversationWorkflow",
  ],
  pureHelpers: [
    "modeLabel",
    "buildSourceDraftSignature",
    "buildBookWideEditorialFindings",
    "normalizeBookWideEditorialFindings",
    "buildChapterQualityDirective",
    "buildRevisionTargetOutcome",
    "buildRevisionPreserveNotes",
    "buildGlobalRevisionObjectives",
    "buildCoherenceRiskWatchlist",
    "buildSuggestedRevisionTarget",
    "inferEditorialModeFromInput",
    "buildConversationSuggestedRevisionTarget",
    "resolveRevisionTargetChapters",
    "buildEditorialPromptChapterContext",
    "buildFinalRevisionInstructions",
    "buildDeterministicRevisionPlan",
  ],
  modelSeams: [
    "getEditorAssessModel",
    "getEditorModel",
    "EditorialAssessmentReplySchema",
    "ManuscriptRevisionReplySchema",
    "EditorialRevisionPlanReplySchema",
  ],
  artifactMutations: [
    "createEditingArtifactVersion:EDITORIAL_ASSESSMENT",
    "createEditingArtifactVersion:MANUSCRIPT_REVISION",
    "createEditingArtifactVersion:MANUSCRIPT_ASSEMBLY",
    "getEditingArtifactVersionById",
    "getLatestEditingArtifactVersion",
    "getEditingArtifactVersions",
  ],
  stageMetadataFields: [
    "wholeBookAssessment",
    "suggestedNextActions",
    "focusChapterKey",
    "appliedRevisionIds",
    "rejectedRevisionIds",
    "editorialPreferences",
    "revisionPlan",
    "revisionPlanExecution",
    "suggestedRevisionTarget",
    "editorialReadinessGate",
  ],
  externalStateUpdates: [
    "markFinalRevisionApproved",
    "preparePublishingPackageWorkflow",
    "updateStageForBook",
  ],
} as const;

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

async function getEditorModel() {
  // Do not pass maxOutputTokens here -- getModelForRole only applies the
  // routing table's per-role ceiling (16000 for final-editor:polish, sized
  // for a full chapter rewrite) when the caller hasn't already specified one.
  return getModelForRole("final-editor:polish", {
    temperature: 0.2,
    timeoutMs: 120000,
  });
}

async function getEditorAssessModel() {
  return getModelForRole("final-editor:assess", {
    temperature: 0.2,
    timeoutMs: 120000,
  });
}

function countWords(value: string | null | undefined) {
  return value?.split(/\s+/).filter(Boolean).length ?? 0;
}

function buildFullText(chapters: { chapterLabel: string; chapterText: string }[]) {
  return chapters
    .map((chapter) => `# ${chapter.chapterLabel}\n\n${chapter.chapterText}`)
    .join("\n\n");
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
  const stage = await getStageForBook(book.id, "EDITING");
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const preferences = getEditorialPreferenceProfile(metadata);
  const latestAssessmentVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.EDITORIAL_ASSESSMENT,
  );
  const latestAssessment = parseJsonWithSchema(
    latestAssessmentVersion?.contentJson,
    EditorialAssessmentSchema,
  );
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
      approvedDraftVersionId: chapter.approvedDraftVersionId ?? null,
      originalText: chapter.chapterText,
      revisedText: chapter.chapterText,
      changeSummary: `No model rewrite was available, so this revision currently preserves the approved draft text for ${chapter.chapterLabel}.`,
      assessmentInstructions: buildFinalRevisionInstructions(
        chapter,
        latestAssessment,
        preserveNotes,
      ),
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
- This is the combined editorial revision and final polish pass for the selected approved draft chapter(s).
- Preserve the author's intent while improving the prose.
- Return only the changed chapters you actually rewrote.
- If the request is whole-book, choose the highest-leverage chapters first instead of attempting the entire manuscript at once.
- Treat the revision brief and preserve notes as hard constraints.
- Improve the selected chapters without creating continuity drift against untouched chapters.
- Use the untouched chapter summaries as book-context guardrails even though you are only rewriting selected sections.
- Use the stored quality weak signals to decide what must actually change on the page.
- Obey finalRevisionInstructions for approved draft version, paragraph outline anchors, voice, citation, preservation, and chapter-specific assessment findings.
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
            assessmentSummary: latestAssessment?.assessmentSummary ?? null,
            bookWideFindings: latestAssessment?.bookWideFindings ?? null,
            draftQualityRollup,
            selectedChapterKeys,
            chapters: focusChapters.map((chapter) => ({
              ...buildEditorialPromptChapterContext(chapter),
              finalRevisionInstructions: buildFinalRevisionInstructions(
                chapter,
                latestAssessment,
                preserveNotes,
              ),
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
            approvedDraftVersionId: original.approvedDraftVersionId ?? null,
            originalText: original.chapterText,
            revisedText: candidate.revisedText,
            changeSummary: candidate.changeSummary,
            assessmentInstructions: buildFinalRevisionInstructions(
              original,
              latestAssessment,
              preserveNotes,
            ),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (modelChangedChapters.length === 0) {
        console.error(
          `[editing] generateManuscriptRevisionWorkflow for ${bookSlug}: model returned ${result.changedChapters?.length ?? 0} changedChapters, none matched a real chapterKey; keeping deterministic (unrewritten) fallback instead of failing the pass.`,
        );
      }

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
    // generates) its own Artifact so it can never crowd out another chapter's
    // revision. A genuine multi-chapter batch has no single chapter to key by,
    // so it keeps the shared-artifact behavior.
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
      // re-measured after Opus rewrites the chapter. Clear it and record the
      // pass; a later real reassessment can re-flag it.
      quality: chapter.quality
        ? {
            ...chapter.quality,
            needsRevision: false,
            revisionPasses: chapter.quality.revisionPasses + 1,
          }
        : chapter.quality,
    };
  });

  const nextAssembly = {
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

  for (const changed of revision.changedChapters) {
    await markFinalRevisionApproved({
      bookId: book.id,
      chapterId: changed.chapterKey,
      versionId: revisionVersionId,
    });
  }

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
        // Keep the deterministic one-entry-per-chapter queue as a floor when
        // the model returns a valid but empty queue.
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
