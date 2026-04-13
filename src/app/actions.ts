"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createBookFromTitle, deleteBookBySlug } from "@/lib/repositories/books";

export async function createBookAction(formData: FormData) {
  const titleWorking = String(formData.get("titleWorking") ?? "").trim();
  const subtitle = String(formData.get("subtitle") ?? "").trim();

  if (!titleWorking) {
    return;
  }

  const book = await createBookFromTitle({
    titleWorking,
    subtitle: subtitle || undefined,
  });

  revalidatePath("/");
  redirect(`/books/${book.slug}/setup`);
}

export async function createBookWithWizardAction(formData: FormData) {
  const titleWorking = String(formData.get("titleWorking") ?? "").trim();

  if (!titleWorking) {
    return;
  }

  const book = await createBookFromTitle({
    titleWorking,
    subtitle: undefined,
  });

  revalidatePath("/");
  redirect(`/books/${book.slug}/promise`);
}

export async function deleteBookAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) {
    return;
  }

  await deleteBookBySlug(slug);
  revalidatePath("/");
}
