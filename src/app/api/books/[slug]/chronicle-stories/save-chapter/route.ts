import { NextResponse } from "next/server";
import { ActorType, ArtifactType, StageStatus } from "@prisma/client";
import { db } from "@/lib/db";

// GET — return all saved chronicle dossiers for this book's EXTERNAL_STORIES stage
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
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
    chapterKey: (a.metadataJson as Record<string, string> | null)?.chapterKey ?? "",
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
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = (await req.json()) as {
    chapterKey: string;
    chapterTitle: string;
    content: string;
  };
  const { chapterKey, chapterTitle, content } = body;

  if (!chapterKey || !chapterTitle || !content) {
    return NextResponse.json(
      { error: "Missing chapterKey, chapterTitle, or content" },
      { status: 400 }
    );
  }

  const bookStage = await db.bookStage.upsert({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "EXTERNAL_STORIES" } },
    update: {},
    create: { bookId: book.id, stageKey: "EXTERNAL_STORIES", status: StageStatus.IN_PROGRESS },
  });

  const artifact = await db.artifact.create({
    data: {
      bookId: book.id,
      stageId: bookStage.id,
      artifactType: ArtifactType.EXTERNAL_STORY_PACK,
      title: chapterTitle,
      status: "REVIEW_READY",
      metadataJson: { chapterKey, chapterTitle },
    },
  });

  const version = await db.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      versionNumber: 1,
      lifecycleState: "REVIEW_READY",
      contentJson: { text: content },
      contentText: content,
      createdByType: ActorType.MODEL,
    },
  });

  await db.artifact.update({
    where: { id: artifact.id },
    data: { currentVersionId: version.id },
  });

  return NextResponse.json({ success: true, artifactId: artifact.id });
}
