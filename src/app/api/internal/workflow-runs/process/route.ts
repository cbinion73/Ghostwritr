import { NextResponse } from "next/server";

import { getWorkflowRunById } from "@/lib/repositories/workflow-runs";
import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";

export async function POST(request: Request) {
  try {
    const expectedToken = process.env.INTERNAL_WORKFLOW_TOKEN;
    if (expectedToken) {
      const providedToken = request.headers.get("x-internal-workflow-token");

      if (providedToken !== expectedToken) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
    }

    const body = (await request.json()) as { runId?: string };

    if (!body.runId) {
      return NextResponse.json(
        { error: "Missing runId" },
        { status: 400 },
      );
    }

    const run = await getWorkflowRunById(body.runId);

    if (!run) {
      return NextResponse.json(
        { error: "Workflow run not found" },
        { status: 404 },
      );
    }

    let result: unknown;

    if (run.stage.stageKey === "RESEARCH") {
      const { processWorkflowRun } = await import("@/lib/workflows/research");
      result = await processWorkflowRun(body.runId);
    } else if (run.stage.stageKey === "EXTERNAL_STORIES") {
      const { processExternalStoriesWorkflowRun } = await import("@/lib/workflows/external-stories");
      result = await processExternalStoriesWorkflowRun(body.runId);
    } else if (run.stage.stageKey === "BASE_STORY") {
      const { processBaseStoryWorkflowRun } = await import("@/lib/workflows/base-story");
      result = await processBaseStoryWorkflowRun(body.runId);
    } else if (run.stage.stageKey === "CHAPTER_DRAFT") {
      const { processChapterDraftWorkflowRun } = await import("@/lib/workflows/chapter-draft");
      result = await processChapterDraftWorkflowRun(body.runId);
    } else {
      result = { skipped: true };
    }

    if (!("skipped" in (result as Record<string, unknown>)) && !("canceled" in (result as Record<string, unknown>))) {
      const { continueWorkflowAutomationIfEnabled } = await import("@/lib/workflows/workflow-automation");
      await continueWorkflowAutomationIfEnabled(run.book.slug, triggerWorkflowRunInBackground);
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown worker error",
      },
      { status: 500 },
    );
  }
}
