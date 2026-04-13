"use server";

import { revalidatePath } from "next/cache";

import {
  commitParagraphOutlineWorkflow,
  runParagraphOutlineWorkflow,
} from "@/lib/workflows/outline-paragraphs";

export async function generateParagraphOutline(slug: string) {
  await runParagraphOutlineWorkflow(slug);
  revalidatePath(`/books/${slug}/outline`);
  revalidatePath(`/books/${slug}/outline/paragraphs`);
}

export async function commentOnParagraphOutline(slug: string, formData: FormData) {
  const comment = String(formData.get("comment") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim();
  const targetTypeValue = String(formData.get("targetType") ?? "").trim();
  const targetType =
    targetTypeValue === "chapter" || targetTypeValue === "paragraph"
      ? targetTypeValue
      : undefined;

  await runParagraphOutlineWorkflow(slug, {
    revisionComment:
      comment || "Sharpen this part of the paragraph-level outline while keeping the section logic coherent.",
    revisionTargetId: targetId || undefined,
    revisionTargetType: targetType,
  });

  revalidatePath(`/books/${slug}/outline`);
  revalidatePath(`/books/${slug}/outline/paragraphs`);
}

export async function commitParagraphOutline(slug: string) {
  await commitParagraphOutlineWorkflow(slug);
  revalidatePath(`/books/${slug}/outline`);
  revalidatePath(`/books/${slug}/outline/paragraphs`);
}
