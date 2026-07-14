import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  buildCompactBaseStoryChapterGuidance,
  normalizeBaseStoryBundle,
  validateBaseStoryGuidanceContract,
} from "../src/lib/base-story-utils";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("normalizes legacy Base Story bundles into guidance contract", () => {
  const normalized = normalizeBaseStoryBundle({
    workingTitle: "The Better Book",
    selectedFormat: "GUIDE_JOURNEY",
    availableFormats: [],
    storyPremise: "The reader moves from confusion to clarity.",
    bookThread: "Every chapter advances practical courage.",
    bookMovement: {
      me: "A reader feels stuck.",
      we: "Others feel it too.",
      truth: "Clarity changes action.",
      you: "The reader takes ownership.",
      weClosing: "A better culture becomes possible.",
    },
    chapters: [
      {
        chapterKey: "chapter-1",
        chapterLabel: "Chapter 1: Begin",
        chapterPurpose: "Show why the problem matters.",
        threadRole: "Open the central tension.",
        chapterStory: "Use this chapter to establish the reader's felt problem.",
        movement: {
          me: "The reader feels the problem personally.",
          we: "The team recognizes the same pattern.",
          truth: "The pattern has a name.",
          you: "The reader can respond differently.",
          weClosing: "The group can move with more honesty.",
        },
      },
    ],
  });

  assert.ok(normalized);
  assert.equal(normalized.narrativeGuidance.boundary.kind, "base_story_guidance");
  assert.match(normalized.narrativeGuidance.boundary.personalStoryPolicy, /not/i);
  assert.equal(normalized.chapters[0]?.guidance.boundary.kind, "base_story_guidance");
  assert.equal(
    normalized.chapters[0]?.guidance.draftingInstruction,
    "Use this chapter to establish the reader's felt problem.",
  );

  const contract = validateBaseStoryGuidanceContract(normalized, ["chapter-1"]);
  assert.deepEqual(contract, { ok: true, issues: [] });
});

test("builds compact chapter guidance without exposing Base Story as a personal story", () => {
  const normalized = normalizeBaseStoryBundle({
    workingTitle: "The Better Book",
    selectedFormat: "GUIDE_JOURNEY",
    availableFormats: [],
    storyPremise: "The reader moves from confusion to clarity.",
    bookThread: "Every chapter advances practical courage.",
    bookMovement: {
      me: "A reader feels stuck.",
      we: "Others feel it too.",
      truth: "Clarity changes action.",
      you: "The reader takes ownership.",
      weClosing: "A better culture becomes possible.",
    },
    chapters: [
      {
        chapterKey: "chapter-1",
        chapterLabel: "Chapter 1: Begin",
        chapterPurpose: "Show why the problem matters.",
        threadRole: "Open the central tension.",
        chapterStory: "Use this chapter to establish the reader's felt problem.",
        movement: {
          me: "The reader feels the problem personally.",
          we: "The team recognizes the same pattern.",
          truth: "The pattern has a name.",
          you: "The reader can respond differently.",
          weClosing: "The group can move with more honesty.",
        },
      },
    ],
  });

  const packet = buildCompactBaseStoryChapterGuidance(normalized, "chapter-1");

  assert.equal(packet?.source, "BASE_STORY_GUIDANCE");
  assert.equal(packet?.chapter.boundary.kind, "base_story_guidance");
  assert.match(packet?.chapter.boundary.personalStoryPolicy ?? "", /not a confirmed author experience/i);
  assert.equal(packet?.chapter.draftingInstruction, "Use this chapter to establish the reader's felt problem.");
});

test("validator reports missing expected chapter guidance", () => {
  const normalized = normalizeBaseStoryBundle({
    workingTitle: "The Better Book",
    selectedFormat: "GUIDE_JOURNEY",
    availableFormats: [],
    storyPremise: "The reader moves from confusion to clarity.",
    bookThread: "Every chapter advances practical courage.",
    bookMovement: {
      me: "A reader feels stuck.",
      we: "Others feel it too.",
      truth: "Clarity changes action.",
      you: "The reader takes ownership.",
      weClosing: "A better culture becomes possible.",
    },
    chapters: [],
  });

  const contract = validateBaseStoryGuidanceContract(normalized, ["chapter-1"]);

  assert.equal(contract.ok, false);
  assert.deepEqual(contract.issues, ["Missing Base Story guidance for chapter chapter-1."]);
});

test("Base Story commit and Research consumers enforce the guidance contract", () => {
  const repository = read("src/lib/repositories/base-story-artifacts.ts");
  const researchSeeds = read("src/lib/workflows/research/chapter-seeds.ts");

  assert.ok(repository.includes("getStaleDependencyState"));
  assert.ok(repository.includes("Base Story cannot be committed while stale"));
  assert.ok(repository.includes("validateBaseStoryGuidanceContract(bundle, expectedChapterKeys)"));
  assert.ok(repository.includes("Base Story cannot be committed"));

  assert.ok(researchSeeds.includes("assertBaseStoryReadyForResearch(baseStory, paragraphOutline)"));
  assert.ok(researchSeeds.includes("Base Story is not ready for Research"));
});
