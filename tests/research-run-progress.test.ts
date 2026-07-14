import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("research run progress helpers are owned outside the monolith", () => {
  const progressSource = readFileSync(
    join(root, "src/lib/workflows/research/run-progress.ts"),
    "utf8",
  );
  const monolithSource = readFileSync(
    join(root, "src/lib/workflows/research.ts"),
    "utf8",
  );

  for (const exportedHelper of [
    "recentActivity",
    "pulseResearchStage",
    "wasResearchWorkflowCanceled",
  ]) {
    assert.match(
      progressSource,
      new RegExp(`export (?:async )?function ${exportedHelper}`),
      `run-progress.ts should own ${exportedHelper}`,
    );
  }

  assert.match(
    progressSource,
    /updateStageForBook/,
    "pulseResearchStage should preserve Research stage metadata updates",
  );
  assert.match(
    progressSource,
    /WorkflowRunStatus\.CANCELED/,
    "wasResearchWorkflowCanceled should preserve durable cancellation checks",
  );
  assert.doesNotMatch(
    monolithSource,
    /function recentActivity\(/,
    "research monolith should no longer own recentActivity",
  );
  assert.doesNotMatch(
    monolithSource,
    /async function pulseResearchStage/,
    "research monolith should no longer own pulseResearchStage",
  );
  assert.doesNotMatch(
    monolithSource,
    /async function wasWorkflowCanceled/,
    "research monolith should no longer own cancellation helper",
  );
});
