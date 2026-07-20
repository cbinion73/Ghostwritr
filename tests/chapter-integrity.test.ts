import assert from "node:assert/strict";
import test from "node:test";

import type { ChapterDraftBundle } from "../src/lib/chapter-draft-types";
import type { ChapterEvidenceRecord } from "../src/lib/source-evidence-contract";
import { auditChapterDraftIntegrity } from "../src/lib/workflows/chapter-draft/integrity";

function draft(text: string, researchItemIds: string[] = []): ChapterDraftBundle {
  return {
    chapterKey: "ch-1",
    chapterTitle: "Formation",
    chapterDescription: "A test chapter.",
    sectionTitle: "Part One",
    openingHook: text.split(".")[0] ?? text,
    narrativeThread: "Formation takes time.",
    chapterText: text,
    paragraphs: [{ id: "p-1", topicSentence: "Formation takes time.", prose: text, sourceNotes: researchItemIds }],
    sourceUsage: {
      research: researchItemIds.length > 0 ? ["Verified source"] : [],
      externalStories: [],
      personalStories: [],
      baseStory: [],
      researchItemIds,
      externalStoryItemIds: [],
    },
    quality: {
      score: 0,
      readiness: "needs attention",
      needsRevision: true,
      revisionPasses: 0,
      signals: [],
      integrity: {
        policyVersion: "chapter-integrity-v1",
        status: "warn",
        issues: [],
        usedEvidenceIds: [],
        namedAuthorities: [],
        directQuotationCount: 0,
        originalLanguageCount: 0,
      },
    },
  };
}

function evidence(overrides: Partial<ChapterEvidenceRecord> = {}): ChapterEvidenceRecord {
  return {
    id: "research-1",
    kind: "RESEARCH_CLAIM",
    chapterKey: "ch-1",
    title: "HISTORICAL CLAIM",
    claimOrStory: "John Wesley organized early Methodists into weekly classes of about twelve people.",
    source: {
      id: "source-1",
      url: "https://example.org/wesley",
      title: "The Early Methodist Class Meeting",
      author: "David Lowes Watson",
      sourceTier: "A",
      verificationStatus: "VERIFIED",
    },
    supportingExcerpt: "John Wesley organized weekly classes of about twelve people for mutual accountability.",
    verificationStatus: "VERIFIED",
    relevance: { score: 1, reason: "Direct support." },
    exclusions: [],
    technicallyEligible: true,
    humanAdmitted: true,
    verificationFingerprint: "verified-1",
    admissibility: "ADMISSIBLE",
    ...overrides,
  };
}

test("continuous integrity audit blocks an invented attributed saying", () => {
  const result = auditChapterDraftIntegrity({
    draft: draft('Silouan told Sophrony, “You cannot force the soul to grow faster than it can bear.”'),
    evidence: [],
  });

  assert.equal(result.status, "fail");
  assert.ok(result.issues.some((issue) => issue.code === "UNTRACEABLE_AUTHORITY"));
  assert.ok(result.issues.some((issue) => issue.code === "UNTRACEABLE_QUOTATION"));
});

test("continuous integrity audit accepts a traced historical authority", () => {
  const result = auditChapterDraftIntegrity({
    draft: draft("John Wesley wrote about weekly Methodist classes of roughly twelve people in 1742.", ["research-1"]),
    evidence: [evidence()],
  });

  assert.equal(result.status, "pass");
  assert.deepEqual(result.usedEvidenceIds, ["research-1"]);
  assert.deepEqual(result.namedAuthorities, ["John Wesley"]);
});

test("continuous integrity audit blocks source claims whose IDs are missing or invented", () => {
  const missing = draft("A national study found that 77 percent of participants wanted to grow.");
  missing.sourceUsage.research = ["National study"];
  const missingResult = auditChapterDraftIntegrity({ draft: missing, evidence: [evidence()] });
  assert.ok(missingResult.issues.some((issue) => issue.code === "MISSING_SOURCE_TRACE"));

  const inventedResult = auditChapterDraftIntegrity({
    draft: draft("A national study found that 77 percent of participants wanted to grow.", ["invented-id"]),
    evidence: [evidence()],
  });
  assert.ok(inventedResult.issues.some((issue) => issue.code === "UNTRACEABLE_SOURCE_ID"));
});

test("continuous integrity audit blocks invented paragraph evidence IDs", () => {
  const paragraphSource = draft("A plain sentence with no external claim.");
  paragraphSource.paragraphs[0].sourceNotes = ["invented-paragraph-source"];

  const result = auditChapterDraftIntegrity({ draft: paragraphSource, evidence: [] });

  assert.equal(result.status, "fail");
  assert.ok(result.issues.some((issue) =>
    issue.code === "UNTRACEABLE_SOURCE_ID" && issue.exactText === "invented-paragraph-source"
  ));
});

test("continuous integrity audit catches duplicated prose and forbidden em dashes", () => {
  const sentence = "Formation becomes visible when a person keeps returning to the same faithful practices over time.";
  const result = auditChapterDraftIntegrity({
    draft: draft(`${sentence} ${sentence} Growth is real—but it cannot be hurried.`),
    evidence: [],
  });

  assert.ok(result.issues.some((issue) => issue.code === "DUPLICATED_SENTENCE"));
  assert.ok(result.issues.some((issue) => issue.code === "STYLE_VIOLATION"));
});
