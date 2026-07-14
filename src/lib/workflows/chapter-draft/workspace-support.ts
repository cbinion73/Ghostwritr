import type { ChapterApprovalState } from "@prisma/client";

import type { BookSetupProfile } from "../../book-setup-types";
import type { QuillContextPacket } from "../../quill-context-contract";
import type { ChapterExternalStoryDossier } from "../../external-story-types";
import { countWords, estimatePagesFromWords, toPercent } from "../../manuscript-metrics";
import type { ChapterResearchDossier } from "../../research-types";
import type { BaseStoryChapter } from "../../base-story-types";
import type { CompactPersonalStoryCard } from "../../personal-story-contract";
import type { ChapterContext } from "./context";

export type ChapterWordTargetProjection = {
  targetWords: number;
  minimumWords: number;
  maximumWords: number;
};

export type ChapterWordTarget = ChapterWordTargetProjection & {
  chapterKey: string;
  weight: number;
};

export type QuillContextReadinessProjection = {
  ok: boolean;
  issues: string[];
  packet: QuillContextPacket;
};

function countDescriptionWords(value: string | null | undefined) {
  return value?.split(/\s+/).filter(Boolean).length ?? 0;
}

function roundToNearestTwentyFive(value: number) {
  return Math.max(250, Math.round(value / 25) * 25);
}

function calculateChapterTargetWeights(chapterContexts: ChapterContext[]) {
  return chapterContexts.map((context) => {
    const paragraphCount = Math.max(1, context.chapter.paragraphs.length);
    const chapterDescriptionWords = countDescriptionWords(context.chapter.chapterDescription);
    const sectionDescriptionWords = countDescriptionWords(context.section.sectionDescription);
    const chapterTitleWords = countDescriptionWords(context.chapter.chapterTitle);

    const weight =
      1 +
      paragraphCount * 0.7 +
      chapterDescriptionWords * 0.045 +
      sectionDescriptionWords * 0.015 +
      chapterTitleWords * 0.1;

    return {
      chapterKey: context.chapter.chapterId,
      weight,
    };
  });
}

export function buildChapterWordTargets(
  chapterContexts: ChapterContext[],
  totalTargetWordCount: number | null | undefined,
) {
  if (!totalTargetWordCount || chapterContexts.length === 0) {
    return new Map<string, ChapterWordTarget>();
  }

  const weighted = calculateChapterTargetWeights(chapterContexts);
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);

  const provisional = weighted.map((entry) => {
    const exactTarget = (entry.weight / totalWeight) * totalTargetWordCount;
    return {
      ...entry,
      exactTarget,
      roundedTarget: roundToNearestTwentyFive(exactTarget),
    };
  });

  let difference =
    totalTargetWordCount - provisional.reduce((sum, entry) => sum + entry.roundedTarget, 0);
  if (difference !== 0) {
    const direction = difference > 0 ? 25 : -25;
    const ordered = [...provisional].sort((a, b) =>
      direction > 0
        ? b.exactTarget - b.roundedTarget - (a.exactTarget - a.roundedTarget)
        : a.exactTarget - a.roundedTarget - (b.exactTarget - b.roundedTarget),
    );

    let index = 0;
    while (difference !== 0 && ordered.length > 0 && index < 5000) {
      const candidate = ordered[index % ordered.length];
      const nextTarget = candidate.roundedTarget + direction;
      if (nextTarget >= 250) {
        candidate.roundedTarget = nextTarget;
        difference -= direction;
      }
      index += 1;
    }
  }

  return new Map<string, ChapterWordTarget>(
    provisional.map((entry) => {
      const tolerance = Math.max(250, Math.round(entry.roundedTarget * 0.16));
      return [
        entry.chapterKey,
        {
          chapterKey: entry.chapterKey,
          targetWords: entry.roundedTarget,
          minimumWords: Math.max(250, entry.roundedTarget - tolerance),
          maximumWords: entry.roundedTarget + tolerance,
          weight: entry.weight,
        },
      ];
    }),
  );
}

export function buildChapterDraftMetrics(input: {
  chapterText?: string | null;
  bookSetup?: Pick<BookSetupProfile, "trimSize"> | null;
  chapterTarget?: ChapterWordTargetProjection | null;
}) {
  const wordCount = countWords(input.chapterText);
  const pageCount = estimatePagesFromWords(
    wordCount,
    input.bookSetup?.trimSize ?? "6 x 9 in",
  );

  return {
    wordCount,
    pageCount,
    targetWords: input.chapterTarget?.targetWords ?? null,
    minimumWords: input.chapterTarget?.minimumWords ?? null,
    maximumWords: input.chapterTarget?.maximumWords ?? null,
    deltaFromTarget:
      input.chapterTarget != null ? wordCount - input.chapterTarget.targetWords : null,
  };
}

