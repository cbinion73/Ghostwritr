import test from "node:test";
import assert from "node:assert/strict";

import {
  LLM_COST_PRICING_VERSION,
  buildCostLogEntry,
} from "@/lib/llm/call-log";

test("canonical cost ledger entries include attribution, status, pricing, cache, reasoning, and search fields", () => {
  const entry = buildCostLogEntry(
    {
      requestId: "llm_request_123",
      providerRequestId: "provider_request_456",
      bookId: "book_123",
      bookSlug: "sample-book",
      bookTitle: "Sample Book",
      stageKey: "RESEARCH",
      workflowRunId: "run_123",
      chapterKey: "chapter-1",
      stageRole: "research:agent-1-researcher",
      operation: "scout-research-stream",
      attempt: 2,
      provider: "openai",
      model: "gpt-4o-mini",
      generationMode: "stream",
      status: "FAILED",
      errorCode: "rate_limit",
      errorMessage: "Rate limit exceeded",
      promptTokens: 1000,
      completionTokens: 250,
      cacheCreationTokens: 100,
      cacheReadTokens: 200,
      reasoningInputTokens: 10,
      reasoningOutputTokens: 20,
      searchCostUsd: 0.03,
      durationMs: 1200,
    },
    new Date("2026-07-13T05:29:29.336Z"),
  );

  assert.equal(entry.ts, "2026-07-13T05:29:29.336Z");
  assert.equal(entry.requestId, "llm_request_123");
  assert.equal(entry.providerRequestId, "provider_request_456");
  assert.equal(entry.stageKey, "RESEARCH");
  assert.equal(entry.stageRole, "research:agent-1-researcher");
  assert.equal(entry.operation, "scout-research-stream");
  assert.equal(entry.attempt, 2);
  assert.equal(entry.generationMode, "stream");
  assert.equal(entry.status, "FAILED");
  assert.equal(entry.errorCode, "rate_limit");
  assert.equal(entry.errorMessage, "Rate limit exceeded");
  assert.equal(entry.totalTokens, 1250);
  assert.equal(entry.cacheCreationTokens, 100);
  assert.equal(entry.cacheReadTokens, 200);
  assert.equal(entry.reasoningInputTokens, 10);
  assert.equal(entry.reasoningOutputTokens, 20);
  assert.equal(entry.searchCostUsd, 0.03);
  assert.equal(entry.pricingVersion, LLM_COST_PRICING_VERSION);
  assert.ok(entry.costUsd > entry.searchCostUsd);
});
