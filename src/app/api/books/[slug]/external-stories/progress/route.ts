import { NextResponse } from "next/server";
import { StageKey } from "@prisma/client";

import { parseMetadataRecord } from "@/lib/artifact-schemas";
import { getBookBySlugOrThrow, getStageForBook } from "@/lib/repositories/books";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let book;
  try {
    book = await getBookBySlugOrThrow(slug);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stage = await getStageForBook(book.id, StageKey.EXTERNAL_STORIES);
  const metadata = parseMetadataRecord(stage?.metadataJson);

  return NextResponse.json({
    status: stage?.status ?? "NOT_STARTED",
    automationStatus: typeof metadata.automationStatus === "string" ? metadata.automationStatus : null,
    currentAction: typeof metadata.currentAction === "string" ? metadata.currentAction : null,
    currentChapterKey: typeof metadata.currentChapterKey === "string" ? metadata.currentChapterKey : null,
    totalChapters: typeof metadata.totalChapters === "number" ? metadata.totalChapters : 0,
    completedChapters: typeof metadata.completedChapters === "number" ? metadata.completedChapters : 0,
    failedChapters: Array.isArray(metadata.failedChapters)
      ? metadata.failedChapters.filter(
          (entry): entry is { chapterKey: string; message: string } =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as { chapterKey?: unknown }).chapterKey === "string" &&
            typeof (entry as { message?: unknown }).message === "string",
        )
      : [],
    recentActivity: Array.isArray(metadata.recentActivity)
      ? metadata.recentActivity.filter(
          (entry): entry is { at: string; message: string } =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as { at?: unknown }).at === "string" &&
            typeof (entry as { message?: unknown }).message === "string",
        )
      : [],
    lastRunAt: typeof metadata.lastRunAt === "string" ? metadata.lastRunAt : null,
  });
}
