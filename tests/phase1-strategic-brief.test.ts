import test from "node:test";
import assert from "node:assert/strict";
import { ArtifactType } from "@prisma/client";

import {
  Phase1StrategicBriefSchema,
  compilePhase1StrategicBrief,
} from "../src/lib/phase1-strategic-brief";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function artifact(type: ArtifactType, contentJson: unknown, versionId = `${type.toLowerCase()}-v1`) {
  return { type, contentJson, versionId };
}

const book = {
  id: "book-1",
  slug: "test-book",
  titleWorking: "The Better Book",
  subtitle: "A Field Guide",
  workflowType: "NONFICTION",
};

const setup = {
  workingTitle: "The Better Book",
  subtitle: "A Field Guide",
  writerPersona: "Default Ghostwriter",
  writerPersonaBlend: [
    {
      personaId: "p1",
      personaName: "Andy Stanley",
      personaSlug: "andy-stanley",
      percentInfluence: 60,
      traits: ["clear", "memorable"],
      signaturePatterns: ["sticky phrases"],
    },
  ],
  baseStoryFormatPreference: "AUTO",
  voiceReferenceNotes: ["plainspoken"],
  targetWordCount: 45000,
  wordCountTolerance: 2500,
  targetPageCount: 180,
  trimSize: "6 x 9 in",
  outputFormats: ["PRINT", "EBOOK"],
  aiAuthorshipGuardEnabled: true,
  provenanceTrackingEnabled: true,
  marketingHandoffEnabled: true,
  notesToSystem: [],
  voiceTone: "warm and direct",
  chapterFormat: ["reflection-questions", "checklists"],
  readerLevel: "practitioner",
};

const promise = {
  workingTitle: "The Better Book",
  audiencePrimary: "busy operators",
  audienceSecondary: ["team leads"],
  category: "business nonfiction",
  readerProblem: "They are drowning in priorities.",
  readerDesire: "They want clearer execution.",
  bigIdea: "Clarity compounds.",
  coreTruth: "You cannot scale confusion.",
  transformationBefore: "Reactive and scattered.",
  transformationAfter: "Focused and repeatable.",
  differentiation: "Practical without being shallow.",
  promiseStatement: "This book helps operators turn noise into durable clarity.",
  stakes: "Without clarity, teams waste their best energy.",
  tone: ["practical"],
  openQuestions: [],
};

const personas = {
  personas: [
    {
      id: "reader-1",
      name: "The Operator",
      priority: "primary",
      context: "Runs a stretched team.",
      painPoints: ["too many priorities"],
      desiredOutcomes: ["clearer rhythm"],
      buyingMotivations: ["save time"],
      languageCues: ["make it usable"],
    },
  ],
};

const market = {
  marketCategory: "business nonfiction",
  comparisonTitles: [
    { title: "Essentialism", author: "Greg McKeown", whyRelevant: "Focus", differenceOpportunity: "More operational" },
    { title: "The ONE Thing", author: "Gary Keller", whyRelevant: "Prioritization", differenceOpportunity: "More team based" },
    { title: "Atomic Habits", author: "James Clear", whyRelevant: "Systems", differenceOpportunity: "More leadership focused" },
  ],
  commercialRisks: ["crowded category"],
  attractionDrivers: ["clear practical promise"],
  executiveSummary: {
    overallRecommendation: "GO",
    strategicPriority: "Own practical clarity for operators.",
  },
};

test("Phase 1 strategic brief compiles complete approved setup, promise, audience, market, voice, length, and KDP choices", () => {
  const brief = compilePhase1StrategicBrief({
    book,
    compiledAt: new Date("2026-07-13T13:41:42.302Z"),
    artifacts: [
      artifact(ArtifactType.BOOK_SETUP_PROFILE, setup),
      artifact(ArtifactType.PROMISE_BRIEF, promise),
      artifact(ArtifactType.PERSONA_PACK, personas),
      artifact(ArtifactType.MARKET_REPORT, market),
    ],
  });

  assert.equal(brief.readiness.isComplete, true);
  assert.equal(brief.book.targetWordCount, 45000);
  assert.equal(brief.book.kdpChoices.trimSize, "6 x 9 in");
  assert.equal(brief.promise.statement, promise.promiseStatement);
  assert.equal(brief.audience.personas[0]?.name, "The Operator");
  assert.equal(brief.market.comparableTitles.length, 3);
  assert.equal(brief.voice.writerPersonaBlend[0]?.personaName, "Andy Stanley");
  assert.equal(brief.voice.voiceTone, "warm and direct");
  assert.doesNotThrow(() => Phase1StrategicBriefSchema.parse(brief));
});

