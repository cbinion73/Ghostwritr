import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ── PATCH /api/books/[slug] — update mutable book fields ─────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await req.json() as { titleWorking?: string; subtitle?: string };

  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const data: { titleWorking?: string; subtitle?: string } = {};
  if (typeof body.titleWorking === "string") data.titleWorking = body.titleWorking.trim();
  if (typeof body.subtitle === "string") data.subtitle = body.subtitle.trim() || null as unknown as string;

  await db.book.update({ where: { id: book.id }, data });

  return NextResponse.json({ ok: true });
}
