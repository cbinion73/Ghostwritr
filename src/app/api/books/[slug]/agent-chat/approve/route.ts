import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { StageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";
import { pruneToSingleCommittedArtifact } from "@/lib/repositories/artifact-lifecycle";

interface ApproveBody {
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

  const body = await req.json() as ApproveBody;
  const { stageKey } = body;
  if (!stageKey) return NextResponse.json({ error: "Missing stageKey" }, { status: 400 });

  try {
    const now = new Date();

    // Find the REVIEW_READY stage + artifact
    const bookStage = await db.bookStage.findUnique({
      where: { bookId_stageKey: { bookId: book.id, stageKey } },
      include: {
        artifacts: {
          where: { status: "REVIEW_READY" },
          include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!bookStage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

    const artifact = bookStage.artifacts[0];
    const version = artifact?.versions[0];

    if (artifact && version) {
      // Promote artifact + version to COMMITTED
      await db.artifactVersion.update({
        where: { id: version.id },
        data: { lifecycleState: "COMMITTED", committedAt: now },
      });
      await db.artifact.update({
        where: { id: artifact.id },
        data: { status: "COMMITTED", committedVersionId: version.id },
      });
      await db.bookStage.update({
        where: { id: bookStage.id },
        data: {
          status: StageStatus.COMMITTED,
          committedArtifactVersionId: version.id,
          committedAt: now,
        },
      });

      await pruneToSingleCommittedArtifact(db, {
        bookId: book.id,
        stageId: bookStage.id,
        artifactType: artifact.artifactType,
        keepArtifactId: artifact.id,
        keepVersionId: version.id,
      });
    } else {
      // No artifact yet — just mark committed
      await db.bookStage.update({
        where: { id: bookStage.id },
        data: { status: StageStatus.COMMITTED, committedAt: now },
      });
    }

    // Advance: mark next stage IN_PROGRESS
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

    return NextResponse.json({ success: true, nextStageKey: nextStageKey ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
