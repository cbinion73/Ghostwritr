import assert from "node:assert/strict";
import test from "node:test";

import { isStudioStageLocked } from "../src/lib/ui/stage-access-policy";

test("committed legacy stages remain viewable without a Phase 1 brief", () => {
  assert.equal(
    isStudioStageLocked({
      stageStatus: "COMMITTED",
      precedingRequiredStageStatus: "NOT_STARTED",
      requiresApprovedPhase1: true,
      hasApprovedPhase1: false,
    }),
    false,
  );
});

test("new and unfinished nonfiction stages remain locked without a Phase 1 brief", () => {
  for (const stageStatus of ["NOT_STARTED", "IN_PROGRESS", "READY_FOR_REVIEW", "BLOCKED"] as const) {
    assert.equal(
      isStudioStageLocked({
        stageStatus,
        precedingRequiredStageStatus: "COMMITTED",
        requiresApprovedPhase1: true,
        hasApprovedPhase1: false,
      }),
      true,
      `${stageStatus} must remain behind the Phase 1 gate`,
    );
  }
});

test("normal prerequisite locking remains intact when Phase 1 is approved", () => {
  assert.equal(
    isStudioStageLocked({
      stageStatus: "NOT_STARTED",
      precedingRequiredStageStatus: "NOT_STARTED",
      requiresApprovedPhase1: true,
      hasApprovedPhase1: true,
    }),
    true,
  );

  assert.equal(
    isStudioStageLocked({
      stageStatus: "NOT_STARTED",
      precedingRequiredStageStatus: "COMMITTED",
      requiresApprovedPhase1: true,
      hasApprovedPhase1: true,
    }),
    false,
  );
});

test("stages outside the Phase 1 policy still follow their preceding stage", () => {
  assert.equal(
    isStudioStageLocked({
      stageStatus: "IN_PROGRESS",
      precedingRequiredStageStatus: "COMMITTED",
      requiresApprovedPhase1: false,
      hasApprovedPhase1: false,
    }),
    false,
  );
});
