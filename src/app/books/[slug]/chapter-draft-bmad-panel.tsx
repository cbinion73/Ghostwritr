"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { StageKey, StageStatus } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChapterStatus = "pending" | "drafting" | "review" | "approved" | "error";

interface Chapter {
  key: string;          // ch-1, ch-2, …
  title: string;        // Full chapter title
  excerpt: string;      // Portion of outline text for this chapter
  status: ChapterStatus;
  artifactId?: string;
  content?: string;
  errorMsg?: string;
}

interface ChapterDraftBmadPanelProps {
  slug: string;
  status: StageStatus;
  stageKey?: string;              // "CHAPTER_DRAFT" | "FICTION_DRAFT"
  outlineContent: string | null;  // committed OUTLINE / SCENE_PLAN artifact text
  bookTitle: string;
  onStageAdvance?: (key: StageKey) => void;
}

// ── Outline parser ────────────────────────────────────────────────────────────

function parseChapters(outline: string): Array<{ title: string; excerpt: string }> {
  if (!outline.trim()) return [];

  const lines = outline.split("\n");
  const chapters: Array<{ title: string; startLine: number }> = [];

  // First pass: try heading-based patterns
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // ## Chapter N: Title  /  ## N. Title  /  # Any heading
    if (/^#{1,3}\s/.test(line)) {
      const title = line.replace(/^#{1,3}\s+/, "").trim();
      if (title) chapters.push({ title, startLine: i });
      continue;
    }

    // **Chapter N: Title** bold heading
    const boldMatch = line.match(/^\*\*(.{3,80})\*\*\s*$/);
    if (boldMatch && /chapter|part|act|\d/i.test(boldMatch[1])) {
      chapters.push({ title: boldMatch[1], startLine: i });
      continue;
    }

    // Chapter N: Title  (bare text with "Chapter" prefix)
    if (/^Chapter\s+\d+/i.test(line)) {
      chapters.push({ title: line, startLine: i });
      continue;
    }
  }

  // Second pass: if no headings found, try top-level numbered list (e.g. "1. Title")
  if (chapters.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const m = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
      // Only capture shallow numbered items (not indented sub-bullets)
      if (m && !lines[i].startsWith("  ") && !lines[i].startsWith("\t")) {
        chapters.push({ title: m[2], startLine: i });
      }
    }
  }

  // Fallback: split on blank-line paragraphs
  if (chapters.length === 0) {
    const paras = outline.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    return paras.slice(0, 30).map((p) => ({
      title: p.split("\n")[0].slice(0, 80),
      excerpt: p,
    }));
  }

  // Build per-chapter excerpts
  return chapters.map((ch, idx) => {
    const nextStart = chapters[idx + 1]?.startLine ?? lines.length;
    const excerpt = lines.slice(ch.startLine, nextStart).join("\n").trim();
    return { title: ch.title, excerpt };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChapterDraftBmadPanel({
  slug,
  status,
  stageKey = "CHAPTER_DRAFT",
  outlineContent,
  bookTitle,
  onStageAdvance,
}: ChapterDraftBmadPanelProps) {
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const chaptersRef = useRef<Chapter[]>([]);

  // ── Bootstrap: fetch existing chapters from DB, then parse outline ──────────
  useEffect(() => {
    const init = async () => {
      const res = await fetch(`/api/books/${slug}/agent-chat/chapter-draft?stageKey=${stageKey}`);
      if (!res.ok) { setInitialized(true); return; }
      const data = await res.json() as {
        chapters: Array<{
          artifactId: string;
          chapterKey: string;
          chapterTitle: string;
          status: string;
          content: string;
        }>;
        stageStatus: string;
      };

      // Build a map of DB-persisted chapters keyed by chapterKey
      const dbMap = new Map(data.chapters.map((c) => [c.chapterKey, c]));

      // Parse the outline into the canonical chapter list
      const parsed = outlineContent ? parseChapters(outlineContent) : [];

      const merged: Chapter[] = parsed.map((p, idx) => {
        const key = `ch-${idx + 1}`;
        const dbEntry = dbMap.get(key);
        return {
          key,
          title: p.title,
          excerpt: p.excerpt,
          status: dbEntry
            ? dbEntry.status === "COMMITTED" ? "approved" : "review"
            : "pending",
          artifactId: dbEntry?.artifactId,
          content: dbEntry?.content,
        };
      });

      // If no outline to parse but DB has chapters (edge case), surface them
      if (merged.length === 0 && data.chapters.length > 0) {
        const fromDb: Chapter[] = data.chapters.map((c, idx) => ({
          key: c.chapterKey || `ch-${idx + 1}`,
          title: c.chapterTitle,
          excerpt: "",
          status: c.status === "COMMITTED" ? "approved" as ChapterStatus : "review" as ChapterStatus,
          artifactId: c.artifactId,
          content: c.content,
        }));
        setChapters(fromDb);
      } else {
        setChapters(merged);
      }

      setInitialized(true);
    };
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Keep chaptersRef in sync for use inside callbacks
  useEffect(() => { chaptersRef.current = chapters; }, [chapters]);

  // ── Auto-start when stage is IN_PROGRESS and there are pending chapters ─────
  useEffect(() => {
    if (!initialized) return;
    if (status !== "IN_PROGRESS" && status !== "READY_FOR_REVIEW") return;
    if (runningRef.current) return;

    const firstPending = chapters.findIndex((c) => c.status === "pending");
    if (firstPending === -1) return;

    void runFromIndex(firstPending);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, chapters.length]);

  // ── Write a single chapter via SSE stream ───────────────────────────────────
  const writeChapter = useCallback(async (chapter: Chapter, abort: AbortController): Promise<string | null> => {
    const prompt = `Write the complete, publication-ready prose for: ${chapter.title}

${chapter.excerpt ? `Chapter outline:\n${chapter.excerpt}\n\n` : ""}Write the full chapter — minimum 1,500 words. Use vivid prose, concrete examples, and strong narrative flow. This is the actual book chapter, not a summary or outline. Begin directly with the chapter opening paragraph. Do not include chapter number or title in the body — just the prose.`;

    const res = await fetch(`/api/books/${slug}/agent-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        stageKey,
        messages: [{ role: "user", content: prompt }],
        chapterContext: chapter.title,
      }),
    });

    if (!res.ok || !res.body) throw new Error(`Stream error ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break;
        try {
          const { text } = JSON.parse(raw) as { text: string };
          accumulated += text;
          // Live update the drafting chapter content
          const displayText = accumulated.replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim();
          setChapters((prev) =>
            prev.map((c) =>
              c.key === chapter.key ? { ...c, content: displayText } : c,
            ),
          );
        } catch { /* skip */ }
      }
    }

    // Extract ARTIFACT block if present, otherwise use raw text
    const artStart = accumulated.indexOf("<ARTIFACT>");
    const artEnd = accumulated.indexOf("</ARTIFACT>");
    if (artStart !== -1 && artEnd !== -1) {
      const jsonStr = accumulated.slice(artStart + 10, artEnd).trim();
      try {
        const parsed = JSON.parse(jsonStr) as { content: string };
        return parsed.content;
      } catch { /* fall through */ }
    }

    // No ARTIFACT block — use the full response as content
    const plainText = accumulated.replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim();
    return plainText || null;
  }, [slug, stageKey]);

  // ── Save a chapter draft to DB ───────────────────────────────────────────────
  const saveChapterDraft = useCallback(async (chapter: Chapter, content: string): Promise<string | null> => {
    const res = await fetch(`/api/books/${slug}/agent-chat/chapter-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageKey, chapterKey: chapter.key, chapterTitle: chapter.title, content }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { artifactId: string };
    return data.artifactId;
  }, [slug, stageKey]);

  // ── Run sequentially from a given index ─────────────────────────────────────
  const runFromIndex = useCallback(async (startIdx: number) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const snapshot = chaptersRef.current;
      for (let i = startIdx; i < snapshot.length; i++) {
        if (abort.signal.aborted) break;
        const chapter = chaptersRef.current[i];
        if (!chapter || chapter.status === "approved" || chapter.status === "review") continue;

        // Mark as drafting
        setChapters((prev) =>
          prev.map((c) => (c.key === chapter.key ? { ...c, status: "drafting", content: "" } : c)),
        );

        try {
          const content = await writeChapter(chapter, abort);
          if (abort.signal.aborted) break;

          if (content) {
            const artifactId = await saveChapterDraft(chapter, content);
            setChapters((prev) =>
              prev.map((c) =>
                c.key === chapter.key
                  ? { ...c, status: "review", content, artifactId: artifactId ?? undefined }
                  : c,
              ),
            );
          } else {
            setChapters((prev) =>
              prev.map((c) =>
                c.key === chapter.key
                  ? { ...c, status: "error", errorMsg: "No content produced" }
                  : c,
              ),
            );
          }
        } catch (err) {
          if (abort.signal.aborted) break;
          const msg = err instanceof Error ? err.message : "Error";
          setChapters((prev) =>
            prev.map((c) =>
              c.key === chapter.key ? { ...c, status: "error", errorMsg: msg } : c,
            ),
          );
        }

        // Small yield between chapters
        await new Promise<void>((r) => setTimeout(r, 200));
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [writeChapter, saveChapterDraft]);

  // ── Retry a single chapter ───────────────────────────────────────────────────
  const retryChapter = useCallback(async (chapter: Chapter) => {
    setChapters((prev) =>
      prev.map((c) => (c.key === chapter.key ? { ...c, status: "pending", content: undefined, errorMsg: undefined } : c)),
    );
    // Small delay so state settles, then write just this chapter
    await new Promise<void>((r) => setTimeout(r, 100));
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      setChapters((prev) =>
        prev.map((c) => (c.key === chapter.key ? { ...c, status: "drafting", content: "" } : c)),
      );
      const content = await writeChapter({ ...chapter, status: "drafting" }, abort);
      if (content) {
        const artifactId = await saveChapterDraft(chapter, content);
        setChapters((prev) =>
          prev.map((c) =>
            c.key === chapter.key
              ? { ...c, status: "review", content, artifactId: artifactId ?? undefined }
              : c,
          ),
        );
      } else {
        setChapters((prev) =>
          prev.map((c) =>
            c.key === chapter.key ? { ...c, status: "error", errorMsg: "No content produced" } : c,
          ),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setChapters((prev) =>
        prev.map((c) =>
          c.key === chapter.key ? { ...c, status: "error", errorMsg: msg } : c,
        ),
      );
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, [writeChapter, saveChapterDraft]);

  // ── Approve all and commit the stage ────────────────────────────────────────
  const approveAll = async () => {
    const res = await fetch(`/api/books/${slug}/agent-chat/chapter-draft/approve-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageKey }),
    });
    if (!res.ok) { alert("Approve failed"); return; }
    const { nextStageKey } = await res.json() as { nextStageKey: StageKey | null };
    router.refresh();
    if (nextStageKey && onStageAdvance) {
      setTimeout(() => onStageAdvance(nextStageKey), 400);
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────────
  const totalChapters = chapters.length;
  const doneCount = chapters.filter((c) => c.status === "review" || c.status === "approved").length;
  const approvedCount = chapters.filter((c) => c.status === "approved").length;
  const allReviewed = totalChapters > 0 && doneCount === totalChapters;
  const hasErrors = chapters.some((c) => c.status === "error");

  if (!initialized) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: "40px", color: "#8a7a6a", fontSize: "14px" }}>Loading chapters…</div>
      </div>
    );
  }

  if (!outlineContent && totalChapters === 0) {
    return (
      <div style={panelStyle}>
        <div style={emptyStateStyle}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📋</div>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>No Outline Found</div>
          <div style={{ color: "#8a7a6a", fontSize: "13px" }}>
            Commit the Outline stage first — this panel will parse it into chapters automatically.
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
          <div style={titleStyle}>Chapter Draft</div>
          <div style={subtitleStyle}>
            {bookTitle} · {totalChapters} chapters
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {isRunning && (
            <span style={runningBadgeStyle}>
              <span style={spinnerStyle}>⟳</span> Writing…
            </span>
          )}
          <div style={progressTextStyle}>
            {doneCount}/{totalChapters} drafted
            {approvedCount > 0 && ` · ${approvedCount} approved`}
          </div>
          {allReviewed && status !== "COMMITTED" && (
            <button style={approveAllBtnStyle} onClick={() => void approveAll()}>
              Approve all & continue →
            </button>
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
              ▶ Write chapters
            </button>
          )}
          {isRunning && (
            <button
              style={stopBtnStyle}
              onClick={() => { abortRef.current?.abort(); }}
            >
              ■ Stop
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={progressTrackStyle}>
        <div
          style={{
            ...progressFillStyle,
            width: totalChapters > 0 ? `${(doneCount / totalChapters) * 100}%` : "0%",
          }}
        />
      </div>

      {/* Chapter list */}
      <div style={listStyle}>
        {chapters.map((chapter, idx) => {
          const isExpanded = expandedKey === chapter.key;
          const wordCount = chapter.content
            ? chapter.content.trim().split(/\s+/).length
            : 0;

          return (
            <div key={chapter.key} style={chapterCardStyle(chapter.status)}>
              {/* Chapter row */}
              <div style={chapterRowStyle}>
                <div style={chapterNumStyle}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={chapterTitleStyle}>{chapter.title}</div>
                  {chapter.status === "drafting" && (
                    <div style={draftingProgressStyle}>
                      {chapter.content
                        ? `${chapter.content.trim().split(/\s+/).length} words…`
                        : "Starting…"}
                    </div>
                  )}
                  {(chapter.status === "review" || chapter.status === "approved") && (
                    <div style={wordCountStyle}>{wordCount.toLocaleString()} words</div>
                  )}
                  {chapter.status === "error" && (
                    <div style={errorTextStyle}>{chapter.errorMsg}</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <StatusPip status={chapter.status} />
                  {(chapter.status === "review" || chapter.status === "approved") && (
                    <button
                      style={viewBtnStyle}
                      onClick={() => setExpandedKey(isExpanded ? null : chapter.key)}
                    >
                      {isExpanded ? "Close" : "Read"}
                    </button>
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
                          prev.map((c) =>
                            c.key === chapter.key ? { ...c, status: "approved" } : c,
                          ),
                        )
                      }
                    >
                      ✓ Approve
                    </button>
                  )}
                  {chapter.status === "approved" && (
                    <span style={approvedBadgeStyle}>✓ Approved</span>
                  )}
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && chapter.content && (
                <div style={expandedContentStyle}>
                  <div style={contentTextStyle}>{chapter.content}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status pip ────────────────────────────────────────────────────────────────

function StatusPip({ status }: { status: ChapterStatus }) {
  const configs: Record<ChapterStatus, { color: string; label: string }> = {
    pending:  { color: "#8a7a6a", label: "●" },
    drafting: { color: "#B8793A", label: "⟳" },
    review:   { color: "#d4a017", label: "◐" },
    approved: { color: "#4a7c59", label: "◆" },
    error:    { color: "#c0392b", label: "✕" },
  };
  const cfg = configs[status];
  return (
    <span
      style={{
        color: cfg.color,
        fontSize: "14px",
        ...(status === "drafting" ? { animation: "spin 1.2s linear infinite", display: "inline-block" } : {}),
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#fefbf5",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 24px",
  borderBottom: "1px solid rgba(45,36,29,0.1)",
  background: "rgba(254,251,245,0.95)",
  flexShrink: 0,
  gap: "12px",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 700,
  color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8a7a6a",
  marginTop: "2px",
};

const runningBadgeStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  fontSize: "11px",
  color: "#B8793A",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const spinnerStyle: React.CSSProperties = {
  display: "inline-block",
  animation: "spin 1.2s linear infinite",
};

const progressTextStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8a7a6a",
  whiteSpace: "nowrap",
};

const approveAllBtnStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "7px",
  border: "none",
  background: "#4a7c59",
  color: "#fff",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 600,
};

const retryAllBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "7px",
  border: "1px solid rgba(192,57,43,0.4)",
  background: "transparent",
  color: "#c0392b",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
};

const startBtnStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "7px",
  border: "none",
  background: "#2d241d",
  color: "#fefbf5",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const stopBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "7px",
  border: "1px solid rgba(45,36,29,0.3)",
  background: "transparent",
  color: "#6f6256",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
};

const progressTrackStyle: React.CSSProperties = {
  height: "3px",
  background: "rgba(255,255,255,0.08)",
  flexShrink: 0,
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  background: "#4a7c59",
  transition: "width 400ms ease",
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "16px 24px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const chapterCardStyle = (status: ChapterStatus): React.CSSProperties => ({
  borderRadius: "8px",
  border: `1px solid ${
    status === "approved" ? "rgba(74,124,89,0.3)" :
    status === "review"   ? "rgba(212,160,23,0.3)" :
    status === "error"    ? "rgba(192,57,43,0.3)" :
    status === "drafting" ? "rgba(184,121,58,0.4)" :
    "rgba(45,36,29,0.1)"
  }`,
  background: status === "approved" ? "rgba(74,124,89,0.04)" :
              status === "review"   ? "rgba(212,160,23,0.04)" :
              status === "error"    ? "rgba(192,57,43,0.04)" :
              "#fff",
  overflow: "hidden",
  transition: "border-color 200ms",
});

const chapterRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px 16px",
};

const chapterNumStyle: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "6px",
  background: "rgba(45,36,29,0.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "12px",
  fontWeight: 600,
  color: "#6f6256",
  flexShrink: 0,
};

const chapterTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 500,
  color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const draftingProgressStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#B8793A",
  marginTop: "2px",
};

const wordCountStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8a7a6a",
  marginTop: "2px",
};

const errorTextStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#c0392b",
  marginTop: "2px",
};

const viewBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: "5px",
  border: "1px solid rgba(45,36,29,0.2)",
  background: "transparent",
  color: "#6f6256",
  fontSize: "11px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
};

const retryBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: "5px",
  border: "1px solid rgba(192,57,43,0.3)",
  background: "transparent",
  color: "#c0392b",
  fontSize: "11px",
  cursor: "pointer",
};

const approveBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: "5px",
  border: "none",
  background: "#4a7c59",
  color: "#fff",
  fontSize: "11px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
};

const approvedBadgeStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#4a7c59",
  fontWeight: 600,
};

const expandedContentStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(45,36,29,0.06)",
  padding: "16px",
  maxHeight: "400px",
  overflowY: "auto",
};

const contentTextStyle: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: 1.7,
  color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  whiteSpace: "pre-wrap",
};

const emptyStateStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "#4a3e33",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  textAlign: "center",
  padding: "40px",
};
