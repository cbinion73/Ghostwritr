import { NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import {
  uploadBookSourceDocument,
  listBookSourceDocuments,
  setSourceDocumentEnabled,
} from "@/lib/repositories/source-documents";
import { processDocumentForKnowledgeBase } from "@/lib/services/knowledge-base";
import type { StageKey } from "@prisma/client";
import {
  REQUEST_LIMITS,
  RequestLimitError,
  assertContentLengthWithinLimit,
  assertFileWithinLimit,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

export const runtime = "nodejs";

/** GET /api/books/[slug]/source-docs — list all source documents for the book */
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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const docs = await listBookSourceDocuments({ bookId: book.id });
  return NextResponse.json({ docs });
}

/** POST /api/books/[slug]/source-docs — upload a new source document */
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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    assertContentLengthWithinLimit(req, REQUEST_LIMITS.sourceDocumentBytes, "Source document upload");
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const label = ((formData.get("label") as string | null) ?? "").trim();

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  try {
    assertFileWithinLimit(file, REQUEST_LIMITS.sourceDocumentBytes, "Source document");
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }

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

  // Fire-and-forget text extraction — runs in background, no await.
  // useVision: true — PDFs are sent to Claude for full vision extraction
  // (text + diagrams + visual models). Blueprint source docs often contain
  // visual frameworks that text-only extraction would silently drop.
  processDocumentForKnowledgeBase({
    documentId: doc.id,
    filePath: doc.storagePath,
    mimeType: doc.mimeType,
    fileName: file.name,
    useVision: true,
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
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { documentId?: string; enabled?: boolean };
  try {
    body = await parseLimitedJson(req, { label: "Source document update" });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  if (!body.documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 });
  }

  await setSourceDocumentEnabled({
    documentId: body.documentId,
    bookId: book.id,
    enabled: Boolean(body.enabled),
  });

  return NextResponse.json({ ok: true });
}
