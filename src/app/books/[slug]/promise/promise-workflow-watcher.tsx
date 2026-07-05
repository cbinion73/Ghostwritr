"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * The Promise stage runs its chat turns inline via a fire-and-forget server
 * action (to dodge the request timeout — see submitPromiseMessage) rather
 * than a real BookStage.status flip, so nothing tells the page to refetch
 * once the reply is actually ready. Without this, the author submits a
 * refine/objection message and the page just... sits there looking
 * unchanged until a manual reload.
 *
 * Design: rather than trust a single in-memory "is it running" flag (fragile
 * — easy to miss the transition on a slow poll, and worthless as evidence
 * without a live browser to watch it fire), this polls on a plain fixed
 * interval and calls router.refresh() unconditionally, stopping only once
 * the message count it's given has actually grown past what it started at.
 * That's the one signal that can't lie: either the transcript grew or it
 * didn't. A hard time cap prevents refreshing forever if something hangs.
 */
export function PromiseWorkflowWatcher({
  slug,
  messageCount,
  armedFor,
}: {
  slug: string;
  /** Current number of messages in the transcript, from the server-rendered prop. */
  messageCount: number;
  /**
   * Bump this (e.g. to Date.now()) right when the author submits a message,
   * to arm a fresh watch window. Watching starts from messageCount at that
   * moment and stops once messageCount increases or the cap elapses.
   */
  armedFor: number | null;
}) {
  const router = useRouter();
  const baseline = useRef<{ armedFor: number; count: number } | null>(null);
  // tick() runs on its own setTimeout loop and must always see the latest
  // count, not the value closed over when the effect last (re)started — a
  // ref sidesteps that stale-closure trap.
  const latestCount = useRef(messageCount);
  latestCount.current = messageCount;

  useEffect(() => {
    if (armedFor == null) return;
    // A fresh submission always arms a new window, even if one was already
    // running (e.g. the author sent a second message before the first
    // reply appeared) — restart the baseline against the current count.
    if (!baseline.current || baseline.current.armedFor !== armedFor) {
      baseline.current = { armedFor, count: messageCount };
    }
  }, [armedFor, messageCount]);

  useEffect(() => {
    if (armedFor == null) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    const HARD_CAP_MS = 3 * 60 * 1000; // stop refreshing after 3 minutes regardless

    function tick() {
      if (cancelled) return;

      const grew = baseline.current != null && latestCount.current > baseline.current.count;
      const timedOut = Date.now() - startedAt > HARD_CAP_MS;
      if (grew || timedOut) return;

      router.refresh();
      timer = setTimeout(tick, 2500);
    }

    timer = setTimeout(tick, 2500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [slug, armedFor, router]);

  return null;
}
