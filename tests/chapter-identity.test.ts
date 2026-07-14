import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Artifact has a stable chapterId column and migration enforces canonical uniqueness", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260713081500_stable_chapter_identity/migration.sql");

  assert.ok(schema.includes("chapterId          String?"));
  assert.ok(schema.includes("@@index([bookId, stageId, artifactType, chapterId]"));
  assert.ok(migration.includes('ADD COLUMN "chapterId"'));
  assert.ok(migration.includes('CREATE UNIQUE INDEX "Artifact_book_stage_type_chapterId_unique"'));
  assert.ok(migration.includes('WHERE "chapterId" IS NOT NULL'));
});

test("chapter identity helper preserves legacy metadata while exposing column-first lookup", () => {
  const helper = read("src/lib/repositories/chapter-identity.ts");

  assert.ok(helper.includes("CHAPTER_SCOPED_ARTIFACT_TYPES"));
  assert.ok(helper.includes("{ chapterId }"));
  assert.ok(helper.includes('metadataJson: { path: ["chapterId"], equals: chapterId }'));
  assert.ok(helper.includes('metadataJson: { path: ["chapterKey"], equals: chapterId }'));
  assert.ok(helper.includes("chapterKey: chapterId"));
});

test("chapter-scoped artifact writers set chapterId instead of relying only on title or metadata", () => {
  for (const path of [
    "src/lib/repositories/chapter-draft-artifacts.ts",
    "src/lib/repositories/research-artifacts.ts",
    "src/lib/repositories/external-stories-artifacts.ts",
    "src/lib/repositories/editing-artifacts.ts",
    "src/lib/repositories/chapter-paragraph-artifacts.ts",
    "src/app/api/books/[slug]/agent-chat/chapter-draft/route.ts",
    "src/app/api/books/[slug]/scout-research/save-chapter/route.ts",
    "src/app/api/books/[slug]/chronicle-stories/save-chapter/route.ts",
    "src/app/api/books/[slug]/agent-chat/editing/route.ts",
  ]) {
    const source = read(path);
    assert.ok(source.includes("chapterId:"), `${path} does not set chapterId`);
  }
});

test("assembly and context readers use stable identity helpers", () => {
  for (const path of [
    "src/lib/workflows/publish-pipeline.ts",
    "src/lib/repositories/structured-dossiers.ts",
    "src/lib/repositories/chapter-linked-notes.ts",
  ]) {
    const source = read(path);
    assert.match(source, /getArtifactChapterId|chapterIdentityWhere/, `${path} does not use stable chapter identity`);
  }
});
