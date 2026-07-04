import { redirect } from "next/navigation";

/**
 * Retired standalone view — Story Core now lives inside the Book Studio
 * (see fiction-stage-detail-content.tsx, rendered as the STORY_CORE slot).
 * This route only preserves old links.
 */
export default async function StoryCorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/books/${slug}?stage=STORY_CORE`);
}
