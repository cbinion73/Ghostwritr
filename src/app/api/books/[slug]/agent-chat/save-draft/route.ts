import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { ActorType, ArtifactStatus, ArtifactType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { ensureStageStarted, markStageReadyForReview } from "@/lib/workflows/stage-transition-service";
import {
  chapterIdentityMetadata,
  chapterIdentityWhere,
  isChapterScopedArtifactType,
  normalizeChapterId,
} from "@/lib/repositories/chapter-identity";
import { createArtifactVersionInTransaction } from "@/lib/repositories/artifact-transaction-service";
import { markDraftPending } from "@/lib/repositories/chapter-approval-state";
import { getPrimaryArtifactTypeForStage } from "@/lib/workflow-registry";
import {
  REQUEST_LIMITS,
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

interface ArtifactDraft {
  type: string;
  title: string;
  content: string;
  chapterId?: string;
  chapterKey?: string;
}

interface SaveDraftBody {
  stageKey: StageKey;
  artifact: ArtifactDraft;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  let body: SaveDraftBody;
  try {
    body = await parseLimitedJson(req, {
      limitBytes: REQUEST_LIMITS.chatJsonBytes,
      label: "Draft save request",
    });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { stageKey, artifact } = body;

  if (!stageKey || !artifact) {
    return NextResponse.json({ error: "Missing stageKey or artifact" }, { status: 400 });
  }

  const artifactType = getPrimaryArtifactTypeForStage(stageKey) ?? ArtifactType.BOOK_SETUP_PROFILE;
  const chapterId = isChapterScopedArtifactType(artifactType)
    ? normalizeChapterId(artifact.chapterId) ?? normalizeChapterId(artifact.chapterKey)
    : null;

  try {
    const bookStage = await ensureStageStarted({ bookId: book.id, stageKey });

    const existingArtifact = chapterId
      ? await db.artifact.findFirst({
          where: {
            bookId: book.id,
            stageId: bookStage.id,
            artifactType,
            ...chapterIdentityWhere(chapterId),
          },
          select: {
            id: true,
            versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 },
          },
        })
      : null;
    const targetArtifact = existingArtifact ?? (await db.artifact.create({
        data: {
          bookId: book.id,
          stageId: bookStage.id,
          artifactType,
          ...(chapterId ? { chapterId, metadataJson: chapterIdentityMetadata(chapterId) } : {}),
          title: artifact.title,
          status: "REVIEW_READY",
        },
        select: {
          id: true,
          versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 },
        },
      }));

    const version = await createArtifactVersionInTransaction(db, {
      artifactId: targetArtifact.id,
      lifecycleState: ArtifactStatus.REVIEW_READY,
      contentJson: { text: artifact.content },
      contentText: artifact.content,
      createdByType: ActorType.MODEL,
      artifactStatus: ArtifactStatus.REVIEW_READY,
      title: artifact.title,
    });
    if (artifactType === ArtifactType.CHAPTER_DRAFT && chapterId) {
      await markDraftPending({
        bookId: book.id,
        chapterId,
        versionId: version.id,
      });
    }

    await markStageReadyForReview({ bookId: book.id, stageKey });

    return NextResponse.json({ success: true, stageStatus: "READY_FOR_REVIEW" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
