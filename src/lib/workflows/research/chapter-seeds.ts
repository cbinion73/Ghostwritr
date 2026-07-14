import {
  BaseStoryBundleSchema,
  BookOutlineSchema,
  ParagraphOutlineSchema,
  parseArtifactWithSchema,
} from "../../artifact-schemas";
import type { BaseStoryBundle } from "../../base-story-types";
import {
  normalizeBaseStoryBundle,
  validateBaseStoryGuidanceContract,
} from "../../base-story-utils";
import type { BookOutline } from "../../outline-types";
import type { ParagraphOutline } from "../../paragraph-outline-types";
import { getCommittedBaseStory } from "../../repositories/base-story-artifacts";
import {
  getCommittedOutline,
  getCommittedOutlineExpansion,
} from "../../repositories/outline-artifacts";

export type WorkspaceChapterSeed = {
  chapterKey: string;
  chapterLabel: string;
  chapterTitle: string;
  sectionTitle?: string;
};

// Only research real narrative chapters — skip outline section headers like
// "Big question: ...", "Pillars: ...", "Full Book Outline", etc. that Atlas
// sometimes places as chapter entries in the outline JSON.
const REAL_CHAPTER_RE = /^(introduction|epilogue|prologue|conclusion|closing|afterword|foreword|preface|chapter\s+\d+)/i;

export function isRealChapter(title: string): boolean {
  // REAL_CHAPTER_RE matches generic/structural labels (front-matter words,
  // bare "Chapter N" placeholders) — a title matches when it's NOT one of
  // those, i.e. when it's a real, descriptively-titled chapter.
  return !REAL_CHAPTER_RE.test(title.trim());
}

export function getWorkspaceChapterSeeds(
  outline: BookOutline | null,
  paragraphOutline: ParagraphOutline | null,
): WorkspaceChapterSeed[] {
  if (paragraphOutline) {
    return paragraphOutline.sections.flatMap((section) =>
      section.chapters
        .filter((chapter) => isRealChapter(chapter.chapterTitle))
        .map((chapter) => ({
          chapterKey: chapter.chapterId,
          chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`,
          chapterTitle: chapter.chapterTitle,
          sectionTitle: section.sectionTitle,
        })),
    );
  }

  if (outline) {
    return outline.sections.flatMap((section) =>
      section.chapters
        .filter((chapter) => isRealChapter(chapter.title))
        .map((chapter) => ({
          chapterKey: chapter.id,
          chapterLabel: `Chapter ${chapter.number}: ${chapter.title}`,
          chapterTitle: chapter.title,
          sectionTitle: section.title,
        })),
    );
  }

  return [];
}

function getParagraphOutlineChapterKeys(paragraphOutline: ParagraphOutline | null) {
  return (
    paragraphOutline?.sections.flatMap((section) =>
      section.chapters.map((chapter) => chapter.chapterId),
    ) ?? []
  );
}

export function assertBaseStoryReadyForResearch(
  baseStory: BaseStoryBundle | null,
  paragraphOutline: ParagraphOutline | null,
) {
  const contract = validateBaseStoryGuidanceContract(
    baseStory,
    getParagraphOutlineChapterKeys(paragraphOutline),
  );
  if (!contract.ok) {
    throw new Error(`Base Story is not ready for Research: ${contract.issues.join(" ")}`);
  }
}

export async function getResearchChapterSeeds(bookId: string) {
  const [outlineVersion, paragraphVersion, baseStoryVersion] = await Promise.all([
    getCommittedOutline(bookId),
    getCommittedOutlineExpansion(bookId),
    getCommittedBaseStory(bookId),
  ]);
  const outline = parseArtifactWithSchema(outlineVersion?.contentJson, BookOutlineSchema);
  const paragraphOutline = parseArtifactWithSchema(
    paragraphVersion?.contentJson,
    ParagraphOutlineSchema,
  );
  const baseStory = normalizeBaseStoryBundle(
    parseArtifactWithSchema(baseStoryVersion?.contentJson, BaseStoryBundleSchema),
  );
  assertBaseStoryReadyForResearch(baseStory, paragraphOutline);

  return {
    outline,
    paragraphOutline,
    baseStory,
    chapterSeeds: getWorkspaceChapterSeeds(outline, paragraphOutline),
  };
}
