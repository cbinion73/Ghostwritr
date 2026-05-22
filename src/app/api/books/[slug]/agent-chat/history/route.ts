import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { db } from "@/lib/db";

type PersistedMessage = { role: "user" | "agent"; content: string };

// ── GET /api/books/[slug]/agent-chat/history?stageKey=EDITING ─────────────────
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const stageKey = searchParams.get("stageKey") as StageKey | null;
  if (!stageKey) return NextResponse.json({ messages: [] });

  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ messages: [] });

  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey } },
    select: { metadataJson: true },
  });

  const meta = (stage?.metadataJson ?? {}) as Record<string, unknown>;
  const messages = (meta.chatHistory ?? []) as PersistedMessage[];

  return NextResponse.json({ messages });
}

// ── POST /api/books/[slug]/agent-chat/history ─────────────────────────────────
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await req.json() as { stageKey: StageKey; messages: PersistedMessage[] };
  const { stageKey, messages } = body;
  if (!stageKey || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing stageKey or messages" }, { status: 400 });
  }

  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey } },
    select: { metadataJson: true },
  });

  const existing = (stage?.metadataJson ?? {}) as Record<string, unknown>;

  await db.bookStage.upsert({
    where: { bookId_stageKey: { bookId: book.id, stageKey } },
    update: { metadataJson: { ...existing, chatHistory: messages } },
    create: {
      bookId: book.id,
      stageKey,
      status: "NOT_STARTED",
      metadataJson: { chatHistory: messages },
    },
  });

  return NextResponse.json({ ok: true });
}
