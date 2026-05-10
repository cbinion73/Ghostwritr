"use client";

import { useState } from "react";

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

export function PublishPackageExportButton({
  slug,
  title,
  disabled,
}: {
  slug: string;
  title: string;
  disabled: boolean;
}) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/books/${slug}/publish-package`);
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const filename = extractFilenameFromDisposition(
        response.headers.get("content-disposition"),
        `${title}-publish-package.zip`,
      );
      downloadBlob(blob, filename);
    } catch (error) {
      console.error("Publish package export failed:", error);
      alert(error instanceof Error ? error.message : "Publish package export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button className="btn" type="button" disabled={disabled || isExporting} onClick={() => void handleExport()}>
      {isExporting ? "Preparing Package..." : "Export Publish Package"}
    </button>
  );
}
