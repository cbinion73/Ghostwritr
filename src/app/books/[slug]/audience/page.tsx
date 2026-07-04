import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Retired standalone view — the Audience stage was folded into Promise's
 * own conversational flow (phase 2/7, "Audience"), since the standalone
 * page never produced its own data and reused Outline's agent persona by
 * mistake. This route only preserves old links.
 */
export default async function AudienceStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/books/${slug}?stage=PROMISE`);
}
