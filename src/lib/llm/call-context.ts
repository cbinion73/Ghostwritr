/**
 * Ambient LLM call context — carries book/run identity through a workflow's
 * nested async calls so the provider layer can auto-log every LLM call
 * without threading parameters through every LangGraph node.
 *
 * Install once around a workflow dispatch:
 *
 *   await runWithLLMContext({ bookId, bookSlug, stageKey, workflowRunId }, () =>
 *     processWorkflowRun(runId),
 *   );
 *
 * The auto-logging callback in providers.ts only logs when this context is
 * present, so the API routes that call logLLMCall() manually (scout-research,
 * chronicle-stories, agent-chat) are never double-logged.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type LLMCallContext = {
  bookId:        string;
  bookSlug?:     string;
  bookTitle?:    string;
  stageKey?:     string;
  workflowRunId?: string;
};

const storage = new AsyncLocalStorage<LLMCallContext>();

export function runWithLLMContext<T>(context: LLMCallContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export function getLLMCallContext(): LLMCallContext | undefined {
  return storage.getStore();
}
