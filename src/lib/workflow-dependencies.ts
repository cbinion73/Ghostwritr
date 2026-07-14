import {
  ArtifactStatus,
  ArtifactType,
  BookWorkflowType,
  Prisma,
  StageKey,
  StageStatus,
} from "@prisma/client";

import { getBookBySlugOrThrow, getStageForBook, updateStageForBook } from "./repositories/books";
import { db } from "./db";
import { getArtifactChapterId } from "./repositories/chapter-identity";
import { markArtifactStaleInTransaction } from "./repositories/artifact-transaction-service";
import { markChapterApprovalStale } from "./repositories/chapter-approval-state";
import { getStaleArtifactTypesForStage } from "./workflow-registry";

type StaleDependency = {
  changedStageKey: StageKey;
  affectedStageKeys: StageKey[];
  reason: string;
};

type ChapterScopedInvalidationOptions = {
  chapterIds?: string[];
  reason?: string;
};

const NONFICTION_STALE_MAP: Partial<Record<StageKey, StaleDependency>> = {
  [StageKey.PROMISE]: {
    changedStageKey: StageKey.PROMISE,
    affectedStageKeys: [
      StageKey.OUTLINE,
      StageKey.BASE_STORY,
      StageKey.RESEARCH,
      StageKey.EXTERNAL_STORIES,
      StageKey.PERSONAL_STORIES,
      StageKey.CHAPTER_DRAFT,
      StageKey.EDITING,
    ],
    reason: "The committed Promise changed, so downstream manuscript artifacts must be regenerated.",
  },
  [StageKey.OUTLINE]: {
    changedStageKey: StageKey.OUTLINE,
    affectedStageKeys: [
      StageKey.BASE_STORY,
      StageKey.RESEARCH,
      StageKey.EXTERNAL_STORIES,
      StageKey.PERSONAL_STORIES,
      StageKey.CHAPTER_DRAFT,
      StageKey.EDITING,
    ],
    reason: "The committed Outline changed, so downstream chapter-level artifacts are stale.",
  },
  [StageKey.BASE_STORY]: {
    changedStageKey: StageKey.BASE_STORY,
    affectedStageKeys: [
      StageKey.RESEARCH,
      StageKey.EXTERNAL_STORIES,
      StageKey.CHAPTER_DRAFT,
      StageKey.EDITING,
    ],
    reason: "The Base Story changed, so downstream research and manuscript stages must be refreshed.",
  },
  [StageKey.RESEARCH]: {
    changedStageKey: StageKey.RESEARCH,
    affectedStageKeys: [StageKey.CHAPTER_DRAFT, StageKey.EDITING],
    reason: "Research changed, so chapter drafting and Editing must be regenerated from the new evidence stack.",
  },
  [StageKey.EXTERNAL_STORIES]: {
    changedStageKey: StageKey.EXTERNAL_STORIES,
    affectedStageKeys: [StageKey.CHAPTER_DRAFT, StageKey.EDITING],
    reason: "External Stories changed, so chapter drafting and Editing must be refreshed.",
  },
  [StageKey.PERSONAL_STORIES]: {
    changedStageKey: StageKey.PERSONAL_STORIES,
    affectedStageKeys: [StageKey.CHAPTER_DRAFT, StageKey.EDITING],
    reason: "Personal Stories changed, so chapter drafting and Editing must be refreshed.",
  },
  [StageKey.CHAPTER_DRAFT]: {
    changedStageKey: StageKey.CHAPTER_DRAFT,
    affectedStageKeys: [StageKey.EDITING],
    reason: "Chapter Draft changed, so Editing must be reassembled from the latest manuscript.",
  },
};

const FICTION_STALE_MAP: Partial<Record<StageKey, StaleDependency>> = {
  [StageKey.STORY_SETUP]: {
    changedStageKey: StageKey.STORY_SETUP,
    affectedStageKeys: [
      StageKey.STORY_CORE,
      StageKey.WORLD_CAST,
      StageKey.PLOT_BLUEPRINT,
      StageKey.SCENE_PLAN,
      StageKey.FICTION_DRAFT,
      StageKey.EDITING,
    ],
    reason: "Story Setup changed, so the downstream fiction planning and draft artifacts are stale.",
  },
  [StageKey.STORY_CORE]: {
    changedStageKey: StageKey.STORY_CORE,
    affectedStageKeys: [
      StageKey.WORLD_CAST,
      StageKey.PLOT_BLUEPRINT,
      StageKey.SCENE_PLAN,
      StageKey.FICTION_DRAFT,
      StageKey.EDITING,
    ],
    reason: "Story Core changed, so downstream fiction planning and draft artifacts are stale.",
  },
  [StageKey.WORLD_CAST]: {
    changedStageKey: StageKey.WORLD_CAST,
    affectedStageKeys: [StageKey.PLOT_BLUEPRINT, StageKey.SCENE_PLAN, StageKey.FICTION_DRAFT, StageKey.EDITING],
    reason: "World & Cast changed, so downstream plot, draft, and editing artifacts are stale.",
  },
  [StageKey.PLOT_BLUEPRINT]: {
    changedStageKey: StageKey.PLOT_BLUEPRINT,
    affectedStageKeys: [StageKey.SCENE_PLAN, StageKey.FICTION_DRAFT, StageKey.EDITING],
    reason: "Plot Blueprint changed, so Scene Plan, Draft, and Editing must be regenerated.",
  },
  [StageKey.SCENE_PLAN]: {
    changedStageKey: StageKey.SCENE_PLAN,
    affectedStageKeys: [StageKey.FICTION_DRAFT, StageKey.EDITING],
    reason: "Scene Plan changed, so Draft and Editing must be regenerated.",
  },
  [StageKey.FICTION_DRAFT]: {
    changedStageKey: StageKey.FICTION_DRAFT,
    affectedStageKeys: [StageKey.EDITING],
    reason: "Draft changed, so Editing must be reassembled from the latest fiction manuscript.",
  },
};

