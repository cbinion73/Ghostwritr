/**
 * LLM call logging — cost tracking.
 * Every call writes to:
 *   1. The LLMCallLog database table (for live queries)
 *   2. data/llm-cost-log.jsonl (append-only flat file — git-committed audit trail)
 */

import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { estimateCostUsd } from "./pricing";

export type LLMCallInput = {
  bookId:       string;
  bookSlug?:    string;
  bookTitle?:   string;
  stageKey?:    string;   // e.g. "RESEARCH" — optional, shown in the flat log
  workflowRunId?: string;
  stageRole:    string;
  provider:     string;
  model:        string;
  promptTokens:     number;   // TOTAL input tokens (uncached + cache creation + cache read)
  completionTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?:     number;
  durationMs:   number;
};

// ── Flat-file log ────────────────────────────────────────────────────────────

const LOG_PATH = path.join(process.cwd(), "data", "llm-cost-log.jsonl");

interface CostLogEntry {
  ts:               string;
  bookSlug:         string;
  bookTitle:        string;
  stageKey:         string;
  stageRole:        string;
  provider:         string;
  model:            string;
  promptTokens:     number;
  completionTokens: number;
  totalTokens:      number;
  cacheCreationTokens?: number;
  cacheReadTokens?:     number;
  costUsd:          number;
  durationMs:       number;
}

function appendToFlatLog(entry: CostLogEntry): void {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // non-fatal — DB is the source of truth
  }
}

export function readCostLog(): CostLogEntry[] {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    return fs
      .readFileSync(LOG_PATH, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CostLogEntry);
  } catch {
    return [];
  }
}

// ── Write ────────────────────────────────────────────────────────────────────

export async function logLLMCall(input: LLMCallInput): Promise<void> {
  const totalTokens = input.promptTokens + input.completionTokens;
  const cacheCreationTokens = input.cacheCreationTokens ?? 0;
  const cacheReadTokens     = input.cacheReadTokens ?? 0;
  const costUsd = estimateCostUsd(input.model, input.promptTokens, input.completionTokens, {
    cacheCreationTokens,
    cacheReadTokens,
  });

  // 1. Database
  await db.lLMCallLog.create({
    data: {
      bookId:           input.bookId,
      workflowRunId:    input.workflowRunId ?? null,
      stageRole:        input.stageRole,
      provider:         input.provider,
      model:            input.model,
      promptTokens:     input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens,
      cacheCreationTokens,
      cacheReadTokens,
      costUsd,
      durationMs:       input.durationMs,
    },
  });

  // 2. Flat file
  appendToFlatLog({
    ts:               new Date().toISOString(),
    bookSlug:         input.bookSlug  ?? input.bookId,
    bookTitle:        input.bookTitle ?? "(untitled)",
    stageKey:         input.stageKey  ?? "",
    stageRole:        input.stageRole,
    provider:         input.provider,
    model:            input.model,
    promptTokens:     input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens,
    cacheCreationTokens,
    cacheReadTokens,
    costUsd,
    durationMs:       input.durationMs,
  });
}

// ── Read (DB) ────────────────────────────────────────────────────────────────

export async function getTotalCostForBook(bookId: string): Promise<number> {
  const result = await db.lLMCallLog.aggregate({
    where: { bookId },
    _sum: { costUsd: true },
  });
  return Number(result._sum.costUsd ?? 0);
}

export async function getCostBreakdownForBook(
  bookId: string,
): Promise<{ stageRole: string; costUsd: number; totalTokens: number; callCount: number }[]> {
  const rows = await db.lLMCallLog.groupBy({
    by: ["stageRole"],
    where: { bookId },
    _sum: { costUsd: true, totalTokens: true },
    _count: { id: true },
    orderBy: { _sum: { costUsd: "desc" } },
  });
  return rows.map((r) => ({
    stageRole:   r.stageRole,
    costUsd:     Number(r._sum.costUsd ?? 0),
    totalTokens: r._sum.totalTokens ?? 0,
    callCount:   r._count.id,
  }));
}
