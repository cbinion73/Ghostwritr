"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { StageKey } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type SplitStatus = "pending" | "splitting" | "review" | "approved" | "error";

interface SplitChapter {
  key: string;
  title: string;
  sourceDraftId: string;
  sourceContent: string;
  status: SplitStatus;
  bookProse?: string;
  workbookSection?: string;
  errorMsg?: string;
}

interface WorkbookSplitPanelProps {
  slug: string;
  bookTitle: string;
  onStageAdvance?: (key: StageKey) => void;
  onSkip?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkbookSplitPanel({ slug, bookTitle, onStageAdvance, onSkip }: WorkbookSplitPanelProps) {
  const [chapters, setChapters] = useState<SplitChapter[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [initialized, setInitialized] = useState(false);
  type ExpandedState = { key: string; mode: "book" | "workbook" } | null;
  const [expanded, setExpanded] = useState<ExpandedState>(null);

  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const chaptersRef = useRef<SplitChapter[]>([]);

  // ── Bootstrap: load chapters ──────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const res = await fetch(`/api/books/${slug}/workbook-split`);
      if (!res.ok) { setInitialized(true); return; }

      const data = await res.json() as {
        chapters: Array<{
          chapterKey: string;
          chapterTitle: string;
          sourceDraftId: string;
          sourceContent: string;
        }>;
      };

      const loaded: SplitChapter[] = data.chapters.map((c) => ({
        key: c.chapterKey,
        title: c.chapterTitle,
        sourceDraftId: c.sourceDraftId,
        sourceContent: c.sourceContent,
        status: "pending" as SplitStatus,
      }));

      setChapters(loaded);
      setInitialized(true);
    };
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => { chaptersRef.current = chapters; }, [chapters]);

  // ── Auto-start from first pending on mount ────────────────────────────────
  useEffect(() => {
    if (!initialized) return;
    if (runningRef.current) return;
    const firstPending = chapters.findIndex((c) => c.status === "pending");
    if (firstPending === -1) return;
    void runFromIndex(firstPending);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, chapters.length]);

