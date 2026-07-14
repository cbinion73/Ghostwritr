import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("dependency invalidation supports chapter-scoped stale markers", () => {
  const source = read("src/lib/workflow-dependencies.ts");

  assert.ok(source.includes("type ChapterScopedInvalidationOptions"));
  assert.ok(source.includes("chapterIds?: string[]"));
  assert.ok(source.includes("markDownstreamChapterAssetsStale"));
  assert.ok(source.includes("markArtifactStaleInTransaction"));
  assert.ok(source.includes("markChapterApprovalStale"));
  assert.ok(source.includes('scope: isChapterScoped ? "chapter" : "stage"'));
  assert.ok(source.includes("affectedChapterIds"));
});

test("chapter-scoped invalidation preserves stage status and only stage-scoped invalidation blocks stages", () => {
  const source = read("src/lib/workflow-dependencies.ts");

  assert.ok(
    source.includes("status: !isChapterScoped && shouldBlock ? StageStatus.BLOCKED : stage.status"),
    "scoped invalidation must not block the whole downstream stage",
  );
  assert.ok(
    source.includes("Array.from(new Set([...existingAffectedChapterIds, ...affectedChapterIds]))"),
    "scoped invalidation should merge affected chapter IDs instead of overwriting them",
  );
});

test("clearing stale dependencies can clear only refreshed chapters", () => {
  const source = read("src/lib/workflow-dependencies.ts");

  assert.ok(source.includes("clearChapterStaleMarkers"));
  assert.ok(source.includes("readAffectedChapterIds"));
  assert.ok(source.includes("remaining.length > 0"));
  assert.ok(source.includes("delete metadata.staleDependency"));
});

test("single-chapter workflows pass chapter IDs into clear and invalidate calls", () => {
  const required: Record<string, string[]> = {
    "src/lib/workflows/research/commit.ts": [
      "clearStageStaleDependency(bookSlug, StageKey.RESEARCH, { chapterIds: [chapterKey] })",
      "invalidateDependentStagesForBook(bookSlug, StageKey.RESEARCH, { chapterIds: [chapterKey] })",
      "invalidateDependentStagesForBook(bookSlug, StageKey.RESEARCH, { chapterIds: committedChapterKeys })",
    ],
    "src/lib/workflows/external-stories.ts": [
      "clearStageStaleDependency(bookSlug, StageKey.EXTERNAL_STORIES, { chapterIds: [chapterKey] })",
      "invalidateDependentStagesForBook(bookSlug, StageKey.EXTERNAL_STORIES, { chapterIds: [chapterKey] })",
      "invalidateDependentStagesForBook(bookSlug, StageKey.EXTERNAL_STORIES, { chapterIds: committedChapterKeys })",
    ],
    "src/lib/workflows/chapter-draft/commit.ts": [
      "clearStageStaleDependency(bookSlug, StageKey.CHAPTER_DRAFT, { chapterIds: [chapterKey] })",
      "invalidateDependentStagesForBook(bookSlug, StageKey.CHAPTER_DRAFT, { chapterIds: [chapterKey] })",
      "invalidateDependentStagesForBook(bookSlug, StageKey.CHAPTER_DRAFT, { chapterIds: committedChapterKeys })",
    ],
    "src/app/books/[slug]/outline/actions.ts": [
      "invalidateDependentStagesForBook(slug, StageKey.OUTLINE, {",
      "chapterIds: [chapter.id]",
      'reason: `Paragraph-level outline changed for chapter "${chapter.title}".`',
    ],
  };

  for (const [path, snippets] of Object.entries(required)) {
    const source = read(path);
    for (const snippet of snippets) {
      assert.ok(source.includes(snippet), `${path} missing scoped call: ${snippet}`);
    }
  }
});
