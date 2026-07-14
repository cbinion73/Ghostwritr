import type { BookOutline } from "./outline-types";
import type { ChapterParagraphPlan, ParagraphOutline } from "./paragraph-outline-types";

export type OutlineLinkageIssue = {
  code:
    | "missing-paragraph-plan"
    | "orphan-paragraph-plan"
    | "duplicate-outline-chapter-id"
    | "duplicate-paragraph-chapter-id"
    | "chapter-order-mismatch"
    | "word-count-target-mismatch";
  chapterId: string;
  message: string;
};

export type OutlineLinkageReport = {
  isLinked: boolean;
  outlineChapterIds: string[];
  paragraphChapterIds: string[];
  issues: OutlineLinkageIssue[];
};

export function assembleLinkedParagraphOutline(
  outline: Pick<BookOutline, "workingTitle" | "sections">,
  chapterPlans: ChapterParagraphPlan[],
): ParagraphOutline {
  const planByChapterId = new Map<string, ChapterParagraphPlan>();

  for (const plan of chapterPlans) {
    if (!planByChapterId.has(plan.chapterId)) {
      planByChapterId.set(plan.chapterId, plan);
    }
  }

  return {
    workingTitle: outline.workingTitle,
    overview: `Chapter-by-chapter paragraph blueprints for "${outline.workingTitle}" based on the locked outline.`,
    sections: outline.sections.map((section) => ({
      sectionId: section.id,
      sectionNumber: section.number,
      sectionTitle: section.title,
      sectionDescription: section.description,
      chapters: section.chapters
        .map((chapter) => planByChapterId.get(chapter.id))
        .filter((plan): plan is ChapterParagraphPlan => Boolean(plan)),
    })),
  };
}

function flattenParagraphChapters(paragraphOutline: ParagraphOutline | null | undefined) {
  return paragraphOutline?.sections.flatMap((section) => section.chapters) ?? [];
}

function findDuplicates(ids: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }

  return [...duplicates];
}

export function validateLinkedOutlinePackage(
  outline: Pick<BookOutline, "sections"> | null | undefined,
  paragraphOutline: ParagraphOutline | null | undefined,
): OutlineLinkageReport {
  const outlineChapters = outline?.sections.flatMap((section) => section.chapters) ?? [];
  const paragraphChapters = flattenParagraphChapters(paragraphOutline);
  const outlineChapterIds = outlineChapters.map((chapter) => chapter.id);
  const paragraphChapterIds = paragraphChapters.map((chapter) => chapter.chapterId);
  const paragraphByChapterId = new Map<string, ChapterParagraphPlan>();
  const issues: OutlineLinkageIssue[] = [];

  for (const chapter of paragraphChapters) {
    if (!paragraphByChapterId.has(chapter.chapterId)) {
      paragraphByChapterId.set(chapter.chapterId, chapter);
    }
  }

  for (const chapterId of findDuplicates(outlineChapterIds)) {
    issues.push({
      code: "duplicate-outline-chapter-id",
      chapterId,
      message: `High-level outline contains duplicate chapter ID "${chapterId}".`,
    });
  }

  for (const chapterId of findDuplicates(paragraphChapterIds)) {
    issues.push({
      code: "duplicate-paragraph-chapter-id",
      chapterId,
      message: `Paragraph outline contains duplicate chapter ID "${chapterId}".`,
    });
  }

  for (const chapter of outlineChapters) {
    const paragraphChapter = paragraphByChapterId.get(chapter.id);
    if (!paragraphChapter) {
      issues.push({
        code: "missing-paragraph-plan",
        chapterId: chapter.id,
        message: `Chapter "${chapter.title}" (${chapter.id}) is missing a paragraph plan.`,
      });
      continue;
    }

    if (Math.round(chapter.wordCountTarget || 0) !== Math.round(paragraphChapter.chapterWordCountTarget || 0)) {
      issues.push({
        code: "word-count-target-mismatch",
        chapterId: chapter.id,
        message: `Chapter "${chapter.title}" (${chapter.id}) target is ${chapter.wordCountTarget}, but its paragraph plan target is ${paragraphChapter.chapterWordCountTarget}.`,
      });
    }
  }

  const outlineChapterIdSet = new Set(outlineChapterIds);
  for (const paragraphChapter of paragraphChapters) {
    if (!outlineChapterIdSet.has(paragraphChapter.chapterId)) {
      issues.push({
        code: "orphan-paragraph-plan",
        chapterId: paragraphChapter.chapterId,
        message: `Paragraph plan "${paragraphChapter.chapterTitle}" points at chapter ID "${paragraphChapter.chapterId}", which is not in the high-level outline.`,
      });
    }
  }

  const sharedParagraphOrder = paragraphChapterIds.filter((chapterId) => outlineChapterIdSet.has(chapterId));
  const expectedOrder = outlineChapterIds.filter((chapterId) => paragraphChapterIds.includes(chapterId));
  if (
    sharedParagraphOrder.length === expectedOrder.length &&
    sharedParagraphOrder.some((chapterId, index) => chapterId !== expectedOrder[index])
  ) {
    issues.push({
      code: "chapter-order-mismatch",
      chapterId: "book",
      message: "Paragraph outline chapter order does not match the high-level outline order.",
    });
  }

  return {
    isLinked: Boolean(outline) && Boolean(paragraphOutline) && issues.length === 0,
    outlineChapterIds,
    paragraphChapterIds,
    issues,
  };
}

export function assertLinkedOutlinePackage(
  outline: Pick<BookOutline, "sections"> | null | undefined,
  paragraphOutline: ParagraphOutline | null | undefined,
) {
  const report = validateLinkedOutlinePackage(outline, paragraphOutline);
  if (!report.isLinked) {
    throw new Error(
      [
        "High-level outline and paragraph-level outline are not linked by stable chapter IDs.",
        ...report.issues.map((issue) => issue.message),
      ].join(" "),
    );
  }
  return report;
}
