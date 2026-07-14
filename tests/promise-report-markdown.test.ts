import test from "node:test";
import assert from "node:assert/strict";

import {
  escapeMarkdownPattern,
  extractExecutiveSummaryFromMarkdown,
  extractMarkdownLabeledValue,
  extractMarkdownNumberedList,
  extractMarkdownSection,
} from "../src/lib/workflows/promise/report-markdown";

test("extractMarkdownLabeledValue reads bold label values case-insensitively", () => {
  const markdown = [
    "**Title:** The Durable Book",
    "**Core Promise:** Help operators turn noise into clarity.",
  ].join("\n");

  assert.equal(extractMarkdownLabeledValue(markdown, "title"), "The Durable Book");
  assert.equal(
    extractMarkdownLabeledValue(markdown, "Core Promise"),
    "Help operators turn noise into clarity.",
  );
});

test("extractMarkdownSection handles punctuation in headings literally", () => {
  const markdown = [
    "## Immediate Next Steps (90 days)",
    "1. Clarify the book promise.",
    "2. Approve the audience.",
    "## Other Section",
    "Ignore me.",
  ].join("\n");

  assert.equal(
    extractMarkdownSection(markdown, "Immediate Next Steps (90 days)"),
    "1. Clarify the book promise.\n2. Approve the audience.",
  );
  assert.equal(escapeMarkdownPattern("Next Steps (90 days)"), "Next Steps \\(90 days\\)");
});

test("extractMarkdownNumberedList returns only numbered items from a section", () => {
  const markdown = [
    "## Immediate Next Steps",
    "Intro line.",
    "1. Approve Phase 1.",
    "- Not numbered.",
    "2. Generate outline.",
  ].join("\n");

  assert.deepEqual(extractMarkdownNumberedList(markdown, "Immediate Next Steps"), [
    "Approve Phase 1.",
    "Generate outline.",
  ]);
});

test("extractExecutiveSummaryFromMarkdown cleans whitespace and falls back when absent", () => {
  const markdown = [
    "# EXECUTIVE SUMMARY",
    "",
    "This is the summary.",
    "",
    "",
    "It has excess spacing.",
    "# SECTION 1: Promise",
    "Do not include.",
  ].join("\n");

  assert.equal(
    extractExecutiveSummaryFromMarkdown(markdown, "fallback"),
    "This is the summary.\n\nIt has excess spacing.",
  );
  assert.equal(extractExecutiveSummaryFromMarkdown("# OTHER", "fallback"), "fallback");
});
