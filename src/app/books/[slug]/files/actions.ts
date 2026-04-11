"use server";

import { revalidatePath } from "next/cache";
import { StageKey } from "@prisma/client";

import { getOrCreateBookBySlug } from "@/lib/repositories/books";
import { createDirectionEvent } from "@/lib/repositories/direction-events";
import { setSourceDocumentEnabled } from "@/lib/repositories/source-documents";

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
