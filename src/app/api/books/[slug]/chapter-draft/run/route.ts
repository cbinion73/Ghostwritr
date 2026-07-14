import { NextResponse } from "next/server";
import { StageKey } from "@prisma/client";

import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";
import {
  cancelStageWorkflow,
  retryStageWorkflow,
} from "@/lib/workflows/stage-controls";
import {
  enqueueAndTriggerChapterDraftWorkflow,
} from "@/lib/workflows/chapter-draft-public";
import {
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

export const dynamic = "force-dynamic";

type ChapterDraftRunAction = "full" | "selected" | "stop" | "retry";

type ChapterDraftRunRequest = {
  action?: ChapterDraftRunAction;
  chapterKey?: string;
};

function isRunAction(value: unknown): value is ChapterDraftRunAction {
  return value === "full" || value === "selected" || value === "stop" || value === "retry";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  try {
    await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  let body: ChapterDraftRunRequest;
  try {
    body = await parseLimitedJson(req, {
      label: "Chapter Draft durable run request",
    });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }

  if (!isRunAction(body.action)) {
    return NextResponse.json(
      { error: "Unsupported Chapter Draft run action." },
      { status: 400 },
    );
  }

  if (body.action === "stop") {
    await cancelStageWorkflow(slug, StageKey.CHAPTER_DRAFT);
    return NextResponse.json({ success: true, action: body.action });
  }

  if (body.action === "retry") {
    const run = await retryStageWorkflow(
      slug,
      StageKey.CHAPTER_DRAFT,
      triggerWorkflowRunInBackground,
    );
    return NextResponse.json({ success: true, action: body.action, runId: run.id });
  }

  if (body.action === "selected") {
    const chapterKey = body.chapterKey?.trim();
    if (!chapterKey) {
      return NextResponse.json(
        { error: "chapterKey is required for selected Chapter Draft runs." },
        { status: 400 },
      );
    }

    const run = await enqueueAndTriggerChapterDraftWorkflow(
      slug,
      triggerWorkflowRunInBackground,
      chapterKey,
    );
    return NextResponse.json({ success: true, action: body.action, runId: run.id });
  }

  const run = await enqueueAndTriggerChapterDraftWorkflow(
    slug,
    triggerWorkflowRunInBackground,
  );
  return NextResponse.json({ success: true, action: body.action, runId: run.id });
}
