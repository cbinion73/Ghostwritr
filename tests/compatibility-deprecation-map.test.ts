import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { COMPATIBILITY_SEAMS } from "../src/lib/compatibility/deprecation-map";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function listFiles(path: string): string[] {
  return readdirSync(join(root, path)).flatMap((entry) => {
    const child = `${path}/${entry}`;
    return statSync(join(root, child)).isDirectory() ? listFiles(child) : [child];
  });
}

test("compatibility seams have unique ids and explicit retirement conditions", () => {
  assert.equal(new Set(COMPATIBILITY_SEAMS.map((seam) => seam.id)).size, COMPATIBILITY_SEAMS.length);
  for (const seam of COMPATIBILITY_SEAMS) {
    assert.ok(seam.legacyPath.length > 0);
    assert.ok(seam.canonicalOwner.length > 0);
    assert.ok(seam.retirementCondition.length > 20);
  }
});

test("deprecated Chapter Draft routes are transport-only aliases", () => {
  const artifactAlias = read("src/app/api/books/[slug]/agent-chat/chapter-draft/route.ts");
  const approveAlias = read("src/app/api/books/[slug]/agent-chat/chapter-draft/approve-all/route.ts");

  assert.match(artifactAlias, /export \{ GET, PATCH, POST \}/);
  assert.match(approveAlias, /export \{ POST \}/);
  for (const source of [artifactAlias, approveAlias]) {
    assert.doesNotMatch(source, /\bdb\./);
    assert.doesNotMatch(source, /NextResponse/);
    assert.doesNotMatch(source, /export async function/);
  }
});

test("every non-history agent-chat lifecycle route is a mapped transport-only alias", () => {
  const aliases = COMPATIBILITY_SEAMS.filter((seam) => seam.kind === "route-alias");
  const mappedFiles = new Set(aliases.map((seam) => `src/app${seam.legacyPath.replace("/api", "/api")}/route.ts`));
  const discovered = listFiles("src/app/api/books/[slug]/agent-chat")
    .filter((path) => path.endsWith("/route.ts"))
    .filter((path) => path !== "src/app/api/books/[slug]/agent-chat/route.ts")
    .filter((path) => path !== "src/app/api/books/[slug]/agent-chat/history/route.ts");

  assert.deepEqual(discovered.filter((path) => !mappedFiles.has(path)), []);
  for (const path of discovered) {
    const source = read(path);
    assert.ok(source.split("\n").length <= 6, `${path} is not a thin alias`);
    assert.doesNotMatch(source, /\bdb\.|NextResponse|export async function/);
  }
});

test("active UI does not call deprecated agent-chat lifecycle aliases", () => {
  const uiSource = listFiles("src/app/books")
    .filter((path) => path.endsWith(".tsx"))
    .map(read)
    .join("\n");

  for (const seam of COMPATIBILITY_SEAMS.filter((entry) => entry.kind === "route-alias")) {
    const suffix = seam.legacyPath.split("[slug]")[1];
    assert.equal(uiSource.includes(suffix), false, `active UI still calls ${seam.legacyPath}`);
  }
});
