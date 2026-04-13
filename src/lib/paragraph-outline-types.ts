export type ParagraphPlan = {
  id: string;
  number: number;
  topicSentence: string;
  mainIdea: string;
  purpose: string;
  contentType: string;
  wordCountTarget: number;
  hook?: string;
  structuralElement?: string;
};

export type ParagraphStructureBlock = {
  label: string;
  paragraphRange: string;
  wordCountTarget: number;
};

export type ChapterParagraphPlan = {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  chapterDescription: string;
  chapterWordCountTarget: number;
  calculationDisplay: string;
  structureLabel?: string;
  structureBlocks: ParagraphStructureBlock[];
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

function describeRange(start: number, end: number) {
  return start === end ? `Para ${start}` : `Paras ${start}-${end}`;
}

function buildCalculationDisplay(chapter: ChapterParagraphPlan) {
  if (chapter.paragraphs.length === 0) {
    return `No paragraphs defined = ${chapter.chapterWordCountTarget} words`;
  }

  return `${chapter.paragraphs
    .map(
      (paragraph) =>
        `[Para ${paragraph.number}: ${paragraph.wordCountTarget} words]`,
    )
    .join(" + ")} = [Chapter total: ${chapter.chapterWordCountTarget} words]`;
}

function buildStructureBlocks(chapter: ChapterParagraphPlan): ParagraphStructureBlock[] {
  if (chapter.paragraphs.length === 0) {
    return [];
  }

  const blocks: ParagraphStructureBlock[] = [];
  let startIndex = 0;

  for (let index = 1; index <= chapter.paragraphs.length; index += 1) {
    const current = chapter.paragraphs[index];
    const previous = chapter.paragraphs[index - 1];
    const boundary =
      !current || current.structuralElement !== previous.structuralElement;

    if (!boundary) {
      continue;
    }

    const segment = chapter.paragraphs.slice(startIndex, index);
    blocks.push({
      label: previous.structuralElement || "Core Flow",
      paragraphRange: describeRange(startIndex + 1, index),
      wordCountTarget: segment.reduce(
        (sum, paragraph) => sum + Math.max(0, Math.round(paragraph.wordCountTarget || 0)),
        0,
      ),
    });
    startIndex = index;
  }

  return blocks;
}

export function renumberParagraphOutline(outline: ParagraphOutline): ParagraphOutline {
  let chapterNumber = 1;

  return {
    ...outline,
    sections: (outline.sections ?? []).map((section, sectionIndex) => ({
      ...section,
      sectionNumber: sectionIndex + 1,
      chapters: (section.chapters ?? []).map((chapter) => {
        const paragraphs = (chapter.paragraphs ?? []).map((paragraph, paragraphIndex) => {
          const mainIdea =
            typeof paragraph.mainIdea === "string" && paragraph.mainIdea.trim().length > 0
              ? paragraph.mainIdea.trim()
              : typeof paragraph.topicSentence === "string" &&
                  paragraph.topicSentence.trim().length > 0
                ? paragraph.topicSentence.trim()
                : `Paragraph ${paragraphIndex + 1} idea pending.`;

          const purpose =
            typeof paragraph.purpose === "string" && paragraph.purpose.trim().length > 0
              ? paragraph.purpose.trim()
              : "Clarify what this paragraph contributes to the chapter.";

          return {
            ...paragraph,
            number: paragraphIndex + 1,
            mainIdea,
            topicSentence: mainIdea,
            purpose,
            contentType:
              typeof paragraph.contentType === "string" && paragraph.contentType.trim().length > 0
                ? paragraph.contentType.trim()
                : "framework",
            wordCountTarget: Math.max(
              0,
              Math.round(paragraph.wordCountTarget || 0),
            ),
            hook:
              typeof paragraph.hook === "string" && paragraph.hook.trim().length > 0
                ? paragraph.hook.trim()
                : "[No hook]",
            structuralElement:
              typeof paragraph.structuralElement === "string" &&
              paragraph.structuralElement.trim().length > 0
                ? paragraph.structuralElement.trim()
                : undefined,
          };
        });

        const normalizedChapter: ChapterParagraphPlan = {
          ...chapter,
          chapterNumber: chapterNumber++,
          chapterWordCountTarget: Math.max(
            0,
            Math.round(chapter.chapterWordCountTarget || 0),
          ),
          paragraphs,
          structureBlocks:
            Array.isArray(chapter.structureBlocks) && chapter.structureBlocks.length > 0
              ? chapter.structureBlocks.map((block) => ({
                  ...block,
                  wordCountTarget: Math.max(
                    0,
                    Math.round(block.wordCountTarget || 0),
                  ),
                }))
              : buildStructureBlocks({
                  ...chapter,
                  chapterNumber: chapter.chapterNumber,
                  chapterWordCountTarget: Math.max(
                    0,
                    Math.round(chapter.chapterWordCountTarget || 0),
                  ),
                  paragraphs,
                  calculationDisplay: "",
                  structureBlocks: [],
                }),
          calculationDisplay: buildCalculationDisplay({
            ...chapter,
            chapterNumber: chapter.chapterNumber,
            chapterWordCountTarget: Math.max(
              0,
              Math.round(chapter.chapterWordCountTarget || 0),
            ),
            paragraphs,
            structureBlocks: [],
            calculationDisplay: "",
          }),
        };

        return normalizedChapter;
      }),
    })),
  };
}
