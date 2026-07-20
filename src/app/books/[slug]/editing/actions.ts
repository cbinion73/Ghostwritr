"use server";

import { revalidatePath } from "next/cache";
import { BookWorkflowType } from "@prisma/client";
import type { EditorialMode } from "@/lib/editing-types";
import { getBookBySlugOrThrow } from "@/lib/repositories/books";

import {
  applyManuscriptRevisionWorkflow,
  assembleManuscriptWorkflow,
  commitEditingStageWorkflow,
  runFullEditorialLoopWorkflow,
  generateEditorialRevisionPlanWorkflow,
  executeEditorialRevisionPlanWorkflow,
  generateEditorialAssessmentWorkflow,
  generateManuscriptRevisionWorkflow,
  generatePublicationPassWorkflow,
  generateSuggestedRevisionFromConversationWorkflow,
  preparePublishingPackageWorkflow,
  rejectManuscriptRevisionWorkflow,
  resolvePublicationPassFindingWorkflow,
  sendEditingMessageWorkflow,
  updateEditorialPreferencesWorkflow,
} from "@/lib/workflows/editing-public";
import { expandUnderTargetChapterDraftsWorkflow } from "@/lib/workflows/chapter-draft-public";
import { expandUnderTargetFictionDraftChaptersWorkflow } from "@/lib/workflows/fiction";

export async function assembleManuscript(slug: string) {
  await assembleManuscriptWorkflow(slug);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function generatePublicationPass(slug: string) {
  await generatePublicationPassWorkflow(slug);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/publish`);
}

export async function resolvePublicationPassFinding(slug: string, formData: FormData) {
  const findingId = String(formData.get("findingId") ?? "").trim();
  const disposition = String(formData.get("disposition") ?? "resolved") as
    | "resolved"
    | "accepted-risk"
    | "rejected";
  const resolutionNote = String(formData.get("resolutionNote") ?? "").trim();
  if (!findingId) return;
  await resolvePublicationPassFindingWorkflow(slug, findingId, disposition, resolutionNote);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/publish`);
}

export async function commitEditingStage(slug: string) {
  await commitEditingStageWorkflow(slug);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function generateEditorialAssessment(slug: string, formData: FormData) {
  const mode = String(formData.get("mode") ?? "structural-edit") as Parameters<
    typeof generateEditorialAssessmentWorkflow
  >[1];
  const chapterKey = String(formData.get("chapterKey") ?? "").trim() || null;
  await generateEditorialAssessmentWorkflow(slug, mode, chapterKey);
  revalidatePath(`/books/${slug}`);
}

export async function generateManuscriptRevision(slug: string, formData: FormData) {
  const mode = String(formData.get("mode") ?? "clarity-pass") as Parameters<
    typeof generateManuscriptRevisionWorkflow
  >[1];
  const chapterKey = String(formData.get("chapterKey") ?? "").trim() || null;
  const brief = String(formData.get("brief") ?? "").trim() || null;
  const selectedChapterKeys = formData
    .getAll("selectedChapterKeys")
    .map((value) => String(value).trim())
    .filter(Boolean);
  await generateManuscriptRevisionWorkflow(slug, mode, chapterKey, {
    brief,
    selectedChapterKeys,
  });
  revalidatePath(`/books/${slug}`);
}

export async function applyManuscriptRevision(slug: string, formData: FormData) {
  const revisionVersionId = String(formData.get("revisionVersionId") ?? "").trim();
  if (!revisionVersionId) {
    return;
  }
  await applyManuscriptRevisionWorkflow(slug, revisionVersionId);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function rejectManuscriptRevision(slug: string, formData: FormData) {
  const revisionVersionId = String(formData.get("revisionVersionId") ?? "").trim();
  if (!revisionVersionId) {
    return;
  }
  await rejectManuscriptRevisionWorkflow(slug, revisionVersionId);
  revalidatePath(`/books/${slug}`);
}

export async function sendEditingMessage(slug: string, formData: FormData) {
  const message = String(formData.get("message") ?? "");
  const chapterKey = String(formData.get("chapterKey") ?? "").trim() || null;
  await sendEditingMessageWorkflow(slug, message, chapterKey);
  revalidatePath(`/books/${slug}`);
}

export async function generateSuggestedRevisionFromConversation(slug: string) {
  await generateSuggestedRevisionFromConversationWorkflow(slug);
  revalidatePath(`/books/${slug}`);
}

export async function updateEditorialPreferences(slug: string, formData: FormData) {
  await updateEditorialPreferencesWorkflow(slug, {
    styleNotes: String(formData.get("styleNotes") ?? ""),
    preserveVoice: String(formData.get("preserveVoice") ?? "") === "on",
    preferTighterProse: String(formData.get("preferTighterProse") ?? "") === "on",
    preferBolderCuts: String(formData.get("preferBolderCuts") ?? "") === "on",
  });
  revalidatePath(`/books/${slug}`);
}

export async function generateEditorialRevisionPlan(slug: string, formData: FormData) {
  const chapterKey = String(formData.get("chapterKey") ?? "").trim() || null;
  await generateEditorialRevisionPlanWorkflow(slug, chapterKey);
  revalidatePath(`/books/${slug}`);
}

export async function executeEditorialRevisionPlan(slug: string, formData: FormData) {
  const limit = Number(formData.get("limit") ?? 3);
  const autoApply = String(formData.get("autoApply") ?? "") === "on";
  await executeEditorialRevisionPlanWorkflow(slug, {
    limit,
    autoApply,
  });
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function runFullEditorialLoop(slug: string, formData: FormData) {
  const assessmentMode = String(formData.get("assessmentMode") ?? "structural-edit") as EditorialMode;
  const planLimit = Number(formData.get("planLimit") ?? 3);
  const autoApply = String(formData.get("autoApply") ?? "") === "on";
  const commitAfter = String(formData.get("commitAfter") ?? "") === "on";

  await runFullEditorialLoopWorkflow(slug, {
    assessmentMode,
    planLimit,
    autoApply,
    commitAfter,
  });
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/publish`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function refreshPublishingPackage(slug: string) {
  await preparePublishingPackageWorkflow(slug);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/publish`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function expandDraftTowardTarget(slug: string, formData: FormData) {
  const limit = Number(formData.get("limit") ?? 2);
  const book = await getBookBySlugOrThrow(slug);
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? limit : 2;

  if (book.workflowType === BookWorkflowType.FICTION) {
    await expandUnderTargetFictionDraftChaptersWorkflow(slug, normalizedLimit);
  } else {
    await expandUnderTargetChapterDraftsWorkflow(slug, normalizedLimit);
  }

  try {
    await assembleManuscriptWorkflow(slug);
    await preparePublishingPackageWorkflow(slug);
  } catch {
    // Ignore incomplete-manuscript cases; the editing workspace should still refresh.
  }

  revalidatePath(`/books/${slug}/chapter-draft`);
  revalidatePath(`/books/${slug}/draft`);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/publish`);
  revalidatePath(`/books/${slug}/dashboard`);
}
