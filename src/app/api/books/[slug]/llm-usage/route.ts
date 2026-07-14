import { NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import {
  getCanonicalCostLedgerForBook,
  getCostBreakdownForBook,
  getCostByChapterAndStage,
  getTotalCostForBook,
} from "@/lib/llm/call-log";
import { getLLMBudgetStateForBook } from "@/lib/llm/budgets";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [totalCost, breakdown, byChapterAndStage, canonicalLedger] = await Promise.all([
    getTotalCostForBook(book.id),
    getCostBreakdownForBook(book.id),
    getCostByChapterAndStage(book.id),
    getCanonicalCostLedgerForBook(book.id),
  ]);

  // Total token count
  const totalTokens = breakdown.reduce((sum, r) => sum + r.totalTokens, 0);
  const totalCalls  = breakdown.reduce((sum, r) => sum + r.callCount, 0);
  const budget = await getLLMBudgetStateForBook(book.id, 0);

  return NextResponse.json({
    totalCostUsd: totalCost,
    totalTokens,
    totalCalls,
    breakdown,
    byChapterAndStage,
    canonicalLedger,
    budget,
  });
}
