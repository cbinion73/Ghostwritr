import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFallbackPersonaComparisonAnalysis,
  buildPersonaGenerationInstruction,
  getPersonaDeepProfileBatchSize,
  getPersonaDeepProfilePhaseBudgetMs,
  normalizeAudienceResearchPhase1,
  normalizePersonaComparisonAnalysis,
  normalizePersonaDeepProfile,
  summarizePersonasForComparison,
  summarizePersonasForPrompt,
} from "../src/lib/workflows/promise/audience-personas-support";

const rawPersona = {
  name: "Ops Leader",
  priority: "primary",
  demographics: {
    role: "VP Operations",
    companyType: "Growth-stage SaaS",
    yearsInRole: "7",
    careerPath: "Operator turned executive",
    dayToDay: "Moves between operating reviews, escalations, and coaching managers.",
    reportsTo: "CEO",
    teamSize: "24",
  },
  currentSituation: {
    whatTheyDo: "Own execution across teams.",
    whatWorks: ["Weekly operating rhythm"],
    whatDoesntWorkWell: ["Priorities drift between meetings"],
    timeUse: "Split between execution and firefighting.",
    biggestFrustration: "Accountability diffuses as the company scales.",
  },
  goals: ["Make execution predictable", { goal: "Feel ahead of problems", type: "feeling" }],
  painPoints: [{ friction: "Unclear ownership", realCost: "Missed deadlines" }],
  objections: [{ objection: "Another framework may not stick", proofNeeded: "Peer examples" }],
  successMetrics: [{ metric: "Fewer slipped priorities", feeling: "Control" }],
  learningStyle: {
    prefers: ["Examples", "Checklists"],
    hates: ["Theory-only advice"],
    bestFormat: "Short practical chapters",
  },
  voiceBlendFit: {
    primary: "Drucker",
    secondary: "Andy",
    why: "Needs strategic clarity with plain-language teaching.",
  },
};

test("normalizeAudienceResearchPhase1 accepts alternate user-type detail keys", () => {
  const normalized = normalizeAudienceResearchPhase1({
    researchQuestions: [{ question: "Who buys?", answer: "Operators with urgent execution pain." }],
    identifiedUserTypes: [{ name: "Operators", description: "Own execution", bullets: ["Urgent pain"] }],
  });

  assert.equal(normalized.researchQuestions[0]?.question, "Who buys?");
  assert.deepEqual(normalized.identifiedUserTypes[0]?.details, ["Urgent pain"]);
});

test("normalizePersonaDeepProfile coerces legacy persona fields into the strict shape", () => {
  const normalized = normalizePersonaDeepProfile(rawPersona, 0);

  assert.equal(normalized.id, "ops-leader");
  assert.equal(normalized.demographics.yearsInRole, 7);
  assert.equal(normalized.demographics.teamSize, 24);
  assert.equal(normalized.demographics.dayInTheLife, rawPersona.demographics.dayToDay);
  assert.deepEqual(normalized.currentSituation.whatDoesntWork, ["Priorities drift between meetings"]);
  assert.equal(normalized.goals[0]?.type, "outcome");
  assert.equal(normalized.goals[1]?.type, "feeling");
  assert.equal(normalized.voiceBlendFit.reasoning, rawPersona.voiceBlendFit.why);
});

test("persona generation helpers preserve batching and prompt guardrails", () => {
  assert.equal(getPersonaDeepProfileBatchSize(1), 1);
  assert.equal(getPersonaDeepProfileBatchSize(5), 2);
  assert.equal(getPersonaDeepProfilePhaseBudgetMs(1), 120000);
  assert.equal(getPersonaDeepProfilePhaseBudgetMs(10), 240000);

  const instruction = buildPersonaGenerationInstruction(2);
  assert.match(instruction, /Generate exactly 2 reader personas/);
  assert.match(instruction, /Use `dayInTheLife` exactly/);
  assert.match(instruction, /Use JSON numbers for `yearsInRole` and `teamSize`/);
});

test("persona summarizers keep prompts compact and comparison-ready", () => {
  const persona = normalizePersonaDeepProfile(rawPersona, 0);

  assert.deepEqual(summarizePersonasForPrompt([persona]), [
    {
      id: "ops-leader",
      name: "Ops Leader",
      role: "VP Operations",
      companyType: "Growth-stage SaaS",
      biggestFrustration: "Accountability diffuses as the company scales.",
    },
  ]);

  const comparisonSummary = summarizePersonasForComparison([persona]);
  assert.equal(comparisonSummary[0]?.demographics.reportsTo, "CEO");
  assert.equal(comparisonSummary[0]?.currentSituation.whatWorks.length, 1);
  assert.equal(comparisonSummary[0]?.painPoints.length, 1);
});

test("persona comparison fallback and normalizer preserve canonical persona names", () => {
  const persona = normalizePersonaDeepProfile(rawPersona, 0);
  const fallback = buildFallbackPersonaComparisonAnalysis([persona]);

  assert.equal(fallback.primaryPersona.name, "Ops Leader");
  assert.equal(fallback.comparisonMatrix.length, 6);

  const normalized = normalizePersonaComparisonAnalysis(
    {
      commonThemes: ["Execution pain"],
      differences: [{ persona: "Made Up", difference: "Feels scale pressure" }],
      primaryPersona: { name: "Made Up", reasoning: "Looks urgent" },
      comparisonMatrix: [{ dimension: "Pain", personas: [{ name: "Made Up", value: "Scale" }] }],
    },
    [persona],
  );

  assert.equal(normalized.differences[0]?.persona, "Ops Leader");
  assert.equal(normalized.primaryPersona.name, "Ops Leader");
  assert.equal(normalized.comparisonMatrix[0]?.personas[0]?.name, "Ops Leader");
});
