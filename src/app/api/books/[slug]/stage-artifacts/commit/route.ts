import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { ActorType, ArtifactType } from "@prisma/client";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { notifyStageCommitted, triggerPreLaunch, syncBookToJarvis, notifyPostProductionCommitted } from "@/lib/jarvis/client";
import { scheduleStructuredExtraction } from "@/lib/workflows/structured-extraction";
import { pruneToSingleCommittedArtifact } from "@/lib/repositories/artifact-lifecycle";
import { commitStageAndUnlockNext, ensureStageStarted } from "@/lib/workflows/stage-transition-service";
import { chapterIdentityMetadata, chapterIdentityWhere } from "@/lib/repositories/chapter-identity";
import { commitArtifactVersionInTransaction } from "@/lib/repositories/artifact-transaction-service";
import { markDraftApproved } from "@/lib/repositories/chapter-approval-state";
import { getPrimaryArtifactTypeForStage } from "@/lib/workflow-registry";
import {
  REQUEST_LIMITS,
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

// Chapter-scoped stages tag their title as "{prefix}: {chapterKey} - {chapterTitle}"
// — parse the key out so a chat-committed dossier can be matched against the
// structured author path's Artifact for the same chapter (which does tag
// metadataJson.chapterKey), not just against its own title.
const CHAPTER_TITLE_PREFIX: Partial<Record<StageKey, string>> = {
  CHAPTER_DRAFT: "Chapter Draft: ",
  RESEARCH: "Research Pack: ",
  EXTERNAL_STORIES: "External Stories: ",
};

function parseChapterKeyFromTitle(stageKey: StageKey, title: string): string | null {
  const prefix = CHAPTER_TITLE_PREFIX[stageKey];
  if (!prefix || !title.startsWith(prefix)) return null;
  const remainder = title.slice(prefix.length);
  const separatorIndex = remainder.indexOf(" - ");
  return separatorIndex >= 0 ? remainder.slice(0, separatorIndex) : remainder;
}

interface ArtifactDraft {
  type: string;
  title: string;
  content: string;
}

interface CommitBody {
  stageKey: StageKey;
  artifact: ArtifactDraft;
  /** Explicit human override for enforced gates (e.g. Market Viability). */
  force?: boolean;
}

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

  let body: CommitBody;
  try {
    body = await parseLimitedJson(req, {
      limitBytes: REQUEST_LIMITS.chatJsonBytes,
      label: "Stage commit request",
    });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { stageKey, artifact } = body;

  if (!stageKey || !artifact) {
    return NextResponse.json({ error: "Missing stageKey or artifact" }, { status: 400 });
  }

  if (stageKey === "PROMISE" || stageKey === "MARKET_ANALYSIS") {
    return NextResponse.json(
      {
        error:
          "Phase 1 must be committed through the Promise room so GHOSTWRITR can create the approved strategic brief before downstream stages unlock.",
      },
      { status: 409 },
    );
  }

  const artifactType = getPrimaryArtifactTypeForStage(stageKey) ?? ArtifactType.BOOK_SETUP_PROFILE;

  try {
    // Find or create the BookStage
    const bookStage = await ensureStageStarted({ bookId: book.id, stageKey });

    const now = new Date();
    const chapterKey = parseChapterKeyFromTitle(stageKey, artifact.title);

    // Find-or-create the Artifact. Chapter-scoped stages match by
    // chapterKey first (so this chat commit lands on the same Artifact the
    // structured author path uses for that chapter, not a second one), then
    // fall back to an exact title match for everything else.
    const existingArtifact = await db.artifact.findFirst({
      where: {
        stageId: bookStage.id,
        OR: [
          ...(chapterKey ? [chapterIdentityWhere(chapterKey)] : []),
          { title: artifact.title },
        ],
      },
      orderBy: { updatedAt: "desc" },
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
          ...(chapterKey ? { chapterId: chapterKey, metadataJson: chapterIdentityMetadata(chapterKey) } : {}),
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

    await commitArtifactVersionInTransaction(db, {
      artifactId: targetArtifactId,
      versionId: newVersion.id,
      committedAt: now,
    });
    if (stageKey === "CHAPTER_DRAFT" && chapterKey) {
      await markDraftApproved({
        bookId: book.id,
        chapterId: chapterKey,
        versionId: newVersion.id,
      });
    }

    // Only the committed version/artifact should persist for this stage
    // (or this chapter, for chapter-scoped stages) — prunes both the
    // artifact's own earlier draft versions and any duplicate Artifact row
    // the structured author path created for the same chapterKey.
    await pruneToSingleCommittedArtifact(db, {
      bookId: book.id,
      stageId: bookStage.id,
      artifactType,
      keepArtifactId: targetArtifactId,
      keepVersionId: newVersion.id,
      chapterKey,
    });

    // Research / External Stories dossiers also get a background structured
    // extraction pass so the queryable knowledge tables stay in sync.
    if (stageKey === "RESEARCH" || stageKey === "EXTERNAL_STORIES") {
      const existingMeta = await db.artifact.findUnique({
        where: { id: targetArtifactId },
        select: { metadataJson: true },
      });
      const chapterKey =
        (existingMeta?.metadataJson as Record<string, string> | null)?.chapterKey ?? "book";
      scheduleStructuredExtraction({
        kind: stageKey === "RESEARCH" ? "research" : "external-stories",
        bookId: book.id,
        chapterKey,
        versionId: newVersion.id,
        dossierText: artifact.content,
      });
    }

    // Mark stage COMMITTED and centrally unlock the next stage. EDITING is
    // exempt — Reed commits individual chapter revisions one at a time; we
    // stay on EDITING until the author approves final chapters and advances.
    const transition = await commitStageAndUnlockNext({
      bookId: book.id,
      workflowType: book.workflowType,
      stageKey,
      committedArtifactVersionId: newVersion.id,
      committedAt: now,
      unlockNext: stageKey !== "EDITING",
    });

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
      AUDIO_PREP:      "Studio",
      COURSE_DESIGN:   "Podium",
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

    return NextResponse.json({ success: true, stageStatus: "COMMITTED", nextStageKey: transition.nextStageKey ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
