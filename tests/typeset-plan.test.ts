import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildPrintStylesheet,
  buildTypesetLayoutManifest,
  buildTypesetInteriorHtml,
} from "../src/lib/manuscript-document";
import { normalizeTypesetPlan } from "../src/lib/typeset-plan";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const payload = {
  title: "The Test Book",
  subtitle: "A real subtitle",
  totalWords: 1200,
  chapterCount: 1,
  draftedChapterCount: 1,
  trimSize: "5.5 x 8.5 in",
  frontMatter: ["Title Page"],
  backMatter: ["Bibliography"],
  chapters: [
    {
      chapterKey: "chapter-1",
      chapterLabel: "Chapter 1: Begin",
      sectionTitle: "Part I",
      wordCount: 1200,
      reviewSummary: null,
      chapterText: "One paragraph.\n\nAnother paragraph.",
    },
  ],
};

test("Typeset plan normalizes KDP trim, margins, typography, numbering, image, and preflight settings", () => {
  const plan = normalizeTypesetPlan({
    title: "The Test Book",
    trimSize: "5.5 x 8.5 in",
    runningHeads: "Author / Test",
    frontMatter: ["Title Page"],
    backMatter: ["Bibliography"],
    estimatedBlankPages: 2,
  });

  assert.equal(plan.trim.key, "5.5x8.5");
  assert.equal(plan.trim.widthIn, 5.5);
  assert.equal(plan.trim.heightIn, 8.5);
  assert.equal(plan.margins.mirrored, true);
  assert.equal(plan.margins.gutterIn, 0.125);
  assert.equal(plan.typography.bodyFont, "Baskerville");
  assert.equal(plan.pageNumbering.frontMatterStyle, "roman");
  assert.equal(plan.pageNumbering.bodyStyle, "arabic");
  assert.equal(plan.headerFooter.differentOddEven, true);
  assert.equal(plan.imagePolicy.minDpi, 300);
  assert.ok(plan.preflightRequiredChecks.some((check) => check.includes("trim size")));
});

test("Typeset HTML, print CSS, and layout manifest consume the normalized plan", () => {
  const plan = normalizeTypesetPlan({
    title: payload.title,
    trimSize: payload.trimSize,
    frontMatter: payload.frontMatter,
    backMatter: payload.backMatter,
    estimatedBlankPages: 1,
  });
  const css = buildPrintStylesheet(plan);
  const manifest = buildTypesetLayoutManifest(payload, plan);
  const html = buildTypesetInteriorHtml(payload, plan);

  assert.ok(css.includes("size: 5.5in 8.5in"));
  assert.ok(css.includes("margin-left"));
  assert.ok(css.includes("Baskerville"));
  assert.equal(manifest.trim.widthIn, 5.5);
  assert.equal(manifest.margins.mirrored, true);
  assert.equal(manifest.imagePolicy.minDpi, 300);
  assert.ok(manifest.preflightRequiredChecks.length >= 5);
  assert.ok(html.includes("Margins: top"));
  assert.ok(html.includes("Page numbering: roman front matter, arabic body pages"));
});

test("Publish package route writes the canonical typeset plan and plan-derived preflight checks", () => {
  const route = read("src/app/api/books/[slug]/publish-package/route.ts");
  const manuscriptExport = read("src/lib/manuscript-export.ts");

  assert.ok(manuscriptExport.includes("normalizeTypesetPlan"));
  assert.ok(route.includes("typesetPlan: plan"));
  assert.ok(route.includes("typesettingPlan: plan"));
  assert.ok(route.includes("buildTypesetPreflightReport"));
  assert.ok(route.includes("trimSize: plan.trimSize"));
});
