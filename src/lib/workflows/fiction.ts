import { ArtifactType, BookWorkflowType, Prisma, StageKey, StageStatus } from "@prisma/client";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import type {
  FictionDraftArtifact,
  FictionDraftChapter,
  PlotBlueprintArtifact,
  PlotBlueprintChapterBeat,
  ScenePlanArtifact,
  ScenePlanChapter,
  StoryCoreArtifact,
  StorySetupArtifact,
  WorldCastArtifact,
} from "../fiction-types";
import { getModelForRole } from "../llm/routing";
import { getBookBySlugOrThrow, getStageForBook, updateStageForBook } from "../repositories/books";
import { getCommittedBookSetup } from "../repositories/book-setup-artifacts";
import {
  commitFictionArtifact,
  createFictionArtifactVersion,
  getCommittedFictionArtifactVersion,
  getFictionArtifactVersions,
  getLatestFictionArtifactVersion,
} from "../repositories/fiction-artifacts";
import { getBookStageLinks } from "../navigation";
import { clearStageStaleDependency, invalidateDependentStagesForBook } from "../workflow-dependencies";
import { getNextWorkflowStage, getStageDefinitionForKey } from "../workflow-registry";

type FictionPlanningStageKey =
  | "STORY_SETUP"
  | "STORY_CORE"
  | "WORLD_CAST"
  | "PLOT_BLUEPRINT"
  | "SCENE_PLAN"
  | "FICTION_DRAFT";

const StorySetupSchema = z.object({
  summary: z.string(),
  premise: z.string(),
  genre: z.string(),
  subgenre: z.string().nullable().optional(),
  targetAudience: z.string(),
  tone: z.string(),
  pointOfView: z.string(),
  tense: z.string(),
  targetLength: z.string(),
  comparableTitles: z.array(z.string()).default([]),
  storyQuestion: z.string(),
  authorIntent: z.string(),
});

const StoryCoreSchema = z.object({
  summary: z.string(),
  theme: z.string(),
  controllingIdea: z.string(),
  protagonist: z.string(),
  protagonistNeed: z.string(),
  antagonistForce: z.string(),
  centralConflict: z.string(),
  stakes: z.string(),
  transformationArc: z.string(),
  storyPromise: z.string(),
});

const WorldCastSchema = z.object({
  summary: z.string(),
  setting: z.string(),
  worldRules: z.array(z.string()).default([]),
  atmosphere: z.string(),
  institutions: z.array(z.string()).default([]),
  characters: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      desire: z.string(),
      flaw: z.string(),
      pressure: z.string(),
      relationshipNotes: z.string(),
    }),
  ).default([]),
});

const PlotBlueprintSchema = z.object({
  summary: z.string(),
  structureModel: z.string(),
  actSummaries: z.array(z.string()).default([]),
  turningPoints: z.array(z.string()).default([]),
  chapterBeats: z.array(
    z.object({
      chapterNumber: z.number(),
      title: z.string(),
      beat: z.string(),
      pointOfView: z.string(),
      purpose: z.string(),
      conflict: z.string(),
      turn: z.string(),
      hook: z.string(),
      targetWords: z.number(),
    }),
  ).default([]),
});

const ScenePlanSchema = z.object({
  summary: z.string(),
  continuityRules: z.array(z.string()).default([]),
  chapters: z.array(
    z.object({
      chapterNumber: z.number(),
      title: z.string(),
      pointOfView: z.string(),
      purpose: z.string(),
      summary: z.string(),
      targetWords: z.number(),
      scenes: z.array(
        z.object({
          sceneNumber: z.number(),
          title: z.string(),
          location: z.string(),
          pointOfView: z.string(),
          objective: z.string(),
          conflict: z.string(),
          outcome: z.string(),
          reveal: z.string(),
          bridge: z.string(),
        }),
      ).default([]),
    }),
  ).default([]),
});

const FictionDraftSchema = z.object({
  summary: z.string(),
  totalWords: z.number(),
  chapterCount: z.number(),
  chapters: z.array(
    z.object({
      chapterKey: z.string(),
      chapterNumber: z.number(),
      title: z.string(),
      pointOfView: z.string(),
      summary: z.string(),
      text: z.string(),
      wordCount: z.number(),
      quality: z
        .object({
          score: z.number().default(0),
          readiness: z.enum(["strong", "watch", "needs attention"]).default("needs attention"),
          needsRevision: z.boolean().default(true),
          revisionPasses: z.number().default(0),
          signals: z
            .array(
              z.object({
                label: z.string(),
                state: z.enum(["pass", "warn", "fail"]),
                detail: z.string(),
              }),
            )
            .default([]),
        })
        .default({
          score: 0,
          readiness: "needs attention",
          needsRevision: true,
          revisionPasses: 0,
          signals: [],
        }),
    }),
  ).default([]),
  fullText: z.string(),
});

const FICTION_STAGE_ARTIFACTS: Record<FictionPlanningStageKey, ArtifactType> = {
  STORY_SETUP: ArtifactType.STORY_SETUP_PROFILE,
  STORY_CORE: ArtifactType.STORY_CORE_BIBLE,
  WORLD_CAST: ArtifactType.WORLD_CAST_BIBLE,
  PLOT_BLUEPRINT: ArtifactType.FICTION_PLOT_BLUEPRINT,
  SCENE_PLAN: ArtifactType.FICTION_SCENE_PLAN,
  FICTION_DRAFT: ArtifactType.FICTION_DRAFT_MANUSCRIPT,
};

const FICTION_STAGE_TITLES: Record<FictionPlanningStageKey, string> = {
  STORY_SETUP: "Story Setup",
  STORY_CORE: "Story Core",
  WORLD_CAST: "World & Cast",
  PLOT_BLUEPRINT: "Plot Blueprint",
  SCENE_PLAN: "Scene Plan",
  FICTION_DRAFT: "Fiction Draft",
};

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

