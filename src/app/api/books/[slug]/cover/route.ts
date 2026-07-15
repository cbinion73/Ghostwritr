import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import {
  COVER_UPLOAD_EXTENSIONS,
  getCoverUploadError,
  MAX_COVER_UPLOAD_BYTES,
} from "@/lib/cover-upload-policy";
import { db } from "@/lib/db";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";

export const runtime = "nodejs";

const COVER_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "covers");
const MAX_COVER_MULTIPART_BYTES = MAX_COVER_UPLOAD_BYTES + 1024 * 1024;

function errorResponse(error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  const responseStatus = /book not found/i.test(message) ? 404 : status;
  return NextResponse.json({ error: message }, { status: responseStatus });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_COVER_MULTIPART_BYTES) {
    return NextResponse.json({ error: "Cover image is too large. Use an image smaller than 8 MB." }, { status: 413 });
  }

  let newPath: string | null = null;
  try {
    const user = await requireAuthenticatedAppUser();
    const { slug } = await context.params;
    const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
    const formData = await request.formData();
    const file = formData.get("cover");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a cover image to upload." }, { status: 400 });
    }

    const uploadError = getCoverUploadError(file);
    if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

    const filename = `${book.slug}-${randomUUID()}${COVER_UPLOAD_EXTENSIONS[file.type]}`;
    await mkdir(COVER_UPLOAD_DIR, { recursive: true });
    newPath = path.join(COVER_UPLOAD_DIR, filename);
    await writeFile(newPath, Buffer.from(await file.arrayBuffer()), { flag: "wx" });

    const existing = await db.book.findUnique({ where: { id: book.id }, select: { coverImageUrl: true } });
    const coverImageUrl = `/uploads/covers/${filename}`;
    await db.book.update({ where: { id: book.id }, data: { coverImageUrl } });

    if (existing?.coverImageUrl) {
      await unlink(path.join(process.cwd(), "public", existing.coverImageUrl)).catch(() => undefined);
    }
    return NextResponse.json({ coverImageUrl });
  } catch (error) {
    if (newPath) await unlink(newPath).catch(() => undefined);
    return errorResponse(error, "Cover upload failed.");
  }
}
