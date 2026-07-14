import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  findBaseStoryChapter,
  findPersonalStoryCards,
  findRelevantPersonalStories,
} from "../src/lib/workflows/chapter-draft/source-availability";
import type { BaseStoryBundle } from "../src/lib/base-story-types";
import type { PersonalStoryEncyclopedia } from "../src/lib/personal-story-types";

const baseStory: BaseStoryBundle = {
  workingTitle: "Clarity Book",
  selectedFormat: "FIELD_MANUAL_NARRATIVE",
  availableFormats: [],
  storyPremise: "A founder learns to replace chaos with clarity.",
  bookThread: "A founder learns to replace chaos with clarity.",
  bookMovement: {
    me: "I felt the cost.",
    we: "We all do.",
    truth: "Clarity changes action.",
    you: "You can name the decision.",
    weClosing: "We can move with less drag.",
  },
  narrativeGuidance: {
    premise: "A founder learns to replace chaos with clarity.",
    throughLine: "From chaos to clarity.",
    movement: {
      me: "I felt the cost.",
      we: "We all do.",
      truth: "Clarity changes action.",
      you: "You can name the decision.",
      weClosing: "We can move with less drag.",
    },
    continuityRules: [],
    boundary: {
      kind: "base_story_guidance",
      personalStoryPolicy: "Do not invent personal stories.",
    },
  },
  chapters: [
    {
      chapterKey: "chapter-1",
      chapterLabel: "Chapter 1: The Cost of Clarity",
      chapterPurpose: "Open the problem",
      threadRole: "Opening",
      chapterStory: "The team discovers the cost of vague decisions.",
      movement: {
        me: "I felt the cost.",
        we: "We all do.",
        truth: "Clarity changes action.",
        you: "You can name the decision.",
        weClosing: "We can move with less drag.",
      },
      guidance: {
        narrativeFunction: "Open the problem.",
        continuityCue: "whiteboard",
        draftingInstruction: "Carry the workshop scene through the chapter.",
        movement: {
          me: "I felt the cost.",
          we: "We all do.",
          truth: "Clarity changes action.",
          you: "You can name the decision.",
          weClosing: "We can move with less drag.",
        },
        boundary: {
          kind: "base_story_guidance",
          personalStoryPolicy: "Do not invent personal stories.",
        },
      },
    },
  ],
};

const personalStories: PersonalStoryEncyclopedia = {
  interviewFocus: "Leadership clarity",
  nextQuestion: "Where did clarity change action?",
  entries: [
    {
      id: "story-1",
      title: "The Whiteboard Moment",
      summary: "The team got unstuck at a whiteboard.",
      lesson: "Clarity changes action.",
      whyItMatters: "It grounds the chapter.",
      storyType: "failure",
      lifeArea: "leadership",
      emotionalNotes: ["frustration", "relief"],
      sourceQuote: "We finally saw the problem.",
      status: "strong",
      chapterFitHints: [],
      assignments: [
        {
          chapterKey: "chapter-1",
          chapterTitle: "The Cost of Clarity",
          relevance: "Opening story",
        },
      ],
      permission: {
        status: "granted",
        notes: null,
      },
      provenance: {
        rawNotes: ["whiteboard story"],
        sourceMessageIds: [],
        capturedAt: null,
      },
      missingDetails: [],
      usageHistory: [],
    },
  ],
  noStoryTopics: [],
  coverageGaps: [],
  interviewerNotes: [],
};

test("Chapter Draft source availability finds base story and permissioned personal stories", () => {
  assert.equal(findBaseStoryChapter(baseStory, "chapter-1")?.chapterLabel, "Chapter 1: The Cost of Clarity");
  assert.equal(findBaseStoryChapter(baseStory, "chapter-2"), null);

  const relevant = findRelevantPersonalStories(personalStories, {
    chapterKey: "chapter-1",
    chapterTitle: "The Cost of Clarity",
  });
  const cards = findPersonalStoryCards(personalStories, {
    chapterKey: "chapter-1",
    chapterTitle: "The Cost of Clarity",
  });

  assert.equal(relevant.length, 1);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.permissionStatus, "granted");
  assert.equal(cards[0]?.title, "The Whiteboard Moment");
});

test("Chapter Draft source availability helpers are owned outside the monolith", () => {
  const monolith = readFileSync("src/lib/workflows/chapter-draft.ts", "utf8");
  const sourceAvailability = readFileSync(
    "src/lib/workflows/chapter-draft/source-availability.ts",
    "utf8",
  );
  const workspace = readFileSync("src/lib/workflows/chapter-draft/workspace.ts", "utf8");

  assert.equal(monolith.includes("async function getCommittedResearchDossier"), false);
  assert.equal(monolith.includes("async function getCommittedExternalStoriesDossier"), false);
  assert.equal(monolith.includes("function findBaseStoryChapter"), false);
  assert.equal(monolith.includes("function findPersonalStoryCards"), false);
  assert.match(workspace, /getChapterDraftSourceContext\(/);
  assert.match(sourceAvailability, /export async function getCommittedResearchDossier/);
  assert.match(sourceAvailability, /export async function getCommittedExternalStoriesDossier/);
  assert.match(sourceAvailability, /export async function getChapterDraftSourceContext/);
});
