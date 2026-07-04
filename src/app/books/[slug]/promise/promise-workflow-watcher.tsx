"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * The Promise stage runs its chat turns inline via a fire-and-forget server
 * action (to dodge the request timeout — see submitPromiseMessage) rather
 * than a real BookStage.status flip, so nothing tells the page to refetch
 * once the reply is actually ready. Without this, the author submits a
 * refine/objection message, the form action returns immediately (before the
 * LLM has run), and the page just... sits there looking unchanged forever.
 *
 * This polls the existing /activity endpoint's promiseInline flag (already
 * built for the activity ticker) and refreshes the route once a run that
 * was in flight completes, so new messages/scores actually show up without
 * a manual reload.
 */
export function PromiseWorkflowWatcher({ slug }: { slug: string }) {
  const router = useRouter();
  const wasRunning = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/books/${slug}/activity`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const payload = (await res.json()) as { promiseInline?: { elapsedSeconds: number } | null };
        if (cancelled) return;

        const running = Boolean(payload.promiseInline);
        if (wasRunning.current && !running) {
          router.refresh();
        }
        wasRunning.current = running;
        timer = setTimeout(poll, running ? 1500 : 4000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 6000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [slug, router]);

  return null;
}
