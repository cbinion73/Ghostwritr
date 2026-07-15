import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  buildExternalStoryEvidenceContract,
  buildResearchEvidenceContract,
  getAdmissibleExternalStories,
  getAdmissibleResearchItems,
} from "../src/lib/source-evidence-contract";
import type { ChapterExternalStoryDossier } from "../src/lib/external-story-types";
import type { ChapterResearchDossier } from "../src/lib/research-types";

function admitted(kind: "RESEARCH_CLAIM" | "EXTERNAL_STORY", id: string, excerpt: string) {
  return new Map([[`${kind}:${id}`, {
    artifactVersionId: "version-1",
    verificationFingerprint: `fingerprint-${id}`,
    verdict: "VERIFIED" as const,
    admitted: true,
    supportingExcerpt: excerpt,
  }]]);
}

test("research evidence contract admits only verified sourced claims with excerpts", () => {
  const dossier: ChapterResearchDossier = {
    chapterKey: "chapter-1",
    chapterTitle: "A Real Chapter",
    chapterDescription: "Chapter description",
    researchGoal: "Find reliable support.",
    researchQuestions: [],
    factBank: [
      {
        id: "fact-1",
        itemType: "FACT",
        claimText: "Verified claim.",
        evidenceExcerpt: "A source excerpt that supports the claim.",
        sourceId: "source-1",
        sourceTier: "A",
        tierWeight: 1,
        verificationStatus: "VERIFIED",
        relevanceScore: 0.9,
      },
      {
        id: "fact-2",
        itemType: "FACT",
        claimText: "Unsupported claim.",
        sourceId: "source-1",
        sourceTier: "A",
        tierWeight: 1,
        verificationStatus: "VERIFIED",
      },
    ],
    statistics: [],
    quotes: [],
    examples: [],
    counterpoints: [],
    definitions: [],
    gaps: [],
    sourceRegister: [
      {
        id: "source-1",
        url: "https://example.com/source",
        title: "Source",
        sourceTier: "A",
        tierWeight: 1,
        isVerified: true,
        verificationStatus: "VERIFIED",
      },
    ],
    verificationSummary: {
      totalSources: 1,
      verifiedSources: 1,
      totalItems: 2,
      verifiedItems: 2,
      rejectedItems: 0,
      needsCorroborationItems: 0,
    },
  };

  const unreviewed = buildResearchEvidenceContract(dossier);
  assert.equal(unreviewed.summary.admissibleRecords, 0, "extractor verification alone must fail closed");
  const contract = buildResearchEvidenceContract(dossier, admitted("RESEARCH_CLAIM", "fact-1", "A source excerpt that supports the claim."));

  assert.equal(contract.summary.totalRecords, 2);
  assert.equal(contract.summary.admissibleRecords, 1);
  assert.equal(contract.summary.needsCorroborationRecords, 0);
  assert.equal(contract.summary.excludedRecords, 1);
  assert.equal(contract.records[0]?.admissibility, "ADMISSIBLE");
  assert.deepEqual(contract.records[1]?.exclusions, ["Missing supporting excerpt."]);
});

