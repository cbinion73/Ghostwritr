import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Bibliography generation is deterministic and uses approved final chapter source traces", () => {
  const source = read("src/lib/workflows/bibliography-generator.ts");

  assert.ok(source.includes("ChapterApprovalStatus.FINAL_REVISION_APPROVED"));
  assert.ok(source.includes("approvedFinalVersionId"));
  assert.ok(source.includes("approvedDraftVersionId"));
  assert.ok(source.includes("sourceUsage"));
  assert.ok(source.includes("researchItemIds"));
  assert.ok(source.includes("externalStoryItemIds"));
  assert.ok(source.includes("db.researchItem.findMany"));
  assert.ok(source.includes("db.externalStoryItem.findMany"));
  assert.ok(source.includes("incompleteCitations"));
  assert.ok(!source.includes("acquireLLMCallForRole"));
  assert.ok(!source.includes("model.stream"));
  assert.ok(!source.includes("HumanMessage"));
});

test("Publish package includes bibliography outputs and preflight citation gaps", () => {
  const route = read("src/app/api/books/[slug]/publish-package/route.ts");

  assert.ok(route.includes("generateBibliography"));
  assert.ok(route.includes("bibliography.html"));
  assert.ok(route.includes("bibliography-report.json"));
  assert.ok(route.includes("incompleteCitationCount"));
  assert.ok(route.includes("incompleteCitations"));
});
