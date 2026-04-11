import { NextResponse } from "next/server";

import { uploadWriterPersonaSample } from "@/lib/repositories/writer-personas";

export async function POST(
  request: Request,
  context: { params: Promise<{ personaId: string }> },
) {
  const { personaId } = await context.params;
  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const note = String(formData.get("note") ?? "").trim();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    await uploadWriterPersonaSample({
      writerPersonaId: personaId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: new Uint8Array(arrayBuffer),
      note,
      useForInspiration: true,
    });
  }

  return NextResponse.redirect(new URL("/personas", request.url), 303);
}
