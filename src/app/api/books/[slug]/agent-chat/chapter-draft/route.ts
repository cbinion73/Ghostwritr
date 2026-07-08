import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { ActorType, ArtifactStatus, ArtifactType, StageStatus } from "@prisma/client";
import { db } from "@/lib/db";

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

  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
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
    chapterKey: (a.metadataJson as Record<string, string> | null)?.chapterKey ?? "",
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
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = await req.json() as {
    stageKey?: string;
    chapterKey: string;
    chapterTitle: string;
    content: string;
  };
  const { chapterKey, chapterTitle, content } = body;
  const stageKey = resolveStageKey(body.stageKey ?? null);

  if (!chapterKey || !chapterTitle || !content) {
    return NextResponse.json({ error: "Missing chapterKey, chapterTitle, or content" }, { status: 400 });
  }

  const artifactType = resolveArtifactType(stageKey);

  const bookStage = await db.bookStage.upsert({
    where: { bookId_stageKey: { bookId: book.id, stageKey } },
    update: {},
    create: { bookId: book.id, stageKey, status: StageStatus.IN_PROGRESS },
  });

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
      metadataJson: { path: ["chapterKey"], equals: chapterKey },
      status: { not: ArtifactStatus.SUPERSEDED },
    },
    select: { id: true, versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  let targetArtifactId: string;
  let nextVersionNumber: number;

  if (existingArtifact) {
    targetArtifactId = existingArtifact.id;
    nextVersionNumber = (existingArtifact.versions[0]?.versionNumber ?? 0) + 1;
  } else {
    const created = await db.artifact.create({
      data: {
        bookId: book.id,
        stageId: bookStage.id,
        artifactType,
        title: chapterTitle,
        status: "REVIEW_READY",
        metadataJson: { chapterKey, chapterTitle },
      },
    });
    targetArtifactId = created.id;
    nextVersionNumber = 1;
  }

  const version = await db.artifactVersion.create({
    data: {
      artifactId: targetArtifactId,
      versionNumber: nextVersionNumber,
      lifecycleState: "REVIEW_READY",
      contentJson: { text: content },
      contentText: content,
      createdByType: ActorType.MODEL,
    },
  });

  await db.artifact.update({
    where: { id: targetArtifactId },
    data: { currentVersionId: version.id, title: chapterTitle, status: "REVIEW_READY" },
  });

  return NextResponse.json({ success: true, artifactId: targetArtifactId });
}

// PATCH — update an existing chapter draft with new content
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = await req.json() as { artifactId: string; content: string; chapterTitle?: string };
  const { artifactId, content } = body;
  if (!artifactId || !content) {
    return NextResponse.json({ error: "Missing artifactId or content" }, { status: 400 });
  }

  // Find the artifact and its latest version number
  const artifact = await db.artifact.findFirst({
    where: { id: artifactId, bookId: book.id },
    select: { id: true, versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (!artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });

  const nextVersion = (artifact.versions[0]?.versionNumber ?? 0) + 1;

  const version = await db.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      versionNumber: nextVersion,
      lifecycleState: "REVIEW_READY",
      contentJson: { text: content },
      contentText: content,
      createdByType: ActorType.USER, // edited by author
    },
  });

  await db.artifact.update({
    where: { id: artifact.id },
    data: { currentVersionId: version.id, status: "REVIEW_READY" },
  });

  return NextResponse.json({ success: true, versionNumber: nextVersion });
}
