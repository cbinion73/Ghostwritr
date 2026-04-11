import { Prisma, StageKey } from "@prisma/client";

import { db } from "../db";
import { getStageForBook } from "./books";

export const RESEARCH_BINDER_COLORS = [
  "sage",
  "amber",
  "marine",
  "rose",
  "moss",
  "plum",
  "sand",
] as const;

export type ResearchBinderColor = (typeof RESEARCH_BINDER_COLORS)[number];

export type ResearchChapterSeed = {
  chapterKey: string;
  chapterLabel: string;
};

function parseChapterKeys(value: Prisma.JsonValue | null | undefined) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
}

function stringifyChapterKeys(chapterKeys: string[]) {
  return Array.from(new Set(chapterKeys)) as Prisma.InputJsonValue;
}

async function requireResearchStage(bookId: string) {
  const stage = await getStageForBook(bookId, StageKey.RESEARCH);

  if (!stage) {
    throw new Error(`Research stage not found for book ${bookId}`);
  }

  return stage;
}

export async function syncResearchBinderTabsFromOutline(
  bookId: string,
  chapters: ResearchChapterSeed[],
) {
  const stage = await requireResearchStage(bookId);

  return db.$transaction(async (tx) => {
    const existingTabs = await tx.researchBinderTab.findMany({
      where: {
        bookId,
        stageId: stage.id,
        isArchived: false,
      },
      orderBy: { orderIndex: "asc" },
    });

    const existingChapterKeys = new Set(
      existingTabs.flatMap((tab) => parseChapterKeys(tab.chapterKeysJson)),
    );

    let nextOrderIndex =
      existingTabs.reduce((maxOrder, tab) => Math.max(maxOrder, tab.orderIndex), -1) + 1;

    for (const chapter of chapters) {
      if (existingChapterKeys.has(chapter.chapterKey)) {
        continue;
      }

      await tx.researchBinderTab.create({
        data: {
          bookId,
          stageId: stage.id,
          label: chapter.chapterLabel,
          colorToken: RESEARCH_BINDER_COLORS[nextOrderIndex % RESEARCH_BINDER_COLORS.length],
          orderIndex: nextOrderIndex,
          chapterKeysJson: stringifyChapterKeys([chapter.chapterKey]),
        },
      });

      nextOrderIndex += 1;
    }
  });
}

export async function listResearchBinderTabs(bookId: string) {
  const stage = await requireResearchStage(bookId);

  return db.researchBinderTab.findMany({
    where: {
      bookId,
      stageId: stage.id,
      isArchived: false,
    },
    orderBy: { orderIndex: "asc" },
    include: {
      ideaClips: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

export async function createResearchBinderTab(
  bookId: string,
  label: string,
  chapterKeys: string[] = [],
) {
  const stage = await requireResearchStage(bookId);
  const lastTab = await db.researchBinderTab.findFirst({
    where: {
      bookId,
      stageId: stage.id,
    },
    orderBy: { orderIndex: "desc" },
  });

  const nextOrderIndex = (lastTab?.orderIndex ?? -1) + 1;

  return db.researchBinderTab.create({
    data: {
      bookId,
      stageId: stage.id,
      label,
      colorToken: RESEARCH_BINDER_COLORS[nextOrderIndex % RESEARCH_BINDER_COLORS.length],
      orderIndex: nextOrderIndex,
      chapterKeysJson: stringifyChapterKeys(chapterKeys),
    },
  });
}

export async function renameResearchBinderTab(bookId: string, tabId: string, label: string) {
  await requireResearchStage(bookId);

  const tab = await db.researchBinderTab.findFirstOrThrow({
    where: { id: tabId, bookId, isArchived: false },
  });

  return db.researchBinderTab.update({ where: { id: tab.id }, data: { label } });
}

export async function archiveResearchBinderTab(bookId: string, tabId: string) {
  const stage = await requireResearchStage(bookId);
  const activeTabs = await db.researchBinderTab.count({
    where: {
      bookId,
      stageId: stage.id,
      isArchived: false,
    },
  });

  if (activeTabs <= 1) {
    throw new Error("At least one dossier tab needs to stay active.");
  }

  const tab = await db.researchBinderTab.findFirstOrThrow({
    where: { id: tabId, bookId, stageId: stage.id, isArchived: false },
  });

  return db.researchBinderTab.update({ where: { id: tab.id }, data: { isArchived: true } });
}

export async function combineResearchBinderTabs(
  bookId: string,
  sourceTabId: string,
  targetTabId: string,
) {
  if (sourceTabId === targetTabId) {
    return;
  }

  await requireResearchStage(bookId);

  await db.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.researchBinderTab.findFirstOrThrow({
        where: { id: sourceTabId, bookId, isArchived: false },
      }),
      tx.researchBinderTab.findFirstOrThrow({
        where: { id: targetTabId, bookId, isArchived: false },
      }),
    ]);

    const mergedChapterKeys = Array.from(
      new Set([
        ...parseChapterKeys(target.chapterKeysJson),
        ...parseChapterKeys(source.chapterKeysJson),
      ]),
    );

    await tx.researchBinderTab.update({
      where: { id: target.id },
      data: {
        chapterKeysJson: stringifyChapterKeys(mergedChapterKeys),
      },
    });

    await tx.researchIdeaClip.updateMany({
      where: {
        bookId,
        binderTabId: source.id,
      },
      data: {
        binderTabId: target.id,
      },
    });

    await tx.researchBinderTab.update({
      where: { id: source.id },
      data: {
        isArchived: true,
      },
    });
  });
}

