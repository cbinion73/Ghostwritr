import { WorkflowRunStatus } from "@prisma/client";
import { db } from "../db";
import { parseMetadataRecord } from "../artifact-schemas";
import { triggerWorkflowRunInBackground } from "../workflow-queue";
import { runWorkflowAutopilot } from "./workflow-automation";
import { getOvernightState, maybeFinalizeOvernightBuild } from "./overnight-build";

/**
 * Reap zombie WorkflowRun rows — the actual root cause behind every stuck
 * "running forever" stage this project has hit in practice: a background
 * worker (a spawned child process, or a docker container recreated mid-run
 * by a deploy) dies without ever getting the chance to mark its own run
 * FAILED. getActiveWorkflowRunForStage then treats that dead row as a real
 * in-progress run and refuses to start a new one, silently no-opping every
 * "Generate All" click until a human notices and manually fixes the DB row
 * (which is how every prior instance of this was resolved before this
 * function existed).
 *
 * Thresholds are generous on purpose — every real run observed in practice
 * finishes in well under an hour — so this only ever catches genuine
 * zombies, not slow-but-alive work.
 */
const STALE_RUNNING_MS = 3 * 60 * 60 * 1000; // 3 hours
const STALE_QUEUED_MS = 15 * 60 * 1000; // 15 minutes — trigger should fire within seconds

export async function reapStaleWorkflowRuns() {
  const now = Date.now();
  const candidates = await db.workflowRun.findMany({
    where: { status: { in: [WorkflowRunStatus.QUEUED, WorkflowRunStatus.RUNNING] } },
    select: { id: true, status: true, startedAt: true, bookId: true, stageId: true },
  });

  const reaped: Array<{ id: string; status: string; ageMinutes: number }> = [];

  for (const run of candidates) {
    const ageMs = now - run.startedAt.getTime();
    const threshold = run.status === WorkflowRunStatus.RUNNING ? STALE_RUNNING_MS : STALE_QUEUED_MS;
    if (ageMs < threshold) continue;

    const ageMinutes = Math.round(ageMs / 60000);
    await db.workflowRun.update({
      where: { id: run.id },
      data: {
        status: WorkflowRunStatus.FAILED,
        errorText: `Reaped by automation-sweep: stuck in ${run.status} for ${ageMinutes} minutes with no activity, well past the ${Math.round(threshold / 60000)}-minute staleness threshold. The worker process that owned this run almost certainly died (e.g. a deploy restarting the container mid-run) without marking it failed.`,
        finishedAt: new Date(),
      },
    });
    reaped.push({ id: run.id, status: run.status, ageMinutes });
  }

  if (reaped.length > 0) {
    console.warn(`[automation-sweep] reaped ${reaped.length} stale workflow run(s):`, JSON.stringify(reaped));
  }

  return reaped;
}

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
  // Clear zombie runs first — otherwise getActiveWorkflowRunForStage sees
  // the dead row, autopilot returns "waiting" (by design, since a real
  // active run should never be double-launched), and the book stays
  // silently stuck until a human notices, exactly like every zombie this
  // project has hit before this reaper existed.
  await reapStaleWorkflowRuns().catch((error) => {
    console.warn("[automation-sweep] reaper failed:", error);
  });

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
