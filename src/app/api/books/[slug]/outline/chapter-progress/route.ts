import { NextRequest, NextResponse } from "next/server";
import { getChapterGenerationProgress } from "@/lib/workflows/outline-progress-tracker";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
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
