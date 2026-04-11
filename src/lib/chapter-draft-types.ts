export type ChapterDraftParagraph = {
  id: string;
  topicSentence: string;
  prose: string;
  sourceNotes: string[];
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
