"use server";

import { revalidatePath } from "next/cache";

import { commitPromiseWorkflow } from "@/lib/workflows/promise-public";

export async function commitMarketAnalysisStage(slug: string) {
  await commitPromiseWorkflow(slug);
  revalidatePath(`/books/${slug}/promise`);
  revalidatePath(`/books/${slug}/market-analysis`);
  revalidatePath(`/books/${slug}/outline`);
  revalidatePath(`/books/${slug}`);
}
