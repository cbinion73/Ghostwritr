import { BookWorkflowType, Prisma, StageKey, StageStatus } from "@prisma/client";

import { getBookBySlugOrThrow, getStageForBook, updateStageForBook } from "./repositories/books";

type StaleDependency = {
  changedStageKey: StageKey;
  affectedStageKeys: StageKey[];
  reason: string;
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

export async function invalidateDependentStagesForBook(bookSlug: string, changedStageKey: StageKey) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const staleRule = getStaleMap(book.workflowType)[changedStageKey];
  if (!staleRule) {
    return;
  }

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

      await updateStageForBook(book.id, stageKey, {
        status: shouldBlock ? StageStatus.BLOCKED : stage.status,
        metadataJson: mergeMetadata(stage.metadataJson, {
          staleDependency: {
            changedStageKey: staleRule.changedStageKey,
            changedAt: new Date().toISOString(),
            reason: staleRule.reason,
          },
        }),
      });
    }),
  );
}

export async function clearStageStaleDependency(bookSlug: string, stageKey: StageKey) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, stageKey);
  if (!stage) {
    return;
  }

  const metadata =
    stage.metadataJson && typeof stage.metadataJson === "object"
      ? { ...(stage.metadataJson as Record<string, unknown>) }
      : {};

  if ("staleDependency" in metadata) {
    delete metadata.staleDependency;
  }

  await updateStageForBook(book.id, stageKey, {
    status: stage.status === StageStatus.BLOCKED ? StageStatus.READY_FOR_REVIEW : stage.status,
    metadataJson: metadata as Prisma.InputJsonValue,
  });
}
