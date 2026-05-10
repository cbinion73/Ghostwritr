"use server";

import { revalidatePath } from "next/cache";

import { finalizePublishingHandoffWorkflow } from "@/lib/workflows/editing";

function refresh(slug: string) {
  revalidatePath(`/books/${slug}/publish`);
  revalidatePath(`/books/${slug}/editing`);
  revalidatePath(`/books/${slug}/dashboard`);
  revalidatePath(`/`);
}

export async function finalizePublishingHandoff(slug: string, formData: FormData) {
  const archiveReady = String(formData.get("archiveReady") ?? "") === "on";
  await finalizePublishingHandoffWorkflow(slug, { archiveReady });
  refresh(slug);
}
