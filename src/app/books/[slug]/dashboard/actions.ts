"use server";

import { revalidatePath } from "next/cache";
import { StageKey } from "@prisma/client";

import {
  cancelStageWorkflow,
  resumeFailedStageWorkflow,
  retryStageWorkflow,
} from "@/lib/workflows/stage-controls";
import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";

function refresh(slug: string) {
  revalidatePath(`/books/${slug}/dashboard`);
  revalidatePath(`/books/${slug}/research`);
  revalidatePath(`/books/${slug}/external-stories`);
  revalidatePath(`/books/${slug}/base-story`);
}

export async function stopDashboardStage(slug: string, formData: FormData) {
  const stageKey = String(formData.get("stageKey") ?? "").trim() as StageKey;
  if (!stageKey) {
    return;
  }

  await cancelStageWorkflow(slug, stageKey);
  refresh(slug);
}

export async function retryDashboardStage(slug: string, formData: FormData) {
  const stageKey = String(formData.get("stageKey") ?? "").trim() as StageKey;
  if (!stageKey) {
    return;
  }

  await retryStageWorkflow(slug, stageKey, triggerWorkflowRunInBackground);
  refresh(slug);
}

export async function resumeFailedDashboardStage(slug: string, formData: FormData) {
  const stageKey = String(formData.get("stageKey") ?? "").trim() as StageKey;
  if (!stageKey) {
    return;
  }

  await resumeFailedStageWorkflow(slug, stageKey, triggerWorkflowRunInBackground);
  refresh(slug);
}
