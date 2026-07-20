import {
  ArtifactType,
  Prisma,
  StageKey,
  StageStatus,
} from "@prisma/client";

import {
  ChapterDraftBundleSchema,
  ChapterReviewBundleSchema,
  parseArtifactWithSchema,
} from "../../artifact-schemas";
import type { BaseStoryBundle, BaseStoryChapter } from "../../base-story-types";
import type { BookSetupProfile } from "../../book-setup-types";
import type {
  ChapterDraftBundle,
  ChapterReviewBundle,
} from "../../chapter-draft-types";
import { getLLMCallContext, runWithLLMContext } from "../../llm/call-context";
import { resolveModelSpec } from "../../llm/routing";
import { countWords } from "../../manuscript-metrics";
import type { PersonalStoryEncyclopedia } from "../../personal-story-types";
import type { Phase1StrategicBrief } from "../../phase1-strategic-brief";
import type { PromiseBrief } from "../../promise-types";
import type { ChapterEvidenceRecord } from "../../source-evidence-contract";
import {
  getBookBySlugOrThrow,
  updateStageForBook,
} from "../../repositories/books";
import {
  createChapterArtifactVersion,
  getChapterArtifactVersions,
} from "../../repositories/chapter-draft-artifacts";
import {
  getDraftInputs,
  validateQuillContextReadiness,
  type ChapterContext,
} from "./context";
import {
  averageSentenceLength,
  buildSourceWeaveRequirements,
  countMandateHits,
  countParagraphAnchorHits,
  hasMetaDraftLanguage,
  type SourceWeaveRequirements,
} from "./execution-support";
import { auditChapterDraftIntegrity } from "./integrity";
import {
  enforceFinishedBookProse,
  generateDraft,
  reviewDraft,
  reviseDraft,
  tuneDraftToTarget,
} from "./model-helpers";
import {
  findBaseStoryChapter,
  findPersonalStoryCards,
  getCommittedExternalStoriesDossier,
  getCommittedResearchDossier,
} from "./source-availability";
import {
  buildChapterWordTargets,
  type ChapterWordTarget,
} from "./workspace-support";

type DraftQualityAssessment = {
  score: number;
  needsRevision: boolean;
  readiness: "strong" | "watch" | "needs attention";
  signals: Array<{
    label: string;
    state: "pass" | "warn" | "fail";
    detail: string;
  }>;
  concerns: string[];
  integrity: ChapterDraftBundle["quality"]["integrity"];
};

