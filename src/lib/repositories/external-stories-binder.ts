import { Prisma, StageKey } from "@prisma/client";

import { db } from "../db";
import { getStageForBook } from "./books";

export const EXTERNAL_STORY_BINDER_COLORS = [
  "sage",
  "amber",
  "marine",
  "rose",
  "moss",
  "plum",
  "sand",
] as const;

type ChapterSeed = {
  chapterKey: string;
  chapterLabel: string;
};

function parseChapterKeys(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringifyChapterKeys(chapterKeys: string[]) {
  return Array.from(new Set(chapterKeys)) as Prisma.InputJsonValue;
}

async function requireStage(bookId: string) {
  const stage = await getStageForBook(bookId, StageKey.EXTERNAL_STORIES);
  if (!stage) {
    throw new Error(`External Stories stage not found for book ${bookId}`);
  }

  return stage;
}

export async function syncExternalStoryBinderTabs(bookId: string, chapters: ChapterSeed[]) {
  const stage = await requireStage(bookId);

  return db.$transaction(async (tx) => {
    const existingTabs = await tx.externalStoryBinderTab.findMany({
      where: { bookId, stageId: stage.id, isArchived: false },
      orderBy: { orderIndex: "asc" },
    });

    const existingChapterKeys = new Set(
      existingTabs.flatMap((tab) => parseChapterKeys(tab.chapterKeysJson)),
    );

    let nextOrderIndex =
      existingTabs.reduce((max, tab) => Math.max(max, tab.orderIndex), -1) + 1;

    for (const chapter of chapters) {
      if (existingChapterKeys.has(chapter.chapterKey)) {
        continue;
      }

      await tx.externalStoryBinderTab.create({
        data: {
          bookId,
          stageId: stage.id,
          label: chapter.chapterLabel,
          colorToken:
            EXTERNAL_STORY_BINDER_COLORS[nextOrderIndex % EXTERNAL_STORY_BINDER_COLORS.length],
          orderIndex: nextOrderIndex,
          chapterKeysJson: stringifyChapterKeys([chapter.chapterKey]),
        },
      });

      nextOrderIndex += 1;
    }
  });
}

export async function listExternalStoryBinderTabs(bookId: string) {
  const stage = await requireStage(bookId);

  return db.externalStoryBinderTab.findMany({
    where: { bookId, stageId: stage.id, isArchived: false },
    orderBy: { orderIndex: "asc" },
    include: {
      storyClips: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

export async function createExternalStoryBinderTab(
  bookId: string,
  label: string,
  chapterKeys: string[] = [],
) {
  const stage = await requireStage(bookId);
  const last = await db.externalStoryBinderTab.findFirst({
    where: { bookId, stageId: stage.id },
    orderBy: { orderIndex: "desc" },
  });

  return db.externalStoryBinderTab.create({
    data: {
      bookId,
      stageId: stage.id,
      label,
      colorToken:
        EXTERNAL_STORY_BINDER_COLORS[((last?.orderIndex ?? -1) + 1) % EXTERNAL_STORY_BINDER_COLORS.length],
      orderIndex: (last?.orderIndex ?? -1) + 1,
      chapterKeysJson: stringifyChapterKeys(chapterKeys),
    },
  });
}

export async function renameExternalStoryBinderTab(bookId: string, tabId: string, label: string) {
  await requireStage(bookId);
  const tab = await db.externalStoryBinderTab.findFirstOrThrow({
    where: { id: tabId, bookId, isArchived: false },
  });

  return db.externalStoryBinderTab.update({
    where: { id: tab.id },
    data: { label },
  });
}

export async function archiveExternalStoryBinderTab(bookId: string, tabId: string) {
  const stage = await requireStage(bookId);
  const activeCount = await db.externalStoryBinderTab.count({
    where: { bookId, stageId: stage.id, isArchived: false },
  });

  if (activeCount <= 1) {
    throw new Error("At least one external story tab must stay active.");
  }

  const tab = await db.externalStoryBinderTab.findFirstOrThrow({
    where: { id: tabId, bookId, stageId: stage.id, isArchived: false },
  });

  return db.externalStoryBinderTab.update({
    where: { id: tab.id },
    data: { isArchived: true },
  });
}

export async function combineExternalStoryBinderTabs(
  bookId: string,
  sourceTabId: string,
  targetTabId: string,
) {
  if (sourceTabId === targetTabId) {
    return;
  }

  await requireStage(bookId);

  return db.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.externalStoryBinderTab.findFirstOrThrow({
        where: { id: sourceTabId, bookId, isArchived: false },
      }),
      tx.externalStoryBinderTab.findFirstOrThrow({
        where: { id: targetTabId, bookId, isArchived: false },
      }),
    ]);

    await tx.externalStoryBinderTab.update({
      where: { id: target.id },
      data: {
        chapterKeysJson: stringifyChapterKeys([
          ...parseChapterKeys(target.chapterKeysJson),
          ...parseChapterKeys(source.chapterKeysJson),
        ]),
      },
    });

    await tx.externalStoryClip.updateMany({
      where: { bookId, binderTabId: source.id },
      data: { binderTabId: target.id },
    });

    await tx.externalStoryBinderTab.update({
      where: { id: source.id },
      data: { isArchived: true },
    });
  });
}

export async function separateExternalStoryBinderTab(
  bookId: string,
  sourceTabId: string,
  chapterKey: string,
  newLabel: string,
) {
  const stage = await requireStage(bookId);

  return db.$transaction(async (tx) => {
    const source = await tx.externalStoryBinderTab.findFirstOrThrow({
      where: { id: sourceTabId, bookId, stageId: stage.id, isArchived: false },
    });

    const chapterKeys = parseChapterKeys(source.chapterKeysJson);
    if (!chapterKeys.includes(chapterKey)) {
      throw new Error("Selected chapter is not assigned to this tab.");
    }
    if (chapterKeys.length <= 1) {
      throw new Error("This tab already contains a single chapter.");
    }

    const last = await tx.externalStoryBinderTab.findFirst({
      where: { bookId, stageId: stage.id },
      orderBy: { orderIndex: "desc" },
    });

    await tx.externalStoryBinderTab.update({
      where: { id: source.id },
      data: {
        chapterKeysJson: stringifyChapterKeys(chapterKeys.filter((key) => key !== chapterKey)),
      },
    });

    return tx.externalStoryBinderTab.create({
      data: {
        bookId,
        stageId: stage.id,
        label: newLabel,
        colorToken:
          EXTERNAL_STORY_BINDER_COLORS[((last?.orderIndex ?? -1) + 1) % EXTERNAL_STORY_BINDER_COLORS.length],
        orderIndex: (last?.orderIndex ?? -1) + 1,
        chapterKeysJson: stringifyChapterKeys([chapterKey]),
      },
    });
  });
}

export async function createExternalStoryClip(input: {
  bookId: string;
  binderTabId: string;
  chapterKey?: string;
  title?: string;
  content: string;
}) {
  const stage = await requireStage(input.bookId);
  const last = await db.externalStoryClip.findFirst({
    where: {
      bookId: input.bookId,
      stageId: stage.id,
      binderTabId: input.binderTabId,
    },
    orderBy: { orderIndex: "desc" },
  });

  return db.externalStoryClip.create({
    data: {
      bookId: input.bookId,
      stageId: stage.id,
      binderTabId: input.binderTabId,
      chapterKey: input.chapterKey,
      title: input.title,
      content: input.content,
      orderIndex: (last?.orderIndex ?? -1) + 1,
    },
  });
}

export async function deleteExternalStoryClip(bookId: string, clipId: string) {
  await requireStage(bookId);
  const clip = await db.externalStoryClip.findFirstOrThrow({
    where: { id: clipId, bookId },
  });

  return db.externalStoryClip.delete({ where: { id: clip.id } });
}

export function getExternalStoryBinderChapterKeys(value: Prisma.JsonValue | null | undefined) {
  return parseChapterKeys(value);
}
