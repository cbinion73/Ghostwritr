import { Prisma, StageKey, StageStatus } from "@prisma/client";

import { parseMetadataRecord } from "../artifact-schemas";
import { getBookBySlugOrThrow, getStageForBook, updateStageForBook } from "../repositories/books";
import { cancelActiveWorkflowRunsForStage } from "../repositories/workflow-runs";

const RETRYABLE_STAGES = new Set<StageKey>([
  StageKey.BASE_STORY,
  StageKey.RESEARCH,
  StageKey.EXTERNAL_STORIES,
]);

const RESUMABLE_STAGES = new Set<StageKey>([StageKey.RESEARCH, StageKey.EXTERNAL_STORIES]);

export function getStageControlCapabilities(stageKey?: StageKey | null) {
  if (!stageKey) {
    return {
      canCancel: false,
      canRetry: false,
      canResumeFailed: false,
    };
  }

  return {
    canCancel: RETRYABLE_STAGES.has(stageKey),
    canRetry: RETRYABLE_STAGES.has(stageKey),
    canResumeFailed: RESUMABLE_STAGES.has(stageKey),
  };
}

function getFailedChapterKeys(metadata: Record<string, unknown>) {
  if (!Array.isArray(metadata.failedChapters)) {
    return [];
  }

  return metadata.failedChapters
    .map((entry) => {
      if (entry && typeof entry === "object" && "chapterKey" in entry) {
        const chapterKey = entry.chapterKey;
        return typeof chapterKey === "string" ? chapterKey : null;
      }

      return null;
    })
    .filter((value): value is string => Boolean(value));
}

function getProvisionalChapterKeys(metadata: Record<string, unknown>) {
  if (!Array.isArray(metadata.provisionalChapters)) {
    return [];
  }

  return metadata.provisionalChapters.filter(
    (entry): entry is string => typeof entry === "string",
  );
}

// A chapter a dead run never reached is never recorded in failedChapters —
// nothing threw, the process just stopped existing mid-loop. Trusting only
// that in-memory list means those chapters get silently skipped forever on
// resume. Union it with the ground truth (which chapters actually have a
// saved version) so recovery always covers everything still outstanding,
// not just what happened to error out cleanly before the run died.
async function getChaptersNeedingRecovery(
  bookId: string,
  stageKey: StageKey,
  metadata: Record<string, unknown>,
): Promise<string[]> {
  const failedChapterKeys = getFailedChapterKeys(metadata);

  if (stageKey === StageKey.RESEARCH) {
    const { getUnfinishedResearchChapterKeys } = await import("./research");
    const unfinished = await getUnfinishedResearchChapterKeys(bookId);
    return Array.from(new Set([...failedChapterKeys, ...unfinished]));
  }

  if (stageKey === StageKey.EXTERNAL_STORIES) {
    const { getUnfinishedExternalStoriesChapterKeys } = await import("./external-stories");
    const unfinished = await getUnfinishedExternalStoriesChapterKeys(bookId);
    return Array.from(new Set([...failedChapterKeys, ...unfinished]));
  }

  return failedChapterKeys;
}

export async function cancelStageWorkflow(bookSlug: string, stageKey: StageKey) {
  const capabilities = getStageControlCapabilities(stageKey);
  if (!capabilities.canCancel) {
    throw new Error(`Stop is not implemented for stage ${stageKey}.`);
  }

  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, stageKey);
  const metadata = parseMetadataRecord(stage?.metadataJson);

  await cancelActiveWorkflowRunsForStage(book.id, stageKey, "Canceled by user.");
  await updateStageForBook(book.id, stageKey, {
    status: StageStatus.BLOCKED,
    metadataJson: {
      ...metadata,
      automationStatus: "canceled",
      currentChapterKey: null,
      lastRunAt: new Date().toISOString(),
    } as Prisma.InputJsonValue,
  });

  return { book, stage };
}

