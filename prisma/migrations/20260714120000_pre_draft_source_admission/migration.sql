-- Isolated additive migration. Intentionally not applied automatically because
-- the target database migration history must be reconciled first.
ALTER TYPE "ResearchVerifierType" ADD VALUE IF NOT EXISTS 'ADVERSARIAL_VERIFIER';
ALTER TYPE "StoryVerifierType" ADD VALUE IF NOT EXISTS 'ADVERSARIAL_VERIFIER';

CREATE TYPE "SourceEvidenceKind" AS ENUM ('RESEARCH_CLAIM', 'EXTERNAL_STORY');
CREATE TYPE "SourceVerificationVerdict" AS ENUM ('VERIFIED', 'VERIFIED_WITH_CORRECTION', 'NEEDS_CORROBORATION', 'NOT_FOUND', 'INACCESSIBLE', 'CONTRADICTED', 'REJECTED');
CREATE TYPE "SourceAdmissionDecision" AS ENUM ('APPROVE', 'APPROVE_CORRECTED', 'REQUEST_CORROBORATION', 'REJECT', 'MANUAL_EXCEPTION', 'REOPEN');

CREATE TABLE "SourceVerificationResult" (
  "id" UUID NOT NULL,
  "bookId" UUID NOT NULL,
  "chapterKey" TEXT NOT NULL,
  "artifactVersionId" UUID NOT NULL,
  "evidenceKind" "SourceEvidenceKind" NOT NULL,
  "evidenceRecordId" TEXT NOT NULL,
  "sourceRecordId" UUID NOT NULL,
  "workflowRunId" UUID,
  "policyVersion" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "claimFingerprint" TEXT NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "verificationFingerprint" TEXT NOT NULL,
  "verdict" "SourceVerificationVerdict" NOT NULL,
  "supportingExcerpt" TEXT,
  "contradictingExcerpt" TEXT,
  "reasonCodesJson" JSONB NOT NULL DEFAULT '[]',
  "correctionsJson" JSONB NOT NULL DEFAULT '[]',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceVerificationResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SourceVerificationResult_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SourceVerificationResult_version_kind_record_fingerprint_key" ON "SourceVerificationResult"("artifactVersionId", "evidenceKind", "evidenceRecordId", "verificationFingerprint");
CREATE INDEX "SourceVerificationResult_book_chapter_version_idx" ON "SourceVerificationResult"("bookId", "chapterKey", "artifactVersionId");
CREATE INDEX "SourceVerificationResult_fingerprint_verdict_idx" ON "SourceVerificationResult"("verificationFingerprint", "verdict");
CREATE INDEX "SourceVerificationResult_inputFingerprint_created_idx" ON "SourceVerificationResult"("inputFingerprint", "createdAt");
CREATE INDEX "SourceVerificationResult_workflowRunId_idx" ON "SourceVerificationResult"("workflowRunId");

CREATE TABLE "SourceAdmissionReview" (
  "id" UUID NOT NULL,
  "bookId" UUID NOT NULL,
  "chapterKey" TEXT NOT NULL,
  "artifactVersionId" UUID NOT NULL,
  "evidenceKind" "SourceEvidenceKind" NOT NULL,
  "evidenceRecordId" TEXT NOT NULL,
  "verificationResultId" UUID,
  "verificationFingerprint" TEXT NOT NULL,
  "decision" "SourceAdmissionDecision" NOT NULL,
  "reviewerUserId" UUID,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceAdmissionReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SourceAdmissionReview_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SourceAdmissionReview_verificationResultId_fkey" FOREIGN KEY ("verificationResultId") REFERENCES "SourceVerificationResult"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SourceAdmissionReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SourceAdmissionReview_book_chapter_version_created_idx" ON "SourceAdmissionReview"("bookId", "chapterKey", "artifactVersionId", "createdAt");
CREATE INDEX "SourceAdmissionReview_kind_record_created_idx" ON "SourceAdmissionReview"("evidenceKind", "evidenceRecordId", "createdAt");
CREATE INDEX "SourceAdmissionReview_fingerprint_created_idx" ON "SourceAdmissionReview"("verificationFingerprint", "createdAt");
CREATE INDEX "SourceAdmissionReview_verificationResultId_idx" ON "SourceAdmissionReview"("verificationResultId");
CREATE INDEX "SourceAdmissionReview_reviewerUserId_idx" ON "SourceAdmissionReview"("reviewerUserId");
ALTER TABLE "SourceVerificationResult" ADD CONSTRAINT "SourceVerificationResult_artifactVersionId_fkey" FOREIGN KEY ("artifactVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SourceVerificationResult" ADD CONSTRAINT "SourceVerificationResult_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SourceAdmissionReview" ADD CONSTRAINT "SourceAdmissionReview_artifactVersionId_fkey" FOREIGN KEY ("artifactVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
