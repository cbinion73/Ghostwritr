-- Typed per-book LLM budget state and per-stage chat messages.
CREATE TABLE "BookLLMBudgetState" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookId" UUID NOT NULL,
  "warningUsd" DECIMAL(10,2) NOT NULL DEFAULT 10,
  "confirmationUsd" DECIMAL(10,2) NOT NULL DEFAULT 20,
  "hardStopUsd" DECIMAL(10,2) NOT NULL DEFAULT 30,
  "confirmedThroughUsd" DECIMAL(10,2),
  "confirmedAt" TIMESTAMP(3),
  "confirmedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BookLLMBudgetState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookLLMBudgetState_bookId_key" ON "BookLLMBudgetState"("bookId");

ALTER TABLE "BookLLMBudgetState"
  ADD CONSTRAINT "BookLLMBudgetState_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AgentChatMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookId" UUID NOT NULL,
  "stageId" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentChatMessage_stageId_orderIndex_key" ON "AgentChatMessage"("stageId", "orderIndex");
CREATE INDEX "AgentChatMessage_bookId_stageId_orderIndex_idx" ON "AgentChatMessage"("bookId", "stageId", "orderIndex");

ALTER TABLE "AgentChatMessage"
  ADD CONSTRAINT "AgentChatMessage_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentChatMessage"
  ADD CONSTRAINT "AgentChatMessage_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
