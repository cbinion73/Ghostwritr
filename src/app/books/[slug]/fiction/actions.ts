"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StageKey } from "@prisma/client";

import {
  assembleManuscriptWorkflow,
  preparePublishingPackageWorkflow,
} from "@/lib/workflows/editing";
import {
  commitFictionStageWorkflow,
  expandFictionDraftChapterTowardTargetWorkflow,
  expandUnderTargetFictionDraftChaptersWorkflow,
  generateFictionDraftChapterWorkflow,
  generateFictionStageWorkflow,
  repairWeakFictionDraftChaptersWorkflow,
  saveFictionStageWorkflow,
} from "@/lib/workflows/fiction";
import { getBookBySlugOrThrow } from "@/lib/repositories/books";
import { getNextWorkflowStage } from "@/lib/workflow-registry";

function revalidateFictionPaths(slug: string) {
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/draft`);
  revalidatePath(`/books/${slug}/editing`);
  revalidatePath(`/books/${slug}/publish`);
  revalidatePath("/");
}

async function refreshFictionEditorialViews(slug: string) {
  try {
    await assembleManuscriptWorkflow(slug);
    await preparePublishingPackageWorkflow(slug);
  } catch {
    // Ignore incomplete-manuscript cases; the draft workspace should still refresh.
  }
}

export async function generateFictionStageAction(slug: string, formData: FormData) {
  const stageKey = String(formData.get("stageKey") ?? "").trim() as StageKey;
  await generateFictionStageWorkflow(slug, stageKey);
  revalidateFictionPaths(slug);
}

export async function generateFictionDraftChapterAction(slug: string, formData: FormData) {
  const chapterNumber = Number(formData.get("chapterNumber") ?? 0);
  const sceneNumberValue = Number(formData.get("sceneNumber") ?? 0);
  if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
    throw new Error("A valid chapter number is required.");
  }

  await generateFictionDraftChapterWorkflow(
    slug,
    chapterNumber,
    Number.isFinite(sceneNumberValue) && sceneNumberValue > 0 ? sceneNumberValue : null,
  );
  revalidateFictionPaths(slug);
}

export async function repairWeakFictionDraftsAction(slug: string, formData: FormData) {
  const limit = Number(formData.get("limit") ?? 3);
  await repairWeakFictionDraftChaptersWorkflow(slug, Number.isFinite(limit) && limit > 0 ? limit : 3);
  await refreshFictionEditorialViews(slug);
  revalidateFictionPaths(slug);
  revalidatePath(`/books/${slug}/publish`);
}

export async function expandFictionDraftChapterTowardTargetAction(slug: string, formData: FormData) {
  const chapterNumber = Number(formData.get("chapterNumber") ?? 0);
  if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
    throw new Error("A valid chapter number is required.");
  }

  await expandFictionDraftChapterTowardTargetWorkflow(slug, chapterNumber);
  await refreshFictionEditorialViews(slug);
  revalidateFictionPaths(slug);
}

export async function expandUnderTargetFictionDraftsAction(slug: string, formData: FormData) {
  const limit = Number(formData.get("limit") ?? 2);
  await expandUnderTargetFictionDraftChaptersWorkflow(slug, Number.isFinite(limit) && limit > 0 ? limit : 2);
  await refreshFictionEditorialViews(slug);
  revalidateFictionPaths(slug);
}

export async function saveFictionStageAction(slug: string, formData: FormData) {
  const stageKey = String(formData.get("stageKey") ?? "").trim() as StageKey;
  const sourceJson = String(formData.get("sourceJson") ?? "").trim();
  await saveFictionStageWorkflow(slug, stageKey, sourceJson);
  revalidateFictionPaths(slug);
}

export async function commitFictionStageAction(slug: string, formData: FormData) {
  const stageKey = String(formData.get("stageKey") ?? "").trim() as StageKey;
  await commitFictionStageWorkflow(slug, stageKey);
  revalidateFictionPaths(slug);

  const book = await getBookBySlugOrThrow(slug);
  const nextStage = getNextWorkflowStage(book.workflowType, stageKey);
  redirect(`/books/${slug}?stage=${nextStage?.key ?? "EDITING"}`);
}
