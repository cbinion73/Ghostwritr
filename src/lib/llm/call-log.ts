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

export const LLM_COST_PRICING_VERSION = "2026-07-13.pricing-table-v1";

export type LLMCallStatus = "SUCCEEDED" | "FAILED" | "CANCELED";
export type LLMGenerationMode =
  | "batch"
  | "stream"
  | "sync"
  | "structured"
  | "validation"
  | "vision"
  | "unknown";

export type LLMCallInput = {
  requestId?:    string;
  providerRequestId?: string | null;
  bookId:       string;
  bookSlug?:    string;
  bookTitle?:   string;
  stageKey?:    string;   // e.g. "RESEARCH" — optional, shown in the flat log
  workflowRunId?: string;
  /** The chapter this call was working on, when applicable — see LLMCallLog.chapterKey. */
  chapterKey?:  string | null;
  stageRole:    string;
  operation:    string;
  attempt?:     number;
  provider:     string;
  model:        string;
  generationMode?: LLMGenerationMode;
  status?:      LLMCallStatus;
  errorCode?:   string | null;
  errorMessage?: string | null;
  promptTokens:     number;   // TOTAL input tokens (uncached + cache creation + cache read)
  completionTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?:     number;
  reasoningInputTokens?: number;
  reasoningOutputTokens?: number;
  pricingVersion?: string;
  searchCostUsd?: number;
  durationMs:   number;
};

// ── Flat-file log ────────────────────────────────────────────────────────────

const LOG_PATH = path.join(process.cwd(), "data", "llm-cost-log.jsonl");

