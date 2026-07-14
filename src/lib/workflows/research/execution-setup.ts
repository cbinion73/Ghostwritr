import type { BaseStoryBundle } from "../../base-story-types";
import { normalizeBookSetupProfile } from "../../book-setup-types";
import type { BookOutline } from "../../outline-types";
import type { ParagraphOutline } from "../../paragraph-outline-types";
import { getCommittedBookSetup } from "../../repositories/book-setup-artifacts";
import { getOrCreateBookBySlug, getStageForBook } from "../../repositories/books";
import { resolveResearchLens, type ResearchLens } from "../../research-lenses";
import { getResearchChapterSeeds } from "./chapter-seeds";

export type ChapterContext = {
  chapterKey: string;
  chapterTitle: string;
  chapterDescription: string;
  sectionId?: string;
  sectionTitle?: string;
  baseStoryChapterPurpose?: string;
  baseStoryChapterThread?: string;
  baseStoryBookThread?: string;
  paragraphs: Array<{
    paragraphId: string;
    topicSentence: string;
    purpose: string;
  }>;
};

export function getChapterContext(
  chapterKey: string,
  outline: BookOutline | null,
  paragraphOutline: ParagraphOutline | null,
): ChapterContext | null {
  if (paragraphOutline) {
    for (const section of paragraphOutline.sections) {
      const chapter = section.chapters.find((item) => item.chapterId === chapterKey);
      if (chapter) {
        return {
          chapterKey,
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          sectionId: section.sectionId,
          sectionTitle: section.sectionTitle,
          paragraphs: chapter.paragraphs.map((paragraph) => ({
            paragraphId: paragraph.id,
            topicSentence: paragraph.topicSentence,
            purpose: paragraph.purpose,
          })),
        };
      }
    }
  }

  if (outline) {
    for (const section of outline.sections) {
      const chapter = section.chapters.find((item) => item.id === chapterKey);
      if (chapter) {
        return {
          chapterKey,
          chapterTitle: chapter.title,
          chapterDescription: chapter.description,
          sectionId: section.id,
          sectionTitle: section.title,
          paragraphs: [],
        };
      }
    }
  }

  return null;
}

export function getBaseStoryChapterContext(
  baseStory: BaseStoryBundle | null,
  chapterKey: string,
) {
  if (!baseStory) {
    return null;
  }

  const chapter = baseStory.chapters.find((entry) => entry.chapterKey === chapterKey);
  if (!chapter) {
    return null;
  }

  return {
    baseStoryChapterPurpose: chapter.chapterPurpose,
    baseStoryChapterThread: chapter.guidance.draftingInstruction,
    baseStoryBookThread: baseStory.narrativeGuidance.throughLine,
  };
}

export async function getResearchChapterExecutionSetup(
  bookSlug: string,
  chapterKey: string,
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const { outline, paragraphOutline, baseStory } = await getResearchChapterSeeds(book.id);

  const chapter = getChapterContext(chapterKey, outline, paragraphOutline);
  if (!chapter) {
    throw new Error(`Committed chapter ${chapterKey} was not found`);
  }
  const chapterContext: ChapterContext = {
    ...chapter,
    ...getBaseStoryChapterContext(baseStory, chapterKey),
  };

  // Per-book research lens (set in Book Setup) reframes questions, search
  // queries, extraction, and verification for the book's actual genre —
  // without this, every book's Research search used the same "peer
  // reviewed study" / "government data" phrasing regardless of subject.
  const committedSetup = await getCommittedBookSetup(book.id);
  const setupProfile = normalizeBookSetupProfile(committedSetup?.contentJson);
  const baseLens = resolveResearchLens(setupProfile?.researchLens);
  // Fold the author's preferred Bible translation into the lens's own
  // directives so every downstream prompt that reads lens.directives picks
  // it up automatically, without threading a second parameter everywhere.
  const lens: ResearchLens =
    baseLens.key === "biblical" && setupProfile?.preferredBibleTranslation
      ? {
          ...baseLens,
          directives: `${baseLens.directives}\n\nTRANSLATION PREFERENCE: Quote scripture in the ${setupProfile.preferredBibleTranslation} translation unless a specific source only provides another translation — in that case, quote the source's translation but note the difference.`,
        }
      : baseLens;
  const bookMeta = book.metadataJson && typeof book.metadataJson === "object"
    ? (book.metadataJson as Record<string, unknown>)
    : {};
  const bookSubject = [
    typeof bookMeta.premise === "string" ? bookMeta.premise : null,
    book.titleWorking,
  ].filter(Boolean).join(" ").slice(0, 80);

  // Read quality feedback if this is a retry.
  const stage = await getStageForBook(book.id, "RESEARCH");
  const qualityFeedback =
    stage?.metadataJson && typeof stage.metadataJson === "object"
      ? (stage.metadataJson as Record<string, unknown>).lastQualityFeedback
      : null;

  return {
    book,
    chapter,
    chapterContext,
    lens,
    bookSubject,
    qualityFeedback,
  };
}
