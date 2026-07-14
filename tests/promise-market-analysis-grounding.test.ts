import assert from "node:assert/strict";
import test from "node:test";

import type {
  AudienceResearchArtifact,
  PersonaPack,
  PromiseBrief,
} from "../src/lib/promise-types";
import { buildMarketGroundingContext } from "../src/lib/workflows/promise/market-analysis-grounding";

const promise: PromiseBrief = {
  workingTitle: "Lead Through the Fog",
  audiencePrimary: "operations leaders",
  audienceSecondary: [],
  category: "Business",
  readerProblem: "teams are overwhelmed by unclear priorities",
  readerDesire: "clearer execution and calmer decisions",
  bigIdea: "clarity compounds execution",
  coreTruth: "leaders need a simple operating rhythm",
  transformationBefore: "reactive and scattered",
  transformationAfter: "focused and confident",
  differentiation: "a practical operating cadence",
  promiseStatement: "A practical system for turning unclear priorities into focused execution.",
  stakes: "without clarity, teams waste effort",
  tone: [],
  openQuestions: [],
};

const audienceResearch: AudienceResearchArtifact = {
  phase: 3,
  phase1: {
    researchQuestions: [
      { question: "Who buys?", answer: "Operators who own execution." },
      { question: "What hurts?", answer: "Priorities shift weekly." },
    ],
    identifiedUserTypes: [
      {
        name: "Operators",
        description: "Own cross-functional outcomes",
        details: ["Urgent execution pain", "Budget influence", "Team accountability"],
      },
    ],
  },
  phase2: {
    personas: [],
  },
  phase3: {
    commonThemes: ["Need clarity", "Need cadence"],
    differences: [{ persona: "Operators", difference: "More accountable for execution" }],
    primaryPersona: { name: "Operators", reasoning: "Highest urgency" },
    comparisonMatrix: [],
  },
};

const simplePersonas: PersonaPack["personas"] = [
  {
    id: "ops",
    name: "Ops Leader",
    priority: "primary",
    context: "Owns execution",
    painPoints: ["Priority churn", "Diffused accountability"],
    desiredOutcomes: ["Predictable execution"],
    buyingMotivations: ["Practical cadence"],
    languageCues: ["focus"],
  },
];

test("market grounding context preserves prior phase labels and compact prompt payload", () => {
  const context = buildMarketGroundingContext(
    promise,
    audienceResearch,
    undefined,
    simplePersonas,
    undefined,
    undefined,
    [
      {
        name: "Ops Leader",
        context: "Owns execution",
        dilemma: "they own outcomes but priorities shift weekly",
        voiceHint: "Drucker",
      },
    ],
  );

  assert.deepEqual(context.previousPhases, [
    "Promise Statement",
    "Audience Research Phase 1",
    "Audience Research Phase 2",
    "Audience Research Phase 3",
  ]);
  assert.equal(context.promptPayload.promiseSummary.workingTitle, "Lead Through the Fog");
  assert.equal(context.promptPayload.audienceResearch.phase2Personas[0]?.name, "Ops Leader");
  assert.match(context.promptPayload.instruction, /hard constraints/);
});

test("market grounding context limits audience signals", () => {
  const context = buildMarketGroundingContext(
    promise,
    {
      ...audienceResearch,
      phase1: {
        ...audienceResearch.phase1,
        researchQuestions: Array.from({ length: 12 }, (_, index) => ({
          question: `Q${index}`,
          answer: `Signal ${index}`,
        })),
      },
    },
    undefined,
    simplePersonas,
    undefined,
    undefined,
    [],
  );

  assert.ok(context.audienceSignals.length <= 10);
  assert.equal(context.audienceSignals[0], "Signal 0");
});
