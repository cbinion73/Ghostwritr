import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Book Studio Chapter Draft panel no longer orchestrates LLM generation from the browser", () => {
  const panel = readFileSync("src/app/books/[slug]/chapter-draft-bmad-panel.tsx", "utf8");

  assert.equal(panel.includes("skipContext"), false);
  assert.equal(panel.includes(".getReader()"), false);
  assert.equal(panel.includes("messages: [{ role: \"user\""), false);
  assert.equal(panel.includes("writeChapter"), false);
  assert.equal(panel.includes("handleRevise"), false);
  assert.equal(panel.includes("auto-revision"), false);
  assert.equal(panel.includes("fetch(`/api/books/${slug}/agent-chat`, {"), false);
  assert.match(panel, /fetch\(`\/api\/books\/\$\{slug\}\/chapter-draft\/run`/);
});

test("Chapter Draft Book Studio run route queues durable jobs instead of calling agent chat", () => {
  const route = readFileSync("src/app/api/books/[slug]/chapter-draft/run/route.ts", "utf8");

  assert.match(route, /enqueueAndTriggerChapterDraftWorkflow/);
  assert.match(route, /triggerWorkflowRunInBackground/);
  assert.match(route, /cancelStageWorkflow/);
  assert.match(route, /retryStageWorkflow/);
  assert.equal(route.includes("/agent-chat"), false);
});

test("Book Studio Chapter Draft panel uses canonical Chapter Draft lifecycle routes", () => {
  const panel = readFileSync("src/app/books/[slug]/chapter-draft-bmad-panel.tsx", "utf8");
  const artifactsRoute = readFileSync("src/app/api/books/[slug]/chapter-draft/artifacts/route.ts", "utf8");
  const approveAllRoute = readFileSync("src/app/api/books/[slug]/chapter-draft/approve-all/route.ts", "utf8");

  assert.equal(panel.includes("/agent-chat/chapter-draft"), false);
  assert.match(panel, /\/chapter-draft\/artifacts/);
  assert.match(panel, /\/chapter-draft\/approve-all/);
  assert.match(artifactsRoute, /agent-chat\/chapter-draft\/route/);
  assert.match(approveAllRoute, /agent-chat\/chapter-draft\/approve-all\/route/);
});
