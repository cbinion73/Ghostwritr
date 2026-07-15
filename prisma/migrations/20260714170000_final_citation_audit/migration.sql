-- Additive only. This migration is intentionally not applied by this package.
ALTER TYPE "StageKey" ADD VALUE IF NOT EXISTS 'CITATION_AUDIT';
ALTER TYPE "ArtifactType" ADD VALUE IF NOT EXISTS 'CITATION_AUDIT_REPORT';
ALTER TYPE "ArtifactType" ADD VALUE IF NOT EXISTS 'CITATION_LEDGER';

CREATE TYPE "CitationStyle" AS ENUM ('CHICAGO_17', 'APA_7', 'MLA_9');
CREATE TYPE "CitationAuditFindingKind" AS ENUM ('SUPPORTED', 'MISSING_SOURCE', 'INACCESSIBLE', 'CONTRADICTED', 'DISTORTED', 'UNSUPPORTED', 'UNUSED');
CREATE TYPE "CitationAuditDecision" AS ENUM ('APPROVE', 'MANUAL_EXCEPTION', 'REQUEST_REVISION', 'REOPEN');
CREATE TYPE "CitationAuditChapterStatus" AS ENUM ('PENDING', 'READY_FOR_REVIEW', 'APPROVED', 'BLOCKED', 'STALE');

ALTER TABLE "Book" ADD COLUMN "citationStyle" "CitationStyle" NOT NULL DEFAULT 'CHICAGO_17';

-- Existing nonfiction books need the new visible stage before application code
-- can enqueue audits. The unique constraint makes this restart-safe.
INSERT INTO "BookStage" ("id", "bookId", "stageKey", "status", "metadataJson", "updatedAt", "createdAt")
SELECT gen_random_uuid(), b."id", 'CITATION_AUDIT'::"StageKey", 'NOT_STARTED'::"StageStatus", '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Book" b
WHERE b."workflowType" = 'NONFICTION'::"BookWorkflowType"
ON CONFLICT ("bookId", "stageKey") DO NOTHING;

CREATE TABLE "CitationAuditFinding" (
  "id" UUID NOT NULL, "bookId" UUID NOT NULL, "chapterKey" TEXT NOT NULL,
  "approvedFinalVersionId" UUID NOT NULL, "claimText" TEXT NOT NULL,
  "claimStart" INTEGER NOT NULL, "claimEnd" INTEGER NOT NULL,
  "claimFingerprint" TEXT NOT NULL, "sourceLedgerFingerprint" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL, "findingFingerprint" TEXT NOT NULL,
  "kind" "CitationAuditFindingKind" NOT NULL, "evidenceKind" "SourceEvidenceKind",
  "evidenceRecordId" TEXT, "sourceRecordId" UUID, "supportingExcerpt" TEXT,
  "notes" TEXT, "workflowRunId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CitationAuditFinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CitationAuditFinding_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CitationAuditFinding_exact_fingerprint_key" ON "CitationAuditFinding"("bookId", "chapterKey", "approvedFinalVersionId", "findingFingerprint");
CREATE INDEX "CitationAuditFinding_chapter_version_idx" ON "CitationAuditFinding"("bookId", "chapterKey", "approvedFinalVersionId", "createdAt");
CREATE INDEX "CitationAuditFinding_workflowRunId_idx" ON "CitationAuditFinding"("workflowRunId");

CREATE TABLE "CitationAuditReview" (
  "id" UUID NOT NULL, "bookId" UUID NOT NULL, "chapterKey" TEXT NOT NULL,
  "findingId" UUID, "approvedFinalVersionId" UUID NOT NULL, "findingFingerprint" TEXT NOT NULL,
  "sourceLedgerFingerprint" TEXT NOT NULL, "policyVersion" TEXT NOT NULL,
  "decision" "CitationAuditDecision" NOT NULL, "reviewerUserId" UUID,
  "reason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CitationAuditReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CitationAuditReview_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CitationAuditReview_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "CitationAuditFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CitationAuditReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "CitationAuditReview_chapter_created_idx" ON "CitationAuditReview"("bookId", "chapterKey", "createdAt");
CREATE INDEX "CitationAuditReview_fingerprint_created_idx" ON "CitationAuditReview"("findingFingerprint", "createdAt");

CREATE TABLE "CitationAuditChapterState" (
  "id" UUID NOT NULL, "bookId" UUID NOT NULL, "chapterKey" TEXT NOT NULL,
  "approvedFinalVersionId" UUID NOT NULL, "sourceLedgerFingerprint" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL, "citationStyle" "CitationStyle" NOT NULL,
  "auditFingerprint" TEXT NOT NULL, "currentWorkflowRunId" UUID, "status" "CitationAuditChapterStatus" NOT NULL DEFAULT 'PENDING',
  "approvedAt" TIMESTAMP(3), "approvedByUserId" UUID, "staleReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CitationAuditChapterState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CitationAuditChapterState_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CitationAuditChapterState_bookId_chapterKey_key" ON "CitationAuditChapterState"("bookId", "chapterKey");
CREATE INDEX "CitationAuditChapterState_bookId_status_idx" ON "CitationAuditChapterState"("bookId", "status");
CREATE INDEX "CitationAuditChapterState_approvedFinalVersionId_auditFingerprint_idx" ON "CitationAuditChapterState"("approvedFinalVersionId", "auditFingerprint");

CREATE TABLE "CitationLedger" (
  "id" UUID NOT NULL, "bookId" UUID NOT NULL, "ledgerFingerprint" TEXT NOT NULL,
  "finalVersionsFingerprint" TEXT NOT NULL, "sourceLedgerFingerprint" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL, "citationStyle" "CitationStyle" NOT NULL,
  "entriesJson" JSONB NOT NULL, "chapterAuditIdsJson" JSONB NOT NULL,
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CitationLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CitationLedger_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CitationLedger_bookId_ledgerFingerprint_key" ON "CitationLedger"("bookId", "ledgerFingerprint");
CREATE INDEX "CitationLedger_bookId_lockedAt_idx" ON "CitationLedger"("bookId", "lockedAt");
ALTER TABLE "CitationAuditFinding" ADD CONSTRAINT "CitationAuditFinding_approvedFinalVersionId_fkey" FOREIGN KEY ("approvedFinalVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CitationAuditFinding" ADD CONSTRAINT "CitationAuditFinding_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CitationAuditReview" ADD CONSTRAINT "CitationAuditReview_approvedFinalVersionId_fkey" FOREIGN KEY ("approvedFinalVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CitationAuditChapterState" ADD CONSTRAINT "CitationAuditChapterState_approvedFinalVersionId_fkey" FOREIGN KEY ("approvedFinalVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CitationAuditChapterState" ADD CONSTRAINT "CitationAuditChapterState_currentWorkflowRunId_fkey" FOREIGN KEY ("currentWorkflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CitationAuditChapterState" ADD CONSTRAINT "CitationAuditChapterState_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CitationLedger" ADD CONSTRAINT "CitationLedger_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
