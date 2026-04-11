"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addResearchBinderTabWorkflow,
  addResearchIdeaClipWorkflow,
  archiveResearchBinderTabWorkflow,
  combineResearchBinderTabsWorkflow,
  commitAllResearchWorkflow,
  commitResearchBinderTabWorkflow,
  deleteResearchIdeaClipWorkflow,
  enqueueAndTriggerFullResearchWorkflow,
  renameResearchBinderTabWorkflow,
  runResearchBinderTabWorkflow,
  separateResearchBinderTabWorkflow,
} from "@/lib/workflows/research";
import {
  cancelStageWorkflow,
  resumeFailedStageWorkflow,
  retryStageWorkflow,
} from "@/lib/workflows/stage-controls";
import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";
import { StageKey } from "@prisma/client";

function getTabPath(slug: string, tabId?: string) {
  return tabId ? `/books/${slug}/research?tabId=${tabId}` : `/books/${slug}/research`;
}

export async function runSelectedResearchDossier(slug: string, formData: FormData) {
  const tabId = String(formData.get("tabId") ?? "").trim();
  if (!tabId) {
    return;
  }

  await runResearchBinderTabWorkflow(slug, tabId);
  revalidatePath(`/books/${slug}/research`);
}

export async function runFullResearchStage(slug: string) {
  await enqueueAndTriggerFullResearchWorkflow(slug, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}/research`);
}

export async function stopResearchStage(slug: string) {
  await cancelStageWorkflow(slug, StageKey.RESEARCH);
  revalidatePath(`/books/${slug}/research`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function retryResearchStage(slug: string) {
  await retryStageWorkflow(slug, StageKey.RESEARCH, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}/research`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function resumeFailedResearchStage(slug: string) {
  await resumeFailedStageWorkflow(slug, StageKey.RESEARCH, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}/research`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function commitSelectedResearchDossier(slug: string, formData: FormData) {
  const tabId = String(formData.get("tabId") ?? "").trim();
  if (!tabId) {
    return;
  }

  await commitResearchBinderTabWorkflow(slug, tabId);
  revalidatePath(`/books/${slug}/research`);
}

export async function commitAllResearch(slug: string) {
  await commitAllResearchWorkflow(slug);
  revalidatePath(`/books/${slug}/research`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function addResearchBinderTab(slug: string, formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const chapterKey = String(formData.get("chapterKey") ?? "").trim() || undefined;

  if (!label) {
    return;
  }

  const tab = await addResearchBinderTabWorkflow(slug, label, chapterKey);
  revalidatePath(`/books/${slug}/research`);
  redirect(getTabPath(slug, tab.id));
}

export async function renameResearchBinderTab(slug: string, formData: FormData) {
  const tabId = String(formData.get("tabId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!tabId || !label) {
    return;
  }

  await renameResearchBinderTabWorkflow(slug, tabId, label);
  revalidatePath(`/books/${slug}/research`);
  redirect(getTabPath(slug, tabId));
}

export async function archiveResearchBinderTab(slug: string, formData: FormData) {
  const tabId = String(formData.get("tabId") ?? "").trim();

  if (!tabId) {
    return;
  }

  await archiveResearchBinderTabWorkflow(slug, tabId);
  revalidatePath(`/books/${slug}/research`);
  redirect(`/books/${slug}/research`);
}

export async function combineResearchBinderTabs(slug: string, formData: FormData) {
  const sourceTabId = String(formData.get("sourceTabId") ?? "").trim();
  const targetTabId = String(formData.get("targetTabId") ?? "").trim();

  if (!sourceTabId || !targetTabId) {
    return;
  }

  await combineResearchBinderTabsWorkflow(slug, sourceTabId, targetTabId);
  revalidatePath(`/books/${slug}/research`);
  redirect(getTabPath(slug, targetTabId));
}

export async function separateResearchBinderTab(slug: string, formData: FormData) {
  const sourceTabId = String(formData.get("sourceTabId") ?? "").trim();
  const chapterKey = String(formData.get("chapterKey") ?? "").trim();
  const newLabel = String(formData.get("newLabel") ?? "").trim();

  if (!sourceTabId || !chapterKey || !newLabel) {
    return;
  }

  const tab = await separateResearchBinderTabWorkflow(slug, sourceTabId, chapterKey, newLabel);
  revalidatePath(`/books/${slug}/research`);
  redirect(getTabPath(slug, tab.id));
}

export async function addResearchIdeaClip(slug: string, formData: FormData) {
  const tabId = String(formData.get("tabId") ?? "").trim();
  const chapterKey = String(formData.get("chapterKey") ?? "").trim() || undefined;
  const title = String(formData.get("title") ?? "").trim() || undefined;
  const content = String(formData.get("content") ?? "").trim();

  if (!tabId || !content) {
    return;
  }

  await addResearchIdeaClipWorkflow({
    bookSlug: slug,
    tabId,
    chapterKey,
    title,
    content,
  });
  revalidatePath(`/books/${slug}/research`);
  redirect(getTabPath(slug, tabId));
}

export async function deleteResearchIdeaClip(slug: string, formData: FormData) {
  const ideaId = String(formData.get("ideaId") ?? "").trim();
  const tabId = String(formData.get("tabId") ?? "").trim();

  if (!ideaId) {
    return;
  }

  await deleteResearchIdeaClipWorkflow(slug, ideaId);
  revalidatePath(`/books/${slug}/research`);
  redirect(getTabPath(slug, tabId || undefined));
}
