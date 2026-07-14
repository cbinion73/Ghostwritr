import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Research live chapter orchestration is owned outside the monolith", () => {
  const monolith = readFileSync("src/lib/workflows/research.ts", "utf8");
  const execution = readFileSync("src/lib/workflows/research/execution.ts", "utf8");
  const livePipeline = readFileSync("src/lib/workflows/research/chapter-live-pipeline.ts", "utf8");

  assert.equal(monolith.includes("export async function runChapterResearchWorkflowImpl"), false);
  assert.equal(monolith.includes("ResearchChapterTimeoutError"), false);
  assert.equal(monolith.includes("discoverCandidateSources(chapterContext"), false);
  assert.equal(monolith.includes("extractItemsFromSource(chapter"), false);
  assert.equal(monolith.includes("runChapterResearchWorkflowImpl(bookSlug"), false);
  assert.match(monolith, /runChapterResearchWorkflow\(bookSlug, chapterKey\)/);

  assert.match(execution, /from "\.\/chapter-live-pipeline"/);
  assert.equal(execution.includes('from "../research"'), false);
  assert.match(livePipeline, /export async function runChapterResearchWorkflowImpl/);
  assert.match(livePipeline, /discoverCandidateSources\(chapterContext/);
  assert.match(livePipeline, /extractItemsFromSource\(chapter/);
  assert.match(livePipeline, /persistChapterResearchDossier/);
});
