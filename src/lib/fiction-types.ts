export type StorySetupArtifact = {
  summary: string;
  premise: string;
  genre: string;
  subgenre?: string | null;
  targetAudience: string;
  tone: string;
  pointOfView: string;
  tense: string;
  targetLength: string;
  comparableTitles: string[];
  storyQuestion: string;
  authorIntent: string;
};

export type StoryCoreArtifact = {
  summary: string;
  theme: string;
  controllingIdea: string;
  protagonist: string;
  protagonistNeed: string;
  antagonistForce: string;
  centralConflict: string;
  stakes: string;
  transformationArc: string;
  storyPromise: string;
};

export type WorldCastCharacter = {
  name: string;
  role: string;
  desire: string;
  flaw: string;
  pressure: string;
  relationshipNotes: string;
};

export type WorldCastArtifact = {
  summary: string;
  setting: string;
  worldRules: string[];
  atmosphere: string;
  institutions: string[];
  characters: WorldCastCharacter[];
};

export type PlotBlueprintChapterBeat = {
  chapterNumber: number;
  title: string;
  beat: string;
  pointOfView: string;
  purpose: string;
  conflict: string;
  turn: string;
  hook: string;
  targetWords: number;
};

export type PlotBlueprintArtifact = {
  summary: string;
  structureModel: string;
  actSummaries: string[];
  turningPoints: string[];
  chapterBeats: PlotBlueprintChapterBeat[];
};

export type ScenePlanScene = {
  sceneNumber: number;
  title: string;
  location: string;
  pointOfView: string;
  objective: string;
  conflict: string;
  outcome: string;
  reveal: string;
  bridge: string;
};

export type ScenePlanChapter = {
  chapterNumber: number;
  title: string;
  pointOfView: string;
  purpose: string;
  summary: string;
  targetWords: number;
  scenes: ScenePlanScene[];
};

export type ScenePlanArtifact = {
  summary: string;
  continuityRules: string[];
  chapters: ScenePlanChapter[];
};

export type FictionDraftQualitySignal = {
  label: string;
  state: "pass" | "warn" | "fail";
  detail: string;
};

export type FictionDraftQualitySummary = {
  score: number;
  readiness: "strong" | "watch" | "needs attention";
  needsRevision: boolean;
  revisionPasses: number;
  signals: FictionDraftQualitySignal[];
};

export type FictionDraftChapter = {
  chapterKey: string;
  chapterNumber: number;
  title: string;
  pointOfView: string;
  summary: string;
  text: string;
  wordCount: number;
  quality: FictionDraftQualitySummary;
};

export type FictionDraftArtifact = {
  summary: string;
  totalWords: number;
  chapterCount: number;
  chapters: FictionDraftChapter[];
  fullText: string;
};
