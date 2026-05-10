import type {
  FictionDraftArtifact,
  PlotBlueprintArtifact,
  ScenePlanArtifact,
  StoryCoreArtifact,
  StorySetupArtifact,
  WorldCastArtifact,
} from "./fiction-types";

export function countScenePlanScenes(scenePlan: ScenePlanArtifact | null) {
  return scenePlan?.chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0) ?? 0;
}

export function countDraftedChapters(draft: FictionDraftArtifact | null) {
  return draft?.chapters.filter((chapter) => chapter.text.trim().length > 0 && chapter.wordCount > 0).length ?? 0;
}

export function sumDraftWords(draft: FictionDraftArtifact | null) {
  return draft?.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0) ?? 0;
}

export function getFictionChapterNumbers(input: {
  plotBlueprint?: PlotBlueprintArtifact | null;
  scenePlan?: ScenePlanArtifact | null;
  draft?: FictionDraftArtifact | null;
}) {
  const numbers = new Set<number>();
  for (const chapter of input.plotBlueprint?.chapterBeats ?? []) {
    numbers.add(chapter.chapterNumber);
  }
  for (const chapter of input.scenePlan?.chapters ?? []) {
    numbers.add(chapter.chapterNumber);
  }
  for (const chapter of input.draft?.chapters ?? []) {
    numbers.add(chapter.chapterNumber);
  }

  return [...numbers].sort((left, right) => left - right);
}

export function getFictionStoryMemory(input: {
  storySetup?: StorySetupArtifact | null;
  storyCore?: StoryCoreArtifact | null;
  worldCast?: WorldCastArtifact | null;
}) {
  return {
    premise: input.storySetup?.premise ?? null,
    genre: input.storySetup?.genre ?? null,
    tone: input.storySetup?.tone ?? null,
    pointOfView: input.storySetup?.pointOfView ?? null,
    theme: input.storyCore?.theme ?? null,
    storyPromise: input.storyCore?.storyPromise ?? null,
    centralConflict: input.storyCore?.centralConflict ?? null,
    transformationArc: input.storyCore?.transformationArc ?? null,
    worldRules: input.worldCast?.worldRules ?? [],
    characters: input.worldCast?.characters ?? [],
    setting: input.worldCast?.setting ?? null,
    atmosphere: input.worldCast?.atmosphere ?? null,
  };
}

export function getSelectedPlotBeat(plotBlueprint: PlotBlueprintArtifact | null, chapterNumber: number | null) {
  if (!plotBlueprint || !chapterNumber) {
    return null;
  }

  return plotBlueprint.chapterBeats.find((chapter) => chapter.chapterNumber === chapterNumber) ?? null;
}

export function getSelectedSceneChapter(scenePlan: ScenePlanArtifact | null, chapterNumber: number | null) {
  if (!scenePlan || !chapterNumber) {
    return null;
  }

  return scenePlan.chapters.find((chapter) => chapter.chapterNumber === chapterNumber) ?? null;
}

export function getSelectedDraftChapter(draft: FictionDraftArtifact | null, chapterNumber: number | null) {
  if (!draft || !chapterNumber) {
    return null;
  }

  return draft.chapters.find((chapter) => chapter.chapterNumber === chapterNumber) ?? null;
}

export function getFictionNextStep(input: {
  storySetup?: StorySetupArtifact | null;
  storyCore?: StoryCoreArtifact | null;
  worldCast?: WorldCastArtifact | null;
  plotBlueprint?: PlotBlueprintArtifact | null;
  scenePlan?: ScenePlanArtifact | null;
  draft?: FictionDraftArtifact | null;
}) {
  if (!input.storySetup) {
    return {
      label: "Generate Story Setup",
      href: "story-setup",
      detail: "Lock genre, tone, POV, tense, audience, and the premise before story architecture starts.",
    };
  }
  if (!input.storyCore) {
    return {
      label: "Build Story Core",
      href: "story-core",
      detail: "Define the theme, pressure system, and the emotional engine of the novel.",
    };
  }
  if (!input.worldCast) {
    return {
      label: "Map World & Cast",
      href: "world-cast",
      detail: "Clarify the setting, rules, and the characters that make the conflict personal.",
    };
  }
  if (!input.plotBlueprint) {
    return {
      label: "Shape the Plot Blueprint",
      href: "plot-blueprint",
      detail: "Turn the premise into chapter beats and turning points.",
    };
  }
  if (!input.scenePlan) {
    return {
      label: "Build the Scene Plan",
      href: "scene-plan",
      detail: "Translate the chapter beats into scene-level objectives, conflict, reveals, and bridges.",
    };
  }
  const draftedChapters = countDraftedChapters(input.draft ?? null);
  const plannedChapters = input.scenePlan.chapters.length;
  if (!input.draft || draftedChapters < plannedChapters) {
    return {
      label: "Draft the Next Chapter",
      href: "draft",
      detail: `${draftedChapters}/${plannedChapters} chapters currently have prose. Use the scene workspace to draft forward.`,
    };
  }

  return {
    label: "Open Editing",
    href: "editing",
    detail: "The manuscript has full chapter coverage and is ready for whole-book revision.",
  };
}
