import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import {
  LLMGatewayError,
  acquireLLMGatewayCall,
  assertGatewayRequestBudget,
  estimateGatewayCost,
  estimatePromptTokensFromChars,
  getLLMGatewayPolicy,
  validateStructuredOutput,
} from "@/lib/llm/gateway";
import { runWithLLMContext } from "@/lib/llm/call-context";
import { buildRoleGatewayAttribution } from "@/lib/llm/routing";

test("gateway policy applies safe defaults and env overrides", () => {
  const policy = getLLMGatewayPolicy({
    timeoutMs: 123,
    maxRetries: 0,
    maxOutputTokens: 456,
    requestBudgetUsd: 1.25,
    bookWarningUsd: 3,
    bookConfirmationUsd: 6,
    bookHardStopUsd: 9,
  });

  assert.equal(policy.timeoutMs, 123);
  assert.equal(policy.maxRetries, 0);
  assert.equal(policy.maxOutputTokens, 456);
  assert.equal(policy.requestBudgetUsd, 1.25);
  assert.equal(policy.bookWarningUsd, 3);
  assert.equal(policy.bookConfirmationUsd, 6);
  assert.equal(policy.bookHardStopUsd, 9);
  assert.equal(policy.cacheModel, true);
});

test("gateway requires attribution before model acquisition", async () => {
  await assert.rejects(
    () => acquireLLMGatewayCall({
      modelSpec: "openai:gpt-4o-mini",
      attribution: { stageRole: "", operation: "" },
      policy: { bookHardStopUsd: 0 },
    }),
    (error) => error instanceof LLMGatewayError && error.code === "missing_attribution",
  );
});

test("gateway returns null without provider key instead of spending", async () => {
  const oldOpenAI = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const call = await acquireLLMGatewayCall({
      modelSpec: "openai:gpt-4o-mini",
      attribution: { stageRole: "press:kit", operation: "unit-test" },
      policy: { bookHardStopUsd: 0 },
    });
    assert.equal(call, null);
  } finally {
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
  }
});

test("gateway estimates prompt tokens and request costs", () => {
  assert.equal(estimatePromptTokensFromChars(9), 3);
  const estimate = estimateGatewayCost({
    model: "gpt-4o-mini",
    promptChars: 4000,
    completionTokens: 1000,
  });
  assert.ok(estimate > 0);
});

test("gateway request budget rejects over-budget estimates", () => {
  assert.throws(
    () => assertGatewayRequestBudget({ estimatedCostUsd: 2, requestBudgetUsd: 1 }),
    (error) => error instanceof LLMGatewayError && error.code === "budget_exceeded",
  );
});

test("gateway structured validation returns parsed output or throws", () => {
  const schema = z.object({ ok: z.boolean() });
  assert.deepEqual(validateStructuredOutput(schema, { ok: true }), { ok: true });
  assert.throws(
    () => validateStructuredOutput(schema, { ok: "yes" }),
    (error) => error instanceof LLMGatewayError && error.code === "validation_failed",
  );
});

test("role routing carries ambient workflow attribution into gateway acquisition", async () => {
  const attribution = await runWithLLMContext(
    {
      bookId: "book_123",
      bookSlug: "sample-book",
      bookTitle: "Sample Book",
      stageKey: "CHAPTER_DRAFT",
      workflowRunId: "run_123",
      chapterKey: "chapter-1",
    },
    async () => buildRoleGatewayAttribution("chapter-draft:author"),
  );

  assert.deepEqual(attribution, {
    bookId: "book_123",
    bookSlug: "sample-book",
    bookTitle: "Sample Book",
    stageKey: "CHAPTER_DRAFT",
    workflowRunId: "run_123",
    chapterKey: "chapter-1",
    stageRole: "chapter-draft:author",
    operation: "workflow-model-acquisition",
  });
});

test("role routing uses generic attribution outside workflow context", () => {
  assert.deepEqual(buildRoleGatewayAttribution("press:kit"), {
    bookId: undefined,
    bookSlug: undefined,
    bookTitle: undefined,
    stageKey: undefined,
    workflowRunId: undefined,
    chapterKey: undefined,
    stageRole: "press:kit",
    operation: "role-model-acquisition",
  });
});
