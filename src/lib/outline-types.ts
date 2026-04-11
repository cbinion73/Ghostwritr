export type OutlineChapter = {
  id: string;
  number: number;
  title: string;
  description: string;
};

export type OutlineSection = {
  id: string;
  number: number;
  title: string;
  description: string;
  chapters: OutlineChapter[];
};

export type BookOutline = {
  workingTitle: string;
  overview: string;
  readerTransformation: string;
  sections: OutlineSection[];
};

export function renumberBookOutline(outline: BookOutline): BookOutline {
  let chapterNumber = 1;

  return {
    ...outline,
    sections: outline.sections.map((section, sectionIndex) => ({
      ...section,
      number: sectionIndex + 1,
      chapters: section.chapters.map((chapter) => ({
        ...chapter,
        number: chapterNumber++,
      })),
    })),
  };
}
