import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Final production export assembles nonfiction from exact approved Opus revisions", () => {
  const source = read("src/lib/manuscript-export.ts");

  assert.ok(source.includes("listChapterApprovalStates"));
  assert.ok(source.includes("ChapterApprovalStatus.FINAL_REVISION_APPROVED"));
  assert.ok(source.includes("approvedFinalVersionId"));
  assert.ok(source.includes("ArtifactType.MANUSCRIPT_REVISION"));
  assert.ok(source.includes("StageKey.EDITING"));
  assert.ok(source.includes("FinalManuscriptRevisionSchema"));
  assert.ok(source.includes("candidate.chapterKey === chapter.chapterId"));
  assert.ok(source.includes("changedChapter.revisedText"));
});

test("Final production export fails on missing, stale, unordered, or unapproved chapters", () => {
  const source = read("src/lib/manuscript-export.ts");

  assert.ok(source.includes("Approved paragraph-level Outline is required before final manuscript export."));
  assert.ok(source.includes("approved chapters outside the approved outline order"));
  assert.ok(source.includes("requires an approved final Opus revision for every chapter"));
  assert.ok(source.includes("has a stale final approval"));
  assert.ok(source.includes("could not load the approved final Opus revision"));
  assert.ok(source.includes("found no revised text"));
  assert.ok(!source.includes("No committed chapter drafts exist yet. Commit at least one chapter before exporting the manuscript."));
  assert.ok(!source.includes("getChapterArtifactVersions(book.id, chapter.chapterId, ArtifactType.CHAPTER_DRAFT"));
});