test("drafting-safe research dossier filters out inadmissible claims", () => {
  const dossier: ChapterResearchDossier = {
    chapterKey: "chapter-1",
    chapterTitle: "A Real Chapter",
    chapterDescription: "Chapter description",
    researchGoal: "Find reliable support.",
    researchQuestions: [],
    factBank: [
      {
        id: "fact-1",
        itemType: "FACT",
        claimText: "Verified claim.",
        evidenceExcerpt: "A source excerpt that supports the claim.",
        sourceId: "source-1",
        sourceTier: "A",
        tierWeight: 1,
        verificationStatus: "VERIFIED",
      },
      {
        id: "fact-2",
        itemType: "FACT",
        claimText: "Unsupported claim.",
        sourceId: "source-1",
        sourceTier: "A",
        tierWeight: 1,
        verificationStatus: "VERIFIED",
      },
    ],
    statistics: [],
    quotes: [],
    examples: [],
    counterpoints: [],
    definitions: [],
    gaps: [],
    sourceRegister: [
      {
        id: "source-1",
        url: "https://example.com/source",
        title: "Source",
        sourceTier: "A",
        tierWeight: 1,
        isVerified: true,
        verificationStatus: "VERIFIED",
      },
    ],
    verificationSummary: {
      totalSources: 1,
      verifiedSources: 1,
      totalItems: 2,
      verifiedItems: 2,
      rejectedItems: 0,
      needsCorroborationItems: 0,
    },
  };

  const { dossier: safeDossier, contract } = getAdmissibleResearchItems(dossier, admitted("RESEARCH_CLAIM", "fact-1", "A source excerpt that supports the claim."));

  assert.equal(contract.summary.admissibleRecords, 1);
  assert.equal(safeDossier.factBank.length, 1);
  assert.equal(safeDossier.factBank[0]?.id, "fact-1");
  assert.equal(safeDossier.verificationSummary.verifiedItems, 1);
  assert.equal(safeDossier.verificationSummary.needsCorroborationItems, 1);
  assert.deepEqual(safeDossier.metadata?.evidenceContractSummary, contract.summary);
});

test("chapter drafting uses admissible Research evidence rather than source-register presence", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/workflows/chapter-draft/source-availability.ts"),
    "utf8",
  );

  assert.ok(source.includes("getAdmissibleResearchItems(parsed, admissions).dossier"));
  assert.ok(source.includes("getAdmissibleResearchItems(structured, admissions).dossier"));
  assert.ok(!source.includes("sourceRegister.length > 0 ||"));
});

test("external story evidence contract requires attribution and excerpts", () => {
  const dossier: ChapterExternalStoryDossier = {
    chapterKey: "chapter-2",
    chapterTitle: "Another Chapter",
    chapterDescription: "Chapter description",
    storyGoal: "Find useful case studies.",
    storyCandidates: [
      {
        id: "story-1",
        sourceId: "source-1",
        title: "Verified Story",
        summary: "A concise case-study summary.",
        whyItMatters: "It directly illustrates the chapter tension.",
        emotionalRole: "Concrete proof",
        storyType: "TURNING_POINT",
        storyFit: "PROOF_POINT",
        sourceTier: "A",
        tierWeight: 1,
        verificationStatus: "VERIFIED",
        metadata: {
          supportingExcerpt: "The source text that supports the story.",
        },
      },
      {
        id: "story-2",
        sourceId: "missing-source",
        title: "Unattributed Story",
        summary: "A story without a source.",
        whyItMatters: "It might be useful if sourced.",
        emotionalRole: "Warning",
        storyType: "FAILURE",
        storyFit: "CHAPTER_PIVOT",
        sourceTier: "C",
        tierWeight: 0.5,
        verificationStatus: "NEEDS_CORROBORATION",
      },
    ],
    sourceRegister: [
      {
        id: "source-1",
        url: "https://example.com/story",
        title: "Story Source",
        sourceTier: "A",
        tierWeight: 1,
        isVerified: true,
        verificationStatus: "VERIFIED",
      },
    ],
    storyTypesCovered: ["TURNING_POINT"],
    storyFitsCovered: ["PROOF_POINT"],
    verificationSummary: {
      totalSources: 1,
      verifiedSources: 1,
      totalStories: 2,
      verifiedStories: 1,
      rejectedStories: 0,
      needsCorroborationStories: 1,
    },
  };

  const unreviewed = buildExternalStoryEvidenceContract(dossier);
  assert.equal(unreviewed.summary.admissibleRecords, 0, "Chronicle verification alone must fail closed");
  const contract = buildExternalStoryEvidenceContract(dossier, admitted("EXTERNAL_STORY", "story-1", "The source text that supports the story."));

  assert.equal(contract.summary.totalRecords, 2);
  assert.equal(contract.summary.admissibleRecords, 1);
  assert.equal(contract.summary.needsCorroborationRecords, 0);
  assert.equal(contract.summary.excludedRecords, 1);
  assert.equal(contract.records[0]?.admissibility, "ADMISSIBLE");
  assert.deepEqual(contract.records[1]?.exclusions, [
    "Missing source metadata.",
    "Missing supporting excerpt.",
  ]);
});

