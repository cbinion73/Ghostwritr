import test from "node:test";
import assert from "node:assert/strict";

import {
  RequestLimitError,
  acquireBookOperationSlot,
  assertChatMessagesWithinLimit,
  assertFileCountWithinLimit,
  assertTextWithinLimit,
  checkRateLimit,
  parseLimitedJson,
  resetRequestLimitStateForTests,
} from "@/lib/request-limits";

test("parseLimitedJson rejects oversized bodies before parsing", async () => {
  const request = new Request("http://local.test", {
    method: "POST",
    body: JSON.stringify({ value: "too large" }),
  });

  await assert.rejects(
    () => parseLimitedJson(request, { limitBytes: 4, label: "Tiny JSON" }),
    (error) => error instanceof RequestLimitError && error.status === 413,
  );
});

test("parseLimitedJson rejects invalid JSON as bad request", async () => {
  const request = new Request("http://local.test", {
    method: "POST",
    body: "{not-json",
  });

  await assert.rejects(
    () => parseLimitedJson(request, { limitBytes: 100 }),
    (error) => error instanceof RequestLimitError && error.status === 400,
  );
});

test("chat limits cap message count and total characters", () => {
  assert.throws(
    () => assertChatMessagesWithinLimit(Array.from({ length: 3 }, () => ({ content: "x" })), { maxMessages: 2 }),
    RequestLimitError,
  );

  assert.throws(
    () => assertChatMessagesWithinLimit([{ content: "abcd" }, { content: "efgh" }], { maxTotalChars: 7 }),
    RequestLimitError,
  );
});

test("file count limit rejects oversized batches", () => {
  assert.throws(() => assertFileCountWithinLimit(3, 2), RequestLimitError);
});

test("text byte limit accounts for encoded size", () => {
  assert.throws(() => assertTextWithinLimit("🔥", 2, "Emoji text"), RequestLimitError);
});

test("rate limiter allows within window and rejects after limit", () => {
  resetRequestLimitStateForTests();
  assert.equal(checkRateLimit({ key: "k", limit: 2, windowMs: 1000, now: 100 }).allowed, true);
  assert.equal(checkRateLimit({ key: "k", limit: 2, windowMs: 1000, now: 200 }).allowed, true);
  assert.equal(checkRateLimit({ key: "k", limit: 2, windowMs: 1000, now: 300 }).allowed, false);
  assert.equal(checkRateLimit({ key: "k", limit: 2, windowMs: 1000, now: 1200 }).allowed, true);
});

test("book operation slots enforce per-book concurrency", () => {
  resetRequestLimitStateForTests();
  const release = acquireBookOperationSlot("book-1", "generation", 1);
  assert.throws(() => acquireBookOperationSlot("book-1", "generation", 1), RequestLimitError);
  release();
  const releaseAgain = acquireBookOperationSlot("book-1", "generation", 1);
  releaseAgain();
});
