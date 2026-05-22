"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { StageKey, StageStatus } from "@prisma/client";

interface ManifestPanelProps {
  slug: string;
  status: StageStatus;
  onStageAdvance?: (key: StageKey) => void;
  bookTitle: string;
}

type PanelStatus = "idle" | "generating" | "complete" | "error";

interface ChapterBlock {
  title: string;
  body: string;
}

function parseManifestChapters(content: string): ChapterBlock[] {
  const lines = content.split("\n");
  const chapters: ChapterBlock[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^## Chapter \d+/i.test(line)) {
      if (currentTitle) {
        chapters.push({ title: currentTitle, body: currentLines.join("\n").trim() });
      }
      currentTitle = line.replace(/^##\s+/, "").trim();
      currentLines = [];
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    chapters.push({ title: currentTitle, body: currentLines.join("\n").trim() });
  }
  return chapters;
}

function renderMaterialLine(line: string, idx: number) {
  const scoutMatch = line.match(/^(-\s+SCOUT:)(.+)/);
  const chronicleMatch = line.match(/^(-\s+CHRONICLE:)(.+)/);
  const personalMatch = line.match(/^(-\s+PERSONAL:)(.+)/);

  if (scoutMatch) {
    return (
      <div key={idx} style={{ ...materialLineStyle, borderLeft: "3px solid #2563EB" }}>
        <span style={{ color: "#2563EB", fontWeight: 600 }}>SCOUT:</span>
        <span style={{ color: "#2d241d" }}>{scoutMatch[2]}</span>
      </div>
    );
  }
  if (chronicleMatch) {
    return (
      <div key={idx} style={{ ...materialLineStyle, borderLeft: "3px solid #B8793A" }}>
        <span style={{ color: "#B8793A", fontWeight: 600 }}>CHRONICLE:</span>
        <span style={{ color: "#2d241d" }}>{chronicleMatch[2]}</span>
      </div>
    );
  }
  if (personalMatch) {
    return (
      <div key={idx} style={{ ...materialLineStyle, borderLeft: "3px solid #059669" }}>
        <span style={{ color: "#059669", fontWeight: 600 }}>PERSONAL:</span>
        <span style={{ color: "#2d241d" }}>{personalMatch[2]}</span>
      </div>
    );
  }
  return (
    <div key={idx} style={{ fontSize: "13px", color: "#4a3728", lineHeight: 1.6, padding: "1px 0" }}>
      {line}
    </div>
  );
}

function ChapterCard({ chapter, isExpanded, onToggle }: { chapter: ChapterBlock; isExpanded: boolean; onToggle: () => void }) {
  const lines = chapter.body.split("\n");
  return (
    <div style={chapterCardStyle}>
      <button
        onClick={onToggle}
        style={chapterHeaderStyle}
        aria-expanded={isExpanded}
      >
        <span style={chapterTitleStyle}>{chapter.title}</span>
        <span style={{ fontSize: "16px", color: "#8a7060", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 200ms" }}>›</span>
      </button>
      {isExpanded && (
        <div style={chapterBodyStyle}>
          {lines.map((line, i) => {
            if (line.startsWith("PATTERN:") || line.startsWith("ARC:")) {
              return (
                <div key={i} style={{ fontSize: "13px", color: "#5a4030", fontStyle: "italic", padding: "2px 0" }}>
                  {line}
                </div>
              );
            }
            if (line.startsWith("SECTION:")) {
              return (
                <div key={i} style={sectionHeaderStyle}>
                  {line.replace("SECTION:", "").trim()}
                </div>
              );
            }
            if (line.startsWith("TOPIC:")) {
              return (
                <div key={i} style={{ fontSize: "13px", color: "#4a3728", fontWeight: 500, padding: "3px 0 2px" }}>
                  {line}
                </div>
              );
            }
            if (line.startsWith("MATERIALS:") || line.startsWith("MATERIALS_RESERVED:")) {
              return (
                <div key={i} style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "#8a7060", textTransform: "uppercase" as const, padding: "6px 0 2px" }}>
                  {line}
                </div>
              );
            }
            if (/^-\s+(SCOUT|CHRONICLE|PERSONAL):/.test(line)) {
              return renderMaterialLine(line, i);
            }
            if (line.trim() === "---" || line.trim() === "") {
              return <div key={i} style={{ height: "8px" }} />;
            }
            return (
              <div key={i} style={{ fontSize: "13px", color: "#4a3728", lineHeight: 1.6 }}>
                {line}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ManifestPanel({ slug, status, onStageAdvance, bookTitle }: ManifestPanelProps) {
  const router = useRouter();
  const [panelStatus, setPanelStatus] = useState<PanelStatus>("idle");
  const [manifestContent, setManifestContent] = useState<string | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const hasInitialized = useRef(false);

  const triggerGeneration = useCallback(async () => {
    setPanelStatus("generating");
    setStatusMessage("Cartographer is reading all source materials…");
    setErrorMessage("");

    try {
      const res = await fetch(`/api/books/${slug}/manifest`, { method: "POST" });
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw) as { event?: string; message?: string; content?: string };
            if (parsed.event === "status" && parsed.message) {
              setStatusMessage(parsed.message);
            } else if (parsed.event === "complete") {
              setManifestContent(parsed.content ?? null);
              setPanelStatus("complete");
              setExpandedChapter(0);
            } else if (parsed.event === "error") {
              setErrorMessage(parsed.message ?? "Generation failed");
              setPanelStatus("error");
            }
          } catch {
            // ignore parse errors on partial chunks
          }
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unexpected error");
      setPanelStatus("error");
    } finally {
      router.refresh();
    }
  }, [slug, router]);

  const loadOrGenerate = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${slug}/manifest`);
      if (!res.ok) throw new Error("Failed to load manifest");
      const data = await res.json() as { status: string; content: string | null };

      if (data.status === "COMMITTED" && data.content) {
        setManifestContent(data.content);
        setPanelStatus("complete");
        setExpandedChapter(0);
        return;
      }

      if (data.status === "IN_PROGRESS") {
        setPanelStatus("generating");
        setStatusMessage("Manifest generation in progress…");
        // Poll every 3s
        const poll = setInterval(async () => {
          try {
            const r = await fetch(`/api/books/${slug}/manifest`);
            const d = await r.json() as { status: string; content: string | null };
            if (d.status === "COMMITTED" && d.content) {
              clearInterval(poll);
              setManifestContent(d.content);
              setPanelStatus("complete");
              setExpandedChapter(0);
            }
          } catch { /* ignore */ }
        }, 3000);
        return;
      }

      // NOT_STARTED — trigger
      void triggerGeneration();
    } catch {
      void triggerGeneration();
    }
  }, [slug, triggerGeneration]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    void loadOrGenerate();
  }, [loadOrGenerate]);

  const chapters = manifestContent ? parseManifestChapters(manifestContent) : [];

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={agentRowStyle}>
          <div style={avatarStyle}>🗺️</div>
          <div>
            <div style={agentNameStyle}>Cartographer</div>
            <div style={agentTitleStyle}>Chapter Manifest Generator</div>
          </div>
        </div>
        <div style={bookTitleStyle}>{bookTitle}</div>
      </div>

      {/* Body */}
      <div style={bodyStyle}>
        {panelStatus === "idle" && (
          <div style={centeredStyle}>
            <div style={spinnerStyle}>⟳</div>
            <div style={statusTextStyle}>Loading…</div>
          </div>
        )}

        {panelStatus === "generating" && (
          <div style={centeredStyle}>
            <div style={{ ...spinnerStyle, animation: "spin 1.2s linear infinite" }}>🗺️</div>
            <div style={statusTextStyle}>{statusMessage || "Generating manifest…"}</div>
            <div style={subTextStyle}>Cartographer is reading all source materials and pre-assigning each piece to its best chapter. This may take a minute.</div>
          </div>
        )}

        {panelStatus === "error" && (
          <div style={centeredStyle}>
            <div style={{ fontSize: "32px" }}>⚠</div>
            <div style={{ ...statusTextStyle, color: "#C026D3" }}>Generation failed</div>
            <div style={{ ...subTextStyle, color: "#6b4040" }}>{errorMessage}</div>
            <button onClick={() => void triggerGeneration()} style={retryBtnStyle}>
              Try Again
            </button>
          </div>
        )}

        {panelStatus === "complete" && chapters.length > 0 && (
          <div style={contentAreaStyle}>
            <div style={manifestHeaderRowStyle}>
              <div>
                <div style={manifestTitleStyle}>Chapter Manifest</div>
                <div style={manifestSubtitleStyle}>{chapters.length} chapter{chapters.length !== 1 ? "s" : ""} mapped · source materials pre-assigned</div>
              </div>
              <button onClick={() => void triggerGeneration()} style={regenBtnStyle} title="Regenerate manifest with latest source materials">
                ↻ Regenerate
              </button>
            </div>

            <div style={legendRowStyle}>
              <span style={{ ...legendPillStyle, background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }}>■ SCOUT</span>
              <span style={{ ...legendPillStyle, background: "#FFF7ED", color: "#B8793A", border: "1px solid #FED7AA" }}>■ CHRONICLE</span>
              <span style={{ ...legendPillStyle, background: "#F0FDF4", color: "#059669", border: "1px solid #BBF7D0" }}>■ PERSONAL</span>
            </div>

            <div style={chaptersListStyle}>
              {chapters.map((ch, i) => (
                <ChapterCard
                  key={i}
                  chapter={ch}
                  isExpanded={expandedChapter === i}
                  onToggle={() => setExpandedChapter(expandedChapter === i ? null : i)}
                />
              ))}
            </div>

            <div style={continueRowStyle}>
              <button
                onClick={() => onStageAdvance?.("CHAPTER_DRAFT" as StageKey)}
                style={continueBtnStyle}
              >
                Continue to Chapter Draft →
              </button>
            </div>
          </div>
        )}

        {panelStatus === "complete" && chapters.length === 0 && (
          <div style={centeredStyle}>
            <div style={statusTextStyle}>Manifest generated but no chapters were parsed.</div>
            <button onClick={() => void triggerGeneration()} style={retryBtnStyle}>Regenerate</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  background: "#fefbf5",
  overflow: "hidden",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const headerStyle: React.CSSProperties = {
  padding: "20px 28px 16px",
  borderBottom: "1px solid rgba(45,36,29,0.08)",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const agentRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const avatarStyle: React.CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  background: "#0F766E",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "20px",
  flexShrink: 0,
};

const agentNameStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#2d241d",
};

const agentTitleStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#8a7060",
};

const bookTitleStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#8a7060",
  fontStyle: "italic",
  maxWidth: "200px",
  textAlign: "right" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const centeredStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  padding: "40px",
  textAlign: "center" as const,
};

const spinnerStyle: React.CSSProperties = {
  fontSize: "40px",
};

const statusTextStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  color: "#2d241d",
};

const subTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#8a7060",
  maxWidth: "380px",
  lineHeight: 1.6,
};

const contentAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto" as const,
  padding: "24px 28px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const manifestHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
};

const manifestTitleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#2d241d",
};

const manifestSubtitleStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#8a7060",
  marginTop: "2px",
};

const legendRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap" as const,
};

const legendPillStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: "99px",
  letterSpacing: "0.04em",
};

const chaptersListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const chapterCardStyle: React.CSSProperties = {
  border: "1px solid rgba(45,36,29,0.1)",
  borderRadius: "8px",
  overflow: "hidden",
  background: "#fff",
};

const chapterHeaderStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left" as const,
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const chapterTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#2d241d",
};

const chapterBodyStyle: React.CSSProperties = {
  padding: "12px 16px 16px",
  borderTop: "1px solid rgba(45,36,29,0.07)",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  color: "#0F766E",
  padding: "10px 0 3px",
  borderBottom: "1px solid rgba(15,118,110,0.15)",
  marginBottom: "4px",
};

const materialLineStyle: React.CSSProperties = {
  fontSize: "12px",
  padding: "3px 8px",
  marginLeft: "8px",
  borderRadius: "0 4px 4px 0",
  display: "flex",
  gap: "6px",
  lineHeight: 1.5,
};

const continueRowStyle: React.CSSProperties = {
  paddingTop: "16px",
  borderTop: "1px solid rgba(45,36,29,0.08)",
  display: "flex",
  justifyContent: "flex-end",
};

const continueBtnStyle: React.CSSProperties = {
  padding: "10px 24px",
  background: "#B8793A",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const regenBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  background: "transparent",
  color: "#8a7060",
  border: "1px solid rgba(45,36,29,0.15)",
  borderRadius: "6px",
  fontSize: "12px",
  cursor: "pointer",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  flexShrink: 0,
};

const retryBtnStyle: React.CSSProperties = {
  padding: "8px 20px",
  background: "#B8793A",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};
