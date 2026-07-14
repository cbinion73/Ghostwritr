import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Chapter Draft repair and expansion wrappers are owned by the repair module", () => {
  const monolith = readFileSync("src/lib/workflows/chapter-draft.ts", "utf8");
  const repair = readFileSync("src/lib/workflows/chapter-draft/repair.ts", "utf8");
  const publicEntrypoint = readFileSync("src/lib/workflows/chapter-draft-public.ts", "utf8");

  assert.equal(monolith.includes("export async function expandChapterDraftTowardTargetWorkflow"), false);
  assert.equal(monolith.includes("export async function expandUnderTargetChapterDraftsWorkflow"), false);
  assert.equal(monolith.includes("export async function repairWeakChapterDraftsWorkflow"), false);
  assert.match(repair, /export async function expandChapterDraftTowardTargetWorkflow/);
  assert.match(repair, /export async function expandUnderTargetChapterDraftsWorkflow/);
  assert.match(repair, /export async function repairWeakChapterDraftsWorkflow/);
  assert.match(repair, /buildChapterWordTargets\(/);
  assert.match(repair, /expandSingleChapterDraftTowardTarget\(/);
  assert.match(repair, /generateSingleChapterDraft\(/);
  assert.match(
    repair,
    /from "\.\/execution"/,
    "repair module should consume single-chapter execution helpers from the execution module",
  );
  assert.match(publicEntrypoint, /from "\.\/chapter-draft\/repair"/);
});
