import {
  ArtifactType,
  StageKey,
} from "@prisma/client";

import {
  ChapterDraftBundleSchema,
  ChapterReviewBundleSchema,
  parseArtifactWithSchema,
  parseMetadataRecord,
} from "../../artifact-schemas";
import type { BaseStoryBundle } from "../../base-story-types";
import type { BookSetupProfile } from "../../book-setup-types";
import { estimatePagesFromWords } from "../../manuscript-metrics";
import type { Phase1StrategicBrief } from "../../phase1-strategic-brief";
import type { PersonalStoryEncyclopedia } from "../../personal-story-types";
import { getChapterArtifactVersions } from "../../repositories/chapter-draft-artifacts";
import { listChapterApprovalStates } from "../../repositories/chapter-approval-state";
import {
  getBookBySlugOrThrow,
  getStageForBook,
} from "../../repositories/books";
import {
  getDraftInputs,
  validateQuillContextReadiness,
  type ChapterContext,
} from "./context";
import { getChapterDraftSourceContext } from "./source-availability";
import {
  buildChapterDraftMetrics,
  buildChapterDraftProgress,
  buildChapterDraftSourceAvailability,
  buildChapterWordTargets,
  projectChapterDraftApprovalState,
  summarizeQuillContextForAuthor,
} from "./workspace-support";

export async function getChapterDraftWorkspace(bookSlug: string, selectedChapterKey?: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.CHAPTER_DRAFT);
  const metadata = parseMetadataRecord(stage?.metadataJson);
  let chapterContexts: ChapterContext[] = [];
  let baseStory: BaseStoryBundle | null = null;
  let personalStories: PersonalStoryEncyclopedia | null = null;
  let bookSetup: BookSetupProfile | null = null;
  let phase1StrategicBrief: Phase1StrategicBrief | null = null;
  let blockingReason: string | null = null;

  try {
    const inputs = await getDraftInputs(book.id);
    chapterContexts = inputs.chapterContexts;
    baseStory = inputs.baseStory;
    personalStories = inputs.personalStories;
    bookSetup = inputs.bookSetup;
    phase1StrategicBrief = inputs.phase1StrategicBrief;
  } catch (error) {
    blockingReason = error instanceof Error ? error.message : "Chapter draft inputs are not ready.";
  }

  const chapterTargets = buildChapterWordTargets(chapterContexts, bookSetup?.targetWordCount);
  const approvalStates = new Map(
    (await listChapterApprovalStates(book.id)).map((state) => [state.chapterId, state]),
  );

  const entries = await Promise.all(
    chapterContexts.map(async (context) => {
      const [draftVersions, reviewVersions, sourceContext] = await Promise.all([
        getChapterArtifactVersions(book.id, context.chapter.chapterId, ArtifactType.CHAPTER_DRAFT, 2),
        getChapterArtifactVersions(book.id, context.chapter.chapterId, ArtifactType.EDITORIAL_REVIEW, 2),
        getChapterDraftSourceContext({
          bookId: book.id,
          chapterKey: context.chapter.chapterId,
          chapterTitle: context.chapter.chapterTitle,
          baseStory,
          personalStories,
        }),
      ]);

      const latestDraft = draftVersions[0]
        ? parseArtifactWithSchema(draftVersions[0].contentJson, ChapterDraftBundleSchema)
        : null;
      const latestReview = reviewVersions[0]
        ? parseArtifactWithSchema(reviewVersions[0].contentJson, ChapterReviewBundleSchema)
        : null;
      const { research, externalStories, personalStoryCards: personalMatches, baseStoryChapter } =
        sourceContext;
      const quillReadiness = validateQuillContextReadiness({
        phase1StrategicBrief,
        context,
        research,
        externalStories,
        personalStories,
        baseStoryChapter,
        bookSetupProfile: bookSetup,
      });
      const chapterTarget = chapterTargets.get(context.chapter.chapterId) ?? null;
      const approvalState = approvalStates.get(context.chapter.chapterId) ?? null;
      const metrics = buildChapterDraftMetrics({
        chapterText: latestDraft?.chapterText,
        bookSetup,
        chapterTarget,
      });
      const sourceAvailability = buildChapterDraftSourceAvailability({
        research,
        externalStories,
        personalStories: personalMatches,
        baseStoryChapter,
      });

      return {
        chapterKey: context.chapter.chapterId,
        chapterLabel: `Chapter ${context.chapter.chapterNumber}: ${context.chapter.chapterTitle}`,
        chapterTitle: context.chapter.chapterTitle,
        chapterDescription: context.chapter.chapterDescription,
        sectionTitle: context.section.sectionTitle,
        draftVersion: draftVersions[0] ?? null,
        reviewVersion: reviewVersions[0] ?? null,
        draft: latestDraft,
        review: latestReview,
        status: draftVersions[0]?.lifecycleState ?? "EMPTY",
        approvalState: projectChapterDraftApprovalState(approvalState),
        metrics,
        sourceAvailability,
        research,
        externalStories,
        personalStories: personalMatches,
        baseStoryChapter,
        quillContextSummary: summarizeQuillContextForAuthor(quillReadiness),
      };
    }),
  );

  const selectedEntry =
    entries.find((entry) => entry.chapterKey === selectedChapterKey) ?? entries[0] ?? null;
  const totalWords = entries.reduce((sum, entry) => sum + entry.metrics.wordCount, 0);
  const totalPages = entries.reduce((sum, entry) => sum + entry.metrics.pageCount, 0);
  const targetWordCount = bookSetup?.targetWordCount ?? null;
  const targetPageCount =
    bookSetup?.targetPageCount ??
    (targetWordCount
      ? estimatePagesFromWords(targetWordCount, bookSetup?.trimSize ?? "6 x 9 in")
      : null);
  const chaptersCompletedFromEntries = entries.filter((entry) => entry.metrics.wordCount > 0).length;

  return {
    book,
    stage,
    blockingReason,
    entries,
    selectedEntry,
    progress: buildChapterDraftProgress({
      metadata,
      entryCount: entries.length,
      totalWords,
      totalPages,
      targetWordCount,
      targetPageCount,
      completedChapterCount: chaptersCompletedFromEntries,
    }),
    setup: bookSetup,
  };
}
