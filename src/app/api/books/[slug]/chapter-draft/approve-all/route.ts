import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { ArtifactStatus, ArtifactType } from "@prisma/client";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { isLikelyGarbageChapterContent, pruneToSingleCommittedArtifact } from "@/lib/repositories/artifact-lifecycle";
import { commitStageAndUnlockNext } from "@/lib/workflows/stage-transition-service";
import { getArtifactChapterId } from "@/lib/repositories/chapter-identity";
import { commitArtifactVersionInTransaction } from "@/lib/repositories/artifact-transaction-service";
import { markDraftApproved } from "@/lib/repositories/chapter-approval-state";
import {
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

const CHAPTER_STAGE_KEYS: StageKey[] = ["CHAPTER_DRAFT", "FICTION_DRAFT"];

function resolveStageKey(raw: string | null | undefined): StageKey {
  if (raw && CHAPTER_STAGE_KEYS.includes(raw as StageKey)) return raw as StageKey;
  return "CHAPTER_DRAFT";
}

function resolveArtifactType(stageKey: StageKey): ArtifactType {
  return stageKey === "FICTION_DRAFT"
    ? ArtifactType.FICTION_DRAFT_MANUSCRIPT
    : ArtifactType.CHAPTER_DRAFT;
}

// POST — approve all chapter drafts and commit the stage
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

  let body: { stageKey?: string };
  try {
    body = await parseLimitedJson(req, { label: "Chapter approve-all request" });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
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
  const artifactType = resolveArtifactType(stageKey);
  let lastVersionId: string | null = null;

  // A chapter can have more than one Artifact row (a plain agent-chat save
  // and the structured author/regenerate path each find-or-create by a
  // different title, so neither sees the other's row). Group by chapterKey
  // so exactly one wins the commit per chapter instead of committing every
  // duplicate simultaneously — the runner-up(s) are deleted, not left
  // sitting there as a second "committed" source for the same chapter.
  const byChapterKey = new Map<string, typeof bookStage.artifacts>();
  for (const artifact of bookStage.artifacts) {
    const chapterKey = getArtifactChapterId(artifact) ?? artifact.id;
    const group = byChapterKey.get(chapterKey) ?? [];
    group.push(artifact);
    byChapterKey.set(chapterKey, group);
  }

  await db.$transaction(async (tx) => {
    for (const group of byChapterKey.values()) {
      // Recency alone isn't a safe tiebreaker — a failed regeneration attempt
      // can be "more recent" than a real draft and leave an API error or the
      // deterministic fallback opener sitting there as if it were the
      // chapter. Prefer the most recent candidate whose content doesn't look
      // like that; only fall back to pure recency if every candidate does
      // (nothing worse to lose in that case).
      const sorted = [...group].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const winner =
        sorted.find((a) => !isLikelyGarbageChapterContent(a.versions[0]?.contentText)) ?? sorted[0];
      const version = winner.versions[0];
      if (!version) continue;

      await commitArtifactVersionInTransaction(tx, {
        artifactId: winner.id,
        versionId: version.id,
        committedAt: now,
      });
      lastVersionId = version.id;

      const chapterKey = getArtifactChapterId(winner);
      if (chapterKey) {
        await markDraftApproved({
          bookId: book.id,
          chapterId: chapterKey,
          versionId: version.id,
          client: tx,
        });
      }
      if (chapterKey) {
        // Only prune sibling artifacts when we have a real chapterKey to
        // scope by — pruneToSingleCommittedArtifact treats a missing
        // chapterKey as "not chapter-scoped" and would match every artifact
        // of this type in the stage, which would wrongly delete unrelated
        // chapters if one ever turned up without metadataJson.chapterKey set.
        await pruneToSingleCommittedArtifact(tx, {
          bookId: book.id,
          stageId: bookStage.id,
          artifactType,
          keepArtifactId: winner.id,
          keepVersionId: version.id,
          chapterKey,
        });
      } else {
        await tx.artifactVersion.updateMany({
          where: { artifactId: winner.id, id: { not: version.id } },
          data: { lifecycleState: ArtifactStatus.SUPERSEDED },
        });
      }
    }
  });

  const transition = await commitStageAndUnlockNext({
    bookId: book.id,
    workflowType: book.workflowType,
    stageKey,
    committedArtifactVersionId: lastVersionId,
    committedAt: now,
  });

  return NextResponse.json({ success: true, nextStageKey: transition.nextStageKey ?? null });
}
