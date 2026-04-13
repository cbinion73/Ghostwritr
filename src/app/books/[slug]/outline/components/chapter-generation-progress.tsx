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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Chapter Breakdowns</span>
        <span className="text-gray-600">
          {progress.completed}/{progress.total} complete
          {hasErrors && <span className="text-red-600"> • {progress.failed} failed</span>}
        </span>
      </div>

      {/* Overall progress bar */}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            hasErrors
              ? "bg-red-500"
              : progress.completed === progress.total
                ? "bg-green-500"
                : "bg-yellow-500"
          }`}
          style={{ width: `${completionPercentage}%` }}
        />
      </div>

      {/* Chapter grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1">
        {progress.chapters.map((chapter) => (
          <div
            key={chapter.chapterId}
            className="aspect-square rounded flex items-center justify-center text-xs font-medium relative group"
            title={`${chapter.chapterTitle}: ${chapter.status}`}
          >
            <div
              className={`w-full h-full rounded flex items-center justify-center text-white text-xs font-semibold transition-colors duration-200 ${
                chapter.status === "completed"
                  ? "bg-green-500"
                  : chapter.status === "processing"
                    ? "bg-yellow-500 animate-pulse"
                    : chapter.status === "failed"
                      ? "bg-red-500"
                      : "bg-gray-300"
              }`}
            >
              {chapter.chapterNumber}
            </div>

            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {chapter.chapterTitle}
              <br />
              {chapter.status === "failed" && chapter.error && (
                <span className="text-red-200">{chapter.error.slice(0, 50)}...</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Status message */}
      <div className="text-xs text-gray-600 mt-2">
        {progress.completed === progress.total
          ? "✓ All chapters processed"
          : `Processing... ${progress.completed} of ${progress.total} chapters done`}
      </div>
    </div>
  );
}
