import test from "node:test";
import assert from "node:assert/strict";

import {
  classifySourceTier,
  getMessageTextContent,
  slugify,
  summarizeDomains,
  summarizeQueries,
} from "../src/lib/workflows/research/source-utils";

test("Research source utils extract text content from provider message shapes", () => {
  assert.equal(getMessageTextContent("plain text"), "plain text");
  assert.equal(
    getMessageTextContent([
      { type: "text", text: "first" },
      { type: "image_url", image_url: "ignored" },
      "second",
    ]),
    "first\n\nsecond",
  );
  assert.equal(getMessageTextContent({ type: "text", text: "not an array" }), "");
});

test("Research source utils normalize source identifiers and summaries", () => {
  assert.equal(slugify("Hello, WORLD!! This is a Long Title."), "hello-world-this-is-a-long-title");
  assert.equal(summarizeQueries(["query one", "query two", "query three"]), "query one | query two");
  assert.equal(
    summarizeDomains([
      "https://www.example.com/a",
      "not a url",
      "https://nih.gov/x",
      "https://example.com/b",
      "https://sub.example.com/c",
    ]),
    "example.com, nih.gov, sub.example.com",
  );
});

test("Research source utils classify source tiers without provider calls", () => {
  assert.deepEqual(classifySourceTier("https://nih.gov/research"), { tier: "A", weight: 1 });
  assert.deepEqual(classifySourceTier("https://medium.com/example"), { tier: "C", weight: 0.5 });
  assert.deepEqual(classifySourceTier("https://example.org/article"), { tier: "B", weight: 0.75 });
});
