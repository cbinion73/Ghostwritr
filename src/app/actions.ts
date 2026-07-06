"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BookWorkflowType } from "@prisma/client";

import { cloneBookBySlug, createBookFromTitle, deleteBookBySlug } from "@/lib/repositories/books";
import { db } from "@/lib/db";
import { getDefaultBookWorkspaceHref } from "@/lib/workflow-registry";

const COVER_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "covers");
const ALLOWED_COVER_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

function parseWorkflowType(value: FormDataEntryValue | null) {
  return value === BookWorkflowType.FICTION ? BookWorkflowType.FICTION : BookWorkflowType.NONFICTION;
}

export async function createBookAction(formData: FormData) {
  const titleWorking = String(formData.get("titleWorking") ?? "").trim();
  const subtitle = String(formData.get("subtitle") ?? "").trim();
  const workflowType = parseWorkflowType(formData.get("workflowType"));

  if (!titleWorking) {
    return;
  }

  const book = await createBookFromTitle({
    titleWorking,
    subtitle: subtitle || undefined,
    workflowType,
  });

  revalidatePath("/");
  redirect(`/books/${book.slug}/setup`);
}

export async function createBookWithWizardAction(formData: FormData) {
  const titleWorking = String(formData.get("titleWorking") ?? "").trim();
  const workflowType = parseWorkflowType(formData.get("workflowType"));

  if (!titleWorking) {
    return;
  }

  const book = await createBookFromTitle({
    titleWorking,
    subtitle: undefined,
    workflowType,
  });

  revalidatePath("/");
  const initialStage =
    workflowType === BookWorkflowType.FICTION
      ? getDefaultBookWorkspaceHref(BookWorkflowType.FICTION, book.slug, "STORY_SETUP")
      : `/books/${book.slug}/promise`;
  redirect(initialStage);
}

export async function createBookAndBrainstormAction(formData: FormData) {
  const titleWorking = String(formData.get("titleWorking") ?? "").trim() || "Untitled Book";
  const workflowType = parseWorkflowType(formData.get("workflowType"));

  const book = await createBookFromTitle({ titleWorking, workflowType });

  revalidatePath("/");
  redirect(`/books/${book.slug}`);
}

export async function archiveBookAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;
  await db.book.update({
    where: { slug },
    data: { isArchived: true, archivedAt: new Date() },
  });
  revalidatePath("/");
}

export async function restoreBookAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;
  await db.book.update({
    where: { slug },
    data: { isArchived: false, archivedAt: null },
  });
  revalidatePath("/");
}

export async function deleteBookAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) {
    return;
  }

  await deleteBookBySlug(slug);
  revalidatePath("/");
}

export async function cloneBookAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) {
    return;
  }

  const cloned = await cloneBookBySlug(slug);
  revalidatePath("/");
  redirect(getDefaultBookWorkspaceHref(cloned.workflowType, cloned.slug));
}

export async function uploadBookCoverAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const file = formData.get("cover");
  if (!slug || !(file instanceof File) || file.size === 0) {
    return;
  }

  const ext = ALLOWED_COVER_TYPES[file.type];
  if (!ext) {
    throw new Error(`Unsupported spine image type: ${file.type || "unknown"}. Use PNG, JPEG, or WebP.`);
  }

  await mkdir(COVER_UPLOAD_DIR, { recursive: true });
  const filename = `${slug}-${randomUUID()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(COVER_UPLOAD_DIR, filename), bytes);

  const existing = await db.book.findUnique({ where: { slug }, select: { coverImageUrl: true } });
  await db.book.update({
    where: { slug },
    data: { coverImageUrl: `/uploads/covers/${filename}` },
  });

  if (existing?.coverImageUrl) {
    const oldPath = path.join(process.cwd(), "public", existing.coverImageUrl);
    await unlink(oldPath).catch(() => {
      // Best-effort cleanup — a missing old file shouldn't block the new upload.
    });
  }

  revalidatePath("/");
}

export async function removeBookCoverAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;

  const existing = await db.book.findUnique({ where: { slug }, select: { coverImageUrl: true } });
  await db.book.update({ where: { slug }, data: { coverImageUrl: null } });

  if (existing?.coverImageUrl) {
    const oldPath = path.join(process.cwd(), "public", existing.coverImageUrl);
    await unlink(oldPath).catch(() => {
      // Best-effort cleanup.
    });
  }

  revalidatePath("/");
}
