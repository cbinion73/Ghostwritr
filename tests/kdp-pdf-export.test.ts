import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildKdpPdfFromHtml } from "../src/lib/kdp-pdf-export";
import { buildPrintStylesheet } from "../src/lib/manuscript-document";
import { normalizeTypesetPlan } from "../src/lib/typeset-plan";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("KDP PDF export renders local typeset HTML with the canonical plan", async () => {
  const plan = normalizeTypesetPlan({ title: "PDF Test", trimSize: "5 x 8 in" });
  const html = `<!doctype html><html><head><style>${buildPrintStylesheet(plan)}</style></head><body><main class="book"><section class="title-page"><h1>PDF Test</h1></section></main></body></html>`;
  const pdf = await buildKdpPdfFromHtml(html, plan);

  assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
  assert.ok(pdf.length > 1000);
});

test("Publish package includes the print PDF generated from the typeset interior", () => {
  const route = read("src/app/api/books/[slug]/publish-package/route.ts");

  assert.ok(route.includes("buildKdpPdfFromHtml"));
  assert.ok(route.includes("const pdf = await buildKdpPdfFromHtml(interiorHtml, plan);"));
  assert.ok(route.includes(`${"filenameBase"}-print.pdf`) || route.includes("-print.pdf"));
});
