"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BookWorkflowType } from "@prisma/client";

import { createBookFromTitle } from "@/lib/repositories/books";
import { addBookIdea, deleteBookIdea, updateBookIdea } from "@/lib/jarvis/client";
import { db } from "@/lib/db";

function parseWorkflowType(value: FormDataEntryValue | null) {
  return value === BookWorkflowType.FICTION ? BookWorkflowType.FICTION : BookWorkflowType.NONFICTION;
}

/** Promote a Jarvis idea into a new Ghostwritr book and open Book Setup. */
export async function promoteIdeaToBookAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const workflowType = parseWorkflowType(formData.get("workflowType"));

  if (!title) return;

  const book = await createBookFromTitle({ titleWorking: title, workflowType });

  // Stash the notes as a premise hint in metadataJson so Blueprint sees it
  if (notes) {
    await db.book.update({
      where: { id: book.id },
      data: { metadataJson: { premise: notes } },
    });
  }

  revalidatePath("/");
  revalidatePath("/ideas");
  redirect(`/books/${book.slug}/setup`);
}

/** Mark an idea as already written (outside of Ghostwritr). */
export async function markIdeaWrittenAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await updateBookIdea(id, { status: "written", tags_add: ["written"] });
  revalidatePath("/ideas");
}

/** Remove an idea from the JARVIS idea inbox. */
export async function deleteIdeaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await deleteBookIdea(id);
  revalidatePath("/ideas");
}

/** Add a new idea directly into the JARVIS idea inbox. */
export async function addJarvisIdeaAction(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const tagsRaw = String(formData.get("tags") ?? "").trim();
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  if (!text) return;

  await addBookIdea({ text, notes: notes || undefined, tags });
  revalidatePath("/ideas");
}
