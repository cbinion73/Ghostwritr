"use client";

/**
 * Generic run controls + live feed for any chapter-scoped background stage
 * (Research, External Stories, Chapter Draft, ...). Opens a modal when
 * generation is launched, or reopens automatically if a run is already in
 * progress. Polls the given progress endpoint every 2s so the author can
 * watch chapters complete, see recent activity, and stop or retry without
 * leaving the page or guessing whether anything is happening.
 *
 * Polling the same progress data GhostWritr already stores in
 * BookStage.metadataJson costs nothing extra in tokens — it's not
 * token-by-token model streaming, just a live view of stage-level state.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SubmitButton } from "@/app/components/submit-button";

type FailedChapter = { chapterKey: string; message: string };
type ActivityEntry = { at: string; message: string };

type ProgressResponse = {
  status: string;
  automationStatus: string | null;
  currentAction: string | null;
  currentChapterKey: string | null;
  totalChapters: number;
  completedChapters: number;
  failedChapters: FailedChapter[];
  recentActivity: ActivityEntry[];
  lastRunAt: string | null;
};

const POLL_MS = 2000;

function formatElapsedSince(iso: string | null): string {
  if (!iso) return "";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s ago`;
}

export function StageRunPanel({
  stageLabel,
  progressUrl,
  generateAction,
  stopAction,
  retryAction,
  hasGenerated,
  canGenerate,
  initialStatus,
  chapterLabels,
  generateLabel,
  regenerateLabel,
}: {
  stageLabel: string;
  progressUrl: string;
  generateAction: () => Promise<void>;
  stopAction: () => Promise<void>;
  retryAction: () => Promise<void>;
  hasGenerated: boolean;
  canGenerate: boolean;
  initialStatus: string;
  chapterLabels: Record<string, string>;
  generateLabel: string;
  regenerateLabel: string;
}) {
  const [open, setOpen] = useState(initialStatus === "IN_PROGRESS");
  const [data, setData] = useState<ProgressResponse | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(progressUrl, { cache: "no-store" });
        if (res.ok && !cancelled) {
          setData((await res.json()) as ProgressResponse);
        }
      } catch {
        // transient network error — keep last known state, try again next tick
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
    // Poll continuously (not just while open) so the reopen pill knows a
    // run is active even after the modal has been dismissed.
  }, [progressUrl]);

  const isRunning = data?.status === "IN_PROGRESS";
  const isBlocked = data?.status === "BLOCKED";

  return (
    <>
      <form
        action={generateAction}
        onSubmit={(event) => {
          // Regenerating redoes every chapter from scratch — including ones
          // that already have a good, committed result — which re-spends
          // real tokens for no gain if the intent was just to fix one or two
          // chapters. Stop/Retry (resume) or the per-item "Generate
          // Selected" action are the cheap paths for that; this is the
          // deliberate full-restart, so it gets a confirmation.
          if (hasGenerated && !window.confirm(
            `${regenerateLabel}? This re-runs every chapter from scratch, including ones already done — it will re-spend tokens on chapters that don't need it. For fixing just one chapter, use Stop + Retry or "Generate Selected" instead.`,
          )) {
            event.preventDefault();
            return;
          }
          setOpen(true);
        }}
      >
        <SubmitButton
          className="btn"
          disabled={!canGenerate}
          label={hasGenerated ? regenerateLabel : generateLabel}
          pendingLabel="Starting..."
        />
      </form>

      {!open && isRunning ? (
        <button type="button" className="btn" onClick={() => setOpen(true)} style={reopenPillStyle}>
          <span style={pulseDotStyle} />
          {stageLabel} running — View
        </button>
      ) : null}

      {open && typeof document !== "undefined"
        ? createPortal(
            <div style={overlayStyle} role="dialog" aria-label={`${stageLabel} run`}>
              <div style={modalStyle}>
                <div style={headerStyle}>
                  <div>
                    <div className="microlabel" style={{ color: "var(--muted, #6f6256)" }}>
                      {stageLabel} Run
                    </div>
                    <h3 style={{ margin: "4px 0 0" }}>
                      {isRunning ? (
                        <>
                          <span style={pulseDotStyle} /> Running
                        </>
                      ) : isBlocked ? (
                        "Stopped"
                      ) : (
                        "Idle"
                      )}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setOpen(false)}
                    aria-label="Close (run keeps going in the background)"
                  >
                    Close
                  </button>
                </div>

                {data ? (
                  <>
                    <div style={statRowStyle}>
                      <span>
                        {data.completedChapters}/{data.totalChapters} chapters
                      </span>
                      {data.currentChapterKey ? (
                        <span>
                          Now: {chapterLabels[data.currentChapterKey] ?? data.currentChapterKey}
                        </span>
                      ) : null}
                      {data.lastRunAt ? <span>Updated {formatElapsedSince(data.lastRunAt)}</span> : null}
                    </div>

                    <div style={progressTrackStyle}>
                      <div
                        style={{
                          ...progressFillStyle,
                          width: `${
                            data.totalChapters > 0
                              ? Math.round((data.completedChapters / data.totalChapters) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>

                    {data.currentAction ? (
                      <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--muted, #6f6256)" }}>
                        {data.currentAction}
                      </div>
                    ) : null}

                    <div style={feedLabelStyle}>Live feed</div>
                    <div style={feedStyle}>
                      {data.recentActivity.length === 0 ? (
                        <div className="muted" style={{ fontSize: 13 }}>
                          No activity recorded yet.
                        </div>
                      ) : (
                        data.recentActivity.map((entry, index) => (
                          <div key={`${entry.at}-${index}`} style={feedEntryStyle}>
                            <span style={{ color: "var(--muted, #6f6256)", fontSize: 11 }}>
                              {formatElapsedSince(entry.at)}
                            </span>
                            <span>{entry.message}</span>
                          </div>
                        ))
                      )}
                    </div>

                    {data.failedChapters.length > 0 ? (
                      <>
                        <div style={{ ...feedLabelStyle, color: "#a5342a" }}>
                          Failed chapters ({data.failedChapters.length})
                        </div>
                        <div style={feedStyle}>
                          {data.failedChapters.map((entry) => (
                            <div key={entry.chapterKey} style={feedEntryStyle}>
                              <strong>{chapterLabels[entry.chapterKey] ?? entry.chapterKey}</strong>
                              <span style={{ color: "#a5342a", fontSize: 12 }}>
                                {entry.message.slice(0, 160)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </>
                ) : (
                  <div className="muted">Loading run status…</div>
                )}

                <div style={footerStyle}>
                  {isRunning ? (
                    <form action={stopAction}>
                      <SubmitButton className="btn" label={`Stop ${stageLabel}`} pendingLabel="Stopping..." />
                    </form>
                  ) : null}
                  {isBlocked ? (
                    <form action={retryAction}>
                      <SubmitButton
                        className="btn btn-primary"
                        label={`Retry ${stageLabel}`}
                        pendingLabel="Retrying..."
                      />
                    </form>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

const reopenPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const pulseDotStyle: React.CSSProperties = {
  display: "inline-block",
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--gold-bright, #c9a24b)",
  animation: "ghostwritr-pulse 1.4s ease-in-out infinite",
  marginRight: 6,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(20, 16, 10, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: "min(520px, 92vw)",
  maxHeight: "80vh",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: 20,
  borderRadius: 12,
  background: "var(--paper, #fbf6ef)",
  border: "1px solid var(--line, rgba(59,44,31,0.14))",
  boxShadow: "0 20px 60px rgba(20,16,10,0.35)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
};

const statRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  fontSize: 13,
  color: "var(--ink, #2d241d)",
  fontVariantNumeric: "tabular-nums",
};

const progressTrackStyle: React.CSSProperties = {
  height: 6,
  borderRadius: 999,
  overflow: "hidden",
  background: "rgba(93, 85, 68, 0.15)",
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  background: "var(--gold-bright, #c9a24b)",
  transition: "width 0.3s ease-out",
};

const feedLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--muted, #6f6256)",
  marginTop: 4,
};

const feedStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: 160,
  overflowY: "auto",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(93, 85, 68, 0.06)",
};

const feedEntryStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  fontSize: 13,
  lineHeight: 1.4,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  borderTop: "1px solid var(--line, rgba(59,44,31,0.14))",
  paddingTop: 12,
};
