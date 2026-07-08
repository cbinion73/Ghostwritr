import { NextResponse } from "next/server";
import { ActorType, ArtifactType, StageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { scheduleStructuredExtraction } from "@/lib/workflows/structured-extraction";

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

  // Find-or-create by chapterKey — creating unconditionally used to spawn a
  // second Artifact for the same chapter every time this was saved again,
  // leaving two competing "committed" story packs once approve-all ran
  // (the same bug found and fixed for Chapter Draft's chat-save route).
  const existingArtifact = await db.artifact.findFirst({
    where: {
      bookId: book.id,
      stageId: bookStage.id,
      artifactType: ArtifactType.EXTERNAL_STORY_PACK,
      metadataJson: { path: ["chapterKey"], equals: chapterKey },
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
        artifactType: ArtifactType.EXTERNAL_STORY_PACK,
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
