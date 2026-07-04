import { redirect } from "next/navigation";

/**
 * Retired standalone view — the Settings room (the real configuration
 * form: voice, targets, guardrails) now lives inside the Book Studio (see
 * book-setup-detail-content.tsx, rendered as the BOOK_SETUP stage slot,
 * alongside Blueprint's conversational panel). This route only preserves
 * old links.
 */
export default async function BookSetupStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/books/${slug}?stage=BOOK_SETUP`);
}
