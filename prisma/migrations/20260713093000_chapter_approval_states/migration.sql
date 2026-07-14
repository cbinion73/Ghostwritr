-- CreateEnum
CREATE TYPE "ChapterApprovalStatus" AS ENUM (
  'DRAFT_PENDING',
  'DRAFT_APPROVED',
  'FINAL_REVISION_PENDING',
  'FINAL_REVISION_APPROVED',
  'STALE'
);

-- CreateTable
CREATE TABLE "ChapterApprovalState" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookId" UUID NOT NULL,
  "chapterId" TEXT NOT NULL,
  "status" "ChapterApprovalStatus" NOT NULL DEFAULT 'DRAFT_PENDING',
  "draftPendingVersionId" UUID,
  "approvedDraftVersionId" UUID,
  "finalRevisionPendingVersionId" UUID,
  "approvedFinalVersionId" UUID,
  "isStale" BOOLEAN NOT NULL DEFAULT false,
  "staleReason" TEXT,
  "staleAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ChapterApprovalState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChapterApprovalState_bookId_chapterId_key" ON "ChapterApprovalState"("bookId", "chapterId");

-- CreateIndex
CREATE INDEX "ChapterApprovalState_bookId_status_idx" ON "ChapterApprovalState"("bookId", "status");

-- CreateIndex
CREATE INDEX "ChapterApprovalState_bookId_isStale_idx" ON "ChapterApprovalState"("bookId", "isStale");

-- CreateIndex
CREATE INDEX "ChapterApprovalState_draftPendingVersionId_idx" ON "ChapterApprovalState"("draftPendingVersionId");

-- CreateIndex
CREATE INDEX "ChapterApprovalState_approvedDraftVersionId_idx" ON "ChapterApprovalState"("approvedDraftVersionId");

-- CreateIndex
CREATE INDEX "ChapterApprovalState_finalRevisionPendingVersionId_idx" ON "ChapterApprovalState"("finalRevisionPendingVersionId");

-- CreateIndex
CREATE INDEX "ChapterApprovalState_approvedFinalVersionId_idx" ON "ChapterApprovalState"("approvedFinalVersionId");

-- AddForeignKey
ALTER TABLE "ChapterApprovalState"
  ADD CONSTRAINT "ChapterApprovalState_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
