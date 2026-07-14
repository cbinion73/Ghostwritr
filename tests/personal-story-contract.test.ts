import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  getCompactPersonalStoryCardsForChapter,
  getPersonalStoryFollowUpsForChapter,
  getReadyPersonalStoriesForChapter,
  normalizePersonalStoryEncyclopedia,
  normalizePersonalStoryEntry,
} from "../src/lib/personal-story-contract";
import type { PersonalStoryEncyclopedia, PersonalStoryEntry } from "../src/lib/personal-story-types";

const baseStory: PersonalStoryEntry = {
  id: "story-1",
  title: "The hard meeting",
  summary: "A story about a difficult leadership conversation.",
  lesson: "Tell the truth early.",
  whyItMatters: "It shows the reader what courage costs.",
  storyType: "leadership",
  lifeArea: "work",
  emotionalNotes: ["tense", "honest"],
  chapterFitHints: ["chapter-1"],
  status: "strong",
  sourceQuote: "I remember walking into the room and knowing I had to say it plainly.",
};

test("normalizes legacy personal stories into canonical contract fields", () => {
  const normalized = normalizePersonalStoryEntry(baseStory);

  assert.equal(normalized.readiness, "PERMISSION_BLOCKED");
  assert.deepEqual(normalized.provenance.rawNotes, [
    "I remember walking into the room and knowing I had to say it plainly.",
  ]);
  assert.equal(normalized.permission.status, "needs_review");
  assert.equal(normalized.assignments[0]?.chapterKey, "chapter-1");
  assert.equal(
    normalized.assignments[0]?.relevance,
    "Legacy chapter fit hint. Confirm chapter ID before drafting.",
  );
  assert.deepEqual(normalized.usageHistory, []);
});

test("marks stories with missing details or restricted permissions as not ready", () => {
  const needsDetail = normalizePersonalStoryEntry({
    ...baseStory,
    id: "story-2",
    status: "needs_detail",
    sourceQuote: null,
  });
  const restricted = normalizePersonalStoryEntry({
    ...baseStory,
    id: "story-3",
    permission: { status: "restricted", notes: "Do not use publicly." },
  });

  assert.equal(needsDetail.readiness, "NEEDS_DETAIL");
  assert.deepEqual(needsDetail.missingDetails, ["Story needs more concrete detail before drafting."]);
  assert.deepEqual(needsDetail.provenance.rawNotes, []);
  assert.equal(restricted.readiness, "PERMISSION_BLOCKED");
});

test("summarizes personal story encyclopedia readiness", () => {
  const encyclopedia: PersonalStoryEncyclopedia = {
    interviewFocus: "Leadership stories",
    nextQuestion: "What happened next?",
    entries: [
      { ...baseStory, permission: { status: "granted" } },
      { ...baseStory, id: "story-2", status: "needs_detail" },
      { ...baseStory, id: "story-3", status: "not_applicable" },
    ],
    noStoryTopics: [],
    coverageGaps: [],
    interviewerNotes: [],
  };

  const normalized = normalizePersonalStoryEncyclopedia(encyclopedia);

  assert.equal(normalized.readinessSummary.totalStories, 3);
  assert.equal(normalized.readinessSummary.readyStories, 1);
  assert.equal(normalized.readinessSummary.needsDetailStories, 1);
  assert.equal(normalized.readinessSummary.notApplicableStories, 1);
});

test("only permission-granted detail-complete personal stories are ready for a chapter", () => {
  const encyclopedia: PersonalStoryEncyclopedia = {
    interviewFocus: "Leadership stories",
    nextQuestion: "What happened next?",
    entries: [
      { ...baseStory, id: "ready", permission: { status: "granted" } },
      { ...baseStory, id: "unconfirmed" },
      { ...baseStory, id: "detail", status: "needs_detail", permission: { status: "granted" } },
      { ...baseStory, id: "restricted", permission: { status: "restricted" } },
    ],
    noStoryTopics: [],
    coverageGaps: [],
    interviewerNotes: [],
  };

  const ready = getReadyPersonalStoriesForChapter(encyclopedia, {
    chapterKey: "chapter-1",
    chapterTitle: "The hard meeting",
  });
  const followUps = getPersonalStoryFollowUpsForChapter(encyclopedia, {
    chapterKey: "chapter-1",
    chapterTitle: "The hard meeting",
  });

  assert.deepEqual(ready.map((entry) => entry.id), ["ready"]);
  assert.deepEqual(
    followUps.map((entry) => [entry.id, entry.readiness]),
    [
      ["unconfirmed", "PERMISSION_BLOCKED"],
      ["detail", "NEEDS_DETAIL"],
      ["restricted", "PERMISSION_BLOCKED"],
    ],
  );
});

