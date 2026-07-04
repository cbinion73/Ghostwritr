"use server";

import { revalidatePath } from "next/cache";

import { triggerWorkflowRunInBackground } from "@/lib/workflow-queue";
import {
  acknowledgeMorningReport,
  startOvernightBuild,
  stopOvernightBuild,
} from "@/lib/workflows/overnight-build";

export async function startOvernightBuildAction(slug: string) {
  await startOvernightBuild(slug, triggerWorkflowRunInBackground);
  revalidatePath(`/books/${slug}`);
}

export async function stopOvernightBuildAction(slug: string) {
  await stopOvernightBuild(slug);
  revalidatePath(`/books/${slug}`);
}

export async function acknowledgeMorningReportAction(slug: string) {
  await acknowledgeMorningReport(slug);
  revalidatePath(`/books/${slug}`);
}
