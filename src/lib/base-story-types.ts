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

export type BaseStoryChapter = {
  chapterKey: string;
  chapterLabel: string;
  chapterPurpose: string;
  threadRole: string;
  chapterStory: string;
  movement: TensionReleaseMovement;
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
  chapters: BaseStoryChapter[];
};
