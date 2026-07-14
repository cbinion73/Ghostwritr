import { Prisma, StageKey, StageStatus } from "@prisma/client";

import { getWorkflowAttemptLimit } from "../../retry-policy";
import { getOrCreateBookBySlug, updateStageForBook } from "../../repositories/books";
import { getCommittedBaseStory } from "../../repositories/base-story-artifacts";
import {
  runChapterResearchWorkflowImpl,
} from "./chapter-live-pipeline";
import { getResearchChapterSeeds } from "./chapter-seeds";
import { runWithResearchChapterAttribution } from "./execution-context";
import {
  pulseResearchStage,
  recentActivity,
  wasResearchWorkflowCanceled,
} from "./run-progress";
import {
  recordResearchChapterOutcome,
  researchChapterProgressMessage,
  shouldRetryResearchChapterResult,
  type ResearchFailedChapter,
} from "./run-results";

// Wraps the real implementation in a nested ambient LLM context tagging
// every call this chapter makes with its chapterKey, for per-chapter cost
// attribution (the stage/workflow-level context set by the caller — e.g.
// the internal workflow-runs route — has no per-chapter granularity on its
// own). Falls through untagged if no outer context exists (e.g. a script
// calling this directly without runWithLLMContext) rather than fabricating
// a bookId, matching the existing "only log when ambient context exists"
// design.
export async function runChapterResearchWorkflow(bookSlug: string, chapterKey: string) {
  return runWithResearchChapterAttribution(chapterKey, () =>
    runChapterResearchWorkflowImpl(bookSlug, chapterKey),
  );
}

type ResearchRunOptions = {
  chapterKeys?: string[];
  preserveCompletedCount?: number;
  preserveProvisionalChapters?: string[];
};

function getResearchChapterRetryLimit() {
  return getWorkflowAttemptLimit("RESEARCH_CHAPTER_RETRY_LIMIT");
}

