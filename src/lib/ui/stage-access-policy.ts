import type { StageStatus } from "@prisma/client";

export type StudioStageAccessInput = {
  stageStatus: StageStatus;
  precedingRequiredStageStatus: StageStatus | null;
  requiresApprovedPhase1: boolean;
  hasApprovedPhase1: boolean;
};

/**
 * Decides whether a room is selectable in the Book Studio.
 *
 * A committed stage is historical, author-owned work and must remain
 * readable even when a later migration introduces a new prerequisite.
 * This exception grants view access only: workflow generation and stage
 * transition services keep enforcing their own Phase 1 assertions.
 */
export function isStudioStageLocked({
  stageStatus,
  precedingRequiredStageStatus,
  requiresApprovedPhase1,
  hasApprovedPhase1,
}: StudioStageAccessInput): boolean {
  if (stageStatus === "COMMITTED") {
    return false;
  }

  const precedingStageIncomplete = precedingRequiredStageStatus === "NOT_STARTED";
  const phase1Incomplete = requiresApprovedPhase1 && !hasApprovedPhase1;

  return precedingStageIncomplete || phase1Incomplete;
}
