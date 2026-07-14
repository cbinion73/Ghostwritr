import { NextResponse } from "next/server";

import { uploadWriterPersonaSample } from "@/lib/repositories/writer-personas";
import {
  REQUEST_LIMITS,
  RequestLimitError,
  assertContentLengthWithinLimit,
  assertFileCountWithinLimit,
  assertFileWithinLimit,
  requestLimitResponse,
} from "@/lib/request-limits";

export async function POST(
  request: Request,
  context: { params: Promise<{ personaId: string }> },
) {
  const { personaId } = await context.params;
  try {
    assertContentLengthWithinLimit(request, REQUEST_LIMITS.personaSampleBytes * REQUEST_LIMITS.maxFilesPerUpload, "Persona sample upload");
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }

  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const note = String(formData.get("note") ?? "").trim();

  try {
    assertFileCountWithinLimit(files.length);
    for (const file of files) {
      assertFileWithinLimit(file, REQUEST_LIMITS.personaSampleBytes, "Persona sample");
    }
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }

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
