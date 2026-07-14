import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Editing assembly consumes exact approved Quill draft versions", () => {
  const source = read("src/lib/workflows/editing/chapter-loader.ts");
  const support = read("src/lib/workflows/editing/revision-support.ts");

  assert.ok(source.includes("listChapterApprovalStates"));
  assert.ok(source.includes("approvedDraftVersionId"));
  assert.ok(source.includes("Every chapter must have a current approved Quill draft before Editing can begin."));
  assert.ok(source.includes("getEditingArtifactVersionById(approvalState.approvedDraftVersionId)"));
  assert.ok(source.includes("approvedDraftVersionId: approvalState.approvedDraftVersionId"));
  assert.ok(support.includes("chapter.approvedDraftVersionId ?? \"unapproved\""));
});

test("Book-wide assessment has explicit analytical categories and no rewrite instruction", () => {
  const source = read("src/lib/workflows/editing/assessment.ts");
  const support = read("src/lib/workflows/editing/revision-support.ts");
  const types = read("src/lib/editing-types.ts");

  for (const category of [
    "duplication",
    "continuity",
    "structure",
    "voice",
    "aiArtifacts",
    "terminology",
    "citations",
    "preservation",
    "chapterInstructions",
  ]) {
    assert.ok(source.includes(category) || support.includes(category), `editing workflow missing ${category}`);
    assert.ok(types.includes(category), `editing types missing ${category}`);
  }

  assert.ok(source.includes("buildBookWideEditorialFindings"));
  assert.ok(support.includes("normalizeBookWideEditorialFindings"));
  assert.ok(source.includes("Do not rewrite prose in this pass."));
  assert.ok(source.includes("bookWideFindings"));
});

test("Opus final revision path is constrained by approved drafts and assessment instructions", () => {
  const source = read("src/lib/workflows/editing/revision.ts");
  const support = read("src/lib/workflows/editing/revision-support.ts");
  const types = read("src/lib/editing-types.ts");

  assert.ok(source.includes("buildFinalRevisionInstructions"));
  assert.ok(support.includes("Use approved Quill draft version"));
  assert.ok(support.includes("Preserve paragraph anchor"));
  assert.ok(source.includes("latestAssessment"));
  assert.ok(source.includes("finalRevisionInstructions"));
  assert.ok(source.includes("combined editorial revision and final polish pass"));
  assert.ok(source.includes("Obey finalRevisionInstructions"));
  assert.ok(source.includes("approvedDraftVersionId: original.approvedDraftVersionId"));
  assert.ok(source.includes("modelName: model ? \"final-editor:polish\" : \"deterministic-fallback\""));
  assert.ok(types.includes("approvedDraftVersionId?: string | null"));
  assert.ok(types.includes("assessmentInstructions?: string[]"));
});

test("Final revision approval stores exact approved final version and shows review guardrails", () => {
  const workflow = read("src/lib/workflows/editing/revision.ts");
  const row = read("src/app/books/[slug]/editing/chapter-revision-row.tsx");
  const detail = read("src/app/books/[slug]/editing/editing-detail-content.tsx");

  assert.ok(workflow.includes("markFinalRevisionApproved"));
  assert.ok(workflow.includes("versionId: revisionVersionId"));
  assert.ok(row.includes("Approve Final Revision"));
  assert.ok(row.includes("Approved Quill draft"));
  assert.ok(row.includes("Revision guardrails"));
  assert.ok(row.includes("Before"));
  assert.ok(row.includes("After"));
  assert.ok(detail.includes("assessmentInstructions={changed?.assessmentInstructions ?? []}"));
  assert.ok(detail.includes("approvedDraftVersionId={changed?.approvedDraftVersionId ?? chapter.approvedDraftVersionId ?? null}"));
});
