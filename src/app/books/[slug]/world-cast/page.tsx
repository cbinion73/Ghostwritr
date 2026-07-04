import { redirect } from "next/navigation";

/**
 * Retired standalone view — World & Cast now lives inside the Book Studio
 * (see fiction-stage-detail-content.tsx, rendered as the WORLD_CAST slot).
 * This route only preserves old links.
 */
export default async function WorldCastPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/books/${slug}?stage=WORLD_CAST`);
}