export async function runFullResearchWorkflow(
  bookSlug: string,
  runId?: string,
  options: ResearchRunOptions = {},
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const baseStoryVersion = await getCommittedBaseStory(book.id);
  if (!baseStoryVersion) {
    throw new Error("A committed Base Story is required before Research can run.");
  }
  const { chapterSeeds: allChapterSeeds } = await getResearchChapterSeeds(book.id);
  const requestedChapterKeys = new Set(options.chapterKeys ?? []);
  const chapterSeeds =
    requestedChapterKeys.size > 0
      ? allChapterSeeds.filter((chapter) => requestedChapterKeys.has(chapter.chapterKey))
      : allChapterSeeds;

  if (chapterSeeds.length === 0) {
    throw new Error("No committed chapters are available for research generation.");
  }

  const preservedCompletedCount = options.preserveCompletedCount ?? 0;
  const provisionalChapters = [...new Set(options.preserveProvisionalChapters ?? [])];
  const chapterRetryLimit = getResearchChapterRetryLimit();

  await updateStageForBook(book.id, StageKey.RESEARCH, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "running",
      currentAction: "Searching and verifying sources",
      totalChapters: allChapterSeeds.length,
      completedChapters: preservedCompletedCount,
      failedChapters: [],
      provisionalChapters,
      currentChapterKey: chapterSeeds[0]?.chapterKey ?? null,
      recentActivity: recentActivity(
        undefined,
        requestedChapterKeys.size > 0
          ? `Resumed research for ${chapterSeeds.length} failed chapter${chapterSeeds.length === 1 ? "" : "s"}.`
          : "Started full research run.",
      ),
      lastRunAt: new Date().toISOString(),
    } as Prisma.InputJsonValue,
  });

  const completedChapterKeys: string[] = [];
  const failedChapters: ResearchFailedChapter[] = [];

  for (const [index, chapter] of chapterSeeds.entries()) {
    if (await wasResearchWorkflowCanceled(runId)) {
      await updateStageForBook(book.id, StageKey.RESEARCH, {
        status: StageStatus.READY_FOR_REVIEW,
        metadataJson: {
          automationStatus: "canceled",
          currentAction: "Canceled by user",
          totalChapters: allChapterSeeds.length,
          completedChapters: preservedCompletedCount + completedChapterKeys.length,
          failedChapters,
          provisionalChapters,
          currentChapterKey: null,
          recentActivity: recentActivity(
            undefined,
            `Research run canceled after completing ${completedChapterKeys.length} of ${allChapterSeeds.length} chapters.`,
          ),
          lastRunAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      });
      return {
        totalChapters: allChapterSeeds.length,
        completedChapterKeys,
        failedChapters,
        canceled: true,
      };
    }

    let chapterFailedMessage: string | null = null;
    let finalResult: Awaited<ReturnType<typeof runChapterResearchWorkflowImpl>> | null = null;

    for (let attempt = 1; attempt <= chapterRetryLimit; attempt += 1) {
      try {
        const result = await runWithResearchChapterAttribution(chapter.chapterKey, () =>
          runChapterResearchWorkflowImpl(bookSlug, chapter.chapterKey),
        );
        const shouldRetry = shouldRetryResearchChapterResult(
          result,
          attempt,
          chapterRetryLimit,
        );

        if (shouldRetry) {
          await pulseResearchStage({
            bookId: book.id,
            currentChapterKey: chapter.chapterKey,
            currentAction: "Retrying chapter research",
            message: `Retrying ${chapter.chapterTitle} after provisional result`,
          });
          continue;
        }

        finalResult = result;
        break;
      } catch (error) {
        chapterFailedMessage =
          error instanceof Error ? error.message : "Unknown research error";

        if (attempt < chapterRetryLimit) {
          await pulseResearchStage({
            bookId: book.id,
            currentChapterKey: chapter.chapterKey,
            currentAction: "Retrying chapter research",
            message: `Retrying ${chapter.chapterTitle} after error`,
          });
          continue;
        }
      }
    }

    recordResearchChapterOutcome({
      chapterKey: chapter.chapterKey,
      chapterTitle: chapter.chapterTitle,
      finalResult,
      chapterFailedMessage,
      completedChapterKeys,
      provisionalChapters,
      failedChapters,
    });

    if (await wasResearchWorkflowCanceled(runId)) {
      await updateStageForBook(book.id, StageKey.RESEARCH, {
        status: StageStatus.READY_FOR_REVIEW,
        metadataJson: {
          automationStatus: "canceled",
          currentAction: "Canceled by user",
          totalChapters: allChapterSeeds.length,
          completedChapters: preservedCompletedCount + completedChapterKeys.length,
          failedChapters,
          provisionalChapters,
          currentChapterKey: null,
          recentActivity: recentActivity(
            undefined,
            `Research run canceled after completing ${completedChapterKeys.length} of ${allChapterSeeds.length} chapters.`,
          ),
          lastRunAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      });
      return {
        totalChapters: allChapterSeeds.length,
        completedChapterKeys,
        failedChapters,
        canceled: true,
      };
    }

    await updateStageForBook(book.id, StageKey.RESEARCH, {
      status: StageStatus.IN_PROGRESS,
      metadataJson: {
        automationStatus: "running",
        currentAction:
          chapterSeeds[index + 1]?.chapterKey != null
            ? "Searching and verifying sources"
            : "Finishing research dossier review",
        totalChapters: allChapterSeeds.length,
        completedChapters: preservedCompletedCount + completedChapterKeys.length,
        failedChapters,
        provisionalChapters,
        currentChapterKey: chapterSeeds[index + 1]?.chapterKey ?? null,
        recentActivity: recentActivity(
          undefined,
          researchChapterProgressMessage({
            chapterKey: chapter.chapterKey,
            chapterTitle: chapter.chapterTitle,
            failedChapters,
            provisionalChapters,
          }),
        ),
        lastRunAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    });
  }

  await updateStageForBook(book.id, StageKey.RESEARCH, {
    status:
      failedChapters.length > 0 ? StageStatus.BLOCKED : StageStatus.READY_FOR_REVIEW,
    metadataJson: {
      automationStatus: failedChapters.length > 0 ? "blocked" : "ready_for_review",
      currentAction:
        failedChapters.length > 0
          ? "Needs retry after search failures"
          : provisionalChapters.length > 0
            ? "Provisional dossiers ready for review"
            : "Ready for review",
      totalChapters: allChapterSeeds.length,
      completedChapters: preservedCompletedCount + completedChapterKeys.length,
      failedChapters,
      provisionalChapters,
      currentChapterKey: null,
      recentActivity: recentActivity(
        undefined,
        failedChapters.length > 0
          ? `Research run ended with ${failedChapters.length} failed chapter${failedChapters.length === 1 ? "" : "s"}.`
          : provisionalChapters.length > 0
            ? `Generated ${provisionalChapters.length} provisional dossier${provisionalChapters.length === 1 ? "" : "s"}.`
          : "Research run completed successfully.",
      ),
      lastRunAt: new Date().toISOString(),
    } as Prisma.InputJsonValue,
  });

  return {
    totalChapters: allChapterSeeds.length,
    completedChapterKeys,
    failedChapters,
    provisionalChapters,
  };
}
