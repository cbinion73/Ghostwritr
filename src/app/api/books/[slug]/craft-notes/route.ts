import { NextResponse } from "next/server";

import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { appendCraftNote, getCraftNotes } from "@/lib/craft-ledger";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import {
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

/** Append an author craft instruction to the book's persistent ledger. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  let body: {
    instruction?: string;
    source?: "chapter-revision" | "editing" | "manual";
  } | null;
  try {
    body = await parseLimitedJson(req, { label: "Craft note request" });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
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
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }
  const notes = await getCraftNotes(book.id, 40);
  return NextResponse.json({ notes });
}
