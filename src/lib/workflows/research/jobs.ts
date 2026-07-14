import { Prisma, StageKey, StageStatus, WorkflowRunStatus } from "@prisma/client";

import {
  claimWorkflowRun,
  completeWorkflowRun,
  getActiveWorkflowRunForStage,
  createWorkflowRun,
  failWorkflowRun,
  getWorkflowRunById,
  startWorkflowRunHeartbeat,
} from "../../repositories/workflow-runs";
import { getOrCreateBookBySlug, updateStageForBook } from "../../repositories/books";
import { getLatestResearchPackVersionsByChapter } from "../../repositories/research-artifacts";
import { runQualityAgentWorkflow } from "../quality-agent";
import { getResearchChapterSeeds } from "./chapter-seeds";
import { runFullResearchWorkflow } from "./execution";

export type EnqueueResearchOptions = {
  chapterKeys?: string[];
  preserveCompletedCount?: number;
  preserveProvisionalChapters?: string[];
};

function recentActivity(
  entries: Array<{ at: string; message: string }> | undefined,
  message: string,
) {
  return [{ at: new Date().toISOString(), message }, ...(entries ?? [])].slice(0, 3);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

// Ground truth for "what still needs work" — a chapter with no saved
// dossier version yet either failed outright or was simply never reached
// (e.g. the run died mid-flight without marking it failed, the exact gap
// that let an orphaned run's remaining chapters go unrecovered). Checking
// actual saved versions rather than trusting only the in-memory
// failedChapters list means resume can't miss chapters silently dropped
// by a dead run.
export async function getUnfinishedResearchChapterKeys(bookId: string): Promise<string[]> {
  const { chapterSeeds } = await getResearchChapterSeeds(bookId);
  if (chapterSeeds.length === 0) return [];

  const latestVersionsByChapter = await getLatestResearchPackVersionsByChapter(
    bookId,
    chapterSeeds.map((chapter) => chapter.chapterKey),
  );

  return chapterSeeds
    .filter((chapter) => !latestVersionsByChapter.has(chapter.chapterKey))
    .map((chapter) => chapter.chapterKey);
}

export async function enqueueFullResearchWorkflow(
  bookSlug: string,
  options: EnqueueResearchOptions = {},
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const existingRun = await getActiveWorkflowRunForStage(book.id, StageKey.RESEARCH);

  if (existingRun) {
    return existingRun;
  }

  const { chapterSeeds } = await getResearchChapterSeeds(book.id);

  if (chapterSeeds.length === 0) {
    throw new Error("No committed outline chapters are available for research generation.");
  }

  const requestedChapterKeys = new Set(options.chapterKeys ?? []);
  const targetChapterSeeds =
    requestedChapterKeys.size > 0
      ? chapterSeeds.filter((chapter) => requestedChapterKeys.has(chapter.chapterKey))
      : chapterSeeds;

  if (targetChapterSeeds.length === 0) {
    throw new Error("No matching failed research chapters were found to resume.");
  }

  await updateStageForBook(book.id, StageKey.RESEARCH, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "queued",
      currentAction: "Queued for background processing",
      totalChapters: chapterSeeds.length,
      completedChapters: options.preserveCompletedCount ?? 0,
      failedChapters: [],
      provisionalChapters: options.preserveProvisionalChapters ?? [],
      currentChapterKey: targetChapterSeeds[0]?.chapterKey ?? null,
      recentActivity: recentActivity(
        undefined,
        requestedChapterKeys.size > 0
          ? `Queued failed-only research resume for ${targetChapterSeeds.length} chapter${targetChapterSeeds.length === 1 ? "" : "s"}.`
          : "Queued full research run.",
      ),
      lastRunAt: new Date().toISOString(),
    } as Prisma.InputJsonValue,
  });

  return createWorkflowRun({
    bookId: book.id,
    stageKey: StageKey.RESEARCH,
    inputJson: {
      kind: "full_research_generation",
      bookSlug,
      chapterKeys: targetChapterSeeds.map((chapter) => chapter.chapterKey),
      preserveCompletedCount: options.preserveCompletedCount ?? 0,
      preserveProvisionalChapters: options.preserveProvisionalChapters ?? [],
    },
  });
}

export async function enqueueAndTriggerFullResearchWorkflow(
  bookSlug: string,
  trigger: (runId: string) => void,
  options: EnqueueResearchOptions = {},
) {
  const queuedRun = await enqueueFullResearchWorkflow(bookSlug, options);
  if (queuedRun.status === WorkflowRunStatus.QUEUED) {
    trigger(queuedRun.id);
  }
  return queuedRun;
}

export async function processWorkflowRun(runId: string) {
  const run = await getWorkflowRunById(runId);

  if (!run) {
    throw new Error(`Workflow run ${runId} was not found.`);
  }

  const claimed = await claimWorkflowRun(runId);
  if (claimed.count === 0) {
    return { skipped: true };
  }
  const stopHeartbeat = startWorkflowRunHeartbeat(runId, claimed.leaseOwner, claimed.leaseMs);

  const input = parseJson<Record<string, unknown>>(run.inputJson, {});
  const bookSlug =
    typeof input.bookSlug === "string" ? input.bookSlug : run.book.slug;
  const chapterKeys = Array.isArray(input.chapterKeys)
    ? input.chapterKeys.filter((value): value is string => typeof value === "string")
    : undefined;
  const preserveCompletedCount =
    typeof input.preserveCompletedCount === "number" ? input.preserveCompletedCount : 0;
  const preserveProvisionalChapters = Array.isArray(input.preserveProvisionalChapters)
    ? input.preserveProvisionalChapters.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  try {
    const result = await runFullResearchWorkflow(bookSlug, runId, {
      chapterKeys,
      preserveCompletedCount,
      preserveProvisionalChapters,
    });
    if ((result as { canceled?: boolean }).canceled) {
      return result;
    }
    await completeWorkflowRun(runId, result as unknown as Prisma.InputJsonValue);
    await runQualityAgentWorkflow(bookSlug);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workflow error";
    await failWorkflowRun(runId, message, {
      kind: "full_research_generation_failed",
      bookSlug,
    });
    await runQualityAgentWorkflow(bookSlug);
    throw error;
  } finally {
    stopHeartbeat();
  }
}
