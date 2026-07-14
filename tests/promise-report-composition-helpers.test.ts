import test from "node:test";
import assert from "node:assert/strict";

import type { BookPromiseReport } from "../src/lib/promise-types";
import {
  buildLegacyBookPitchMarkdown,
  containsNamedAudienceReference,
  replaceBookPitchPersonaNames,
} from "../src/lib/workflows/promise/report-composition-helpers";

const fallback: BookPromiseReport = {
  title: "Fallback Title",
  subtitle: "Fallback Subtitle",
  conceptStatement: "Fallback concept",
  corePromise: "Fallback promise",
  targetAudience: "Fallback audience",
  marketOpportunity: "Fallback opportunity",
  authorCredibility: "Fallback credibility",
  executiveSummary: "Fallback summary",
  recommendation: "GO",
  rationale: "Fallback rationale",
  nextSteps: ["Fallback step"],
  documentMarkdown: "# Fallback Markdown",
};

test("buildLegacyBookPitchMarkdown renders legacy fields with fallback support", () => {
  const markdown = buildLegacyBookPitchMarkdown(
    {
      promiseStatement: "Legacy promise statement.",
      targetAudience: "Legacy audience.",
      transformationNarrative: "Legacy transformation.",
      positioningStrategy: ["Narrow the reader", "Lead with proof"],
    },
    fallback,
  );

  assert.ok(markdown.includes("Legacy promise statement."));
  assert.ok(markdown.includes("Legacy audience."));
  assert.ok(markdown.includes("- Narrow the reader"));
  assert.ok(markdown.includes("Fallback summary"));
});

test("buildLegacyBookPitchMarkdown renders fallback fields when legacy values are empty", () => {
  const markdown = buildLegacyBookPitchMarkdown({}, fallback);

  assert.ok(markdown.includes("Fallback promise"));
  assert.ok(markdown.includes("Fallback audience"));
  assert.ok(markdown.includes("- Fallback step"));
});

test("containsNamedAudienceReference only flags multi-word persona names", () => {
  const deepProfiles = [
    { name: "Maya Founder" },
    { name: "Scout" },
  ] as never;

  assert.equal(containsNamedAudienceReference("Built for Maya Founder.", deepProfiles), true);
  assert.equal(containsNamedAudienceReference("Built for Scout.", deepProfiles), false);
});

test("replaceBookPitchPersonaNames swaps generated persona names for audience labels", () => {
  const markdown = "Maya Founder needs a practical book. Scout remains unchanged.";
  const replaced = replaceBookPitchPersonaNames(
    markdown,
    [{ name: "Maya Founder" }, { name: "Scout" }] as never,
    [{ label: "Founder under load" }, { label: "Operator" }] as never,
  );

  assert.equal(
    replaced,
    "Founder under load needs a practical book. Scout remains unchanged.",
  );
});
