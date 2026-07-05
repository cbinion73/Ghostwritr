"use client";

import { useEffect, useState } from "react";
import type { GenerationProgress, ChapterProgress } from "@/lib/workflows/outline-paragraphs";

interface ChapterGenerationProgressProps {
  bookSlug: string;
  isGenerating: boolean;
}

export function ChapterGenerationProgress({ bookSlug, isGenerating }: ChapterGenerationProgressProps) {
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [isPolling, setIsPolling] = useState(isGenerating);

  useEffect(() => {
    setIsPolling(isGenerating);
  }, [isGenerating]);

  useEffect(() => {
    if (!isPolling) return;

    const poll = async () => {
      try {
        const response = await fetch(`/api/books/${bookSlug}/outline/chapter-progress`);
        const data = await response.json();

        if (data.status === "generating" && data.progress) {
          setProgress(data.progress);
        } else {
          setIsPolling(false);
        }
      } catch (error) {
        console.error("Failed to fetch progress:", error);
      }
    };

    const interval = setInterval(poll, 500);
    poll();

    return () => clearInterval(interval);
  }, [isPolling, bookSlug]);

  if (!progress) return null;

  const completionPercentage = Math.round((progress.completed / progress.total) * 100);
  const hasErrors = progress.failed > 0;
  const barColor = hasErrors
    ? "#c0392b"
    : progress.completed === progress.total
      ? "#2f7a4d"
      : "var(--gold-bright, #c9a24b)";

  const chipColor = (status: ChapterProgress["status"]) => {
    switch (status) {
      case "completed":
        return "#2f7a4d";
      case "processing":
        return "var(--gold-bright, #c9a24b)";
      case "failed":
        return "#c0392b";
      default:
        return "rgba(93, 85, 68, 0.25)";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "14px 16px",
        borderRadius: 8,
        border: "1px solid var(--line, rgba(59,44,31,0.14))",
        background: "var(--paper, #f2ebdc)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink, #282318)" }}>
          <span
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              marginRight: 8,
              background: barColor,
              animation:
                progress.completed < progress.total
                  ? "ghostwritr-pulse 1.4s ease-in-out infinite"
                  : "none",
            }}
          />
          Generating Chapter Breakdowns
        </span>
        <span style={{ fontSize: 12, color: "var(--muted, #5d5544)", fontVariantNumeric: "tabular-nums" }}>
          {progress.completed}/{progress.total} complete
          {hasErrors && <span style={{ color: "#c0392b" }}> · {progress.failed} failed</span>}
        </span>
      </div>

      <div
        style={{
          height: 6,
          borderRadius: 999,
          overflow: "hidden",
          background: "rgba(93, 85, 68, 0.15)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${completionPercentage}%`,
            background: barColor,
            transition: "width 0.3s ease-out",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(28px, 1fr))",
          gap: 4,
        }}
      >
        {progress.chapters.map((chapter) => (
          <div
            key={chapter.chapterId}
            title={`${chapter.chapterNumber}. ${chapter.chapterTitle} — ${chapter.status}${
              chapter.status === "failed" && chapter.error ? `: ${chapter.error.slice(0, 80)}` : ""
            }`}
            style={{
              aspectRatio: "1 / 1",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
              color: chapter.status === "pending" ? "var(--muted, #5d5544)" : "#fff",
              background: chipColor(chapter.status),
              animation:
                chapter.status === "processing"
                  ? "ghostwritr-pulse 1.4s ease-in-out infinite"
                  : "none",
            }}
          >
            {chapter.chapterNumber}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, color: "var(--muted, #5d5544)" }}>
        {progress.completed === progress.total
          ? "✓ All chapters processed"
          : `Processing chapter ${progress.completed + 1} of ${progress.total}…`}
      </div>
    </div>
  );
}
