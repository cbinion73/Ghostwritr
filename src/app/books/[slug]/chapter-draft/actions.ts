"use server";

import { revalidatePath } from "next/cache";

import { StageKey } from "@prisma/client";
import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";
import {
  assembleManuscriptWorkflow,
  preparePublishingPackageWorkflow,
} from "@/lib/workflows/editing-public";
import {
  commitChapterDraftWorkflow,
  expandChapterDraftTowardTargetWorkflow,
  expandUnderTargetChapterDraftsWorkflow,
  enqueueAndTriggerChapterDraftWorkflow,
  repairWeakChapterDraftsWorkflow,
} from "@/lib/workflows/chapter-draft-public";
import {
  cancelStageWorkflow,
  retryStageWorkflow,
} from "@/lib/workflows/stage-controls";

async function refreshDownstreamEditorialViews(slug: string) {
  try {
    await assembleManuscriptWorkflow(slug);
    await preparePublishingPackageWorkflow(slug);
  } catch {
    // Ignore incomplete-manuscript cases; the draft workspace should still refresh.
  }
}

export async function runFullChapterDraftStage(slug: string) {
  await enqueueAndTriggerChapterDraftWorkflow(slug, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}/chapter-draft`);
}

export async function stopChapterDraftStage(slug: string) {
  await cancelStageWorkflow(slug, StageKey.CHAPTER_DRAFT);
  revalidatePath(`/books/${slug}/chapter-draft`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function retryChapterDraftStage(slug: string) {
  await retryStageWorkflow(slug, StageKey.CHAPTER_DRAFT, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}/chapter-draft`);
  revalidatePath(`/books/${slug}/dashboard`);
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

export async function repairWeakChapterDrafts(slug: string, formData: FormData) {
  const limit = Number(formData.get("limit") ?? 3);
  await repairWeakChapterDraftsWorkflow(slug, Number.isFinite(limit) && limit > 0 ? limit : 3);
  await refreshDownstreamEditorialViews(slug);
  revalidatePath(`/books/${slug}/chapter-draft`);
  revalidatePath(`/books/${slug}/editing`);
  revalidatePath(`/books/${slug}/publish`);
}

export async function expandSelectedChapterTowardTarget(slug: string, formData: FormData) {
  const chapterKey = String(formData.get("chapterKey") ?? "").trim();
  if (!chapterKey) {
    return;
  }

  await expandChapterDraftTowardTargetWorkflow(slug, chapterKey);
  await refreshDownstreamEditorialViews(slug);
  revalidatePath(`/books/${slug}/chapter-draft`);
  revalidatePath(`/books/${slug}/editing`);
  revalidatePath(`/books/${slug}/publish`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function expandUnderTargetChapters(slug: string, formData: FormData) {
  const limit = Number(formData.get("limit") ?? 2);
  await expandUnderTargetChapterDraftsWorkflow(slug, Number.isFinite(limit) && limit > 0 ? limit : 2);
  await refreshDownstreamEditorialViews(slug);
  revalidatePath(`/books/${slug}/chapter-draft`);
  revalidatePath(`/books/${slug}/editing`);
  revalidatePath(`/books/${slug}/publish`);
  revalidatePath(`/books/${slug}/dashboard`);
}
