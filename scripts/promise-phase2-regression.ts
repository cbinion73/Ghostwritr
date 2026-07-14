import assert from "node:assert/strict";

import { selectKnowledgeBaseContent } from "../src/lib/services/knowledge-base";
import { __promiseTestUtils } from "../src/lib/workflows/promise-public";

function testExtractJsonTextDetectsIncompleteJson() {
  assert.throws(
    () =>
      __promiseTestUtils.extractJsonText(
        '{"personas":[{"id":"ops-lead","name":"Ops Lead","demographics":{"role":"Ops Lead"',
      ),
    (error: unknown) => {
      const record = error as { name?: string; code?: string; message?: string };
      return (
        record?.name === "JsonExtractionError" &&
        record?.code === "incomplete_json" &&
        /before the JSON object was complete/i.test(record?.message ?? "")
      );
    },
  );
}

function testExtractJsonTextHandlesCodeFences() {
  const jsonText = __promiseTestUtils.extractJsonText(`\`\`\`json
{
  "personas": [
    {
      "id": "ops-lead",
      "name": "Ops Lead"
    }
  ]
}
\`\`\``);

  const parsed = JSON.parse(jsonText) as { personas: Array<{ id: string }> };
  assert.equal(parsed.personas[0]?.id, "ops-lead");
}

function testNormalizePersonaDeepProfileRepairsCommonSchemaDrift() {
  const normalized = __promiseTestUtils.normalizePersonaDeepProfile(
    {
      id: "director-of-ops",
      name: "Director of Ops",
      demographics: {
        role: "Director of Operations",
        companyType: "B2B SaaS",
        yearsInRole: "7 years",
        careerPath: "Ops manager to director",
        dayToDay: "Balances planning, firefighting, and stakeholder alignment.",
        teamSize: "12 direct and indirect reports",
      },
      currentSituation: {
        whatTheyDo: "Owns delivery cadence and operating systems.",
        whatWorks: ["Weekly planning"],
        whatDoesntWorkWell: ["Context switching"],
        timeUse: "Half in meetings, half in execution support.",
        biggestFrustration: "Too many escalations land on their desk.",
      },
      goals: [{ goal: "Reduce escalation churn", type: "outcome" }],
      painPoints: [{ friction: "Reactive work", realCost: "Lost focus time" }],
      objections: [{ objection: "Generic advice", proofNeeded: "Ops-specific examples" }],
      successMetrics: [{ metric: "Fewer escalations", feeling: "More in control" }],
      learningStyle: {
        prefers: ["Frameworks"],
        hates: ["Abstract theory"],
        bestFormat: "Annotated case studies",
      },
      voiceBlendFit: {
        primary: "Drucker",
        why: "They want operating clarity they can use immediately.",
      },
    },
    0,
  );

  assert.equal(normalized.demographics.dayInTheLife, "Balances planning, firefighting, and stakeholder alignment.");
  assert.equal(normalized.demographics.teamSize, 12);
  assert.equal(normalized.demographics.reportsTo, "Senior leader");
  assert.equal(normalized.currentSituation.whatDoesntWork[0], "Context switching");
  assert.equal(normalized.voiceBlendFit.reasoning, "They want operating clarity they can use immediately.");
}

function testKnowledgeFallbackLimitRespectsNarrowingIntent() {
  assert.equal(__promiseTestUtils.deriveKnowledgeFallbackCharLimit(undefined, undefined), 30000);
  assert.equal(__promiseTestUtils.deriveKnowledgeFallbackCharLimit("audience", 2), 6000);
  assert.equal(__promiseTestUtils.deriveKnowledgeFallbackCharLimit("audience", 4), 10000);
  assert.equal(__promiseTestUtils.deriveKnowledgeFallbackCharLimit("audience", 99), 16000);
}

function testFallbackKnowledgeSelectionSkipsOversizedNewestSource() {
  const oversized = "A".repeat(7000);
  const fitting = "B".repeat(2000);

  const selection = selectKnowledgeBaseContent(
    [
      { title: "Newest giant source", extractedText: oversized },
      { title: "Smaller relevant source", extractedText: fitting },
    ],
    6000,
  );

  assert.equal(selection.sourceCount, 1);
  assert.match(selection.content, /Smaller relevant source/);
  assert.doesNotMatch(selection.content, /Newest giant source/);
}

function testPersonaGenerationInstructionAndBatchingFavorReliability() {
  const instruction = __promiseTestUtils.buildPersonaGenerationInstruction(1);

  assert.match(instruction, /Generate exactly 1 reader persona/i);
  assert.match(instruction, /Use `dayInTheLife` exactly/i);
  assert.match(instruction, /JSON numbers for `yearsInRole` and `teamSize`/i);
  assert.equal(__promiseTestUtils.getPersonaDeepProfileBatchSize(1), 1);
  assert.equal(__promiseTestUtils.getPersonaDeepProfileBatchSize(5), 2);
  assert.equal(__promiseTestUtils.getPersonaDeepProfilePhaseBudgetMs(1), 120000);
  assert.equal(__promiseTestUtils.getPersonaDeepProfilePhaseBudgetMs(5), 180000);
  assert.equal(__promiseTestUtils.getPersonaDeepProfilePhaseBudgetMs(10), 240000);
}

function main() {
  testExtractJsonTextDetectsIncompleteJson();
  testExtractJsonTextHandlesCodeFences();
  testNormalizePersonaDeepProfileRepairsCommonSchemaDrift();
  testKnowledgeFallbackLimitRespectsNarrowingIntent();
  testFallbackKnowledgeSelectionSkipsOversizedNewestSource();
  testPersonaGenerationInstructionAndBatchingFavorReliability();

  console.log(
    JSON.stringify(
      {
        status: "ok",
        checks: [
          "incomplete-json detection",
          "code-fence JSON extraction",
          "persona schema normalization",
          "knowledge fallback sizing",
          "oversized-source fallback selection",
          "bounded persona batch strategy",
        ],
      },
      null,
      2,
    ),
  );
}

main();
