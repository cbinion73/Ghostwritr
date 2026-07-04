import { redirect } from "next/navigation";

/**
 * Retired standalone view — PostProductionPageShell only wrapped the same
 * AgentChatPanel the Studio already renders for this stage (it already
 * shows the persona icon/name/tagline itself), in extra standalone-page
 * chrome. Nothing unique to preserve; this route just redirects.
 */
export default async function CourseDesignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/books/${slug}?stage=COURSE_DESIGN`);
}
