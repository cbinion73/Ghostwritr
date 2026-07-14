-- Typed operational state for stage progress and automation status.
CREATE TABLE "StageOperationalState" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookId" UUID NOT NULL,
  "stageId" UUID NOT NULL,
  "automationStatus" TEXT,
  "currentAction" TEXT,
  "currentChapterKey" TEXT,
  "totalChapters" INTEGER NOT NULL DEFAULT 0,
  "completedChapters" INTEGER NOT NULL DEFAULT 0,
  "failedChapters" JSONB NOT NULL DEFAULT '[]',
  "provisionalChapters" JSONB NOT NULL DEFAULT '[]',
  "recentActivity" JSONB NOT NULL DEFAULT '[]',
  "selectedFormat" TEXT,
  "errorMessage" TEXT,
  "lastRunAt" TIMESTAMP(3),
  "automationEnabled" BOOLEAN,
  "automationMode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StageOperationalState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StageOperationalState_stageId_key" ON "StageOperationalState"("stageId");
CREATE INDEX "StageOperationalState_bookId_idx" ON "StageOperationalState"("bookId");
CREATE INDEX "StageOperationalState_bookId_stageId_idx" ON "StageOperationalState"("bookId", "stageId");
CREATE INDEX "StageOperationalState_automationStatus_idx" ON "StageOperationalState"("automationStatus");

ALTER TABLE "StageOperationalState"
  ADD CONSTRAINT "StageOperationalState_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StageOperationalState"
  ADD CONSTRAINT "StageOperationalState_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
