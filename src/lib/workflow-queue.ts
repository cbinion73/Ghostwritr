import { spawn } from "node:child_process";
import path from "node:path";

function getAppPort() {
  return process.env.PORT ?? "3000";
}

function getInternalWorkflowToken() {
  return process.env.INTERNAL_WORKFLOW_TOKEN ?? "";
}

export function triggerWorkflowRunInBackground(runId: string) {
  const scriptPath = path.join(process.cwd(), "scripts", "process-workflow-run.mjs");
  const workerUrl = `http://127.0.0.1:${getAppPort()}/api/internal/workflow-runs/process`;
  const internalToken = getInternalWorkflowToken();

  const child = spawn(
    process.execPath,
    [scriptPath, runId, workerUrl, internalToken],
    {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
      env: process.env,
    },
  );

  child.unref();
}
