import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateManifest } from "@/lib/workflows/manifest-generator";

export const maxDuration = 300;

// GET — return manifest content and stage status
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "MANIFEST" } },
    select: {
      status: true,
      artifacts: {
        select: {
          id: true,
          title: true,
          versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    status: stage?.status ?? "NOT_STARTED",
    content: stage?.artifacts[0]?.versions[0]?.contentText ?? null,
    artifactId: stage?.artifacts[0]?.id ?? null,
  });
}

// POST — generate (or regenerate) the manifest, stream progress events
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete any existing manifest artifacts so we start fresh
  const existingStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "MANIFEST" } },
    select: { id: true },
  });
  if (existingStage) {
    await db.artifact.deleteMany({ where: { stageId: existingStage.id } });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, ...(typeof data === "object" && data !== null ? data : { message: data }) })}\n\n`));
      };

      try {
        send("status", { message: "Starting manifest generation…" });
        const result = await generateManifest(book.id);
        if (result.success) {
          send("complete", { message: "Manifest generated successfully.", content: result.content });
        } else {
          send("error", { message: result.error ?? "Generation failed" });
        }
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Unexpected error" });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
