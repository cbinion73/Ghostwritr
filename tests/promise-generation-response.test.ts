import assert from "node:assert/strict";
import test from "node:test";

import {
  JsonExtractionError,
  extractJsonText,
  extractTextFromResponse,
  getResponseMetadata,
  getStopReason,
  getUsageMetadata,
  isLikelyTruncatedJson,
  withTimeout,
} from "../src/lib/workflows/promise/generation-response";

test("extractTextFromResponse handles string and content-part responses", () => {
  assert.equal(extractTextFromResponse("plain text"), "plain text");
  assert.equal(
    extractTextFromResponse({
      content: [{ text: "hello" }, "world", { nope: true }],
    }),
    "hello\nworld\n",
  );
});

test("extractJsonText returns a balanced object from prose or code fences", () => {
  assert.equal(extractJsonText('before {"a":{"b":1}} after'), '{"a":{"b":1}}');
  assert.equal(extractJsonText('```json\n{"ok":true}\n```'), '{"ok":true}');
});

test("extractJsonText throws typed errors for missing and incomplete JSON", () => {
  assert.throws(
    () => extractJsonText("no json here"),
    (error) => error instanceof JsonExtractionError && error.code === "missing_json",
  );
  assert.throws(
    () => extractJsonText('{"a": {"b": 1}'),
    (error) => error instanceof JsonExtractionError && error.code === "incomplete_json",
  );
});

test("metadata helpers expose provider response and usage metadata", () => {
  const response = {
    response_metadata: { stop_reason: "max_tokens" },
    usage_metadata: { input_tokens: 12 },
  };

  assert.deepEqual(getResponseMetadata(response), { stop_reason: "max_tokens" });
  assert.deepEqual(getUsageMetadata(response), { input_tokens: 12 });
  assert.equal(getStopReason(response), "max_tokens");
});

test("isLikelyTruncatedJson detects max-token and incomplete JSON failures", () => {
  assert.equal(isLikelyTruncatedJson("{}", new Error("anything"), "max_tokens"), true);
  assert.equal(isLikelyTruncatedJson('{"a"', new Error("Unexpected end of JSON input")), true);
  assert.equal(isLikelyTruncatedJson('{"a":1}', new Error("Unexpected end of JSON input")), false);
});

test("withTimeout resolves fast promises and rejects slow promises", async () => {
  assert.equal(await withTimeout(Promise.resolve("ok"), 50, "too slow"), "ok");

  await assert.rejects(
    withTimeout(new Promise((resolve) => setTimeout(resolve, 50)), 1, "too slow"),
    /too slow/,
  );
});
