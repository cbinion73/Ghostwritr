import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import {
  listAgentChatMessages,
  replaceAgentChatMessages,
  type PersistedAgentChatMessage,
} from "@/lib/repositories/agent-chat-messages";
import {
  REQUEST_LIMITS,
  RequestLimitError,
  assertChatMessagesWithinLimit,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

// ── GET /api/books/[slug]/agent-chat/history?stageKey=EDITING ─────────────────
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const stageKey = searchParams.get("stageKey") as StageKey | null;
  if (!stageKey) return NextResponse.json({ messages: [] });

  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ messages: [] });

  const messages = await listAgentChatMessages(book.id, stageKey);

  return NextResponse.json({ messages });
}

// ── POST /api/books/[slug]/agent-chat/history ─────────────────────────────────
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let body: { stageKey: StageKey; messages: PersistedAgentChatMessage[] };
  try {
    body = await parseLimitedJson(req, {
      limitBytes: REQUEST_LIMITS.chatJsonBytes,
      label: "Chat history request",
    });
    assertChatMessagesWithinLimit(body.messages ?? []);
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { stageKey, messages } = body;
  if (!stageKey || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing stageKey or messages" }, { status: 400 });
  }

  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  await replaceAgentChatMessages(book.id, stageKey, messages);

  return NextResponse.json({ ok: true });
}
