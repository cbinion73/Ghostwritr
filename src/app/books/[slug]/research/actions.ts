"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { StageKey } from "@prisma/client";

function getTabPath(slug: string, tabId?: string) {
  return tabId ? `/books/${slug}/research?tabId=${tabId}` : `/books/${slug}/research`;
}

async function getResearchWorkflows() {
  return import("@/lib/workflows/research-public");
}

async function getStageControls() {
  return import("@/lib/workflows/stage-controls");
}

async function getWorkflowQueue() {
  return import("@/lib/workflow-queue");
}

export async function runSelectedResearchDossier(slug: string, formData: FormData) {
  const tabId = String(formData.get("tabId") ?? "").trim();
  if (!tabId) {
    return;
  }

  const { runResearchBinderTabWorkflow } = await getResearchWorkflows();
  await runResearchBinderTabWorkflow(slug, tabId);
  revalidatePath(`/books/${slug}/research`);
}

export async function runFullResearchStage(slug: string) {
  const [{ enqueueAndTriggerFullResearchWorkflow }, { triggerWorkflowRunInBackground }] =
    await Promise.all([getResearchWorkflows(), getWorkflowQueue()]);
  await enqueueAndTriggerFullResearchWorkflow(slug, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}/research`);
}

export async function stopResearchStage(slug: string) {
  const { cancelStageWorkflow } = await getStageControls();
  await cancelStageWorkflow(slug, StageKey.RESEARCH);
  revalidatePath(`/books/${slug}/research`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function retryResearchStage(slug: string) {
  const [{ retryStageWorkflow }, { triggerWorkflowRunInBackground }] = await Promise.all([
    getStageControls(),
    getWorkflowQueue(),
  ]);
  await retryStageWorkflow(slug, StageKey.RESEARCH, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}/research`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function resumeFailedResearchStage(slug: string) {
  const [{ resumeFailedStageWorkflow }, { triggerWorkflowRunInBackground }] = await Promise.all([
    getStageControls(),
    getWorkflowQueue(),
  ]);
  await resumeFailedStageWorkflow(slug, StageKey.RESEARCH, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}/research`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function commitSelectedResearchDossier(slug: string, formData: FormData) {
  const tabId = String(formData.get("tabId") ?? "").trim();
  if (!tabId) {
    return;
  }

  const { commitResearchBinderTabWorkflow } = await getResearchWorkflows();
  await commitResearchBinderTabWorkflow(slug, tabId);
  revalidatePath(`/books/${slug}/research`);
}

export async function commitAllResearch(slug: string) {
  const { commitAllResearchWorkflow } = await getResearchWorkflows();
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

  const { addResearchBinderTabWorkflow } = await getResearchWorkflows();
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

  const { renameResearchBinderTabWorkflow } = await getResearchWorkflows();
  await renameResearchBinderTabWorkflow(slug, tabId, label);
  revalidatePath(`/books/${slug}/research`);
  redirect(getTabPath(slug, tabId));
}

export async function archiveResearchBinderTab(slug: string, formData: FormData) {
  const tabId = String(formData.get("tabId") ?? "").trim();

  if (!tabId) {
    return;
  }

  const { archiveResearchBinderTabWorkflow } = await getResearchWorkflows();
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

  const { combineResearchBinderTabsWorkflow } = await getResearchWorkflows();
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

  const { separateResearchBinderTabWorkflow } = await getResearchWorkflows();
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

  const { addResearchIdeaClipWorkflow } = await getResearchWorkflows();
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

  const { deleteResearchIdeaClipWorkflow } = await getResearchWorkflows();
  await deleteResearchIdeaClipWorkflow(slug, ideaId);
  revalidatePath(`/books/${slug}/research`);
  redirect(getTabPath(slug, tabId || undefined));
}
