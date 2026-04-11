import { NextResponse } from "next/server";
import { StageKey } from "@prisma/client";

import { getOrCreateBookBySlug } from "@/lib/repositories/books";
import { createDirectionEvent } from "@/lib/repositories/direction-events";
import { uploadBookSourceDocument } from "@/lib/repositories/source-documents";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const book = await getOrCreateBookBySlug(slug);
  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const note = String(formData.get("note") ?? "").trim();

  if (files.length > 0) {
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();

      await uploadBookSourceDocument({
        bookId: book.id,
        stageKey: StageKey.PROMISE,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes: new Uint8Array(arrayBuffer),
        note,
        metadataJson: {
          uploadedDuring: "PROMISE",
          enabled: true,
        },
      });
    }

    await createDirectionEvent({
      bookId: book.id,
      stageKey: StageKey.PROMISE,
      eventType: "PROMISE_REFERENCE_UPLOADED",
      title: "Uploaded promise reference material",
      content: files.map((file) => file.name).join(", "),
      metadataJson: {
        fileCount: files.length,
        note,
      },
    });
  }

  return NextResponse.redirect(new URL(`/books/${slug}/promise`, request.url), 303);
}
