import { NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getLinkedNotesForChapter } from "@/lib/repositories/chapter-linked-notes";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; chapterKey: string }> },
) {
  const { slug, chapterKey } = await params;
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const notes = await getLinkedNotesForChapter(book.id, decodeURIComponent(chapterKey));
  return NextResponse.json(notes);
}
