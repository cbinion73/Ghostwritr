"use client";

import { useState } from "react";
import { refinePromiseToExcellence } from "./actions";

export function RefineButton({ slug }: { slug: string }) {
  const [isRefining, setIsRefining] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const handleRefine = async () => {
    setIsRefining(true);
    setShowLogs(true);
    setLogs(["Starting refinement...💫"]);

    try {
      const result = await refinePromiseToExcellence(slug);

      if (result.refinementLog) {
        setLogs(result.refinementLog);
      }

      if (result.success) {
        setLogs((prev) => [...prev, "\n✨ Refinement complete!"]);
      } else {
        setLogs((prev) => [
          ...prev,
          `\n❌ Refinement failed: ${result.errorMessage || "Unknown error"}`,
        ]);
      }
    } catch (error) {
      setLogs((prev) => [
        ...prev,
        `\n❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      ]);
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleRefine}
        disabled={isRefining}
        style={{
          ...styles.btnSmall,
          ...styles.btnPolish,
          opacity: isRefining ? 0.6 : 1,
          cursor: isRefining ? "not-allowed" : "pointer",
        }}
      >
        {isRefining ? "✨ Polishing..." : "Polish to Excellence"}
      </button>

      {showLogs && (
        <div style={styles.logsPanel}>
          <div style={styles.logsHeader}>
            <h3 style={styles.logsTitle}>Refinement Progress</h3>
            <button
              onClick={() => setShowLogs(false)}
              style={styles.closeButton}
              type="button"
            >
              ✕
            </button>
          </div>
          <div style={styles.logsContent}>
            {logs.map((log, idx) => (
              <div key={idx} style={styles.logLine}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  btnSmall: {
    padding: "8px 12px",
    backgroundColor: "var(--paper, #fbf6ef)",
    color: "var(--ink, #2d241d)",
    border: "1px solid rgba(45, 36, 29, 0.2)",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer" as const,
    width: "100%" as const,
    textAlign: "left" as const,
  },
  btnPolish: {
    backgroundColor: "#f0e5d8",
    border: "1px solid #d4a574",
    color: "#6b5344",
    fontWeight: 600 as const,
  },
  logsPanel: {
    position: "fixed" as const,
    bottom: "20px",
    right: "20px",
    width: "380px",
    maxHeight: "400px",
    backgroundColor: "#1a1a1a",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "8px",
    overflow: "hidden",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
    zIndex: 1000,
  },
  logsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
    backgroundColor: "#0d0d0d",
  },
  logsTitle: {
    margin: 0,
    fontSize: "13px",
    fontWeight: 600,
    color: "#fff",
  },
  closeButton: {
    background: "none",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    fontSize: "16px",
    padding: "0",
    opacity: 0.6,
  },
  logsContent: {
    overflowY: "auto" as const,
    maxHeight: "340px",
    padding: "12px 16px",
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#0f0",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  logLine: {
    marginBottom: "4px",
    lineHeight: "1.4",
  },
};
