import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  validateQuillContextPacket,
  type QuillContextPacket,
} from "../src/lib/quill-context-contract";

function basePacket(): QuillContextPacket {
  return {
    chapter: {
      chapterKey: "chapter-1",
      chapterTitle: "The hard meeting",
    },
    approvedBrief: {
      approved: true,
      summary: "Approved strategic brief summary.",
    },
    paragraphOutline: {
      current: true,
      paragraphs: [
        {
          id: "p1",
          topicSentence: "Open in the tension.",
          purpose: "Ground the reader.",
          wordCountTarget: 300,
        },
      ],
    },
    baseStoryGuidance: {
      present: true,
      draftingInstruction: "Carry the chapter through the core tension.",
    },
    evidence: {
      research: [
        {
          id: "fact-1",
          kind: "RESEARCH_CLAIM",
          chapterKey: "chapter-1",
          title: "FACT",
          claimOrStory: "Supported claim.",
          source: {
            id: "source-1",
            url: "https://example.com",
            title: "Source",
            sourceTier: "A",
            verificationStatus: "VERIFIED",
          },
          supportingExcerpt: "Supporting excerpt.",
          verificationStatus: "VERIFIED",
          relevance: { score: 0.9, reason: "Directly supports the chapter." },
          exclusions: [],
          technicallyEligible: true,
          humanAdmitted: true,
          verificationFingerprint: "verification-fingerprint-1",
          admissibility: "ADMISSIBLE",
        },
      ],
      externalStories: [],
    },
    personalStories: [
      {
        id: "story-1",
        title: "The hard meeting",
        summary: "A compact story summary.",
        lesson: "Tell the truth early.",
        whyItMatters: "It adds credibility.",
        storyType: "leadership",
        emotionalNotes: ["tense"],
        assignment: {
          chapterKey: "chapter-1",
          relevance: "Opening credibility story.",
        },
        permissionStatus: "granted",
      },
    ],
    voiceGuide: {
      present: true,
      dominantPersona: "Andy Stanley",
      guidance: ["Plainspoken clarity."],
    },
    craftNotes: ["Avoid em dashes."],
  };
}

test("valid Quill context packet passes contract validation", () => {
  assert.deepEqual(validateQuillContextPacket(basePacket()), { ok: true, issues: [] });
});

test("Quill context packet rejects unapproved or non-admissible inputs", () => {
  const packet = basePacket();
  packet.approvedBrief.approved = false;
  packet.evidence.research[0] = {
    ...packet.evidence.research[0]!,
    admissibility: "NEEDS_CORROBORATION",
  };

  const result = validateQuillContextPacket(packet);

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("Approved strategic brief is missing."));
  assert.ok(result.issues.includes("Research evidence includes non-admissible records."));
});

test("Quill context packet rejects raw transcript and provenance fields", () => {
  const packet = {
    ...basePacket(),
    personalStories: [
      {
        ...basePacket().personalStories[0]!,
        sourceQuote: "Raw quote should not be sent.",
        provenance: { rawNotes: ["Raw notes should stay out."] },
      },
    ],
  } as unknown as QuillContextPacket;

  const result = validateQuillContextPacket(packet);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes("sourceQuote")));
  assert.ok(result.issues.some((issue) => issue.includes("provenance")));
  assert.ok(result.issues.some((issue) => issue.includes("rawNotes")));
});

test("Chapter Draft workflow enforces Quill context readiness before drafting", () => {
  const context = readFileSync("src/lib/workflows/chapter-draft/context.ts", "utf8");
  const execution = readFileSync("src/lib/workflows/chapter-draft/execution.ts", "utf8");

  assert.ok(context.includes("getCommittedPhase1StrategicBrief"));
  assert.ok(context.includes("Phase1StrategicBriefSchema"));
  assert.ok(context.includes("validateQuillContextPacket"));
  assert.ok(context.includes("buildQuillContextReadinessPacket"));
  assert.ok(context.includes("validateQuillContextReadiness"));
  assert.ok(context.includes("No admissible Research evidence is assigned to this chapter."));
  assert.ok(context.includes("No admissible External Story evidence is assigned to this chapter."));
  assert.ok(context.includes("Chapter drafting is intentionally blocked"));
});

test("Chapter Draft author and revise packets route through canonical Quill context", () => {
  const modelHelpers = readFileSync("src/lib/workflows/chapter-draft/model-helpers.ts", "utf8");

  assert.ok(modelHelpers.includes("quillContext: readiness.packet"));
  assert.ok(modelHelpers.includes("const chapterInput = authorInput"));
  assert.ok(modelHelpers.includes("quillContext.craftNotes"));
  assert.ok(modelHelpers.includes("phase1StrategicBrief"));
  assert.equal(modelHelpers.includes("promise: _sharedPromise"), false);
  assert.equal(modelHelpers.includes("bookSetupProfile: _sharedProfile"), false);
  assert.equal(modelHelpers.includes("baseStoryBook: _sharedBaseStory"), false);
  assert.equal(modelHelpers.includes("authorCraftNotes"), false);
});

test("Chapter Draft UI summarizes the approved Quill context packet", () => {
  const workspace = readFileSync("src/lib/workflows/chapter-draft/workspace.ts", "utf8");
  const page = readFileSync("src/app/books/[slug]/chapter-draft/page.tsx", "utf8");

  assert.ok(workspace.includes("summarizeQuillContextForAuthor"));
  assert.ok(workspace.includes("quillContextSummary"));
  assert.ok(page.includes("Quill Context"));
  assert.ok(page.includes("Approved Inputs"));
  assert.ok(page.includes("Approved brief"));
  assert.ok(page.includes("Current paragraph outline"));
  assert.ok(page.includes("Base Story guidance"));
  assert.ok(page.includes("Verified chapter sources"));
  assert.ok(page.includes("Assigned personal stories"));
  assert.ok(page.includes("Voice and craft"));
  assert.ok(page.includes("Quill ready"));
});
