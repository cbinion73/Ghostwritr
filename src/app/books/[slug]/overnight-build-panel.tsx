"use client";

import { useState, useTransition } from "react";

import type { MorningReport } from "@/lib/workflows/overnight-build";
import {
  acknowledgeMorningReportAction,
  startOvernightBuildAction,
  stopOvernightBuildAction,
} from "./overnight-actions";

/**
 * The Overnight Build controls — "Write the Book" button while idle, a
 * building indicator while active, and the Morning Report when one is
 * waiting to be read.
 */
export function OvernightBuildControls({
  slug,
  active,
}: {
  slug: string;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (active) {
    return (
      <button
        onClick={() => startTransition(() => stopOvernightBuildAction(slug))}
        disabled={pending}
        style={{ ...buttonStyle, background: "#3a2c20", color: "#e8c87a" }}
        title="The autopilot is writing the book in the background. Click to stop."
      >
        <span style={{ animation: "ghostwritr-pulse 2s infinite" }}>✒</span> Writing… (stop)
      </button>
    );
  }

  return (
    <button
      onClick={() => startTransition(() => startOvernightBuildAction(slug))}
      disabled={pending}
      style={buttonStyle}
      title="Run the whole pipeline — base story, research, stories, chapter drafts, repair passes, and the editorial loop — and wake up to a Morning Report."
    >
      ✒ Write the Book
    </button>
  );
}

export function MorningReportBanner({
  slug,
  report,
}: {
  slug: string;
  report: MorningReport;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const tone =
    report.outcome === "complete"
      ? { border: "#79b98a", label: "BUILD COMPLETE" }
      : report.outcome === "blocked"
        ? { border: "#c65b4e", label: "BUILD BLOCKED" }
        : { border: "#c9a24b", label: "MORNING REPORT" };

  return (
    <div style={{ ...bannerStyle, borderLeft: `4px solid ${tone.border}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span className="microlabel" style={{ color: tone.border, fontWeight: 700 }}>
          {tone.label}
        </span>
        <span style={{ flex: 1, minWidth: 240 }}>{report.headline}</span>
        <button style={linkButtonStyle} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide details" : "Details"}
        </button>
        <button
          style={linkButtonStyle}
          disabled={pending}
          onClick={() => startTransition(() => acknowledgeMorningReportAction(slug))}
        >
          Dismiss
        </button>
      </div>

      {expanded && (
        <div style={detailStyle}>
          <div style={statRowStyle}>
            <Stat label="Chapters drafted" value={`${report.chaptersDrafted}/${report.totalChapters || "?"}`} />
            <Stat label="Words written" value={report.wordsWritten.toLocaleString()} />
            <Stat label="Stages committed" value={String(report.stagesCommitted.length)} />
            <Stat label="LLM calls" value={String(report.llmCalls)} />
            <Stat label="Spend" value={`$${report.spendUsd.toFixed(2)}`} />
          </div>

          {report.needsJudgment.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="microlabel" style={{ marginBottom: 6 }}>Needs your judgment</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                {report.needsJudgment.map((item, index) => (
                  <li key={`${item.stage}-${index}`} style={{ fontSize: 13 }}>
                    <strong>{item.stage}</strong> — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.stagesCommitted.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted, #6f6256)" }}>
              Committed this build: {report.stagesCommitted.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="microlabel" style={{ color: "var(--muted, #6f6256)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid rgba(201,162,75,0.5)",
  background: "#22331f",
  color: "#d8c893",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const bannerStyle: React.CSSProperties = {
  margin: "0",
  padding: "10px 16px",
  background: "var(--paper, #f2ebdc)",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 13.5,
};

const linkButtonStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  color: "var(--green-ink, #2f5d43)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
  padding: 0,
};

const detailStyle: React.CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px dashed rgba(0,0,0,0.12)",
};

const statRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 28,
  flexWrap: "wrap",
};