export async function separateResearchBinderTab(
  bookId: string,
  sourceTabId: string,
  chapterKey: string,
  newLabel: string,
) {
  const stage = await requireResearchStage(bookId);

  return db.$transaction(async (tx) => {
    const source = await tx.researchBinderTab.findFirstOrThrow({
      where: { id: sourceTabId, bookId, stageId: stage.id, isArchived: false },
    });

    const sourceChapterKeys = parseChapterKeys(source.chapterKeysJson);

    if (!sourceChapterKeys.includes(chapterKey)) {
      throw new Error("The selected chapter is not assigned to this tab.");
    }

    if (sourceChapterKeys.length <= 1) {
      throw new Error("This tab only holds one chapter, so there is nothing to separate yet.");
    }

    const lastTab = await tx.researchBinderTab.findFirst({
      where: { bookId, stageId: stage.id },
      orderBy: { orderIndex: "desc" },
    });
    const nextOrderIndex = (lastTab?.orderIndex ?? -1) + 1;

    await tx.researchBinderTab.update({
      where: { id: source.id },
      data: {
        chapterKeysJson: stringifyChapterKeys(
          sourceChapterKeys.filter((value) => value !== chapterKey),
        ),
      },
    });

    return tx.researchBinderTab.create({
      data: {
        bookId,
        stageId: stage.id,
        label: newLabel,
        colorToken: RESEARCH_BINDER_COLORS[nextOrderIndex % RESEARCH_BINDER_COLORS.length],
        orderIndex: nextOrderIndex,
        chapterKeysJson: stringifyChapterKeys([chapterKey]),
      },
    });
  });
}

export async function createResearchIdeaClip(input: {
  bookId: string;
  binderTabId: string;
  chapterKey?: string;
  title?: string;
  content: string;
}) {
  const stage = await requireResearchStage(input.bookId);
  const lastIdea = await db.researchIdeaClip.findFirst({
    where: {
      bookId: input.bookId,
      stageId: stage.id,
      binderTabId: input.binderTabId,
    },
    orderBy: { orderIndex: "desc" },
  });

  return db.researchIdeaClip.create({
    data: {
      bookId: input.bookId,
      stageId: stage.id,
      binderTabId: input.binderTabId,
      chapterKey: input.chapterKey,
      title: input.title,
      content: input.content,
      orderIndex: (lastIdea?.orderIndex ?? -1) + 1,
    },
  });
}

export async function deleteResearchIdeaClip(bookId: string, ideaId: string) {
  await requireResearchStage(bookId);

  const idea = await db.researchIdeaClip.findFirstOrThrow({
    where: { id: ideaId, bookId },
  });

  return db.researchIdeaClip.delete({ where: { id: idea.id } });
}

export function getBinderTabChapterKeys(chapterKeysJson: Prisma.JsonValue | null | undefined) {
  return parseChapterKeys(chapterKeysJson);
}
