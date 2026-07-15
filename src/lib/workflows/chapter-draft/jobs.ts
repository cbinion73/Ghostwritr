import {
  ArtifactType,
  Prisma,
  StageKey,
  StageStatus,
  WorkflowRunStatus,
} from "@prisma/client";

import {
  claimWorkflowRun,
  completeWorkflowRun,
  createWorkflowRun,
  failWorkflowRun,
  getActiveWorkflowRunForStage,
  getWorkflowRunById,
  startWorkflowRunHeartbeat,
} from "../../repositories/workflow-runs";
import {
  getBookBySlugOrThrow,
  updateStageForBook,
} from "../../repositories/books";
import {
  getChapterArtifactVersions,
} from "../../repositories/chapter-draft-artifacts";
import {
  getDraftInputs,
} from "./context";
import {
  runChapterDraftWorkflow,
} from "./execution";

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

// Ground truth for "what still needs drafting" — same reasoning as
// getUnfinishedResearchChapterKeys in research/jobs.ts: a chapter a dead run
// never reached isn't recorded anywhere in stage metadata, so resume must
// check actual saved versions rather than trust in-memory progress state.
export async function getUnfinishedChapterDraftChapterKeys(bookId: string): Promise<string[]> {
  const { chapterContexts } = await getDraftInputs(bookId);
  const results = await Promise.all(
    chapterContexts.map(async (context) => {
      const versions = await getChapterArtifactVersions(
        bookId,
        context.chapter.chapterId,
        ArtifactType.CHAPTER_DRAFT,
        1,
      );
      return versions.length === 0 ? context.chapter.chapterId : null;
    }),
  );
  return results.filter((key): key is string => key !== null);
}

export async function enqueueChapterDraftWorkflow(
  bookSlug: string,
  chapterKey?: string,
  chapterKeys?: string[],
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const existing = await getActiveWorkflowRunForStage(book.id, StageKey.CHAPTER_DRAFT);
  if (existing) {
    return existing;
  }

  const targetKeys = chapterKeys && chapterKeys.length > 0 ? chapterKeys : chapterKey ? [chapterKey] : undefined;
  const { chapterContexts } = await getDraftInputs(book.id, targetKeys);
  const targetCount =
    chapterKeys && chapterKeys.length > 0
      ? chapterKeys.length
      : chapterKey
        ? 1
        : chapterContexts.length;

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "queued",
      totalChapters: targetCount,
      completedChapters: 0,
      currentChapterKey: chapterKeys?.[0] ?? chapterKey ?? null,
      lastRunAt: new Date().toISOString(),
    },
  });

  return createWorkflowRun({
    bookId: book.id,
    stageKey: StageKey.CHAPTER_DRAFT,
    inputJson: {
      kind: "chapter_draft_generation",
      bookSlug,
      chapterKey: chapterKey ?? null,
      chapterKeys: chapterKeys ?? null,
    },
  });
}

export async function processChapterDraftWorkflowRun(runId: string) {
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
  const bookSlug = typeof input.bookSlug === "string" ? input.bookSlug : run.book.slug;
  const chapterKey = typeof input.chapterKey === "string" ? input.chapterKey : undefined;
  const chapterKeys = Array.isArray(input.chapterKeys)
    ? input.chapterKeys.filter((key): key is string => typeof key === "string")
    : undefined;

  try {
    const result = await runChapterDraftWorkflow(bookSlug, chapterKey, chapterKeys);
    await completeWorkflowRun(runId, result as unknown as Prisma.InputJsonValue);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chapter draft workflow error";
    await updateStageForBook(run.bookId, StageKey.CHAPTER_DRAFT, {
      status: StageStatus.BLOCKED,
      metadataJson: {
        automationStatus: "blocked",
        totalChapters:
          typeof input.chapterKey === "string" ? 1 : null,
        completedChapters: 0,
        currentChapterKey: null,
        lastRunAt: new Date().toISOString(),
        errorMessage: message,
      },
    });
    await failWorkflowRun(runId, message, {
      kind: "chapter_draft_generation_failed",
      bookSlug,
      chapterKey: chapterKey ?? null,
    });
    throw error;
  } finally {
    stopHeartbeat();
  }
}

export async function enqueueAndTriggerChapterDraftWorkflow(
  bookSlug: string,
  trigger: (runId: string) => void,
  chapterKey?: string,
  chapterKeys?: string[],
) {
  const queued = await enqueueChapterDraftWorkflow(bookSlug, chapterKey, chapterKeys);
  if (queued.status === WorkflowRunStatus.QUEUED) {
    trigger(queued.id);
  }

  return queued;
}
