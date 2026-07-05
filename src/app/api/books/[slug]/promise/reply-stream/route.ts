import { NextResponse } from "next/server";
import { getPromiseReplyStream } from "@/lib/workflows/promise-reply-stream-tracker";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const stream = getPromiseReplyStream(slug);

  if (!stream) {
    return NextResponse.json({ active: false, text: "", done: false });
  }

  return NextResponse.json({ active: true, text: stream.text, done: stream.done });
}
