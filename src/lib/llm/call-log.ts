/**
 * LLM call logging — cost tracking stub.
 * Full implementation requires the LLMCallLog Prisma model (migration pending).
 * logLLMCall is a no-op until the schema migration is applied.
 */

export type LLMCallInput = {
  bookId: string;
  stageRole: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function logLLMCall(_input: LLMCallInput): Promise<void> {
  // No-op until LLMCallLog migration is applied
}

export async function getTotalCostForBook(_bookId: string): Promise<number> {
  return 0;
}

export async function getCostBreakdownForBook(
  _bookId: string,
): Promise<{ stageRole: string; costUsd: number }[]> {
  return [];
}
