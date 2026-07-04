import { redirect } from "next/navigation";

/**
 * Retired standalone view — the real Export & Publishing Pipeline (validation
 * report, chapter readiness, typeset/publish packages) now lives inside the
 * Book Studio (see typeset-detail-content.tsx, rendered as the TYPESET stage
 * slot). This route only preserves old links.
 */
export default async function PublishPipelinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/books/${slug}?stage=TYPESET`);
}
