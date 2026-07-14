import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import { getTotalCostForBook } from "./call-log";

export const DEFAULT_LLM_BOOK_WARNING_USD = 10;
export const DEFAULT_LLM_BOOK_CONFIRMATION_USD = 20;
export const DEFAULT_LLM_BOOK_HARD_STOP_USD = 30;

export type LLMBudgetThresholds = {
  warningUsd: number;
  confirmationUsd: number;
  hardStopUsd: number;
};

export type LLMBudgetState = LLMBudgetThresholds & {
  currentSpendUsd: number;
  projectedRequestCostUsd: number;
  projectedSpendUsd: number;
  warningReached: boolean;
  confirmationRequired: boolean;
  hardStopReached: boolean;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
  confirmedThroughUsd: number | null;
};

export type LLMBudgetApprovalInput = {
  approvedAt?: Date;
  approvedBy?: string | null;
  thresholds?: Partial<LLMBudgetThresholds>;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : fallback;
}

function envNumber(name: string, fallback: number): number {
  return positiveNumber(process.env[name], fallback);
}

export function getLLMBudgetThresholds(
  metadataJson?: unknown,
  overrides: Partial<LLMBudgetThresholds> = {},
): LLMBudgetThresholds {
  const metadata = toRecord(metadataJson);
  const stored = toRecord(metadata.llmBudget);
  const warningUsd = positiveNumber(
    overrides.warningUsd ?? stored.warningUsd,
    envNumber("LLM_BOOK_WARNING_USD", DEFAULT_LLM_BOOK_WARNING_USD),
  );
  const confirmationUsd = positiveNumber(
    overrides.confirmationUsd ?? stored.confirmationUsd,
    envNumber("LLM_BOOK_CONFIRMATION_USD", DEFAULT_LLM_BOOK_CONFIRMATION_USD),
  );
  const hardStopUsd = positiveNumber(
    overrides.hardStopUsd ?? stored.hardStopUsd,
    envNumber("LLM_BOOK_HARD_STOP_USD", DEFAULT_LLM_BOOK_HARD_STOP_USD),
  );

  return {
    warningUsd,
    confirmationUsd,
    hardStopUsd: Math.max(hardStopUsd, confirmationUsd),
  };
}

export function getLLMBudgetStateFromValues(
  metadataJson: unknown,
  currentSpendUsd: number,
  projectedRequestCostUsd = 0,
  overrides: Partial<LLMBudgetThresholds> = {},
): LLMBudgetState {
  const thresholds = getLLMBudgetThresholds(metadataJson, overrides);
  const metadata = toRecord(metadataJson);
  const stored = toRecord(metadata.llmBudget);
  const confirmedThroughUsd = finiteNumber(stored.confirmedThroughUsd);
  const confirmedAt = typeof stored.confirmedAt === "string" ? stored.confirmedAt : null;
  const confirmedBy = typeof stored.confirmedBy === "string" ? stored.confirmedBy : null;
  const projectedSpendUsd = Math.max(0, currentSpendUsd) + Math.max(0, projectedRequestCostUsd);
  const confirmed = (confirmedThroughUsd ?? 0) >= thresholds.confirmationUsd;

  return {
    ...thresholds,
    currentSpendUsd,
    projectedRequestCostUsd,
    projectedSpendUsd,
    warningReached: projectedSpendUsd >= thresholds.warningUsd,
    confirmationRequired: projectedSpendUsd >= thresholds.confirmationUsd && !confirmed,
    hardStopReached: projectedSpendUsd >= thresholds.hardStopUsd,
    confirmed,
    confirmedAt,
    confirmedBy,
    confirmedThroughUsd,
  };
}

export async function getLLMBudgetStateForBook(
  bookId: string,
  projectedRequestCostUsd = 0,
  overrides: Partial<LLMBudgetThresholds> = {},
): Promise<LLMBudgetState> {
  const [book, currentSpendUsd] = await Promise.all([
    db.book.findUnique({
      where: { id: bookId },
      select: {
        metadataJson: true,
        llmBudgetState: true,
      },
    }),
    getTotalCostForBook(bookId).catch(() => 0),
  ]);

  if (book?.llmBudgetState) {
    return getLLMBudgetStateFromValues(
      {
        llmBudget: {
          warningUsd: Number(book.llmBudgetState.warningUsd),
          confirmationUsd: Number(book.llmBudgetState.confirmationUsd),
          hardStopUsd: Number(book.llmBudgetState.hardStopUsd),
          confirmedThroughUsd: book.llmBudgetState.confirmedThroughUsd === null
            ? null
            : Number(book.llmBudgetState.confirmedThroughUsd),
          confirmedAt: book.llmBudgetState.confirmedAt?.toISOString() ?? null,
          confirmedBy: book.llmBudgetState.confirmedBy,
        },
      },
      currentSpendUsd,
      projectedRequestCostUsd,
      overrides,
    );
  }

  return getLLMBudgetStateFromValues(
    book?.metadataJson ?? {},
    currentSpendUsd,
    projectedRequestCostUsd,
    overrides,
  );
}

export function buildLLMBudgetApprovalMetadata(
  metadataJson: unknown,
  input: LLMBudgetApprovalInput = {},
): Prisma.InputJsonValue {
  const metadata = toRecord(metadataJson);
  const thresholds = getLLMBudgetThresholds(metadataJson, input.thresholds);
  const now = input.approvedAt ?? new Date();

  return {
    ...metadata,
    llmBudget: {
      ...toRecord(metadata.llmBudget),
      warningUsd: thresholds.warningUsd,
      confirmationUsd: thresholds.confirmationUsd,
      hardStopUsd: thresholds.hardStopUsd,
      confirmedThroughUsd: thresholds.confirmationUsd,
      confirmedAt: now.toISOString(),
      confirmedBy: input.approvedBy ?? null,
    },
  } as Prisma.InputJsonValue;
}

export async function confirmLLMBudgetForBook(input: {
  bookId: string;
  metadataJson?: unknown;
  approvedBy?: string | null;
  approvedAt?: Date;
}) {
  const thresholds = getLLMBudgetThresholds(input.metadataJson);
  const approvedAt = input.approvedAt ?? new Date();

  return db.bookLLMBudgetState.upsert({
    where: { bookId: input.bookId },
    create: {
      bookId: input.bookId,
      warningUsd: thresholds.warningUsd,
      confirmationUsd: thresholds.confirmationUsd,
      hardStopUsd: thresholds.hardStopUsd,
      confirmedThroughUsd: thresholds.confirmationUsd,
      confirmedAt: approvedAt,
      confirmedBy: input.approvedBy ?? null,
    },
    update: {
      warningUsd: thresholds.warningUsd,
      confirmationUsd: thresholds.confirmationUsd,
      hardStopUsd: thresholds.hardStopUsd,
      confirmedThroughUsd: thresholds.confirmationUsd,
      confirmedAt: approvedAt,
      confirmedBy: input.approvedBy ?? null,
    },
  });
}
