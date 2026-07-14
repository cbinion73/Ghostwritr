import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("workflow queue no longer launches detached child processes", () => {
  const queue = read("src/lib/workflow-queue.ts");

  assert.equal(queue.includes("node:child_process"), false);
  assert.equal(queue.includes("detached: true"), false);
  assert.equal(queue.includes(".unref()"), false);
  assert.equal(existsSync(join(root, "scripts/process-workflow-run.mjs")), false);
});

test("workflow run schema has durable job lease, heartbeat, attempt, cancellation, and idempotency fields", () => {
  const schema = read("prisma/schema.prisma");

  for (const field of [
    "idempotencyKey String?",
    "attempt        Int",
    "maxAttempts    Int",
    "leaseOwner     String?",
    "leaseExpiresAt DateTime?",
    "heartbeatAt    DateTime?",
    "canceledAt     DateTime?",
    "cancelReason   String?",
    "@@unique([bookId, stageId, idempotencyKey])",
  ]) {
    assert.ok(schema.includes(field), `missing ${field}`);
  }
});

test("workflow run repository exposes durable claim, heartbeat, and recovery operations", () => {
  const repo = read("src/lib/repositories/workflow-runs.ts");

  for (const symbol of [
    "claimWorkflowRun",
    "heartbeatWorkflowRun",
    "startWorkflowRunHeartbeat",
    "recoverExpiredWorkflowRuns",
    "leaseExpiresAt",
    "attempt: { increment: 1 }",
  ]) {
    assert.ok(repo.includes(symbol), `missing ${symbol}`);
  }
});

test("long-running workflow processors renew their workflow-run leases", () => {
  for (const path of [
    "src/lib/workflows/research/jobs.ts",
    "src/lib/workflows/external-stories.ts",
    "src/lib/workflows/base-story.ts",
    "src/lib/workflows/chapter-draft/jobs.ts",
  ]) {
    const source = read(path);
    assert.ok(source.includes("startWorkflowRunHeartbeat"), `${path} does not import/start heartbeat`);
    assert.ok(source.includes("stopHeartbeat()"), `${path} does not stop heartbeat`);
  }
});
