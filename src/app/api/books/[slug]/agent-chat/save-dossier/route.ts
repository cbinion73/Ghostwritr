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
import { ActorType, ArtifactType, StageStatus } from "@prisma/client";
import { db } from "@/lib/db";

interface ArtifactDraft {
  type: string;
  title: string;
  content: string;
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

  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = await req.json() as SaveDossierBody;
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
    const bookStage = await db.bookStage.upsert({
      where: { bookId_stageKey: { bookId: book.id, stageKey } },
      update: {},
      create: { bookId: book.id, stageKey, status: StageStatus.IN_PROGRESS },
    });

    const now = new Date();

    // Save the artifact as COMMITTED — it's finished content, not a draft
    const newArtifact = await db.artifact.create({
      data: {
        bookId: book.id,
        stageId: bookStage.id,
        artifactType,
        title: artifact.title,
        status: "COMMITTED",
      },
    });

    const newVersion = await db.artifactVersion.create({
      data: {
        artifactId: newArtifact.id,
        versionNumber: 1,
        lifecycleState: "COMMITTED",
        contentJson: { text: artifact.content },
        contentText: artifact.content,
        createdByType: ActorType.USER,
        committedAt: now,
      },
    });

    await db.artifact.update({
      where: { id: newArtifact.id },
      data: { committedVersionId: newVersion.id },
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
