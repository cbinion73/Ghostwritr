import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Retired standalone view — the Verdict room (verdict band + the 7-phase
 * approval flow + the Refine chat) now lives inside the Book Studio (see
 * promise-detail-content.tsx, rendered as the PROMISE stage slot). This
 * route only preserves old links, including the onboarding wizard.
 */
export default async function PromiseStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ wizard?: string }>;
}) {
  const { slug } = await params;
  const query = (await searchParams) ?? {};
  redirect(`/books/${slug}?stage=PROMISE${query.wizard === "true" ? "&wizard=true" : ""}`);
}
