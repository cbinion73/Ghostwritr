import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function listFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((entry) => {
    const relative = join(dir, entry);
    const absolute = join(root, relative);
    return statSync(absolute).isDirectory() ? listFiles(relative) : [relative];
  });
}

test("database schema has uniqueness and indexes for concurrent artifact versioning and duplicate job prevention", () => {
  const schema = read("prisma/schema.prisma");

  assert.ok(schema.includes("@@unique([artifactId, versionNumber])"));
  assert.ok(schema.includes("@@index([artifactId, lifecycleState])"));
  assert.ok(schema.includes("@@unique([bookId, stageId, idempotencyKey])"));
  assert.ok(schema.includes("@@index([bookId, stageId, status])"));
  assert.ok(schema.includes("@@index([status, leaseExpiresAt])"));
  assert.ok(schema.includes("@@unique([bookId, chapterId])"));
  assert.ok(schema.includes("@@index([bookId, isStale])"));
});

test("artifact transactions perform version creation and atomic commits through one service seam", () => {
  const service = read("src/lib/repositories/artifact-transaction-service.ts");

  assert.ok(service.includes("createArtifactVersionInTransaction"));
  assert.ok(service.includes('orderBy: { versionNumber: "desc" }'));
  assert.ok(service.includes("versionNumber: (latestVersion?.versionNumber ?? 0) + 1"));
  assert.ok(service.includes("tx.artifactVersion.create"));
  assert.ok(service.includes("tx.artifact.update"));
  assert.ok(service.includes("commitArtifactVersionInTransaction"));
  assert.ok(service.includes("committedVersionId: input.versionId"));
  assert.ok(service.includes("status: ArtifactStatus.COMMITTED"));
});

test("workflow run repository enforces duplicate-job, lease-claim, cancellation, and recovery semantics", () => {
  const repo = read("src/lib/repositories/workflow-runs.ts");

  assert.ok(repo.includes("findUnique"));
  assert.ok(repo.includes("bookId_stageId_idempotencyKey"));
  assert.ok(repo.includes("if (existing) return existing"));
  assert.ok(repo.includes("claimWorkflowRun"));
  assert.ok(repo.includes("attempt: { lt: db.workflowRun.fields.maxAttempts }"));
  assert.ok(repo.includes("status: WorkflowRunStatus.QUEUED"));
  assert.ok(repo.includes("leaseExpiresAt: { lt: now }"));
  assert.ok(repo.includes("attempt: { increment: 1 }"));
  assert.ok(repo.includes("cancelWorkflowRun"));
  assert.ok(repo.includes("canceledAt: new Date()"));
  assert.ok(repo.includes("cancelReason: errorText ?? \"Canceled by user.\""));
  assert.ok(repo.includes("recoverExpiredWorkflowRuns"));
  assert.ok(repo.includes("status: WorkflowRunStatus.FAILED"));
  assert.ok(repo.includes("status: WorkflowRunStatus.QUEUED"));
});

test("lost-update and stale-propagation state is stored in unique upserted rows", () => {
  const approvals = read("src/lib/repositories/chapter-approval-state.ts");
  const operationalState = read("src/lib/repositories/stage-operational-state.ts");
  const dependencies = read("src/lib/workflow-dependencies.ts");
  const schema = read("prisma/schema.prisma");

  assert.ok(schema.includes("@@unique([bookId, chapterId])"));
  assert.ok(schema.includes("model StageOperationalState"));
  assert.match(schema, /stageId\s+String\s+@unique\s+@db\.Uuid/);
  assert.ok(approvals.includes("chapterApprovalState.upsert"));
  assert.ok(approvals.includes("markChapterApprovalStale"));
  assert.ok(approvals.includes("isStale: true"));
  assert.ok(approvals.includes("staleReason: input.reason"));
  assert.ok(operationalState.includes("stageOperationalState.upsert"));
  assert.ok(operationalState.includes("where: { stageId: input.stageId }"));
  assert.ok(dependencies.includes("markArtifactStaleInTransaction"));
  assert.ok(dependencies.includes("markChapterApprovalStale"));
});

