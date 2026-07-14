/**
 * save-dossier — saves a chapter dossier artifact without committing the stage.
 *
 * Used by PERSONAL_STORIES (Scribe) to accumulate per-chapter dossiers across
 * multiple interview sessions before the author is ready to commit the whole stage.
 *
 * Unlike /commit, this route:
 *   - Saves the artifact as COMMITTED (it's good content, not a draft)
 *   - Keeps the BookStage status as IN_PROGRESS (so the author can continue)
 *   - Does NOT advance to the next stage
 */

import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { ActorType, ArtifactStatus, ArtifactType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { ensureStageStarted } from "@/lib/workflows/stage-transition-service";
import { chapterIdentityMetadata, chapterIdentityWhere, normalizeChapterId } from "@/lib/repositories/chapter-identity";
import { createArtifactVersionInTransaction } from "@/lib/repositories/artifact-transaction-service";
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

interface SaveDossierBody {
  stageKey: StageKey;
  artifact: ArtifactDraft;
}

// Dossier stages save artifacts with per-chapter types rather than the
// encyclopedia/pack type used for the full committed stage.
const DOSSIER_ARTIFACT_TYPE: Partial<Record<StageKey, ArtifactType>> = {
  PERSONAL_STORIES: ArtifactType.PERSONAL_STORY_CHAT,
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  let body: SaveDossierBody;
  try {
    body = await parseLimitedJson(req, {
      limitBytes: REQUEST_LIMITS.chatJsonBytes,
      label: "Dossier save request",
    });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { stageKey, artifact } = body;

  if (!stageKey || !artifact) {
    return NextResponse.json({ error: "Missing stageKey or artifact" }, { status: 400 });
  }

  const artifactType = DOSSIER_ARTIFACT_TYPE[stageKey];
  if (!artifactType) {
    return NextResponse.json(
      { error: `save-dossier is not supported for stage ${stageKey}` },
      { status: 400 },
    );
  }

  try {
    // Ensure the BookStage exists and stays IN_PROGRESS
    const bookStage = await ensureStageStarted({ bookId: book.id, stageKey });

    const now = new Date();

    // Find-or-create by title (one dossier per interview/chapter title) so
    // re-saving the same chapter's dossier versions the existing artifact
    // instead of creating a second "committed" one for the same subject.
    const chapterId = normalizeChapterId(artifact.chapterId) ?? normalizeChapterId(artifact.chapterKey);
    const existingArtifact = await db.artifact.findFirst({
      where: {
        bookId: book.id,
        stageId: bookStage.id,
        artifactType,
        ...(chapterId ? chapterIdentityWhere(chapterId) : { title: artifact.title }),
      },
      select: { id: true, versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
    });

    let targetArtifactId: string;

    if (existingArtifact) {
      targetArtifactId = existingArtifact.id;
    } else {
      const created = await db.artifact.create({
        data: {
          bookId: book.id,
          stageId: bookStage.id,
          artifactType,
          ...(chapterId ? { chapterId, metadataJson: chapterIdentityMetadata(chapterId) } : {}),
          title: artifact.title,
          status: "COMMITTED",
        },
      });
      targetArtifactId = created.id;
    }

    // Save the artifact as COMMITTED — it's finished content, not a draft
    const newVersion = await createArtifactVersionInTransaction(db, {
      artifactId: targetArtifactId,
      lifecycleState: ArtifactStatus.COMMITTED,
      contentJson: { text: artifact.content },
      contentText: artifact.content,
      createdByType: ActorType.USER,
      committedAt: now,
      artifactStatus: ArtifactStatus.COMMITTED,
    });

    await db.artifact.update({
      where: { id: targetArtifactId },
      data: { committedVersionId: newVersion.id },
    });

    // Preserve older versions for audit, but remove them from active selection.
    await db.artifactVersion.updateMany({
      where: { artifactId: targetArtifactId, id: { not: newVersion.id } },
      data: { lifecycleState: ArtifactStatus.SUPERSEDED },
    });

    // Stage intentionally stays IN_PROGRESS — author has more chapters to interview
    // (no bookStage status update here)

    // Return the total saved count so the UI can show "X dossiers saved"
    const savedCount = await db.artifact.count({
      where: { stageId: bookStage.id },
    });

    return NextResponse.json({ success: true, savedCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
