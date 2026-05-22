import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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
  const book = await db.book.findUnique({
    where: { slug },
    select: { metadataJson: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

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
  const body = await req.json() as AuthorBio;

  const book = await db.book.findUnique({
    where: { slug },
    select: { id: true, metadataJson: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const existing = (book.metadataJson ?? {}) as Record<string, unknown>;
  const updated: Record<string, unknown> = { ...existing };
  if (typeof body.authorBioFull      === "string") updated.authorBioFull      = body.authorBioFull;
  if (typeof body.authorBioShort     === "string") updated.authorBioShort     = body.authorBioShort;
  if (typeof body.authorBioBackCover === "string") updated.authorBioBackCover = body.authorBioBackCover;

  await db.book.update({ where: { id: book.id }, data: { metadataJson: updated as Record<string, string> } });
  return NextResponse.json({ ok: true });
}
