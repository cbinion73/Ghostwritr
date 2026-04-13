"use client";

import { useState } from "react";
import type { BookPromiseReport } from "@/lib/promise-types";

interface ExportMenuProps {
  slug: string;
  bookTitle: string;
  promiseData: Record<string, any>;
  bookPromiseReport?: BookPromiseReport;
}

type ExportFormat = "docx" | "markdown" | "html" | "json";

function getLegacyContent(format: Exclude<ExportFormat, "docx">, bookTitle: string, data: Record<string, any>): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2);
    case "html":
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${bookTitle}</title></head><body><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`;
    case "markdown":
    default:
      return [
        `# ${bookTitle} - Book Pitch Snapshot`,
        "",
        `Generated: ${new Date().toLocaleDateString()}`,
        "",
        data.promiseStatement ? `## Promise Statement\n\n${data.promiseStatement}\n` : "",
        data.audiencePrimary ? `## Audience\n\n${data.audiencePrimary}\n` : "",
        data.coreTruth ? `## Core Truth\n\n${data.coreTruth}\n` : "",
      ]
        .filter(Boolean)
        .join("\n");
  }
}

function getLegacyMimeType(format: Exclude<ExportFormat, "docx">): string {
  switch (format) {
    case "html":
      return "text/html";
    case "json":
      return "application/json";
    case "markdown":
    default:
      return "text/markdown";
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function extractFilenameFromDisposition(
  contentDisposition: string | null,
  fallback: string,
): string {
  const match = contentDisposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? fallback;
}

export function ExportMenu({
  slug,
  bookTitle,
  promiseData,
  bookPromiseReport,
}: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);

  const hasFinalDocument = Boolean(bookPromiseReport?.documentMarkdown);

  const handleExport = async (format: ExportFormat) => {
    setActiveFormat(format);
    try {
      if (hasFinalDocument) {
        const response = await fetch(`/api/books/${slug}/promise-export?format=${format}`);
        if (!response.ok) {
          throw new Error(await response.text());
        }

        const blob = await response.blob();
        const filename = extractFilenameFromDisposition(
          response.headers.get("content-disposition"),
          `${bookTitle}.${format}`,
        );
        downloadBlob(blob, filename);
      } else if (format === "docx") {
        throw new Error("Word export becomes available after the Book Pitch package is generated.");
      } else {
        const content = getLegacyContent(format, bookTitle, promiseData);
        const blob = new Blob([content], {
          type: getLegacyMimeType(format),
        });
        downloadBlob(blob, `${bookTitle}.${format === "markdown" ? "md" : format}`);
      }

      setIsOpen(false);
    } catch (error) {
      console.error("Export failed:", error);
      alert(error instanceof Error ? error.message : "Export failed. Check console for details.");
    } finally {
      setActiveFormat(null);
    }
  };

  return (
    <div style={styles.container}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={Boolean(activeFormat)}
        style={{
          ...styles.button,
          ...(isOpen && styles.buttonActive),
          ...(activeFormat && styles.disabled),
        }}
        title="Export book pitch document"
      >
        📥 Export
        <span style={styles.caret}>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div style={styles.menu}>
          <button
            onClick={() => void handleExport("docx")}
            disabled={Boolean(activeFormat)}
            style={{
              ...styles.menuItem,
              ...(activeFormat && styles.disabled),
            }}
          >
            <span style={styles.menuIcon}>📘</span>
            <div style={styles.menuItemText}>
              <div style={styles.menuItemTitle}>Word (.docx)</div>
              <div style={styles.menuItemDesc}>
                {hasFinalDocument
                  ? "Polished proposal document"
                  : "Available after final package generation"}
              </div>
            </div>
            {activeFormat === "docx" && <span style={styles.loadingIcon}>⏳</span>}
          </button>

          <button
            onClick={() => void handleExport("markdown")}
            disabled={Boolean(activeFormat)}
            style={{
              ...styles.menuItem,
              ...(activeFormat && styles.disabled),
            }}
          >
            <span style={styles.menuIcon}>📝</span>
            <div style={styles.menuItemText}>
              <div style={styles.menuItemTitle}>Markdown</div>
              <div style={styles.menuItemDesc}>Editable text version</div>
            </div>
            {activeFormat === "markdown" && <span style={styles.loadingIcon}>⏳</span>}
          </button>

          <button
            onClick={() => void handleExport("html")}
            disabled={Boolean(activeFormat)}
            style={{
              ...styles.menuItem,
              ...(activeFormat && styles.disabled),
            }}
          >
            <span style={styles.menuIcon}>🌐</span>
            <div style={styles.menuItemText}>
              <div style={styles.menuItemTitle}>HTML</div>
              <div style={styles.menuItemDesc}>Styled single-file document</div>
            </div>
            {activeFormat === "html" && <span style={styles.loadingIcon}>⏳</span>}
          </button>

          <div style={styles.menuDivider} />

          <button
            onClick={() => void handleExport("json")}
            disabled={Boolean(activeFormat)}
            style={{
              ...styles.menuItem,
              ...styles.menuItemSecondary,
              ...(activeFormat && styles.disabled),
            }}
          >
            <span style={styles.menuIcon}>⚙️</span>
            <div style={styles.menuItemText}>
              <div style={styles.menuItemTitle}>JSON</div>
              <div style={styles.menuItemDesc}>Structured artifact payload</div>
            </div>
            {activeFormat === "json" && <span style={styles.loadingIcon}>⏳</span>}
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: "relative" as const,
  },
  button: {
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: "8px",
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid rgba(31, 58, 77, 0.16)",
    backgroundColor: "#fffdf9",
    color: "#1f3a4d",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  },
  buttonActive: {
    backgroundColor: "rgba(31, 58, 77, 0.06)",
  },
  caret: {
    fontSize: "10px",
  },
  menu: {
    position: "absolute" as const,
    top: "calc(100% + 10px)",
    right: 0,
    width: "280px",
    padding: "10px",
    borderRadius: "14px",
    border: "1px solid rgba(59, 44, 31, 0.12)",
    backgroundColor: "#fffdf9",
    boxShadow: "0 18px 40px rgba(45, 36, 29, 0.12)",
    display: "grid" as const,
    gap: "8px",
    zIndex: 20,
  },
  menuItem: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: "12px",
    width: "100%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid rgba(59, 44, 31, 0.08)",
    backgroundColor: "#fffdf9",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  menuItemSecondary: {
    backgroundColor: "rgba(59, 44, 31, 0.03)",
  },
  menuItemText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#2d241d",
  },
  menuItemDesc: {
    fontSize: "12px",
    color: "#6f6256",
    marginTop: "2px",
  },
  menuIcon: {
    fontSize: "16px",
  },
  loadingIcon: {
    fontSize: "13px",
  },
  menuDivider: {
    height: "1px",
    backgroundColor: "rgba(59, 44, 31, 0.08)",
    margin: "4px 0",
  },
  disabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
};
