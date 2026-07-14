import { recoverExpiredWorkflowRuns } from "./repositories/workflow-runs";

function getAppPort() {
  return process.env.PORT ?? "3000";
}

function getInternalWorkflowToken() {
  return process.env.INTERNAL_WORKFLOW_TOKEN ?? "";
}

export function triggerWorkflowRunInBackground(runId: string) {
  const workerUrl = `http://127.0.0.1:${getAppPort()}/api/internal/workflow-runs/process`;
  const internalToken = getInternalWorkflowToken();

  void dispatchWorkflowRun(workerUrl, runId, internalToken);
}

async function dispatchWorkflowRun(workerUrl: string, runId: string, internalToken: string) {
  await recoverExpiredWorkflowRuns().catch(() => {
    // Non-fatal: the target run remains queued if recovery cannot complete.
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(internalToken
            ? {
                "x-internal-workflow-token": internalToken,
              }
            : {}),
        },
        body: JSON.stringify({ runId }),
      });

      if (response.ok) return;
    } catch {
      // Retry below. The WorkflowRun row remains the source of truth.
    }

    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }
}
