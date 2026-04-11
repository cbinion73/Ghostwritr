import { NextResponse } from "next/server";
import { getOrCreateBookBySlug } from "@/lib/repositories/books";
import { isWorkflowRunning, getElapsedSeconds } from "@/lib/workflow-status";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const book = await getOrCreateBookBySlug(slug);

  const isRunning = isWorkflowRunning(book.id);
  const elapsedSeconds = isRunning ? getElapsedSeconds(book.id) : 0;

  return NextResponse.json({
    isRunning,
    elapsedSeconds,
  });
}
