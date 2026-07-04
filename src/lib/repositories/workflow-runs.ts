import { Prisma, StageKey, WorkflowRunStatus, WorkflowRunType } from "@prisma/client";

import { db } from "../db";
import { getStageForBook } from "./books";

export async function getActiveWorkflowRunForStage(bookId: string, stageKey: StageKey) {
  const stage = await getStageForBook(bookId, stageKey);
  if (!stage) {
    return null;
  }

  return db.workflowRun.findFirst({
    where: {
      bookId,
      stageId: stage.id,
      status: {
        in: [WorkflowRunStatus.QUEUED, WorkflowRunStatus.RUNNING],
      },
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function listActiveWorkflowRunsForStage(bookId: string, stageKey: StageKey) {
  const stage = await getStageForBook(bookId, stageKey);
  if (!stage) {
    return [];
  }

  return db.workflowRun.findMany({
    where: {
      bookId,
      stageId: stage.id,
      status: {
        in: [WorkflowRunStatus.QUEUED, WorkflowRunStatus.RUNNING],
      },
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
  });
}

/** All QUEUED/RUNNING runs for a book, any stage — powers the activity ticker. */
export async function listActiveWorkflowRunsForBook(bookId: string) {
  return db.workflowRun.findMany({
    where: {
      bookId,
      status: {
        in: [WorkflowRunStatus.QUEUED, WorkflowRunStatus.RUNNING],
      },
    },
    include: { stage: true },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
  });
}

export async function createWorkflowRun(params: {
  bookId: string;
  stageKey: StageKey;
  runType?: WorkflowRunType;
  inputJson?: Prisma.InputJsonValue;
}) {
  const stage = await getStageForBook(params.bookId, params.stageKey);

  if (!stage) {
    throw new Error(`Stage ${params.stageKey} not found for book ${params.bookId}`);
  }

  return db.workflowRun.create({
    data: {
      bookId: params.bookId,
      stageId: stage.id,
      runType: params.runType ?? WorkflowRunType.GENERAL,
      status: WorkflowRunStatus.QUEUED,
      inputJson: params.inputJson ?? {},
    },
  });
}

export async function getWorkflowRunById(runId: string) {
  return db.workflowRun.findUnique({
    where: { id: runId },
    include: {
      book: true,
      stage: true,
    },
  });
}

export async function claimWorkflowRun(runId: string) {
  return db.workflowRun.updateMany({
    where: {
      id: runId,
      status: WorkflowRunStatus.QUEUED,
    },
    data: {
      status: WorkflowRunStatus.RUNNING,
      startedAt: new Date(),
    },
  });
}

export async function completeWorkflowRun(runId: string, outputJson?: Prisma.InputJsonValue) {
  return db.workflowRun.update({
    where: { id: runId },
    data: {
      status: WorkflowRunStatus.SUCCEEDED,
      outputJson: outputJson ?? {},
      finishedAt: new Date(),
      errorText: null,
    },
  });
}

export async function failWorkflowRun(runId: string, errorText: string, outputJson?: Prisma.InputJsonValue) {
  return db.workflowRun.update({
    where: { id: runId },
    data: {
      status: WorkflowRunStatus.FAILED,
      outputJson: outputJson ?? {},
      finishedAt: new Date(),
      errorText,
    },
  });
}

export async function cancelWorkflowRun(
  runId: string,
  errorText?: string,
  outputJson?: Prisma.InputJsonValue,
) {
  return db.workflowRun.update({
    where: { id: runId },
    data: {
      status: WorkflowRunStatus.CANCELED,
      outputJson: outputJson ?? {},
      finishedAt: new Date(),
      errorText: errorText ?? "Canceled by user.",
    },
  });
}

export async function cancelActiveWorkflowRunsForStage(
  bookId: string,
  stageKey: StageKey,
  errorText?: string,
) {
  const activeRuns = await listActiveWorkflowRunsForStage(bookId, stageKey);
  if (activeRuns.length === 0) {
    return [];
  }

  await Promise.all(
    activeRuns.map((run) =>
      cancelWorkflowRun(run.id, errorText ?? "Canceled by user.", {
        kind: "workflow_canceled",
        stageKey,
      }),
    ),
  );

  return activeRuns;
}
