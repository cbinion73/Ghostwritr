import { NextResponse } from "next/server";
import { ActorType, ArtifactType, StageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { scheduleStructuredExtraction } from "@/lib/workflows/structured-extraction";

// GET — return all saved research dossiers for this book's RESEARCH stage
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "RESEARCH" } },
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

// POST — save one chapter research dossier (does NOT change stage status)
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

  // Ensure the stage exists — keep it IN_PROGRESS while chapters accumulate
  const bookStage = await db.bookStage.upsert({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "RESEARCH" } },
    update: {},
    create: { bookId: book.id, stageKey: "RESEARCH", status: StageStatus.IN_PROGRESS },
  });

  const artifact = await db.artifact.create({
    data: {
      bookId: book.id,
      stageId: bookStage.id,
      artifactType: ArtifactType.RESEARCH_PACK,
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

  // Background pass: parse the dossier text into structured ResearchItem/
  // ResearchSource rows so citation-tracing and linked notes have real data.
  scheduleStructuredExtraction({
    kind: "research",
    bookId: book.id,
    chapterKey,
    versionId: version.id,
    dossierText: content,
  });

  return NextResponse.json({ success: true, artifactId: artifact.id });
}
