import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Retired standalone view — the Evidence Room now lives inside the Book
 * Studio (see evidence-room-content.tsx, rendered as the RESEARCH stage
 * slot). This route only preserves old links and binder-tab deep links.
 */
export default async function ResearchStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tabId?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  redirect(
    `/books/${slug}?stage=RESEARCH${query.tabId ? `&tabId=${encodeURIComponent(query.tabId)}` : ""}`,
  );
}