  // ── Split a single chapter ────────────────────────────────────────────────
  const splitChapter = useCallback(async (
    chapter: SplitChapter,
    abort: AbortController,
  ): Promise<{ bookProse: string; workbookSection: string } | null> => {
    const res = await fetch(`/api/books/${slug}/workbook-split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        chapterKey: chapter.key,
        chapterTitle: chapter.title,
        sourceDraftId: chapter.sourceDraftId,
        chapterContent: chapter.sourceContent,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    const data = await res.json() as { bookProse: string; workbookSection: string };
    if (!data.bookProse || !data.workbookSection) return null;
    return data;
  }, [slug]);

  // ── Run sequentially from index ──────────────────────────────────────────
  const runFromIndex = useCallback(async (startIdx: number) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      for (let i = startIdx; i < chaptersRef.current.length; i++) {
        if (abort.signal.aborted) break;
        const chapter = chaptersRef.current[i];
        if (!chapter || chapter.status === "review" || chapter.status === "approved") continue;

        setChapters((prev) =>
          prev.map((c) => c.key === chapter.key ? { ...c, status: "splitting", bookProse: undefined, workbookSection: undefined } : c)
        );

        let result = null;
        let lastErr: string | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (abort.signal.aborted) break;
          if (attempt > 0) {
            await new Promise<void>((r) => setTimeout(r, 2000 * attempt));
          }
          try {
            result = await splitChapter(chapter, abort);
            if (result) break;
            lastErr = "No content produced";
          } catch (err) {
            if (abort.signal.aborted) break;
            lastErr = err instanceof Error ? err.message : "Error";
          }
        }

        if (abort.signal.aborted) break;

        if (result) {
          setChapters((prev) =>
            prev.map((c) =>
              c.key === chapter.key
                ? { ...c, status: "review", bookProse: result!.bookProse, workbookSection: result!.workbookSection }
                : c
            )
          );
        } else {
          setChapters((prev) =>
            prev.map((c) => c.key === chapter.key ? { ...c, status: "error", errorMsg: lastErr ?? "Failed after 3 attempts" } : c)
          );
        }

        await new Promise<void>((r) => setTimeout(r, 300));
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [splitChapter]);

  // ── Retry a single chapter ────────────────────────────────────────────────
  const retryChapter = useCallback(async (chapter: SplitChapter) => {
    setChapters((prev) =>
      prev.map((c) => c.key === chapter.key ? { ...c, status: "pending", errorMsg: undefined } : c)
    );
    await new Promise<void>((r) => setTimeout(r, 100));
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      setChapters((prev) =>
        prev.map((c) => c.key === chapter.key ? { ...c, status: "splitting" } : c)
      );
      const result = await splitChapter({ ...chapter, status: "splitting" }, abort);
      if (result) {
        setChapters((prev) =>
          prev.map((c) =>
            c.key === chapter.key
              ? { ...c, status: "review", bookProse: result.bookProse, workbookSection: result.workbookSection }
              : c
          )
        );
      } else {
        setChapters((prev) =>
          prev.map((c) => c.key === chapter.key ? { ...c, status: "error", errorMsg: "No content produced" } : c)
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setChapters((prev) =>
        prev.map((c) => c.key === chapter.key ? { ...c, status: "error", errorMsg: msg } : c)
      );
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, [splitChapter]);

  // ── Download workbook as .md ──────────────────────────────────────────────
  const downloadWorkbook = useCallback(() => {
    const sections = chapters
      .filter((c) => c.workbookSection)
      .map((c) => c.workbookSection!)
      .join("\n\n---\n\n");

    const content = `# ${bookTitle} — Companion Workbook\n\n${sections}`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bookTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-companion-workbook.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [chapters, bookTitle]);

  // ── Commit all and advance to next stage ─────────────────────────────────
  const commitAll = useCallback(async () => {
    if (onStageAdvance) {
      onStageAdvance("TYPESET" as StageKey);
    }
  }, [onStageAdvance]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const totalChapters = chapters.length;
  const reviewCount = chapters.filter((c) => c.status === "review" || c.status === "approved").length;
  const approvedCount = chapters.filter((c) => c.status === "approved").length;
  const allApproved = totalChapters > 0 && approvedCount === totalChapters;
  const hasErrors = chapters.some((c) => c.status === "error");

  if (!initialized) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: "40px", color: "#8a7a6a", fontSize: "14px" }}>Loading chapters…</div>
      </div>
    );
  }

