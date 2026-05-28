"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";

type EnrichStatus = "pending" | "enriching" | "done" | "error";

interface WorkbookChapter {
  chapterKey: string;
  chapterTitle: string;
  artifactId: string;
  content: string;
  isEnriched: boolean;
}

interface ChapterState {
  chapterKey: string;
  chapterTitle: string;
  artifactId: string;
  rawContent: string;
  enrichedContent: string;
  status: EnrichStatus;
  expanded: boolean;
}

export function WorkbookDesignPanel({ slug }: { slug: string }) {
  const [chapters, setChapters] = useState<ChapterState[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [approving, setApproving] = useState(false);
  const stopRef = useRef(false);

  // Load chapters on mount
  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/books/${slug}/workbook-design`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as { chapters: WorkbookChapter[] };
      setChapters(data.chapters.map(ch => ({
        chapterKey: ch.chapterKey,
        chapterTitle: ch.chapterTitle,
        artifactId: ch.artifactId,
        rawContent: ch.content,
        enrichedContent: ch.isEnriched ? ch.content : "",
        status: ch.isEnriched ? "done" : "pending",
        expanded: false,
      })));
      setLoading(false);
    })();
  }, [slug]);

  const runEnrichment = useCallback(async () => {
    stopRef.current = false;
    setRunning(true);

    const toProcess = chapters
      .map((ch, idx) => ({ ...ch, idx }))
      .filter(ch => ch.status !== "done");

    for (const ch of toProcess) {
      if (stopRef.current) break;

      setChapters(prev => prev.map((c, i) =>
        i === ch.idx ? { ...c, status: "enriching" } : c
      ));

      try {
        const res = await fetch(`/api/books/${slug}/workbook-design`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artifactId: ch.artifactId,
            chapterTitle: ch.chapterTitle,
            rawContent: ch.rawContent,
          }),
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as { enrichedContent: string };

        setChapters(prev => prev.map((c, i) =>
          i === ch.idx ? { ...c, status: "done", enrichedContent: data.enrichedContent } : c
        ));
      } catch {
        setChapters(prev => prev.map((c, i) =>
          i === ch.idx ? { ...c, status: "error" } : c
        ));
      }
    }

    setRunning(false);
  }, [chapters, slug]);

  const allDone = chapters.length > 0 && chapters.every(ch => ch.status === "done");
  const doneCount = chapters.filter(ch => ch.status === "done").length;

  async function handleApprove() {
    setApproving(true);
    await fetch(`/api/books/${slug}/workbook-design`, {
      method: "PATCH",
    });
    window.location.href = `/books/${slug}`;
  }

  if (loading) return (
    <div style={{ padding: 40, color: "#8a7a6a", fontFamily: '"Iowan Old Style", Georgia, serif' }}>
      Loading workbook chapters…
    </div>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", background: "#fefbf5", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid rgba(45,36,29,0.1)", background: "rgba(254,251,245,0.95)", flexShrink: 0, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#2d241d", fontFamily: '"Iowan Old Style", Georgia, serif' }}>Sage — Workbook Design</div>
          <div style={{ fontSize: 11, color: "#8a7a6a", marginTop: 2 }}>
            {doneCount}/{chapters.length} chapters enriched
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {running && (
            <>
              <span style={{ fontSize: 11, color: "#B8793A", fontFamily: '"Iowan Old Style", Georgia, serif' }}>&#x27F3; Enriching…</span>
              <button
                style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid rgba(192,57,43,0.4)", background: "transparent", color: "#c03a2b", fontSize: 12, cursor: "pointer" }}
                onClick={() => { stopRef.current = true; }}
              >
                Stop
              </button>
            </>
          )}
          {!running && !allDone && (
            <button
              style={{ padding: "7px 16px", borderRadius: 7, border: "none", background: "#4a7c59", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: '"Iowan Old Style", Georgia, serif' }}
              onClick={() => void runEnrichment()}
              disabled={chapters.length === 0}
            >
              {doneCount > 0 ? "Continue Enriching" : "Enrich All Chapters"}
            </button>
          )}
          {allDone && (
            <button
              style={{ padding: "7px 16px", borderRadius: 7, border: "none", background: "#4a7c59", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: '"Iowan Old Style", Georgia, serif' }}
              onClick={() => void handleApprove()}
              disabled={approving}
            >
              {approving ? "Advancing…" : "Approve & Continue to Folio →"}
            </button>
          )}
        </div>
      </div>

      {/* Chapter list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {chapters.length === 0 && (
          <div style={{ padding: "32px 16px", color: "#8a7a6a", fontFamily: '"Iowan Old Style", Georgia, serif', fontSize: 13 }}>
            No chapters found. Make sure the Chapter Draft stage has committed chapters.
          </div>
        )}
        {chapters.map((ch, idx) => (
          <div
            key={ch.chapterKey}
            style={{
              marginBottom: 8,
              borderRadius: 8,
              border: `1px solid ${ch.status === "done" ? "rgba(74,124,89,0.3)" : ch.status === "error" ? "rgba(192,57,43,0.3)" : "rgba(45,36,29,0.12)"}`,
              background: "#fff",
              overflow: "hidden",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: ch.status === "done" ? "pointer" : "default" }}
              onClick={() => ch.status === "done" && setChapters(prev => prev.map((c, i) => i === idx ? { ...c, expanded: !c.expanded } : c))}
            >
              <span style={{ fontSize: 13, color: ch.status === "done" ? "#4a7c59" : ch.status === "error" ? "#c03a2b" : ch.status === "enriching" ? "#B8793A" : "#8a7a6a" }}>
                {ch.status === "done" ? "✓" : ch.status === "error" ? "✗" : ch.status === "enriching" ? "⟳" : "○"}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: "#2d241d", fontFamily: '"Iowan Old Style", Georgia, serif', fontWeight: 500 }}>{ch.chapterTitle}</span>
              {ch.status === "done" && (
                <span style={{ fontSize: 11, color: "#8a7a6a" }}>{ch.expanded ? "▲" : "▼"}</span>
              )}
              {ch.status === "error" && (
                <button
                  style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(192,57,43,0.3)", background: "transparent", color: "#c03a2b", cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); setChapters(prev => prev.map((c, i) => i === idx ? { ...c, status: "pending" } : c)); }}
                >
                  Retry
                </button>
              )}
            </div>
            {ch.expanded && ch.enrichedContent && (
              <div style={{ padding: "0 14px 14px", borderTop: "1px solid rgba(45,36,29,0.08)" }}>
                <div style={{ fontSize: 13, lineHeight: 1.75, color: "#2d241d", fontFamily: '"Iowan Old Style", Georgia, serif', whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto", paddingTop: 12 }}>
                  {ch.enrichedContent}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
