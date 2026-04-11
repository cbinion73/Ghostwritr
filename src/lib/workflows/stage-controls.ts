import { Prisma, StageKey, StageStatus } from "@prisma/client";

import { getOrCreateBookBySlug, getStageForBook, updateStageForBook } from "../repositories/books";
import { cancelActiveWorkflowRunsForStage } from "../repositories/workflow-runs";
import { enqueueAndTriggerBaseStoryWorkflow } from "./base-story";
import { enqueueAndTriggerFullExternalStoriesWorkflow } from "./external-stories";
import { enqueueAndTriggerFullResearchWorkflow } from "./research";

function parseMetadata(value: unknown) {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return {};
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
  const book = await getOrCreateBookBySlug(bookSlug);
  const stage = await getStageForBook(book.id, stageKey);
  const metadata = parseMetadata(stage?.metadataJson);

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
  await cancelStageWorkflow(bookSlug, stageKey);

  if (stageKey === StageKey.RESEARCH) {
    return enqueueAndTriggerFullResearchWorkflow(bookSlug, trigger);
  }

  if (stageKey === StageKey.EXTERNAL_STORIES) {
    return enqueueAndTriggerFullExternalStoriesWorkflow(bookSlug, trigger);
  }

  if (stageKey === StageKey.BASE_STORY) {
    return enqueueAndTriggerBaseStoryWorkflow(bookSlug, trigger);
  }

  throw new Error(`Retry is not implemented for stage ${stageKey}.`);
}

export async function resumeFailedStageWorkflow(
  bookSlug: string,
  stageKey: StageKey,
  trigger: (runId: string) => void,
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const stage = await getStageForBook(book.id, stageKey);
  const metadata = parseMetadata(stage?.metadataJson);
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
    return enqueueAndTriggerFullResearchWorkflow(bookSlug, trigger, {
      chapterKeys: failedChapterKeys,
      preserveCompletedCount: Math.min(preservedCompletedCount, totalChapters),
      preserveProvisionalChapters,
    });
  }

  if (stageKey === StageKey.EXTERNAL_STORIES) {
    return enqueueAndTriggerFullExternalStoriesWorkflow(bookSlug, trigger, {
      chapterKeys: failedChapterKeys,
      preserveCompletedCount: Math.min(preservedCompletedCount, totalChapters),
      preserveProvisionalChapters,
    });
  }

  throw new Error(`Resume failed is not implemented for stage ${stageKey}.`);
}