function assessNonfictionDraftQuality(
  draft: ChapterDraftBundle,
  review: ChapterReviewBundle,
  chapterTarget: ChapterWordTarget | null,
  sourceAvailability: {
    researchCount: number;
    externalStoryCount: number;
    personalStoryCount: number;
    hasBaseStory: boolean;
  },
  context: ChapterContext,
  sourceWeaveFocus: SourceWeaveRequirements,
  evidence: ChapterEvidenceRecord[],
): DraftQualityAssessment {
  const sourceCategoriesUsed = [
    draft.sourceUsage.research.length > 0,
    draft.sourceUsage.externalStories.length > 0,
    draft.sourceUsage.personalStories.length > 0,
    draft.sourceUsage.baseStory.length > 0,
  ].filter(Boolean).length;
  const draftWordCount = countWords(draft.chapterText);
  const paragraphSourceNoteCoverage = draft.paragraphs.filter(
    (paragraph) => paragraph.sourceNotes.length > 0,
  ).length;
  const paragraphTargetFailures = context.chapter.paragraphs.filter((plannedParagraph, index) => {
    const prose = draft.paragraphs[index]?.prose ?? "";
    const actualWordCount = countWords(prose);
    const targetWordCount = Math.max(80, Math.round(plannedParagraph.wordCountTarget || 0));
    const tolerance = Math.max(60, Math.round(targetWordCount * 0.28));
    return actualWordCount < targetWordCount - tolerance || actualWordCount > targetWordCount + tolerance;
  }).length;
  const paragraphAnchorHits = countParagraphAnchorHits(draft, context);
  const sentenceAverage = averageSentenceLength(draft.chapterText);
  const mandateHits = countMandateHits(
    draft.chapterText,
    [...sourceWeaveFocus.chapterMandate, ...sourceWeaveFocus.argumentAnchors].slice(0, 6),
  );
  const missingAvailableCategories: string[] = [];
  const concerns: string[] = [];
  const integrity = auditChapterDraftIntegrity({ draft, evidence });
  let score = 100;

  if (integrity.status === "fail") {
    const blockingIssues = integrity.issues.filter(
      (issue) => issue.severity === "blocker" || issue.severity === "required",
    );
    concerns.push(...blockingIssues.map((issue) => `${issue.reason} FIND THIS: ${issue.exactText}`));
    score -= Math.min(40, blockingIssues.length * 12);
  } else if (integrity.status === "warn") {
    concerns.push(...integrity.issues.map((issue) => issue.reason));
    score -= Math.min(15, integrity.issues.length * 5);
  }

  if (chapterTarget) {
    if (draftWordCount < chapterTarget.minimumWords || draftWordCount > chapterTarget.maximumWords) {
      concerns.push("The chapter is outside its intended target band.");
      score -= 22;
    }
  }

  if (sourceCategoriesUsed < 3) {
    concerns.push("The chapter is not weaving enough upstream source types together yet.");
    score -= sourceCategoriesUsed <= 1 ? 24 : 12;
  }

  if (sourceAvailability.researchCount > 0 && draft.sourceUsage.research.length === 0) {
    missingAvailableCategories.push("research");
    concerns.push("The chapter had verified research available but did not clearly use it.");
    score -= 18;
  }

  if (sourceAvailability.externalStoryCount > 0 && draft.sourceUsage.externalStories.length === 0) {
    missingAvailableCategories.push("external story");
    concerns.push("The chapter had external stories available but did not weave one into the prose.");
    score -= 12;
  }

  if (sourceAvailability.personalStoryCount > 0 && draft.sourceUsage.personalStories.length === 0) {
    missingAvailableCategories.push("personal story");
    concerns.push("The chapter had relevant personal stories available but did not use one where it could have added authenticity.");
    score -= 12;
  }

  if (sourceAvailability.hasBaseStory && draft.sourceUsage.baseStory.length === 0) {
    missingAvailableCategories.push("base story thread");
    concerns.push("The chapter lost contact with the shared base-story thread.");
    score -= 10;
  }

  if (review.aiAuthorshipFlags.length > 0) {
    concerns.push(...review.aiAuthorshipFlags);
    score -= Math.min(30, review.aiAuthorshipFlags.length * 10);
  }

  if (review.concerns.length > 0) {
    concerns.push(...review.concerns.slice(0, 3));
    score -= Math.min(24, review.concerns.length * 6);
  }

  if (hasMetaDraftLanguage(draft.chapterText) || hasMetaDraftLanguage(draft.openingHook)) {
    concerns.push("The draft still contains meta-writing language instead of finished prose.");
    score -= 18;
  }

  if (paragraphAnchorHits < Math.max(1, Math.ceil(context.chapter.paragraphs.length / 2))) {
    concerns.push("Too few planned paragraph anchors are doing visible work in the final prose.");
    score -= 12;
  }

  if (paragraphTargetFailures > 0) {
    concerns.push(
      `${paragraphTargetFailures} planned paragraph${paragraphTargetFailures === 1 ? "" : "s"} drift materially outside their intended word-count target.`,
    );
    score -= Math.min(18, paragraphTargetFailures * 6);
  }

  if (
    mandateHits === 0 &&
    (sourceWeaveFocus.chapterMandate.length > 0 || sourceWeaveFocus.argumentAnchors.length > 0)
  ) {
    concerns.push("The chapter is not clearly carrying its intended argument or narrative mandate forward.");
    score -= 14;
  }

  if (sentenceAverage < 10 || sentenceAverage > 30) {
    concerns.push("Sentence rhythm is flattening out, which makes the chapter sound less naturally authored.");
    score -= 8;
  }

  const lengthState =
    chapterTarget == null
      ? "warn"
      : draftWordCount < chapterTarget.minimumWords || draftWordCount > chapterTarget.maximumWords
        ? "fail"
        : "pass";
  const sourceWeaveState =
    sourceCategoriesUsed >= 3 ? "pass" : sourceCategoriesUsed >= 2 ? "warn" : "fail";
  const paragraphCoverageState =
    draft.paragraphs.length === 0
      ? "fail"
      : draft.chapterText
            .split(/\n\s*\n/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean).length >= draft.paragraphs.length
        ? "pass"
        : "warn";
  const paragraphLengthState =
    paragraphTargetFailures === 0 ? "pass" : paragraphTargetFailures <= 1 ? "warn" : "fail";
  const sourceIntegrationState =
    missingAvailableCategories.length === 0 &&
    paragraphSourceNoteCoverage >= Math.max(1, Math.ceil(draft.paragraphs.length / 3))
      ? "pass"
      : missingAvailableCategories.length <= 1 && paragraphSourceNoteCoverage > 0
        ? "warn"
        : "fail";
  const argumentState =
    paragraphAnchorHits >= Math.max(1, Math.ceil(context.chapter.paragraphs.length / 2)) &&
    mandateHits > 0
      ? "pass"
      : paragraphAnchorHits > 0 || mandateHits > 0
        ? "warn"
        : "fail";
  const voiceTextureState =
    hasMetaDraftLanguage(draft.chapterText) || sentenceAverage < 10 || sentenceAverage > 30
      ? "warn"
      : "pass";
  const reviewState =
    review.verdict === "ready_for_review" && review.aiAuthorshipFlags.length === 0
      ? "pass"
      : review.verdict === "needs_revision"
        ? "fail"
        : "warn";
  const signals = [
    {
      label: "Length fit",
      state: lengthState,
      detail:
        chapterTarget == null
          ? "No chapter target is locked yet."
          : `${draftWordCount.toLocaleString()} words against a ${chapterTarget.minimumWords.toLocaleString()}-${chapterTarget.maximumWords.toLocaleString()} target band.`,
    },
    {
      label: "Source weave",
      state: sourceWeaveState,
      detail:
        sourceWeaveState === "pass"
          ? "The draft is pulling from multiple upstream artifact types."
          : sourceWeaveState === "warn"
            ? "The draft is using some upstream inputs, but the weave still looks thin."
            : "The draft is leaning on too few upstream inputs and risks feeling assembled.",
    },
    {
      label: "Paragraph coverage",
      state: paragraphCoverageState,
      detail: `${draft.paragraphs.length.toLocaleString()} planned paragraph anchors are represented in the drafted prose.`,
    },
    {
      label: "Paragraph length fit",
      state: paragraphLengthState,
      detail:
        paragraphLengthState === "pass"
          ? "Planned paragraph targets are landing inside their intended prose bands."
          : `${paragraphTargetFailures} planned paragraph${paragraphTargetFailures === 1 ? "" : "s"} still need length correction against the blueprint.`,
    },
    {
      label: "Source integration",
      state: sourceIntegrationState,
      detail:
        sourceIntegrationState === "pass"
          ? `Source-backed material is distributed across ${paragraphSourceNoteCoverage}/${draft.paragraphs.length} paragraph anchors.`
          : missingAvailableCategories.length > 0
            ? `Available categories still underused: ${missingAvailableCategories.join(", ")}.`
            : "The draft is not yet distributing evidence and story material cleanly through the chapter.",
    },
    {
      label: "Argument pressure",
      state: argumentState,
      detail:
        argumentState === "pass"
          ? `The prose is visibly carrying ${paragraphAnchorHits}/${context.chapter.paragraphs.length} planned paragraph anchors and the chapter mandate forward.`
          : argumentState === "warn"
            ? "The chapter is carrying some of the planned argumentative spine, but the throughline still needs more force."
            : "The finished prose is not yet clearly delivering the chapter's intended argument or narrative movement.",
    },
    {
      label: "Voice texture",
      state: voiceTextureState,
      detail:
        voiceTextureState === "pass"
          ? `Average sentence length sits around ${sentenceAverage} words, which supports a more naturally authored rhythm.`
          : "The prose rhythm is still flattening or slipping toward meta-writing patterns instead of sounding fully authored.",
    },
    {
      label: "Editorial review",
      state: reviewState,
      detail:
        review.aiAuthorshipFlags.length > 0
          ? `${review.aiAuthorshipFlags.length} AI-authorship flag(s) still need attention.`
          : review.overallAssessment,
    },
    {
      label: "Publication integrity",
      state: integrity.status === "pass" ? "pass" : integrity.status === "warn" ? "warn" : "fail",
      detail: integrity.status === "pass"
        ? `All used evidence IDs are admitted; ${integrity.namedAuthorities.length} named authority reference(s), ${integrity.directQuotationCount} direct quotation(s), and ${integrity.originalLanguageCount} original-language occurrence(s) cleared the continuous audit.`
        : `${integrity.issues.length} source, quotation, authority, language, repetition, or style issue(s) require attention before bulk approval.`,
    },
  ] as DraftQualityAssessment["signals"];
  const normalizedScore = Math.max(0, score);

  return {
    score: normalizedScore,
    readiness: normalizedScore >= 85 ? "strong" : normalizedScore >= 65 ? "watch" : "needs attention",
    needsRevision: integrity.status === "fail" || review.verdict === "needs_revision" || normalizedScore < 78,
    signals,
    concerns,
    integrity,
  };
}