export interface CostLogEntry {
  ts:               string;
  requestId:        string;
  providerRequestId: string | null;
  bookSlug:         string;
  bookTitle:        string;
  stageKey:         string;
  chapterKey:       string | null;
  stageRole:        string;
  operation:        string;
  attempt:          number;
  provider:         string;
  model:            string;
  generationMode:   LLMGenerationMode;
  status:           LLMCallStatus;
  errorCode:        string | null;
  errorMessage:     string | null;
  promptTokens:     number;
  completionTokens: number;
  totalTokens:      number;
  cacheCreationTokens?: number;
  cacheReadTokens?:     number;
  reasoningInputTokens: number;
  reasoningOutputTokens: number;
  costUsd:          number;
  searchCostUsd:    number;
  pricingVersion:   string;
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

export function buildCostLogEntry(input: LLMCallInput, now = new Date()): CostLogEntry {
  const totalTokens = input.promptTokens + input.completionTokens;
  const cacheCreationTokens = input.cacheCreationTokens ?? 0;
  const cacheReadTokens = input.cacheReadTokens ?? 0;
  const reasoningInputTokens = input.reasoningInputTokens ?? 0;
  const reasoningOutputTokens = input.reasoningOutputTokens ?? 0;
  const searchCostUsd = input.searchCostUsd ?? 0;
  const modelCostUsd = estimateCostUsd(input.model, input.promptTokens, input.completionTokens, {
    cacheCreationTokens,
    cacheReadTokens,
  });

  return {
    ts: now.toISOString(),
    requestId: input.requestId ?? "",
    providerRequestId: input.providerRequestId ?? null,
    bookSlug: input.bookSlug ?? input.bookId,
    bookTitle: input.bookTitle ?? "(untitled)",
    stageKey: input.stageKey ?? "",
    chapterKey: input.chapterKey ?? null,
    stageRole: input.stageRole,
    operation: input.operation,
    attempt: input.attempt ?? 1,
    provider: input.provider,
    model: input.model,
    generationMode: input.generationMode ?? "unknown",
    status: input.status ?? "SUCCEEDED",
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens,
    cacheCreationTokens,
    cacheReadTokens,
    reasoningInputTokens,
    reasoningOutputTokens,
    costUsd: modelCostUsd + searchCostUsd,
    searchCostUsd,
    pricingVersion: input.pricingVersion ?? LLM_COST_PRICING_VERSION,
    durationMs: input.durationMs,
  };
}

export async function logLLMCall(input: LLMCallInput): Promise<void> {
  const entry = buildCostLogEntry(input);

  // 1. Database
  await db.lLMCallLog.create({
    data: {
      requestId:        entry.requestId || null,
      providerRequestId: entry.providerRequestId,
      bookId:           input.bookId,
      workflowRunId:    input.workflowRunId ?? null,
      chapterKey:       input.chapterKey ?? null,
      stageRole:        input.stageRole,
      stageKey:         input.stageKey ?? null,
      operation:        input.operation,
      attempt:          entry.attempt,
      provider:         input.provider,
      model:            input.model,
      generationMode:   entry.generationMode,
      status:           entry.status,
      errorCode:        entry.errorCode,
      errorMessage:     entry.errorMessage,
      promptTokens:     input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens:      entry.totalTokens,
      cacheCreationTokens: entry.cacheCreationTokens ?? 0,
      cacheReadTokens:     entry.cacheReadTokens ?? 0,
      reasoningInputTokens: entry.reasoningInputTokens,
      reasoningOutputTokens: entry.reasoningOutputTokens,
      costUsd:         entry.costUsd,
      searchCostUsd:   entry.searchCostUsd,
      pricingVersion:  entry.pricingVersion,
      durationMs:       input.durationMs,
    },
  });

  // 2. Flat file
  appendToFlatLog(entry);
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
): Promise<{ stageKey: string; stageRole: string; costUsd: number; totalTokens: number; callCount: number }[]> {
  const rows = await db.lLMCallLog.groupBy({
    by: ["stageKey", "stageRole"],
    where: { bookId },
    _sum: { costUsd: true, totalTokens: true },
    _count: { id: true },
    orderBy: { _sum: { costUsd: "desc" } },
  });
  return rows.map((r) => ({
    stageKey:    r.stageKey ?? "(unknown-stage)",
    stageRole:   r.stageRole,
    costUsd:     Number(r._sum.costUsd ?? 0),
    totalTokens: r._sum.totalTokens ?? 0,
    callCount:   r._count.id,
  }));
}

export async function getCanonicalCostLedgerForBook(bookId: string): Promise<{
  stageKey: string;
  stageRole: string;
  operation: string;
  generationMode: string;
  status: string;
  costUsd: number;
  searchCostUsd: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  callCount: number;
}[]> {
  const rows = await db.lLMCallLog.groupBy({
    by: ["stageKey", "stageRole", "operation", "generationMode", "status"],
    where: { bookId },
    _sum: {
      costUsd: true,
      searchCostUsd: true,
      totalTokens: true,
      promptTokens: true,
      completionTokens: true,
    },
    _count: { id: true },
    orderBy: { _sum: { costUsd: "desc" } },
  });

  return rows.map((r) => ({
    stageKey: r.stageKey ?? "(unknown-stage)",
    stageRole: r.stageRole,
    operation: r.operation,
    generationMode: r.generationMode,
    status: r.status,
    costUsd: Number(r._sum.costUsd ?? 0),
    searchCostUsd: Number(r._sum.searchCostUsd ?? 0),
    totalTokens: r._sum.totalTokens ?? 0,
    promptTokens: r._sum.promptTokens ?? 0,
    completionTokens: r._sum.completionTokens ?? 0,
    callCount: r._count.id,
  }));
}

/**
 * Stage x chapter cost matrix — powers the cost-breakdown modal's table.
 * Rows with no chapterKey (book-level stages: Promise, Outline, Base Story,
 * Editing, etc.) are grouped under the synthetic key "(book-level)" rather
 * than dropped, so the whole book's spend is still accounted for.
 */
export async function getCostByChapterAndStage(bookId: string): Promise<{
  chapterKey: string;
  stageKey: string;
  stageRole: string;
  costUsd: number;
  totalTokens: number;
  callCount: number;
}[]> {
  const rows = await db.lLMCallLog.groupBy({
    by: ["chapterKey", "stageKey", "stageRole"],
    where: { bookId },
    _sum: { costUsd: true, totalTokens: true },
    _count: { id: true },
  });
  return rows.map((r) => ({
    chapterKey:  r.chapterKey ?? "(book-level)",
    stageKey:    r.stageKey ?? "(unknown-stage)",
    stageRole:   r.stageRole,
    costUsd:     Number(r._sum.costUsd ?? 0),
    totalTokens: r._sum.totalTokens ?? 0,
    callCount:   r._count.id,
  }));
}
