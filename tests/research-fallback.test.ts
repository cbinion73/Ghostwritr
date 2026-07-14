import test from "node:test";
import assert from "node:assert/strict";

import { buildProvisionalResearchPack } from "../src/lib/workflows/research/fallback";
import type { ChapterContext } from "../src/lib/workflows/research/execution-setup";

const chapter: ChapterContext = {
  chapterKey: "chapter-1",
  chapterTitle: "The Cost of Clarity",
  chapterDescription: "Why clarity matters",
  paragraphs: [
    { paragraphId: "p1", topicSentence: "First", purpose: "Open" },
    { paragraphId: "p2", topicSentence: "Second", purpose: "Quantify" },
    { paragraphId: "p3", topicSentence: "Third", purpose: "Example" },
  ],
};

test("Research provisional fallback creates only unverified research leads", () => {
  const pack = buildProvisionalResearchPack(
    chapter,
    [
      {
        id: "q1",
        question: "What supports this chapter?",
        priority: "primary",
      },
    ],
    "Live web research timed out.",
  );

  assert.equal(pack.dossier.metadata?.provisional, true);
  assert.equal(pack.dossier.metadata?.timeout, true);
  assert.equal(pack.dossier.verificationSummary.verifiedItems, 0);
  assert.equal(pack.dossier.verificationSummary.needsCorroborationItems, 3);
  assert.equal(pack.sources[0]?.isVerified, false);
  assert.deepEqual(
    pack.items.map((item) => item.verificationStatus),
    ["NEEDS_CORROBORATION", "NEEDS_CORROBORATION", "NEEDS_CORROBORATION"],
  );
  assert.deepEqual(
    pack.items.map((item) => item.mappedParagraphId),
    ["p1", "p2", "p3"],
  );
});
