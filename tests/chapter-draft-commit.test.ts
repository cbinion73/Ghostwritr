import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Chapter Draft commit helpers are owned by the commit module", () => {
  const monolith = readFileSync("src/lib/workflows/chapter-draft.ts", "utf8");
  const commit = readFileSync("src/lib/workflows/chapter-draft/commit.ts", "utf8");
  const repair = readFileSync("src/lib/workflows/chapter-draft/repair.ts", "utf8");
  const publicEntrypoint = readFileSync("src/lib/workflows/chapter-draft-public.ts", "utf8");

  assert.match(commit, /export async function commitChapterDraftWorkflow/);
  assert.match(commit, /export async function commitAllChapterDraftsWorkflow/);
  assert.match(commit, /commitChapterDraft\(/);
  assert.match(commit, /clearStageStaleDependency\(bookSlug, StageKey\.CHAPTER_DRAFT, { chapterIds: \[chapterKey\] }\)/);
  assert.match(commit, /invalidateDependentStagesForBook\(bookSlug, StageKey\.CHAPTER_DRAFT, { chapterIds: \[chapterKey\] }\)/);
  assert.match(commit, /invalidateDependentStagesForBook\(bookSlug, StageKey\.CHAPTER_DRAFT, { chapterIds: committedChapterKeys }\)/);

  assert.equal(monolith.includes("export async function commitChapterDraftWorkflow"), false);
  assert.equal(monolith.includes("export async function commitAllChapterDraftsWorkflow"), false);
  assert.match(monolith, /from "\.\/chapter-draft\/commit"/);
  assert.match(repair, /from "\.\/commit"/);
  assert.match(publicEntrypoint, /from "\.\/chapter-draft\/commit"/);
});
