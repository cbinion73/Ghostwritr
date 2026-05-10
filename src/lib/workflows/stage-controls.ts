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

  await cancelStageWorkflow(bookSlug, stageKey);

  if (stageKey === StageKey.RESEARCH) {
    const { enqueueAndTriggerFullResearchWorkflow } = await import("./research");
    return enqueueAndTriggerFullResearchWorkflow(bookSlug, trigger);
  }

  if (stageKey === StageKey.EXTERNAL_STORIES) {
    const { enqueueAndTriggerFullExternalStoriesWorkflow } = await import("./external-stories");
    return enqueueAndTriggerFullExternalStoriesWorkflow(bookSlug, trigger);
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
  const failedChapterKeys = getFailedChapterKeys(metadata);

  if (failedChapterKeys.length === 0) {
    throw new Error(`No failed chapters are available to resume for ${stageKey}.`);
  }

  await cancelActiveWorkflowRunsForStage(book.id, stageKey, "Canceled before failed-only resume.");

  const totalChapters =
    typeof metadata.totalChapters === "number" ? metadata.totalChapters : failedChapterKeys.length;
  const priorCompleted =
    typeof metadata.completedChapters === "number" ? metadata.completedChapters : 0;
  const preservedCompletedCount = Math.max(0, Math.min(priorCompleted, totalChapters));
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
