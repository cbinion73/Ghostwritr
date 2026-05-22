import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  uploadBookSourceDocument,
  listBookSourceDocuments,
  setSourceDocumentEnabled,
} from "@/lib/repositories/source-documents";
import { processDocumentForKnowledgeBase } from "@/lib/services/knowledge-base";
import type { StageKey } from "@prisma/client";

export const runtime = "nodejs";

/** GET /api/books/[slug]/source-docs — list all source documents for the book */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const docs = await listBookSourceDocuments({ bookId: book.id });
  return NextResponse.json({ docs });
}

/** POST /api/books/[slug]/source-docs — upload a new source document */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const label = ((formData.get("label") as string | null) ?? "").trim();

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());

  const doc = await uploadBookSourceDocument({
    bookId: book.id,
    stageKey: "BOOK_SETUP" as StageKey,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes,
    note: label,
    customTitle: label,
  });

  // Fire-and-forget text extraction — runs in background, no await
  processDocumentForKnowledgeBase({
    documentId: doc.id,
    filePath: doc.storagePath,
    mimeType: doc.mimeType,
    fileName: file.name,
  }).catch((err: unknown) =>
    console.warn("[source-docs] text extraction failed:", err),
  );

  return NextResponse.json({ doc });
}

/** PATCH /api/books/[slug]/source-docs — toggle a document's enabled state */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  // Validate book exists before mutating
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as { documentId?: string; enabled?: boolean };
  if (!body.documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 });
  }

  await setSourceDocumentEnabled({
    documentId: body.documentId,
    enabled: Boolean(body.enabled),
  });

  return NextResponse.json({ ok: true });
}
