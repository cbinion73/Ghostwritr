"use client";

import { useState, useEffect } from "react";
import { fetchJson } from "@/lib/ui/client-request";

interface StatusIndicatorProps {
  slug: string;
}

export function PromiseStatusIndicator({ slug }: StatusIndicatorProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const data = await fetchJson<{ isRunning: boolean; elapsedSeconds: number }>(`/api/books/${slug}/promise-status`);
        setIsRunning(data.isRunning);
        setElapsedSeconds(data.elapsedSeconds);
      } catch (error) {
        console.error("Failed to check workflow status:", error);
      }
    };

    checkStatus();

    if (isRunning) {
      const interval = setInterval(checkStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [slug, isRunning]);

  if (!isRunning) {
    return null;
  }

  return (
    <div
      style={{
        padding: "12px 16px",
        backgroundColor: "#f0f4f8",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        marginBottom: "16px",
        fontSize: "14px",
      }}
    >
      <div
        style={{
          display: "inline-block",
          width: "12px",
          height: "12px",
          borderRadius: "50%",
          backgroundColor: "#3b82f6",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
      <span style={{ color: "#1f2937" }}>
        Processing your input... ({elapsedSeconds}s)
      </span>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
