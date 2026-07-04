import { redirect } from "next/navigation";

/**
 * Retired standalone view — the Editing room (editorial modes, revision
 * plans, version comparison, export) now lives inside the Book Studio (see
 * editing-detail-content.tsx, rendered as the EDITING stage slot). This
 * route only preserves old links, including comparison deep links.
 */
export default async function EditingStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const nextQuery = new URLSearchParams({ stage: "EDITING" });
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") nextQuery.set(key, value);
  }
  redirect(`/books/${slug}?${nextQuery.toString()}`);
}
