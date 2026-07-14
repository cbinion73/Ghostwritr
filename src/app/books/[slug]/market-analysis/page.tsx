import { redirect } from "next/navigation";

/**
 * Market analysis is now part of the unified Phase 1 Promise room. This route
 * only preserves old links without presenting a second downstream gate.
 */
export default async function MarketAnalysisStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/books/${slug}?stage=PROMISE`);
}
