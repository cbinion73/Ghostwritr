"use client";

import { useState } from "react";

type ExportFormat = "docx" | "markdown" | "html" | "json";

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
) {
  const match = contentDisposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? fallback;
}

export function EditingExportMenu({
  slug,
  title,
  disabled,
}: {
  slug: string;
  title: string;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setActiveFormat(format);
    try {
      const response = await fetch(`/api/books/${slug}/manuscript-export?format=${format}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const filename = extractFilenameFromDisposition(
        response.headers.get("content-disposition"),
        `${title}.${format === "markdown" ? "md" : format}`,
      );
      downloadBlob(blob, filename);
      setIsOpen(false);
    } catch (error) {
      console.error("Manuscript export failed:", error);
      alert(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setActiveFormat(null);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn"
        type="button"
        disabled={disabled || Boolean(activeFormat)}
        onClick={() => setIsOpen((value) => !value)}
      >
        Export Manuscript {isOpen ? "▲" : "▼"}
      </button>
      {isOpen ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            minWidth: 220,
            borderRadius: 16,
            border: "1px solid rgba(31, 58, 77, 0.12)",
            background: "#fffdf9",
            boxShadow: "0 18px 42px rgba(44, 32, 22, 0.16)",
            padding: 8,
            zIndex: 20,
          }}
        >
          {(["docx", "markdown", "html", "json"] as const).map((format) => (
            <button
              key={format}
              type="button"
              disabled={Boolean(activeFormat)}
              onClick={() => void handleExport(format)}
              style={{
                width: "100%",
                textAlign: "left",
                border: 0,
                background: "transparent",
                borderRadius: 12,
                padding: "10px 12px",
                cursor: "pointer",
                color: "#1f3a4d",
              }}
            >
              {activeFormat === format ? `Preparing ${format}...` : format.toUpperCase()}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
