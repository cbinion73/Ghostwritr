import { NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import {
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

type AuthorBio = {
  authorBioFull?: string;
  authorBioShort?: string;
  authorBioBackCover?: string;
};

// ── GET /api/books/[slug]/author ──────────────────────────────────────────────
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

  const meta = (book.metadataJson ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    authorBioFull:      (meta.authorBioFull      as string) ?? "",
    authorBioShort:     (meta.authorBioShort     as string) ?? "",
    authorBioBackCover: (meta.authorBioBackCover as string) ?? "",
  });
}

// ── PATCH /api/books/[slug]/author ────────────────────────────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();
  let body: AuthorBio;
  try {
    body = await parseLimitedJson(req, { label: "Author profile update" });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const existing = (book.metadataJson ?? {}) as Record<string, unknown>;
  const updated: Record<string, unknown> = { ...existing };
  if (typeof body.authorBioFull      === "string") updated.authorBioFull      = body.authorBioFull;
  if (typeof body.authorBioShort     === "string") updated.authorBioShort     = body.authorBioShort;
  if (typeof body.authorBioBackCover === "string") updated.authorBioBackCover = body.authorBioBackCover;

  await db.book.update({ where: { id: book.id }, data: { metadataJson: updated as Record<string, string> } });
  return NextResponse.json({ ok: true });
}