test("Phase 1 strategic brief flags missing sources and non-three comparable titles", () => {
  const brief = compilePhase1StrategicBrief({
    book,
    artifacts: [
      artifact(ArtifactType.BOOK_SETUP_PROFILE, setup),
      artifact(ArtifactType.PROMISE_BRIEF, promise),
      artifact(ArtifactType.MARKET_REPORT, {
        ...market,
        comparisonTitles: market.comparisonTitles.slice(0, 2),
      }),
    ],
  });

  assert.equal(brief.readiness.isComplete, false);
  assert.ok(brief.readiness.missing.includes("reader personas or audience research"));
  assert.ok(brief.readiness.warnings.some((warning) => warning.includes("exactly 3 comparable titles")));
});

test("Phase 1 strategic brief has a dedicated artifact type and commit wiring", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260713094500_phase1_strategic_brief_artifact/migration.sql");
  const repository = read("src/lib/repositories/phase1-strategic-brief-artifacts.ts");
  const workflow = read("src/lib/workflows/phase1-strategic-brief.ts");
  const promiseWorkspace = read("src/lib/workflows/promise/workspace.ts");

  assert.ok(schema.includes("PHASE1_STRATEGIC_BRIEF"));
  assert.ok(migration.includes("PHASE1_STRATEGIC_BRIEF"));
  assert.ok(repository.includes("createCommittedPhase1StrategicBrief"));
  assert.ok(repository.includes("commitArtifactVersionInTransaction"));
  assert.ok(workflow.includes("compileAndCommitPhase1StrategicBrief"));
  assert.ok(workflow.includes("phase1StrategicBriefVersionId"));
  assert.ok(promiseWorkspace.includes("compileAndCommitPhase1StrategicBrief(bookSlug)"));
});

test("Phase 1 guided UI surfaces the required foundation choices", () => {
  const guidePanel = read("src/app/books/[slug]/promise/phase1-guided-journey-panel.tsx");
  const promiseDetail = read("src/app/books/[slug]/promise/promise-detail-content.tsx");
  const promiseWorkspace = read("src/lib/workflows/promise/workspace.ts");

  assert.ok(guidePanel.includes("Unified Phase 1"));
  assert.ok(guidePanel.includes("Three Comparable Titles"));
  assert.ok(guidePanel.includes("Phase 1 requires exactly 3"));
  assert.ok(guidePanel.includes("Voice, Length & KDP"));
  assert.ok(guidePanel.includes("Approved strategic brief"));
  assert.ok(promiseDetail.includes("Phase1GuidedJourneyPanel"));
  assert.ok(promiseWorkspace.includes("phase1StrategicBrief"));
});

test("Phase 1 gate cleanup makes downstream nonfiction stages depend on approved strategic brief", () => {
  const workspacePage = read("src/app/books/[slug]/page.tsx");
  const commitRoute = read("src/app/api/books/[slug]/agent-chat/commit/route.ts");
  const outlineWorkflow = read("src/lib/workflows/outline.ts");
  const outlineActions = read("src/app/books/[slug]/outline/actions.ts");
  const marketPage = read("src/app/books/[slug]/market-analysis/page.tsx");
  const stageTokens = read("src/lib/ui/stage-tokens.ts");
  const registry = read("src/lib/workflow-registry.ts");
  const nonfictionRegistry = registry.slice(0, registry.indexOf("const FICTION_WORKFLOW"));

  assert.ok(workspacePage.includes("ArtifactType.PHASE1_STRATEGIC_BRIEF"));
  assert.ok(workspacePage.includes("requiresApprovedPhase1"));
  assert.ok(commitRoute.includes('stageKey === "PROMISE" || stageKey === "MARKET_ANALYSIS"'));
  assert.ok(commitRoute.includes("approved strategic brief"));
  assert.ok(outlineWorkflow.includes("getCommittedPhase1StrategicBrief"));
  assert.ok(outlineWorkflow.includes("Approved Phase 1 strategic brief is required before generating an outline."));
  assert.ok(outlineActions.includes("assertApprovedPhase1StrategicBrief"));
  assert.ok(marketPage.includes('redirect(`/books/${slug}?stage=PROMISE`)'));
  assert.ok(stageTokens.includes("number: stage.number"));
  assert.ok(registry.includes("key: StageKey.OUTLINE"));
  assert.ok(registry.includes("number: 3"));
  assert.equal(nonfictionRegistry.includes("StageKey.MARKET_ANALYSIS"), false);
});
