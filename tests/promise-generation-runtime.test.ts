import assert from "node:assert/strict";
import test from "node:test";

import { createPromiseWorkflowRunner } from "../src/lib/workflows/promise/generation-runtime";
import type { PromiseWorkflowState } from "../src/lib/workflows/promise/generation-runtime-state";

test("Promise workflow runner seeds state and executes graph nodes in order", async () => {
  const calls: string[] = [];
  const record = (name: string, update: Partial<PromiseWorkflowState> = {}) => {
    return (state: PromiseWorkflowState) => {
      calls.push(`${name}:${state.bookSlug}:${state.userInput}`);
      return update;
    };
  };

  const runPromiseWorkflow = createPromiseWorkflowRunner({
    loadContextNode: record("load", {
      bookId: "book-1",
      stageId: "stage-1",
      conversationMessages: [],
    }),
    appendUserMessageNode: record("append", {
      conversationMessages: [{ role: "user", content: "Sharpen this." }],
    }),
    generatePromiseReplyNode: record("reply", {
      assistantReply: "Sharper.",
      conversationMessages: [
        { role: "user", content: "Sharpen this." },
        { role: "assistant", content: "Sharper." },
      ],
    }),
    extractPromiseNode: record("extract"),
    scorePromiseNode: record("score"),
    personaNode: record("personas"),
    marketNode: record("market"),
    recommendationsNode: record("recommendations"),
    persistNode: record("persist"),
  });

  const result = await runPromiseWorkflow("lead-through-the-fog", "Sharpen this.");

  assert.deepEqual(calls, [
    "load:lead-through-the-fog:Sharpen this.",
    "append:lead-through-the-fog:Sharpen this.",
    "reply:lead-through-the-fog:Sharpen this.",
    "extract:lead-through-the-fog:Sharpen this.",
    "score:lead-through-the-fog:Sharpen this.",
    "personas:lead-through-the-fog:Sharpen this.",
    "market:lead-through-the-fog:Sharpen this.",
    "recommendations:lead-through-the-fog:Sharpen this.",
    "persist:lead-through-the-fog:Sharpen this.",
  ]);
  assert.equal(result.bookSlug, "lead-through-the-fog");
  assert.equal(result.userInput, "Sharpen this.");
});
