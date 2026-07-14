import assert from "node:assert/strict";
import test from "node:test";

import type {
  AudienceResearchArtifact,
  PersonaPack,
  PromiseBrief,
} from "../src/lib/promise-types";
import {
  CoreTruthsArtifactSchema,
  buildTruthGroundingContext,
  createFallbackCoreTruthArtifact,
  normalizeCoreTruthsArtifact,
} from "../src/lib/workflows/promise/generation-core-truths-support";

const promise: PromiseBrief = {
  workingTitle: "Lead Through the Fog",
  audiencePrimary: "operations leaders",
  audienceSecondary: ["department heads"],
  category: "Business",
  readerProblem: "teams are overwhelmed by unclear priorities",
  readerDesire: "clearer execution and calmer decisions",
  bigIdea: "clarity compounds execution",
  coreTruth: "leaders need a simple operating rhythm",
  transformationBefore: "reactive and scattered",
  transformationAfter: "focused and confident",
  differentiation: "a field-tested operating cadence",
  promiseStatement: "A practical system for turning unclear priorities into focused execution.",
  stakes: "without clarity, teams waste effort",
  tone: ["practical", "direct"],
  openQuestions: [],
};

const personaContexts = [
  {
    name: "Ops Leader",
    context: "Owns cross-functional execution",
    dilemma: "they own outcomes but priorities shift every week",
    voiceHint: "Drucker" as const,
  },
  {
    name: "Department Head",
    context: "Owns a stretched team",
    dilemma: "they need momentum without burning people out",
    voiceHint: "Andy" as const,
  },
  {
    name: "Founder",
    context: "Owns the whole system",
    dilemma: "they need signal through noise",
    voiceHint: "Jobs" as const,
  },
];

const simplePersonas: PersonaPack["personas"] = [
  {
    id: "ops",
    name: "Ops Leader",
    priority: "primary",
    context: "Owns cross-functional execution",
    painPoints: ["Priority churn", "Diffused accountability"],
    desiredOutcomes: ["Predictable execution"],
    buyingMotivations: ["Practical cadence"],
    languageCues: ["focus"],
  },
];

const audienceResearch: AudienceResearchArtifact = {
  phase: 3,
  phase1: {
    researchQuestions: [
      { question: "What hurts?", answer: "Priorities shift weekly." },
      { question: "Who buys?", answer: "Operators who own execution." },
    ],
    identifiedUserTypes: [
      {
        name: "Operators",
        description: "Own cross-functional outcomes",
        details: ["Urgent execution pain", "Budget influence"],
      },
    ],
  },
  phase2: { personas: [] },
  phase3: {
    commonThemes: ["Need clarity", "Need cadence"],
    differences: [],
    primaryPersona: { name: "Ops Leader", reasoning: "Highest urgency" },
    comparisonMatrix: [],
  },
};

test("Core Truths fallback returns a complete no-provider artifact body", () => {
  const artifact = createFallbackCoreTruthArtifact(promise, personaContexts);
  const parsed = CoreTruthsArtifactSchema.parse({
    ...artifact,
    metadata: null,
  });

  assert.equal(parsed.coreInsight.coreTruth, "leaders need a simple operating rhythm");
  assert.equal(parsed.personaExperiences.length, 3);
  assert.equal(parsed.personaExperiences[0]?.voiceBlendResonates.voice, "Drucker");
});

test("Core Truths grounding preserves prior phase labels and compact prompt payload", () => {
  const context = buildTruthGroundingContext(
    promise,
    audienceResearch,
    undefined,
    simplePersonas,
    personaContexts,
  );

  assert.deepEqual(context.previousPhases, [
    "Promise Statement",
    "Audience Research Phase 1",
    "Audience Research Phase 2",
    "Audience Research Phase 3",
  ]);
  assert.equal(context.promptPayload.promiseSummary.coreTruth, "leaders need a simple operating rhythm");
  assert.equal(context.promptPayload.selectedPersonas[0]?.name, "Ops Leader");
  assert.ok(context.audienceSignals.length <= 8);
});

test("normalizeCoreTruthsArtifact fills missing sections and normalizes voice labels", () => {
  const normalized = normalizeCoreTruthsArtifact(
    {
      coreInsight: {
        falseBelief: "More urgency solves confusion.",
        coreTruth: "calm diagnosis beats noisy urgency",
      },
      paradox: {
        whatMakesThisSurprising: "Slowing down can speed up execution.",
      },
      stakes: {
        ifEmbraced: "Teams focus.",
      },
      evidence: {
        methods: ["Framework/System/Model", "Unsupported"],
      },
      personaExperiences: [
        {
          personaName: "Ops Leader",
          theirVersionOfTruth: "Cadence creates clarity.",
          whatMakesItLand: "It names the weekly pressure.",
          voiceBlendResonates: {
            voice: "Drucker",
          },
        },
      ],
      metadata: {
        model: "test-model",
      },
    },
    promise,
    personaContexts,
  );

  const parsed = CoreTruthsArtifactSchema.parse(normalized);
  assert.equal(parsed.coreInsight.coreTruth, "calm diagnosis beats noisy urgency");
  assert.deepEqual(parsed.evidence.methods, ["Framework/System/Model"]);
  assert.equal(parsed.personaExperiences[1]?.personaName, "Department Head");
  assert.equal(parsed.metadata?.model, "test-model");
  assert.equal(parsed.metadata?.tokenUsage, null);
});

test("normalizeCoreTruthsArtifact preserves legacy truths without provider calls", () => {
  const normalized = normalizeCoreTruthsArtifact(
    {
      truths: [
        {
          truth: "clarity compounds",
          foundationalInsight: "misdiagnosis wastes motion",
          bookRelevance: "the book teaches calmer decisions",
        },
      ],
    },
    promise,
    personaContexts,
  );

  assert.equal(normalized.coreInsight.coreTruth, "clarity compounds");
  assert.equal(normalized.legacyTruths?.[0]?.foundationalInsight, "misdiagnosis wastes motion");
});
