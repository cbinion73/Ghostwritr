import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildQuillContextReadinessPacket,
  extractManifestChapterGuidance,
  resolveDominantFramework,
  validateQuillContextReadiness,
  type ChapterContext,
} from "../src/lib/workflows/chapter-draft/context";
import type { BaseStoryChapter } from "../src/lib/base-story-types";
import type { BookSetupProfile } from "../src/lib/book-setup-types";
import type { Phase1StrategicBrief } from "../src/lib/phase1-strategic-brief";
import type { PersonalStoryEncyclopedia } from "../src/lib/personal-story-types";

const chapterContext: ChapterContext = {
  section: {
    sectionId: "section-1",
    sectionTitle: "Part One",
    sectionDescription: "Set the stakes.",
    sectionNumber: 1,
    chapters: [],
  },
  chapter: {
    chapterId: "chapter-1",
    chapterNumber: 1,
    chapterTitle: "The Cost of Clarity",
    chapterDescription: "Why unclear decisions get expensive.",
    paragraphs: [
      {
        id: "p1",
        number: 1,
        topicSentence: "Open with the cost of unclear decisions.",
        mainIdea: "Unclear decisions create drag.",
        purpose: "Hook",
        contentType: "opening",
        wordCountTarget: 250,
      },
    ],
    chapterWordCountTarget: 3000,
    calculationDisplay: "3000 words",
    structureBlocks: [],
  },
  craftNotes: ["Avoid consultant language."],
};

const phase1StrategicBrief = {
  readiness: { isComplete: true },
  promise: {
    statement: "Help operators turn confusion into clear action.",
    bigIdea: "Clarity is a force multiplier.",
  },
  audience: {
    primary: "Founder operators",
  },
  market: {
    strategicPriority: "Practical operating clarity",
  },
} as Phase1StrategicBrief;

const bookSetupProfile = {
  writerPersonaBlend: [
    {
      personaId: "andy",
      personaSlug: "andy-stanley",
      personaName: "Andy Stanley",
      percentInfluence: 70,
      traits: [],
      signaturePatterns: [],
    },
  ],
  writerPersonaGuidance: ["Use memorable practical phrasing."],
  voiceReferenceNotes: ["Warm but direct."],
  voiceTone: "Clear, pastoral, and practical.",
  notesToSystem: ["No em dashes."],
} as unknown as BookSetupProfile;

const baseStoryChapter = {
  chapterKey: "chapter-1",
  threadRole: "Opening turn",
  guidance: {
    narrativeFunction: "Show why the reader should care.",
    continuityCue: "whiteboard",
    draftingInstruction: "Carry the whiteboard scene through the chapter.",
  },
} as BaseStoryChapter;

const personalStories: PersonalStoryEncyclopedia = {
  interviewFocus: "Leadership clarity",
  nextQuestion: "Where did clarity change action?",
  entries: [
    {
      id: "story-1",
      title: "The Whiteboard Moment",
      summary: "A team got unstuck at a whiteboard.",
      lesson: "Clarity changes action.",
      whyItMatters: "It grounds the chapter.",
      storyType: "failure",
      lifeArea: "leadership",
      emotionalNotes: [],
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
        rawNotes: [],
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

test("Chapter Draft context extracts fuzzy manifest chapter guidance", () => {
  const manifest = [
    "# Chapter Manifest",
    "## Introduction",
    "Intro guidance.",
    "## Chapter 1: The Cost of Clarity",
    "Use the whiteboard thread and verified source set.",
    "## Chapter 2: Different Problem",
    "Other guidance.",
  ].join("\n");

  assert.equal(
    extractManifestChapterGuidance(manifest, "The Cost of Clarity"),
    "## Chapter 1: The Cost of Clarity\nUse the whiteboard thread and verified source set.",
  );
  assert.equal(extractManifestChapterGuidance(manifest, "Missing Chapter"), null);
});

test("Chapter Draft context builds author-facing Quill readiness packet", () => {
  const packet = buildQuillContextReadinessPacket({
    phase1StrategicBrief,
    context: chapterContext,
    research: null,
    externalStories: null,
    personalStories,
    baseStoryChapter,
    bookSetupProfile,
  });

  assert.equal(packet.chapter.chapterKey, "chapter-1");
  assert.equal(packet.approvedBrief.approved, true);
  assert.match(packet.approvedBrief.summary, /Clarity is a force multiplier/);
  assert.equal(packet.paragraphOutline.current, true);
  assert.equal(packet.baseStoryGuidance.present, true);
  assert.match(packet.baseStoryGuidance.draftingInstruction, /whiteboard/);
  assert.equal(packet.personalStories.length, 1);
  assert.equal(packet.voiceGuide.present, true);
  assert.equal(packet.craftNotes[0], "Avoid consultant language.");
});

test("Chapter Draft context readiness blocks missing admissible source material", () => {
  const readiness = validateQuillContextReadiness({
    phase1StrategicBrief,
    context: chapterContext,
    research: null,
    externalStories: null,
    personalStories,
    baseStoryChapter,
    bookSetupProfile,
  });

  assert.equal(readiness.ok, false);
  assert.ok(readiness.issues.includes("No admissible Research evidence is assigned to this chapter."));
  assert.ok(readiness.issues.includes("No admissible External Story evidence is assigned to this chapter."));
});

test("Chapter Draft canonical context assembly is owned outside the monolith", () => {
  const monolith = readFileSync("src/lib/workflows/chapter-draft.ts", "utf8");
  const context = readFileSync("src/lib/workflows/chapter-draft/context.ts", "utf8");

  assert.equal(monolith.includes("function buildQuillContextReadinessPacket"), false);
  assert.equal(monolith.includes("function validateQuillContextReadiness"), false);
  assert.equal(monolith.includes("async function getDraftInputs"), false);
  assert.equal(monolith.includes("function extractManifestChapterGuidance"), false);
  assert.match(context, /export function buildQuillContextReadinessPacket/);
  assert.match(context, /export function validateQuillContextReadiness/);
  assert.match(context, /export async function getDraftInputs/);
});

test("Chapter Draft context framework resolver remains deterministic", () => {
  const framework = resolveDominantFramework([
    {
      personaId: "b-persona",
      personaSlug: "andy-stanley",
      personaName: "Andy Stanley",
      percentInfluence: 50,
      traits: [],
      signaturePatterns: [],
    },
    {
      personaId: "a-persona",
      personaSlug: "andy-stanley",
      personaName: "Andy Stanley",
      percentInfluence: 50,
      traits: [],
      signaturePatterns: [],
    },
  ]);

  assert.equal(framework.name, "ME-WE-TRUTH-YOU-WE");
  assert.ok(framework.flow.length > 0);
});
