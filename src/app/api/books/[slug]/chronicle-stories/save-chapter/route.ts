import { NextResponse } from "next/server";
import { ActorType, ArtifactStatus, ArtifactType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { scheduleStructuredExtraction } from "@/lib/workflows/structured-extraction";
import { ensureStageStarted } from "@/lib/workflows/stage-transition-service";
import {
  chapterIdentityMetadata,
  chapterIdentityWhere,
  getArtifactChapterId,
} from "@/lib/repositories/chapter-identity";
import { createArtifactVersionInTransaction } from "@/lib/repositories/artifact-transaction-service";
import {
  REQUEST_LIMITS,
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

// GET — return all saved chronicle dossiers for this book's EXTERNAL_STORIES stage
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "EXTERNAL_STORIES" } },
    select: { id: true, status: true },
  });

  if (!stage) return NextResponse.json({ chapters: [], stageStatus: "NOT_STARTED" });

  const artifacts = await db.artifact.findMany({
    where: { bookId: book.id, stageId: stage.id },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    orderBy: { createdAt: "asc" },
  });

  const chapters = artifacts.map((a) => ({
    artifactId: a.id,
    chapterKey: getArtifactChapterId(a) ?? "",
    chapterTitle: a.title,
    status: a.status,
    content: a.versions[0]?.contentText ?? "",
  }));

  return NextResponse.json({ chapters, stageStatus: stage.status });
}

// POST — save one chapter chronicle dossier (does NOT change stage status)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  let body: {
    chapterKey: string;
    chapterTitle: string;
    content: string;
  };
  try {
    body = await parseLimitedJson(req, {
      limitBytes: REQUEST_LIMITS.chatJsonBytes,
      label: "Chronicle chapter save request",
    });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { chapterKey, chapterTitle, content } = body;

  if (!chapterKey || !chapterTitle || !content) {
    return NextResponse.json(
      { error: "Missing chapterKey, chapterTitle, or content" },
      { status: 400 }
    );
  }

  const bookStage = await ensureStageStarted({ bookId: book.id, stageKey: "EXTERNAL_STORIES" });

  // Find-or-create by chapterKey — creating unconditionally used to spawn a
  // second Artifact for the same chapter every time this was saved again,
  // leaving two competing "committed" story packs once approve-all ran
  // (the same bug found and fixed for Chapter Draft's chat-save route).
  const existingArtifact = await db.artifact.findFirst({
    where: {
      bookId: book.id,
      stageId: bookStage.id,
      artifactType: ArtifactType.EXTERNAL_STORY_PACK,
      ...chapterIdentityWhere(chapterKey),
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
        artifactType: ArtifactType.EXTERNAL_STORY_PACK,
        chapterId: chapterKey,
        title: chapterTitle,
        status: "REVIEW_READY",
        metadataJson: chapterIdentityMetadata(chapterKey, { chapterTitle }),
      },
    });
    targetArtifactId = created.id;
  }

  const version = await createArtifactVersionInTransaction(db, {
    artifactId: targetArtifactId,
    lifecycleState: ArtifactStatus.REVIEW_READY,
    contentJson: { text: content },
    contentText: content,
    createdByType: ActorType.MODEL,
    artifactStatus: ArtifactStatus.REVIEW_READY,
    title: chapterTitle,
  });

  // Background pass: parse the dossier text into structured story rows so
  // citation-tracing and linked notes have real data.
  scheduleStructuredExtraction({
    kind: "external-stories",
    bookId: book.id,
    chapterKey,
    versionId: version.id,
    dossierText: content,
  });

  return NextResponse.json({ success: true, artifactId: targetArtifactId });
}
