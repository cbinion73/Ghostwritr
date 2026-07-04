import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Retired standalone view — the Story Vault now lives inside the Book
 * Studio (see external-stories-content.tsx, rendered as the
 * EXTERNAL_STORIES stage slot). This route only preserves old links.
 */
export default async function ExternalStoriesStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tabId?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  redirect(
    `/books/${slug}?stage=EXTERNAL_STORIES${query.tabId ? `&tabId=${encodeURIComponent(query.tabId)}` : ""}`,
  );
}
