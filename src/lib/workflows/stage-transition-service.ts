import { BookWorkflowType, Prisma, StageKey, StageStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { syncStageOperationalStateFromMetadata } from "@/lib/repositories/stage-operational-state";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";

export class StageTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageTransitionError";
  }
}

type MetadataValue = Prisma.InputJsonValue | undefined;

interface StageTransitionBaseInput {
  bookId: string;
  stageKey: StageKey;
  metadataJson?: MetadataValue;
}

interface CommitStageInput extends StageTransitionBaseInput {
  workflowType: BookWorkflowType;
  committedArtifactVersionId?: string | null;
  committedAt?: Date;
  unlockNext?: boolean;
}

export function getNextStageKey(
  workflowType: BookWorkflowType,
  stageKey: StageKey,
): StageKey | null {
  const stageOrder = getWorkflowStageKeys(workflowType);
  const currentIdx = stageOrder.indexOf(stageKey);
  if (currentIdx < 0 || currentIdx >= stageOrder.length - 1) return null;
  return stageOrder[currentIdx + 1] ?? null;
}

async function syncOperationalState(
  input: StageTransitionBaseInput & { stageId: string; status?: StageStatus },
) {
  if (input.metadataJson === undefined) return;
  await syncStageOperationalStateFromMetadata({
    bookId: input.bookId,
    stageId: input.stageId,
    status: input.status,
    metadataJson: input.metadataJson,
  });
}

export async function ensureStageStarted(input: StageTransitionBaseInput) {
  const existing = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: input.bookId, stageKey: input.stageKey } },
  });

  if (!existing) {
    const created = await db.bookStage.create({
      data: {
        bookId: input.bookId,
        stageKey: input.stageKey,
        status: StageStatus.IN_PROGRESS,
        ...(input.metadataJson !== undefined ? { metadataJson: input.metadataJson } : {}),
      },
    });
    await syncOperationalState({ ...input, stageId: created.id, status: created.status });
    return created;
  }

  if (existing.status === StageStatus.COMMITTED) {
    return existing;
  }

  if (existing.status === StageStatus.IN_PROGRESS && input.metadataJson === undefined) {
    return existing;
  }

  const updated = await db.bookStage.update({
    where: { id: existing.id },
    data: {
      status: StageStatus.IN_PROGRESS,
      ...(input.metadataJson !== undefined ? { metadataJson: input.metadataJson } : {}),
    },
  });
  await syncOperationalState({ ...input, stageId: updated.id, status: updated.status });
  return updated;
}

export async function markStageReadyForReview(input: StageTransitionBaseInput) {
  const existing = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: input.bookId, stageKey: input.stageKey } },
  });

  if (!existing) {
    throw new StageTransitionError(`Cannot mark missing ${input.stageKey} stage ready for review.`);
  }
  if (existing.status === StageStatus.COMMITTED) {
    throw new StageTransitionError(`Cannot mark committed ${input.stageKey} stage ready for review.`);
  }

  const updated = await db.bookStage.update({
    where: { id: existing.id },
    data: {
      status: StageStatus.READY_FOR_REVIEW,
      ...(input.metadataJson !== undefined ? { metadataJson: input.metadataJson } : {}),
    },
  });
  await syncOperationalState({ ...input, stageId: updated.id, status: updated.status });
  return updated;
}

export async function resetStageToNotStarted(input: StageTransitionBaseInput) {
  const updated = await db.bookStage.update({
    where: { bookId_stageKey: { bookId: input.bookId, stageKey: input.stageKey } },
    data: {
      status: StageStatus.NOT_STARTED,
      ...(input.metadataJson !== undefined ? { metadataJson: input.metadataJson } : {}),
    },
  });
  await syncOperationalState({ ...input, stageId: updated.id, status: updated.status });
  return updated;
}

export async function blockStage(input: StageTransitionBaseInput) {
  const existing = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: input.bookId, stageKey: input.stageKey } },
  });

  if (!existing) {
    const created = await db.bookStage.create({
      data: {
        bookId: input.bookId,
        stageKey: input.stageKey,
        status: StageStatus.BLOCKED,
        ...(input.metadataJson !== undefined ? { metadataJson: input.metadataJson } : {}),
      },
    });
    await syncOperationalState({ ...input, stageId: created.id, status: created.status });
    return created;
  }

  if (existing.status === StageStatus.COMMITTED) {
    throw new StageTransitionError(`Cannot block committed ${input.stageKey} stage.`);
  }

  const updated = await db.bookStage.update({
    where: { id: existing.id },
    data: {
      status: StageStatus.BLOCKED,
      ...(input.metadataJson !== undefined ? { metadataJson: input.metadataJson } : {}),
    },
  });
  await syncOperationalState({ ...input, stageId: updated.id, status: updated.status });
  return updated;
}

export async function commitStageAndUnlockNext(input: CommitStageInput) {
  const committedAt = input.committedAt ?? new Date();
  const existing = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: input.bookId, stageKey: input.stageKey } },
  });

  if (!existing) {
    throw new StageTransitionError(`Cannot commit missing ${input.stageKey} stage.`);
  }

  const committed = await db.bookStage.update({
    where: { id: existing.id },
    data: {
      status: StageStatus.COMMITTED,
      committedAt,
      ...(input.committedArtifactVersionId !== undefined
        ? { committedArtifactVersionId: input.committedArtifactVersionId }
        : {}),
      ...(input.metadataJson !== undefined ? { metadataJson: input.metadataJson } : {}),
    },
  });
  await syncOperationalState({ ...input, stageId: committed.id, status: committed.status });

  const nextStageKey = input.unlockNext === false
    ? null
    : getNextStageKey(input.workflowType, input.stageKey);

  if (nextStageKey) {
    await ensureStageStarted({ bookId: input.bookId, stageKey: nextStageKey });
  }

  return { stage: committed, nextStageKey };
}
