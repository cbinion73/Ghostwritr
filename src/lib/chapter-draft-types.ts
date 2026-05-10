export type ChapterDraftParagraph = {
  id: string;
  topicSentence: string;
  prose: string;
  sourceNotes: string[];
};

export type ChapterDraftQualitySignal = {
  label: string;
  state: "pass" | "warn" | "fail";
  detail: string;
};

export type ChapterDraftQualitySummary = {
  score: number;
  readiness: "strong" | "watch" | "needs attention";
  needsRevision: boolean;
  revisionPasses: number;
  signals: ChapterDraftQualitySignal[];
};

export type ChapterDraftBundle = {
  chapterKey: string;
  chapterTitle: string;
  chapterDescription: string;
  sectionTitle: string;
  openingHook: string;
  narrativeThread: string;
  chapterText: string;
  paragraphs: ChapterDraftParagraph[];
  sourceUsage: {
    research: string[];
    externalStories: string[];
    personalStories: string[];
    baseStory: string[];
  };
  quality: ChapterDraftQualitySummary;
};

export type ChapterReviewBundle = {
  chapterKey: string;
  overallAssessment: string;
  strengths: string[];
  concerns: string[];
  revisionPriorities: string[];
  aiAuthorshipFlags: string[];
  verdict: "ready_for_review" | "needs_revision";
};
