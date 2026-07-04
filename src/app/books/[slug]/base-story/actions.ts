"use server";

import { revalidatePath } from "next/cache";
import { StageKey } from "@prisma/client";

import {
  commitBaseStoryWorkflow,
  enqueueAndTriggerBaseStoryWorkflow,
} from "@/lib/workflows/base-story";
import { cancelStageWorkflow, retryStageWorkflow } from "@/lib/workflows/stage-controls";
import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";

export async function runBaseStoryStage(slug: string) {
  await enqueueAndTriggerBaseStoryWorkflow(slug, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}`);
}

export async function stopBaseStoryStage(slug: string) {
  await cancelStageWorkflow(slug, StageKey.BASE_STORY);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function retryBaseStoryStage(slug: string) {
  await retryStageWorkflow(slug, StageKey.BASE_STORY, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/dashboard`);
}

export async function commitBaseStoryStage(slug: string) {
  await commitBaseStoryWorkflow(slug);
  revalidatePath(`/books/${slug}`);
}
