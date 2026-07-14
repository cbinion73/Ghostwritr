import test from "node:test";
import assert from "node:assert/strict";

import {
  clampRetryCount,
  getProviderMaxRetries,
  getWorkflowAttemptLimit,
} from "@/lib/retry-policy";

test("retry counts are clamped to a central cap", () => {
  assert.equal(clampRetryCount(5, { defaultValue: 1, maxValue: 2 }), 2);
  assert.equal(clampRetryCount(-1, { defaultValue: 1, maxValue: 2 }), 1);
  assert.equal(clampRetryCount(undefined, { defaultValue: 1, maxValue: 2 }), 1);
});

test("provider retries default to one and respect central cap env", () => {
  const oldDefault = process.env.LLM_PROVIDER_MAX_RETRIES;
  const oldCap = process.env.LLM_PROVIDER_RETRY_CAP;
  try {
    delete process.env.LLM_PROVIDER_MAX_RETRIES;
    delete process.env.LLM_PROVIDER_RETRY_CAP;
    assert.equal(getProviderMaxRetries(), 1);
    assert.equal(getProviderMaxRetries(5), 2);

    process.env.LLM_PROVIDER_RETRY_CAP = "1";
    assert.equal(getProviderMaxRetries(5), 1);
  } finally {
    if (oldDefault === undefined) delete process.env.LLM_PROVIDER_MAX_RETRIES;
    else process.env.LLM_PROVIDER_MAX_RETRIES = oldDefault;
    if (oldCap === undefined) delete process.env.LLM_PROVIDER_RETRY_CAP;
    else process.env.LLM_PROVIDER_RETRY_CAP = oldCap;
  }
});

test("workflow attempt limits default to one total attempt and preserve explicit total-attempt env semantics", () => {
  const oldAttempts = process.env.RESEARCH_CHAPTER_RETRY_LIMIT;
  const oldCap = process.env.LLM_WORKFLOW_ATTEMPT_CAP;
  try {
    delete process.env.RESEARCH_CHAPTER_RETRY_LIMIT;
    delete process.env.LLM_WORKFLOW_ATTEMPT_CAP;
    assert.equal(getWorkflowAttemptLimit("RESEARCH_CHAPTER_RETRY_LIMIT"), 1);

    process.env.RESEARCH_CHAPTER_RETRY_LIMIT = "2";
    assert.equal(getWorkflowAttemptLimit("RESEARCH_CHAPTER_RETRY_LIMIT"), 2);

    process.env.LLM_WORKFLOW_ATTEMPT_CAP = "1";
    assert.equal(getWorkflowAttemptLimit("RESEARCH_CHAPTER_RETRY_LIMIT"), 1);
  } finally {
    if (oldAttempts === undefined) delete process.env.RESEARCH_CHAPTER_RETRY_LIMIT;
    else process.env.RESEARCH_CHAPTER_RETRY_LIMIT = oldAttempts;
    if (oldCap === undefined) delete process.env.LLM_WORKFLOW_ATTEMPT_CAP;
    else process.env.LLM_WORKFLOW_ATTEMPT_CAP = oldCap;
  }
});
