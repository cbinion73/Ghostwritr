-- Durable workflow jobs: leases, heartbeats, recovery, idempotency, cancellation, and bounded attempts.
ALTER TABLE "WorkflowRun"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "leaseOwner" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "heartbeatAt" TIMESTAMP(3),
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "WorkflowRun_status_leaseExpiresAt_idx" ON "WorkflowRun"("status", "leaseExpiresAt");
CREATE INDEX "WorkflowRun_leaseOwner_idx" ON "WorkflowRun"("leaseOwner");
CREATE UNIQUE INDEX "WorkflowRun_bookId_stageId_idempotencyKey_key" ON "WorkflowRun"("bookId", "stageId", "idempotencyKey");
