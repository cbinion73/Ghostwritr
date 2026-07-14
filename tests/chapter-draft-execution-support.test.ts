import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildSourceWeaveRequirements,
  cleanEvidenceText,
  countMandateHits,
  deterministicAdversarialCritic,
  hasMetaDraftLanguage,
  renderFrameworkSlotsForPrompt,
  sanitizeDraftProse,
} from "../src/lib/workflows/chapter-draft/execution-support";
import type { BaseStoryChapter } from "../src/lib/base-story-types";
import type { ChapterDraftBundle } from "../src/lib/chapter-draft-types";

test("Chapter Draft execution support sanitizes draft prose and detects meta language", () => {
  assert.equal(
    sanitizeDraftProse("Open the chapter by showing the stakes. Do not use em dashes."),
    "showing the stakes..",
  );
  assert.equal(hasMetaDraftLanguage("This chapter begins by explaining the premise."), true);
  assert.equal(hasMetaDraftLanguage("The operator felt the cost before he could name it."), false);
});

test("Chapter Draft execution support builds source weave requirements", () => {
  const baseStoryChapter = {
    chapterPurpose: "Expose the hidden cost.",
    threadRole: "Opening pressure",
    movement: {
      truth: "Clarity changes action.",
    },
  } as BaseStoryChapter;

  const requirements = buildSourceWeaveRequirements(
    {
      factBank: [{ id: "fact-1" }],
      statistics: [],
      examples: [],
      researchQuestions: [{ question: "What does unclear ownership cost?" }],
      gaps: ["Quantify the delay"],
    } as never,
    {
      storyCandidates: [{ id: "story-1" }],
    } as never,
    [{ title: "Whiteboard moment", summary: "A team got unstuck.", whyItMatters: "Authenticity" }],
    baseStoryChapter,
  );

  assert.deepEqual(requirements.requiredCategories, [
    "research",
    "external story",
    "personal story",
    "base story thread",
  ]);
  assert.equal(requirements.missingCategoryWarnings.length, 0);
  assert.deepEqual(requirements.chapterMandate, [
    "Expose the hidden cost.",
    "Opening pressure",
    "Clarity changes action.",
  ]);
  assert.deepEqual(requirements.argumentAnchors, [
    "What does unclear ownership cost?",
    "Quantify the delay",
  ]);
});

test("Chapter Draft execution support critic flags AI-shaped prose deterministically", () => {
  const draft = {
    chapterText:
      "This chapter begins by showing why the reader should care.\n\nThin paragraph.\n\nThin paragraph.\n\nThin paragraph.",
  } as ChapterDraftBundle;

  const result = deterministicAdversarialCritic(draft, {
    chapterKey: "chapter-1",
    targetWords: 2000,
    minimumWords: 1700,
    maximumWords: 2300,
    weight: 1,
  });

  assert.equal(result.riskLevel, "high");
  assert.ok(result.aiTellFlags.some((flag) => flag.includes("planning-shaped")));
  assert.ok(result.paddingFlags.length > 0);
});

test("Chapter Draft execution support renders biblical framework truth slot", () => {
  const rendered = renderFrameworkSlotsForPrompt(
    {
      dominantPersona: "Andy Stanley",
      name: "ME-WE-TRUTH-YOU-WE",
      flow: [
        { slot: "me", prompt: "Start with author tension." },
        { slot: "truth", prompt: "Name the principle." },
      ],
    },
    true,
  );

  assert.match(rendered, /me: Start with author tension/);
  assert.match(rendered, /truth: Answer the chapter's tension with what GOD says/);
});

test("Chapter Draft execution support owns pure helpers outside the monolith", () => {
  const monolith = readFileSync("src/lib/workflows/chapter-draft.ts", "utf8");
  const support = readFileSync("src/lib/workflows/chapter-draft/execution-support.ts", "utf8");

  assert.equal(monolith.includes("function sanitizeDraftProse"), false);
  assert.equal(monolith.includes("function buildSourceWeaveRequirements"), false);
  assert.equal(monolith.includes("function renderFrameworkSlotsForPrompt"), false);
  assert.equal(monolith.includes("function buildSharedBookContextJson"), false);
  assert.match(support, /export function sanitizeDraftProse/);
  assert.match(support, /export function buildSourceWeaveRequirements/);
  assert.equal(countMandateHits("Clarity changes action.", ["clarity changes action"]), 1);
  assert.equal(cleanEvidenceText("Skip to main content  Login  Useful source"), "Useful source");
});
