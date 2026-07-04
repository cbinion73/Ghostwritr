"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addExternalStoryBinderTabWorkflow,
  addExternalStoryClipWorkflow,
  archiveExternalStoryBinderTabWorkflow,
  combineExternalStoryBinderTabsWorkflow,
  commitChapterExternalStoriesWorkflow,
  deleteExternalStoryClipWorkflow,
  enqueueAndTriggerFullExternalStoriesWorkflow,
  renameExternalStoryBinderTabWorkflow,
  separateExternalStoryBinderTabWorkflow,
} from "@/lib/workflows/external-stories";
import {
  cancelStageWorkflow,
  resumeFailedStageWorkflow,
  retryStageWorkflow,
} from "@/lib/workflows/stage-controls";
import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";
import { StageKey } from "@prisma/client";

function getTabPath(slug: string, tabId?: string) {
  return tabId
    ? `/books/${slug}?stage=EXTERNAL_STORIES&tabId=${tabId}`
    : `/books/${slug}?stage=EXTERNAL_STORIES`;
}

export async function runFullExternalStoriesStage(slug: string) {
  await enqueueAndTriggerFullExternalStoriesWorkflow(slug, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}`);
}

export async function stopExternalStoriesStage(slug: string) {
  await cancelStageWorkflow(slug, StageKey.EXTERNAL_STORIES);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function retryExternalStoriesStage(slug: string) {
  await retryStageWorkflow(slug, StageKey.EXTERNAL_STORIES, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function resumeFailedExternalStoriesStage(slug: string) {
  await resumeFailedStageWorkflow(
    slug,
    StageKey.EXTERNAL_STORIES,
    triggerWorkflowRunInBackground,
  );
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function commitSelectedExternalStories(slug: string, formData: FormData) {
  const chapterKey = String(formData.get("chapterKey") ?? "").trim();
  if (!chapterKey) return;

  await commitChapterExternalStoriesWorkflow(slug, chapterKey);
  revalidatePath(`/books/${slug}`);
}

export async function addExternalStoryBinderTab(slug: string, formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const chapterKey = String(formData.get("chapterKey") ?? "").trim() || undefined;
  if (!label) return;

  const tab = await addExternalStoryBinderTabWorkflow(slug, label, chapterKey);
  revalidatePath(`/books/${slug}`);
  redirect(getTabPath(slug, tab.id));
}

export async function renameExternalStoryBinderTab(slug: string, formData: FormData) {
  const tabId = String(formData.get("tabId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!tabId || !label) return;

  await renameExternalStoryBinderTabWorkflow(slug, tabId, label);
  revalidatePath(`/books/${slug}`);
  redirect(getTabPath(slug, tabId));
}

export async function archiveExternalStoryBinderTab(slug: string, formData: FormData) {
  const tabId = String(formData.get("tabId") ?? "").trim();
  if (!tabId) return;

  await archiveExternalStoryBinderTabWorkflow(slug, tabId);
  revalidatePath(`/books/${slug}`);
  redirect(`/books/${slug}?stage=EXTERNAL_STORIES`);
}

export async function combineExternalStoryBinderTabs(slug: string, formData: FormData) {
  const sourceTabId = String(formData.get("sourceTabId") ?? "").trim();
  const targetTabId = String(formData.get("targetTabId") ?? "").trim();
  if (!sourceTabId || !targetTabId) return;

  await combineExternalStoryBinderTabsWorkflow(slug, sourceTabId, targetTabId);
  revalidatePath(`/books/${slug}`);
  redirect(getTabPath(slug, targetTabId));
}

export async function separateExternalStoryBinderTab(slug: string, formData: FormData) {
  const sourceTabId = String(formData.get("sourceTabId") ?? "").trim();
  const chapterKey = String(formData.get("chapterKey") ?? "").trim();
  const newLabel = String(formData.get("newLabel") ?? "").trim();
  if (!sourceTabId || !chapterKey || !newLabel) return;

  const tab = await separateExternalStoryBinderTabWorkflow(slug, sourceTabId, chapterKey, newLabel);
  revalidatePath(`/books/${slug}`);
  redirect(getTabPath(slug, tab.id));
}

export async function addExternalStoryClip(slug: string, formData: FormData) {
  const tabId = String(formData.get("tabId") ?? "").trim();
  const chapterKey = String(formData.get("chapterKey") ?? "").trim() || undefined;
  const title = String(formData.get("title") ?? "").trim() || undefined;
  const content = String(formData.get("content") ?? "").trim();
  if (!tabId || !content) return;

  await addExternalStoryClipWorkflow({ bookSlug: slug, tabId, chapterKey, title, content });
  revalidatePath(`/books/${slug}`);
  redirect(getTabPath(slug, tabId));
}

export async function deleteExternalStoryClip(slug: string, formData: FormData) {
  const clipId = String(formData.get("clipId") ?? "").trim();
  const tabId = String(formData.get("tabId") ?? "").trim();
  if (!clipId) return;

  await deleteExternalStoryClipWorkflow(slug, clipId);
  revalidatePath(`/books/${slug}`);
  redirect(getTabPath(slug, tabId || undefined));
}
