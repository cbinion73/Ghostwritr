import test from "node:test";
import assert from "node:assert/strict";

import type { PositioningRecommendations, PromiseBrief } from "../src/lib/promise-types";
import {
  buildBookPitchAudienceProfiles,
  getSelectedTitleSubtitle,
  renderMarkdownBulletList,
  renderMarkdownNumberedList,
  summarizeBookPitchTargetAudience,
  summarizeVoiceBlendForPitch,
  type TruthPersonaContext,
} from "../src/lib/workflows/promise/report-presentation";

const promise: PromiseBrief = {
  workingTitle: "Default Title",
  audiencePrimary: "operators",
  audienceSecondary: [],
  category: "Business",
  readerProblem: "Noise",
  readerDesire: "A clearer operating model",
  bigIdea: "Clarity compounds.",
  coreTruth: "Durability beats frenzy.",
  transformationBefore: "Reactive",
  transformationAfter: "Durable",
  differentiation: "Practical operating clarity",
  promiseStatement: "Build a calmer system.",
  stakes: "Execution gets expensive.",
  tone: [],
  openQuestions: [],
};

const recommendations = {
  personaStrategies: [
    {
      primaryPositioning: "A practical operating system for overwhelmed operators.",
      keyMessage: "Trade noise for durable clarity.",
    },
  ],
} as PositioningRecommendations;

const personaContexts: TruthPersonaContext[] = [
  {
    name: "Operator",
    context: "Founder under operational load. Needs clarity.",
    dilemma: "They have too many priorities and no durable system.",
    voiceHint: "Drucker",
  },
];

test("getSelectedTitleSubtitle prefers finalized title package over setup and promise fallbacks", () => {
  assert.deepEqual(
    getSelectedTitleSubtitle(
      promise,
      { workingTitle: "Setup Title", subtitle: "Setup Subtitle" } as never,
      {
        finalizedTitle: "Final Title",
        finalizedSubtitle: "Final Subtitle",
      } as never,
    ),
    { title: "Final Title", subtitle: "Final Subtitle" },
  );

  assert.deepEqual(getSelectedTitleSubtitle(promise), {
    title: "Default Title",
    subtitle: "A clearer operating model for operators",
  });
});

test("summarizeVoiceBlendForPitch reports the top three weighted personas", () => {
  assert.equal(
    summarizeVoiceBlendForPitch({
      writerPersonaBlend: [
        { personaName: "Andy Stanley", percentInfluence: 40 },
        { personaName: "Peter Drucker", percentInfluence: 35 },
        { personaName: "Jobs-style", percentInfluence: 25 },
        { personaName: "Extra", percentInfluence: 10 },
      ],
    } as never),
    "Andy Stanley: 40% | Peter Drucker: 35% | Jobs-style: 25%",
  );
});

test("buildBookPitchAudienceProfiles falls back to truth persona context when audience research is absent", () => {
  const profiles = buildBookPitchAudienceProfiles(
    undefined,
    undefined,
    personaContexts,
    recommendations,
  );

  assert.deepEqual(profiles, [
    {
      label: "Founder under operational load",
      description: "Founder under operational load. Needs clarity.",
      roleContext: "Founder under operational load. Needs clarity.",
      primaryPainPoint: "They have too many priorities and no durable system.",
      whyThisBook: "A practical operating system for overwhelmed operators.",
      keySignals: ["They have too many priorities and no durable system."],
      voiceBlendResonance: "Drucker",
    },
  ]);

  assert.equal(
    summarizeBookPitchTargetAudience(profiles, promise),
    "Founder under operational load: Founder under operational load. Needs clarity.",
  );
});

test("markdown list renderers trim empty values and use deterministic fallbacks", () => {
  assert.equal(renderMarkdownBulletList([" Alpha ", "", "Beta"], "Fallback"), "- Alpha\n- Beta");
  assert.equal(renderMarkdownBulletList([""], "Fallback"), "- Fallback");
  assert.equal(renderMarkdownNumberedList([" Alpha ", "", "Beta"], "Fallback"), "1. Alpha\n2. Beta");
  assert.equal(renderMarkdownNumberedList([""], "Fallback"), "1. Fallback");
});
