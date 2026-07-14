import assert from "node:assert/strict";
import test from "node:test";

import type {
  AudienceResearchArtifact,
  PersonaPack,
  PromiseBrief,
} from "../src/lib/promise-types";
import { createFallbackMarketReport } from "../src/lib/workflows/promise/market-analysis-fallback";
import {
  PositioningRecommendationsSchema,
  buildRecommendationsGroundingContext,
  fallbackRecommendations,
  normalizeRecommendationsArtifact,
} from "../src/lib/workflows/promise/market-recommendations-support";

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

const simplePersonas: PersonaPack["personas"] = [
  {
    id: "ops",
    name: "Ops Leader",
    priority: "primary",
    context: "Owns cross-functional execution",
    painPoints: ["Priority churn"],
    desiredOutcomes: ["Predictable execution"],
    buyingMotivations: ["Practical cadence"],
    languageCues: ["focus"],
  },
];

const personaContexts = [
  {
    name: "Ops Leader",
    context: "Owns cross-functional execution",
    dilemma: "they own outcomes but priorities shift every week",
    voiceHint: "Drucker" as const,
  },
];

const audienceResearch: AudienceResearchArtifact = {
  phase: 3,
  phase1: {
    researchQuestions: [
      { question: "What hurts?", answer: "Priorities shift weekly." },
    ],
    identifiedUserTypes: [],
  },
  phase2: {
    personas: [],
  },
  phase3: {
    commonThemes: ["Need clarity"],
    differences: [],
    primaryPersona: { name: "Ops Leader", reasoning: "Highest urgency" },
    comparisonMatrix: [],
  },
};

const marketReport = createFallbackMarketReport(promise, personaContexts);

test("recommendations fallback returns a complete no-provider strategy", () => {
  const recommendations = fallbackRecommendations(promise, marketReport, personaContexts);
  const parsed = PositioningRecommendationsSchema.parse({
    ...recommendations,
    metadata: null,
  });

  assert.match(parsed.summary, /Lead Through the Fog/);
  assert.equal(parsed.finalRecommendation.overallRecommendation, "GO");
  assert.equal(parsed.personaStrategies[0]?.personaName, "Ops Leader");
});

test("recommendations grounding adds market phase and compact market summary", () => {
  const context = buildRecommendationsGroundingContext(
    promise,
    audienceResearch,
    undefined,
    simplePersonas,
    undefined,
    undefined,
    marketReport,
    personaContexts,
  );

  assert.deepEqual(context.previousPhases.slice(-1), ["Market"]);
  assert.equal(context.promptPayload.marketSummary.headline, marketReport.executiveSummary.headline);
  assert.match(context.promptPayload.instruction, /recommendations blueprint/);
  assert.ok(context.audienceSignals.length <= 12);
});

test("normalizeRecommendationsArtifact fills missing sections and normalizes recommendation enum", () => {
  const normalized = normalizeRecommendationsArtifact(
    {
      summary: "A focused wedge wins.",
      finalRecommendation: {
        overallRecommendation: "conditional_go",
      },
      metadata: {
        model: "test-model",
        tokenUsage: {
          input_tokens: 10,
          outputTokens: "20",
          totalTokenCount: 30,
        },
        grounding: {
          previousPhases: ["Promise", "Market"],
          kbSources: "Source A",
          audienceSignals: ["Signal A"],
        },
      },
    },
    promise,
    marketReport,
    personaContexts,
  );

  const parsed = PositioningRecommendationsSchema.parse(normalized);
  assert.equal(parsed.summary, "A focused wedge wins.");
  assert.equal(parsed.finalRecommendation.overallRecommendation, "CONDITIONAL_GO");
  assert.equal(parsed.bookStrategy.coreMessagePositioning.length > 0, true);
  assert.equal(parsed.metadata?.model, "test-model");
  assert.equal(parsed.metadata?.tokenUsage?.inputTokens, 10);
  assert.equal(parsed.metadata?.tokenUsage?.outputTokens, 20);
  assert.equal(parsed.metadata?.tokenUsage?.totalTokens, 30);
  assert.deepEqual(parsed.metadata?.grounding?.kbSources, ["Source A"]);
});