function getStaleMap(workflowType: BookWorkflowType) {
  return workflowType === BookWorkflowType.FICTION ? FICTION_STALE_MAP : NONFICTION_STALE_MAP;
}

function mergeMetadata(
  current: unknown,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const existing =
    current && typeof current === "object" ? (current as Record<string, unknown>) : {};
  return {
    ...existing,
    ...patch,
  } as Prisma.InputJsonValue;
}

function normalizeChapterIds(chapterIds: string[] | undefined) {
  if (!chapterIds) return null;
  return Array.from(new Set(chapterIds.map((id) => id.trim()).filter(Boolean)));
}

function removeStaleFields(metadataJson: unknown): Prisma.InputJsonValue {
  const metadata =
    metadataJson && typeof metadataJson === "object" && !Array.isArray(metadataJson)
      ? { ...(metadataJson as Record<string, unknown>) }
      : {};
  delete metadata.stale;
  delete metadata.staleReason;
  delete metadata.staleAt;
  return metadata as Prisma.InputJsonValue;
}

function readAffectedChapterIds(metadataJson: unknown) {
  const staleDependency =
    metadataJson && typeof metadataJson === "object" && !Array.isArray(metadataJson)
      ? (metadataJson as Record<string, unknown>).staleDependency
      : null;
  if (!staleDependency || typeof staleDependency !== "object" || Array.isArray(staleDependency)) {
    return null;
  }
  const affected = (staleDependency as Record<string, unknown>).affectedChapterIds;
  return Array.isArray(affected)
    ? affected.filter((chapterId): chapterId is string => typeof chapterId === "string")
    : null;
}

async function resolveFullBookChapterIds(bookId: string, affectedStageKeys: StageKey[]) {
  const stageArtifactTypes = affectedStageKeys.flatMap((stageKey) => getStaleArtifactTypesForStage(stageKey));
  const [artifacts, approvalStates] = await Promise.all([
    stageArtifactTypes.length > 0
      ? db.artifact.findMany({
          where: {
            bookId,
            artifactType: { in: stageArtifactTypes },
            status: { not: ArtifactStatus.SUPERSEDED },
          },
          select: { chapterId: true, metadataJson: true },
        })
      : Promise.resolve([]),
    db.chapterApprovalState.findMany({
      where: { bookId },
      select: { chapterId: true },
    }),
  ]);

  return Array.from(
    new Set([
      ...artifacts.map((artifact) => getArtifactChapterId(artifact)).filter((id): id is string => Boolean(id)),
      ...approvalStates.map((state) => state.chapterId),
    ]),
  );
}

async function markDownstreamChapterAssetsStale(input: {
  bookId: string;
  affectedStageKeys: StageKey[];
  chapterIds: string[];
  reason: string;
  markedAt: Date;
}) {
  if (input.chapterIds.length === 0) return;

  const artifactTypes = input.affectedStageKeys.flatMap((stageKey) => getStaleArtifactTypesForStage(stageKey));
  if (artifactTypes.length === 0) {
    await Promise.all(
      input.chapterIds.map((chapterId) =>
        markChapterApprovalStale({
          bookId: input.bookId,
          chapterId,
          reason: input.reason,
          markedAt: input.markedAt,
        }),
      ),
    );
    return;
  }

  await db.$transaction(async (tx) => {
    const artifacts = await tx.artifact.findMany({
      where: {
        bookId: input.bookId,
        artifactType: { in: artifactTypes },
        status: { not: ArtifactStatus.SUPERSEDED },
      },
      select: {
        id: true,
        artifactType: true,
        chapterId: true,
        metadataJson: true,
      },
    });

    const chapterSet = new Set(input.chapterIds);
    for (const artifact of artifacts) {
      const chapterId = getArtifactChapterId(artifact);
      if (!chapterId || !chapterSet.has(chapterId)) continue;
      await markArtifactStaleInTransaction(tx, {
        artifactId: artifact.id,
        reason: input.reason,
        markedAt: input.markedAt,
      });
    }

    if (
      input.affectedStageKeys.includes(StageKey.CHAPTER_DRAFT) ||
      input.affectedStageKeys.includes(StageKey.FICTION_DRAFT) ||
      input.affectedStageKeys.includes(StageKey.EDITING)
    ) {
      for (const chapterId of input.chapterIds) {
        await markChapterApprovalStale({
          bookId: input.bookId,
          chapterId,
          reason: input.reason,
          markedAt: input.markedAt,
          client: tx,
        });
      }
    }
  });
}

