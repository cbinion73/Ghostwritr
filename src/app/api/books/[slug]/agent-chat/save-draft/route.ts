import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { ActorType, ArtifactType, StageStatus } from "@prisma/client";
import { db } from "@/lib/db";

interface ArtifactDraft {
  type: string;
  title: string;
  content: string;
}

interface SaveDraftBody {
  stageKey: StageKey;
  artifact: ArtifactDraft;
}

const STAGE_ARTIFACT_TYPE: Partial<Record<StageKey, ArtifactType>> = {
  BOOK_SETUP: ArtifactType.BOOK_SETUP_PROFILE,
  PROMISE: ArtifactType.PROMISE_BRIEF,
  MARKET_ANALYSIS: ArtifactType.MARKET_REPORT,
  STORY_SETUP: ArtifactType.STORY_SETUP_PROFILE,
  STORY_CORE: ArtifactType.STORY_CORE_BIBLE,
  WORLD_CAST: ArtifactType.WORLD_CAST_BIBLE,
  PLOT_BLUEPRINT: ArtifactType.FICTION_PLOT_BLUEPRINT,
  SCENE_PLAN: ArtifactType.FICTION_SCENE_PLAN,
  FICTION_DRAFT: ArtifactType.FICTION_DRAFT_MANUSCRIPT,
  OUTLINE: ArtifactType.OUTLINE,
  BASE_STORY: ArtifactType.BASE_STORY,
  RESEARCH: ArtifactType.RESEARCH_PACK,
  EXTERNAL_STORIES: ArtifactType.EXTERNAL_STORY_PACK,
  PERSONAL_STORIES: ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
  CHAPTER_DRAFT: ArtifactType.CHAPTER_DRAFT,
  EDITING: ArtifactType.EDITORIAL_ASSESSMENT,
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = await req.json() as SaveDraftBody;
  const { stageKey, artifact } = body;

  if (!stageKey || !artifact) {
    return NextResponse.json({ error: "Missing stageKey or artifact" }, { status: 400 });
  }

  const artifactType = STAGE_ARTIFACT_TYPE[stageKey] ?? ArtifactType.BOOK_SETUP_PROFILE;

  try {
    const bookStage = await db.bookStage.upsert({
      where: { bookId_stageKey: { bookId: book.id, stageKey } },
      update: {},
      create: { bookId: book.id, stageKey, status: StageStatus.IN_PROGRESS },
    });

    const newArtifact = await db.artifact.create({
      data: {
        bookId: book.id,
        stageId: bookStage.id,
        artifactType,
        title: artifact.title,
        status: "REVIEW_READY",
      },
    });

    const newVersion = await db.artifactVersion.create({
      data: {
        artifactId: newArtifact.id,
        versionNumber: 1,
        lifecycleState: "REVIEW_READY",
        contentJson: { text: artifact.content },
        contentText: artifact.content,
        createdByType: ActorType.MODEL,
      },
    });

    await db.artifact.update({
      where: { id: newArtifact.id },
      data: { currentVersionId: newVersion.id },
    });

    await db.bookStage.update({
      where: { id: bookStage.id },
      data: { status: StageStatus.READY_FOR_REVIEW },
    });

    return NextResponse.json({ success: true, stageStatus: "READY_FOR_REVIEW" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
