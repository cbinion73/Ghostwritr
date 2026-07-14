import assert from "node:assert/strict";
import test from "node:test";

import type { PromiseBrief } from "../src/lib/promise-types";
import { createFallbackMarketReport, fallbackMarketReport } from "../src/lib/workflows/promise/market-analysis-fallback";
import { MarketReportSchema } from "../src/lib/workflows/promise/market-analysis-report";

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
  differentiation: "",
  promiseStatement: "A practical system for turning unclear priorities into focused execution.",
  stakes: "without clarity, teams waste effort",
  tone: ["practical", "direct"],
  openQuestions: [],
};

test("market fallback returns a strict schema-valid report without provider calls", () => {
  const report = fallbackMarketReport(promise);
  const parsed = MarketReportSchema.parse(report);

  assert.equal(parsed.executiveSummary.overallRecommendation, "CONDITIONAL_GO");
  assert.equal(parsed.riskAssessment.overallRiskProfile, "High");
  assert.equal(parsed.comparisonTitles.length, 3);
  assert.equal(parsed.metadata?.model, "fallback");
});

test("market fallback uses supplied persona and differentiation signals", () => {
  const report = createFallbackMarketReport(
    {
      ...promise,
      differentiation: "a field-tested operating cadence for overloaded teams",
    },
    [
      {
        name: "Ops Leader",
        context: "Owns cross-functional execution",
        dilemma: "they own outcomes but priorities shift every week",
        voiceHint: "Drucker",
      },
    ],
  );

  assert.equal(report.executiveSummary.overallRecommendation, "GO");
  assert.equal(report.riskAssessment.overallRiskProfile, "Medium");
  assert.match(report.audienceDemand.personaUrgency[0]?.urgency ?? "", /Ops Leader feels active pressure/);
});
