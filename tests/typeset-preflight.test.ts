import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildTypesetPreflightReport } from "../src/lib/typeset-preflight";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const payload = {
  title: "Preflight Book",
  subtitle: null,
  totalWords: 1000,
  chapterCount: 1,
  draftedChapterCount: 1,
  trimSize: "6 x 9 in",
  frontMatter: ["Title Page"],
  backMatter: ["Bibliography"],
  chapters: [
    {
      chapterKey: "chapter-1",
      chapterLabel: "Chapter 1: Start",
      sectionTitle: "Part I",
      wordCount: 1000,
      reviewSummary: null,
      chapterText: "Text",
    },
  ],
};

test("Typeset preflight reports KDP-critical pass, warn, and fail checks", () => {
  const report = buildTypesetPreflightReport({
    payload,
    plan: {
      title: payload.title,
      trimSize: "6 x 9 in",
      frontMatter: payload.frontMatter,
      backMatter: payload.backMatter,
      estimatedTotalPages: 31,
      estimatedBlankPages: 1,
      signaturePageMultiple: 16,
    },
    bibliography: {
      generatedAt: new Date().toISOString(),
      citations: [],
      sourceCount: 0,
      incompleteCitations: [],
    },
    interiorHtml: "<html><body><p>No images</p></body></html>",
    includedFiles: [
      "book.docx",
      "book-print.pdf",
      "book.html",
      "book-print.css",
      "layout-manifest.json",
    ],
    pdfRendered: true,
  });

  assert.equal(report.status, "pass");
  assert.ok(report.checks.some((item) => item.name === "Final chapter approvals" && item.status === "pass"));
  assert.ok(report.checks.some((item) => item.name === "Mirrored margins and gutter" && item.status === "pass"));
  assert.ok(report.checks.some((item) => item.name === "PDF renderer" && item.status === "pass"));
});

test("Typeset preflight fails missing final chapters and missing PDF renderer", () => {
  const report = buildTypesetPreflightReport({
    payload: { ...payload, draftedChapterCount: 0 },
    plan: { title: payload.title, trimSize: "6 x 9 in" },
    bibliography: {
      generatedAt: new Date().toISOString(),
      citations: [],
      sourceCount: 0,
      incompleteCitations: [{ severity: "fail", chapterKey: "chapter-1", chapterLabel: "Chapter 1", detail: "missing" }],
    },
    interiorHtml: '<html><body><img src="x.png"></body></html>',
    includedFiles: ["book.docx"],
    pdfRendered: false,
  });

  assert.equal(report.status, "fail");
  assert.ok(report.checks.some((item) => item.name === "Final chapter approvals" && item.status === "fail"));
  assert.ok(report.checks.some((item) => item.name === "Bibliography gaps" && item.status === "fail"));
  assert.ok(report.checks.some((item) => item.name === "PDF renderer" && item.status === "fail"));
  assert.ok(report.checks.some((item) => item.name === "Image alt text" && item.status === "warn"));
});

test("Publish package writes the canonical typeset preflight report", () => {
  const route = read("src/app/api/books/[slug]/publish-package/route.ts");

  assert.ok(route.includes("buildTypesetPreflightReport"));
  assert.ok(route.includes("const includedFiles = ["));
  assert.ok(route.includes("preflightReport.status"));
  assert.ok(route.includes("preflightReport.checks"));
});
