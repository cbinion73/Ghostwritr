import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Chapter Draft run orchestration is owned by the execution module", () => {
  const monolith = readFileSync("src/lib/workflows/chapter-draft.ts", "utf8");
  const execution = readFileSync("src/lib/workflows/chapter-draft/execution.ts", "utf8");
  const repair = readFileSync("src/lib/workflows/chapter-draft/repair.ts", "utf8");
  const publicEntrypoint = readFileSync("src/lib/workflows/chapter-draft-public.ts", "utf8");
  const jobs = readFileSync("src/lib/workflows/chapter-draft/jobs.ts", "utf8");
  const repairMonolithImport =
    repair.includes("from \"../chapter-draft\";")
      ? repair.split("from \"../chapter-draft\";")[0]?.split("import {").pop() ?? ""
      : "";

  assert.equal(monolith.includes("export async function runChapterDraftWorkflow"), false);
  assert.equal(monolith.includes("export async function generateSingleChapterDraft"), false);
  assert.equal(monolith.includes("export async function expandSingleChapterDraftTowardTarget"), false);
  assert.equal(monolith.includes("function assessNonfictionDraftQuality"), false);
  assert.match(execution, /export async function runChapterDraftWorkflow/);
  assert.match(execution, /export async function generateSingleChapterDraft/);
  assert.match(execution, /export async function expandSingleChapterDraftTowardTarget/);
  assert.match(execution, /function assessNonfictionDraftQuality/);
  assert.match(execution, /createChapterArtifactVersion\(/);
  assert.match(execution, /getDraftInputs\(/);
  assert.match(execution, /buildChapterWordTargets\(/);
  assert.match(execution, /generateSingleChapterDraft\(/);
  assert.match(publicEntrypoint, /from "\.\/chapter-draft\/execution"/);
  assert.match(jobs, /from "\.\/execution"/);
  assert.equal(
    execution.includes("from \"../chapter-draft\""),
    false,
    "execution module should not import temporary helpers from the monolith",
  );
  assert.equal(
    repairMonolithImport.includes("generateSingleChapterDraft"),
    false,
    "repair module should not import single-chapter generation from the monolith",
  );
  assert.equal(
    repairMonolithImport.includes("expandSingleChapterDraftTowardTarget"),
    false,
    "repair module should not import target expansion from the monolith",
  );
  assert.deepEqual(
    [...monolith.matchAll(/export async function (\w+)/g)].map((match) => match[1]).sort(),
    [],
    "chapter-draft monolith should not own workflow implementations after execution/commit extraction",
  );
  assert.match(
    monolith,
    /from "\.\/chapter-draft\/commit"/,
    "chapter-draft monolith should only keep a temporary compatibility re-export for commit helpers",
  );
});