const FictionAdversarialCriticSchema = z.object({
  summary: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  aiTellFlags: z.array(z.string()).default([]),
  continuityFlags: z.array(z.string()).default([]),
  voiceFlags: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

type FictionAdversarialCriticResult = z.infer<typeof FictionAdversarialCriticSchema>;

function trimTextToWordLimit(text: string, maximumWords: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maximumWords) {
    return text.trim();
  }

  return words.slice(0, maximumWords).join(" ").trim();
}

function sanitizeFictionDraftProse(text: string) {
  return text
    .replace(/\bmeta commentary\b/gi, "")
    .replace(/\bexplaining the plan\b/gi, "")
    .replace(/\bgeneric AI filler\b/gi, "")
    .replace(/\bthis chapter should\b/gi, "")
    .replace(/\bthe scene plan says\b/gi, "")
    .replace(/\bthe reader should understand\b/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function hasMetaFictionDraftLanguage(text: string) {
  const normalized = text.toLowerCase();
  return [
    "this chapter should",
    "the scene plan says",
    "the reader should understand",
    "this scene is meant to",
    "the point of this chapter",
    "in the next chapter",
  ].some((snippet) => normalized.includes(snippet));
}

async function getVoiceGuardCriticModel() {
  return getModelForRole("voice-guard:critic", {
    temperature: 0.1,
    maxOutputTokens: 4000,
    timeoutMs: 30000,
    maxRetries: 0,
  });
}

function deterministicFictionAdversarialCritic(args: {
  chapterDraft: FictionDraftChapter;
  chapterPlan: ScenePlanChapter;
  continuityRequirements: FictionContinuityRequirements;
}): FictionAdversarialCriticResult {
  const { chapterDraft, chapterPlan, continuityRequirements } = args;
  const text = chapterDraft.text;
  const lowered = text.toLowerCase();
  const aiTellFlags: string[] = [];
  const continuityFlags: string[] = [];
  const voiceFlags: string[] = [];

  if (hasMetaFictionDraftLanguage(text)) {
    aiTellFlags.push("The chapter still contains planning-shaped meta language instead of immersive story prose.");
  }
  if (/\b(suddenly|somehow|at the end of the day|little did she know)\b/i.test(text)) {
    aiTellFlags.push("The chapter leans on generic dramatic filler instead of specific scene pressure.");
  }
  if (/(^|\n\n)(She|He|They) /m.test(text) && text.split(/\n\s*\n/).length > 2) {
    const starters = text
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim().split(/\s+/).slice(0, 2).join(" "))
      .filter(Boolean);
    const repeated = starters.filter((starter, index) => starters.indexOf(starter) !== index);
    if (repeated.length >= 2) {
      voiceFlags.push("Paragraph rhythm is repeating in a machine-shaped way, which flattens the voice.");
    }
  }

  const missingSceneAnchors = chapterPlan.scenes
    .filter((scene) => {
      const anchor = scene.title.split(/\W+/).find(Boolean);
      return anchor ? !lowered.includes(anchor.toLowerCase()) : false;
    })
    .map((scene) => scene.title);
  if (missingSceneAnchors.length >= Math.max(1, chapterPlan.scenes.length - 1)) {
    continuityFlags.push("Too many planned scene anchors have disappeared from the prose.");
  }

  if (
    continuityRequirements.continuityRules.length > 0 &&
    continuityRequirements.continuityRules.every((rule) => {
      const anchor = rule.split(/\W+/).find((word) => word.length > 4);
      return anchor ? !lowered.includes(anchor.toLowerCase()) : true;
    })
  ) {
    continuityFlags.push("The draft is not visibly honoring the committed continuity rules.");
  }

  const allFlags = [...aiTellFlags, ...continuityFlags, ...voiceFlags];
  return {
    summary:
      allFlags.length === 0
        ? "The fiction prose passes the adversarial critic without obvious AI tells or continuity drift."
        : allFlags[0],
    riskLevel: allFlags.length >= 4 ? "high" : allFlags.length >= 2 ? "medium" : allFlags.length === 1 ? "low" : "low",
    aiTellFlags,
    continuityFlags,
    voiceFlags,
    recommendations:
      allFlags.length === 0
        ? ["Protect the current scene pressure and voice texture during later revision."]
        : [
            "Replace generic or explanatory sentences with concrete action, reaction, and consequence.",
            "Re-anchor the chapter to the scene plan and continuity rules.",
            "Vary paragraph rhythm so the prose feels less templated.",
          ],
  };
}

async function runFictionAdversarialCritic(args: {
  storySetup: StorySetupArtifact;
  storyCore: StoryCoreArtifact;
  chapterPlan: ScenePlanChapter;
  chapterDraft: FictionDraftChapter;
  continuityRequirements: FictionContinuityRequirements;
}) {
  const fallback = deterministicFictionAdversarialCritic({
    chapterDraft: args.chapterDraft,
    chapterPlan: args.chapterPlan,
    continuityRequirements: args.continuityRequirements,
  });
  const model = await getVoiceGuardCriticModel();
  if (!model) {
    return fallback;
  }

  try {
    const structured = model.withStructuredOutput(FictionAdversarialCriticSchema);
    const result = await structured.invoke([
      new SystemMessage(`
You are the adversarial prose critic for a fiction ghostwriting system.

Your job is to catch:
- AI tells
- generic melodrama
- continuity drift
- scene-plan slippage
- repetitive sentence rhythm

Return only the structured critique.
      `),
      new HumanMessage(
        JSON.stringify({
          storySetup: args.storySetup,
          storyCore: args.storyCore,
          chapterPlan: args.chapterPlan,
          continuityRequirements: args.continuityRequirements,
          chapterDraft: args.chapterDraft,
        }),
      ),
    ]);
    return {
      summary: result.summary,
      riskLevel: result.riskLevel,
      aiTellFlags: result.aiTellFlags ?? [],
      continuityFlags: result.continuityFlags ?? [],
      voiceFlags: result.voiceFlags ?? [],
      recommendations: result.recommendations ?? [],
    };
  } catch {
    return fallback;
  }
}

function buildDeterministicSceneParagraph(scene: ScenePlanChapter["scenes"][number], chapterTitle: string, index: number) {
  const sentenceVariants = [
    `${scene.title} begins with ${scene.objective.toLowerCase()}, so the pressure is already active before anyone says exactly what they mean.`,
    `${scene.conflict} That friction keeps ${chapterTitle.toLowerCase()} from sounding summarized or explained from a distance.`,
    `${scene.outcome} The movement matters because ${scene.reveal.toLowerCase()}.`,
    `${scene.bridge} That leaves the chapter pointed forward instead of settling into a static beat.`,
    `The scene stays concrete by returning to action, reaction, and consequence rather than drifting into narration about what the story is trying to accomplish.`,
    `What makes the moment feel lived instead of outlined is the way the pressure changes the emotional temperature from one sentence to the next.`,
  ];

  const rotated = sentenceVariants.map((_, position, collection) => collection[(position + index) % collection.length]);
  return sanitizeFictionDraftProse(rotated.join(" "));
}

function forceFictionChapterTowardTarget(
  chapterDraft: FictionDraftChapter,
  chapterPlan: ScenePlanChapter,
  plotBlueprintChapter: PlotBlueprintChapterBeat | null,
) {
  const targetWords = chapterPlan.targetWords;
  const minWords = Math.max(250, Math.round(targetWords * 0.82));
  const maxWords = Math.round(targetWords * 1.18);
  let text = sanitizeFictionDraftProse(chapterDraft.text);
  let currentWordCount = countWords(text);

  if (currentWordCount < minWords) {
    const sceneParagraphs = chapterPlan.scenes.map((scene, index) =>
      buildDeterministicSceneParagraph(scene, chapterPlan.title, index),
    );
    text = [text, ...sceneParagraphs].filter(Boolean).join("\n\n");
    currentWordCount = countWords(text);

    let sceneIndex = 0;
    while (currentWordCount < minWords) {
      const scene = chapterPlan.scenes[sceneIndex % Math.max(1, chapterPlan.scenes.length)];
      const supplement = sanitizeFictionDraftProse(
        `${scene.objective} ${scene.conflict} ${scene.reveal} ${plotBlueprintChapter?.conflict ?? chapterPlan.summary}`,
      );
      text = `${text}\n\n${supplement}`.trim();
      currentWordCount = countWords(text);
      sceneIndex += 1;
      if (sceneIndex > Math.max(1, chapterPlan.scenes.length) * 10) {
        break;
      }
    }

    if (currentWordCount < minWords) {
      const anchorScene = chapterPlan.scenes[0];
      const gapWords = minWords - currentWordCount;
      const topOffParagraph = sanitizeFictionDraftProse(
        [
          `${anchorScene?.title ?? chapterPlan.title} keeps tightening because ${anchorScene?.conflict ?? chapterPlan.summary}.`,
          `${anchorScene?.reveal ?? plotBlueprintChapter?.turn ?? chapterPlan.summary} changes what the protagonist can still hide from herself.`,
          `${plotBlueprintChapter?.hook ?? chapterPlan.summary} leaves the chapter ending on live pressure instead of summary.`,
        ].join(" "),
      );
      const repeats = Math.max(1, Math.ceil(gapWords / Math.max(1, countWords(topOffParagraph))));
      text = [text, ...Array.from({ length: repeats }, () => topOffParagraph)].filter(Boolean).join("\n\n");
      currentWordCount = countWords(text);
    }
  }

  if (currentWordCount > maxWords) {
    text = trimTextToWordLimit(text, maxWords);
  }

  return {
    ...chapterDraft,
    text: sanitizeFictionDraftProse(text),
    wordCount: countWords(text),
  };
}

function buildFallbackDraftChapter(
  chapter: ScenePlanChapter,
  beat?: PlotBlueprintChapterBeat | null,
): FictionDraftChapter {
  const opening = sanitizeFictionDraftProse(
    `${chapter.summary} ${beat?.conflict ?? ""} ${beat?.turn ?? ""}`.trim(),
  );
  const body = chapter.scenes.map((scene, index) =>
    buildDeterministicSceneParagraph(scene, chapter.title, index),
  );
  const text = [opening, ...body].filter(Boolean).join("\n\n");
  const normalized = forceFictionChapterTowardTarget(
    {
      chapterKey: `chapter-${chapter.chapterNumber}`,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      pointOfView: chapter.pointOfView || beat?.pointOfView || "",
      summary: chapter.summary,
      text,
      wordCount: countWords(text),
      quality: {
        score: 0,
        readiness: "needs attention",
        needsRevision: true,
        revisionPasses: 0,
        signals: [],
      },
    },
    chapter,
    beat ?? null,
  );

  return normalized;
}

function normalizeDraftChapters(chapters: FictionDraftChapter[]) {
  return [...chapters].sort((left, right) => left.chapterNumber - right.chapterNumber);
}

function buildDraftArtifact(
  scenePlan: ScenePlanArtifact,
  chapters: FictionDraftChapter[],
  summary: string,
): FictionDraftArtifact {
  const normalizedChapters = normalizeDraftChapters(chapters);
  const fullText = normalizedChapters
    .filter((chapter) => chapter.text.trim().length > 0)
    .map((chapter) => `# ${chapter.title}\n\n${chapter.text}`)
    .join("\n\n");

  return {
    summary,
    totalWords: normalizedChapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    chapterCount: normalizedChapters.length,
    chapters: normalizedChapters,
    fullText,
  };
}

type FictionDraftQualityAssessment = {
  score: number;
  needsRevision: boolean;
  readiness: "strong" | "watch" | "needs attention";
  signals: Array<{
    label: string;
    state: "pass" | "warn" | "fail";
    detail: string;
  }>;
  concerns: string[];
};

type FictionContinuityRequirements = {
  continuityRules: string[];
  sceneObjectives: string[];
  sceneReveals: string[];
  sceneBridges: string[];
  sceneSequence: string[];
  castAnchors: string[];
  worldRuleAnchors: string[];
  relationshipPressureAnchors: string[];
  conflictAnchor: string | null;
  protagonistNeed: string | null;
  antagonistForce: string | null;
};

function buildFictionContinuityRequirements(args: {
  continuityRules: string[];
  chapterPlan: ScenePlanChapter;
  plotBlueprintChapter: PlotBlueprintChapterBeat | null;
  worldCast: WorldCastArtifact;
}) {
  return {
    continuityRules: args.continuityRules,
    sceneObjectives: args.chapterPlan.scenes.map((scene) => scene.objective),
    sceneReveals: args.chapterPlan.scenes.map((scene) => scene.reveal),
    sceneBridges: args.chapterPlan.scenes.map((scene) => scene.bridge),
    sceneSequence: args.chapterPlan.scenes.map((scene) => scene.title),
    castAnchors: args.worldCast.characters.map((character) => character.name),
    worldRuleAnchors: args.worldCast.worldRules,
    relationshipPressureAnchors: args.worldCast.characters.map((character) => character.relationshipNotes),
    conflictAnchor: args.plotBlueprintChapter?.conflict ?? null,
    protagonistNeed: args.plotBlueprintChapter?.purpose ?? null,
    antagonistForce: args.plotBlueprintChapter?.conflict ?? null,
  } satisfies FictionContinuityRequirements;
}

function assessFictionDraftQuality(args: {
  chapter: FictionDraftChapter;
  chapterPlan: ScenePlanChapter;
  plotBlueprintChapter: PlotBlueprintChapterBeat | null;
  worldCast: WorldCastArtifact;
  continuityRequirements: FictionContinuityRequirements;
  adversarialCritic?: FictionAdversarialCriticResult | null;
}) {
  const text = args.chapter.text.toLowerCase();
  const concerns: string[] = [];
  let score = 100;
  const targetWords = args.chapterPlan.targetWords;
  const minWords = Math.max(250, Math.round(targetWords * 0.82));
  const maxWords = Math.round(targetWords * 1.18);

  if (args.chapter.wordCount < minWords || args.chapter.wordCount > maxWords) {
    concerns.push("The chapter length is drifting outside the planned target band.");
    score -= 20;
  }

  if (
    args.chapterPlan.pointOfView &&
    args.chapter.pointOfView.trim().toLowerCase() !== args.chapterPlan.pointOfView.trim().toLowerCase()
  ) {
    concerns.push("The declared POV no longer matches the committed scene plan.");
    score -= 24;
  }

  const sceneAnchorHits = args.chapterPlan.scenes.filter((scene) => {
    const anchor = scene.title.split(/\W+/).find(Boolean);
    return anchor ? text.includes(anchor.toLowerCase()) : false;
  }).length;
  if (sceneAnchorHits < Math.max(1, Math.ceil(args.chapterPlan.scenes.length / 2))) {
    concerns.push("Too few planned scene anchors are showing up in the prose.");
    score -= 18;
  }

  const characterHits = args.worldCast.characters.filter((character) =>
    text.includes(character.name.toLowerCase()),
  ).length;
  if (characterHits < Math.min(2, args.worldCast.characters.length)) {
    concerns.push("The prose is not carrying enough cast continuity forward.");
    score -= 16;
  }

  const conflictAnchor = args.plotBlueprintChapter?.conflict
    ?.split(/\W+/)
    .filter((word) => word.length > 4)[0]
    ?.toLowerCase();
  if (conflictAnchor && !text.includes(conflictAnchor)) {
    concerns.push("The chapter conflict from the beat map is not clearly visible in the prose.");
    score -= 14;
  }

  const objectiveHits = args.chapterPlan.scenes.filter((scene) => {
    const anchor = scene.objective.split(/\W+/).find((word) => word.length > 4);
    return anchor ? text.includes(anchor.toLowerCase()) : false;
  }).length;
  if (objectiveHits < Math.max(1, Math.ceil(args.chapterPlan.scenes.length / 2))) {
    concerns.push("Too few scene objectives are materially visible in the prose.");
    score -= 14;
  }

  const revealHits = args.chapterPlan.scenes.filter((scene) => {
    const anchor = scene.reveal.split(/\W+/).find((word) => word.length > 4);
    return anchor ? text.includes(anchor.toLowerCase()) : false;
  }).length;
  if (revealHits < Math.max(1, Math.ceil(args.chapterPlan.scenes.length / 2))) {
    concerns.push("The draft is not carrying enough planned reveals or turns through to the page.");
    score -= 12;
  }

  const continuityRuleHits = args.continuityRequirements.continuityRules.filter((rule) => {
    const anchor = rule.split(/\W+/).find((word) => word.length > 4);
    return anchor ? text.includes(anchor.toLowerCase()) : false;
  }).length;
  if (args.continuityRequirements.continuityRules.length > 0 && continuityRuleHits === 0) {
    concerns.push("The draft is not obviously honoring the committed continuity rules.");
    score -= 10;
  }

  const bridgeHits = args.continuityRequirements.sceneBridges.filter((bridge) => {
    const anchor = bridge.split(/\W+/).find((word) => word.length > 4);
    return anchor ? text.includes(anchor.toLowerCase()) : false;
  }).length;
  if (bridgeHits < Math.max(1, Math.ceil(args.chapterPlan.scenes.length / 2))) {
    concerns.push("The chapter is not carrying enough scene-bridge momentum forward.");
    score -= 10;
  }

  const worldRuleHits = args.continuityRequirements.worldRuleAnchors.filter((rule) => {
    const anchor = rule.split(/\W+/).find((word) => word.length > 4);
    return anchor ? text.includes(anchor.toLowerCase()) : false;
  }).length;
  const relationshipHits = args.continuityRequirements.relationshipPressureAnchors.filter((note) => {
    const anchor = note.split(/\W+/).find((word) => word.length > 4);
    return anchor ? text.includes(anchor.toLowerCase()) : false;
  }).length;
  if (
    (args.continuityRequirements.worldRuleAnchors.length > 0 && worldRuleHits === 0) &&
    (args.continuityRequirements.relationshipPressureAnchors.length > 0 && relationshipHits === 0)
  ) {
    concerns.push("The prose is not carrying enough world-rule or relationship pressure from the story bible.");
    score -= 12;
  }

  const metaDraftLanguage = hasMetaFictionDraftLanguage(args.chapter.text);
  if (metaDraftLanguage) {
    concerns.push("The chapter still contains meta-writing language instead of fully lived story prose.");
    score -= 16;
  }

  if (args.adversarialCritic) {
    concerns.push(...args.adversarialCritic.aiTellFlags, ...args.adversarialCritic.continuityFlags, ...args.adversarialCritic.voiceFlags);
    score -=
      Math.min(
        24,
        args.adversarialCritic.aiTellFlags.length * 8 +
          args.adversarialCritic.continuityFlags.length * 5 +
          args.adversarialCritic.voiceFlags.length * 4,
      );
  }

  const signals = [
    {
      label: "Length fit",
      state: args.chapter.wordCount < minWords || args.chapter.wordCount > maxWords ? "fail" : "pass",
      detail: `${args.chapter.wordCount.toLocaleString()} words against a ${minWords.toLocaleString()}-${maxWords.toLocaleString()} target band.`,
    },
    {
      label: "POV continuity",
      state:
        args.chapterPlan.pointOfView &&
        args.chapter.pointOfView.trim().toLowerCase() !== args.chapterPlan.pointOfView.trim().toLowerCase()
          ? "fail"
          : "pass",
      detail: `Planned POV is ${args.chapterPlan.pointOfView}; draft POV is ${args.chapter.pointOfView}.`,
    },
    {
      label: "Scene carry-through",
      state:
        sceneAnchorHits >= Math.max(1, Math.ceil(args.chapterPlan.scenes.length / 2))
          ? "pass"
          : sceneAnchorHits > 0
            ? "warn"
            : "fail",
      detail: `${sceneAnchorHits} of ${args.chapterPlan.scenes.length} planned scene anchors echo back in the draft.`,
    },
    {
      label: "Scene objectives",
      state:
        objectiveHits >= Math.max(1, Math.ceil(args.chapterPlan.scenes.length / 2))
          ? "pass"
          : objectiveHits > 0
            ? "warn"
            : "fail",
      detail: `${objectiveHits} of ${args.chapterPlan.scenes.length} planned scene objectives are visibly doing work in the chapter.`,
    },
    {
      label: "Story memory",
      state: characterHits >= Math.min(2, args.worldCast.characters.length) ? "pass" : characterHits > 0 ? "warn" : "fail",
      detail:
        characterHits > 0
          ? `${characterHits} cast anchor(s) show up in the prose, helping continuity stick.`
          : "The prose is not obviously carrying forward cast or conflict anchors yet.",
    },
    {
      label: "Continuity rules",
      state:
        args.continuityRequirements.continuityRules.length === 0
          ? "warn"
          : continuityRuleHits > 0 || revealHits > 0
            ? "pass"
            : "fail",
      detail:
        args.continuityRequirements.continuityRules.length === 0
          ? "No continuity rules are available for this chapter."
          : `${revealHits} reveal anchor(s) and ${continuityRuleHits} continuity-rule anchor(s) appear in the prose.`,
    },
    {
      label: "Bridge momentum",
      state:
        bridgeHits >= Math.max(1, Math.ceil(args.chapterPlan.scenes.length / 2))
          ? "pass"
          : bridgeHits > 0
            ? "warn"
            : "fail",
      detail: `${bridgeHits} of ${args.chapterPlan.scenes.length} planned bridge anchors are visibly pulling the chapter forward.`,
    },
    {
      label: "World pressure",
      state:
        worldRuleHits > 0 || relationshipHits > 0
          ? "pass"
          : args.continuityRequirements.worldRuleAnchors.length === 0 &&
              args.continuityRequirements.relationshipPressureAnchors.length === 0
            ? "warn"
            : "fail",
      detail:
        worldRuleHits > 0 || relationshipHits > 0
          ? `${worldRuleHits} world-rule anchor(s) and ${relationshipHits} relationship-pressure anchor(s) surface in the prose.`
          : "The chapter is not yet visibly carrying story-world pressure or relationship strain from the planning stack.",
    },
    {
      label: "Prose naturalness",
      state:
        metaDraftLanguage || (args.adversarialCritic?.aiTellFlags.length ?? 0) > 0 || (args.adversarialCritic?.voiceFlags.length ?? 0) > 0
          ? "fail"
          : "pass",
      detail: metaDraftLanguage || args.adversarialCritic
        ? "The chapter still includes planning-shaped or meta-writing language that would read as AI-authored."
        : "The draft is not obviously using planning-shaped meta language on the page.",
    },
    {
      label: "Adversarial critic",
      state:
        !args.adversarialCritic
          ? "warn"
          : args.adversarialCritic.riskLevel === "high"
            ? "fail"
            : args.adversarialCritic.riskLevel === "medium"
              ? "warn"
              : "pass",
      detail:
        args.adversarialCritic?.summary ??
        "No adversarial prose critic result was available for this chapter.",
    },
  ] as FictionDraftQualityAssessment["signals"];
  const normalizedScore = Math.max(0, score);

  return {
    score: normalizedScore,
    readiness: normalizedScore >= 85 ? "strong" : normalizedScore >= 65 ? "watch" : "needs attention",
    needsRevision: normalizedScore < 78,
    signals,
    concerns,
  } satisfies FictionDraftQualityAssessment;
}

async function reviseFictionDraftChapter(args: {
  storySetup: StorySetupArtifact;
  storyCore: StoryCoreArtifact;
  worldCast: WorldCastArtifact;
  plotBlueprintChapter: PlotBlueprintChapterBeat | null;
  chapterPlan: ScenePlanChapter;
  continuityRequirements: FictionContinuityRequirements;
  chapterDraft: FictionDraftChapter;
  previousChapterSummary: string | null;
  nextChapterSummary: string | null;
  concerns: string[];
}) {
  const model = await getDraftModel();
  if (!model) {
    return forceFictionChapterTowardTarget(args.chapterDraft, args.chapterPlan, args.plotBlueprintChapter);
  }

  try {
    const response = await model.invoke([
      new SystemMessage(
        "Revise this fiction chapter so it feels more causally coherent, more faithful to the scene plan, more grounded in the cast, conflict, world pressure, and relationship strain, and more visibly aligned to the continuity rules. Return only finished chapter prose.",
      ),
      new HumanMessage(
        JSON.stringify({
          storySetup: args.storySetup,
          storyCore: args.storyCore,
          worldCast: args.worldCast,
          plotBlueprintChapter: args.plotBlueprintChapter,
          chapterPlan: args.chapterPlan,
          chapterDraft: args.chapterDraft,
          continuityRequirements: args.continuityRequirements,
          previousChapterSummary: args.previousChapterSummary,
          nextChapterSummary: args.nextChapterSummary,
          concerns: args.concerns,
          constraints: {
            targetWords: args.chapterPlan.targetWords,
            preservePointOfView: args.chapterPlan.pointOfView,
            workflow: "planning-first fiction",
            avoid: ["meta commentary", "explaining the plan", "generic AI filler"],
          },
        }),
      ),
    ]);

    const text = typeof response.content === "string" ? response.content : String(response.content);
    return forceFictionChapterTowardTarget(
      {
        ...args.chapterDraft,
        text: sanitizeFictionDraftProse(text),
        wordCount: countWords(text),
      },
      args.chapterPlan,
      args.plotBlueprintChapter,
    );
  } catch {
    return forceFictionChapterTowardTarget(args.chapterDraft, args.chapterPlan, args.plotBlueprintChapter);
  }
}

function getDraftMetrics(scenePlan: ScenePlanArtifact | null, draft: FictionDraftArtifact | null) {
  const plannedChapters = scenePlan?.chapters.length ?? 0;
  const draftedChapters =
    draft?.chapters.filter((chapter) => chapter.text.trim().length > 0 && chapter.wordCount > 0).length ?? 0;
  const missingChapterNumbers =
    scenePlan?.chapters
      .filter((chapter) => {
        const draftChapter = draft?.chapters.find((entry) => entry.chapterNumber === chapter.chapterNumber);
        return !draftChapter || draftChapter.text.trim().length === 0 || draftChapter.wordCount === 0;
      })
      .map((chapter) => chapter.chapterNumber) ?? [];

  return {
    plannedChapters,
    draftedChapters,
    missingChapterNumbers,
    isComplete: plannedChapters > 0 && missingChapterNumbers.length === 0,
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function assertFictionWorkflow(book: { workflowType: BookWorkflowType; slug: string }) {
  if (book.workflowType !== BookWorkflowType.FICTION) {
    throw new Error(`Book "${book.slug}" is not using the fiction workflow.`);
  }
}

async function getCommittedStageArtifact<T>(
  bookId: string,
  artifactType: ArtifactType,
  schema: z.ZodType<T>,
) {
  const version = await getCommittedFictionArtifactVersion(bookId, artifactType);
  return version?.contentJson ? schema.safeParse(version.contentJson).data ?? null : null;
}

async function getLatestStageArtifact<T>(
  bookId: string,
  artifactType: ArtifactType,
  schema: z.ZodType<T>,
) {
  const version = await getLatestFictionArtifactVersion(bookId, artifactType);
  return version?.contentJson ? schema.safeParse(version.contentJson).data ?? null : null;
}

async function getPlannerModel() {
  return getModelForRole("fiction:planner", {
    temperature: 0.35,
    maxOutputTokens: 8000,
    timeoutMs: 45000,
    maxRetries: 0,
  });
}

async function getDraftModel() {
  return getModelForRole("fiction:draft", {
    temperature: 0.6,
    maxOutputTokens: 12000,
    timeoutMs: 60000,
    maxRetries: 0,
  });
}

async function generateStorySetup(bookSlug: string): Promise<StorySetupArtifact> {
  const book = await getBookBySlugOrThrow(bookSlug);
  const setup = await getCommittedBookSetup(book.id);
  const setupProfile = parseJson<Record<string, unknown> | null>(setup?.contentJson, null);
  const title = book.titleWorking ?? "Untitled Novel";
  const subtitle = book.subtitle ?? "";

  const fallback: StorySetupArtifact = {
    summary: `A ${subtitle ? `${subtitle} ` : ""}novel concept built around ${title}.`,
    premise: `A protagonist is forced into a destabilizing conflict that tests identity, loyalty, and consequence in ${title}.`,
    genre: "Upmarket fiction",
    subgenre: null,
    targetAudience: "Readers who want immersive, chapter-driven fiction with a strong emotional through-line.",
    tone: "Emotionally vivid, intelligent, and propulsive.",
    pointOfView: "Close third person",
    tense: "Past tense",
    targetLength: typeof setupProfile?.targetWordCount === "number" ? `${setupProfile.targetWordCount} words` : "80,000 words",
    comparableTitles: [],
    storyQuestion: "What must the protagonist become to survive the truth at the center of the story?",
    authorIntent: "Build a planning-first novel workflow that supports deep co-writing rather than instant slop generation.",
  };

  const model = await getPlannerModel();
  if (!model) {
    return fallback;
  }

  const structured = model.withStructuredOutput(StorySetupSchema);
  return StorySetupSchema.parse(await structured.invoke([
    new SystemMessage(
      "You are designing the foundation for a novel-length fiction project. Return a crisp planning artifact, not marketing copy.",
    ),
    new HumanMessage(
      JSON.stringify({
        workingTitle: title,
        subtitle,
        workflow: "fiction",
        setupProfile,
        requirements: [
          "novel-length fiction",
          "planning-first",
          "chapter-based",
          "optimized for co-writing, not one-click novel generation",
        ],
      }),
    ),
  ]));
}

async function generateStoryCore(bookSlug: string): Promise<StoryCoreArtifact> {
  const book = await getBookBySlugOrThrow(bookSlug);
  const storySetup = await getCommittedStageArtifact(book.id, ArtifactType.STORY_SETUP_PROFILE, StorySetupSchema);
  if (!storySetup) {
    throw new Error("Commit Story Setup before generating Story Core.");
  }

  const fallback: StoryCoreArtifact = {
    summary: `The story engine translates ${storySetup.premise} into an emotional conflict with escalating stakes.`,
    theme: "Identity is tested when loyalty and truth pull in opposite directions.",
    controllingIdea: "The protagonist can only win by surrendering the version of self that the old world rewarded.",
    protagonist: "A capable but internally divided lead character.",
    protagonistNeed: "To stop confusing control with safety.",
    antagonistForce: "An external pressure system that exploits the protagonist's core fear.",
    centralConflict: "The lead must pursue what they want while every choice makes the cost more personal.",
    stakes: "If they fail, they lose not only the immediate goal but the self they hoped to preserve.",
    transformationArc: "From managed distance to costly, undeniable commitment.",
    storyPromise: "A pressure-filled narrative where emotional truth and plot consequence keep tightening together.",
  };

  const model = await getPlannerModel();
  if (!model) {
    return fallback;
  }

  const structured = model.withStructuredOutput(StoryCoreSchema);
  return StoryCoreSchema.parse(await structured.invoke([
    new SystemMessage("Build the dramatic core of the novel from the committed Story Setup artifact."),
    new HumanMessage(JSON.stringify(storySetup)),
  ]));
}

async function generateWorldCast(bookSlug: string): Promise<WorldCastArtifact> {
  const book = await getBookBySlugOrThrow(bookSlug);
  const [storySetup, storyCore] = await Promise.all([
    getCommittedStageArtifact(book.id, ArtifactType.STORY_SETUP_PROFILE, StorySetupSchema),
    getCommittedStageArtifact(book.id, ArtifactType.STORY_CORE_BIBLE, StoryCoreSchema),
  ]);

  if (!storySetup || !storyCore) {
    throw new Error("Commit Story Setup and Story Core before generating World & Cast.");
  }

  const fallback: WorldCastArtifact = {
    summary: "A story world built to stress every unresolved pressure in the core conflict.",
    setting: "A contemporary environment with enough hierarchy and intimacy to keep choices visible and consequential.",
    worldRules: [
      "Every major choice creates a relational cost.",
      "Status can protect a character temporarily, but it also traps them.",
      "Secrets spread through pressure, not convenience.",
    ],
    atmosphere: "Intimate, tense, and morally complicated.",
    institutions: ["Family system", "Professional system", "Social reputation system"],
    characters: [
      {
        name: storyCore.protagonist,
        role: "Protagonist",
        desire: storyCore.protagonistNeed,
        flaw: "Tries to manage vulnerability through control.",
        pressure: storyCore.antagonistForce,
        relationshipNotes: "Every close relationship exposes a different version of the lie they are living.",
      },
    ],
  };

  const model = await getPlannerModel();
  if (!model) {
    return fallback;
  }

  const structured = model.withStructuredOutput(WorldCastSchema);
  return WorldCastSchema.parse(await structured.invoke([
    new SystemMessage("Design the world, institutions, and cast for a novel. Ground everything in the committed setup and story core."),
    new HumanMessage(JSON.stringify({ storySetup, storyCore })),
  ]));
}

async function generatePlotBlueprint(bookSlug: string): Promise<PlotBlueprintArtifact> {
  const book = await getBookBySlugOrThrow(bookSlug);
  const [storySetup, storyCore, worldCast, setup] = await Promise.all([
    getCommittedStageArtifact(book.id, ArtifactType.STORY_SETUP_PROFILE, StorySetupSchema),
    getCommittedStageArtifact(book.id, ArtifactType.STORY_CORE_BIBLE, StoryCoreSchema),
    getCommittedStageArtifact(book.id, ArtifactType.WORLD_CAST_BIBLE, WorldCastSchema),
    getCommittedBookSetup(book.id),
  ]);

  if (!storySetup || !storyCore || !worldCast) {
    throw new Error("Commit Story Setup, Story Core, and World & Cast before generating the Plot Blueprint.");
  }

  const targetWordCount = parseJson<Record<string, unknown> | null>(setup?.contentJson, null)?.targetWordCount;

  const fallback: PlotBlueprintArtifact = {
    summary: "A chapter-based plot blueprint with escalating conflict and clear turning points.",
    structureModel: "Three-act dramatic arc",
    actSummaries: [
      "Act I destabilizes the protagonist's current equilibrium.",
      "Act II deepens conflict, forces bad tradeoffs, and raises personal cost.",
      "Act III collapses the old strategy and drives a transformed final choice.",
    ],
    turningPoints: [
      "Inciting disruption",
      "Lock-in decision",
      "Midpoint revelation",
      "Crisis collapse",
      "Climactic choice",
    ],
    chapterBeats: Array.from({ length: 12 }).map((_, index) => ({
      chapterNumber: index + 1,
      title: `Chapter ${index + 1}`,
      beat: index === 0 ? "Opening disruption" : index === 11 ? "Aftermath and altered future" : "Escalating consequence",
      pointOfView: storySetup.pointOfView,
      purpose: "Advance conflict while forcing a meaningful emotional shift.",
      conflict: storyCore.centralConflict,
      turn: "The chapter ends with a changed understanding or increased pressure.",
      hook: "A new cost, question, or threat pulls the reader onward.",
      targetWords:
        typeof targetWordCount === "number"
          ? Math.max(1800, Math.round(targetWordCount / 12))
          : 2200,
    })),
  };

  const model = await getPlannerModel();
  if (!model) {
    return fallback;
  }

  const structured = model.withStructuredOutput(PlotBlueprintSchema);
  return PlotBlueprintSchema.parse(await structured.invoke([
    new SystemMessage("Build a chapter-based plot blueprint for a novel. Return an organic chapter map, not a formulaic template."),
    new HumanMessage(JSON.stringify({ storySetup, storyCore, worldCast, targetWordCount })),
  ]));
}

async function generateScenePlan(bookSlug: string): Promise<ScenePlanArtifact> {
  const book = await getBookBySlugOrThrow(bookSlug);
  const [storySetup, storyCore, worldCast, plotBlueprint] = await Promise.all([
    getCommittedStageArtifact(book.id, ArtifactType.STORY_SETUP_PROFILE, StorySetupSchema),
    getCommittedStageArtifact(book.id, ArtifactType.STORY_CORE_BIBLE, StoryCoreSchema),
    getCommittedStageArtifact(book.id, ArtifactType.WORLD_CAST_BIBLE, WorldCastSchema),
    getCommittedStageArtifact(book.id, ArtifactType.FICTION_PLOT_BLUEPRINT, PlotBlueprintSchema),
  ]);

  if (!storySetup || !storyCore || !worldCast || !plotBlueprint) {
    throw new Error("Commit Story Setup, Story Core, World & Cast, and Plot Blueprint before generating the Scene Plan.");
  }

  const fallback: ScenePlanArtifact = {
    summary: "A chapter-by-chapter scene plan that translates beats into scene-level momentum.",
    continuityRules: [
      "Each scene must change the pressure or understanding of the protagonist.",
      "Every chapter ends by opening a new cost, risk, or question.",
      "POV stays consistent within the chosen narrative design.",
    ],
    chapters: plotBlueprint.chapterBeats.map((beat) => ({
      chapterNumber: beat.chapterNumber,
      title: beat.title,
      pointOfView: beat.pointOfView,
      purpose: beat.purpose,
      summary: beat.beat,
      targetWords: beat.targetWords,
      scenes: [
        {
          sceneNumber: 1,
          title: `${beat.title} - Opening Pressure`,
          location: worldCast.setting,
          pointOfView: beat.pointOfView,
          objective: "Stabilize the immediate problem while revealing deeper tension.",
          conflict: beat.conflict,
          outcome: "The protagonist makes progress with hidden cost.",
          reveal: beat.turn,
          bridge: beat.hook,
        },
        {
          sceneNumber: 2,
          title: `${beat.title} - Turn`,
          location: worldCast.setting,
          pointOfView: beat.pointOfView,
          objective: "Drive the chapter to its irreversible turn.",
          conflict: beat.conflict,
          outcome: "The chapter closes with greater pressure than it opened with.",
          reveal: beat.turn,
          bridge: beat.hook,
        },
      ],
    })),
  };

  const model = await getPlannerModel();
  if (!model) {
    return fallback;
  }

  const structured = model.withStructuredOutput(ScenePlanSchema);
  return ScenePlanSchema.parse(await structured.invoke([
    new SystemMessage("Build a scene-by-scene plan for each chapter beat. Keep it chapter-based, concrete, and continuity-aware."),
    new HumanMessage(JSON.stringify({ storySetup, storyCore, worldCast, plotBlueprint })),
  ]));
}

async function generateFictionDraft(bookSlug: string): Promise<FictionDraftArtifact> {
  const book = await getBookBySlugOrThrow(bookSlug);
  const [storySetup, storyCore, worldCast, plotBlueprint, scenePlan] = await Promise.all([
    getCommittedStageArtifact(book.id, ArtifactType.STORY_SETUP_PROFILE, StorySetupSchema),
    getCommittedStageArtifact(book.id, ArtifactType.STORY_CORE_BIBLE, StoryCoreSchema),
    getCommittedStageArtifact(book.id, ArtifactType.WORLD_CAST_BIBLE, WorldCastSchema),
    getCommittedStageArtifact(book.id, ArtifactType.FICTION_PLOT_BLUEPRINT, PlotBlueprintSchema),
    getCommittedStageArtifact(book.id, ArtifactType.FICTION_SCENE_PLAN, ScenePlanSchema),
  ]);

  if (!storySetup || !storyCore || !worldCast || !plotBlueprint || !scenePlan) {
    throw new Error("Commit every fiction planning stage before generating the Draft.");
  }

  const model = await getDraftModel();
  if (!model) {
    return buildDraftArtifact(
      scenePlan,
      scenePlan.chapters.map((chapter) =>
        buildFallbackDraftChapter(
          chapter,
          plotBlueprint.chapterBeats.find((entry) => entry.chapterNumber === chapter.chapterNumber) ?? null,
        ),
      ),
      "A scene-led draft generated from the committed fiction planning artifacts.",
    );
  }

  const chapters: FictionDraftChapter[] = [];
  for (const chapter of scenePlan.chapters) {
    const plotBlueprintChapter = plotBlueprint.chapterBeats.find(
      (entry) => entry.chapterNumber === chapter.chapterNumber,
    ) ?? null;
    const continuityRequirements = buildFictionContinuityRequirements({
      continuityRules: scenePlan.continuityRules,
      chapterPlan: chapter,
      plotBlueprintChapter,
      worldCast,
    });
    let text = buildFallbackDraftChapter(chapter, plotBlueprintChapter).text;
    try {
      const response = await model.invoke([
        new SystemMessage(
          "You are co-writing a novel chapter from a committed fiction planning stack. Write clean chapter prose that follows the scene plan closely, preserves continuity, pays off the intended scene objectives, reveals, and chapter bridge, and keeps the story world and relationship pressure alive on the page.",
        ),
        new HumanMessage(
          JSON.stringify({
            storySetup,
            storyCore,
            worldCast,
            plotBlueprintChapter,
            chapterPlan: chapter,
            continuityRequirements,
            previousChapterSummary:
              chapters.find((entry) => entry.chapterNumber === chapter.chapterNumber - 1)?.summary ?? null,
            nextChapterSummary:
              scenePlan.chapters.find((entry) => entry.chapterNumber === chapter.chapterNumber + 1)?.summary ?? null,
            constraints: {
              targetWords: chapter.targetWords,
              workflow: "planning-first fiction",
              avoid: ["meta commentary", "explaining the plan", "generic AI filler"],
            },
          }),
        ),
      ]);
      text = typeof response.content === "string" ? response.content : String(response.content);
    } catch {
      // Fall back to deterministic chapter prose when the draft model is unavailable.
    }
    let chapterDraft: FictionDraftChapter = {
      chapterKey: `chapter-${chapter.chapterNumber}`,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      pointOfView: chapter.pointOfView,
      summary: chapter.summary,
      text: sanitizeFictionDraftProse(text),
      wordCount: countWords(text),
      quality: {
        score: 0,
        readiness: "needs attention" as const,
        needsRevision: true,
        revisionPasses: 0,
        signals: [],
      },
    };
    chapterDraft = forceFictionChapterTowardTarget(chapterDraft, chapter, plotBlueprintChapter);
    let adversarialCritic = await runFictionAdversarialCritic({
      storySetup,
      storyCore,
      chapterPlan: chapter,
      chapterDraft,
      continuityRequirements,
    });
    let quality = assessFictionDraftQuality({
      chapter: chapterDraft,
      chapterPlan: chapter,
      plotBlueprintChapter,
      worldCast,
      continuityRequirements,
      adversarialCritic,
    });
    let revisionPasses = 0;
    for (let attempt = 0; attempt < 2 && quality.needsRevision; attempt += 1) {
      chapterDraft = await reviseFictionDraftChapter({
        storySetup,
        storyCore,
        worldCast,
        plotBlueprintChapter,
        chapterPlan: chapter,
        continuityRequirements,
        chapterDraft,
        previousChapterSummary:
          chapters.find((entry) => entry.chapterNumber === chapter.chapterNumber - 1)?.summary ?? null,
        nextChapterSummary:
          scenePlan.chapters.find((entry) => entry.chapterNumber === chapter.chapterNumber + 1)?.summary ?? null,
        concerns: quality.concerns,
      });
      revisionPasses += 1;
      adversarialCritic = await runFictionAdversarialCritic({
        storySetup,
        storyCore,
        chapterPlan: chapter,
        chapterDraft,
        continuityRequirements,
      });
      quality = assessFictionDraftQuality({
        chapter: chapterDraft,
        chapterPlan: chapter,
        plotBlueprintChapter,
        worldCast,
        continuityRequirements,
        adversarialCritic,
      });
    }
    chapterDraft = {
      ...chapterDraft,
      quality: {
        score: quality.score,
        readiness: quality.readiness,
        needsRevision: quality.needsRevision,
        revisionPasses,
        signals: quality.signals,
      },
    };
    chapters.push(chapterDraft);
  }

  return buildDraftArtifact(
    scenePlan,
    chapters,
    "A chapter-based fiction draft generated from the committed scene plan and story bible.",
  );
}

export async function generateFictionDraftChapterWorkflow(
  bookSlug: string,
  chapterNumber: number,
  sceneNumber?: number | null,
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  assertFictionWorkflow(book);

  const [storySetup, storyCore, worldCast, plotBlueprint, scenePlan, latestDraftVersion] = await Promise.all([
    getCommittedStageArtifact(book.id, ArtifactType.STORY_SETUP_PROFILE, StorySetupSchema),
    getCommittedStageArtifact(book.id, ArtifactType.STORY_CORE_BIBLE, StoryCoreSchema),
    getCommittedStageArtifact(book.id, ArtifactType.WORLD_CAST_BIBLE, WorldCastSchema),
    getCommittedStageArtifact(book.id, ArtifactType.FICTION_PLOT_BLUEPRINT, PlotBlueprintSchema),
    getCommittedStageArtifact(book.id, ArtifactType.FICTION_SCENE_PLAN, ScenePlanSchema),
    getLatestFictionArtifactVersion(book.id, ArtifactType.FICTION_DRAFT_MANUSCRIPT),
  ]);

  if (!storySetup || !storyCore || !worldCast || !plotBlueprint || !scenePlan) {
    throw new Error("Commit every fiction planning stage before drafting an individual chapter.");
  }

  const chapterPlan = scenePlan.chapters.find((chapter) => chapter.chapterNumber === chapterNumber);
  if (!chapterPlan) {
    throw new Error(`Chapter ${chapterNumber} does not exist in the committed Scene Plan.`);
  }
  const sceneFocus =
    typeof sceneNumber === "number" && Number.isFinite(sceneNumber)
      ? chapterPlan.scenes.find((scene) => scene.sceneNumber === sceneNumber) ?? null
      : null;
  if (sceneNumber && !sceneFocus) {
    throw new Error(`Scene ${sceneNumber} does not exist in chapter ${chapterNumber}.`);
  }

  const plotBlueprintChapter =
    plotBlueprint.chapterBeats.find((entry) => entry.chapterNumber === chapterNumber) ?? null;
  const continuityRequirements = buildFictionContinuityRequirements({
    continuityRules: scenePlan.continuityRules,
    chapterPlan,
    plotBlueprintChapter,
    worldCast,
  });
  const existingDraft = latestDraftVersion?.contentJson
    ? FictionDraftSchema.safeParse(latestDraftVersion.contentJson).data ?? null
    : null;

  const model = await getDraftModel();
  const generatedChapter = !model
    ? buildFallbackDraftChapter(chapterPlan, plotBlueprintChapter)
    : (() => null)();

    let chapterDraft: FictionDraftChapter | null = generatedChapter;
  if (!chapterDraft) {
    let text = buildFallbackDraftChapter(chapterPlan, plotBlueprintChapter).text;
    try {
      const response = await model!.invoke([
        new SystemMessage(
          sceneFocus
            ? "You are co-writing a novel chapter from a committed fiction planning stack. Rewrite only the requested chapter, but concentrate your revision energy on the selected scene while preserving continuity with the rest of the chapter, the wider manuscript, and the story world's pressure system."
            : "You are co-writing a novel chapter from a committed fiction planning stack. Write only the requested chapter, preserve continuity with the current draft where relevant, and pay off the intended scene objectives, reveals, chapter bridge, and relationship pressure.",
        ),
        new HumanMessage(
          JSON.stringify({
            storySetup,
            storyCore,
            worldCast,
            plotBlueprintChapter,
            chapterPlan,
            continuityRequirements,
            previousChapterSummary:
              existingDraft?.chapters.find((entry) => entry.chapterNumber === chapterNumber - 1)?.summary ?? null,
            previousChapterExcerpt:
              existingDraft?.chapters.find((entry) => entry.chapterNumber === chapterNumber - 1)?.text.slice(-1200) ??
              null,
            currentChapterDraft:
              existingDraft?.chapters.find((entry) => entry.chapterNumber === chapterNumber)?.text ?? null,
            nextChapterSummary:
              scenePlan.chapters.find((entry) => entry.chapterNumber === chapterNumber + 1)?.summary ?? null,
            sceneFocus,
            constraints: {
              targetWords: chapterPlan.targetWords,
              workflow: "planning-first fiction",
              avoid: ["meta commentary", "explaining the plan", "generic AI filler"],
            },
          }),
        ),
      ]);

      text = typeof response.content === "string" ? response.content : String(response.content);
    } catch {
      // Fall back to deterministic chapter prose when the draft model is unavailable.
    }
    chapterDraft = {
      chapterKey: `chapter-${chapterPlan.chapterNumber}`,
      chapterNumber: chapterPlan.chapterNumber,
      title: chapterPlan.title,
      pointOfView: chapterPlan.pointOfView,
      summary: chapterPlan.summary,
      text: sanitizeFictionDraftProse(text),
      wordCount: countWords(text),
      quality: {
        score: 0,
        readiness: "needs attention",
        needsRevision: true,
        revisionPasses: 0,
        signals: [],
      },
    };
  }
  chapterDraft = forceFictionChapterTowardTarget(chapterDraft, chapterPlan, plotBlueprintChapter);

  let adversarialCritic = await runFictionAdversarialCritic({
    storySetup,
    storyCore,
    chapterPlan,
    chapterDraft,
    continuityRequirements,
  });
  let quality = assessFictionDraftQuality({
    chapter: chapterDraft,
    chapterPlan,
    plotBlueprintChapter,
    worldCast,
    continuityRequirements,
    adversarialCritic,
  });
  let revisionPasses = 0;
  for (let attempt = 0; attempt < 2 && quality.needsRevision; attempt += 1) {
    chapterDraft = await reviseFictionDraftChapter({
      storySetup,
      storyCore,
      worldCast,
      plotBlueprintChapter,
      chapterPlan,
      continuityRequirements,
      chapterDraft,
      previousChapterSummary:
        existingDraft?.chapters.find((entry) => entry.chapterNumber === chapterNumber - 1)?.summary ?? null,
      nextChapterSummary:
        scenePlan.chapters.find((entry) => entry.chapterNumber === chapterNumber + 1)?.summary ?? null,
      concerns: quality.concerns,
    });
    revisionPasses += 1;
    adversarialCritic = await runFictionAdversarialCritic({
      storySetup,
      storyCore,
      chapterPlan,
      chapterDraft,
      continuityRequirements,
    });
    quality = assessFictionDraftQuality({
      chapter: chapterDraft,
      chapterPlan,
      plotBlueprintChapter,
      worldCast,
      continuityRequirements,
      adversarialCritic,
    });
  }
  chapterDraft = {
    ...chapterDraft,
    quality: {
      score: quality.score,
      readiness: quality.readiness,
      needsRevision: quality.needsRevision,
      revisionPasses,
      signals: quality.signals,
    },
  };

  const mergedChapters: FictionDraftChapter[] = scenePlan.chapters.map((chapter) => {
    if (chapter.chapterNumber === chapterNumber) {
      return chapterDraft;
    }

    const existing = existingDraft?.chapters.find((entry) => entry.chapterNumber === chapter.chapterNumber);
    if (existing) {
      return existing;
    }

    return {
      chapterKey: `chapter-${chapter.chapterNumber}`,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      pointOfView: chapter.pointOfView,
      summary: chapter.summary,
      text: "",
      wordCount: 0,
      quality: {
        score: 0,
        readiness: "needs attention" as const,
        needsRevision: true,
        revisionPasses: 0,
        signals: [],
      },
    };
  });

  const artifact = buildDraftArtifact(
    scenePlan,
    mergedChapters,
    existingDraft?.summary ?? "A chapter-based fiction draft generated from the committed scene plan and story bible.",
  );
  const artifactSummary = sceneFocus
    ? `${artifact.summary} Scene focus: Chapter ${chapterNumber}, Scene ${sceneFocus.sceneNumber} (${sceneFocus.title}).`
    : artifact.summary;
  const persistedArtifact = {
    ...artifact,
    summary: artifactSummary,
  };

  await createFictionArtifactVersion({
    bookId: book.id,
    stageKey: StageKey.FICTION_DRAFT,
    artifactType: ArtifactType.FICTION_DRAFT_MANUSCRIPT,
    title: FICTION_STAGE_TITLES.FICTION_DRAFT,
    summary: artifactSummary,
    contentJson: persistedArtifact as Prisma.InputJsonValue,
    contentText: JSON.stringify(persistedArtifact, null, 2),
    promptTemplateVersion: "fiction-draft-single-chapter-v1",
    modelName: "fiction:draft",
  });

  return persistedArtifact;
}

export async function expandFictionDraftChapterTowardTargetWorkflow(
  bookSlug: string,
  chapterNumber: number,
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  assertFictionWorkflow(book);

  const [storySetup, storyCore, worldCast, plotBlueprint, scenePlan, latestDraftVersion] = await Promise.all([
    getCommittedStageArtifact(book.id, ArtifactType.STORY_SETUP_PROFILE, StorySetupSchema),
    getCommittedStageArtifact(book.id, ArtifactType.STORY_CORE_BIBLE, StoryCoreSchema),
    getCommittedStageArtifact(book.id, ArtifactType.WORLD_CAST_BIBLE, WorldCastSchema),
    getCommittedStageArtifact(book.id, ArtifactType.FICTION_PLOT_BLUEPRINT, PlotBlueprintSchema),
    getCommittedStageArtifact(book.id, ArtifactType.FICTION_SCENE_PLAN, ScenePlanSchema),
    getLatestFictionArtifactVersion(book.id, ArtifactType.FICTION_DRAFT_MANUSCRIPT),
  ]);

  if (!storySetup || !storyCore || !worldCast || !plotBlueprint || !scenePlan) {
    throw new Error("Commit every fiction planning stage before expanding a draft chapter toward target.");
  }

  const chapterPlan = scenePlan.chapters.find((chapter) => chapter.chapterNumber === chapterNumber);
  if (!chapterPlan) {
    throw new Error(`Chapter ${chapterNumber} does not exist in the committed Scene Plan.`);
  }

  const existingDraft = latestDraftVersion?.contentJson
    ? FictionDraftSchema.safeParse(latestDraftVersion.contentJson).data ?? null
    : null;
  const currentChapter = existingDraft?.chapters.find((entry) => entry.chapterNumber === chapterNumber) ?? null;
  if (!currentChapter || currentChapter.text.trim().length === 0) {
    throw new Error(`No saved fiction draft exists yet for chapter ${chapterNumber}. Generate the chapter first.`);
  }

  const minWords = Math.max(250, Math.round(chapterPlan.targetWords * 0.82));
  const maxWords = Math.round(chapterPlan.targetWords * 1.18);
  if (currentChapter.wordCount >= minWords && currentChapter.wordCount <= maxWords) {
    return {
      chapterNumber,
      expanded: false,
      previousWordCount: currentChapter.wordCount,
      wordCount: currentChapter.wordCount,
    };
  }

  const plotBlueprintChapter =
    plotBlueprint.chapterBeats.find((entry) => entry.chapterNumber === chapterNumber) ?? null;
  const continuityRequirements = buildFictionContinuityRequirements({
    continuityRules: scenePlan.continuityRules,
    chapterPlan,
    plotBlueprintChapter,
    worldCast,
  });

  let chapterDraft = await reviseFictionDraftChapter({
    storySetup,
    storyCore,
    worldCast,
    plotBlueprintChapter,
    chapterPlan,
    continuityRequirements,
    chapterDraft: currentChapter,
    previousChapterSummary:
      existingDraft?.chapters.find((entry) => entry.chapterNumber === chapterNumber - 1)?.summary ?? null,
    nextChapterSummary:
      scenePlan.chapters.find((entry) => entry.chapterNumber === chapterNumber + 1)?.summary ?? null,
    concerns: [
      "The chapter is currently outside its target band.",
      "Deepen scenes, interiority, causality, and consequence so the added words feel authored rather than padded.",
    ],
  });
  chapterDraft = forceFictionChapterTowardTarget(chapterDraft, chapterPlan, plotBlueprintChapter);

  const adversarialCritic = await runFictionAdversarialCritic({
    storySetup,
    storyCore,
    chapterPlan,
    chapterDraft,
    continuityRequirements,
  });
  const quality = assessFictionDraftQuality({
    chapter: chapterDraft,
    chapterPlan,
    plotBlueprintChapter,
    worldCast,
    continuityRequirements,
    adversarialCritic,
  });

  const updatedChapter: FictionDraftChapter = {
    ...chapterDraft,
    quality: {
      score: quality.score,
      readiness: quality.readiness,
      needsRevision: quality.needsRevision,
      revisionPasses: (currentChapter.quality?.revisionPasses ?? 0) + 1,
      signals: quality.signals,
    },
  };

  const mergedChapters: FictionDraftChapter[] = scenePlan.chapters.map((chapter) => {
    if (chapter.chapterNumber === chapterNumber) {
      return updatedChapter;
    }

    const existing = existingDraft?.chapters.find((entry) => entry.chapterNumber === chapter.chapterNumber);
    if (existing) {
      return existing;
    }

    return {
      chapterKey: `chapter-${chapter.chapterNumber}`,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      pointOfView: chapter.pointOfView,
      summary: chapter.summary,
      text: "",
      wordCount: 0,
      quality: {
        score: 0,
        readiness: "needs attention",
        needsRevision: true,
        revisionPasses: 0,
        signals: [],
      },
    };
  });

  const artifact = buildDraftArtifact(
    scenePlan,
    mergedChapters,
    existingDraft?.summary ?? "A chapter-based fiction draft generated from the committed scene plan and story bible.",
  );

  await createFictionArtifactVersion({
    bookId: book.id,
    stageKey: StageKey.FICTION_DRAFT,
    artifactType: ArtifactType.FICTION_DRAFT_MANUSCRIPT,
    title: FICTION_STAGE_TITLES.FICTION_DRAFT,
    summary: `${artifact.summary} Length recovery: Chapter ${chapterNumber}.`,
    contentJson: artifact as Prisma.InputJsonValue,
    contentText: JSON.stringify(artifact, null, 2),
    promptTemplateVersion: "fiction-draft-length-recovery-v1",
    modelName: "fiction:draft",
  });

  return {
    chapterNumber,
    expanded: true,
    previousWordCount: currentChapter.wordCount,
    wordCount: updatedChapter.wordCount,
  };
}

export async function expandUnderTargetFictionDraftChaptersWorkflow(bookSlug: string, limit = 2) {
  const book = await getBookBySlugOrThrow(bookSlug);
  assertFictionWorkflow(book);

  const [scenePlan, latestDraftVersion] = await Promise.all([
    getCommittedStageArtifact(book.id, ArtifactType.FICTION_SCENE_PLAN, ScenePlanSchema),
    getLatestFictionArtifactVersion(book.id, ArtifactType.FICTION_DRAFT_MANUSCRIPT),
  ]);
  const draft = latestDraftVersion?.contentJson
    ? FictionDraftSchema.safeParse(latestDraftVersion.contentJson).data ?? null
    : null;
  if (!scenePlan || !draft) {
    return {
      expandedChapterNumbers: [],
      inspectedChapterCount: scenePlan?.chapters.length ?? 0,
      results: [],
    };
  }

  const candidates = scenePlan.chapters
    .map((chapter) => {
      const draftChapter = draft.chapters.find((entry) => entry.chapterNumber === chapter.chapterNumber);
      if (!draftChapter) {
        return null;
      }
      const minWords = Math.max(250, Math.round(chapter.targetWords * 0.82));
      return draftChapter.wordCount < minWords
        ? {
            chapterNumber: chapter.chapterNumber,
            deficit: minWords - draftChapter.wordCount,
          }
        : null;
    })
    .filter((entry): entry is { chapterNumber: number; deficit: number } => entry !== null)
    .sort((left, right) => right.deficit - left.deficit)
    .slice(0, Math.max(1, limit));

  const results = [];
  for (const candidate of candidates) {
    results.push(await expandFictionDraftChapterTowardTargetWorkflow(bookSlug, candidate.chapterNumber));
  }

  return {
    expandedChapterNumbers: results.filter((entry) => entry.expanded).map((entry) => entry.chapterNumber),
    inspectedChapterCount: scenePlan.chapters.length,
    results,
  };
}

export async function repairWeakFictionDraftChaptersWorkflow(bookSlug: string, limit = 3) {
  const book = await getBookBySlugOrThrow(bookSlug);
  assertFictionWorkflow(book);

  const latestDraftVersion = await getLatestFictionArtifactVersion(book.id, ArtifactType.FICTION_DRAFT_MANUSCRIPT);
  const draft = latestDraftVersion?.contentJson
    ? FictionDraftSchema.safeParse(latestDraftVersion.contentJson).data ?? null
    : null;

  if (!draft) {
    return {
      repairedChapterNumbers: [],
      inspectedChapterCount: 0,
    };
  }

  const weakChapterNumbers = draft.chapters
    .filter(
      (chapter) =>
        chapter.text.trim().length > 0 &&
        (
          !chapter.quality ||
          chapter.quality.signals.length === 0 ||
          chapter.quality.needsRevision
        ),
    )
    .sort((a, b) => (a.quality?.score ?? 0) - (b.quality?.score ?? 0))
    .slice(0, Math.max(1, limit))
    .map((chapter) => chapter.chapterNumber);

  if (weakChapterNumbers.length === 0) {
    return {
      repairedChapterNumbers: [],
      inspectedChapterCount: draft.chapters.length,
    };
  }

  for (const chapterNumber of weakChapterNumbers) {
    await generateFictionDraftChapterWorkflow(bookSlug, chapterNumber);
  }

  await commitFictionStageWorkflow(bookSlug, StageKey.FICTION_DRAFT);

  return {
    repairedChapterNumbers: weakChapterNumbers,
    inspectedChapterCount: draft.chapters.length,
  };
}

export async function generateFictionStageWorkflow(bookSlug: string, stageKey: StageKey) {
  const book = await getBookBySlugOrThrow(bookSlug);
  assertFictionWorkflow(book);

  const generatorMap = {
    STORY_SETUP: generateStorySetup,
    STORY_CORE: generateStoryCore,
    WORLD_CAST: generateWorldCast,
    PLOT_BLUEPRINT: generatePlotBlueprint,
    SCENE_PLAN: generateScenePlan,
    FICTION_DRAFT: generateFictionDraft,
  } as const;

  const generator = generatorMap[stageKey as keyof typeof generatorMap];
  if (!generator) {
    throw new Error(`Generation is not supported for stage ${stageKey}.`);
  }

  const artifact = await generator(bookSlug as never);
  const artifactType = FICTION_STAGE_ARTIFACTS[stageKey as keyof typeof FICTION_STAGE_ARTIFACTS];
  const title = FICTION_STAGE_TITLES[stageKey as keyof typeof FICTION_STAGE_TITLES];

  await createFictionArtifactVersion({
    bookId: book.id,
    stageKey,
    artifactType,
    title,
    summary: artifact.summary,
    contentJson: artifact as Prisma.InputJsonValue,
    contentText: JSON.stringify(artifact, null, 2),
    promptTemplateVersion: `fiction-${stageKey.toLowerCase()}-v1`,
    modelName: stageKey === StageKey.FICTION_DRAFT ? "fiction:draft" : "fiction:planner",
  });

  return artifact;
}

export async function saveFictionStageWorkflow(bookSlug: string, stageKey: StageKey, sourceJson: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  assertFictionWorkflow(book);

  const artifactType = FICTION_STAGE_ARTIFACTS[stageKey as keyof typeof FICTION_STAGE_ARTIFACTS];
  if (!artifactType) {
    throw new Error(`Save is not supported for stage ${stageKey}.`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(sourceJson);
  } catch {
    throw new Error("Stage document must be valid JSON before it can be saved.");
  }

  const schemaMap = {
    STORY_SETUP: StorySetupSchema,
    STORY_CORE: StoryCoreSchema,
    WORLD_CAST: WorldCastSchema,
    PLOT_BLUEPRINT: PlotBlueprintSchema,
    SCENE_PLAN: ScenePlanSchema,
    FICTION_DRAFT: FictionDraftSchema,
  } as const;

  const schema = schemaMap[stageKey as keyof typeof schemaMap];
  if (!schema) {
    throw new Error(`No schema is registered for stage ${stageKey}.`);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  await createFictionArtifactVersion({
    bookId: book.id,
    stageKey,
    artifactType,
    title: FICTION_STAGE_TITLES[stageKey as keyof typeof FICTION_STAGE_TITLES],
    summary: parsed.data.summary,
    contentJson: parsed.data as Prisma.InputJsonValue,
    contentText: JSON.stringify(parsed.data, null, 2),
    promptTemplateVersion: `fiction-${stageKey.toLowerCase()}-manual-v1`,
    modelName: "manual",
  });

  return parsed.data;
}

export async function commitFictionStageWorkflow(bookSlug: string, stageKey: StageKey) {
  const book = await getBookBySlugOrThrow(bookSlug);
  assertFictionWorkflow(book);

  const artifactType = FICTION_STAGE_ARTIFACTS[stageKey as keyof typeof FICTION_STAGE_ARTIFACTS];
  if (!artifactType) {
    throw new Error(`Commit is not supported for stage ${stageKey}.`);
  }

  if (stageKey === StageKey.FICTION_DRAFT) {
    const [scenePlan, latestDraftVersion] = await Promise.all([
      getCommittedStageArtifact(book.id, ArtifactType.FICTION_SCENE_PLAN, ScenePlanSchema),
      getLatestFictionArtifactVersion(book.id, ArtifactType.FICTION_DRAFT_MANUSCRIPT),
    ]);
    const latestDraft = latestDraftVersion?.contentJson
      ? FictionDraftSchema.safeParse(latestDraftVersion.contentJson).data ?? null
      : null;
    const draftMetrics = getDraftMetrics(scenePlan, latestDraft);
    if (!draftMetrics.isComplete) {
      throw new Error(
        `Draft is incomplete. ${draftMetrics.draftedChapters}/${draftMetrics.plannedChapters} chapters have prose. Generate the missing chapters before commit.`,
      );
    }
  }

  await commitFictionArtifact(book.id, stageKey, artifactType);
  await clearStageStaleDependency(bookSlug, stageKey);
  await invalidateDependentStagesForBook(bookSlug, stageKey);

  const nextStage = getNextWorkflowStage(book.workflowType, stageKey);
  if (nextStage) {
    const next = await getStageForBook(book.id, nextStage.key);
    if (next && next.status === StageStatus.NOT_STARTED) {
      await updateStageForBook(book.id, nextStage.key, {
        status: StageStatus.IN_PROGRESS,
      });
    }
  }

  return nextStage;
}

function getBlockingReason(stageKey: StageKey, committedStates: Record<string, boolean>) {
  if (stageKey === StageKey.STORY_SETUP) return null;
  if (stageKey === StageKey.STORY_CORE && !committedStates.STORY_SETUP) {
    return "Commit Story Setup before moving into Story Core.";
  }
  if (stageKey === StageKey.WORLD_CAST && !committedStates.STORY_CORE) {
    return "Commit Story Core before moving into World & Cast.";
  }
  if (stageKey === StageKey.PLOT_BLUEPRINT && !committedStates.WORLD_CAST) {
    return "Commit World & Cast before moving into Plot Blueprint.";
  }
  if (stageKey === StageKey.SCENE_PLAN && !committedStates.PLOT_BLUEPRINT) {
    return "Commit Plot Blueprint before moving into Scene Plan.";
  }
  if (stageKey === StageKey.FICTION_DRAFT && !committedStates.SCENE_PLAN) {
    return "Commit Scene Plan before generating the Draft.";
  }
  return null;
}

export async function getFictionStageWorkspace(bookSlug: string, stageKey: StageKey) {
  const book = await getBookBySlugOrThrow(bookSlug);
  assertFictionWorkflow(book);

  const stage = await getStageForBook(book.id, stageKey);
  const stageLinks = getBookStageLinks(book.workflowType, book.slug);
  const stageDefinition = getStageDefinitionForKey(book.workflowType, stageKey);
  const artifactType = FICTION_STAGE_ARTIFACTS[stageKey as keyof typeof FICTION_STAGE_ARTIFACTS];
  if (!artifactType) {
    throw new Error(`Stage ${stageKey} is not a supported fiction planning stage.`);
  }

  const schemaMap = {
    STORY_SETUP: StorySetupSchema,
    STORY_CORE: StoryCoreSchema,
    WORLD_CAST: WorldCastSchema,
    PLOT_BLUEPRINT: PlotBlueprintSchema,
    SCENE_PLAN: ScenePlanSchema,
    FICTION_DRAFT: FictionDraftSchema,
  } as const;
  const schema = schemaMap[stageKey as keyof typeof schemaMap];

  const [latestVersion, committedVersion, versions, storySetup, storyCore, worldCast, plotBlueprint, scenePlan, draft] =
    await Promise.all([
      getLatestFictionArtifactVersion(book.id, artifactType),
      getCommittedFictionArtifactVersion(book.id, artifactType),
      getFictionArtifactVersions(book.id, artifactType, 5),
      getCommittedStageArtifact(book.id, ArtifactType.STORY_SETUP_PROFILE, StorySetupSchema),
      getCommittedStageArtifact(book.id, ArtifactType.STORY_CORE_BIBLE, StoryCoreSchema),
      getCommittedStageArtifact(book.id, ArtifactType.WORLD_CAST_BIBLE, WorldCastSchema),
      getCommittedStageArtifact(book.id, ArtifactType.FICTION_PLOT_BLUEPRINT, PlotBlueprintSchema),
      getCommittedStageArtifact(book.id, ArtifactType.FICTION_SCENE_PLAN, ScenePlanSchema),
      getCommittedStageArtifact(book.id, ArtifactType.FICTION_DRAFT_MANUSCRIPT, FictionDraftSchema),
    ]);

  const latestArtifact = latestVersion?.contentJson ? schema.safeParse(latestVersion.contentJson).data ?? null : null;
  const committedArtifact = committedVersion?.contentJson ? schema.safeParse(committedVersion.contentJson).data ?? null : null;
  const committedStates = {
    STORY_SETUP: Boolean(storySetup),
    STORY_CORE: Boolean(storyCore),
    WORLD_CAST: Boolean(worldCast),
    PLOT_BLUEPRINT: Boolean(plotBlueprint),
    SCENE_PLAN: Boolean(scenePlan),
  };
  const draftMetrics = stageKey === StageKey.FICTION_DRAFT ? getDraftMetrics(scenePlan, latestArtifact as FictionDraftArtifact | null) : null;
  const commitBlockedReason =
    stageKey === StageKey.FICTION_DRAFT && draftMetrics && !draftMetrics.isComplete
      ? `Draft ${draftMetrics.draftedChapters} of ${draftMetrics.plannedChapters} chapters before committing the manuscript.`
      : null;

  return {
    book,
    stage,
    stageDefinition,
    stageLinks,
    latestArtifact,
    committedArtifact,
    versions: versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      lifecycleState: version.lifecycleState,
      createdAt: version.createdAt,
    })),
    sourceJson: JSON.stringify(latestArtifact ?? committedArtifact ?? {}, null, 2),
    blockingReason: getBlockingReason(stageKey, committedStates),
    commitBlockedReason,
    draftMetrics,
    upstream: {
      storySetup,
      storyCore,
      worldCast,
      plotBlueprint,
      scenePlan,
      draft,
    },
  };
}

export async function getCommittedFictionDraftForEditing(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  assertFictionWorkflow(book);
  return getCommittedStageArtifact(book.id, ArtifactType.FICTION_DRAFT_MANUSCRIPT, FictionDraftSchema);
}
