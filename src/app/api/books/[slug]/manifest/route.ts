import { NextResponse } from "next/server";
import { ArtifactStatus } from "@prisma/client";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { generateManifest } from "@/lib/workflows/manifest-generator";

export const maxDuration = 300;
export const runtime = "nodejs";

// GET — return manifest content and stage status
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "MANIFEST" } },
    select: {
      status: true,
      artifacts: {
        where: { status: { not: ArtifactStatus.SUPERSEDED } },
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
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Supersede existing manifest artifacts so regeneration starts fresh
  // without erasing prior generation history.
  const existingStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "MANIFEST" } },
    select: { id: true, artifacts: { select: { id: true } } },
  });
  if (existingStage) {
    const artifactIds = existingStage.artifacts.map((artifact) => artifact.id);
    if (artifactIds.length > 0) {
      await db.artifactVersion.updateMany({
        where: { artifactId: { in: artifactIds } },
        data: { lifecycleState: ArtifactStatus.SUPERSEDED },
      });
      await db.artifact.updateMany({
        where: { id: { in: artifactIds } },
        data: { status: ArtifactStatus.SUPERSEDED },
      });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, ...(typeof data === "object" && data !== null ? data : { message: data }) })}\n\n`));
      };

      try {
        send("status", { message: "Starting manifest generation…" });
        // Pass onChunk so each LLM token is forwarded as a heartbeat SSE event.
        // This keeps the connection alive through nginx / reverse proxies that
        // would otherwise drop the stream after ~60s of silence.
        const result = await generateManifest(
          book.id,
          (text) => {
            send("chunk", { text });
          },
          { bookSlug: slug, bookTitle: book.titleWorking ?? undefined },
        );
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