async function clearChapterStaleMarkers(input: {
  bookId: string;
  stageKey: StageKey;
  chapterIds: string[];
}) {
  if (input.chapterIds.length === 0) return;

  const artifactTypes = getStaleArtifactTypesForStage(input.stageKey);
  if (artifactTypes.length === 0) return;

  const artifacts = await db.artifact.findMany({
    where: {
      bookId: input.bookId,
      artifactType: { in: artifactTypes },
      status: { not: ArtifactStatus.SUPERSEDED },
    },
    select: { id: true, chapterId: true, metadataJson: true },
  });
  const chapterSet = new Set(input.chapterIds);
  await Promise.all(
    artifacts
      .filter((artifact) => {
        const chapterId = getArtifactChapterId(artifact);
        return chapterId ? chapterSet.has(chapterId) : false;
      })
      .map((artifact) =>
        db.artifact.update({
          where: { id: artifact.id },
          data: { metadataJson: removeStaleFields(artifact.metadataJson) },
        }),
      ),
  );
}

export async function invalidateDependentStagesForBook(
  bookSlug: string,
  changedStageKey: StageKey,
  options: ChapterScopedInvalidationOptions = {},
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const staleRule = getStaleMap(book.workflowType)[changedStageKey];
  if (!staleRule) {
    return;
  }

  const explicitChapterIds = normalizeChapterIds(options.chapterIds);
  if (explicitChapterIds && explicitChapterIds.length === 0) {
    return;
  }

  const staleReason = options.reason ?? staleRule.reason;
  const changedAt = new Date();
  const affectedChapterIds =
    explicitChapterIds ?? await resolveFullBookChapterIds(book.id, staleRule.affectedStageKeys);
  const isChapterScoped = explicitChapterIds !== null;

  await markDownstreamChapterAssetsStale({
    bookId: book.id,
    affectedStageKeys: staleRule.affectedStageKeys,
    chapterIds: affectedChapterIds,
    reason: staleReason,
    markedAt: changedAt,
  });

  await Promise.all(
    staleRule.affectedStageKeys.map(async (stageKey) => {
      const stage = await getStageForBook(book.id, stageKey);
      if (!stage) {
        return;
      }

      const shouldBlock =
        stage.status === StageStatus.COMMITTED ||
        stage.status === StageStatus.READY_FOR_REVIEW ||
        stage.status === StageStatus.IN_PROGRESS;
      const existingAffectedChapterIds = readAffectedChapterIds(stage.metadataJson);
      const stageAffectedChapterIds =
        isChapterScoped && existingAffectedChapterIds
          ? Array.from(new Set([...existingAffectedChapterIds, ...affectedChapterIds]))
          : affectedChapterIds;

      await updateStageForBook(book.id, stageKey, {
        status: !isChapterScoped && shouldBlock ? StageStatus.BLOCKED : stage.status,
        metadataJson: mergeMetadata(stage.metadataJson, {
          staleDependency: {
            changedStageKey: staleRule.changedStageKey,
            changedAt: changedAt.toISOString(),
            reason: staleReason,
            scope: isChapterScoped ? "chapter" : "stage",
            affectedChapterIds: stageAffectedChapterIds,
          },
        }),
      });
    }),
  );
}

export async function clearStageStaleDependency(
  bookSlug: string,
  stageKey: StageKey,
  options: { chapterIds?: string[] } = {},
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, stageKey);
  if (!stage) {
    return;
  }

  const metadata =
    stage.metadataJson && typeof stage.metadataJson === "object"
      ? { ...(stage.metadataJson as Record<string, unknown>) }
      : {};

  const explicitChapterIds = normalizeChapterIds(options.chapterIds);
  if (explicitChapterIds && explicitChapterIds.length > 0) {
    await clearChapterStaleMarkers({
      bookId: book.id,
      stageKey,
      chapterIds: explicitChapterIds,
    });
  }

  if ("staleDependency" in metadata) {
    const existingAffected = readAffectedChapterIds(metadata);
    if (explicitChapterIds && existingAffected) {
      const cleared = new Set(explicitChapterIds);
      const remaining = existingAffected.filter((chapterId) => !cleared.has(chapterId));
      if (remaining.length > 0) {
        metadata.staleDependency = {
          ...(metadata.staleDependency as Record<string, unknown>),
          affectedChapterIds: remaining,
          scope: "chapter",
        };
      } else {
        delete metadata.staleDependency;
      }
    } else {
      delete metadata.staleDependency;
    }
  }

  await updateStageForBook(book.id, stageKey, {
    status:
      stage.status === StageStatus.BLOCKED && !("staleDependency" in metadata)
        ? StageStatus.READY_FOR_REVIEW
        : stage.status,
    metadataJson: metadata as Prisma.InputJsonValue,
  });
}