test("drafting-safe external story dossier filters out unattributed or excerptless stories", () => {
  const dossier: ChapterExternalStoryDossier = {
    chapterKey: "chapter-2",
    chapterTitle: "Another Chapter",
    chapterDescription: "Chapter description",
    storyGoal: "Find useful case studies.",
    storyCandidates: [
      {
        id: "story-1",
        sourceId: "source-1",
        title: "Verified Story",
        summary: "A concise case-study summary.",
        whyItMatters: "It directly illustrates the chapter tension.",
        emotionalRole: "Concrete proof",
        storyType: "TURNING_POINT",
        storyFit: "PROOF_POINT",
        sourceTier: "A",
        tierWeight: 1,
        verificationStatus: "VERIFIED",
        metadata: {
          supportingExcerpt: "The source text that supports the story.",
        },
      },
      {
        id: "story-2",
        sourceId: "source-1",
        title: "Excerptless Story",
        summary: "A story without excerpt backing.",
        whyItMatters: "It might be useful if sourced.",
        emotionalRole: "Warning",
        storyType: "FAILURE",
        storyFit: "CHAPTER_PIVOT",
        sourceTier: "A",
        tierWeight: 1,
        verificationStatus: "VERIFIED",
      },
    ],
    sourceRegister: [
      {
        id: "source-1",
        url: "https://example.com/story",
        title: "Story Source",
        sourceTier: "A",
        tierWeight: 1,
        isVerified: true,
        verificationStatus: "VERIFIED",
      },
    ],
    storyTypesCovered: ["TURNING_POINT", "FAILURE"],
    storyFitsCovered: ["PROOF_POINT", "CHAPTER_PIVOT"],
    verificationSummary: {
      totalSources: 1,
      verifiedSources: 1,
      totalStories: 2,
      verifiedStories: 2,
      rejectedStories: 0,
      needsCorroborationStories: 0,
    },
  };

  const { dossier: safeDossier, contract } = getAdmissibleExternalStories(dossier, admitted("EXTERNAL_STORY", "story-1", "The source text that supports the story."));

  assert.equal(contract.summary.admissibleRecords, 1);
  assert.equal(safeDossier.storyCandidates.length, 1);
  assert.equal(safeDossier.storyCandidates[0]?.id, "story-1");
  assert.deepEqual(safeDossier.storyTypesCovered, ["TURNING_POINT"]);
  assert.deepEqual(safeDossier.storyFitsCovered, ["PROOF_POINT"]);
  assert.equal(safeDossier.verificationSummary.verifiedStories, 1);
  assert.equal(safeDossier.verificationSummary.needsCorroborationStories, 1);
  assert.deepEqual(safeDossier.metadata?.evidenceContractSummary, contract.summary);
});

test("chapter drafting uses admissible External Story evidence rather than source-register presence", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/workflows/chapter-draft/source-availability.ts"),
    "utf8",
  );

  assert.ok(source.includes("getAdmissibleExternalStories(parsed, admissions).dossier"));
  assert.ok(source.includes("getAdmissibleExternalStories(structured, admissions).dossier"));
  assert.ok(!source.includes("sourceRegister.length > 0 ||"));
});

