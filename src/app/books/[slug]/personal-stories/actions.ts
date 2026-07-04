"use server";

import { revalidatePath } from "next/cache";

import {
  commitPersonalStoriesWorkflow,
  seedPersonalStoriesInterview,
  submitPersonalStoriesMessage,
} from "@/lib/workflows/personal-stories";

export async function sendPersonalStoriesMessage(slug: string, formData: FormData) {
  const message = String(formData.get("message") ?? "");
  await submitPersonalStoriesMessage(slug, message);
  revalidatePath(`/books/${slug}`);
}

export async function seedPersonalStoriesStage(slug: string) {
  await seedPersonalStoriesInterview(slug);
  revalidatePath(`/books/${slug}`);
}

export async function markNoStoryForCurrentQuestion(slug: string, formData: FormData) {
  const question = String(formData.get("question") ?? "this area");
  await submitPersonalStoriesMessage(
    slug,
    `I do not have a personal story for ${question}. Please mark it and move to another angle.`,
  );
  revalidatePath(`/books/${slug}`);
}

export async function commitPersonalStoriesStage(slug: string) {
  await commitPersonalStoriesWorkflow(slug);
  revalidatePath(`/books/${slug}`);
}