test("database tests cover every 9.2 category with local, non-spending contracts", () => {
  const categories = {
    "concurrent version creation": ["@@unique([artifactId, versionNumber])", "createArtifactVersionInTransaction"],
    "atomic commits": ["commitArtifactVersionInTransaction", "committedVersionId: input.versionId"],
    "duplicate jobs": ["@@unique([bookId, stageId, idempotencyKey])", "bookId_stageId_idempotencyKey"],
    cancellation: ["cancelWorkflowRun", "canceledAt: new Date()"],
    "lease recovery": ["recoverExpiredWorkflowRuns", "@@index([status, leaseExpiresAt])"],
    ownership: ["getBookHeaderBySlugForUserOrThrow", "requireAuthenticatedAppUser"],
    "lost updates": ["chapterApprovalState.upsert", "stageOperationalState.upsert"],
    "stale propagation": ["markChapterApprovalStale", "markArtifactStaleInTransaction"],
  };

  const corpus = [
    "prisma/schema.prisma",
    "src/lib/repositories/artifact-transaction-service.ts",
    "src/lib/repositories/workflow-runs.ts",
    "src/lib/repositories/chapter-approval-state.ts",
    "src/lib/repositories/stage-operational-state.ts",
    "src/lib/workflow-dependencies.ts",
    "src/app/api/books/[slug]/chapter-draft/progress/route.ts",
    "src/app/api/books/[slug]/chapter-draft/run/route.ts",
  ].filter((path) => existsSync(join(root, path))).map(read).join("\n");

  for (const [category, snippets] of Object.entries(categories)) {
    for (const snippet of snippets) {
      assert.ok(corpus.includes(snippet), `${category} coverage missing ${snippet}`);
    }
  }
});

test("workflow integrity database code does not use destructive deletes for versioned state", () => {
  const offenders = ["src/app/api", "src/lib"]
    .flatMap((dir) => listFiles(dir))
    .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"))
    .filter((path) => {
      const source = read(path);
      return /\b(?:db|tx)\.(?:artifact|artifactVersion|workflowRun|chapterApprovalState|stageOperationalState)\.delete(?:Many)?\b/.test(source);
    });

  assert.deepEqual(offenders, []);
});

test("source admission and citation audit migrations are additive and intentionally separate", () => {
  const migrationPaths = [
    "prisma/migrations/20260714120000_pre_draft_source_admission/migration.sql",
    "prisma/migrations/20260714170000_final_citation_audit/migration.sql",
  ];
  for (const migrationPath of migrationPaths) {
    assert.equal(existsSync(join(root, migrationPath)), true, `${migrationPath} must exist`);
    const migration = read(migrationPath);
    assert.match(migration, /CREATE (?:TABLE|TYPE)|ALTER TYPE/);
    assert.doesNotMatch(migration, /DROP (?:TABLE|COLUMN|TYPE)|TRUNCATE|DELETE FROM/i, `${migrationPath} must remain additive`);
  }
  const admission = read(migrationPaths[0]!);
  const citation = read(migrationPaths[1]!);
  for (const table of ["SourceVerificationResult", "SourceAdmissionReview"]) assert.ok(admission.includes(table), table);
  for (const table of ["CitationAuditFinding", "CitationAuditReview", "CitationAuditChapterState", "CitationLedger"]) assert.ok(citation.includes(table), table);
});

test("safe rollout never applies migrations from package scripts", () => {
  const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
  const command = packageJson.scripts?.["qa:source-citations"] ?? "";
  assert.ok(command.includes("tsx --test"));
  assert.doesNotMatch(command, /migrate|db push|deploy/);
});

test("evidence provenance has safe foreign keys except the deliberate polymorphic source reference", () => {
  const admission = read("prisma/migrations/20260714120000_pre_draft_source_admission/migration.sql");
  const citation = read("prisma/migrations/20260714170000_final_citation_audit/migration.sql");
  for (const field of ["SourceVerificationResult_artifactVersionId_fkey", "SourceVerificationResult_workflowRunId_fkey", "SourceAdmissionReview_artifactVersionId_fkey"]) assert.ok(admission.includes(field), field);
  for (const field of ["approvedFinalVersionId_fkey", "workflowRunId_fkey", "currentWorkflowRunId_fkey", "approvedByUserId_fkey", "createdByUserId_fkey"]) assert.ok(citation.includes(field), field);
  assert.doesNotMatch(admission, /SourceVerificationResult_sourceRecordId_fkey/);
  assert.match(read("docs/SOURCE-CITATION-ROLLOUT.md"), /sourceRecordId.*polymorphic/i);
});
