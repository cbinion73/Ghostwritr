import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildChapterDraftMetrics,
  buildChapterDraftProgress,
  buildChapterDraftSourceAvailability,
  projectChapterDraftApprovalState,
  summarizeQuillContextForAuthor,
} from "../src/lib/workflows/chapter-draft/workspace-support";
import type { QuillContextPacket } from "../src/lib/quill-context-contract";

const packet: QuillContextPacket = {
  chapter: {
    chapterKey: "chapter-1",
    chapterTitle: "The Cost of Clarity",
  },
  approvedBrief: {
    approved: true,
    summary: "Help operators see the cost of unclear decisions.",
  },
  paragraphOutline: {
    current: true,
    paragraphs: [
      { id: "p1", topicSentence: "Open with the problem.", purpose: "Hook" },
      { id: "p2", topicSentence: "Quantify the stakes.", purpose: "Evidence" },
      { id: "p3", topicSentence: "Show a case.", purpose: "Example" },
      { id: "p4", topicSentence: "Name the pattern.", purpose: "Teaching" },
      { id: "p5", topicSentence: "Apply the move.", purpose: "Application" },
      { id: "p6", topicSentence: "Close the loop.", purpose: "Close" },
      { id: "p7", topicSentence: "Overflow.", purpose: "Overflow" },
    ],
  },
  baseStoryGuidance: {
    present: true,
    draftingInstruction: "Carry the workshop story through the chapter.",
  },
  evidence: {
    research: [
      {
        id: "r1",
        kind: "RESEARCH_CLAIM",
        chapterKey: "chapter-1",
        title: "Clarity study",
        claimOrStory: "Teams lose time when goals are unclear.",
        source: null,
        supportingExcerpt: null,
        verificationStatus: "VERIFIED",
        relevance: { score: 0.9, reason: "Direct support" },
        exclusions: [],
        admissibility: "ADMISSIBLE",
      },
    ],
    externalStories: [
      {
        id: "e1",
        kind: "EXTERNAL_STORY",
        chapterKey: "chapter-1",
        title: "Factory turnaround",
        claimOrStory: "A factory recovered speed after clarifying decisions.",
        source: null,
        supportingExcerpt: null,
        verificationStatus: "VERIFIED",
        relevance: { score: 0.8, reason: "Good example" },
        exclusions: [],
        admissibility: "ADMISSIBLE",
      },
    ],
  },
  personalStories: [
    {
      id: "pstory-1",
      title: "The whiteboard moment",
      summary: "A team got unstuck at a whiteboard.",
      lesson: "Clarity changes action.",
      whyItMatters: "It grounds the chapter.",
      storyType: "failure",
      emotionalNotes: [],
      assignment: {
        chapterKey: "chapter-1",
        chapterTitle: "The Cost of Clarity",
        relevance: "Opening story",
      },
      permissionStatus: "granted",
    },
  ],
  voiceGuide: {
    present: true,
    dominantPersona: "Andy Stanley",
    guidance: ["Clear", "Practical", "Memorable", "Direct", "Warm", "Overflow"],
  },
  craftNotes: ["Use shorter sentences.", "Avoid consultant language.", "Overflow"],
};

test("Chapter Draft workspace support builds metrics and progress projections", () => {
  const metrics = buildChapterDraftMetrics({
    chapterText: "one two three four five",
    bookSetup: { trimSize: "6 x 9 in" },
    chapterTarget: {
      targetWords: 10,
      minimumWords: 8,
      maximumWords: 12,
    },
  });

  assert.equal(metrics.wordCount, 5);
  assert.equal(metrics.targetWords, 10);
  assert.equal(metrics.deltaFromTarget, -5);
  assert.ok(metrics.pageCount >= 1);

  const progress = buildChapterDraftProgress({
    metadata: {
      automationStatus: "running",
      totalChapters: 12,
      completedChapters: 3,
      currentChapterKey: "chapter-4",
    },
    entryCount: 10,
    totalWords: 25000,
    totalPages: 100,
    targetWordCount: 50000,
    targetPageCount: 200,
    completedChapterCount: 5,
  });

  assert.equal(progress.automationStatus, "running");
  assert.equal(progress.totalChapters, 12);
  assert.equal(progress.completedChapters, 3);
  assert.equal(progress.currentChapterKey, "chapter-4");
  assert.equal(progress.chapterCompletionPercent, 50);
  assert.equal(progress.wordCompletionPercent, 50);
});

