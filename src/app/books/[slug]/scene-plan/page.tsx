import { redirect } from "next/navigation";

/**
 * Retired standalone view — Scene Plan now lives inside the Book Studio
 * (see fiction-stage-detail-content.tsx, rendered as the SCENE_PLAN slot).
 * This route only preserves old links, including the ?chapter= deep link.
 */
export default async function ScenePlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const nextQuery = new URLSearchParams({ stage: "SCENE_PLAN" });
  const chapter = query.chapter;
  if (typeof chapter === "string") nextQuery.set("chapter", chapter);
  redirect(`/books/${slug}?${nextQuery.toString()}`);
}
