import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Chapter Draft workspace orchestration is owned by the workspace module", () => {
  const monolith = readFileSync("src/lib/workflows/chapter-draft.ts", "utf8");
  const workspace = readFileSync("src/lib/workflows/chapter-draft/workspace.ts", "utf8");
  const publicEntrypoint = readFileSync("src/lib/workflows/chapter-draft-public.ts", "utf8");

  assert.equal(monolith.includes("export async function getChapterDraftWorkspace"), false);
  assert.equal(workspace.includes("export async function getChapterDraftWorkspace"), true);
  assert.equal(workspace.includes("from \"../chapter-draft\""), false);
  assert.match(workspace, /getDraftInputs\(/);
  assert.match(workspace, /buildChapterWordTargets\(/);
  assert.match(workspace, /summarizeQuillContextForAuthor\(/);
  assert.match(publicEntrypoint, /from "\.\/chapter-draft\/workspace"/);
});
