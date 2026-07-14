import { NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { getPromiseReplyStream } from "@/lib/workflows/promise-reply-stream-tracker";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  try {
    await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stream = getPromiseReplyStream(slug);

  if (!stream) {
    return NextResponse.json({ active: false, text: "", done: false });
  }

  return NextResponse.json({ active: true, text: stream.text, done: stream.done });
}
