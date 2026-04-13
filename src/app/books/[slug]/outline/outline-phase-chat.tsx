"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { sendOutlinePhaseMessage } from "./actions";

type OutlinePhaseId = "sections-chapters" | "chapter-breakdowns" | "full-toc";
type OutlineActionPhaseId = "sectionsChapters" | "chapterBreakdowns" | "fullToc";

type OutlineChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

interface OutlinePhaseChatProps {
  slug: string;
  phase: OutlinePhaseId;
  actionPhase: OutlineActionPhaseId;
  messages: OutlineChatMessage[];
  placeholder: string;
  helperText: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
}

export function OutlinePhaseChat({
  slug,
  phase,
  actionPhase,
  messages,
  placeholder,
  helperText,
  targetType,
  targetId,
  targetLabel,
}: OutlinePhaseChatProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState(messages);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setThread(messages);
  }, [messages, phase]);

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (!trimmed || isPending) {
      return;
    }

    const optimisticMessage: OutlineChatMessage = {
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    setThread((prev) => [...prev, optimisticMessage]);
    setDraft("");
    setError(null);

    startTransition(async () => {
      const result = await sendOutlinePhaseMessage(
        slug,
        actionPhase,
        trimmed,
        targetType,
        targetId,
        targetLabel,
      );

      setThread(result.messages);
      setError(result.error);
      router.refresh();
    });
  };

  return (
    <div className="card">
      <h3>AI Chat</h3>
      <div className="muted" style={{ lineHeight: 1.6 }}>
        {helperText}
      </div>

      {targetLabel ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(219,234,254,0.6)",
            border: "1px solid rgba(37,99,235,0.2)",
            fontSize: 12,
            color: "#1d4ed8",
            fontWeight: 600,
          }}
        >
          Focused on: {targetLabel}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxHeight: 360,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {thread.length === 0 ? (
          <div
            style={{
              borderRadius: 14,
              padding: 14,
              background: "rgba(255,255,255,0.65)",
              border: "1px solid var(--line)",
              color: "var(--muted)",
              lineHeight: 1.6,
              fontSize: 13,
            }}
          >
            Start a conversation with this phase. Ask for changes, clarification, or a fresh pass.
          </div>
        ) : (
          thread.map((message, index) => (
            <div
              key={`${message.role}-${message.createdAt}-${index}`}
              style={{
                alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "92%",
                borderRadius: 14,
                padding: "12px 14px",
                background:
                  message.role === "user"
                    ? "var(--accent, #16384f)"
                    : "rgba(255,255,255,0.72)",
                color: message.role === "user" ? "#fff" : "var(--ink, #2d241d)",
                border:
                  message.role === "user"
                    ? "1px solid var(--accent, #16384f)"
                    : "1px solid var(--line)",
                lineHeight: 1.55,
                fontSize: 13,
              }}
            >
              {message.content}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          style={{
            width: "100%",
            minHeight: 140,
            resize: "vertical",
            borderRadius: 16,
            border: "1px solid var(--line)",
            padding: 14,
            background: "rgba(255,255,255,0.72)",
            font: "inherit",
          }}
        />
        {error ? (
          <div
            style={{
              borderRadius: 12,
              padding: "10px 12px",
              background: "rgba(254,242,242,0.75)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#b91c1c",
              fontSize: 12,
              lineHeight: 1.55,
            }}
          >
            {error}
          </div>
        ) : null}
        <button
          className="btn btn-primary"
          disabled={isPending || draft.trim().length === 0}
          onClick={handleSubmit}
          type="button"
        >
          {isPending ? "Sending..." : "Send to AI"}
        </button>
      </div>
    </div>
  );
}
