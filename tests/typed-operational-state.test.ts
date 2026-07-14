import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("schema defines typed operational state tables for progress, budgets, and chat history", () => {
  const schema = read("prisma/schema.prisma");

  for (const model of [
    "model StageOperationalState",
    "model BookLLMBudgetState",
    "model AgentChatMessage",
  ]) {
    assert.ok(schema.includes(model), `missing ${model}`);
  }
});

test("stage progress endpoints read typed operational state instead of parsing stage metadata", () => {
  for (const path of [
    "src/app/api/books/[slug]/research/progress/route.ts",
    "src/app/api/books/[slug]/external-stories/progress/route.ts",
    "src/app/api/books/[slug]/chapter-draft/progress/route.ts",
  ]) {
    const source = read(path);
    assert.ok(source.includes("getStageProgressForBook"), `${path} does not use typed progress reader`);
    assert.equal(source.includes("parseMetadataRecord"), false, `${path} still parses metadataJson directly`);
  }
});

test("chat history API writes typed AgentChatMessage rows, not stage metadata blobs", () => {
  const route = read("src/app/api/books/[slug]/agent-chat/history/route.ts");

  assert.ok(route.includes("listAgentChatMessages"));
  assert.ok(route.includes("replaceAgentChatMessages"));
  assert.equal(route.includes("chatHistory"), false);
  assert.equal(route.includes("metadataJson"), false);
});

test("budget confirmation uses typed BookLLMBudgetState instead of Book metadataJson", () => {
  const route = read("src/app/api/books/[slug]/llm-budget/confirm/route.ts");
  const helper = read("src/lib/llm/budgets.ts");

  assert.ok(route.includes("confirmLLMBudgetForBook"));
  assert.ok(helper.includes("bookLLMBudgetState.upsert"));
  assert.ok(helper.includes("llmBudgetState"));
});

test("stage update path mirrors operational metadata into typed state for legacy workflow writers", () => {
  const booksRepo = read("src/lib/repositories/books.ts");

  assert.ok(booksRepo.includes("syncStageOperationalStateFromMetadata"));
});
