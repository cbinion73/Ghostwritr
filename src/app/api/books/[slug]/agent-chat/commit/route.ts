import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { ActorType, ArtifactType, StageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";
import { notifyStageCommitted, triggerPreLaunch, syncBookToJarvis, notifyPostProductionCommitted } from "@/lib/jarvis/client";

interface ArtifactDraft {
  type: string;
  title: string;
  content: string;
}

interface CommitBody {
  stageKey: StageKey;
  artifact: ArtifactDraft;
}

// Map stage key to a reasonable ArtifactType, falling back to BOOK_SETUP_PROFILE
const STAGE_ARTIFACT_TYPE: Partial<Record<StageKey, ArtifactType>> = {
  // Nonfiction core
  BOOK_SETUP:       ArtifactType.BOOK_SETUP_PROFILE,
  PROMISE:          ArtifactType.PROMISE_BRIEF,
  AUDIENCE:         ArtifactType.AUDIENCE_RESEARCH,
  MARKET_ANALYSIS:  ArtifactType.MARKET_REPORT,
  OUTLINE:          ArtifactType.OUTLINE,
  BASE_STORY:       ArtifactType.BASE_STORY,
  RESEARCH:         ArtifactType.RESEARCH_PACK,
  EXTERNAL_STORIES: ArtifactType.EXTERNAL_STORY_PACK,
  PERSONAL_STORIES: ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
  MANIFEST:         ArtifactType.CHAPTER_MANIFEST,
  CHAPTER_DRAFT:    ArtifactType.CHAPTER_DRAFT,
  EDITING:          ArtifactType.EDITORIAL_ASSESSMENT,
  TYPESET:          ArtifactType.TYPESET_PACKAGE,
  // Post-production
  LAUNCH_LISTING:   ArtifactType.LAUNCH_LISTING_PACKAGE,
  PRESS_KIT:        ArtifactType.PRESS_KIT_PACKAGE,
  SOCIAL_CAMPAIGN:  ArtifactType.SOCIAL_CAMPAIGN_PACKAGE,
  AUDIO_PREP:       ArtifactType.AUDIO_PREP_PACKAGE,
  COURSE_DESIGN:    ArtifactType.COURSE_DESIGN_PACKAGE,
  SPEAKING_KIT:     ArtifactType.SPEAKING_KIT_PACKAGE,
  // Fiction
  STORY_SETUP:      ArtifactType.STORY_SETUP_PROFILE,
  STORY_CORE:       ArtifactType.STORY_CORE_BIBLE,
  WORLD_CAST:       ArtifactType.WORLD_CAST_BIBLE,
  PLOT_BLUEPRINT:   ArtifactType.FICTION_PLOT_BLUEPRINT,
  SCENE_PLAN:       ArtifactType.FICTION_SCENE_PLAN,
  FICTION_DRAFT:    ArtifactType.FICTION_DRAFT_MANUSCRIPT,
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const book = await db.book.findUnique({
    where: { slug },
    select: { id: true, workflowType: true, titleWorking: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = await req.json() as CommitBody;
  const { stageKey, artifact } = body;

  if (!stageKey || !artifact) {
    return NextResponse.json({ error: "Missing stageKey or artifact" }, { status: 400 });
  }

  const artifactType = STAGE_ARTIFACT_TYPE[stageKey] ?? ArtifactType.BOOK_SETUP_PROFILE;

  try {
    // Find or create the BookStage
    const bookStage = await db.bookStage.upsert({
      where: {
        bookId_stageKey: {
          bookId: book.id,
          stageKey,
        },
      },
      update: {},
      create: {
        bookId: book.id,
        stageKey,
        status: StageStatus.IN_PROGRESS,
      },
    });

    const now = new Date();

    // Find-or-create the Artifact by title to prevent duplicate dossiers from
    // rapid saves / double-clicks / network retries.
    const existingArtifact = await db.artifact.findFirst({
      where: {
        stageId: bookStage.id,
        title: artifact.title,
      },
      select: { id: true, versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
    });

    let targetArtifactId: string;
    let nextVersionNumber: number;

    if (existingArtifact) {
      // Artifact already exists — add a new version rather than a duplicate artifact
      targetArtifactId = existingArtifact.id;
      nextVersionNumber = (existingArtifact.versions[0]?.versionNumber ?? 0) + 1;
    } else {
      const newArtifact = await db.artifact.create({
        data: {
          bookId: book.id,
          stageId: bookStage.id,
          artifactType,
          title: artifact.title,
          status: "COMMITTED",
        },
      });
      targetArtifactId = newArtifact.id;
      nextVersionNumber = 1;
    }

    // Create the ArtifactVersion
    const newVersion = await db.artifactVersion.create({
      data: {
        artifactId: targetArtifactId,
        versionNumber: nextVersionNumber,
        lifecycleState: "COMMITTED",
        contentJson: { text: artifact.content },
        contentText: artifact.content,
        createdByType: ActorType.USER,
        committedAt: now,
      },
    });

    // Point artifact to its latest committed version
    await db.artifact.update({
      where: { id: targetArtifactId },
      data: { committedVersionId: newVersion.id },
    });

    // Mark stage COMMITTED and record the committed artifact version
    await db.bookStage.update({
      where: { id: bookStage.id },
      data: {
        status: StageStatus.COMMITTED,
        committedArtifactVersionId: newVersion.id,
        committedAt: now,
      },
    });

    // Advance: mark next stage IN_PROGRESS to trigger autonomous run.
    // EDITING is exempt — Reed commits individual chapter revisions one at a time;
    // we stay on EDITING until the author is done with all chapters and manually
    // advances to TYPESET.
    const stageOrder = getWorkflowStageKeys(book.workflowType);
    const currentIdx = stageOrder.indexOf(stageKey);
    const nextStageKey = stageKey !== "EDITING" && currentIdx >= 0 && currentIdx < stageOrder.length - 1
      ? stageOrder[currentIdx + 1]
      : null;

    if (nextStageKey) {
      // Only advance if next stage is not already committed — don't overwrite finished work
      await db.bookStage.upsert({
        where: { bookId_stageKey: { bookId: book.id, stageKey: nextStageKey } },
        update: { status: StageStatus.IN_PROGRESS },
        create: { bookId: book.id, stageKey: nextStageKey, status: StageStatus.IN_PROGRESS },
      });
      // Roll back if it was already committed
      await db.bookStage.updateMany({
        where: {
          bookId: book.id,
          stageKey: nextStageKey,
          committedAt: { not: null },
          status: StageStatus.IN_PROGRESS,
          committedArtifactVersionId: { not: null },
        },
        data: { status: StageStatus.COMMITTED },
      });
    }

    // ── JARVIS integration — fire and forget, never blocks the response ──────
    const bookTitle = book.titleWorking ?? slug;
    notifyStageCommitted({ slug, stageKey, bookTitle });

    if (stageKey === "EDITING") {
      // Writing is complete — trigger JARVIS pre-launch marketing prep
      triggerPreLaunch({ slug, bookTitle });
    }
    if (stageKey === "BOOK_SETUP") {
      // New book created — sync to JARVIS idea inbox
      syncBookToJarvis({ slug, title: bookTitle });
    }

    // Post-production stages — send committed artifact content to JARVIS
    const POST_PRODUCTION_AGENTS: Partial<Record<string, string>> = {
      LAUNCH_LISTING:  "Marquee",
      PRESS_KIT:       "Bureau",
      SOCIAL_CAMPAIGN: "Dispatch",
      AUDIO_PREP:      "Studio",
      COURSE_DESIGN:   "Podium",
      SPEAKING_KIT:    "Lectern",
    };
    if (stageKey in POST_PRODUCTION_AGENTS) {
      notifyPostProductionCommitted({
        slug,
        bookTitle,
        stageKey,
        agentName: POST_PRODUCTION_AGENTS[stageKey] ?? stageKey,
        artifactContent: artifact.content,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    return NextResponse.json({ success: true, stageStatus: "COMMITTED", nextStageKey: nextStageKey ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
