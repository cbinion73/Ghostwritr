import { NextResponse } from "next/server";
import { ArtifactStatus, ArtifactType } from "@prisma/client";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { isLikelyGarbageChapterContent, pruneToSingleCommittedArtifact } from "@/lib/repositories/artifact-lifecycle";
import { commitStageAndUnlockNext } from "@/lib/workflows/stage-transition-service";
import { getArtifactChapterId } from "@/lib/repositories/chapter-identity";
import { commitArtifactVersionInTransaction } from "@/lib/repositories/artifact-transaction-service";
import { markDraftApproved, markFinalRevisionApproved } from "@/lib/repositories/chapter-approval-state";

// POST — commit all per-chapter edits and advance EDITING → TYPESET
export async function POST(
  _req: Request,
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
    await commitArtifactVersionInTransaction(db, {
      artifactId: artifact.id,
      versionId: version.id,
      committedAt: now,
    });
    const chapterKey = getArtifactChapterId(artifact);
    if (chapterKey) {
      await markFinalRevisionApproved({
        bookId: book.id,
        chapterId: chapterKey,
        versionId: version.id,
      });
    }
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
      const chapterKey = getArtifactChapterId(artifact) ?? artifact.id;
      const group = byChapterKey.get(chapterKey) ?? [];
      group.push(artifact);
      byChapterKey.set(chapterKey, group);
    }

    for (const group of byChapterKey.values()) {
      // Recency alone isn't a safe tiebreaker here — see chapter-draft's
      // approve-all route for why (a failed regeneration can be "more
      // recent" than a real draft and leave an API error or the
      // deterministic fallback opener sitting there as if it were the
      // chapter).
      const sorted = [...group].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const winner =
        sorted.find((a) => !isLikelyGarbageChapterContent(a.versions[0]?.contentText)) ?? sorted[0];
      const version = winner.versions[0];
      if (!version) continue;

      await commitArtifactVersionInTransaction(db, {
        artifactId: winner.id,
        versionId: version.id,
        committedAt: now,
      });

      const chapterKey = getArtifactChapterId(winner);
      if (chapterKey) {
        await markDraftApproved({
          bookId: book.id,
          chapterId: chapterKey,
          versionId: version.id,
        });
      }
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
        await db.artifactVersion.updateMany({
          where: { artifactId: winner.id, id: { not: version.id } },
          data: { lifecycleState: ArtifactStatus.SUPERSEDED },
        });
      }
    }
  }

  const transition = await commitStageAndUnlockNext({
    bookId: book.id,
    workflowType: book.workflowType,
    stageKey: "EDITING",
    committedArtifactVersionId: lastVersionId,
    committedAt: now,
  });

  return NextResponse.json({ success: true, nextStageKey: transition.nextStageKey ?? null });
}