async function generateSingleChapterDraftImpl(
  bookId: string,
  phase1StrategicBrief: Phase1StrategicBrief | null,
  promise: PromiseBrief,
  context: ChapterContext,
  baseStory: BaseStoryBundle | null,
  personalStories: PersonalStoryEncyclopedia | null,
  bookSetupProfile: BookSetupProfile | null,
  chapterTarget: ChapterWordTarget | null,
  workflowRunId?: string,
) {
  const [research, externalStories] = await Promise.all([
    getCommittedResearchDossier(bookId, context.chapter.chapterId),
    getCommittedExternalStoriesDossier(bookId, context.chapter.chapterId),
  ]);
  const baseStoryChapter = findBaseStoryChapter(baseStory, context.chapter.chapterId);
  const contextReadiness = validateQuillContextReadiness({
    phase1StrategicBrief,
    context,
    research,
    externalStories,
    personalStories,
    baseStoryChapter,
    bookSetupProfile,
  });
  if (!contextReadiness.ok) {
    throw new Error(`Quill context is not ready for ${context.chapter.chapterTitle}: ${contextReadiness.issues.join(" ")}`);
  }
  const evidence = [
    ...contextReadiness.packet.evidence.research,
    ...contextReadiness.packet.evidence.externalStories,
  ];
  const relevantPersonalStories = findPersonalStoryCards(
    personalStories,
    { chapterKey: context.chapter.chapterId, chapterTitle: context.chapter.chapterTitle },
  );
  const sourceWeaveFocus = buildSourceWeaveRequirements(
    research,
    externalStories,
    relevantPersonalStories.map((story) => ({
      title: story.title,
      summary: story.summary,
      whyItMatters: story.whyItMatters,
    })),
    baseStoryChapter,
  );
  const sourceAvailability = {
    researchCount:
      (research?.factBank.length ?? 0) +
      (research?.statistics.length ?? 0) +
      (research?.examples.length ?? 0),
    externalStoryCount: externalStories?.storyCandidates.length ?? 0,
    personalStoryCount: relevantPersonalStories.length,
    hasBaseStory: Boolean(baseStoryChapter),
  };

  const firstDraft = await generateDraft(
    phase1StrategicBrief,
    promise,
    context,
    research,
    externalStories,
    personalStories,
    baseStory,
    baseStoryChapter,
    bookSetupProfile,
    chapterTarget,
  );
  let workingDraft = firstDraft;
  let review = await reviewDraft(promise, context, workingDraft, sourceWeaveFocus, chapterTarget);
  let quality = assessNonfictionDraftQuality(
    workingDraft,
    review,
    chapterTarget,
    sourceAvailability,
    context,
    sourceWeaveFocus,
    evidence,
  );
  let revisionPasses = 0;

  for (let attempt = 0; attempt < 2 && quality.needsRevision; attempt += 1) {
    workingDraft = await reviseDraft(
      phase1StrategicBrief,
      promise,
      context,
      workingDraft,
      {
        ...review,
        verdict: "needs_revision",
        concerns: [...new Set([...review.concerns, ...quality.concerns])],
        revisionPriorities: [
          ...new Set([
            ...review.revisionPriorities,
            "Strengthen the weave between research, outside stories, personal stories, and the chapter thread.",
            "Push the chapter back toward the requested target range without sounding padded.",
            "Reduce any AI-shaped abstractions or repetitive explanatory rhythm.",
          ]),
        ],
      },
      research,
      externalStories,
      personalStories,
      baseStory,
      baseStoryChapter,
      bookSetupProfile,
      chapterTarget,
    );
    revisionPasses += 1;
    review = await reviewDraft(promise, context, workingDraft, sourceWeaveFocus, chapterTarget);
    quality = assessNonfictionDraftQuality(
      workingDraft,
      review,
      chapterTarget,
      sourceAvailability,
      context,
      sourceWeaveFocus,
      evidence,
    );
  }

  const finalDraft = await tuneDraftToTarget(
    promise,
    context,
    workingDraft,
    bookSetupProfile,
    chapterTarget,
  );
  const polishedDraft = await enforceFinishedBookProse(
    promise,
    context,
    finalDraft,
    bookSetupProfile,
  );
  review = await reviewDraft(promise, context, polishedDraft, sourceWeaveFocus, chapterTarget);
  quality = assessNonfictionDraftQuality(
    polishedDraft,
    review,
    chapterTarget,
    sourceAvailability,
    context,
    sourceWeaveFocus,
    evidence,
  );
  const finalDraftWithQuality: ChapterDraftBundle = {
    ...polishedDraft,
    quality: {
      score: quality.score,
      readiness: quality.readiness,
      needsRevision: quality.needsRevision,
      revisionPasses,
      signals: quality.signals,
      integrity: quality.integrity,
    },
  };

  const draftVersion = await createChapterArtifactVersion({
    bookId,
    artifactType: ArtifactType.CHAPTER_DRAFT,
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    summary: finalDraftWithQuality.openingHook,
    contentJson: finalDraftWithQuality as unknown as Prisma.InputJsonValue,
    contentText: finalDraftWithQuality.chapterText,
    workflowRunId,
    promptTemplateVersion: "chapter-draft-author-v1",
    modelName: resolveModelSpec("chapter-draft:author"),
  });
  const reviewVersion = await createChapterArtifactVersion({
    bookId,
    artifactType: ArtifactType.EDITORIAL_REVIEW,
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    summary: review.overallAssessment,
    contentJson: review as unknown as Prisma.InputJsonValue,
    contentText: JSON.stringify(review, null, 2),
    workflowRunId,
    promptTemplateVersion: "chapter-draft-review-v1",
    modelName: resolveModelSpec("chapter-draft:revise"),
  });

  return {
    draft: finalDraftWithQuality,
    review,
    draftVersion,
    reviewVersion,
    sourceAvailability: {
      ...sourceAvailability,
    },
  };
}

