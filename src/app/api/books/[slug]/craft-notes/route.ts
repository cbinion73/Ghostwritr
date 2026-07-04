import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { appendCraftNote, getCraftNotes } from "@/lib/craft-ledger";

/** Append an author craft instruction to the book's persistent ledger. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    instruction?: string;
    source?: "chapter-revision" | "editing" | "manual";
  } | null;
  if (!body?.instruction || typeof body.instruction !== "string") {
    return NextResponse.json({ error: "Missing instruction" }, { status: 400 });
  }

  const note = await appendCraftNote(book.id, body.instruction, body.source ?? "chapter-revision");
  return NextResponse.json({ ok: true, saved: Boolean(note) });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  const notes = await getCraftNotes(book.id, 40);
  return NextResponse.json({ notes });
}
