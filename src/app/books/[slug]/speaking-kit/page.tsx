import { redirect } from "next/navigation";

/** Retired — Speaking Kit was removed as a workflow stage. */
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/books/${slug}`);
}
