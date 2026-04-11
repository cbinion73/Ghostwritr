import { NextResponse } from "next/server";

import { getWorkflowRunById } from "@/lib/repositories/workflow-runs";
import { processBaseStoryWorkflowRun } from "@/lib/workflows/base-story";
import { processChapterDraftWorkflowRun } from "@/lib/workflows/chapter-draft";
import { processExternalStoriesWorkflowRun } from "@/lib/workflows/external-stories";
import { processWorkflowRun } from "@/lib/workflows/research";

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

    const result =
      run.stage.stageKey === "RESEARCH"
        ? await processWorkflowRun(body.runId)
        : run.stage.stageKey === "EXTERNAL_STORIES"
          ? await processExternalStoriesWorkflowRun(body.runId)
          : run.stage.stageKey === "BASE_STORY"
            ? await processBaseStoryWorkflowRun(body.runId)
            : run.stage.stageKey === "CHAPTER_DRAFT"
              ? await processChapterDraftWorkflowRun(body.runId)
            : { skipped: true };

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
