import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Chapter Draft durable job orchestration is owned by the jobs module", () => {
  const monolith = readFileSync("src/lib/workflows/chapter-draft.ts", "utf8");
  const jobs = readFileSync("src/lib/workflows/chapter-draft/jobs.ts", "utf8");
  const publicEntrypoint = readFileSync("src/lib/workflows/chapter-draft-public.ts", "utf8");

  assert.equal(monolith.includes("export async function enqueueChapterDraftWorkflow"), false);
  assert.equal(monolith.includes("export async function processChapterDraftWorkflowRun"), false);
  assert.equal(monolith.includes("export async function enqueueAndTriggerChapterDraftWorkflow"), false);
  assert.equal(monolith.includes("export async function getUnfinishedChapterDraftChapterKeys"), false);
  assert.match(jobs, /export async function enqueueChapterDraftWorkflow/);
  assert.match(jobs, /export async function processChapterDraftWorkflowRun/);
  assert.match(jobs, /export async function enqueueAndTriggerChapterDraftWorkflow/);
  assert.match(jobs, /export async function getUnfinishedChapterDraftChapterKeys/);
  assert.match(jobs, /createWorkflowRun\(/);
  assert.match(jobs, /claimWorkflowRun\(/);
  assert.match(jobs, /completeWorkflowRun\(/);
  assert.match(jobs, /failWorkflowRun\(/);
  assert.match(publicEntrypoint, /from "\.\/chapter-draft\/jobs"/);
});
