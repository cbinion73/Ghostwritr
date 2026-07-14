import assert from "node:assert/strict";
import test from "node:test";

import type { PersonaDeepProfile, PersonaPack, PromiseBrief } from "../src/lib/promise-types";
import {
  buildTruthPersonaContexts,
  normalizeTruthVoice,
} from "../src/lib/workflows/promise/report-persona-context";

function promise(overrides: Partial<PromiseBrief> = {}): PromiseBrief {
  return {
    workingTitle: "The Practical Promise",
    audiencePrimary: "Senior Operators",
    audienceSecondary: ["Founder CEOs", "Team Leads"],
    category: "Business",
    readerProblem: "Their teams are busy but not coordinated.",
    readerDesire: "clearer operating rhythm",
    bigIdea: "Operating cadence beats motivation.",
    coreTruth: "Cadence creates clarity.",
    transformationBefore: "Reactive work",
    transformationAfter: "Rhythmic execution",
    differentiation: "A field-tested operating model",
    promiseStatement: "Build a calmer operating cadence.",
    stakes: "Misalignment compounds.",
    tone: [],
    openQuestions: [],
    ...overrides,
  };
}

function deepPersona(
  name: string,
  priority: "primary" | "secondary",
  voice: string,
): PersonaDeepProfile {
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    priority,
    demographics: {
      role: `${name} role`,
      companyType: `${name} company`,
      yearsInRole: 5,
      careerPath: "operator",
      dayInTheLife: "meetings and decisions",
      reportsTo: "CEO",
      teamSize: 12,
    },
    currentSituation: {
      whatTheyDo: "lead",
      whatWorks: [],
      whatDoesntWork: [],
      timeAllocation: "fragmented",
      biggestFrustration: `${name} has too much noise.`,
    },
    goals: [],
    painPoints: [
      { friction: `${name} cannot see priorities.`, realCost: "delay" },
      { friction: `${name} repeats decisions.`, realCost: "waste" },
    ],
    objections: [],
    successMetrics: [],
    learningStyle: {
      prefers: [],
      hates: [],
      bestFormat: "plain",
    },
    voiceBlendFit: {
      primary: voice,
      reasoning: "matches the reader",
    },
  };
}

test("normalizes truth voice hints to supported voices", () => {
  assert.equal(normalizeTruthVoice("Andy Stanley clarity"), "Andy");
  assert.equal(normalizeTruthVoice("Steve Jobs launch energy"), "Jobs");
  assert.equal(normalizeTruthVoice("plain strategic voice"), "Drucker");
  assert.equal(normalizeTruthVoice(null), "Drucker");
});

test("builds unique persona contexts with primary deep profiles first", () => {
  const profiles = [
    deepPersona("Secondary Sam", "secondary", "Jobs"),
    deepPersona("Primary Pat", "primary", "Andy"),
    deepPersona("Primary Pat", "secondary", "Drucker"),
    deepPersona("Third Taylor", "secondary", "Drucker"),
  ];

  const contexts = buildTruthPersonaContexts(promise(), profiles);

  assert.deepEqual(
    contexts.map((context) => context.name),
    ["Primary Pat", "Secondary Sam", "Third Taylor"],
  );
  assert.equal(contexts[0]?.voiceHint, "Andy");
  assert.match(contexts[0]?.context ?? "", /Primary Pat role in Primary Pat company/);
  assert.match(contexts[0]?.dilemma ?? "", /Primary Pat has too much noise/);
});

test("uses simple personas before promise fallbacks and fills to three contexts", () => {
  const simplePersonas: PersonaPack["personas"] = [
    {
      id: "operator",
      name: "Operator Olivia",
      priority: "primary",
      context: "COO trying to make priorities visible",
      painPoints: ["Too many urgent requests", "No shared scoreboard"],
      desiredOutcomes: ["Cleaner execution"],
      buyingMotivations: [],
      languageCues: [],
    },
  ];

  const contexts = buildTruthPersonaContexts(promise(), undefined, simplePersonas);

  assert.deepEqual(
    contexts.map((context) => context.name),
    ["Operator Olivia", "Senior Operators", "Founder CEOs"],
  );
  assert.equal(contexts[0]?.voiceHint, "Drucker");
  assert.match(contexts[0]?.dilemma ?? "", /Too many urgent requests/);
  assert.match(contexts[1]?.context ?? "", /clearer operating rhythm/);
  assert.equal(contexts[2]?.voiceHint, "Andy");
});
