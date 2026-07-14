import test from "node:test";
import assert from "node:assert/strict";

import { buildDossier } from "../src/lib/workflows/research/dossier";
import type { ChapterResearchItem, ChapterResearchQuestion, ChapterResearchSource } from "../src/lib/research-types";
import type { ChapterContext } from "../src/lib/workflows/research/execution-setup";

const chapter: ChapterContext = {
  chapterKey: "chapter-1",
  chapterTitle: "The Cost of Clarity",
  chapterDescription: "Why clarity matters",
  paragraphs: [],
};

const questions: ChapterResearchQuestion[] = [
  { id: "q1", question: "What evidence supports clarity?", priority: "primary" },
];

const source: ChapterResearchSource = {
  id: "source-1",
  url: "https://example.org/report",
  title: "Clarity Report",
  sourceTier: "B",
  tierWeight: 0.75,
  isVerified: true,
  verificationStatus: "VERIFIED",
};

function item(
  id: string,
  itemType: ChapterResearchItem["itemType"],
  verificationStatus: ChapterResearchItem["verificationStatus"],
): ChapterResearchItem {
  return {
    id,
    itemType,
    claimText: `${itemType} claim`,
    sourceId: source.id,
    sourceTier: "B",
    tierWeight: 0.75,
    verificationStatus,
  };
}

test("Research dossier groups verified items and strips transient fetched source payloads", () => {
  const dossier = buildDossier(
    chapter,
    questions,
    [
      {
        ...source,
        text: "large extracted text",
        html: "<html>large scraped html</html>",
      } as ChapterResearchSource & { text: string; html: string },
      {
        ...source,
        id: "source-2",
        isVerified: false,
        verificationStatus: "NEEDS_CORROBORATION",
      },
    ],
    [
      item("fact-1", "FACT", "VERIFIED"),
      item("stat-1", "STATISTIC", "VERIFIED"),
      item("case-1", "CASE_STUDY", "VERIFIED"),
      item("needs-1", "QUOTE", "NEEDS_CORROBORATION"),
      item("reject-1", "COUNTERPOINT", "REJECTED"),
    ],
  );

  assert.equal(dossier.chapterKey, chapter.chapterKey);
  assert.equal(dossier.researchQuestions, questions);
  assert.equal(dossier.factBank.length, 1);
  assert.equal(dossier.statistics.length, 1);
  assert.equal(dossier.examples.length, 1);
  assert.equal(dossier.quotes.length, 0);
  assert.equal(dossier.counterpoints.length, 0);
  assert.equal(dossier.verificationSummary.totalSources, 2);
  assert.equal(dossier.verificationSummary.verifiedSources, 1);
  assert.equal(dossier.verificationSummary.totalItems, 5);
  assert.equal(dossier.verificationSummary.verifiedItems, 3);
  assert.equal(dossier.verificationSummary.rejectedItems, 1);
  assert.equal(dossier.verificationSummary.needsCorroborationItems, 1);
  assert.deepEqual(
    dossier.gaps,
    ["Needs corroboration before admission: QUOTE claim"],
  );
  assert.equal("text" in dossier.sourceRegister[0]!, false);
  assert.equal("html" in dossier.sourceRegister[0]!, false);
});
