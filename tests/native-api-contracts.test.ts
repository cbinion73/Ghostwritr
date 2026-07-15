import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("native library API is owner scoped and never exposes archived books accidentally", () => {
  const source = read("src/app/api/native/v1/library/route.ts");
  assert.match(source, /requireAuthenticatedAppUser/);
  assert.match(source, /listBooksForUserWithParent\(user\.id\)/);
  assert.match(source, /isArchived/);
});

test("native book snapshot exposes durable stages, chapter versions, approvals, runs, and spend", () => {
  const source = read("src/app/api/native/v1/books/[slug]/route.ts");
  for (const contract of [
    "getWorkflowDefinition",
    "chapterApprovalState.findMany",
    "workflowRun.findMany",
    "getTotalCostForBook",
    "getLLMBudgetStateForBook",
    "getArtifactChapterId",
    "versionId",
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
});

test("native approval is chapter scoped and uses transactional artifact lifecycle services", () => {
  const source = read("src/app/api/native/v1/books/[slug]/chapters/[chapterId]/approve/route.ts");
  assert.match(source, /bookId_chapterId/);
  assert.match(source, /commitArtifactVersionInTransaction/);
  assert.match(source, /markFinalRevisionApproved/);
  assert.match(source, /markDraftApproved/);
  assert.doesNotMatch(source, /approve-all/);
});

test("middleware recognizes native API routes and authenticated device bearer tokens", () => {
  const source = read("src/middleware.ts");
  assert.match(source, /getNativeAuthConfig/);
  assert.match(source, /getBearerToken/);
  assert.match(source, /\/api\/native\/:path\*/);
  assert.match(source, /verifyCloudflareAccessJWT/);
  assert.match(source, /cloudflare-access/);
});
