import { Prisma, StageKey, WorkflowRunStatus, WorkflowRunType } from "@prisma/client";

import { db } from "../db";
import { getStageForBook } from "./books";

const DEFAULT_WORKFLOW_LEASE_MS = 60_000;
const DEFAULT_WORKFLOW_HEARTBEAT_MS = 15_000;

function newLeaseOwner() {
  return `worker_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function leaseExpiresAt(leaseMs: number) {
  return new Date(Date.now() + leaseMs);
}

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
  idempotencyKey?: string;
  maxAttempts?: number;
}) {
  const stage = await getStageForBook(params.bookId, params.stageKey);

  if (!stage) {
    throw new Error(`Stage ${params.stageKey} not found for book ${params.bookId}`);
  }

  if (params.idempotencyKey) {
    const existing = await db.workflowRun.findUnique({
      where: {
        bookId_stageId_idempotencyKey: {
          bookId: params.bookId,
          stageId: stage.id,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });
    if (existing) return existing;
  }

  return db.workflowRun.create({
    data: {
      bookId: params.bookId,
      stageId: stage.id,
      runType: params.runType ?? WorkflowRunType.GENERAL,
      status: WorkflowRunStatus.QUEUED,
      inputJson: params.inputJson ?? {},
      idempotencyKey: params.idempotencyKey,
      maxAttempts: Math.max(1, params.maxAttempts ?? 1),
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

export async function claimWorkflowRun(
  runId: string,
  options: {
    leaseMs?: number;
    leaseOwner?: string;
  } = {},
) {
  const now = new Date();
  const leaseMs = Math.max(1_000, options.leaseMs ?? DEFAULT_WORKFLOW_LEASE_MS);
  const leaseOwner = options.leaseOwner ?? newLeaseOwner();
  return db.workflowRun.updateMany({
    where: {
      id: runId,
      attempt: { lt: db.workflowRun.fields.maxAttempts },
      OR: [
        { status: WorkflowRunStatus.QUEUED },
        {
          status: WorkflowRunStatus.RUNNING,
          leaseExpiresAt: { lt: now },
        },
      ],
    },
    data: {
      status: WorkflowRunStatus.RUNNING,
      attempt: { increment: 1 },
      leaseOwner,
      leaseExpiresAt: leaseExpiresAt(leaseMs),
      heartbeatAt: now,
      startedAt: now,
    },
  }).then((result) => ({ ...result, leaseOwner, leaseMs }));
}

export async function heartbeatWorkflowRun(
  runId: string,
  leaseOwner: string,
  leaseMs = DEFAULT_WORKFLOW_LEASE_MS,
) {
  const now = new Date();
  return db.workflowRun.updateMany({
    where: {
      id: runId,
      status: WorkflowRunStatus.RUNNING,
      leaseOwner,
    },
    data: {
      heartbeatAt: now,
      leaseExpiresAt: leaseExpiresAt(leaseMs),
    },
  });
}

export function startWorkflowRunHeartbeat(
  runId: string,
  leaseOwner: string,
  leaseMs = DEFAULT_WORKFLOW_LEASE_MS,
  intervalMs = DEFAULT_WORKFLOW_HEARTBEAT_MS,
) {
  const timer = setInterval(() => {
    void heartbeatWorkflowRun(runId, leaseOwner, leaseMs).catch(() => {
      // Heartbeats are best-effort. The next heartbeat or stale-run recovery
      // will reconcile if this update fails transiently.
    });
  }, Math.min(intervalMs, Math.max(1_000, Math.floor(leaseMs / 2))));
  timer.unref?.();
  return () => clearInterval(timer);
}

export async function recoverExpiredWorkflowRuns(now = new Date()) {
  const failed = await db.workflowRun.updateMany({
    where: {
      status: WorkflowRunStatus.RUNNING,
      leaseExpiresAt: { lt: now },
      attempt: { gte: db.workflowRun.fields.maxAttempts },
    },
    data: {
      status: WorkflowRunStatus.FAILED,
      finishedAt: now,
      errorText: "Workflow run lease expired and max attempts were exhausted.",
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });

  const requeued = await db.workflowRun.updateMany({
    where: {
      status: WorkflowRunStatus.RUNNING,
      leaseExpiresAt: { lt: now },
      attempt: { lt: db.workflowRun.fields.maxAttempts },
    },
    data: {
      status: WorkflowRunStatus.QUEUED,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      errorText: "Workflow run lease expired; requeued for recovery.",
    },
  });

  return { failed: failed.count, requeued: requeued.count };
}

export async function completeWorkflowRun(runId: string, outputJson?: Prisma.InputJsonValue) {
  return db.workflowRun.update({
    where: { id: runId },
    data: {
      status: WorkflowRunStatus.SUCCEEDED,
      outputJson: outputJson ?? {},
      finishedAt: new Date(),
      errorText: null,
      leaseOwner: null,
      leaseExpiresAt: null,
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
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
}

/** Budget approval is a wait state, not a failed attempt. */
export async function releaseWorkflowRunForBudgetConfirmation(runId: string, errorText: string) {
  return db.workflowRun.update({
    where: { id: runId },
    data: {
      status: WorkflowRunStatus.QUEUED,
      attempt: { decrement: 1 },
      finishedAt: null,
      errorText,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    },
  });
}

export async function resetWorkflowRunForExplicitRerun(
  runId: string,
  inputJson: Prisma.InputJsonValue,
) {
  return db.workflowRun.update({
    where: { id: runId },
    data: {
      status: WorkflowRunStatus.QUEUED,
      attempt: 0,
      inputJson,
      outputJson: {},
      errorText: null,
      finishedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
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
      canceledAt: new Date(),
      cancelReason: errorText ?? "Canceled by user.",
      leaseOwner: null,
      leaseExpiresAt: null,
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
