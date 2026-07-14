import { NextResponse } from "next/server";

import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import {
  confirmLLMBudgetForBook,
  getLLMBudgetStateFromValues,
} from "@/lib/llm/budgets";
import { getTotalCostForBook } from "@/lib/llm/call-log";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";

export async function POST(
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

  const budgetState = await confirmLLMBudgetForBook({
    bookId: book.id,
    metadataJson: book.metadataJson,
    approvedBy: user.id,
  });

  const currentSpendUsd = await getTotalCostForBook(book.id);

  return NextResponse.json({
    ok: true,
    budget: getLLMBudgetStateFromValues({
      llmBudget: {
        warningUsd: Number(budgetState.warningUsd),
        confirmationUsd: Number(budgetState.confirmationUsd),
        hardStopUsd: Number(budgetState.hardStopUsd),
        confirmedThroughUsd: budgetState.confirmedThroughUsd === null ? null : Number(budgetState.confirmedThroughUsd),
        confirmedAt: budgetState.confirmedAt?.toISOString() ?? null,
        confirmedBy: budgetState.confirmedBy,
      },
    }, currentSpendUsd, 0),
  });
}
