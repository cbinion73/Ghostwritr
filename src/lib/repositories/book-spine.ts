import type { BookWorkflowType, StageKey, StageStatus } from "@prisma/client";

import { db } from "../db";

export type SpineStageRow = {
  stageKey: StageKey;
  status: StageStatus;
  artifactCount: number;
  updatedAt: Date | null;
  committedAt: Date | null;
};

export type SpineData = {
  book: {
    id: string;
    slug: string;
    titleWorking: string | null;
    subtitle: string | null;
    workflowType: BookWorkflowType;
  };
  stages: SpineStageRow[];
};

/**
 * Aggregates per-stage state for the Book Spine view.
 * One Prisma call — no N+1. Artifacts are counted via a groupBy on Artifact.stageId.
 *
 * Returns null if the slug doesn't resolve.
 */
export async function getBookSpine(slug: string): Promise<SpineData | null> {
  const book = await db.book.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      titleWorking: true,
      subtitle: true,
      workflowType: true,
      stages: {
        select: {
          id: true,
          stageKey: true,
          status: true,
          updatedAt: true,
          committedAt: true,
        },
      },
    },
  });

  if (!book) return null;

  const artifactCounts = book.stages.length
    ? await db.artifact.groupBy({
        by: ["stageId"],
        where: { stageId: { in: book.stages.map((s) => s.id) } },
        _count: { _all: true },
      })
    : [];

  const countByStageId = new Map(
    artifactCounts.map((row) => [row.stageId, row._count._all]),
  );

  const stages: SpineStageRow[] = book.stages.map((s) => ({
    stageKey: s.stageKey,
    status: s.status,
    artifactCount: countByStageId.get(s.id) ?? 0,
    updatedAt: s.updatedAt,
    committedAt: s.committedAt,
  }));

  return {
    book: {
      id: book.id,
      slug: book.slug,
      titleWorking: book.titleWorking,
      subtitle: book.subtitle,
      workflowType: book.workflowType,
    },
    stages,
  };
}

export async function getBookSpineForUser(
  slug: string,
  ownerUserId: string,
): Promise<SpineData | null> {
  const book = await db.book.findFirst({
    where: {
      slug,
      ownerUserId,
    },
    select: {
      id: true,
      slug: true,
      titleWorking: true,
      subtitle: true,
      workflowType: true,
      stages: {
        select: {
          id: true,
          stageKey: true,
          status: true,
          updatedAt: true,
          committedAt: true,
        },
      },
    },
  });

  if (!book) return null;

  const artifactCounts = book.stages.length
    ? await db.artifact.groupBy({
        by: ["stageId"],
        where: { stageId: { in: book.stages.map((s) => s.id) } },
        _count: { _all: true },
      })
    : [];

  const countByStageId = new Map(
    artifactCounts.map((row) => [row.stageId, row._count._all]),
  );

  return {
    book: {
      id: book.id,
      slug: book.slug,
      titleWorking: book.titleWorking,
      subtitle: book.subtitle,
      workflowType: book.workflowType,
    },
    stages: book.stages.map((s) => ({
      stageKey: s.stageKey,
      status: s.status,
      artifactCount: countByStageId.get(s.id) ?? 0,
      updatedAt: s.updatedAt,
      committedAt: s.committedAt,
    })),
  };
}
