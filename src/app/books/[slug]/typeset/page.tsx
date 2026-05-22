import { redirect } from "next/navigation";

export default async function TypesetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/books/${slug}`);
}
