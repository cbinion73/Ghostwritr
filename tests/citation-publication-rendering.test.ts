import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { buildEbookSourceHtml, buildManuscriptHtml, buildManuscriptMarkdown, buildTypesetInteriorHtml } from "../src/lib/manuscript-document";
import { buildKdpDocx } from "../src/lib/kdp-docx-export";
import { buildKdpPdfFromHtml } from "../src/lib/kdp-pdf-export";
import { normalizeTypesetPlan } from "../src/lib/typeset-plan";
import { formatLockedCitation } from "../src/lib/workflows/bibliography-generator";
import { buildPublicationProofMetadata, PROOF_ONLY_NOTICE } from "../src/lib/publication-citation-gate";

const citation = formatLockedCitation({ sourceRecordId: "source-1", evidenceKeys: ["r:1"], title: "Verified Source", author: "Ada Author", publisher: "Truth Press", publishedAt: "2024-01-01", accessedAt: "2026-07-14", url: "https://example.test/source", chapters: ["chapter-1"] }, "CHICAGO_17");
const payload = { title: "Book", totalWords: 4, chapterCount: 1, draftedChapterCount: 1, bibliography: [citation], proofNotice: "PROOF ONLY — CITATION AUDIT INCOMPLETE — NOT FOR PUBLICATION", chapters: [{ chapterKey: "chapter-1", chapterLabel: "Chapter 1", sectionTitle: "Part I", wordCount: 4, chapterText: "A short chapter." }] };

test("reader formats contain the identical locked bibliography and proof mark", () => {
  for (const output of [buildManuscriptMarkdown(payload), buildManuscriptHtml(payload), buildEbookSourceHtml(payload), buildTypesetInteriorHtml(payload)]) {
    assert.ok(output.includes("Bibliography")); assert.ok(output.includes("Verified Source")); assert.ok(output.includes("PROOF ONLY"));
  }
});

test("proof metadata marks every structured publication output not print or ebook ready", () => {
  const metadata = buildPublicationProofMetadata({ ready: false, proofOnly: true, proofNotice: PROOF_ONLY_NOTICE, citationStyle: "CHICAGO_17", ledgerFingerprint: null, bibliography: [] });
  assert.deepEqual(metadata, { proofOnly: true, proofNotice: PROOF_ONLY_NOTICE, printReady: false, ebookReady: false, citationLedgerFingerprint: null, citationStyle: "CHICAGO_17", bibliography: [] });
});

test("KDP DOCX XML contains the identical bibliography and proof mark", async () => {
  const docx = await buildKdpDocx({ title: payload.title, typesetContent: "", chapters: payload.chapters.map((chapter) => ({ title: chapter.chapterLabel, body: chapter.chapterText })), bibliography: [citation], proofNotice: payload.proofNotice });
  const dir = mkdtempSync(join(tmpdir(), "ghostwritr-citation-docx-"));
  try { const file = join(dir, "book.docx"); writeFileSync(file, docx); const xml = execFileSync("unzip", ["-p", file, "word/document.xml"], { encoding: "utf8" }); assert.ok(xml.includes("Bibliography")); assert.ok(xml.includes("Verified Source")); assert.ok(xml.includes("PROOF ONLY")); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("generated DOCX and PDF expose the same locked reader bibliography", async () => {
  const docx = await buildKdpDocx({
    title: payload.title,
    typesetContent: "",
    chapters: payload.chapters.map((chapter) => ({ title: chapter.chapterLabel, body: chapter.chapterText })),
    bibliography: [citation],
  });
  const docxDir = mkdtempSync(join(tmpdir(), "ghostwritr-citation-parity-"));
  try {
    const file = join(docxDir, "book.docx");
    writeFileSync(file, docx);
    const docxXml = execFileSync("unzip", ["-p", file, "word/document.xml"], { encoding: "utf8" });
    const interior = buildTypesetInteriorHtml({ ...payload, proofNotice: null }, normalizeTypesetPlan({ title: payload.title, trimSize: "5 x 8 in" }));
    const pdf = await buildKdpPdfFromHtml(interior, { title: payload.title, trimSize: "5 x 8 in" });
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(pdf) });
    try {
      const pdfText = (await parser.getText()).text;
      for (const literal of ["Bibliography", "Verified Source", "Ada Author", "Truth Press"]) {
        assert.ok(docxXml.includes(literal), `DOCX missing ${literal}`);
        assert.ok(pdfText.includes(literal), `PDF missing ${literal}`);
      }
    } finally {
      await parser.destroy();
    }
  } finally {
    rmSync(docxDir, { recursive: true, force: true });
  }
});

test("all final export routes use the shared publication gate and explicit proof mode", () => {
  for (const path of ["src/app/api/books/[slug]/publish-package/route.ts", "src/app/api/books/[slug]/manuscript-export/route.ts", "src/app/api/books/[slug]/workspace-export/route.ts"]) {
    const source = readFileSync(path, "utf8"); assert.ok(source.includes("requirePublicationCitationReady"), path); assert.ok(source.includes('searchParams.get("mode") === "proof"'), path);
  }
});