test("compact personal story cards include only assigned chapter-safe fields", () => {
  const encyclopedia: PersonalStoryEncyclopedia = {
    interviewFocus: "Leadership stories",
    nextQuestion: "What happened next?",
    entries: [
      {
        ...baseStory,
        id: "ready",
        permission: { status: "granted" },
        provenance: {
          rawNotes: ["This raw note must not be sent to Quill."],
          sourceMessageIds: ["message-1"],
        },
        assignments: [
          {
            chapterKey: "chapter-1",
            chapterTitle: "The hard meeting",
            relevance: "Opening credibility story.",
          },
        ],
      },
      {
        ...baseStory,
        id: "other-chapter",
        permission: { status: "granted" },
        assignments: [{ chapterKey: "chapter-99", relevance: "Different chapter." }],
      },
    ],
    noStoryTopics: [],
    coverageGaps: [],
    interviewerNotes: [],
  };

  const cards = getCompactPersonalStoryCardsForChapter(encyclopedia, {
    chapterKey: "chapter-1",
    chapterTitle: "The hard meeting",
  });

  assert.equal(cards.length, 1);
  assert.deepEqual(Object.keys(cards[0] ?? {}).sort(), [
    "assignment",
    "emotionalNotes",
    "id",
    "lesson",
    "permissionStatus",
    "storyType",
    "summary",
    "title",
    "whyItMatters",
  ]);
  assert.equal(cards[0]?.permissionStatus, "granted");
  assert.equal(cards[0]?.assignment.relevance, "Opening credibility story.");
});

test("chapter drafting uses ready personal stories and preserves blocked stories as follow-ups", () => {
  const sourceAvailability = readFileSync(
    join(process.cwd(), "src/lib/workflows/chapter-draft/source-availability.ts"),
    "utf8",
  );
  const modelHelpers = readFileSync(
    join(process.cwd(), "src/lib/workflows/chapter-draft/model-helpers.ts"),
    "utf8",
  );

  assert.ok(sourceAvailability.includes("getReadyPersonalStoriesForChapter(encyclopedia, chapter)"));
  assert.ok(modelHelpers.includes("getPersonalStoryFollowUpsForChapter(personalStories"));
  assert.ok(modelHelpers.includes("personalStoryFollowUps"));
});

test("chapter drafting sends compact assigned personal story cards, not raw interview material", () => {
  const context = readFileSync(
    join(process.cwd(), "src/lib/workflows/chapter-draft/context.ts"),
    "utf8",
  );
  const modelHelpers = readFileSync(
    join(process.cwd(), "src/lib/workflows/chapter-draft/model-helpers.ts"),
    "utf8",
  );

  assert.ok(context.includes("getCompactPersonalStoryCardsForChapter(input.personalStories"));
  assert.ok(context.includes("personalStories: getCompactPersonalStoryCardsForChapter"));
  assert.ok(modelHelpers.includes("quillContext: readiness.packet"));
  assert.ok(!context.includes("sourceQuote: story.sourceQuote"));
  assert.ok(!context.includes("rawNotes"));
});

test("personal stories UI surfaces readiness, permission, assignment, and usage status", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/books/[slug]/personal-stories/personal-stories-content.tsx"),
    "utf8",
  );

  assert.ok(source.includes("readinessSummary.readyStories"));
  assert.ok(source.includes("readinessSummary.needsDetailStories"));
  assert.ok(source.includes("readinessSummary.permissionBlockedStories"));
  assert.ok(source.includes("entry.permission.status"));
  assert.ok(source.includes("entry.missingDetails"));
  assert.ok(source.includes("entry.assignments"));
  assert.ok(source.includes("entry.usageHistory"));
});
