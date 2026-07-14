import { NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import {
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

// ── PATCH /api/books/[slug] — update mutable book fields ─────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();
  let body: { titleWorking?: string; subtitle?: string };
  try {
    body = await parseLimitedJson(req, { label: "Book metadata update" });
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

  const data: { titleWorking?: string; subtitle?: string } = {};
  if (typeof body.titleWorking === "string") data.titleWorking = body.titleWorking.trim();
  if (typeof body.subtitle === "string") data.subtitle = body.subtitle.trim() || null as unknown as string;

  await db.book.update({ where: { id: book.id }, data });

  return NextResponse.json({ ok: true });
}