// See runChapterResearchWorkflow in research.ts for why this wrapper exists —
// tags every call this chapter makes with its chapterKey for per-chapter
// cost attribution, nested inside whatever ambient context the caller set.
export async function generateSingleChapterDraft(
  bookId: string,
  phase1StrategicBrief: Phase1StrategicBrief | null,
  promise: PromiseBrief,
  context: ChapterContext,
  baseStory: BaseStoryBundle | null,
  personalStories: PersonalStoryEncyclopedia | null,
  bookSetupProfile: BookSetupProfile | null,
  chapterTarget: ChapterWordTarget | null,
  workflowRunId?: string,
) {
  const outer = getLLMCallContext();
  const args = [
    bookId,
    phase1StrategicBrief,
    promise,
    context,
    baseStory,
    personalStories,
    bookSetupProfile,
    chapterTarget,
    workflowRunId,
  ] as const;
  if (outer) {
    return runWithLLMContext({ ...outer, chapterKey: context.chapter.chapterId }, () =>
      generateSingleChapterDraftImpl(...args),
    );
  }
  return generateSingleChapterDraftImpl(...args);
}

function isDraftInsideTargetBand(wordCount: number, chapterTarget: ChapterWordTarget | null) {
  if (!chapterTarget) {
    return true;
  }

  return wordCount >= chapterTarget.minimumWords && wordCount <= chapterTarget.maximumWords;
}

