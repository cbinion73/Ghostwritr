"use server";

import { revalidatePath } from "next/cache";

import { finalizePublishingHandoffWorkflow } from "@/lib/workflows/editing";
import { getBookSetupWorkspace, saveBookSetupWorkflow } from "@/lib/workflows/book-setup";
import type { BookFormatTarget } from "@/lib/book-setup-types";

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

// The only inputs that actually change what Typeset/Publish produces —
// trim size, target page count, and output formats — live on the Book
// Setup profile (everything else in typesettingPlan/publishingPackage is
// deterministically computed from these plus workflow type). This action
// lets the author edit just those from the Typeset screen instead of
// having to go back to Book Setup, without touching any other profile field.
export async function updateTypesetConfig(slug: string, formData: FormData) {
  const workspace = await getBookSetupWorkspace(slug);
  const trimSize = String(formData.get("trimSize") ?? workspace.profile.trimSize ?? "6 x 9 in").trim();
  const targetPageCountRaw = Number(formData.get("targetPageCount") ?? 0);
  const targetPageCount = targetPageCountRaw > 0 ? targetPageCountRaw : null;
  const outputFormats = formData.getAll("outputFormats").map((v) => String(v)) as BookFormatTarget[];

  await saveBookSetupWorkflow(slug, {
    ...workspace.profile,
    trimSize: trimSize || workspace.profile.trimSize,
    targetPageCount,
    outputFormats: outputFormats.length > 0 ? outputFormats : workspace.profile.outputFormats,
  });

  refresh(slug);
}
