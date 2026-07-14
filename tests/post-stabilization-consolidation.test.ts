import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Agent Chat Panel delegates focused presentation responsibilities", () => {
  const panel = read("src/app/books/[slug]/agent-chat-panel.tsx");
  assert.ok(panel.split("\n").length < 1100);
  for (const module of [
    "artifact-card",
    "dossier-checklist",
    "markdown-text",
    "types",
    "use-agent-chat-history",
    "use-dossier-progress",
  ]) {
    assert.ok(panel.includes(`./agent-chat/${module}`));
  }
  assert.doesNotMatch(panel, /function MarkdownText/);
  assert.doesNotMatch(panel, /function DossierChecklist/);
});

test("legacy Promise and Editing roots are implementation-free facades", () => {
  const promise = read("src/lib/workflows/promise.ts");
  const editing = read("src/lib/workflows/editing.ts");
  for (const source of [promise, editing]) {
    assert.ok(source.split("\n").length < 10);
    assert.doesNotMatch(source, /getModelForRole|z\.object|export async function/);
  }
  assert.match(promise, /promise-public/);
  assert.match(editing, /editing\/workspace-schemas/);
  assert.match(read("src/lib/workflows/editing/workspace-schemas.ts"), /EditorialReadinessGateSchema/);
});

test("remaining workflow roots delegate extracted capabilities", () => {
  const outline = read("src/lib/workflows/outline.ts");
  const externalStories = read("src/lib/workflows/external-stories.ts");
  const personalStories = read("src/lib/workflows/personal-stories.ts");

  assert.match(outline, /from "\.\/outline\/commit"/);
  assert.match(outline, /from "\.\/outline\/finalize"/);
  assert.doesNotMatch(outline, /export async function commitOutlineWorkflow/);
  assert.doesNotMatch(outline, /export async function getOutlineWorkspace/);
  assert.match(read("src/lib/workflows/outline-public.ts"), /outline\/workspace/);
  assert.match(externalStories, /from "\.\/external-stories\/binder-actions"/);
  assert.doesNotMatch(externalStories, /export async function addExternalStoryBinderTabWorkflow/);
  assert.doesNotMatch(externalStories, /export async function getExternalStoriesWorkspace/);
  assert.match(read("src/lib/workflows/external-stories-public.ts"), /external-stories\/workspace/);
  assert.match(personalStories, /from "\.\/personal-stories\/schemas"/);
  assert.doesNotMatch(personalStories, /const EncyclopediaSchema = z\.object/);
  assert.match(personalStories, /from "\.\/personal-stories\/workspace"/);
  assert.match(personalStories, /from "\.\/personal-stories\/commit"/);
  assert.doesNotMatch(personalStories, /export async function getPersonalStoriesWorkspace/);
  assert.doesNotMatch(personalStories, /export async function commitPersonalStoriesWorkflow/);
});

test("cost and operational status polling use the typed client request owner", () => {
  for (const path of [
    "src/app/books/[slug]/cost-pace-bar.tsx",
    "src/app/books/[slug]/activity-ticker.tsx",
    "src/app/books/[slug]/stage-live-feed.tsx",
    "src/app/components/stage-run-panel.tsx",
    "src/app/books/[slug]/promise/status-indicator.tsx",
  ]) {
    assert.match(read(path), /@\/lib\/ui\/client-request/, `${path} bypasses the shared client request owner`);
  }
});
