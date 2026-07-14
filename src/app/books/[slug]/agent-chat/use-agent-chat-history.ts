import { useEffect, useState } from "react";
import type { StageKey } from "@prisma/client";

import { fetchJson, fetchOk } from "@/lib/ui/client-request";
import type { ChatMessage } from "./types";

export function useAgentChatHistory({ slug, stageKey, persistChat, intro }: {
  slug: string;
  stageKey: StageKey;
  persistChat: boolean;
  intro: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const persistMessages = (nextMessages: ChatMessage[]) => {
    if (!persistChat) return;
    const messagesToSave = nextMessages
      .filter((message) => !message.streaming)
      .map(({ role, content }) => ({ role, content }));
    void fetchOk(`/api/books/${slug}/agent-chat/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageKey, messages: messagesToSave }),
    }).catch((error: unknown) => {
      console.warn("[AgentChatPanel] History save failed:", error);
    });
  };

  useEffect(() => {
    if (!persistChat) {
      setMessages([{ role: "agent", content: intro }]);
      return;
    }
    void (async () => {
      try {
        const data = await fetchJson<{ messages: ChatMessage[] }>(
          `/api/books/${slug}/agent-chat/history?stageKey=${stageKey}`,
        );
        if (data.messages?.length > 0) {
          setMessages(data.messages);
          return;
        }
      } catch {
        // Missing history is equivalent to a new conversation.
      }
      setMessages([{ role: "agent", content: intro }]);
    })();
    // Chat history is initialized once for this mounted stage panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { messages, setMessages, persistMessages };
}
