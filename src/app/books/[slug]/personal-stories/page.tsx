import { redirect } from "next/navigation";

/**
 * Retired standalone view — the Interview room (chapter-aware interview +
 * story encyclopedia) now lives inside the Book Studio (see
 * personal-stories-content.tsx, rendered as the PERSONAL_STORIES stage
 * slot). This route only preserves old links.
 */
export default async function PersonalStoriesStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/books/${slug}?stage=PERSONAL_STORIES`);
}
