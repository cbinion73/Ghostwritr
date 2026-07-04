import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLinkedNotesForChapter } from "@/lib/repositories/chapter-linked-notes";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; chapterKey: string }> },
) {
  const { slug, chapterKey } = await params;

  const book = await db.book.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notes = await getLinkedNotesForChapter(book.id, decodeURIComponent(chapterKey));
  return NextResponse.json(notes);
}
