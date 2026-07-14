import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLLMBudgetApprovalMetadata,
  getLLMBudgetStateFromValues,
  getLLMBudgetThresholds,
} from "@/lib/llm/budgets";

test("LLM budget thresholds use $10 warning, $20 confirmation, and $30 hard stop defaults", () => {
  assert.deepEqual(getLLMBudgetThresholds({}), {
    warningUsd: 10,
    confirmationUsd: 20,
    hardStopUsd: 30,
  });
});

test("LLM budget state requires confirmation when projected spend crosses $20", () => {
  const state = getLLMBudgetStateFromValues({}, 19.75, 0.5);

  assert.equal(state.warningReached, true);
  assert.equal(state.confirmationRequired, true);
  assert.equal(state.hardStopReached, false);
  assert.equal(state.projectedSpendUsd, 20.25);
});

test("LLM budget approval clears the $20 confirmation gate for the book", () => {
  const approvedAt = new Date("2026-07-13T07:00:00.000Z");
  const metadata = buildLLMBudgetApprovalMetadata({}, {
    approvedAt,
    approvedBy: "local-user",
  });
  const state = getLLMBudgetStateFromValues(metadata, 20.25, 1);

  assert.equal(state.confirmationRequired, false);
  assert.equal(state.confirmed, true);
  assert.equal(state.confirmedAt, approvedAt.toISOString());
  assert.equal(state.confirmedBy, "local-user");
  assert.equal(state.confirmedThroughUsd, 20);
});

test("LLM hard stop still blocks projected spend after confirmation", () => {
  const metadata = buildLLMBudgetApprovalMetadata({}, {
    approvedAt: new Date("2026-07-13T07:00:00.000Z"),
  });
  const state = getLLMBudgetStateFromValues(metadata, 29.5, 1);

  assert.equal(state.confirmationRequired, false);
  assert.equal(state.hardStopReached, true);
});
