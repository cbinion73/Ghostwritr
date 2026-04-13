export type OutlinePersonaResonance = {
  audienceSegment: string;
  whyThisResonates: string;
  priority?: "primary" | "secondary";
};

export type OutlineVoiceBlendEmphasis = {
  primary: string;
  secondary?: string;
  tertiary?: string;
  reasoning: string;
};

export type OutlineStructureBlock = {
  label: string;
  paragraphRange: string;
  purpose: string;
  wordCountTarget: number;
};

export type OutlineParagraph = {
  id: string;
  number: number;
  mainIdea: string;
  whatGetsConveyed: string;
  whyItExists: string;
  wordCountTarget: number;
  structuralElement: string;
};

export type OutlineChapter = {
  id: string;
  number: number;
  title: string;
  subtitle?: string;
  bigIdea: string; // The single powerful insight this chapter teaches
  description: string;
  whyThisChapterExists: string;
  coreIdea: string;
  whatGetsConveyed: string[];
  storytellingTechnique: string;
  personasThatResonate: OutlinePersonaResonance[];
  voiceBlendEmphasis: OutlineVoiceBlendEmphasis;
  readerTransformationByEnd: string;
  stageCoverage: string[];
  wordCountTarget: number;
  calculationDisplay: string;
  internalStructureLabel: string;
  internalStructure: OutlineStructureBlock[];
  openingHook: string;
  closingBridge: string;
  paragraphs: OutlineParagraph[];
};

export type OutlineSection = {
  id: string;
  number: number;
  title: string;
  subtitle?: string;
  bigIdea: string; // The overarching theme that binds this section's chapters
  description: string;
  whyThisSectionExists: string;
  whatItCovers: string;
  howItServesTheLargerStory: string;
  stageCoverage: string[];
  wordCountTarget: number;
  calculationDisplay: string;
  chapters: OutlineChapter[];
};

export type OutlineStageMapping = {
  stage: string;
  sectionNumbers: number[];
  explanation: string;
};

export type OutlineWordCountVerification = {
  bookTargetWordCount: number;
  sectionWordCountTotal: number;
  chapterWordCountTotal: number;
  paragraphWordCountTotal: number;
  verified: boolean;
  notes: string[];
};

export type OutlineGenerationMeta = {
  source: "sonnet" | "fallback" | "unknown";
  model?: string;
  reason?: string;
  generatedAt?: string;
};

export type BookOutline = {
  workingTitle: string;
  subtitle?: string;
  overview: string;
  structureRationale: string;
  readerTransformation: string;
  targetWordCount: number;
  stageMapping: OutlineStageMapping[];
  wordCountVerification: OutlineWordCountVerification;
  sections: OutlineSection[];
  generationMeta?: OutlineGenerationMeta;
};

function sumWordCounts(values: number[]) {
  return values.reduce((sum, value) => sum + Math.max(0, Math.round(value || 0)), 0);
}

function buildChapterCalculationDisplay(chapter: OutlineChapter) {
  if (!chapter.paragraphs.length) {
    return `No paragraphs defined = ${chapter.wordCountTarget} words`;
  }

  return `${chapter.paragraphs
    .map((paragraph) => `[Para ${paragraph.number}: ${paragraph.wordCountTarget} words]`)
    .join(" + ")} = [Chapter total: ${chapter.wordCountTarget} words]`;
}

function buildSectionCalculationDisplay(section: OutlineSection) {
  if (!section.chapters.length) {
    return `No chapters defined = ${section.wordCountTarget} words`;
  }

  return `${section.chapters
    .map((chapter) => `[Chapter ${chapter.number}: ${chapter.wordCountTarget} words]`)
    .join(" + ")} = [Section total: ${section.wordCountTarget} words]`;
}

export function calculateOutlineWordCountVerification(
  outline: Pick<BookOutline, "targetWordCount" | "sections">,
): OutlineWordCountVerification {
  const sectionWordCountTotal = sumWordCounts(
    outline.sections.map((section) => section.wordCountTarget),
  );
  const chapterWordCountTotal = sumWordCounts(
    outline.sections.flatMap((section) =>
      section.chapters.map((chapter) => chapter.wordCountTarget),
    ),
  );
  const paragraphWordCountTotal = sumWordCounts(
    outline.sections.flatMap((section) =>
      section.chapters.flatMap((chapter) =>
        chapter.paragraphs.map((paragraph) => paragraph.wordCountTarget),
      ),
    ),
  );

  const notes: string[] = [];

  if (sectionWordCountTotal !== outline.targetWordCount) {
    notes.push(
      `Section totals (${sectionWordCountTotal}) do not match the book target (${outline.targetWordCount}).`,
    );
  }

  if (chapterWordCountTotal !== sectionWordCountTotal) {
    notes.push(
      `Chapter totals (${chapterWordCountTotal}) do not match section totals (${sectionWordCountTotal}).`,
    );
  }

  if (paragraphWordCountTotal !== chapterWordCountTotal) {
    notes.push(
      `Paragraph totals (${paragraphWordCountTotal}) do not match chapter totals (${chapterWordCountTotal}).`,
    );
  }

  return {
    bookTargetWordCount: outline.targetWordCount,
    sectionWordCountTotal,
    chapterWordCountTotal,
    paragraphWordCountTotal,
    verified: notes.length === 0,
    notes,
  };
}

export function renumberBookOutline(outline: BookOutline): BookOutline {
  let chapterNumber = 1;

  const sections = (outline.sections ?? []).map((section, sectionIndex) => {
    const chapters = (section.chapters ?? []).map((chapter) => {
      const paragraphs = (chapter.paragraphs ?? []).map((paragraph, paragraphIndex) => ({
        ...paragraph,
        number: paragraphIndex + 1,
        wordCountTarget: Math.max(0, Math.round(paragraph.wordCountTarget || 0)),
      }));

      const normalizedChapter: OutlineChapter = {
        ...chapter,
        number: chapterNumber++,
        wordCountTarget: Math.max(0, Math.round(chapter.wordCountTarget || 0)),
        paragraphs,
        calculationDisplay: buildChapterCalculationDisplay({
          ...chapter,
          number: chapter.number,
          paragraphs,
          wordCountTarget: Math.max(0, Math.round(chapter.wordCountTarget || 0)),
        }),
      };

      return normalizedChapter;
    });

    const normalizedSection: OutlineSection = {
      ...section,
      number: sectionIndex + 1,
      wordCountTarget: Math.max(0, Math.round(section.wordCountTarget || 0)),
      chapters,
      calculationDisplay: buildSectionCalculationDisplay({
        ...section,
        number: sectionIndex + 1,
        chapters,
        wordCountTarget: Math.max(0, Math.round(section.wordCountTarget || 0)),
      }),
    };

    return normalizedSection;
  });

  const normalized: BookOutline = {
    ...outline,
    targetWordCount: Math.max(0, Math.round(outline.targetWordCount || 0)),
    sections,
    wordCountVerification:
      outline.wordCountVerification ?? calculateOutlineWordCountVerification(outline),
  };

  return {
    ...normalized,
    wordCountVerification: calculateOutlineWordCountVerification(normalized),
  };
}
