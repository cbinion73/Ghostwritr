import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  maybeGenerateResearchQuestions,
  verifySourceIntegrity,
  type FetchedSource,
} from "../src/lib/workflows/research/source-discovery";
import type { ChapterContext } from "../src/lib/workflows/research/execution-setup";
import type { ResearchLens } from "../src/lib/research-lenses";

const chapter: ChapterContext = {
  chapterKey: "chapter-1",
  chapterTitle: "The Cost of Clarity",
  chapterDescription: "Why clarity matters",
  paragraphs: [],
};

const lens: ResearchLens = {
  key: "general",
  label: "General",
  description: "General research lens",
  tierRules: "",
  directives: "",
  queryTemplates: [],
  subjectQueries: [],
  storyGuidance: "",
  storyQueryTemplates: [],
};

const baseSource: FetchedSource = {
  id: "candidate-1",
  url: "https://example.org/clarity-report",
  canonicalUrl: "https://example.org/clarity-report",
  title: "Clarity Report",
  publisher: "Example",
  accessedAt: "2026-07-13T00:00:00.000Z",
  contentType: "text/html",
  sourceTier: "B",
  tierWeight: 0.75,
  isVerified: false,
  verificationStatus: "PENDING",
  metadata: {
    searchTitle: "Clarity Report",
  },
  text: "x".repeat(500),
  html: "<html></html>",
};

test("Research source discovery returns fallback questions without a model", async () => {
  const questions = await maybeGenerateResearchQuestions({
    chapter,
    lens,
    getQuestionModel: async () => null,
  });

  assert.equal(questions.length, 3);
  assert.equal(questions[0]?.id, "chapter-1-q1");
  assert.equal(questions[0]?.priority, "primary");
});

test("Research source discovery verifies fetched source integrity without provider calls", async () => {
  const verified = await verifySourceIntegrity(baseSource);
  assert.equal(verified.status, "VERIFIED");
  assert.equal(verified.titleMatch, true);
  assert.equal(verified.contentMatch, true);

  const rejected = await verifySourceIntegrity({
    ...baseSource,
    id: "candidate-2",
    title: "Different Page",
    text: "short",
  });
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.contentMatch, false);
});

test("Research question, search, fetch, and source integrity helpers are owned outside the monolith", () => {
  const monolith = readFileSync("src/lib/workflows/research.ts", "utf8");
  const sourceDiscovery = readFileSync("src/lib/workflows/research/source-discovery.ts", "utf8");

  assert.equal(monolith.includes("const QUESTION_SYSTEM_PROMPT"), false);
  assert.equal(monolith.includes("async function discoverCandidateSources"), false);
  assert.equal(monolith.includes("async function fetchCandidateSource"), false);
  assert.equal(monolith.includes("async function verifySourceIntegrity"), false);
  assert.equal(sourceDiscovery.includes("export async function maybeGenerateResearchQuestions"), true);
  assert.equal(sourceDiscovery.includes("export async function discoverCandidateSources"), true);
  assert.equal(sourceDiscovery.includes("export async function fetchCandidateSource"), true);
  assert.equal(sourceDiscovery.includes("export async function verifySourceIntegrity"), true);
});
