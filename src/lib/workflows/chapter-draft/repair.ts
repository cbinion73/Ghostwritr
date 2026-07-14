import {
  ArtifactType,
  StageKey,
  StageStatus,
} from "@prisma/client";

import {
  ChapterDraftBundleSchema,
  ChapterReviewBundleSchema,
  parseArtifactWithSchema,
} from "../../artifact-schemas";
import { countWords } from "../../manuscript-metrics";
import {
  getBookBySlugOrThrow,
  updateStageForBook,
} from "../../repositories/books";
import {
  commitChapterDraft,
  getChapterArtifactVersions,
} from "../../repositories/chapter-draft-artifacts";
import {
  getDraftInputs,
  type ChapterContext,
} from "./context";
import {
  buildChapterWordTargets,
} from "./workspace-support";
import {
  expandSingleChapterDraftTowardTarget,
  generateSingleChapterDraft,
} from "./execution";
import {
  commitAllChapterDraftsWorkflow,
} from "./commit";

export async function expandChapterDraftTowardTargetWorkflow(bookSlug: string, chapterKey: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { phase1StrategicBrief, promise, chapterContexts, baseStory, personalStories, bookSetup } =
    await getDraftInputs(book.id);
  const context = chapterContexts.find((entry) => entry.chapter.chapterId === chapterKey);
  if (!context) {
    throw new Error(`Chapter ${chapterKey} could not be found in the committed paragraph outline.`);
  }

  const chapterTargets = buildChapterWordTargets(chapterContexts, bookSetup?.targetWordCount);
  return expandSingleChapterDraftTowardTarget({
    bookId: book.id,
    phase1StrategicBrief,
    promise,
    context,
    baseStory,
    personalStories,
    bookSetup,
    chapterTarget: chapterTargets.get(context.chapter.chapterId) ?? null,
  });
}

export async function expandUnderTargetChapterDraftsWorkflow(bookSlug: string, limit = 2) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { phase1StrategicBrief, promise, chapterContexts, baseStory, personalStories, bookSetup } =
    await getDraftInputs(book.id);
  const chapterTargets = buildChapterWordTargets(chapterContexts, bookSetup?.targetWordCount);
  const candidates: Array<{ context: ChapterContext; deficit: number }> = [];

  for (const context of chapterContexts) {
    const latestDraftVersion = (await getChapterArtifactVersions(
      book.id,
      context.chapter.chapterId,
      ArtifactType.CHAPTER_DRAFT,
      1,
    ))[0];
    const latestDraft = latestDraftVersion
      ? parseArtifactWithSchema(latestDraftVersion.contentJson, ChapterDraftBundleSchema)
      : null;
    const target = chapterTargets.get(context.chapter.chapterId) ?? null;
    const currentWords = countWords(latestDraft?.chapterText ?? "");
    if (latestDraft && target && currentWords < target.minimumWords) {
      candidates.push({
        context,
        deficit: target.minimumWords - currentWords,
      });
    }
  }

  const selected = candidates
    .sort((left, right) => right.deficit - left.deficit)
    .slice(0, Math.max(1, limit));

  const results = [];
  for (const candidate of selected) {
    results.push(
      await expandSingleChapterDraftTowardTarget({
        bookId: book.id,
        phase1StrategicBrief,
        promise,
        context: candidate.context,
        baseStory,
        personalStories,
        bookSetup,
        chapterTarget: chapterTargets.get(candidate.context.chapter.chapterId) ?? null,
      }),
    );
  }

  return {
    expandedChapterKeys: results.filter((entry) => entry.expanded).map((entry) => entry.chapterKey),
    inspectedChapterCount: chapterContexts.length,
    results,
  };
}

export async function repairWeakChapterDraftsWorkflow(bookSlug: string, limit = 3) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { phase1StrategicBrief, promise, chapterContexts, baseStory, personalStories, bookSetup } =
    await getDraftInputs(book.id);
  const chapterTargets = buildChapterWordTargets(chapterContexts, bookSetup?.targetWordCount);

  const weakContexts: ChapterContext[] = [];
  for (const context of chapterContexts) {
    const [draftVersions, reviewVersions] = await Promise.all([
      getChapterArtifactVersions(book.id, context.chapter.chapterId, ArtifactType.CHAPTER_DRAFT, 1),
      getChapterArtifactVersions(book.id, context.chapter.chapterId, ArtifactType.EDITORIAL_REVIEW, 1),
    ]);
    const latestDraft = draftVersions[0]
      ? parseArtifactWithSchema(draftVersions[0].contentJson, ChapterDraftBundleSchema)
      : null;
    const latestReview = reviewVersions[0]
      ? parseArtifactWithSchema(reviewVersions[0].contentJson, ChapterReviewBundleSchema)
      : null;

    const needsRepair = Boolean(
      latestDraft &&
        latestDraft.chapterText.trim().length > 0 &&
        (
          !latestDraft.quality ||
          latestDraft.quality.signals.length === 0 ||
          latestDraft.quality.needsRevision ||
          latestReview?.verdict === "needs_revision"
        ),
    );

    if (needsRepair) {
      weakContexts.push(context);
    }
  }

  const targetContexts = weakContexts.slice(0, Math.max(1, limit));
  if (targetContexts.length === 0) {
    return {
      repairedChapterKeys: [],
      inspectedChapterCount: chapterContexts.length,
    };
  }

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: StageStatus.IN_PROGRESS,
    metadataJson: {
      automationStatus: "repairing_weak_chapters",
      totalChapters: targetContexts.length,
      completedChapters: 0,
      currentChapterKey: targetContexts[0]?.chapter.chapterId ?? null,
      currentAction: "Repairing weak chapter drafts",
      lastRunAt: new Date().toISOString(),
    },
  });

  const repairedChapterKeys: string[] = [];
  for (const [index, context] of targetContexts.entries()) {
    await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
      status: StageStatus.IN_PROGRESS,
      metadataJson: {
        automationStatus: "repairing_weak_chapters",
        totalChapters: targetContexts.length,
        completedChapters: index,
        currentChapterKey: context.chapter.chapterId,
        currentAction: `Repairing ${context.chapter.chapterTitle}`,
        lastRunAt: new Date().toISOString(),
      },
    });

    await generateSingleChapterDraft(
      book.id,
      phase1StrategicBrief,
      promise,
      context,
      baseStory,
      personalStories,
      bookSetup,
      chapterTargets.get(context.chapter.chapterId) ?? null,
    );
    await commitChapterDraft(book.id, context.chapter.chapterId);
    repairedChapterKeys.push(context.chapter.chapterId);
  }

  await commitAllChapterDraftsWorkflow(bookSlug);

  return {
    repairedChapterKeys,
    inspectedChapterCount: chapterContexts.length,
  };
}
