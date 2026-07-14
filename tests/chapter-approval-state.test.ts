import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("schema stores explicit chapter approval states and exact version pointers", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260713093000_chapter_approval_states/migration.sql");

  for (const status of [
    "DRAFT_PENDING",
    "DRAFT_APPROVED",
    "FINAL_REVISION_PENDING",
    "FINAL_REVISION_APPROVED",
    "STALE",
  ]) {
    assert.ok(schema.includes(status), `schema missing ${status}`);
    assert.ok(migration.includes(status), `migration missing ${status}`);
  }

  for (const field of [
    "draftPendingVersionId",
    "approvedDraftVersionId",
    "finalRevisionPendingVersionId",
    "approvedFinalVersionId",
  ]) {
    assert.ok(schema.includes(field), `schema missing ${field}`);
    assert.ok(migration.includes(`"${field}"`), `migration missing ${field}`);
  }

  assert.ok(schema.includes("@@unique([bookId, chapterId])"));
});

test("approval-state repository exposes one transition per required state", () => {
  const source = read("src/lib/repositories/chapter-approval-state.ts");

  for (const symbol of [
    "markDraftPending",
    "markDraftApproved",
    "markFinalRevisionPending",
    "markFinalRevisionApproved",
    "markChapterApprovalStale",
  ]) {
    assert.ok(source.includes(`export async function ${symbol}`), `missing ${symbol}`);
  }

  assert.ok(source.includes("ChapterApprovalStatus.DRAFT_PENDING"));
  assert.ok(source.includes("ChapterApprovalStatus.DRAFT_APPROVED"));
  assert.ok(source.includes("ChapterApprovalStatus.FINAL_REVISION_PENDING"));
  assert.ok(source.includes("ChapterApprovalStatus.FINAL_REVISION_APPROVED"));
  assert.ok(source.includes("ChapterApprovalStatus.STALE"));
});

test("chapter draft and final revision paths update approval states", () => {
  const requiredUsages: Record<string, string[]> = {
    "src/app/api/books/[slug]/chapter-draft/artifacts/route.ts": ["markDraftPending"],
    "src/lib/repositories/chapter-draft-artifacts.ts": ["markDraftPending", "markDraftApproved"],
    "src/app/api/books/[slug]/chapter-draft/approve-all/route.ts": ["markDraftApproved"],
    "src/app/api/books/[slug]/stage-artifacts/save-draft/route.ts": ["markDraftPending"],
    "src/app/api/books/[slug]/stage-artifacts/commit/route.ts": ["markDraftApproved"],
    "src/app/api/books/[slug]/editing/artifacts/route.ts": ["markFinalRevisionPending"],
    "src/lib/repositories/editing-artifacts.ts": ["markFinalRevisionPending"],
    "src/app/api/books/[slug]/editing/approve-all/route.ts": [
      "markFinalRevisionApproved",
      "markDraftApproved",
    ],
  };

  for (const [path, symbols] of Object.entries(requiredUsages)) {
    const source = read(path);
    for (const symbol of symbols) {
      assert.ok(source.includes(symbol), `${path} does not call ${symbol}`);
    }
  }
});

test("Chapter Draft page presents one-chapter draft approval with exact version pointers", () => {
  const workflow = read("src/lib/workflows/chapter-draft/workspace.ts");
  const support = read("src/lib/workflows/chapter-draft/workspace-support.ts");
  const page = read("src/app/books/[slug]/chapter-draft/page.tsx");

  assert.ok(workflow.includes("listChapterApprovalStates"));
  assert.ok(workflow.includes("approvalState"));
  assert.ok(support.includes("approvedDraftVersionId"));
  assert.ok(support.includes("draftPendingVersionId"));
  assert.ok(page.includes("Approve Chapter Draft"));
  assert.ok(page.includes("Author Approval"));
  assert.ok(page.includes("Pending draft version"));
  assert.ok(page.includes("Approved draft version"));
  assert.ok(page.includes("GHOSTWRITR stores the exact approved draft version ID."));
});
