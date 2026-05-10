"use server";

import { revalidatePath } from "next/cache";
import { StageKey } from "@prisma/client";

import {
  cancelStageWorkflow,
  getStageControlCapabilities,
  resumeFailedStageWorkflow,
  retryStageWorkflow,
} from "@/lib/workflows/stage-controls";
import {
  disableWorkflowAutomation,
  enableWorkflowAutomation,
  runWorkflowAutopilot,
  setWorkflowAutomationMode,
} from "@/lib/workflows/workflow-automation";
import type { WorkflowAutomationMode } from "@/lib/workflows/workflow-automation";
import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";

function refresh(slug: string) {
  revalidatePath(`/books/${slug}/dashboard`);
  revalidatePath(`/books/${slug}/story-setup`);
  revalidatePath(`/books/${slug}/story-core`);
  revalidatePath(`/books/${slug}/world-cast`);
  revalidatePath(`/books/${slug}/plot-blueprint`);
  revalidatePath(`/books/${slug}/scene-plan`);
  revalidatePath(`/books/${slug}/draft`);
  revalidatePath(`/books/${slug}/research`);
  revalidatePath(`/books/${slug}/external-stories`);
  revalidatePath(`/books/${slug}/base-story`);
  revalidatePath(`/books/${slug}/chapter-draft`);
  revalidatePath(`/books/${slug}/editing`);
  revalidatePath(`/books/${slug}/personal-stories`);
  revalidatePath(`/books/${slug}/outline`);
  revalidatePath(`/books/${slug}/promise`);
  revalidatePath(`/books/${slug}/setup`);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/`);
}

export async function stopDashboardStage(slug: string, formData: FormData) {
  const stageKey = String(formData.get("stageKey") ?? "").trim() as StageKey;
  if (!stageKey) {
    return;
  }
  if (!getStageControlCapabilities(stageKey).canCancel) {
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
  if (!getStageControlCapabilities(stageKey).canRetry) {
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
  if (!getStageControlCapabilities(stageKey).canResumeFailed) {
    return;
  }

  await resumeFailedStageWorkflow(slug, stageKey, triggerWorkflowRunInBackground);
  refresh(slug);
}

export async function runWorkflowAutopilotAction(slug: string) {
  await runWorkflowAutopilot(slug, triggerWorkflowRunInBackground);
  refresh(slug);
}

export async function runWorkflowAutopilotModeAction(slug: string, formData: FormData) {
  const mode = String(formData.get("mode") ?? "").trim() as WorkflowAutomationMode;
  if (!mode) {
    return;
  }

  await runWorkflowAutopilot(slug, triggerWorkflowRunInBackground, mode);
  refresh(slug);
}

export async function enableWorkflowAutomationAction(slug: string) {
  await enableWorkflowAutomation(slug);
  refresh(slug);
}

export async function disableWorkflowAutomationAction(slug: string) {
  await disableWorkflowAutomation(slug);
  refresh(slug);
}

export async function setWorkflowAutomationModeAction(slug: string, formData: FormData) {
  const mode = String(formData.get("mode") ?? "").trim() as WorkflowAutomationMode;
  if (!mode) {
    return;
  }

  await setWorkflowAutomationMode(slug, mode);
  refresh(slug);
}
