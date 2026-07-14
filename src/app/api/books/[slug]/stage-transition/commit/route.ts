/**
 * commit-stage — marks a stage COMMITTED and advances to the next stage,
 * without requiring a new artifact.
 *
 * Used by PERSONAL_STORIES after the author has saved all chapter dossiers
 * via /save-dossier and is ready to move on to CHAPTER_DRAFT.
 */

import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { commitStageAndUnlockNext, ensureStageStarted } from "@/lib/workflows/stage-transition-service";
import {
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

interface CommitStageBody {
  stageKey: StageKey;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  let body: CommitStageBody;
  try {
    body = await parseLimitedJson(req, { label: "Stage commit request" });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { stageKey } = body;

  if (!stageKey) {
    return NextResponse.json({ error: "Missing stageKey" }, { status: 400 });
  }

  try {
    const now = new Date();

    await ensureStageStarted({ bookId: book.id, stageKey });
    const transition = await commitStageAndUnlockNext({
      bookId: book.id,
      workflowType: book.workflowType,
      stageKey,
      committedAt: now,
    });

    return NextResponse.json({ success: true, stageStatus: "COMMITTED", nextStageKey: transition.nextStageKey ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
