import { NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { isWorkflowRunning, getElapsedSeconds } from "@/lib/workflow-status";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);

  const isRunning = isWorkflowRunning(book.id);
  const elapsedSeconds = isRunning ? getElapsedSeconds(book.id) : 0;

  return NextResponse.json({
    isRunning,
    elapsedSeconds,
  });
}
