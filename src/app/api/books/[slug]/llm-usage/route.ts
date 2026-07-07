import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCostBreakdownForBook, getCostByChapterAndStage, getTotalCostForBook } from "@/lib/llm/call-log";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const book = await db.book.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [totalCost, breakdown, byChapterAndStage] = await Promise.all([
    getTotalCostForBook(book.id),
    getCostBreakdownForBook(book.id),
    getCostByChapterAndStage(book.id),
  ]);

  // Total token count
  const totalTokens = breakdown.reduce((sum, r) => sum + r.totalTokens, 0);
  const totalCalls  = breakdown.reduce((sum, r) => sum + r.callCount, 0);

  return NextResponse.json({
    totalCostUsd: totalCost,
    totalTokens,
    totalCalls,
    breakdown,
    byChapterAndStage,
  });
}
