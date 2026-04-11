export type ParagraphPlan = {
  id: string;
  topicSentence: string;
  purpose: string;
};

export type ChapterParagraphPlan = {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  chapterDescription: string;
  paragraphs: ParagraphPlan[];
};

export type SectionParagraphPlan = {
  sectionId: string;
  sectionNumber: number;
  sectionTitle: string;
  sectionDescription: string;
  chapters: ChapterParagraphPlan[];
};

export type ParagraphOutline = {
  workingTitle: string;
  overview: string;
  sections: SectionParagraphPlan[];
};

export function renumberParagraphOutline(outline: ParagraphOutline): ParagraphOutline {
  let chapterNumber = 1;

  return {
    ...outline,
    sections: outline.sections.map((section, sectionIndex) => ({
      ...section,
      sectionNumber: sectionIndex + 1,
      chapters: section.chapters.map((chapter) => ({
        ...chapter,
        chapterNumber: chapterNumber++,
      })),
    })),
  };
}
