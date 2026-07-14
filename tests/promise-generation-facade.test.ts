import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generationFacadeExports = [
  "generateComprehensivePromiseStatement",
  "maybeGenerateBookPromiseReport",
  "maybeGenerateTitleSubtitleFinalization",
  "runPromiseWorkflow",
];

const comprehensiveStatementExports = [
  "generateComprehensivePromiseStatement",
];

const titleReportExports = [
  "maybeGenerateBookPromiseReport",
  "maybeGenerateTitleSubtitleFinalization",
];

test("8.3b4 Promise generation facade has a static ownership map", () => {
  const monolith = readFileSync("src/lib/workflows/promise.ts", "utf8");
  const generationFacade = readFileSync("src/lib/workflows/promise/generation.ts", "utf8");
  const comprehensiveStatement = readFileSync(
    "src/lib/workflows/promise/comprehensive-statement-generation.ts",
    "utf8",
  );
  const runtimeWorkflow = readFileSync("src/lib/workflows/promise/runtime-workflow.ts", "utf8");
  const titleReport = readFileSync("src/lib/workflows/promise/title-report-generation.ts", "utf8");
  const publicEntrypoint = readFileSync("src/lib/workflows/promise-public.ts", "utf8");
  const runtime = readFileSync("src/lib/workflows/promise/generation-runtime.ts", "utf8");
  const runtimeNodes = readFileSync("src/lib/workflows/promise/generation-runtime-nodes.ts", "utf8");

  assert.doesNotMatch(generationFacade, /from "\.\.\/promise"/);
  assert.match(generationFacade, /from "\.\/runtime-workflow"/);
  assert.match(publicEntrypoint, /from "\.\/promise\/generation"/);

  for (const symbol of generationFacadeExports) {
    assert.match(generationFacade, new RegExp(`\\b${symbol}\\b`));
  }

  assert.match(runtimeWorkflow, /export const runPromiseWorkflow\b/);
  assert.doesNotMatch(monolith, /export const runPromiseWorkflow\b/);

  for (const symbol of comprehensiveStatementExports) {
    assert.match(comprehensiveStatement, new RegExp(`export async function ${symbol}\\b`));
    assert.doesNotMatch(monolith, new RegExp(`export async function ${symbol}\\b`));
  }

  for (const symbol of titleReportExports) {
    assert.match(titleReport, new RegExp(`export async function ${symbol}\\b`));
    assert.doesNotMatch(monolith, new RegExp(`export async function ${symbol}\\b`));
  }

  assert.match(titleReport, /getBookPitchModel/);
  assert.match(titleReport, /getKnowledgeGroundingForPrompt/);
  assert.match(titleReport, /createFallbackTitleSubtitleFinalization/);
  assert.match(titleReport, /normalizeTitleSubtitleFinalization/);
  assert.match(titleReport, /composeBookPromiseReportFromMarkdown/);
  assert.match(titleReport, /replaceBookPitchPersonaNames/);
  assert.match(comprehensiveStatement, /getBookKnowledgeBase/);
  assert.match(comprehensiveStatement, /formatSetupContextForPrompt/);

  assert.match(runtime, /createPromiseWorkflowRunner/);
  assert.match(runtimeNodes, /createGeneratePromiseReplyNode/);
  assert.match(runtimeNodes, /createExtractPromiseNode/);
  assert.match(runtimeNodes, /createScorePromiseNode/);
  assert.match(runtimeNodes, /createPersonaNode/);
  assert.match(runtimeNodes, /createPersistNode/);

  assert.match(runtimeWorkflow, /createPromiseWorkflowRunner/);
  assert.match(runtimeWorkflow, /createLoadContextNode/);
  assert.match(runtimeWorkflow, /createGeneratePromiseReplyNode/);
  assert.match(runtimeWorkflow, /maybeGenerateAssistantReplyWithSetup/);
  assert.match(runtimeWorkflow, /maybeExtractPromise/);
  assert.match(runtimeWorkflow, /maybeScorePromise/);
  assert.match(runtimeWorkflow, /maybeGeneratePersonas/);
  assert.match(runtimeWorkflow, /maybeGenerateMarketReport/);
  assert.match(runtimeWorkflow, /maybeGenerateRecommendations/);
  assert.match(runtimeWorkflow, /createPromiseArtifactVersion/);
  assert.match(runtimeWorkflow, /createDirectionEvent/);
});

test("8.3b4 Promise generation facade no longer re-exports from the monolith", () => {
  const generationFacade = readFileSync("src/lib/workflows/promise/generation.ts", "utf8");
  const monolithExportBlock = generationFacade.match(/export\s*\{([\s\S]*?)\}\s*from "\.\.\/promise";/);

  assert.equal(monolithExportBlock, null);
});