export async function expandSingleChapterDraftTowardTarget(params: {
  bookId: string;
  phase1StrategicBrief: Phase1StrategicBrief | null;
  promise: PromiseBrief;
  context: ChapterContext;
  baseStory: BaseStoryBundle | null;
  personalStories: PersonalStoryEncyclopedia | null;
  bookSetup: BookSetupProfile | null;
  chapterTarget: ChapterWordTarget | null;
}) {
  const {
    bookId,
    phase1StrategicBrief,
    promise,
    context,
    baseStory,
    personalStories,
    bookSetup,
    chapterTarget,
  } = params;
  const [research, externalStories, draftVersions, reviewVersions] = await Promise.all([
    getCommittedResearchDossier(bookId, context.chapter.chapterId),
    getCommittedExternalStoriesDossier(bookId, context.chapter.chapterId),
    getChapterArtifactVersions(bookId, context.chapter.chapterId, ArtifactType.CHAPTER_DRAFT, 1),
    getChapterArtifactVersions(bookId, context.chapter.chapterId, ArtifactType.EDITORIAL_REVIEW, 1),
  ]);

  const latestDraft = draftVersions[0]
    ? parseArtifactWithSchema(draftVersions[0].contentJson, ChapterDraftBundleSchema)
    : null;
  if (!latestDraft) {
    throw new Error(`No saved draft exists yet for ${context.chapter.chapterTitle}. Generate the chapter first.`);
  }

  if (isDraftInsideTargetBand(countWords(latestDraft.chapterText), chapterTarget)) {
    return {
      chapterKey: context.chapter.chapterId,
      chapterTitle: context.chapter.chapterTitle,
      expanded: false,
      wordCount: countWords(latestDraft.chapterText),
    };
  }

  const latestReview = reviewVersions[0]
    ? parseArtifactWithSchema(reviewVersions[0].contentJson, ChapterReviewBundleSchema)
    : null;
  const baseStoryChapter = findBaseStoryChapter(baseStory, context.chapter.chapterId);
  const readiness = validateQuillContextReadiness({
    phase1StrategicBrief,
    context,
    research,
    externalStories,
    personalStories,
    baseStoryChapter,
    bookSetupProfile: bookSetup,
  });
  if (!readiness.ok) {
    throw new Error(
      `Quill context is not ready for ${context.chapter.chapterTitle}: ${readiness.issues.join(" ")}`,
    );
  }
  const evidence = [
    ...readiness.packet.evidence.research,
    ...readiness.packet.evidence.externalStories,
  ];
  const relevantPersonalStories = findPersonalStoryCards(
    personalStories,
    { chapterKey: context.chapter.chapterId, chapterTitle: context.chapter.chapterTitle },
  );
  const sourceWeaveFocus = buildSourceWeaveRequirements(
    research,
    externalStories,
    relevantPersonalStories.map((story) => ({
      title: story.title,
      summary: story.summary,
      whyItMatters: story.whyItMatters,
    })),
    baseStoryChapter,
  );
  const sourceAvailability = {
    researchCount:
      (research?.factBank.length ?? 0) +
      (research?.statistics.length ?? 0) +
      (research?.examples.length ?? 0),
    externalStoryCount: externalStories?.storyCandidates.length ?? 0,
    personalStoryCount: relevantPersonalStories.length,
    hasBaseStory: Boolean(baseStoryChapter),
  };

  let expandedDraft = await tuneDraftToTarget(
    promise,
    context,
    latestDraft,
    bookSetup,
    chapterTarget,
  );
  expandedDraft = await enforceFinishedBookProse(
    promise,
    context,
    expandedDraft,
    bookSetup,
  );

  const review = await reviewDraft(
    promise,
    context,
    expandedDraft,
    sourceWeaveFocus,
    chapterTarget,
  );
  const quality = assessNonfictionDraftQuality(
    expandedDraft,
    review,
    chapterTarget,
    sourceAvailability,
    context,
    sourceWeaveFocus,
    evidence,
  );
  const finalDraft: ChapterDraftBundle = {
    ...expandedDraft,
    quality: {
      score: quality.score,
      readiness: quality.readiness,
      needsRevision: quality.needsRevision,
      revisionPasses: (latestDraft.quality?.revisionPasses ?? 0) + 1,
      signals: quality.signals,
      integrity: quality.integrity,
    },
  };

  await createChapterArtifactVersion({
    bookId,
    artifactType: ArtifactType.CHAPTER_DRAFT,
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    summary: finalDraft.openingHook,
    contentJson: finalDraft as unknown as Prisma.InputJsonValue,
    contentText: finalDraft.chapterText,
    promptTemplateVersion: "chapter-draft-length-recovery-v1",
    modelName: resolveModelSpec("chapter-draft:author"),
  });
  await createChapterArtifactVersion({
    bookId,
    artifactType: ArtifactType.EDITORIAL_REVIEW,
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    summary:
      latestReview?.overallAssessment ??
      review.overallAssessment,
    contentJson: review as unknown as Prisma.InputJsonValue,
    contentText: JSON.stringify(review, null, 2),
    promptTemplateVersion: "chapter-draft-length-recovery-review-v1",
    modelName: resolveModelSpec("chapter-draft:revise"),
  });

  return {
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    expanded: true,
    previousWordCount: countWords(latestDraft.chapterText),
    wordCount: countWords(finalDraft.chapterText),
  };
}

