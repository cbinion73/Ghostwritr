import { NextResponse } from "next/server";

import { getWorkflowRunById } from "@/lib/repositories/workflow-runs";
import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";
import { runWithLLMContext } from "@/lib/llm/call-context";
import {
  INTERNAL_WORKFLOW_TOKEN_HEADER,
  validateInternalTokenAuth,
} from "@/lib/auth/shared";
import {
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

export async function POST(request: Request) {
  try {
    const auth = validateInternalTokenAuth({
      headers: request.headers,
      envVarName: "INTERNAL_WORKFLOW_TOKEN",
      headerName: INTERNAL_WORKFLOW_TOKEN_HEADER,
      serviceName: "Internal workflow worker",
    });

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      );
    }

    let body: { runId?: string };
    try {
      body = await parseLimitedJson(request, { label: "Internal workflow request" });
    } catch (error) {
      if (error instanceof RequestLimitError) return requestLimitResponse(error);
      throw error;
    }

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

    // Ambient context: every LLM call inside the workflow auto-logs to
    // LLMCallLog with this book/run identity (see src/lib/llm/call-context.ts).
    const result: unknown = await runWithLLMContext(
      {
        bookId: run.book.id,
        bookSlug: run.book.slug,
        bookTitle: run.book.titleWorking ?? undefined,
        stageKey: run.stage.stageKey,
        workflowRunId: run.id,
      },
      async () => {
        const input = run.inputJson && typeof run.inputJson === "object" && !Array.isArray(run.inputJson)
          ? run.inputJson as Record<string, unknown>
          : {};
        if (input.kind === "adversarial_source_verification") {
          const { processSourceVerificationWorkflowRun } = await import("@/lib/workflows/source-verification/jobs");
          return processSourceVerificationWorkflowRun(body.runId!);
        } else if (input.kind === "final_citation_audit") {
          const { processCitationAuditWorkflowRun } = await import("@/lib/workflows/citation-audit/jobs");
          return processCitationAuditWorkflowRun(body.runId!);
        } else if (run.stage.stageKey === "RESEARCH") {
          const { processWorkflowRun } = await import("@/lib/workflows/research-public");
          return processWorkflowRun(body.runId!);
        } else if (run.stage.stageKey === "EXTERNAL_STORIES") {
          const { processExternalStoriesWorkflowRun } = await import("@/lib/workflows/external-stories");
          return processExternalStoriesWorkflowRun(body.runId!);
        } else if (run.stage.stageKey === "BASE_STORY") {
          const { processBaseStoryWorkflowRun } = await import("@/lib/workflows/base-story");
          return processBaseStoryWorkflowRun(body.runId!);
        } else if (run.stage.stageKey === "CHAPTER_DRAFT") {
          const { processChapterDraftWorkflowRun } = await import("@/lib/workflows/chapter-draft-public");
          return processChapterDraftWorkflowRun(body.runId!);
        }
        return { skipped: true };
      },
    );

    const runInput = run.inputJson && typeof run.inputJson === "object" && !Array.isArray(run.inputJson)
      ? run.inputJson as Record<string, unknown>
      : {};
    if (
      runInput.kind !== "adversarial_source_verification" &&
      runInput.kind !== "final_citation_audit" &&
      !("skipped" in (result as Record<string, unknown>)) &&
      !("canceled" in (result as Record<string, unknown>))
    ) {
      const { continueWorkflowAutomationIfEnabled } = await import("@/lib/workflows/workflow-automation");
      const automationResult = await continueWorkflowAutomationIfEnabled(
        run.book.slug,
        triggerWorkflowRunInBackground,
      );
      // Overnight build: when the autopilot reaches a resting state, compile
      // the Morning Report and end the session.
      const { maybeFinalizeOvernightBuild } = await import("@/lib/workflows/overnight-build");
      await maybeFinalizeOvernightBuild(run.book.slug, automationResult.status);
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
