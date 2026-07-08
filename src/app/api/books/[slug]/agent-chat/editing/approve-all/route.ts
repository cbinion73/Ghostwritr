import { NextResponse } from "next/server";
import { ArtifactType, StageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";
import { pruneToSingleCommittedArtifact } from "@/lib/repositories/artifact-lifecycle";

// POST — commit all per-chapter edits and advance EDITING → TYPESET
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const book = await db.book.findUnique({
    where: { slug },
    select: { id: true, workflowType: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const editingStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "EDITING" } },
    include: {
      artifacts: {
        where: { artifactType: ArtifactType.MANUSCRIPT_REVISION },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!editingStage) {
    return NextResponse.json({ error: "EDITING stage not found" }, { status: 404 });
  }

  const now = new Date();
  let lastVersionId: string | null = null;

  for (const artifact of editingStage.artifacts) {
    const version = artifact.versions[0];
    if (!version) continue;
    await db.artifactVersion.update({
      where: { id: version.id },
      data: { lifecycleState: "COMMITTED", committedAt: now },
    });
    await db.artifact.update({
      where: { id: artifact.id },
      data: { status: "COMMITTED", committedVersionId: version.id },
    });
    lastVersionId = version.id;
  }

  // Also commit the polished CHAPTER_DRAFT artifacts. A chapter can have
  // more than one Artifact row here (a plain agent-chat save and the
  // structured author/regenerate path each find-or-create by a different
  // title) — group by chapterKey so exactly one wins per chapter instead of
  // committing every duplicate simultaneously.
  const draftStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "CHAPTER_DRAFT" } },
    include: {
      artifacts: {
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      },
    },
  });
  if (draftStage) {
    const byChapterKey = new Map<string, typeof draftStage.artifacts>();
    for (const artifact of draftStage.artifacts) {
      const chapterKey = (artifact.metadataJson as Record<string, string> | null)?.chapterKey ?? artifact.id;
      const group = byChapterKey.get(chapterKey) ?? [];
      group.push(artifact);
      byChapterKey.set(chapterKey, group);
    }

    for (const group of byChapterKey.values()) {
      const [winner] = [...group].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const version = winner.versions[0];
      if (!version) continue;

      await db.artifactVersion.update({
        where: { id: version.id },
        data: { lifecycleState: "COMMITTED", committedAt: now },
      });
      await db.artifact.update({
        where: { id: winner.id },
        data: { status: "COMMITTED", committedVersionId: version.id },
      });

      const chapterKey = (winner.metadataJson as Record<string, string> | null)?.chapterKey ?? null;
      if (chapterKey) {
        await pruneToSingleCommittedArtifact(db, {
          bookId: book.id,
          stageId: draftStage.id,
          artifactType: ArtifactType.CHAPTER_DRAFT,
          keepArtifactId: winner.id,
          keepVersionId: version.id,
          chapterKey,
        });
      } else {
        await db.artifactVersion.deleteMany({
          where: { artifactId: winner.id, id: { not: version.id } },
        });
      }
    }
  }

  // Mark EDITING stage COMMITTED
  await db.bookStage.update({
    where: { id: editingStage.id },
    data: {
      status: StageStatus.COMMITTED,
      committedArtifactVersionId: lastVersionId ?? undefined,
      committedAt: now,
    },
  });

  // Advance to TYPESET
  const stageOrder = getWorkflowStageKeys(book.workflowType);
  const currentIdx = stageOrder.indexOf("EDITING");
  const nextStageKey =
    currentIdx >= 0 && currentIdx < stageOrder.length - 1
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
}
