"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BookWorkflowType } from "@prisma/client";

import { cloneBookBySlug, createBookFromTitle, deleteBookBySlug } from "@/lib/repositories/books";
import { getDefaultBookWorkspaceHref } from "@/lib/workflow-registry";

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
