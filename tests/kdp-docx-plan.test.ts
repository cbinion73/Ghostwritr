import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("KDP DOCX builder consumes the canonical typeset plan for print layout", () => {
  const source = read("src/lib/kdp-docx-export.ts");

  assert.ok(source.includes("typesetPlan?: TypesetPlanInput"));
  assert.ok(source.includes("normalizeTypesetPlan"));
  assert.ok(source.includes("planToDesignSpec"));
  assert.ok(source.includes("margin: { top: M_TOP, bottom: M_BOT, left: M_IN, right: M_OUT, gutter: M_GUT }"));
  assert.ok(source.includes("new Header"));
  assert.ok(source.includes("plan.runningHeads"));
  assert.ok(source.includes("if (!plan.tocIncluded) return []"));
});

test("DOCX export routes pass the canonical typeset plan instead of using generic HTML conversion", () => {
  const publishRoute = read("src/app/api/books/[slug]/publish-package/route.ts");
  const workspaceRoute = read("src/app/api/books/[slug]/workspace-export/route.ts");

  assert.ok(publishRoute.includes("buildKdpDocx"));
  assert.ok(publishRoute.includes("typesetPlan: plan"));
  assert.ok(!publishRoute.includes("convertHtmlToDocx"));
  assert.ok(workspaceRoute.includes("buildTypesetPlanInput"));
  assert.ok(workspaceRoute.includes("typesetPlan: plan"));
});