test("verifier-recovered excerpts and approved corrections reach drafting metadata", () => {
  const dossier: ChapterResearchDossier = {
    chapterKey: "chapter-1", chapterTitle: "Chapter", chapterDescription: "", researchGoal: "", researchQuestions: [],
    factBank: [{ id: "fact-1", itemType: "FACT", claimText: "Claim", sourceId: "source-1", sourceTier: "A", tierWeight: 1, verificationStatus: "VERIFIED" }],
    statistics: [], quotes: [], examples: [], counterpoints: [], definitions: [], gaps: [],
    sourceRegister: [{ id: "source-1", url: "https://example.com", title: "Wrong title", author: "Wrong author", sourceTier: "A", tierWeight: 1, isVerified: true, verificationStatus: "VERIFIED" }],
    verificationSummary: { totalSources: 1, verifiedSources: 1, totalItems: 1, verifiedItems: 1, rejectedItems: 0, needsCorroborationItems: 0 },
  };
  const admissions = new Map([["RESEARCH_CLAIM:fact-1", {
    artifactVersionId: "version-1", verificationFingerprint: "fp", verdict: "VERIFIED_WITH_CORRECTION" as const,
    admitted: true, supportingExcerpt: "Recovered literal excerpt", decision: "APPROVE_CORRECTED" as const,
    corrections: [
      { field: "title" as const, original: "Wrong title", corrected: "Correct title" },
      { field: "author" as const, original: "Wrong author", corrected: "Correct author" },
      { field: "url" as const, original: "https://example.com", corrected: "https://doi.org/10.1000/correct" },
    ],
  }]]);
  const { dossier: safe, contract } = getAdmissibleResearchItems(dossier, admissions);
  assert.equal(contract.records[0]?.admissibility, "ADMISSIBLE");
  assert.equal(contract.records[0]?.supportingExcerpt, "Recovered literal excerpt");
  assert.equal(contract.records[0]?.source?.title, "Correct title");
  assert.equal(safe.sourceRegister[0]?.author, "Correct author");
  assert.equal(safe.sourceRegister[0]?.canonicalUrl, "https://doi.org/10.1000/correct");
  dossier.factBank.push({ ...dossier.factBank[0]!, id: "fact-2" });
  const conflicting = new Map(admissions);
  conflicting.set("RESEARCH_CLAIM:fact-2", {
    artifactVersionId: "version-1", verificationFingerprint: "fp-2", verdict: "VERIFIED_WITH_CORRECTION",
    admitted: true, supportingExcerpt: "Recovered literal excerpt", decision: "APPROVE_CORRECTED",
    corrections: [{ field: "title", original: "Wrong title", corrected: "A different approved title" }],
  });
  assert.throws(() => getAdmissibleResearchItems(dossier, conflicting), /Conflicting approved source correction/);
});

test("documented manual exception can admit rejected evidence but not structurally unsourced evidence", () => {
  const dossier: ChapterResearchDossier = {
    chapterKey: "chapter-1", chapterTitle: "Chapter", chapterDescription: "", researchGoal: "", researchQuestions: [],
    factBank: [{ id: "fact-1", itemType: "FACT", claimText: "Claim", evidenceExcerpt: "Stored source excerpt", sourceId: "source-1", sourceTier: "A", tierWeight: 1, verificationStatus: "REJECTED" }],
    statistics: [], quotes: [], examples: [], counterpoints: [], definitions: [], gaps: [],
    sourceRegister: [{ id: "source-1", url: "upload:source", title: "Private source", sourceTier: "A", tierWeight: 1, isVerified: false, verificationStatus: "REJECTED" }],
    verificationSummary: { totalSources: 1, verifiedSources: 0, totalItems: 1, verifiedItems: 0, rejectedItems: 1, needsCorroborationItems: 0 },
  };
  const admissions = new Map([["RESEARCH_CLAIM:fact-1", {
    artifactVersionId: "version-1", verificationFingerprint: "fp", verdict: "INACCESSIBLE" as const,
    admitted: true, supportingExcerpt: null, decision: "MANUAL_EXCEPTION" as const, manualException: true, reviewNotes: "Author supplied and documented private source.",
  }]]);
  assert.equal(buildResearchEvidenceContract(dossier, admissions).records[0]?.admissibility, "ADMISSIBLE");
  dossier.sourceRegister = [];
  assert.equal(buildResearchEvidenceContract(dossier, admissions).records[0]?.admissibility, "EXCLUDED");
});
