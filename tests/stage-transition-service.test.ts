import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function listFiles(dir: string): string[] {
  const absolute = join(root, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const full = join(absolute, entry);
    const relative = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(relative) : [relative];
  });
}

test("stage transition service owns core lifecycle operations", () => {
  const source = read("src/lib/workflows/stage-transition-service.ts");

  for (const symbol of [
    "ensureStageStarted",
    "markStageReadyForReview",
    "commitStageAndUnlockNext",
    "resetStageToNotStarted",
    "blockStage",
    "getNextStageKey",
  ]) {
    assert.ok(source.includes(`export async function ${symbol}`) || source.includes(`export function ${symbol}`), `missing ${symbol}`);
  }

  assert.ok(source.includes("getWorkflowStageKeys"));
  assert.ok(source.includes("StageStatus.COMMITTED"));
});

test("public API routes do not update BookStage lifecycle state directly", () => {
  const directStageWrite = /\bdb\.bookStage\.(?:create|update|upsert|updateMany|delete|deleteMany)\b/;
  const offenders = listFiles("src/app/api")
    .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"))
    .filter((path) => directStageWrite.test(read(path)));

  assert.deepEqual(offenders, []);
});

test("transition callers use commitStageAndUnlockNext for stage commits", () => {
  for (const path of [
    "src/app/api/books/[slug]/agent-chat/approve/route.ts",
    "src/app/api/books/[slug]/agent-chat/commit/route.ts",
    "src/app/api/books/[slug]/agent-chat/commit-stage/route.ts",
    "src/app/api/books/[slug]/agent-chat/chapter-draft/approve-all/route.ts",
    "src/app/api/books/[slug]/agent-chat/editing/approve-all/route.ts",
    "src/app/api/books/[slug]/workbook-design/route.ts",
    "src/lib/workflows/manifest-generator.ts",
  ]) {
    assert.ok(read(path).includes("commitStageAndUnlockNext"), `${path} does not use commitStageAndUnlockNext`);
  }
});
