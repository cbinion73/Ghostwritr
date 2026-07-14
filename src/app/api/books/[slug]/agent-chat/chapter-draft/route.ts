import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { ActorType, ArtifactStatus, ArtifactType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { ensureStageStarted } from "@/lib/workflows/stage-transition-service";
import {
  chapterIdentityMetadata,
  chapterIdentityWhere,
  getArtifactChapterId,
} from "@/lib/repositories/chapter-identity";
import { createArtifactVersionInTransaction } from "@/lib/repositories/artifact-transaction-service";
import { markDraftPending } from "@/lib/repositories/chapter-approval-state";
import {
  REQUEST_LIMITS,
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

const CHAPTER_STAGE_KEYS: StageKey[] = ["CHAPTER_DRAFT", "FICTION_DRAFT"];

function resolveStageKey(raw: string | null): StageKey {
  if (raw && CHAPTER_STAGE_KEYS.includes(raw as StageKey)) return raw as StageKey;
  return "CHAPTER_DRAFT";
}

function resolveArtifactType(stageKey: StageKey): ArtifactType {
  return stageKey === "FICTION_DRAFT"
    ? ArtifactType.FICTION_DRAFT_MANUSCRIPT
    : ArtifactType.CHAPTER_DRAFT;
}

// GET — return all chapter artifacts for the given stage (?stageKey=CHAPTER_DRAFT)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const stageKey = resolveStageKey(url.searchParams.get("stageKey"));

  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey } },
    select: { id: true, status: true },
  });

  if (!stage) {
    return NextResponse.json({ chapters: [], stageStatus: "NOT_STARTED" });
  }

  const artifacts = await db.artifact.findMany({
    where: { bookId: book.id, stageId: stage.id },
    include: {
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
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

// POST — save a single chapter/scene draft (status REVIEW_READY)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  let body: {
    stageKey?: string;
    chapterKey: string;
    chapterTitle: string;
    content: string;
  };
  try {
    body = await parseLimitedJson(req, {
      limitBytes: REQUEST_LIMITS.chatJsonBytes,
      label: "Chapter draft save request",
    });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { chapterKey, chapterTitle, content } = body;
  const stageKey = resolveStageKey(body.stageKey ?? null);

  if (!chapterKey || !chapterTitle || !content) {
    return NextResponse.json({ error: "Missing chapterKey, chapterTitle, or content" }, { status: 400 });
  }

  const artifactType = resolveArtifactType(stageKey);

  const bookStage = await ensureStageStarted({ bookId: book.id, stageKey });

  // Find-or-create by chapterKey — this used to always create a new
  // Artifact row, so every chat save for the same chapter produced a
  // separate, competing "committed" draft once approve-all ran. Matching by
  // metadataJson.chapterKey (not title, which the structured author path
  // formats differently) keeps one Artifact per chapter across both paths.
  const existingArtifact = await db.artifact.findFirst({
    where: {
      bookId: book.id,
      stageId: bookStage.id,
      artifactType,
      ...chapterIdentityWhere(chapterKey),
      status: { not: ArtifactStatus.SUPERSEDED },
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
  await markDraftPending({
    bookId: book.id,
    chapterId: chapterKey,
    versionId: version.id,
  });

  return NextResponse.json({ success: true, artifactId: targetArtifactId });
}

// PATCH — update an existing chapter draft with new content
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  let body: { artifactId: string; content: string; chapterTitle?: string };
  try {
    body = await parseLimitedJson(req, {
      limitBytes: REQUEST_LIMITS.chatJsonBytes,
      label: "Chapter draft update request",
    });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { artifactId, content } = body;
  if (!artifactId || !content) {
    return NextResponse.json({ error: "Missing artifactId or content" }, { status: 400 });
  }

  // Find the artifact and its latest version number
  const artifact = await db.artifact.findFirst({
    where: { id: artifactId, bookId: book.id },
    select: {
      id: true,
      chapterId: true,
      metadataJson: true,
      versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });
  if (!artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });

  const version = await createArtifactVersionInTransaction(db, {
    artifactId: artifact.id,
    lifecycleState: ArtifactStatus.REVIEW_READY,
    contentJson: { text: content },
    contentText: content,
    createdByType: ActorType.USER,
    artifactStatus: ArtifactStatus.REVIEW_READY,
  });
  const chapterId = getArtifactChapterId(artifact);
  if (chapterId) {
    await markDraftPending({
      bookId: book.id,
      chapterId,
      versionId: version.id,
    });
  }

  return NextResponse.json({ success: true, versionNumber: version.versionNumber });
}
