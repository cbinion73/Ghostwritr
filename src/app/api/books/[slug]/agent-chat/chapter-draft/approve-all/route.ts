import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { ArtifactStatus, StageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";

const CHAPTER_STAGE_KEYS: StageKey[] = ["CHAPTER_DRAFT", "FICTION_DRAFT"];

function resolveStageKey(raw: string | null | undefined): StageKey {
  if (raw && CHAPTER_STAGE_KEYS.includes(raw as StageKey)) return raw as StageKey;
  return "CHAPTER_DRAFT";
}

// POST — approve all chapter drafts and commit the stage
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

  const body = await req.json().catch(() => ({})) as { stageKey?: string };
  const stageKey = resolveStageKey(body.stageKey);

  const bookStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey } },
    include: {
      artifacts: {
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!bookStage) {
    return NextResponse.json({ error: `${stageKey} stage not found` }, { status: 404 });
  }

  const now = new Date();
  let lastVersionId: string | null = null;

  // A chapter can have more than one Artifact row (a plain agent-chat save
  // and the structured author/regenerate path each find-or-create by a
  // different title, so neither sees the other's row). Group by chapterKey
  // so exactly one wins the commit per chapter instead of committing every
  // duplicate simultaneously — the runner-up(s) are superseded, not left
  // sitting there as a second "committed" source for the same chapter.
  const byChapterKey = new Map<string, typeof bookStage.artifacts>();
  for (const artifact of bookStage.artifacts) {
    if (artifact.status === "SUPERSEDED") continue;
    const chapterKey = (artifact.metadataJson as Record<string, string> | null)?.chapterKey ?? artifact.id;
    const group = byChapterKey.get(chapterKey) ?? [];
    group.push(artifact);
    byChapterKey.set(chapterKey, group);
  }

  for (const group of byChapterKey.values()) {
    const [winner, ...duplicates] = [...group].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
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
    lastVersionId = version.id;

    for (const duplicate of duplicates) {
      await db.artifactVersion.updateMany({
        where: { artifactId: duplicate.id, lifecycleState: { not: ArtifactStatus.SUPERSEDED } },
        data: { lifecycleState: ArtifactStatus.SUPERSEDED },
      });
      await db.artifact.update({
        where: { id: duplicate.id },
        data: { status: ArtifactStatus.SUPERSEDED },
      });
    }
  }

  await db.bookStage.update({
    where: { id: bookStage.id },
    data: {
      status: StageStatus.COMMITTED,
      committedArtifactVersionId: lastVersionId ?? undefined,
      committedAt: now,
    },
  });

  // Advance to next stage
  const stageOrder = getWorkflowStageKeys(book.workflowType);
  const currentIdx = stageOrder.indexOf(stageKey);
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
