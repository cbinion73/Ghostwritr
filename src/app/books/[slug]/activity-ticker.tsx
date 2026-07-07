"use client";

/**
 * Live activity + running-spend ticker.
 *
 * Polls /api/books/[slug]/activity — 2.5s while a workflow is active, 15s
 * when idle — and shows what the pipeline is doing right now, how long it
 * has been at it, and what it has spent (this run + book total).
 */

import { useEffect, useRef, useState } from "react";

type ActivityRun = {
  runId: string;
  stageKey: string;
  stageLabel: string;
  status: string;
  elapsedSeconds: number;
  costUsd: number;
  totalTokens: number;
  callCount: number;
  latestStageRole: string | null;
};

type ActivityResponse = {
  active: boolean;
  runs: ActivityRun[];
  promiseInline: { elapsedSeconds: number } | null;
  totals: { allTimeCostUsd: number; todayCostUsd: number };
};

const ACTIVE_POLL_MS = 2500;
const IDLE_POLL_MS = 15000;

/** Plain-words verbs for stage roles, e.g. "voice-guard:critic" → "voice-guard reviewing". */
const ROLE_VERBS: Record<string, string> = {
  "chapter-draft:author": "writing prose",
  "chapter-draft:revise": "revising",
  "voice-guard:critic": "voice-guard reviewing",
  "research:agent-1-researcher": "researching sources",
  "research:agent-2-extractor": "reading sources",
  "research:agent-3-verifier": "verifying claims",
  "external-stories:extract": "finding stories",
  "base-story:author": "writing base story",
  "final-editor:assess": "editorial assessment",
  "final-editor:polish": "polishing prose",
  "manifest:generate": "bundling research",
  "length-adjustment:author": "adjusting length",
};

function verbForRole(role: string | null): string {
  if (!role) return "starting up";
  return ROLE_VERBS[role] ?? role.replace(":", " · ");
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function ActivityTicker({ slug }: { slug: string }) {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      let nextDelay = IDLE_POLL_MS;
      try {
        const res = await fetch(`/api/books/${slug}/activity`, { cache: "no-store" });
        if (res.ok) {
          const payload = (await res.json()) as ActivityResponse;
          if (!cancelled) {
            setData(payload);
            nextDelay = payload.active ? ACTIVE_POLL_MS : IDLE_POLL_MS;
          }
        }
      } catch {
        // transient network error — keep last state, retry on idle cadence
      }
      if (!cancelled) {
        timerRef.current = setTimeout(poll, nextDelay);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [slug]);

  if (!data) return null;

  const run = data.runs[0];

  if (!data.active) {
    return (
      <span style={idleStyle} title={`Spent today: ${formatUsd(data.totals.todayCostUsd)}`}>
        {formatUsd(data.totals.allTimeCostUsd)} book
      </span>
    );
  }

  if (!run && data.promiseInline) {
    return (
      <span style={activeStyle}>
        <span style={pulseDotStyle} />
        Promise · thinking · {formatElapsed(data.promiseInline.elapsedSeconds)}
        <span style={totalStyle}>{formatUsd(data.totals.allTimeCostUsd)} book</span>
      </span>
    );
  }

  if (!run) return null;

  return (
    <span
      style={activeStyle}
      title={`${run.callCount} LLM calls · ${run.totalTokens.toLocaleString()} tokens this run · today ${formatUsd(data.totals.todayCostUsd)}`}
    >
      <span style={pulseDotStyle} />
      {run.stageLabel} · {verbForRole(run.latestStageRole)} · {formatElapsed(run.elapsedSeconds)} ·{" "}
      {formatUsd(run.costUsd)} run
      <span style={totalStyle}>{formatUsd(data.totals.allTimeCostUsd)} book</span>
    </span>
  );
}

const baseStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: "11px",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  borderRadius: 4,
  padding: "3px 8px",
};

const idleStyle: React.CSSProperties = {
  ...baseStyle,
  color: "var(--muted, #6f6256)",
  border: "1px solid var(--line, rgba(59,44,31,0.12))",
};

const activeStyle: React.CSSProperties = {
  ...baseStyle,
  color: "var(--gold, #8f6d32)",
  border: "1px solid var(--gold, #8f6d32)",
  background: "rgba(143,109,50,0.07)",
};

const pulseDotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "currentColor",
  animation: "ghostwritr-pulse 1.4s ease-in-out infinite",
};

const totalStyle: React.CSSProperties = {
  marginLeft: 4,
  paddingLeft: 8,
  borderLeft: "1px solid var(--line, rgba(59,44,31,0.2))",
  color: "var(--muted, #6f6256)",
};