test("Chapter Draft workspace support projects source availability and approval state", () => {
  const availability = buildChapterDraftSourceAvailability({
    research: {
      chapterKey: "chapter-1",
      chapterTitle: "The Cost of Clarity",
      chapterDescription: "Why clarity matters",
      researchGoal: "Build evidence",
      researchQuestions: [],
      factBank: [{ id: "f1" } as never],
      statistics: [{ id: "s1" } as never],
      quotes: [],
      examples: [{ id: "x1" } as never],
      counterpoints: [],
      definitions: [],
      gaps: [],
      sourceRegister: [],
      verificationSummary: {
        totalSources: 1,
        verifiedSources: 1,
        totalItems: 3,
        verifiedItems: 3,
        rejectedItems: 0,
        needsCorroborationItems: 0,
      },
    },
    externalStories: {
      chapterKey: "chapter-1",
      chapterTitle: "The Cost of Clarity",
      chapterDescription: "Why clarity matters",
      storyGoal: "Find external stories",
      storyCandidates: [{ id: "story-1" } as never, { id: "story-2" } as never],
      sourceRegister: [],
      storyTypesCovered: [],
      storyFitsCovered: [],
      verificationSummary: {
        totalSources: 2,
        verifiedSources: 2,
        totalStories: 2,
        verifiedStories: 2,
        rejectedStories: 0,
        needsCorroborationStories: 0,
      },
    },
    personalStories: packet.personalStories,
    baseStoryChapter: { chapterKey: "chapter-1" } as never,
  });

  assert.deepEqual(availability, {
    researchCount: 3,
    externalStoryCount: 2,
    personalStoryCount: 1,
    hasBaseStory: true,
  });

  assert.equal(projectChapterDraftApprovalState(null), null);
  assert.deepEqual(
    projectChapterDraftApprovalState({
      status: "DRAFT_APPROVED",
      draftPendingVersionId: "draft-v2",
      approvedDraftVersionId: "draft-v1",
      isStale: false,
      staleReason: null,
    }),
    {
      status: "DRAFT_APPROVED",
      draftPendingVersionId: "draft-v2",
      approvedDraftVersionId: "draft-v1",
      isStale: false,
      staleReason: null,
    },
  );
});

test("Chapter Draft workspace support summarizes Quill context for author display", () => {
  const summary = summarizeQuillContextForAuthor({
    ok: false,
    issues: ["Needs more evidence."],
    packet,
  });

  assert.equal(summary.ready, false);
  assert.deepEqual(summary.issues, ["Needs more evidence."]);
  assert.equal(summary.approvedBrief.present, true);
  assert.equal(summary.paragraphOutline.paragraphCount, 7);
  assert.equal(summary.paragraphOutline.anchors.length, 6);
  assert.equal(summary.evidence.researchCount, 1);
  assert.deepEqual(summary.evidence.externalStoryTitles, ["Factory turnaround"]);
  assert.deepEqual(summary.personalStories.titles, ["The whiteboard moment"]);
  assert.equal(summary.voiceGuide.guidance.length, 5);
  assert.equal(summary.craftNotes.notes.length, 3);
});

test("Chapter Draft workspace projections are owned outside the monolith", () => {
  const monolith = readFileSync("src/lib/workflows/chapter-draft.ts", "utf8");
  const support = readFileSync("src/lib/workflows/chapter-draft/workspace-support.ts", "utf8");

  assert.equal(monolith.includes("function summarizeQuillContextForAuthor"), false);
  assert.equal(monolith.includes("deltaFromTarget:"), false);
  assert.equal(monolith.includes("researchCount:\n            (research?.factBank.length"), false);
  assert.equal(support.includes("export function buildChapterDraftMetrics"), true);
  assert.equal(support.includes("export function buildChapterDraftSourceAvailability"), true);
  assert.equal(support.includes("export function projectChapterDraftApprovalState"), true);
  assert.equal(support.includes("export function summarizeQuillContextForAuthor"), true);
  assert.equal(support.includes("export function buildChapterDraftProgress"), true);
});
