import { redirect } from "next/navigation";

/**
 * Retired standalone view — the Outline room (the real 3-phase approval
 * flow: sections & chapters → chapter breakdowns → full ToC, each with its
 * own phase chat) now lives inside the Book Studio (see
 * outline-detail-content.tsx, rendered as the OUTLINE stage slot). This
 * route only preserves old links, including phase/target deep links.
 */
export default async function OutlineStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ phase?: string; targetType?: string; targetId?: string }>;
}) {
  const { slug } = await params;
  const query = (await searchParams) ?? {};
  const nextQuery = new URLSearchParams({ stage: "OUTLINE" });
  if (query.phase) nextQuery.set("phase", query.phase);
  if (query.targetType) nextQuery.set("targetType", query.targetType);
  if (query.targetId) nextQuery.set("targetId", query.targetId);
  redirect(`/books/${slug}?${nextQuery.toString()}`);
}
