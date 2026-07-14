import assert from "node:assert/strict";
import test from "node:test";

import type {
  AudienceResearchArtifact,
  CoreTruthsArtifact,
  MarketReport,
  PositioningRecommendations,
  TransformationArtifact,
} from "../src/lib/promise-types";
import {
  buildBookPitchCompositionGroundingContext,
  buildBookPitchCompositionGroundingMetadata,
} from "../src/lib/workflows/promise/report-grounding-metadata";

test("buildBookPitchCompositionGroundingMetadata keeps only composition metadata", () => {
  const metadata = buildBookPitchCompositionGroundingMetadata(
    {
      previousPhases: ["Promise Statement", "  Audience Research Phase 1  ", ""],
      audienceSignals: [" Operator pain ", "", "Market pull"],
    },
    {
      previousPhases: ["old phase"],
      audienceSignals: ["old signal"],
      kbSources: [" Source A ", "", "Source B"],
    },
  );

  assert.deepEqual(metadata, {
    previousPhases: ["Promise Statement", "Audience Research Phase 1"],
    audienceSignals: ["Operator pain", "Market pull"],
    kbSources: ["Source A", "Source B"],
  });
});

test("buildBookPitchCompositionGroundingMetadata is deterministic with empty inputs", () => {
  const metadata = buildBookPitchCompositionGroundingMetadata({});

  assert.deepEqual(metadata, {
    previousPhases: [],
    audienceSignals: [],
    kbSources: [],
  });
});

test("buildBookPitchCompositionGroundingContext mirrors report-composition grounding without prompt payload", () => {
  const audienceResearch = {
    phase1: {
      researchQuestions: [
        { question: "q1", answer: "answer one" },
        { question: "q2", answer: "answer two" },
      ],
      identifiedUserTypes: [
        { name: "Operators", description: "own daily execution", details: [] },
      ],
    },
    phase2: { personas: [] },
    phase3: { commonThemes: ["theme one"], primaryPersona: {}, differences: [] },
  } as unknown as AudienceResearchArtifact;
  const coreTruths = {
    coreInsight: { coreTruth: "cadence creates clarity" },
  } as unknown as CoreTruthsArtifact;
  const transformationArc = {
    arc: { stage2We: { sharedProblem: "everyone feels the same friction" } },
  } as unknown as TransformationArtifact;
  const marketReport = {
    executiveSummary: {
      headline: "market wants practical rhythm",
      rationale: "operators are looking for clearer systems",
    },
    recommendations: ["sell the operating model"],
  } as unknown as MarketReport;
  const recommendations = {
    summary: "recommend the practical promise",
    bookStrategy: {
      audienceTargeting: "focus on operators",
    },
    positioningAndMarketing: {
      marketPositioningStatement: "the calmer operating cadence book",
    },
    finalRecommendation: {
      rationale: "clear market and audience pull",
    },
  } as unknown as PositioningRecommendations;

  const grounding = buildBookPitchCompositionGroundingContext({
    audienceResearch,
    coreTruths,
    transformationArc,
    marketReport,
    recommendations,
    personaContexts: [
      {
        name: "Operator Olivia",
        context: "COO",
        dilemma: "too many urgent priorities",
        voiceHint: "Drucker",
      },
    ],
  });

  assert.deepEqual(grounding.previousPhases, [
    "Promise Statement",
    "Audience Research Phase 1",
    "Audience Research Phase 2",
    "Audience Research Phase 3",
    "Truth",
    "Transformation",
    "Market",
    "Recommendations",
  ]);
  assert.deepEqual(grounding.audienceSignals, [
    "answer one",
    "answer two",
    "Operators: own daily execution",
    "theme one",
    "Operator Olivia: too many urgent priorities",
    "cadence creates clarity",
    "everyone feels the same friction",
    "market wants practical rhythm",
    "operators are looking for clearer systems",
    "sell the operating model",
    "recommend the practical promise",
    "focus on operators",
    "the calmer operating cadence book",
    "clear market and audience pull",
  ]);
});
