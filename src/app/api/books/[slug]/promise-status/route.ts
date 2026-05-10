import { NextResponse } from "next/server";
import { getBookBySlugOrThrow } from "@/lib/repositories/books";
import { isWorkflowRunning, getElapsedSeconds } from "@/lib/workflow-status";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const book = await getBookBySlugOrThrow(slug);

  const isRunning = isWorkflowRunning(book.id);
  const elapsedSeconds = isRunning ? getElapsedSeconds(book.id) : 0;

  return NextResponse.json({
    isRunning,
    elapsedSeconds,
  });
}
