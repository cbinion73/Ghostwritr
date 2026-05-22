/**
 * commit-stage — marks a stage COMMITTED and advances to the next stage,
 * without requiring a new artifact.
 *
 * Used by PERSONAL_STORIES after the author has saved all chapter dossiers
 * via /save-dossier and is ready to move on to CHAPTER_DRAFT.
 */

import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { StageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";

interface CommitStageBody {
  stageKey: StageKey;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const book = await db.book.findUnique({
    where: { slug },
    select: { id: true, workflowType: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = await req.json() as CommitStageBody;
  const { stageKey } = body;

  if (!stageKey) {
    return NextResponse.json({ error: "Missing stageKey" }, { status: 400 });
  }

  try {
    const now = new Date();

    // Mark the stage COMMITTED
    await db.bookStage.upsert({
      where: { bookId_stageKey: { bookId: book.id, stageKey } },
      update: {
        status: StageStatus.COMMITTED,
        committedAt: now,
      },
      create: {
        bookId: book.id,
        stageKey,
        status: StageStatus.COMMITTED,
        committedAt: now,
      },
    });

    // Advance the next stage to IN_PROGRESS
    const stageOrder = getWorkflowStageKeys(book.workflowType);
    const currentIdx = stageOrder.indexOf(stageKey);
    const nextStageKey = currentIdx >= 0 && currentIdx < stageOrder.length - 1
      ? stageOrder[currentIdx + 1]
      : null;

    if (nextStageKey) {
      await db.bookStage.upsert({
        where: { bookId_stageKey: { bookId: book.id, stageKey: nextStageKey } },
        update: { status: StageStatus.IN_PROGRESS },
        create: { bookId: book.id, stageKey: nextStageKey, status: StageStatus.IN_PROGRESS },
      });
    }

    return NextResponse.json({ success: true, stageStatus: "COMMITTED", nextStageKey: nextStageKey ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
