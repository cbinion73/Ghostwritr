import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  adjudicateAmbiguousItems,
  buildFocusedSourceContext,
  extractItemsFromSource,
  shouldAutoPromoteResearchItem,
  verifyItemsForSource,
} from "../src/lib/workflows/research/extraction-verification";
import type { FetchedSource } from "../src/lib/workflows/research/source-discovery";
import type { ChapterContext } from "../src/lib/workflows/research/execution-setup";
import type { ResearchLens } from "../src/lib/research-lenses";
import type { ChapterResearchItem, ChapterResearchVerification } from "../src/lib/research-types";

const chapter: ChapterContext = {
  chapterKey: "chapter-1",
  chapterTitle: "The Cost of Clarity",
  chapterDescription: "Why clarity matters",
  paragraphs: [
    { paragraphId: "p1", topicSentence: "Open with stakes", purpose: "Opening" },
    { paragraphId: "p2", topicSentence: "Quantify stakes", purpose: "Evidence" },
  ],
};

const lens: ResearchLens = {
  key: "general",
  label: "General",
  description: "General research lens",
  queryTemplates: [],
  subjectQueries: [],
  tierRules: "",
  directives: "",
  storyGuidance: "",
  storyQueryTemplates: [],
};

const source: FetchedSource = {
  id: "source-1",
  url: "https://example.org/clarity",
  canonicalUrl: "https://example.org/clarity",
  title: "Clarity Report",
  publisher: "Example Publisher",
  accessedAt: "2026-07-13T00:00:00.000Z",
  contentType: "text/html",
  sourceTier: "B",
  tierWeight: 0.75,
  isVerified: true,
  verificationStatus: "VERIFIED",
  text: [
    "This credible report says 42 percent of teams lose time when goals are unclear, based on a multi-year survey of operators.",
    "A second detailed example shows that leaders recovered execution speed when decision rules were written plainly for every team.",
    "A short sentence.",
  ].join(" "),
  html: "<html></html>",
};

function item(input: Partial<ChapterResearchItem> = {}): ChapterResearchItem {
  return {
    id: input.id ?? "item-1",
    itemType: input.itemType ?? "FACT",
    claimText: input.claimText ?? "42 percent of teams lose time when goals are unclear.",
    evidenceExcerpt:
      input.evidenceExcerpt ??
      "42 percent of teams lose time when goals are unclear",
    sourceId: source.id,
    sourceTier: input.sourceTier ?? "B",
    tierWeight: input.tierWeight ?? 0.75,
    verificationStatus: input.verificationStatus ?? "PENDING",
    ...input,
  };
}

test("Research extraction builds fallback items without provider calls", async () => {
  const items = await extractItemsFromSource(chapter, source, lens, undefined, {
    getModel: async () => null,
  });

  assert.equal(items.length, 2);
  assert.equal(items[0]?.sourceId, source.id);
  assert.equal(items[0]?.verificationStatus, "PENDING");
  assert.equal(items[0]?.mappedParagraphId, "p1");
  assert.equal(items[1]?.mappedParagraphId, "p2");
  assert.equal(items[0]?.itemType, "STATISTIC");
});

test("Research verification fallback marks items as needing corroboration without provider calls", async () => {
  const researchItems = [item({ id: "fact-1" })];
  const result = await verifyItemsForSource(chapter, source, researchItems, lens, undefined, {
    getModel: async () => null,
  });

  assert.equal(result.items, researchItems);
  assert.equal(result.verifications.length, 1);
  assert.equal(result.verifications[0]?.status, "NEEDS_CORROBORATION");
  assert.equal(result.verifications[0]?.secondSourceRequired, true);
});

test("Research adjudication returns unchanged input without an adjudication model", async () => {
  const researchItems = [item({ verificationStatus: "NEEDS_CORROBORATION" })];
  const verifications: ChapterResearchVerification[] = [
    {
      id: "verify-1",
      researchItemId: researchItems[0]!.id,
      sourceRecordId: source.id,
      verifierType: "LLM_VERIFIER",
      status: "NEEDS_CORROBORATION",
      secondSourceRequired: true,
      secondSourceConfirmed: false,
    },
  ];

  const result = await adjudicateAmbiguousItems(chapter, source, researchItems, verifications, lens, {
    getModel: async () => null,
  });

  assert.equal(result.items, researchItems);
  assert.equal(result.verifications, verifications);
});

test("Research focused source context includes excerpt windows and falls back to a capped prefix", () => {
  const longContextSource = `${"a".repeat(1200)} leaders recovered execution speed ${"b".repeat(1200)}`;
  const context = buildFocusedSourceContext(longContextSource, [
    "leaders recovered execution speed",
  ]);
  assert.match(context, /leaders recovered execution speed/);
  assert.ok(context.length < longContextSource.length);

  const longSource = "x".repeat(25000);
  assert.equal(buildFocusedSourceContext(longSource, ["missing excerpt"]).length, 20000);
});

test("Research auto-promotion keeps source-tier and quote rules conservative", () => {
  assert.equal(
    shouldAutoPromoteResearchItem(item({ itemType: "FACT" }), source, {
      status: "NEEDS_CORROBORATION",
      claimSupported: true,
      tierConfirmed: true,
      secondSourceRequired: true,
      secondSourceConfirmed: false,
    }),
    true,
  );
  assert.equal(
    shouldAutoPromoteResearchItem(item({ itemType: "QUOTE" }), { ...source, sourceTier: "A" }, {
      status: "NEEDS_CORROBORATION",
      claimSupported: true,
      tierConfirmed: true,
      secondSourceRequired: true,
      secondSourceConfirmed: false,
    }),
    false,
  );
  assert.equal(
    shouldAutoPromoteResearchItem(item({ itemType: "FACT" }), { ...source, sourceTier: "C" }, {
      status: "NEEDS_CORROBORATION",
      claimSupported: true,
      tierConfirmed: true,
      secondSourceRequired: true,
      secondSourceConfirmed: false,
    }),
    false,
  );
});

test("Research extraction, verification, and adjudication helpers are owned outside the monolith", () => {
  const monolith = readFileSync("src/lib/workflows/research.ts", "utf8");
  const extractionModule = readFileSync("src/lib/workflows/research/extraction-verification.ts", "utf8");

  assert.equal(monolith.includes("const EXTRACTION_SYSTEM_PROMPT"), false);
  assert.equal(monolith.includes("const VERIFICATION_SYSTEM_PROMPT"), false);
  assert.equal(monolith.includes("const PassagePrefilterSchema"), false);
  assert.equal(monolith.includes("function buildFocusedSourceContext"), false);
  assert.equal(monolith.includes("async function extractItemsFromSource"), false);
  assert.equal(monolith.includes("async function verifyItemsForSource"), false);
  assert.equal(monolith.includes("async function adjudicateAmbiguousItems"), false);
  assert.equal(extractionModule.includes("export async function extractItemsFromSource"), true);
  assert.equal(extractionModule.includes("export async function verifyItemsForSource"), true);
  assert.equal(extractionModule.includes("export async function adjudicateAmbiguousItems"), true);
});
