"use server";

import { revalidatePath } from "next/cache";

import { commitPromiseWorkflow, getPromiseWorkspace } from "@/lib/workflows/promise";
import { createValidationScores } from "@/lib/validation/promise-validator";

export async function commitMarketAnalysisStage(slug: string, formData?: FormData) {
  const force = formData?.get("force") === "true";

  // Market Viability is documented as a hard gate (3.5/5 ≡ 70/100). Enforce it
  // at commit; the "Commit Anyway" button is the explicit human override.
  if (!force) {
    try {
      const workspace = await getPromiseWorkspace(slug);
      const scores = createValidationScores(
        workspace.promiseBrief,
        workspace.personas,
        workspace.market,
        { comparableBooks: workspace.market?.comparisonTitles?.map((t) => t.title) ?? [] },
      );
      const marketScore = scores.marketViability.score;
      if (marketScore < 70) {
        throw new Error(
          `Market viability is ${marketScore}/100 — below the 70/100 (3.5/5) hard gate. ${scores.marketViability.feedback.join(" ")} Strengthen the market work in the Promise stage, or use Commit Anyway to override.`,
        );
      }
    } catch (error) {
      // Only propagate the gate's own verdict — scoring infrastructure
      // failures must not brick the commit path.
      if (error instanceof Error && error.message.includes("hard gate")) {
        throw error;
      }
      console.warn("[market-analysis] gate scoring failed:", error);
    }
  }

  await commitPromiseWorkflow(slug);
  revalidatePath(`/books/${slug}/promise`);
  revalidatePath(`/books/${slug}/market-analysis`);
  revalidatePath(`/books/${slug}/outline`);
  revalidatePath(`/books/${slug}`);
}
