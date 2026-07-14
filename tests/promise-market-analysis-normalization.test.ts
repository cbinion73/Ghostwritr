import assert from "node:assert/strict";
import test from "node:test";

import type { PromiseBrief } from "../src/lib/promise-types";
import { normalizeMarketReport } from "../src/lib/workflows/promise/market-analysis-normalization";
import { MarketReportSchema } from "../src/lib/workflows/promise/market-analysis-report";

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

const personaContexts = [
  {
    name: "Ops Leader",
    context: "Owns execution",
    dilemma: "they own outcomes but priorities shift weekly",
    voiceHint: "Drucker" as const,
  },
];

test("normalizeMarketReport fills missing sections from fallback while preserving supplied comps", () => {
  const normalized = normalizeMarketReport(
    {
      marketCategory: "Business / execution",
      comparisonTitles: [
        {
          title: "Execution",
          author: "Larry Bossidy and Ram Charan",
          whyRelevant: "Classic execution shelf.",
          differenceOpportunity: "More modern pressure pattern.",
        },
      ],
      executiveSummary: {
        headline: "Strong if positioned narrowly.",
        overallRecommendation: "go",
      },
      riskAssessment: {
        overallRiskProfile: "low",
      },
      metadata: {
        model: "test-model",
        tokenUsage: {
          inputTokens: "10",
          output_tokens: 20,
          totalTokenCount: 30,
        },
        grounding: {
          previousPhases: ["Promise"],
          kbSources: "Source A",
          audienceSignals: ["Signal A"],
        },
      },
    },
    promise,
    personaContexts,
  );

  const parsed = MarketReportSchema.parse(normalized);
  assert.equal(parsed.marketCategory, "Business / execution");
  assert.equal(parsed.comparisonTitles[0]?.title, "Execution");
  assert.equal(parsed.competitiveLandscape.directCompetitors[0]?.title, "Execution");
  assert.equal(parsed.executiveSummary.overallRecommendation, "GO");
  assert.equal(parsed.riskAssessment.overallRiskProfile, "Low");
  assert.equal(parsed.metadata?.model, "test-model");
  assert.equal(parsed.metadata?.tokenUsage?.inputTokens, 10);
  assert.equal(parsed.metadata?.tokenUsage?.outputTokens, 20);
  assert.equal(parsed.metadata?.tokenUsage?.totalTokens, 30);
  assert.deepEqual(parsed.metadata?.grounding?.kbSources, ["Source A"]);
});

test("normalizeMarketReport remains schema-valid for empty raw market output", () => {
  const normalized = normalizeMarketReport({}, promise, personaContexts);
  const parsed = MarketReportSchema.parse(normalized);

  assert.equal(parsed.executiveSummary.overallRecommendation, "GO");
  assert.equal(parsed.audienceDemand.personaUrgency[0]?.personaName, "Ops Leader");
  assert.equal(parsed.metadata?.tokenUsage, null);
});