export async function retryStageWorkflow(
  bookSlug: string,
  stageKey: StageKey,
  trigger: (runId: string) => void,
) {
  const capabilities = getStageControlCapabilities(stageKey);
  if (!capabilities.canRetry) {
    throw new Error(`Retry is not implemented for stage ${stageKey}.`);
  }

  const book = await getBookBySlugOrThrow(bookSlug);
  const stageBeforeCancel = await getStageForBook(book.id, stageKey);
  const metadata = parseMetadataRecord(stageBeforeCancel?.metadataJson);

  await cancelStageWorkflow(bookSlug, stageKey);

  // Research and External Stories are chapter-scoped — resume only the
  // chapters actually still outstanding (failed, or never reached because
  // the prior run died) instead of redoing completed chapters and burning
  // tokens on work that's already saved.
  if (stageKey === StageKey.RESEARCH || stageKey === StageKey.EXTERNAL_STORIES) {
    const chapterKeys = await getChaptersNeedingRecovery(book.id, stageKey, metadata);
    const totalChapters =
      typeof metadata.totalChapters === "number" ? metadata.totalChapters : chapterKeys.length;
    const priorCompleted =
      typeof metadata.completedChapters === "number" ? metadata.completedChapters : 0;
    const preserveCompletedCount = Math.max(
      0,
      Math.min(totalChapters - chapterKeys.length, priorCompleted),
    );
    const preserveProvisionalChapters = getProvisionalChapterKeys(metadata).filter(
      (chapterKey) => !chapterKeys.includes(chapterKey),
    );

    if (stageKey === StageKey.RESEARCH) {
      const { enqueueAndTriggerFullResearchWorkflow } = await import("./research");
      return enqueueAndTriggerFullResearchWorkflow(bookSlug, trigger, {
        chapterKeys,
        preserveCompletedCount,
        preserveProvisionalChapters,
      });
    }

    const { enqueueAndTriggerFullExternalStoriesWorkflow } = await import("./external-stories");
    return enqueueAndTriggerFullExternalStoriesWorkflow(bookSlug, trigger, {
      chapterKeys,
      preserveCompletedCount,
      preserveProvisionalChapters,
    });
  }

  if (stageKey === StageKey.BASE_STORY) {
    const { enqueueAndTriggerBaseStoryWorkflow } = await import("./base-story");
    return enqueueAndTriggerBaseStoryWorkflow(bookSlug, trigger);
  }
  throw new Error(`Retry is not implemented for stage ${stageKey}.`);
}

export async function resumeFailedStageWorkflow(
  bookSlug: string,
  stageKey: StageKey,
  trigger: (runId: string) => void,
) {
  const capabilities = getStageControlCapabilities(stageKey);
  if (!capabilities.canResumeFailed) {
    throw new Error(`Resume failed is not implemented for stage ${stageKey}.`);
  }

  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, stageKey);
  const metadata = parseMetadataRecord(stage?.metadataJson);
  const failedChapterKeys = await getChaptersNeedingRecovery(book.id, stageKey, metadata);

  if (failedChapterKeys.length === 0) {
    throw new Error(`No failed chapters are available to resume for ${stageKey}.`);
  }

  await cancelActiveWorkflowRunsForStage(book.id, stageKey, "Canceled before failed-only resume.");

  const totalChapters =
    typeof metadata.totalChapters === "number" ? metadata.totalChapters : failedChapterKeys.length;
  const priorCompleted =
    typeof metadata.completedChapters === "number" ? metadata.completedChapters : 0;
  const preservedCompletedCount = Math.max(
    0,
    Math.min(totalChapters - failedChapterKeys.length, priorCompleted),
  );
  const preserveProvisionalChapters = getProvisionalChapterKeys(metadata).filter(
    (chapterKey) => !failedChapterKeys.includes(chapterKey),
  );

  if (stageKey === StageKey.RESEARCH) {
    const { enqueueAndTriggerFullResearchWorkflow } = await import("./research");
    return enqueueAndTriggerFullResearchWorkflow(bookSlug, trigger, {
      chapterKeys: failedChapterKeys,
      preserveCompletedCount: Math.min(preservedCompletedCount, totalChapters),
      preserveProvisionalChapters,
    });
  }

  if (stageKey === StageKey.EXTERNAL_STORIES) {
    const { enqueueAndTriggerFullExternalStoriesWorkflow } = await import("./external-stories");
    return enqueueAndTriggerFullExternalStoriesWorkflow(bookSlug, trigger, {
      chapterKeys: failedChapterKeys,
      preserveCompletedCount: Math.min(preservedCompletedCount, totalChapters),
      preserveProvisionalChapters,
    });
  }

  throw new Error(`Resume failed is not implemented for stage ${stageKey}.`);
}
