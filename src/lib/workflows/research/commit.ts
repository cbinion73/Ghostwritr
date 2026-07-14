import {
  parseMetadataRecord,
} from "../../artifact-schemas";
import {
  ArtifactStatus,
  Prisma,
  StageKey,
  StageStatus,
} from "@prisma/client";

import {
  getOrCreateBookBySlug,
  getStageForBook,
  updateStageForBook,
} from "../../repositories/books";
import {
  commitResearchPack,
  getLatestResearchPackVersionsByChapter,
} from "../../repositories/research-artifacts";
import {
  clearStageStaleDependency,
  invalidateDependentStagesForBook,
} from "../../workflow-dependencies";
import {
  getResearchChapterSeeds,
} from "./chapter-seeds";
import {
  recentActivity,
} from "./run-progress";

export async function commitChapterResearchWorkflow(bookSlug: string, chapterKey: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const result = await commitResearchPack(book.id, chapterKey);
  await clearStageStaleDependency(bookSlug, StageKey.RESEARCH, { chapterIds: [chapterKey] });
  await invalidateDependentStagesForBook(bookSlug, StageKey.RESEARCH, { chapterIds: [chapterKey] });
  return result;
}

export async function commitAllResearchWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.RESEARCH);
  const { chapterSeeds } = await getResearchChapterSeeds(book.id);

  if (chapterSeeds.length === 0) {
    throw new Error("No committed outline chapters are available for research commit.");
  }

  const committedChapterKeys: string[] = [];
  const missingChapterKeys: string[] = [];
  const latestVersionsByChapter = await getLatestResearchPackVersionsByChapter(
    book.id,
    chapterSeeds.map((chapter) => chapter.chapterKey),
  );

  for (const chapter of chapterSeeds) {
    const latestVersion = latestVersionsByChapter.get(chapter.chapterKey) ?? null;
    if (!latestVersion) {
      missingChapterKeys.push(chapter.chapterKey);
      continue;
    }

    if (latestVersion.lifecycleState !== ArtifactStatus.COMMITTED) {
      await commitResearchPack(book.id, chapter.chapterKey);
    }

    committedChapterKeys.push(chapter.chapterKey);
  }

  const metadata = parseMetadataRecord(stage?.metadataJson);
  const now = new Date().toISOString();

  await updateStageForBook(book.id, StageKey.RESEARCH, {
    status:
      missingChapterKeys.length === 0 ? StageStatus.COMMITTED : StageStatus.READY_FOR_REVIEW,
    committedAt: missingChapterKeys.length === 0 ? new Date() : undefined,
    metadataJson: {
      ...metadata,
      automationStatus: missingChapterKeys.length === 0 ? "committed" : "ready_for_review",
      currentAction:
        missingChapterKeys.length === 0
          ? "All research dossiers committed"
          : `Committed ${committedChapterKeys.length} research dossiers. ${missingChapterKeys.length} still missing.`,
      totalChapters: chapterSeeds.length,
      completedChapters: committedChapterKeys.length,
      failedChapters: [],
      currentChapterKey: null,
      recentActivity: recentActivity(
        Array.isArray(metadata.recentActivity)
          ? (metadata.recentActivity as Array<{ at: string; message: string }>)
          : undefined,
        missingChapterKeys.length === 0
          ? "Committed all research dossiers."
          : `Committed all available research dossiers. Missing: ${missingChapterKeys.join(", ")}`,
      ),
      lastRunAt: now,
    } as Prisma.InputJsonValue,
  });
  await clearStageStaleDependency(bookSlug, StageKey.RESEARCH, { chapterIds: committedChapterKeys });
  await invalidateDependentStagesForBook(bookSlug, StageKey.RESEARCH, { chapterIds: committedChapterKeys });

  return {
    committedChapterKeys,
    missingChapterKeys,
    totalChapters: chapterSeeds.length,
  };
}
