"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { commitOutlineWorkflow, runOutlineWorkflow } from "@/lib/workflows/outline";
import {
  commitParagraphOutlineWorkflow,
  runParagraphOutlineWorkflow,
} from "@/lib/workflows/outline-paragraphs";

export async function generateOutline(slug: string, formData: FormData) {
  const note = String(formData.get("note") ?? "").trim();

  await runOutlineWorkflow(slug, {
    userInput: note || undefined,
  });

  revalidatePath(`/books/${slug}/outline`);
}

export async function commentOnOutlineItem(slug: string, formData: FormData) {
  const comment = String(formData.get("comment") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim();
  const targetTypeValue = String(formData.get("targetType") ?? "").trim();
  const targetType =
    targetTypeValue === "chapter" || targetTypeValue === "section"
      ? targetTypeValue
      : undefined;

  await runOutlineWorkflow(slug, {
    revisionComment: comment || "Sharpen this part of the outline while keeping the book coherent.",
    revisionTargetId: targetId || undefined,
    revisionTargetType: targetType,
  });

  revalidatePath(`/books/${slug}/outline`);
}

export async function commitOutlineStage(slug: string) {
  await commitOutlineWorkflow(slug);
  revalidatePath(`/books/${slug}/outline`);
  revalidatePath(`/books/${slug}/outline/paragraphs`);
  revalidatePath(`/books/${slug}/research`);
  revalidatePath(`/books/${slug}/external-stories`);
  revalidatePath(`/books/${slug}/base-story`);
  revalidatePath(`/books/${slug}/dashboard`);
  redirect(`/books/${slug}/dashboard`);
}

export async function generateParagraphOutlineFromOutline(slug: string) {
  await runParagraphOutlineWorkflow(slug);
  revalidatePath(`/books/${slug}/outline`);
  revalidatePath(`/books/${slug}/outline/paragraphs`);
}

export async function commitParagraphOutlineFromOutline(slug: string) {
  await commitParagraphOutlineWorkflow(slug);
  revalidatePath(`/books/${slug}/outline`);
  revalidatePath(`/books/${slug}/outline/paragraphs`);
}
