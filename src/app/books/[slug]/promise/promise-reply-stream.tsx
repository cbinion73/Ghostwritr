"use client";

/**
 * Live view of the assistant's reply as it's actually generated — polls
 * the in-memory stream buffer (updated chunk-by-chunk server-side, see
 * promise-reply-stream-tracker.ts) every 350ms and renders the growing
 * text. This is real model output arriving incrementally, not a coarse
 * status message: the same tokens the app already pays for, just shown as
 * they're produced instead of only once the full reply lands.
 */

import { useEffect, useRef, useState } from "react";

const POLL_MS = 350;

export function PromiseReplyStream({ slug, active }: { slug: string; active: boolean }) {
  const [text, setText] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      setText("");
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/books/${slug}/promise/reply-stream`, { cache: "no-store" });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { active: boolean; text: string; done: boolean };
          setText(data.text);
        }
      } catch {
        // transient network error — keep last known text, try again next tick
      }
      if (!cancelled) {
        timerRef.current = setTimeout(poll, POLL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [slug, active]);

  if (!active) return null;

  return (
    <div style={styles.streamingMessage}>
      {text.length > 0 ? (
        <>
          {text}
          <span style={styles.cursor} />
        </>
      ) : (
        <span style={styles.thinkingLabel}>
          <span style={styles.thinkingDot} />
          Reading your message…
        </span>
      )}
    </div>
  );
}

const styles = {
  streamingMessage: {
    alignSelf: "flex-start" as const,
    maxWidth: "90%",
    padding: "12px 14px",
    borderRadius: "8px",
    lineHeight: 1.5,
    fontSize: "13px",
    wordWrap: "break-word" as const,
    backgroundColor: "var(--paper, #fbf6ef)",
    color: "var(--ink, #2d241d)",
    borderLeft: "3px solid var(--gold, #8f6d32)",
  },
  cursor: {
    display: "inline-block",
    width: "2px",
    height: "13px",
    marginLeft: "2px",
    verticalAlign: "text-bottom",
    backgroundColor: "var(--gold, #8f6d32)",
    animation: "ghostwritr-pulse 0.9s ease-in-out infinite",
  },
  thinkingLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    fontStyle: "italic",
    color: "var(--muted, #6f6256)",
  },
  thinkingDot: {
    display: "inline-block",
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    backgroundColor: "var(--gold, #8f6d32)",
    animation: "ghostwritr-pulse 1.4s ease-in-out infinite",
  },
};