  if (totalChapters === 0) {
    return (
      <div style={panelStyle}>
        <div style={emptyStateStyle}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📖</div>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>No Chapters Found</div>
          <div style={{ color: "#8a7a6a", fontSize: "13px" }}>
            Commit the Chapter Draft stage first — chapters must be in CHAPTER_DRAFT to split.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <div style={titleStyle}>
            <span style={{ color: "#2d241d" }}>Chapter Split → </span>
            <span style={{ color: "#B8793A" }}>workbook</span>
          </div>
          <div style={subtitleStyle}>{bookTitle} · {totalChapters} chapters · splitting book prose from exercises</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {isRunning && (
            <span style={runningBadgeStyle}>
              <span style={spinnerStyle}>⟳</span> Splitting…
            </span>
          )}
          <div style={progressTextStyle}>
            {reviewCount}/{totalChapters} split
            {approvedCount > 0 && ` · ${approvedCount} approved`}
          </div>

          {allApproved && (
            <>
              <button style={downloadBtnStyle} onClick={downloadWorkbook}>
                ↓ Download Workbook
              </button>
              <button style={commitBtnStyle} onClick={() => void commitAll()}>
                Commit → continue
              </button>
            </>
          )}

          {!isRunning && hasErrors && (
            <button
              style={retryAllBtnStyle}
              onClick={() => {
                const firstError = chapters.findIndex((c) => c.status === "error");
                if (firstError >= 0) void runFromIndex(firstError);
              }}
            >
              Retry errors
            </button>
          )}

          {!isRunning && chapters.some((c) => c.status === "pending") && (
            <button
              style={startBtnStyle}
              onClick={() => {
                const first = chapters.findIndex((c) => c.status === "pending");
                if (first >= 0) void runFromIndex(first);
              }}
            >
              ▶ Split chapters
            </button>
          )}

          {isRunning && (
            <button style={stopBtnStyle} onClick={() => abortRef.current?.abort()}>
              ■ Stop
            </button>
          )}

          <button style={skipBtnStyle} onClick={onSkip} title="Skip workbook split — go to Folio">
            Skip → Folio
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={progressTrackStyle}>
        <div style={{ ...progressFillStyle, width: totalChapters > 0 ? `${(reviewCount / totalChapters) * 100}%` : "0%" }} />
      </div>

      {/* Chapter list */}
      <div style={listStyle}>
        {chapters.map((chapter, idx) => {
          const isExpanded = expanded?.key === chapter.key;
          const mode = isExpanded ? expanded!.mode : null;
          const bookWords = chapter.bookProse ? chapter.bookProse.trim().split(/\s+/).length : 0;
          const wbWords = chapter.workbookSection ? chapter.workbookSection.trim().split(/\s+/).length : 0;

          return (
            <div key={chapter.key} style={chapterCardStyle(chapter.status)}>
              {/* Chapter row */}
              <div style={chapterRowStyle}>
                <div style={chapterNumStyle}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={chapterTitleStyle}>{chapter.title}</div>
                  {chapter.status === "splitting" && (
                    <div style={splittingProgressStyle}>Splitting…</div>
                  )}
                  {(chapter.status === "review" || chapter.status === "approved") && (
                    <div style={wordCountStyle}>
                      Book: {bookWords.toLocaleString()} w · Workbook: {wbWords.toLocaleString()} w
                    </div>
                  )}
                  {chapter.status === "error" && (
                    <div style={errorTextStyle}>{chapter.errorMsg}</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <SplitStatusPip status={chapter.status} />

                  {(chapter.status === "review" || chapter.status === "approved") && (
                    <>
                      <button
                        style={actionBtnStyle(mode === "book")}
                        onClick={() => setExpanded(isExpanded && mode === "book" ? null : { key: chapter.key, mode: "book" })}
                      >
                        Book
                      </button>
                      <button
                        style={actionBtnStyle(mode === "workbook")}
                        onClick={() => setExpanded(isExpanded && mode === "workbook" ? null : { key: chapter.key, mode: "workbook" })}
                      >
                        Workbook
                      </button>
                      <button
                        style={regenBtnStyle}
                        onClick={() => { setExpanded(null); void retryChapter(chapter); }}
                        title="Re-split this chapter"
                      >
                        ↺
                      </button>
                    </>
                  )}

                  {chapter.status === "error" && (
                    <button style={retryBtnStyle} onClick={() => void retryChapter(chapter)}>
                      Retry
                    </button>
                  )}

                  {chapter.status === "review" && (
                    <button
                      style={approveBtnStyle}
                      onClick={() =>
                        setChapters((prev) =>
                          prev.map((c) => c.key === chapter.key ? { ...c, status: "approved" } : c)
                        )
                      }
                    >
                      ✓
                    </button>
                  )}
                  {chapter.status === "approved" && (
                    <span style={approvedBadgeStyle}>✓</span>
                  )}
                </div>
              </div>

              {/* BOOK mode — clean prose */}
              {isExpanded && mode === "book" && (
                <div style={expandedContentStyle}>
                  <div style={{ fontSize: 11, color: "#4a7c59", fontWeight: 600, marginBottom: 12, fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}>
                    Book prose — narrative only, exercises removed
                  </div>
                  {chapter.bookProse
                    ? <ChapterReader content={chapter.bookProse} />
                    : <div style={{ fontSize: 13, color: "#8a7a6a", fontStyle: "italic" }}>No prose available.</div>
                  }
                </div>
              )}

              {/* WORKBOOK mode — exercises */}
              {isExpanded && mode === "workbook" && (
                <div style={expandedContentStyle}>
                  <div style={{ fontSize: 11, color: "#B8793A", fontWeight: 600, marginBottom: 12, fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}>
                    Workbook section — exercises, checklists, reflection questions
                  </div>
                  {chapter.workbookSection
                    ? <ChapterReader content={chapter.workbookSection} />
                    : <div style={{ fontSize: 13, color: "#8a7a6a", fontStyle: "italic" }}>No workbook content available.</div>
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status pip ─────────────────────────────────────────────────────────────

function SplitStatusPip({ status }: { status: SplitStatus }) {
  const configs: Record<SplitStatus, { color: string; label: string }> = {
    pending:   { color: "#8a7a6a", label: "●" },
    splitting: { color: "#B8793A", label: "⟳" },
    review:    { color: "#d4a017", label: "◐" },
    approved:  { color: "#4a7c59", label: "◆" },
    error:     { color: "#c0392b", label: "✕" },
  };
  const cfg = configs[status];
  return (
    <span
      style={{
        color: cfg.color,
        fontSize: "14px",
        ...(status === "splitting" ? { animation: "spin 1.2s linear infinite", display: "inline-block" } : {}),
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Chapter reader ─────────────────────────────────────────────────────────

function ChapterReader({ content }: { content: string }) {
  const paragraphs = content.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    <div style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', fontSize: 14, lineHeight: 1.75, color: "#2d241d" }}>
      {paragraphs.map((p, i) => {
        if (/^#{1,3} /.test(p)) {
          const level = p.match(/^(#+)/)?.[1].length ?? 1;
          const text = p.replace(/^#+\s+/, "");
          const sizes = ["18px", "15px", "13px"];
          return <div key={i} style={{ fontSize: sizes[Math.min(level - 1, 2)], fontWeight: 700, marginTop: 20, marginBottom: 6 }}>{text}</div>;
        }
        if (/^- /.test(p) || /^- \[/.test(p)) {
          const items = p.split("\n").filter((l) => /^- /.test(l));
          return (
            <ul key={i} style={{ paddingLeft: 20, margin: "8px 0" }}>
              {items.map((item, j) => <li key={j} style={{ marginBottom: 4 }}>{item.slice(2)}</li>)}
            </ul>
          );
        }
        return <p key={i} style={{ margin: "0 0 14px" }}>{p}</p>;
      })}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

function actionBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: "5px",
    border: active ? "1px solid rgba(184,121,58,0.5)" : "1px solid rgba(45,36,29,0.2)",
    background: active ? "rgba(184,121,58,0.08)" : "transparent",
    color: active ? "#B8793A" : "#6f6256",
    fontSize: "11px",
    fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
  };
}

const panelStyle: React.CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column", height: "100%",
  background: "#fefbf5", overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "16px 24px", borderBottom: "1px solid rgba(45,36,29,0.1)",
  background: "rgba(254,251,245,0.95)", flexShrink: 0, gap: "12px", flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontSize: "15px", fontWeight: 700, color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "11px", color: "#8a7a6a", marginTop: "2px",
};

const runningBadgeStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#B8793A",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const spinnerStyle: React.CSSProperties = {
  display: "inline-block", animation: "spin 1.2s linear infinite",
};

const progressTextStyle: React.CSSProperties = {
  fontSize: "11px", color: "#8a7a6a", whiteSpace: "nowrap",
};

const downloadBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: "7px", border: "1px solid rgba(184,121,58,0.5)",
  background: "rgba(184,121,58,0.1)", color: "#B8793A", fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer", whiteSpace: "nowrap", fontWeight: 600,
};

const commitBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: "7px", border: "none",
  background: "#4a7c59", color: "#fff", fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer", whiteSpace: "nowrap", fontWeight: 600,
};

const startBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: "7px", border: "none",
  background: "#2d241d", color: "#fefbf5", fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer", whiteSpace: "nowrap",
};

const stopBtnStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: "7px", border: "1px solid rgba(45,36,29,0.3)",
  background: "transparent", color: "#6f6256", fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', cursor: "pointer",
};

const retryAllBtnStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: "7px", border: "1px solid rgba(192,57,43,0.4)",
  background: "transparent", color: "#c0392b", fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', cursor: "pointer",
};

const skipBtnStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: "7px", border: "1px solid rgba(45,36,29,0.15)",
  background: "transparent", color: "#8a7a6a", fontSize: "11px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', cursor: "pointer",
};

const progressTrackStyle: React.CSSProperties = { height: "3px", background: "rgba(255,255,255,0.08)", flexShrink: 0 };
const progressFillStyle: React.CSSProperties = { height: "100%", background: "#B8793A", transition: "width 400ms ease" };

const listStyle: React.CSSProperties = {
  flex: 1, overflowY: "auto", padding: "16px 24px",
  display: "flex", flexDirection: "column", gap: "8px",
};

const chapterCardStyle = (status: SplitStatus): React.CSSProperties => ({
  borderRadius: "8px",
  border: `1px solid ${
    status === "approved"  ? "rgba(74,124,89,0.3)" :
    status === "review"    ? "rgba(212,160,23,0.3)" :
    status === "error"     ? "rgba(192,57,43,0.3)" :
    status === "splitting" ? "rgba(184,121,58,0.4)" :
    "rgba(45,36,29,0.1)"
  }`,
  background:
    status === "approved"  ? "rgba(74,124,89,0.04)" :
    status === "review"    ? "rgba(212,160,23,0.04)" :
    status === "error"     ? "rgba(192,57,43,0.04)" : "#fff",
  transition: "border-color 200ms",
});

const chapterRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px",
};

const chapterNumStyle: React.CSSProperties = {
  width: "28px", height: "28px", borderRadius: "6px",
  background: "rgba(45,36,29,0.06)", display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: "12px", fontWeight: 600, color: "#6f6256", flexShrink: 0,
};

const chapterTitleStyle: React.CSSProperties = {
  fontSize: "14px", fontWeight: 500, color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

const splittingProgressStyle: React.CSSProperties = { fontSize: "11px", color: "#B8793A", marginTop: "2px" };
const wordCountStyle: React.CSSProperties = { fontSize: "11px", color: "#8a7a6a", marginTop: "2px" };
const errorTextStyle: React.CSSProperties = { fontSize: "11px", color: "#c0392b", marginTop: "2px" };

const regenBtnStyle: React.CSSProperties = {
  padding: "4px 8px", borderRadius: "5px", border: "1px solid rgba(45,36,29,0.15)",
  background: "transparent", color: "#8a7a6a", fontSize: "13px", cursor: "pointer",
};

const retryBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: "5px", border: "1px solid rgba(192,57,43,0.3)",
  background: "transparent", color: "#c0392b", fontSize: "11px", cursor: "pointer",
};

const approveBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: "5px", border: "none",
  background: "#4a7c59", color: "#fff", fontSize: "11px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', cursor: "pointer",
};

const approvedBadgeStyle: React.CSSProperties = { fontSize: "11px", color: "#4a7c59", fontWeight: 600 };

const expandedContentStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(45,36,29,0.08)", padding: "20px 20px 16px",
  maxHeight: "600px", overflowY: "auto",
};

const emptyStateStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  height: "100%", color: "#4a3e33", fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  textAlign: "center", padding: "40px",
};