export function buildChapterDraftSourceAvailability(input: {
  research?: ChapterResearchDossier | null;
  externalStories?: ChapterExternalStoryDossier | null;
  personalStories?: CompactPersonalStoryCard[] | null;
  baseStoryChapter?: BaseStoryChapter | null;
}) {
  return {
    researchCount:
      (input.research?.factBank.length ?? 0) +
      (input.research?.statistics.length ?? 0) +
      (input.research?.examples.length ?? 0),
    externalStoryCount: input.externalStories?.storyCandidates.length ?? 0,
    personalStoryCount: input.personalStories?.length ?? 0,
    hasBaseStory: Boolean(input.baseStoryChapter),
  };
}

export function projectChapterDraftApprovalState(
  approvalState?: Pick<
    ChapterApprovalState,
    | "status"
    | "draftPendingVersionId"
    | "approvedDraftVersionId"
    | "isStale"
    | "staleReason"
  > | null,
) {
  if (!approvalState) {
    return null;
  }

  return {
    status: approvalState.status,
    draftPendingVersionId: approvalState.draftPendingVersionId,
    approvedDraftVersionId: approvalState.approvedDraftVersionId,
    isStale: approvalState.isStale,
    staleReason: approvalState.staleReason,
  };
}

export function summarizeQuillContextForAuthor(readiness: QuillContextReadinessProjection) {
  const packet = readiness.packet;
  return {
    ready: readiness.ok,
    issues: readiness.issues,
    approvedBrief: {
      present: packet.approvedBrief.approved,
      summary: packet.approvedBrief.summary,
    },
    paragraphOutline: {
      current: packet.paragraphOutline.current,
      paragraphCount: packet.paragraphOutline.paragraphs.length,
      anchors: packet.paragraphOutline.paragraphs.slice(0, 6).map((paragraph) => ({
        id: paragraph.id,
        topicSentence: paragraph.topicSentence,
        purpose: paragraph.purpose,
      })),
    },
    baseStoryGuidance: {
      present: packet.baseStoryGuidance.present,
      draftingInstruction: packet.baseStoryGuidance.draftingInstruction,
    },
    evidence: {
      researchCount: packet.evidence.research.length,
      externalStoryCount: packet.evidence.externalStories.length,
      researchTitles: packet.evidence.research.slice(0, 4).map((record) => record.claimOrStory),
      externalStoryTitles: packet.evidence.externalStories.slice(0, 4).map((record) => record.title),
    },
    personalStories: {
      count: packet.personalStories.length,
      titles: packet.personalStories.map((story) => story.title),
    },
    voiceGuide: {
      present: packet.voiceGuide.present,
      dominantPersona: packet.voiceGuide.dominantPersona,
      guidance: packet.voiceGuide.guidance.slice(0, 5),
    },
    craftNotes: {
      count: packet.craftNotes.length,
      notes: packet.craftNotes.slice(0, 5),
    },
  };
}

export function buildChapterDraftProgress(input: {
  metadata: Record<string, unknown>;
  entryCount: number;
  totalWords: number;
  totalPages: number;
  targetWordCount?: number | null;
  targetPageCount?: number | null;
  completedChapterCount: number;
}) {
  return {
    automationStatus:
      typeof input.metadata.automationStatus === "string" ? input.metadata.automationStatus : "idle",
    totalChapters:
      typeof input.metadata.totalChapters === "number" ? input.metadata.totalChapters : input.entryCount,
    completedChapters:
      typeof input.metadata.completedChapters === "number" ? input.metadata.completedChapters : 0,
    currentChapterKey:
      typeof input.metadata.currentChapterKey === "string" ? input.metadata.currentChapterKey : null,
    wordsWritten: input.totalWords,
    pagesWritten: input.totalPages,
    targetWordCount: input.targetWordCount ?? null,
    targetPageCount: input.targetPageCount ?? null,
    chapterCompletionPercent: toPercent(
      input.completedChapterCount,
      input.entryCount,
    ),
    wordCompletionPercent: input.targetWordCount ? toPercent(input.totalWords, input.targetWordCount) : 0,
  };
}
