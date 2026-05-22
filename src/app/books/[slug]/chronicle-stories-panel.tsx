"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { StageKey, StageStatus } from "@prisma/client";

type ChapterStatus = "pending" | "sourcing" | "done" | "error";

interface StoryChapter {
  key: string;
  title: string;
  excerpt: string;
  status: ChapterStatus;
  artifactId?: string;
  content?: string;
  errorMsg?: string;
}

interface ChronicleStoriesPanelProps {
  slug: string;
  status: StageStatus;
  outlineContent: string | null;
  bookTitle: string;
  onStageAdvance?: (key: StageKey) => void;
}

// ── Outline parser (shared logic) ────────────────────────────────────────────

function parseChaptersFromOutline(outline: string): Array<{ title: string; excerpt: string }> {
  if (!outline.trim()) return [];
  const lines = outline.split("\n");
  const chapters: Array<{ title: string; startLine: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,3}\s/.test(line)) {
      const title = line.replace(/^#{1,3}\s+/, "").trim();
      if (title) chapters.push({ title, startLine: i });
      continue;
    }
    const boldMatch = line.match(/^\*\*(.{3,80})\*\*\s*$/);
    if (boldMatch && /chapter|part|act|\d/i.test(boldMatch[1])) {
      chapters.push({ title: boldMatch[1], startLine: i });
      continue;
    }
    if (/^Chapter\s+\d+/i.test(line)) {
      chapters.push({ title: line, startLine: i });
      continue;
    }
  }

  if (chapters.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const m = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
      if (m && !lines[i].startsWith("  ") && !lines[i].startsWith("\t")) {
        chapters.push({ title: m[2], startLine: i });
      }
    }
  }

  if (chapters.length === 0) {
    const paras = outline.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    return paras.slice(0, 30).map((p) => ({ title: p.split("\n")[0].slice(0, 80), excerpt: p }));
  }

  return chapters.map((ch, idx) => {
    const nextStart = chapters[idx + 1]?.startLine ?? lines.length;
    const excerpt = lines.slice(ch.startLine, nextStart).join("\n").trim();
    return { title: ch.title, excerpt };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChronicleStoriesPanel({
  slug,
  status,
  outlineContent,
  bookTitle,
  onStageAdvance,
}: ChronicleStoriesPanelProps) {
  const router = useRouter();
  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [noOutline, setNoOutline] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  // ── Init: parse outline + restore saved progress ──────────────────────────
  useEffect(() => {
    if (!outlineContent) { setNoOutline(true); return; }
    const parsed = parseChaptersFromOutline(outlineContent);
    if (parsed.length === 0) { setNoOutline(true); return; }

    const initial: StoryChapter[] = parsed.map((ch, i) => ({
      key: `ch-${i + 1}`,
      title: ch.title,
      excerpt: ch.excerpt,
      status: "pending",
    }));

    fetch(`/api/books/${slug}/chronicle-stories/save-chapter`)
      .then((r) => r.json())
      .then((data: { chapters: Array<{ chapterKey: string; chapterTitle: string; content: string; artifactId: string }> }) => {
        const byKey = new Map(data.chapters.map((c) => [c.chapterKey, c]));
        const merged = initial.map((ch) => {
          const saved = byKey.get(ch.key);
          if (saved) return { ...ch, status: "done" as ChapterStatus, content: saved.content, artifactId: saved.artifactId };
          return ch;
        });
        setChapters(merged);
        if (merged.every((c) => c.status === "done")) setAllDone(true);
      })
      .catch(() => setChapters(initial));
  }, [slug, outlineContent]);

  // ── Auto-start loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (chapters.length === 0 || isRunning || runningRef.current || allDone) return;
    const firstPending = chapters.findIndex((c) => c.status === "pending");
    if (firstPending === -1) { setAllDone(true); return; }
    runningRef.current = true;
    setIsRunning(true);
    void runLoop(chapters, firstPending);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters.length]);

  // ── Story sourcing loop ───────────────────────────────────────────────────
  const runLoop = useCallback(async (initialChapters: StoryChapter[], startIdx: number) => {
    let current = initialChapters;

    for (let i = startIdx; i < current.length; i++) {
      const chapter = current[i];
      if (chapter.status === "done") continue;

      setCurrentIdx(i);
      setStreamingText("");

      current = current.map((c, idx) => idx === i ? { ...c, status: "sourcing" } : c);
      setChapters([...current]);

      try {
        const abort = new AbortController();
        abortRef.current = abort;

        const res = await fetch(`/api/books/${slug}/chronicle-stories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterKey: chapter.key,
            chapterTitle: chapter.title,
            messages: [{
              role: "user",
              content: `Source stories for chapter: "${chapter.title}". Produce the complete 10-section Chronicle Dossier for this chapter. Wrap the dossier in an ARTIFACT block.`,
            }],
          }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") break;
            try {
              const { text: t } = JSON.parse(raw) as { text: string };
              accumulated += t;
              setStreamingText(accumulated.replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim());
            } catch { /* skip */ }
          }
        }

        const artStart = accumulated.indexOf("<ARTIFACT>");
        const artEnd = accumulated.indexOf("</ARTIFACT>");

        let artifact: { type: string; title: string; content: string };

        if (artStart !== -1 && artEnd !== -1) {
          // Happy path: model produced a well-formed ARTIFACT block
          const rawArtifact = accumulated.slice(artStart + 10, artEnd).trim();
          try {
            artifact = JSON.parse(rawArtifact) as { type: string; title: string; content: string };
          } catch {
            // LLM put literal newlines inside the JSON string — extract with regex
            const titleMatch = rawArtifact.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            const contentStart = rawArtifact.indexOf('"content"');
            let content = "";
            if (contentStart !== -1) {
              const afterKey = rawArtifact.slice(contentStart).replace(/^"content"\s*:\s*"/, "");
              content = afterKey.replace(/"\s*}\s*$/, "");
            }
            artifact = {
              type: "EXTERNAL_STORIES",
              title: titleMatch?.[1] ?? `Chronicle Dossier: ${chapter.title}`,
              content: content || rawArtifact,
            };
          }
        } else {
          // Fallback: model produced dossier content but skipped the ARTIFACT wrapper
          // Strip the search-queries prefix line and use the rest as content
          const stripped = accumulated
            .replace(/^\*Searching for stories:[^\n]*\n+/, "")
            .trim();
          if (stripped.length < 200) throw new Error("No dossier produced");
          artifact = {
            type: "EXTERNAL_STORIES",
            title: `Chronicle Dossier: ${chapter.title}`,
            content: stripped,
          };
        }

        const saveRes = await fetch(`/api/books/${slug}/chronicle-stories/save-chapter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterKey: chapter.key, chapterTitle: artifact.title || chapter.title, content: artifact.content }),
        });
        if (!saveRes.ok) throw new Error("Save failed");
        const { artifactId } = await saveRes.json() as { artifactId: string };

        current = current.map((c, idx) =>
          idx === i ? { ...c, status: "done", content: artifact.content, artifactId } : c
        );
        setChapters([...current]);
        setStreamingText("");

      } catch (err) {
        if ((err as Error).name === "AbortError") break;
        const msg = err instanceof Error ? err.message : "Error";
        current = current.map((c, idx) => idx === i ? { ...c, status: "error", errorMsg: msg } : c);
        setChapters([...current]);
        setStreamingText("");
      }
    }

    setCurrentIdx(null);
    setIsRunning(false);
    runningRef.current = false;
    if (current.every((c) => c.status === "done")) setAllDone(true);
  }, [slug]);

  const retryChapter = (idx: number) => {
    const updated = chapters.map((c, i) =>
      i === idx ? { ...c, status: "pending" as ChapterStatus, errorMsg: undefined } : c
    );
    setChapters(updated);
    runningRef.current = true;
    setIsRunning(true);
    void runLoop(updated, idx);
  };

  const handleCommit = async () => {
    setIsCommitting(true);
    try {
      const combined = chapters
        .filter((c) => c.content)
        .map((c) => `# ${c.title}\n\n${c.content}`)
        .join("\n\n---\n\n");

      const res = await fetch(`/api/books/${slug}/agent-chat/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageKey: "EXTERNAL_STORIES",
          artifact: {
            type: "EXTERNAL_STORIES",
            title: `Chronicle Dossier — ${bookTitle}`,
            content: combined,
          },
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { nextStageKey } = await res.json() as { nextStageKey: StageKey | null };
      router.refresh();
      if (nextStageKey && onStageAdvance) onStageAdvance(nextStageKey);
    } catch (err) {
      console.error("Commit failed", err);
    } finally {
      setIsCommitting(false);
    }
  };

  if (noOutline) {
    return (
      <div style={panelStyle}>
        <div style={emptyStyle}>
          No committed outline found. Complete the Outline stage first — Chronicle needs chapter titles to source stories.
        </div>
      </div>
    );
  }

  const doneCount = chapters.filter((c) => c.status === "done").length;
  const errorCount = chapters.filter((c) => c.status === "error").length;

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <div style={agentNameStyle}>Chronicle</div>
          <div style={agentTaglineStyle}>Story Dossier — chapter by chapter</div>
        </div>
        <div style={progressStyle}>
          {doneCount}/{chapters.length} chapters sourced
          {errorCount > 0 && <span style={errorBadgeStyle}> · {errorCount} error{errorCount !== 1 ? "s" : ""}</span>}
        </div>
      </div>

      <div style={chapterListStyle}>
        {chapters.map((ch, i) => {
          const isActive = currentIdx === i;
          return (
            <div key={ch.key} style={{ ...chapterRowStyle, background: isActive ? "rgba(124,58,237,0.06)" : "transparent" }}>
              <span style={{ ...statusIconStyle, color: statusColor(ch.status) }}>
                {statusIcon(ch.status, isActive)}
              </span>
              <span style={chapterTitleStyle}>{ch.title}</span>
              {ch.status === "error" && (
                <>
                  {ch.errorMsg && <span style={errorMsgStyle}>{ch.errorMsg}</span>}
                  <button style={retryBtnStyle} onClick={() => retryChapter(i)}>Retry</button>
                </>
              )}
              {ch.status === "done" && (
                <span style={doneLabelStyle}>✓ Saved</span>
              )}
            </div>
          );
        })}
      </div>

      {streamingText && currentIdx !== null && (
        <div style={streamingBoxStyle}>
          <div style={streamingLabelStyle}>
            Sourcing stories: {chapters[currentIdx]?.title}
          </div>
          <div style={streamingTextStyle}>{streamingText.slice(-1200)}</div>
        </div>
      )}

      {allDone && status !== "COMMITTED" && (
        <div style={commitAreaStyle}>
          <div style={allDoneMessageStyle}>
            All {chapters.length} chapters sourced. Review any dossier, then commit to advance.
          </div>
          <button
            style={{ ...commitBtnStyle, opacity: isCommitting ? 0.6 : 1 }}
            onClick={() => void handleCommit()}
            disabled={isCommitting}
          >
            {isCommitting ? "Committing…" : "Commit External Stories Stage →"}
          </button>
        </div>
      )}

      {status === "COMMITTED" && (
        <div style={committedBannerStyle}>External Stories stage committed.</div>
      )}
    </div>
  );
}

function statusIcon(s: ChapterStatus, active: boolean): string {
  if (active || s === "sourcing") return "⟳";
  if (s === "done") return "✓";
  if (s === "error") return "✕";
  return "○";
}

function statusColor(s: ChapterStatus): string {
  if (s === "done") return "#7C3AED";
  if (s === "error") return "#dc2626";
  if (s === "sourcing") return "#a855f7";
  return "#6b5a4e";
}

const panelStyle: React.CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column", background: "#1a1410", overflowY: "auto",
};

const headerStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  padding: "20px 24px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const agentNameStyle: React.CSSProperties = {
  fontSize: "15px", fontWeight: 700, color: "#7C3AED",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const agentTaglineStyle: React.CSSProperties = { fontSize: "12px", color: "#6b5a4e", marginTop: 2 };

const progressStyle: React.CSSProperties = { fontSize: "12px", color: "#a09080" };

const errorBadgeStyle: React.CSSProperties = { color: "#dc2626" };

const chapterListStyle: React.CSSProperties = {
  padding: "12px 24px", display: "flex", flexDirection: "column", gap: 4, flex: 1,
};

const chapterRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "8px 10px", borderRadius: 6, transition: "background 150ms",
};

const statusIconStyle: React.CSSProperties = { fontSize: "14px", width: 18, textAlign: "center", flexShrink: 0 };

const chapterTitleStyle: React.CSSProperties = {
  fontSize: "13px", color: "#c4b4a0", flex: 1, lineHeight: 1.3,
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const doneLabelStyle: React.CSSProperties = { fontSize: "11px", color: "#7C3AED", flexShrink: 0 };

const errorMsgStyle: React.CSSProperties = {
  fontSize: "11px", color: "#dc2626", flex: 1, fontStyle: "italic",
};

const retryBtnStyle: React.CSSProperties = {
  fontSize: "11px", color: "#d97706", background: "rgba(217,119,6,0.1)",
  border: "1px solid rgba(217,119,6,0.3)", borderRadius: 4, padding: "2px 8px",
  cursor: "pointer", flexShrink: 0,
};

const streamingBoxStyle: React.CSSProperties = {
  margin: "0 24px 16px", background: "rgba(124,58,237,0.04)",
  border: "1px solid rgba(124,58,237,0.15)", borderRadius: 8, padding: 14,
  maxHeight: 200, overflowY: "auto",
};

const streamingLabelStyle: React.CSSProperties = {
  fontSize: "11px", color: "#7C3AED", fontWeight: 600, marginBottom: 8,
  textTransform: "uppercase", letterSpacing: "0.08em",
};

const streamingTextStyle: React.CSSProperties = {
  fontSize: "12px", color: "#a09080", lineHeight: 1.6,
  whiteSpace: "pre-wrap", fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const commitAreaStyle: React.CSSProperties = {
  padding: "16px 24px 24px", borderTop: "1px solid rgba(255,255,255,0.05)",
  display: "flex", flexDirection: "column", gap: 12,
};

const allDoneMessageStyle: React.CSSProperties = { fontSize: "13px", color: "#a09080", lineHeight: 1.5 };

const commitBtnStyle: React.CSSProperties = {
  padding: "10px 20px", background: "#7C3AED", color: "#fff",
  border: "none", borderRadius: 6, fontSize: "13px", fontWeight: 600,
  cursor: "pointer", alignSelf: "flex-start",
};

const committedBannerStyle: React.CSSProperties = {
  padding: "16px 24px", color: "#7C3AED", fontSize: "13px",
  borderTop: "1px solid rgba(124,58,237,0.2)",
};

const emptyStyle: React.CSSProperties = { padding: "40px 24px", color: "#6b5a4e", fontSize: "13px", lineHeight: 1.6 };
