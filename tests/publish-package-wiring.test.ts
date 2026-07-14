import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Publish package derives all print artifacts from the same canonical manuscript and typeset plan", () => {
  const route = read("src/app/api/books/[slug]/publish-package/route.ts");

  assert.ok(route.includes("const payload = await buildManuscriptExportPayload(slug);"));
  assert.ok(route.includes("const { plan } = await buildTypesetPlanInput(slug);"));
  assert.ok(route.includes("const interiorHtml = buildTypesetInteriorHtml(payload, plan);"));
  assert.ok(route.includes("const printCss = buildPrintStylesheet(plan);"));
  assert.ok(route.includes("const layoutManifest = buildTypesetLayoutManifest(payload, plan);"));
  assert.ok(route.includes("const bibliography = await generateBibliography(book.id, payload.title);"));
  assert.ok(route.includes("typesetPlan: plan"));
  assert.ok(route.includes("typesettingPlan: plan"));
  assert.ok(route.includes("buildKdpDocx({"));
  assert.ok(route.includes("typesetPlan: plan"));
  assert.ok(route.includes("buildKdpPdfFromHtml(interiorHtml, plan)"));
  assert.ok(route.includes("buildTypesetPreflightReport({"));
});

test("Publish package includes all KDP package artifacts in the manifest", () => {
  const route = read("src/app/api/books/[slug]/publish-package/route.ts");

  for (const expected of [
    ".docx",
    ".html",
    "-interior.html",
    "-print.css",
    "layout-manifest.json",
    "cover-brief.json",
    "distribution-manifest.json",
    ".md",
    ".json",
    "-print.pdf",
    "bibliography.html",
    "bibliography-report.json",
    "preflight-report.json",
  ]) {
    assert.ok(route.includes(expected), `missing ${expected}`);
  }
});
