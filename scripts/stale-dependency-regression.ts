import { PrismaClient, StageKey, StageStatus } from "@prisma/client";

import {
  clearStageStaleDependency,
  invalidateDependentStagesForBook,
} from "../src/lib/workflow-dependencies";

const db = new PrismaClient();

type StageSnapshot = {
  status: StageStatus;
  metadataJson: unknown;
};

async function snapshotStages(bookId: string, stageKeys: StageKey[]) {
  const stages = await db.bookStage.findMany({
    where: {
      bookId,
      stageKey: { in: stageKeys },
    },
  });

  return new Map(
    stages.map((stage) => [
      stage.stageKey,
      {
        status: stage.status,
        metadataJson: stage.metadataJson,
      } satisfies StageSnapshot,
    ]),
  );
}

async function restoreStages(bookId: string, snapshots: Map<StageKey, StageSnapshot>) {
  for (const [stageKey, snapshot] of snapshots) {
    await db.bookStage.updateMany({
      where: { bookId, stageKey },
      data: {
        status: snapshot.status,
        metadataJson: snapshot.metadataJson as never,
      },
    });
  }
}

async function verifyInvalidation(params: {
  slug: string;
  changedStageKey: StageKey;
  affectedStageKeys: StageKey[];
}) {
  const { slug, changedStageKey, affectedStageKeys } = params;
  const book = await db.book.findUniqueOrThrow({ where: { slug } });
  const snapshots = await snapshotStages(book.id, affectedStageKeys);

  try {
    await invalidateDependentStagesForBook(slug, changedStageKey);

    const invalidated = await db.bookStage.findMany({
      where: {
        bookId: book.id,
        stageKey: { in: affectedStageKeys },
      },
    });

    for (const stage of invalidated) {
      if (stage.status !== StageStatus.BLOCKED) {
        throw new Error(`${slug}:${stage.stageKey} did not block after ${changedStageKey} invalidation.`);
      }

      const staleDependency =
        stage.metadataJson &&
        typeof stage.metadataJson === "object" &&
        "staleDependency" in (stage.metadataJson as Record<string, unknown>)
          ? (stage.metadataJson as Record<string, unknown>).staleDependency
          : null;

      if (!staleDependency || typeof staleDependency !== "object") {
        throw new Error(`${slug}:${stage.stageKey} is missing staleDependency metadata.`);
      }
    }

    await clearStageStaleDependency(slug, affectedStageKeys[0]);

    const cleared = await db.bookStage.findFirstOrThrow({
      where: {
        bookId: book.id,
        stageKey: affectedStageKeys[0],
      },
    });

    if (cleared.status !== StageStatus.READY_FOR_REVIEW) {
      throw new Error(`${slug}:${affectedStageKeys[0]} did not clear back to READY_FOR_REVIEW.`);
    }

    const metadata =
      cleared.metadataJson && typeof cleared.metadataJson === "object"
        ? (cleared.metadataJson as Record<string, unknown>)
        : {};

    if ("staleDependency" in metadata) {
      throw new Error(`${slug}:${affectedStageKeys[0]} still has staleDependency metadata after clearing.`);
    }

    return {
      slug,
      changedStageKey,
      affectedStageKeys,
      ok: true,
    };
  } finally {
    await restoreStages(book.id, snapshots);
  }
}

async function main() {
  const results = await Promise.all([
    verifyInvalidation({
      slug: "nonfiction-smoke",
      changedStageKey: StageKey.OUTLINE,
      affectedStageKeys: [StageKey.BASE_STORY, StageKey.RESEARCH, StageKey.CHAPTER_DRAFT, StageKey.EDITING],
    }),
    verifyInvalidation({
      slug: "fiction-smoke",
      changedStageKey: StageKey.SCENE_PLAN,
      affectedStageKeys: [StageKey.FICTION_DRAFT, StageKey.EDITING],
    }),
  ]);

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
