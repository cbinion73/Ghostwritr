"use server";

import { revalidatePath } from "next/cache";

import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";
import {
  commitChapterDraftWorkflow,
  enqueueAndTriggerChapterDraftWorkflow,
} from "@/lib/workflows/chapter-draft";

export async function runFullChapterDraftStage(slug: string) {
  await enqueueAndTriggerChapterDraftWorkflow(slug, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}/chapter-draft`);
}

export async function runSelectedChapterDraft(slug: string, formData: FormData) {
  const chapterKey = String(formData.get("chapterKey") ?? "");
  if (!chapterKey) {
    return;
  }

  await enqueueAndTriggerChapterDraftWorkflow(
    slug,
    triggerWorkflowRunInBackground,
    chapterKey,
  );
  revalidatePath(`/books/${slug}/chapter-draft`);
}

export async function commitSelectedChapterDraft(slug: string, formData: FormData) {
  const chapterKey = String(formData.get("chapterKey") ?? "");
  if (!chapterKey) {
    return;
  }

  await commitChapterDraftWorkflow(slug, chapterKey);
  revalidatePath(`/books/${slug}/chapter-draft`);
}
