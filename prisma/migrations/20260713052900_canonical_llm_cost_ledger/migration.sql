-- Additive canonical LLM cost ledger fields.
-- This migration is intentionally non-destructive: all existing rows receive
-- defaults or nullable fields so historical cost totals remain readable.

ALTER TABLE "LLMCallLog"
  ADD COLUMN IF NOT EXISTS "requestId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerRequestId" TEXT,
  ADD COLUMN IF NOT EXISTS "stageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "operation" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "attempt" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "generationMode" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "reasoningInputTokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reasoningOutputTokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "searchCostUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pricingVersion" TEXT NOT NULL DEFAULT '2026-07-13.pricing-table-v1';

CREATE INDEX IF NOT EXISTS "LLMCallLog_bookId_stageKey_idx" ON "LLMCallLog"("bookId", "stageKey");
CREATE INDEX IF NOT EXISTS "LLMCallLog_bookId_status_idx" ON "LLMCallLog"("bookId", "status");
CREATE INDEX IF NOT EXISTS "LLMCallLog_requestId_idx" ON "LLMCallLog"("requestId");
