import { redirect } from "next/navigation";

/**
 * This route was referenced by stage-tokens.ts (route: `/books/${slug}/manifest`)
 * but no page ever existed here — a dead link, 404ing on click. Chapter
 * Manifest has always been Studio-native (see manifest-panel.tsx, mounted
 * as the MANIFEST stage slot); this file just makes the registered route
 * actually work.
 */
export default async function ManifestStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/books/${slug}?stage=MANIFEST`);
}
