"use client";

import { useEffect, useState } from "react";
import type { StageKey } from "@prisma/client";

/**
 * Live in-panel activity strip — while the selected stage has an active
 * background run, shows what the agent is doing right now (current LLM
 * role, elapsed time, call count, spend), updating every 2.5s. Renders
 * nothing when the stage is idle.
 */

type ActivityRun = {
  runId: string;
  stageKey: string;
  status: string;
  elapsedSeconds: number;
  costUsd: number;
  totalTokens: number;
  callCount: number;
  latestStageRole: string | null;
};

const ROLE_NARRATION: Record<string, string> = {
  "chapter-draft:author": "The author agent is writing prose",
  "chapter-draft:revise": "The author agent is revising against editorial notes",
  "voice-guard:critic": "The voice critic is challenging the draft for AI tells",
  "research:agent-1-researcher": "The researcher is finding and synthesizing sources",
  "research:agent-2-extractor": "The extractor is pulling passages from sources",
  "research:agent-3-verifier": "The verifier is checking claims against excerpts",
  "external-stories:extract": "The story scout is extracting real-world cases",
  "base-story:author": "The narrative agent is weaving the base story",
  "final-editor:assess": "The editor is assessing the manuscript",
  "final-editor:polish": "The editor is polishing prose",
  "fiction:planner": "The story planner is working",
  "fiction:draft": "The fiction author is drafting the scene",
  "manifest:generate": "The manifest agent is assigning sources to chapters",
};

function narrate(role: string | null) {
  if (!role) return "The agent is working";
  return ROLE_NARRATION[role] ?? `Working: ${role.replace(/[:-]/g, " ")}`;
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function StageLiveFeed({ slug, stageKey }: { slug: string; stageKey: StageKey }) {
  const [run, setRun] = useState<ActivityRun | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/books/${slug}/activity`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const payload = (await res.json()) as { runs?: ActivityRun[] };
        if (cancelled) return;
        const match = (payload.runs ?? []).find((r) => r.stageKey === stageKey) ?? null;
        setRun(match);
        // Poll fast while running, slow while idle (cheap existence check).
        timer = setTimeout(poll, match ? 2500 : 8000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 10000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [slug, stageKey]);

  if (!run) return null;

  return (
    <div style={stripStyle}>
      <span style={{ animation: "ghostwritr-pulse 1.6s infinite", marginRight: 8 }}>✒</span>
      <span style={{ fontWeight: 600 }}>{narrate(run.latestStageRole)}…</span>
      <span style={metaStyle}>
        {formatElapsed(run.elapsedSeconds)} · {run.callCount} call{run.callCount === 1 ? "" : "s"} ·{" "}
        {run.totalTokens.toLocaleString()} tokens · ${run.costUsd.toFixed(2)}
      </span>
    </div>
  );
}

const stripStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "7px 16px",
  fontSize: 12.5,
  background: "rgba(201,162,75,0.10)",
  borderBottom: "1px solid rgba(201,162,75,0.25)",
  color: "var(--ink, #2c261c)",
  flexShrink: 0,
};

const metaStyle: React.CSSProperties = {
  marginLeft: "auto",
  fontFamily: "var(--mono, ui-monospace)",
  fontSize: 11,
  color: "var(--muted, #6f6256)",
  whiteSpace: "nowrap",
};
