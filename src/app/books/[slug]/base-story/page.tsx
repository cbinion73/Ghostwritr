import { redirect } from "next/navigation";

/**
 * Retired standalone view — the Base Story room (narrative spine: generate,
 * review, commit) now lives inside the Book Studio (see
 * base-story-detail-content.tsx, rendered as the BASE_STORY stage slot).
 * This route only preserves old links.
 */
export default async function BaseStoryStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/books/${slug}?stage=BASE_STORY`);
}
