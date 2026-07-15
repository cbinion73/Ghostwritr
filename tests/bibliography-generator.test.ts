import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Bibliography generation is deterministic and uses only the immutable approved citation ledger", () => {
  const source = read("src/lib/workflows/bibliography-generator.ts");

  assert.ok(source.includes("getCurrentLockedCitationLedger"));
  assert.ok(source.includes("ledger.entriesJson"));
  assert.ok(source.includes("ledger.citationStyle"));
  assert.ok(source.includes("ledger.ledgerFingerprint"));
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
