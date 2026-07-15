"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BookWorkflowType } from "@prisma/client";

import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import {
  cloneBookBySlug,
  createBookFromTitle,
  deleteBookBySlugForUser,
  getBookBySlugForUserOrThrow,
} from "@/lib/repositories/books";
import { db } from "@/lib/db";
import { getDefaultBookWorkspaceHref } from "@/lib/workflow-registry";
import { COVER_UPLOAD_EXTENSIONS, getCoverUploadError } from "@/lib/cover-upload-policy";

const COVER_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "covers");

function parseWorkflowType(value: FormDataEntryValue | null) {
  return value === BookWorkflowType.FICTION ? BookWorkflowType.FICTION : BookWorkflowType.NONFICTION;
}

export async function createBookAction(formData: FormData) {
  const user = await requireAuthenticatedAppUser();
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
    ownerUserId: user.id,
  });

  revalidatePath("/");
  redirect(`/books/${book.slug}/setup`);
}

export async function createBookWithWizardAction(formData: FormData) {
  const user = await requireAuthenticatedAppUser();
  const titleWorking = String(formData.get("titleWorking") ?? "").trim();
  const workflowType = parseWorkflowType(formData.get("workflowType"));

  if (!titleWorking) {
    return;
  }

  const book = await createBookFromTitle({
    titleWorking,
    subtitle: undefined,
    workflowType,
    ownerUserId: user.id,
  });

  revalidatePath("/");
  const initialStage =
    workflowType === BookWorkflowType.FICTION
      ? getDefaultBookWorkspaceHref(BookWorkflowType.FICTION, book.slug, "STORY_SETUP")
      : `/books/${book.slug}/promise`;
  redirect(initialStage);
}

export async function createBookAndBrainstormAction(formData: FormData) {
  const user = await requireAuthenticatedAppUser();
  const titleWorking = String(formData.get("titleWorking") ?? "").trim() || "Untitled Book";
  const workflowType = parseWorkflowType(formData.get("workflowType"));

  const book = await createBookFromTitle({ titleWorking, workflowType, ownerUserId: user.id });

  revalidatePath("/");
  redirect(`/books/${book.slug}`);
}

export async function archiveBookAction(formData: FormData) {
  const user = await requireAuthenticatedAppUser();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;
  const book = await getBookBySlugForUserOrThrow(slug, user.id);
  await db.book.update({
    where: { id: book.id },
    data: { isArchived: true, archivedAt: new Date() },
  });
  revalidatePath("/");
}

export async function restoreBookAction(formData: FormData) {
  const user = await requireAuthenticatedAppUser();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;
  const book = await getBookBySlugForUserOrThrow(slug, user.id);
  await db.book.update({
    where: { id: book.id },
    data: { isArchived: false, archivedAt: null },
  });
  revalidatePath("/");
}

export async function deleteBookAction(formData: FormData) {
  const user = await requireAuthenticatedAppUser();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) {
    return;
  }

  await deleteBookBySlugForUser(slug, user.id);
  revalidatePath("/");
}

export async function cloneBookAction(formData: FormData) {
  const user = await requireAuthenticatedAppUser();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) {
    return;
  }

  const source = await getBookBySlugForUserOrThrow(slug, user.id);
  const cloned = await cloneBookBySlug(source.slug);
  revalidatePath("/");
  redirect(getDefaultBookWorkspaceHref(cloned.workflowType, cloned.slug));
}

export async function uploadBookCoverAction(formData: FormData) {
  const user = await requireAuthenticatedAppUser();
  const slug = String(formData.get("slug") ?? "").trim();
  const file = formData.get("cover");
  if (!slug || !(file instanceof File) || file.size === 0) {
    return;
  }

  const uploadError = getCoverUploadError(file);
  if (uploadError) throw new Error(uploadError);
  const ext = COVER_UPLOAD_EXTENSIONS[file.type];

  await mkdir(COVER_UPLOAD_DIR, { recursive: true });
  const filename = `${slug}-${randomUUID()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(COVER_UPLOAD_DIR, filename), bytes);

  const book = await getBookBySlugForUserOrThrow(slug, user.id);
  const existing = await db.book.findUnique({ where: { id: book.id }, select: { coverImageUrl: true } });
  await db.book.update({
    where: { id: book.id },
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
  const user = await requireAuthenticatedAppUser();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;

  const book = await getBookBySlugForUserOrThrow(slug, user.id);
  const existing = await db.book.findUnique({ where: { id: book.id }, select: { coverImageUrl: true } });
  await db.book.update({ where: { id: book.id }, data: { coverImageUrl: null } });

  if (existing?.coverImageUrl) {
    const oldPath = path.join(process.cwd(), "public", existing.coverImageUrl);
    await unlink(oldPath).catch(() => {
      // Best-effort cleanup.
    });
  }

  revalidatePath("/");
}
