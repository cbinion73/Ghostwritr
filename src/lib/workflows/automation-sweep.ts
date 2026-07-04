import { db } from "../db";
import { parseMetadataRecord } from "../artifact-schemas";
import { triggerWorkflowRunInBackground } from "../workflow-queue";
import { runWorkflowAutopilot } from "./workflow-automation";
import { getOvernightState, maybeFinalizeOvernightBuild } from "./overnight-build";

/**
 * Autopilot sweep — the safety net under the event-driven continuation chain.
 *
 * Normally each finished background worker re-triggers the next autopilot
 * step (continueWorkflowAutomationIfEnabled in the process route). But if a
 * worker crashes, the process route 500s BEFORE that continuation fires and
 * the chain dies silently — an overnight build stays "active" with nothing
 * running until a human opens the page. This sweep re-runs autopilot for
 * every book that still has automation enabled (or an overnight session
 * open), so a 2am failure resumes at 2:10 instead of 8am.
 *
 * Idempotent by design: runWorkflowAutopilot returns "waiting" when a stage
 * already has an active WorkflowRun, so sweeping over a healthy chain is a
 * no-op.
 */
export async function sweepAutomationEnabledBooks() {
  const books = await db.book.findMany({
    select: { id: true, slug: true, metadataJson: true },
  });

  const results: Array<{ slug: string; status: string; title: string }> = [];

  for (const book of books) {
    const metadata = parseMetadataRecord(book.metadataJson);
    const automation =
      metadata.workflowAutomation && typeof metadata.workflowAutomation === "object"
        ? (metadata.workflowAutomation as { enabled?: unknown; mode?: unknown })
        : null;
    const overnight = getOvernightState(book.metadataJson);

    const automationEnabled = Boolean(automation?.enabled) && automation?.mode !== "manual";
    if (!automationEnabled && !overnight.active) continue;

    try {
      const result = await runWorkflowAutopilot(book.slug, triggerWorkflowRunInBackground);
      // If an overnight session is open and the build has reached a resting
      // state, this also finalizes the Morning Report a crashed chain never
      // got to write.
      await maybeFinalizeOvernightBuild(book.slug, result.status);
      results.push({ slug: book.slug, status: result.status, title: result.title });
    } catch (error) {
      console.warn(`[automation-sweep] autopilot failed for ${book.slug}:`, error);
      results.push({
        slug: book.slug,
        status: "error",
        title: error instanceof Error ? error.message : "Unknown sweep error",
      });
    }
  }

  return results;
}

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

declare global {
  var __ghostwritrAutomationSweep: NodeJS.Timeout | undefined;
}

/** Start the periodic sweep once per server process (hot-reload safe). */
export function startAutomationSweep() {
  if (globalThis.__ghostwritrAutomationSweep) return;
  globalThis.__ghostwritrAutomationSweep = setInterval(() => {
    sweepAutomationEnabledBooks().catch((error) => {
      console.warn("[automation-sweep] sweep tick failed:", error);
    });
  }, SWEEP_INTERVAL_MS);
  // Never keep the process alive just for the sweep.
  globalThis.__ghostwritrAutomationSweep.unref?.();
  console.log("[automation-sweep] periodic autopilot sweep started (every 10 min)");
}
