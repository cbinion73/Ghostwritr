import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildAudiobookPackageMarkdown, buildAudiobookProductionPackage } from "../src/lib/audiobook-package";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const payload = {
  title: "Audio Test",
  subtitle: "Production notes",
  totalWords: 9000,
  chapterCount: 1,
  draftedChapterCount: 1,
  chapters: [
    {
      chapterKey: "chapter-1",
      chapterLabel: "Chapter 1: NASA and Trust",
      sectionTitle: "Part I",
      wordCount: 9000,
      reviewSummary: "Protect the story's quiet tone.",
      chapterText: 'NASA taught Alice Smith one thing: "Trust is heard before it is believed."',
    },
  ],
};

test("Audiobook package generates narrator, pacing, pronunciation, chapter, quote, sensitive, and production instructions", () => {
  const pkg = buildAudiobookProductionPackage(payload, {
    voiceTone: "warm and direct",
    readerLevel: "professional",
  });

  assert.equal(pkg.estimatedRuntime.display, "1 hr 0 min");
  assert.equal(pkg.narratorDirection.tone, "warm and direct");
  assert.ok(pkg.narratorDirection.pacing.includes("Measured"));
  assert.ok(pkg.pronunciationGuide.acronyms.includes("NASA"));
  assert.ok(pkg.pronunciationGuide.termsForReview.includes("Alice Smith"));
  assert.equal(pkg.chapterBreaks[0]?.chapterKey, "chapter-1");
  assert.ok(pkg.quoteAndTableInstructions.some((item) => item.includes("Quotes are present")));
  assert.ok(pkg.sensitivePassageInstructions.length > 0);
  assert.ok(pkg.productionInstructions.some((item) => item.includes("external AI audiobook agent")));
});

test("Audiobook markdown is handoff-ready and publish package includes it without synthesized audio", () => {
  const pkg = buildAudiobookProductionPackage(payload, {});
  const markdown = buildAudiobookPackageMarkdown(pkg);
  const route = read("src/app/api/books/[slug]/publish-package/route.ts");

  assert.ok(markdown.includes("Audiobook Production Package"));
  assert.ok(markdown.includes("Narrator Direction"));
  assert.ok(markdown.includes("Chapter Recording Notes"));
  assert.ok(route.includes("buildAudiobookProductionPackage"));
  assert.ok(route.includes("audiobook-production-package.json"));
  assert.ok(route.includes("audiobook-production-package.md"));
  assert.ok(route.includes("synthesizedAudioIncluded: false"));
});