export async function runChapterDraftWorkflow(
  bookSlug: string,
  chapterKey?: string,
  chapterKeys?: string[],
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { phase1StrategicBrief, promise, chapterContexts, baseStory, personalStories, bookSetup } =
    await getDraftInputs(
      book.id,
      chapterKeys && chapterKeys.length > 0 ? chapterKeys : chapterKey ? [chapterKey] : undefined,
    );
  const chapterTargets = buildChapterWordTargets(chapterContexts, bookSetup?.targetWordCount);

  const requestedKeys = chapterKeys && chapterKeys.length > 0 ? new Set(chapterKeys) : null;
  const targetContexts = requestedKeys
    ? chapterContexts.filter((context) => requestedKeys.has(context.chapter.chapterId))
    : chapterKey
      ? chapterContexts.filter((context) => context.chapter.chapterId === chapterKey)
      : chapterContexts;

  if (targetContexts.length === 0) {
    throw new Error("No chapter contexts found for draft generation.");
  }

  const activityLog = (message: string, prior?: Array<{ at: string; message: string }>) =>
    [{ at: new Date().toISOString(), message }, ...(prior ?? [])].slice(0, 3);

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "running",
      totalChapters: targetContexts.length,
      completedChapters: 0,
      currentChapterKey: targetContexts[0]?.chapter.chapterId ?? null,
      recentActivity: activityLog(`Starting draft for ${targetContexts.length} chapter(s).`),
      lastRunAt: new Date().toISOString(),
    },
  });

  const generated = [];
  let recentActivity = activityLog(`Starting draft for ${targetContexts.length} chapter(s).`);

  for (const [index, context] of targetContexts.entries()) {
    recentActivity = activityLog(`Drafting ${context.chapter.chapterTitle}…`, recentActivity);
    await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
      status: StageStatus.IN_PROGRESS,
      metadataJson: {
        automationStatus: "running",
        totalChapters: targetContexts.length,
        completedChapters: index,
        currentChapterKey: context.chapter.chapterId,
        recentActivity,
        lastRunAt: new Date().toISOString(),
      },
    });

    const result = await generateSingleChapterDraft(
      book.id,
      phase1StrategicBrief,
      promise,
      context,
      baseStory,
      personalStories,
      bookSetup,
      chapterTargets.get(context.chapter.chapterId) ?? null,
    );

    generated.push(result);
    recentActivity = activityLog(`Finished ${context.chapter.chapterTitle}.`, recentActivity);
  }

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: StageStatus.READY_FOR_REVIEW,
    metadataJson: {
      automationStatus: "ready_for_review",
      totalChapters: targetContexts.length,
      completedChapters: targetContexts.length,
      currentChapterKey: null,
      recentActivity: activityLog("All requested chapters drafted.", recentActivity),
      lastRunAt: new Date().toISOString(),
    },
  });

  return generated;
}
