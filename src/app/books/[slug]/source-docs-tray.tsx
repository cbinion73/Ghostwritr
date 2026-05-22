"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type SourceDocMeta = {
  originalFileName?: string;
  label?: string;
  enabled?: boolean;
  byteSize?: number;
  stageKey?: string;
};

type SourceDoc = {
  id: string;
  title: string;
  mimeType: string;
  extractedText: string | null;
  createdAt: string;
  metadataJson: SourceDocMeta | null;
};

interface SourceDocsTrayProps {
  slug: string;
}

export function SourceDocsTray({ slug }: SourceDocsTrayProps) {
  const [expanded, setExpanded] = useState(false);
  const [docs, setDocs] = useState<SourceDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [label, setLabel] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${slug}/source-docs`);
      if (res.ok) {
        const data = (await res.json()) as { docs: SourceDoc[] };
        setDocs(data.docs);
      }
    } catch {
      /* non-fatal */
    }
  }, [slug]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  // Poll if any doc is still extracting
  const hasExtracting = docs.some((d) => !d.extractedText);
  useEffect(() => {
    if (!hasExtracting) return;
    const id = setTimeout(() => void loadDocs(), 3000);
    return () => clearTimeout(id);
  }, [hasExtracting, loadDocs]);

  const handleUpload = async () => {
    if (!selectedFile || !label.trim() || uploading) return;
    setUploading(true);
    setUploadError("");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("label", label.trim());

    try {
      const res = await fetch(`/api/books/${slug}/source-docs`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Upload failed");
      }
      setLabel("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDocs();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleToggle = async (doc: SourceDoc) => {
    const currentlyEnabled = doc.metadataJson?.enabled !== false;
    try {
      await fetch(`/api/books/${slug}/source-docs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, enabled: !currentlyEnabled }),
      });
      await loadDocs();
    } catch {
      /* non-fatal */
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  const enabledCount = docs.filter((d) => d.metadataJson?.enabled !== false).length;

  return (
    <div style={trayWrapperStyle}>
      {/* Collapse/expand bar */}
      <button style={trayBarStyle} onClick={() => setExpanded((v) => !v)}>
        <span style={{ fontSize: "13px", marginRight: "6px" }}>📎</span>
        <span style={trayBarLabelStyle}>Source Documents</span>
        {docs.length > 0 && (
          <span style={trayCountStyle}>
            {enabledCount}/{docs.length} active
          </span>
        )}
        {docs.length === 0 && (
          <span style={trayEmptyHintStyle}>Upload foundational docs for all agents</span>
        )}
        <span style={trayChevronStyle}>{expanded ? "▼" : "▲"}</span>
      </button>

      {expanded && (
        <div style={trayPanelStyle}>
          {/* Upload zone */}
          <div
            style={{ ...uploadZoneStyle, ...(dragOver ? uploadZoneHoverStyle : {}) }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.ppt,.pptx,.rtf"
              style={{ display: "none" }}
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />

            <div style={uploadRowStyle}>
              <button
                style={chooseFileBtnStyle}
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? `📄 ${selectedFile.name}` : "Choose file…"}
              </button>
              <input
                style={labelInputStyle}
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleUpload(); }}
                placeholder="Label — 'My framework whitepaper', 'Previous book'…"
              />
              <button
                style={{
                  ...uploadBtnStyle,
                  opacity: selectedFile && label.trim() && !uploading ? 1 : 0.35,
                }}
                disabled={!selectedFile || !label.trim() || uploading}
                onClick={() => void handleUpload()}
              >
                {uploading ? "⟳" : "Upload"}
              </button>
            </div>

            {!selectedFile && (
              <div style={dropHintStyle}>
                Drop PDF, Word, PowerPoint, or Markdown · PDF and DOCX are fully extracted
              </div>
            )}
          </div>

          {uploadError && (
            <div style={errorStyle}>{uploadError}</div>
          )}

          {/* Document list */}
          {docs.length > 0 && (
            <div style={docListStyle}>
              {docs.map((doc) => {
                const enabled = doc.metadataJson?.enabled !== false;
                const originalName = doc.metadataJson?.originalFileName;
                const byteSize = doc.metadataJson?.byteSize;
                const isReady = Boolean(doc.extractedText);

                return (
                  <div key={doc.id} style={docRowStyle(enabled)}>
                    <div style={docIconStyle(enabled)}>
                      {iconForMime(doc.mimeType)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={docLabelStyle(enabled)}>{doc.title}</div>
                      <div style={docMetaStyle}>
                        {originalName && originalName !== doc.title
                          ? `${originalName} · `
                          : ""}
                        {byteSize ? `${(byteSize / 1024).toFixed(0)} KB · ` : ""}
                        <span style={{ color: isReady ? "#4a7c59" : "#B8793A" }}>
                          {isReady ? "✓ Text ready" : "⟳ Extracting…"}
                        </span>
                      </div>
                    </div>
                    <button
                      style={toggleBtnStyle(enabled)}
                      onClick={() => void handleToggle(doc)}
                      title={
                        enabled
                          ? "Disable — remove from agent context"
                          : "Enable — inject into agent context"
                      }
                    >
                      {enabled ? "Active" : "Off"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {docs.length === 0 && (
            <div style={emptyStateStyle}>
              No source documents yet. Upload whitepapers, prior books, presentations, or
              any foundational material — every agent will read them as context.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function iconForMime(mime: string): string {
  if (mime.includes("pdf")) return "📕";
  if (mime.includes("word") || mime.includes("docx") || mime.includes("msword")) return "📘";
  if (mime.includes("presentation") || mime.includes("powerpoint") || mime.includes("pptx")) return "📊";
  if (mime.includes("text") || mime.includes("markdown")) return "📄";
  if (mime.includes("csv")) return "📋";
  return "📎";
}

// ── Styles ────────────────────────────────────────────────────────────────────

const F = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';

const trayWrapperStyle: React.CSSProperties = {
  flexShrink: 0,
  borderTop: "1px solid rgba(45,36,29,0.08)",
  background: "rgba(254,251,245,0.96)",
};

const trayBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  padding: "7px 24px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  gap: "6px",
  fontFamily: F,
};

const trayBarLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#6f6256",
  fontFamily: F,
};

const trayCountStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#B8793A",
  background: "rgba(184,121,58,0.1)",
  padding: "1px 6px",
  borderRadius: "10px",
  fontFamily: F,
};

const trayEmptyHintStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#9a8a7a",
  fontFamily: F,
};

const trayChevronStyle: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: "9px",
  opacity: 0.35,
  color: "#6f6256",
};

const trayPanelStyle: React.CSSProperties = {
  padding: "0 24px 12px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  maxHeight: "280px",
  overflowY: "auto",
};

const uploadZoneStyle: React.CSSProperties = {
  border: "1px dashed rgba(45,36,29,0.18)",
  borderRadius: "6px",
  padding: "10px 12px",
  background: "rgba(254,251,245,0.5)",
  transition: "border-color 150ms, background 150ms",
};

const uploadZoneHoverStyle: React.CSSProperties = {
  borderColor: "rgba(184,121,58,0.5)",
  background: "rgba(184,121,58,0.04)",
};

const uploadRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
};

const chooseFileBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "5px",
  border: "1px solid rgba(45,36,29,0.2)",
  background: "transparent",
  color: "#6f6256",
  fontSize: "12px",
  fontFamily: F,
  cursor: "pointer",
  whiteSpace: "nowrap",
  maxWidth: "180px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  flexShrink: 0,
};

const labelInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "6px 10px",
  borderRadius: "5px",
  border: "1px solid rgba(45,36,29,0.15)",
  background: "#fff",
  fontSize: "12px",
  fontFamily: F,
  color: "#2d241d",
  outline: "none",
  minWidth: 0,
};

const uploadBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "5px",
  border: "none",
  background: "#2d241d",
  color: "#fefbf5",
  fontSize: "12px",
  fontFamily: F,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
  transition: "opacity 120ms",
};

const dropHintStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#9a8a7a",
  fontFamily: F,
  marginTop: "6px",
  textAlign: "center",
};

const errorStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#c0392b",
  fontFamily: F,
  padding: "4px 0",
};

const docListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

function docRowStyle(enabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    borderRadius: "6px",
    background: enabled ? "rgba(74,124,89,0.05)" : "rgba(45,36,29,0.03)",
    border: `1px solid ${enabled ? "rgba(74,124,89,0.15)" : "rgba(45,36,29,0.08)"}`,
    opacity: enabled ? 1 : 0.55,
    transition: "all 200ms ease",
  };
}

function docIconStyle(enabled: boolean): React.CSSProperties {
  return {
    fontSize: "16px",
    flexShrink: 0,
    opacity: enabled ? 1 : 0.5,
  };
}

function docLabelStyle(enabled: boolean): React.CSSProperties {
  return {
    fontSize: "12px",
    fontWeight: 600,
    color: enabled ? "#2d241d" : "#9a8a7a",
    fontFamily: F,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

const docMetaStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#9a8a7a",
  fontFamily: F,
  marginTop: "1px",
};

function toggleBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: "3px 8px",
    borderRadius: "4px",
    border: `1px solid ${enabled ? "rgba(74,124,89,0.4)" : "rgba(45,36,29,0.2)"}`,
    background: enabled ? "rgba(74,124,89,0.12)" : "transparent",
    color: enabled ? "#4a7c59" : "#9a8a7a",
    fontSize: "11px",
    fontFamily: F,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    fontWeight: 600,
    transition: "all 150ms ease",
  };
}

const emptyStateStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#9a8a7a",
  fontFamily: F,
  lineHeight: 1.5,
  padding: "8px 0",
};
