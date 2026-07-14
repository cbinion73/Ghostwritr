import type { StageKey } from "@prisma/client";

import { db } from "@/lib/db";

export type PersistedAgentChatMessage = {
  role: "user" | "agent";
  content: string;
};

function normalizeMessages(messages: unknown): PersistedAgentChatMessage[] {
  return Array.isArray(messages)
    ? messages.filter(
        (message): message is PersistedAgentChatMessage =>
          Boolean(message) &&
          typeof message === "object" &&
          ((message as { role?: unknown }).role === "user" ||
            (message as { role?: unknown }).role === "agent") &&
          typeof (message as { content?: unknown }).content === "string",
      )
    : [];
}

export async function listAgentChatMessages(bookId: string, stageKey: StageKey) {
  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId, stageKey } },
    select: {
      id: true,
      metadataJson: true,
      agentChatMessages: {
        orderBy: { orderIndex: "asc" },
        select: { role: true, content: true },
      },
    },
  });

  if (!stage) return [];
  if (stage.agentChatMessages.length > 0) {
    return normalizeMessages(stage.agentChatMessages);
  }

  const metadata =
    stage.metadataJson && typeof stage.metadataJson === "object" && !Array.isArray(stage.metadataJson)
      ? (stage.metadataJson as Record<string, unknown>)
      : {};
  return normalizeMessages(metadata.chatHistory);
}

export async function replaceAgentChatMessages(
  bookId: string,
  stageKey: StageKey,
  messages: PersistedAgentChatMessage[],
) {
  const stage = await db.bookStage.upsert({
    where: { bookId_stageKey: { bookId, stageKey } },
    update: {},
    create: {
      bookId,
      stageKey,
      status: "NOT_STARTED",
    },
    select: { id: true },
  });

  await db.$transaction([
    db.agentChatMessage.deleteMany({ where: { stageId: stage.id } }),
    ...messages.map((message, orderIndex) =>
      db.agentChatMessage.create({
        data: {
          bookId,
          stageId: stage.id,
          role: message.role,
          content: message.content,
          orderIndex,
        },
      }),
    ),
  ]);
}
