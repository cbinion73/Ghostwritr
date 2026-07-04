import { redirect } from "next/navigation";

/** Typeset is Studio-native (see workspace-shell.tsx TYPESET slot) — this route
 * only preserves old links, now correctly landing on the Typeset stage itself. */
export default async function TypesetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/books/${slug}?stage=TYPESET`);
}
