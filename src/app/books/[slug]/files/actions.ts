"use server";

import { revalidatePath } from "next/cache";
import { StageKey } from "@prisma/client";

import { getOrCreateBookBySlug } from "@/lib/repositories/books";
import { createDirectionEvent } from "@/lib/repositories/direction-events";
import { setSourceDocumentEnabled, uploadBookSourceDocument } from "@/lib/repositories/source-documents";
import { processDocumentForKnowledgeBase } from "@/lib/services/knowledge-base";

export async function toggleBookFileAction(
  slug: string,
  documentId: string,
  enabled: boolean,
) {
  const book = await getOrCreateBookBySlug(slug);

  await setSourceDocumentEnabled({
    documentId,
    enabled,
  });

  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: enabled ? "BOOK_FILE_ENABLED" : "BOOK_FILE_DISABLED",
    title: enabled ? "Enabled book file" : "Disabled book file",
    metadataJson: {
      documentId,
      enabled,
    },
  });

  revalidatePath(`/books/${slug}/files`);
  revalidatePath(`/books/${slug}/promise`);
}

export async function uploadBookFileAction(
  slug: string,
  formData: FormData,
) {
  const book = await getOrCreateBookBySlug(slug);

  const file = formData.get("file") as File | null;
  const note = formData.get("note") as string | null;

  if (!file) {
    throw new Error("No file provided");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const document = await uploadBookSourceDocument({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes,
    note: note || undefined,
  });

  // Extract text from document for knowledge base (async, non-blocking)
  try {
    const sourceStoragePath = document.storagePath;
    const extractionResult = await processDocumentForKnowledgeBase({
      documentId: document.id,
      filePath: sourceStoragePath,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
    });

    console.log(
      `[uploadBookFileAction] Knowledge base processing: ${extractionResult.chunkCount} chunks extracted from ${file.name}`
    );
  } catch (error) {
    // Log error but don't fail the upload if knowledge base processing fails
    console.error(
      "[uploadBookFileAction] Knowledge base extraction failed:",
      error instanceof Error ? error.message : error
    );
  }

  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: "BOOK_FILE_UPLOADED",
    title: `Uploaded file: ${file.name}`,
    metadataJson: {
      documentId: document.id,
      fileName: file.name,
      fileSize: file.size,
    },
  });

  revalidatePath(`/books/${slug}/files`);
  revalidatePath(`/books/${slug}/promise`);
}
