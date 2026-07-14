export type BaseStoryFormat =
  | "PARABLE"
  | "HERO_JOURNEY"
  | "GUIDE_JOURNEY"
  | "COMPOSITE_CHARACTER"
  | "CASE_JOURNEY"
  | "MOSAIC_VIGNETTES"
  | "QUEST"
  | "RISE_FALL_REDEMPTION"
  | "LETTER_FRAME"
  | "FIELD_MANUAL_NARRATIVE";

export type TensionReleaseMovement = {
  me: string;
  we: string;
  truth: string;
  you: string;
  weClosing: string;
};

export type BaseStoryBoundary = {
  kind: "base_story_guidance";
  personalStoryPolicy: string;
};

export type BookWideNarrativeGuidance = {
  premise: string;
  throughLine: string;
  movement: TensionReleaseMovement;
  continuityRules: string[];
  boundary: BaseStoryBoundary;
};

export type ChapterNarrativeGuidance = {
  narrativeFunction: string;
  continuityCue: string;
  draftingInstruction: string;
  movement: TensionReleaseMovement;
  boundary: BaseStoryBoundary;
};

export type BaseStoryChapter = {
  chapterKey: string;
  chapterLabel: string;
  chapterPurpose: string;
  threadRole: string;
  /**
   * Legacy field name. This is narrative guidance for how the chapter carries
   * the book-wide spine, not a confirmed author story and not final prose.
   */
  chapterStory: string;
  movement: TensionReleaseMovement;
  guidance: ChapterNarrativeGuidance;
};

export type BaseStoryBundle = {
  workingTitle: string;
  selectedFormat: BaseStoryFormat;
  availableFormats: Array<{
    format: BaseStoryFormat;
    label: string;
    description: string;
    bestFor: string;
  }>;
  storyPremise: string;
  bookThread: string;
  bookMovement: TensionReleaseMovement;
  narrativeGuidance: BookWideNarrativeGuidance;
  chapters: BaseStoryChapter[];
};
