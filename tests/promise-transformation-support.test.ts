import assert from "node:assert/strict";
import test from "node:test";

import type { PromiseBrief } from "../src/lib/promise-types";
import {
  TransformationArtifactSchema,
  createFallbackTransformationArtifact,
  normalizeTransformationArtifact,
} from "../src/lib/workflows/promise/generation-transformation-support";

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

test("Transformation fallback returns a complete no-provider artifact body", () => {
  const artifact = createFallbackTransformationArtifact(promise, personaContexts);
  const parsed = TransformationArtifactSchema.parse({
    ...artifact,
    metadata: null,
  });

  assert.equal(parsed.arc.stage3Truth.coreTruth, "leaders need a simple operating rhythm");
  assert.equal(parsed.arc.stage2We.personaDilemmas.length, 3);
  assert.equal(parsed.arc.stage3Truth.personaAnswers[0]?.voiceBlendResonates.voice, "Drucker");
});

test("normalizeTransformationArtifact fills missing sections and normalizes persona voice labels", () => {
  const normalized = normalizeTransformationArtifact(
    {
      arc: {
        stage1Me: {
          personalDilemma: "The author kept trying to outrun ambiguity.",
        },
        stage3Truth: {
          coreTruth: "calm diagnosis beats noisy urgency",
          personaAnswers: [
            {
              personaName: "Ops Leader",
              dilemmaAnswer: "A cadence creates signal.",
              voiceBlendResonates: {
                voice: "Drucker",
              },
            },
          ],
        },
      },
      metadata: {
        model: "test-model",
      },
    },
    promise,
    personaContexts,
  );

  const parsed = TransformationArtifactSchema.parse(normalized);
  assert.equal(parsed.arc.stage1Me.personalDilemma, "The author kept trying to outrun ambiguity.");
  assert.equal(parsed.arc.stage3Truth.coreTruth, "calm diagnosis beats noisy urgency");
  assert.equal(parsed.arc.stage3Truth.personaAnswers[1]?.personaName, "Department Head");
  assert.equal(parsed.arc.stage3Truth.personaAnswers[0]?.voiceBlendResonates.voice, "Drucker");
  assert.equal(parsed.metadata?.model, "test-model");
  assert.equal(parsed.metadata?.tokenUsage, null);
});

test("normalizeTransformationArtifact accepts flat arc-shaped payloads", () => {
  const normalized = normalizeTransformationArtifact(
    {
      stage4You: {
        firstAction: "Run a weekly clarity pass.",
      },
      completeTransformation: "The reader moves from noise to cadence.",
    },
    promise,
    personaContexts,
  );

  assert.equal(normalized.arc.stage4You.firstAction, "Run a weekly clarity pass.");
  assert.equal(normalized.arc.completeTransformation, "The reader moves from noise to cadence.");
});
