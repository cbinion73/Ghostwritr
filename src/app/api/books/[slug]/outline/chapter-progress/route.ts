import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { getChapterGenerationProgress } from "@/lib/workflows/outline-progress-tracker";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  try {
    await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const progress = getChapterGenerationProgress(slug);

  if (!progress) {
    return NextResponse.json(
      { status: "idle", progress: null },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { status: "generating", progress },
    { status: 200 }
  );
}
