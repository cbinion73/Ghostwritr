import { redirect } from "next/navigation";

export default async function ParagraphOutlinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ targetType?: string; targetId?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const nextQuery = new URLSearchParams({ phase: "chapter-breakdowns" });

  if (query.targetType) {
    nextQuery.set("targetType", query.targetType);
  }

  if (query.targetId) {
    nextQuery.set("targetId", query.targetId);
  }

  redirect(`/books/${slug}/outline?${nextQuery.toString()}`);
}
