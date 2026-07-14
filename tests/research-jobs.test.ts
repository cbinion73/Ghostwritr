import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("research jobs module owns unfinished chapter discovery", () => {
  const jobsSource = readFileSync(
    join(root, "src/lib/workflows/research/jobs.ts"),
    "utf8",
  );
  const monolithSource = readFileSync(
    join(root, "src/lib/workflows/research.ts"),
    "utf8",
  );

  assert.match(
    jobsSource,
    /export async function getUnfinishedResearchChapterKeys/,
    "jobs module should own getUnfinishedResearchChapterKeys",
  );
  assert.match(
    jobsSource,
    /getResearchChapterSeeds/,
    "unfinished discovery should derive canonical chapter seeds",
  );
  assert.match(
    jobsSource,
    /getLatestResearchPackVersionsByChapter/,
    "unfinished discovery should compare against saved research pack versions",
  );
  assert.doesNotMatch(
    jobsSource,
    /getUnfinishedResearchChapterKeys,\s*\n\s*processWorkflowRun/,
    "jobs module should not re-export unfinished discovery from the monolith facade",
  );
  assert.doesNotMatch(
    monolithSource,
    /export async function getUnfinishedResearchChapterKeys/,
    "research monolith should no longer own getUnfinishedResearchChapterKeys",
  );
});

test("research jobs module owns durable enqueue helpers", () => {
  const jobsSource = readFileSync(
    join(root, "src/lib/workflows/research/jobs.ts"),
    "utf8",
  );
  const monolithSource = readFileSync(
    join(root, "src/lib/workflows/research.ts"),
    "utf8",
  );

  assert.match(
    jobsSource,
    /export async function enqueueFullResearchWorkflow/,
    "jobs module should own enqueueFullResearchWorkflow",
  );
  assert.match(
    jobsSource,
    /export async function enqueueAndTriggerFullResearchWorkflow/,
    "jobs module should own enqueueAndTriggerFullResearchWorkflow",
  );
  assert.match(
    jobsSource,
    /getActiveWorkflowRunForStage/,
    "enqueue should preserve active-run idempotency",
  );
  assert.match(
    jobsSource,
    /createWorkflowRun/,
    "enqueue should create the durable workflow run",
  );
  assert.match(
    jobsSource,
    /updateStageForBook/,
    "enqueue should keep stage progress metadata current",
  );
  assert.doesNotMatch(
    jobsSource,
    /enqueueAndTriggerFullResearchWorkflow,\s*\n\s*enqueueFullResearchWorkflow/,
    "jobs module should not re-export enqueue helpers from the monolith facade",
  );
  assert.doesNotMatch(
    monolithSource,
    /export async function enqueueFullResearchWorkflow/,
    "research monolith should no longer own enqueueFullResearchWorkflow",
  );
  assert.doesNotMatch(
    monolithSource,
    /export async function enqueueAndTriggerFullResearchWorkflow/,
    "research monolith should no longer own enqueueAndTriggerFullResearchWorkflow",
  );
});

test("research jobs module owns durable workflow processor wrapper", () => {
  const jobsSource = readFileSync(
    join(root, "src/lib/workflows/research/jobs.ts"),
    "utf8",
  );
  const monolithSource = readFileSync(
    join(root, "src/lib/workflows/research.ts"),
    "utf8",
  );

  assert.match(
    jobsSource,
    /export async function processWorkflowRun/,
    "jobs module should own processWorkflowRun",
  );
  for (const requiredCall of [
    "getWorkflowRunById",
    "claimWorkflowRun",
    "startWorkflowRunHeartbeat",
    "completeWorkflowRun",
    "failWorkflowRun",
    "runQualityAgentWorkflow",
    "runFullResearchWorkflow",
  ]) {
    assert.match(
      jobsSource,
      new RegExp(requiredCall),
      `processor wrapper should preserve ${requiredCall}`,
    );
  }
  assert.doesNotMatch(
    jobsSource,
    /processWorkflowRun,\s*\n?\s*\} from "\.\.\/research"/,
    "jobs module should not re-export processWorkflowRun from the monolith facade",
  );
  assert.doesNotMatch(
    monolithSource,
    /export async function processWorkflowRun/,
    "research monolith should no longer own processWorkflowRun",
  );
});

test("research execution module owns chapter attribution wrapper", () => {
  const executionSource = readFileSync(
    join(root, "src/lib/workflows/research/execution.ts"),
    "utf8",
  );
  const monolithSource = readFileSync(
    join(root, "src/lib/workflows/research.ts"),
    "utf8",
  );

  assert.match(
    executionSource,
    /export async function runChapterResearchWorkflow/,
    "execution module should own runChapterResearchWorkflow",
  );
  assert.match(
    executionSource,
    /runWithResearchChapterAttribution/,
    "chapter execution wrapper should delegate to the shared attribution helper",
  );
  assert.match(
    executionSource,
    /runChapterResearchWorkflowImpl/,
    "chapter execution wrapper should delegate to the monolith implementation seam",
  );
  const contextSource = readFileSync(
    join(root, "src/lib/workflows/research/execution-context.ts"),
    "utf8",
  );
  assert.match(
    contextSource,
    /getLLMCallContext/,
    "chapter attribution helper should preserve ambient LLM context lookup",
  );
  assert.match(
    contextSource,
    /runWithLLMContext\(\{ \.\.\.outer, chapterKey \}/,
    "chapter attribution helper should preserve per-chapter attribution",
  );
  assert.doesNotMatch(
    executionSource,
    /runChapterResearchWorkflow,\s*\n\s*runFullResearchWorkflow/,
    "execution module should not re-export the chapter wrapper from the monolith facade",
  );
  assert.doesNotMatch(
    monolithSource,
    /export async function runChapterResearchWorkflow\(/,
    "research monolith should no longer own runChapterResearchWorkflow",
  );
});

test("research execution module owns full-run orchestration", () => {
  const executionSource = readFileSync(
    join(root, "src/lib/workflows/research/execution.ts"),
    "utf8",
  );
  const monolithSource = readFileSync(
    join(root, "src/lib/workflows/research.ts"),
    "utf8",
  );

  assert.match(
    executionSource,
    /export async function runFullResearchWorkflow/,
    "execution module should own runFullResearchWorkflow",
  );
  for (const requiredCall of [
    "wasResearchWorkflowCanceled",
    "shouldRetryResearchChapterResult",
    "recordResearchChapterOutcome",
    "researchChapterProgressMessage",
    "runWithResearchChapterAttribution",
    "runChapterResearchWorkflowImpl",
  ]) {
    assert.match(
      executionSource,
      new RegExp(requiredCall),
      `full-run orchestration should preserve ${requiredCall}`,
    );
  }
  assert.doesNotMatch(
    monolithSource,
    /export async function runFullResearchWorkflow/,
    "research monolith should no longer own runFullResearchWorkflow",
  );
});

test("research execution and jobs modules have no temporary monolith re-export facades", () => {
  const executionSource = readFileSync(
    join(root, "src/lib/workflows/research/execution.ts"),
    "utf8",
  );
  const jobsSource = readFileSync(
    join(root, "src/lib/workflows/research/jobs.ts"),
    "utf8",
  );

  assert.doesNotMatch(
    executionSource,
    /export\s*\{[\s\S]*\}\s*from "\.\.\/research"/,
    "execution module should not re-export from the monolith",
  );
  assert.doesNotMatch(
    jobsSource,
    /export\s*\{[\s\S]*\}\s*from "\.\.\/research"/,
    "jobs module should not re-export from the monolith",
  );
});
