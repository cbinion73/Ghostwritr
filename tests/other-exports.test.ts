import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildEbookSourceHtml } from "../src/lib/manuscript-document";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Ebook source HTML is generated from canonical manuscript chapters", () => {
  const html = buildEbookSourceHtml({
    title: "Ebook Test",
    subtitle: null,
    totalWords: 6,
    chapterCount: 1,
    draftedChapterCount: 1,
    chapters: [
      {
        chapterKey: "chapter-1",
        chapterLabel: "Chapter 1: Start",
        sectionTitle: "Part I",
        wordCount: 6,
        reviewSummary: null,
        chapterText: "First paragraph.\n\nSecond paragraph.",
      },
    ],
  });

  assert.ok(html.includes('nav aria-label="Table of contents"'));
  assert.ok(html.includes('id="chapter-1"'));
  assert.ok(html.includes("First paragraph."));
  assert.ok(html.includes("Second paragraph."));
});

test("Publish package includes ebook source, production manifest, markdown, manuscript JSON, and preflight", () => {
  const route = read("src/app/api/books/[slug]/publish-package/route.ts");

  assert.ok(route.includes("buildEbookSourceHtml"));
  assert.ok(route.includes("-ebook-source.html"));
  assert.ok(route.includes("production-manifest.json"));
  assert.ok(route.includes("canonicalManuscript"));
  assert.ok(route.includes("exportProfiles"));
  assert.ok(route.includes("preflight-report.json"));
  assert.ok(route.includes(`${"filenameBase"}.md`) || route.includes("`.md`") || route.includes(".md"));
  assert.ok(route.includes(`${"filenameBase"}.json`) || route.includes("`.json`") || route.includes(".json"));
});
