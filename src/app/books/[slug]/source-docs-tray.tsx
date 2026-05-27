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

// Per-file upload state in the queue
type QueuedFile = {
  id: string; // local uuid
  file: File;
  label: string;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
};

interface SourceDocsTrayProps {
  slug: string;
}

function slugToLabel(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let _queueCounter = 0;
function uid() {
  return `q-${Date.now()}-${++_queueCounter}`;
}

// ── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ color = "#B8793A", size = 13 }: { color?: string; size?: number }) {
  return (
    <>
      <style>{`@keyframes sd-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <span
        style={{
          display: "inline-block",
          width: size,
          height: size,
          border: `2px solid ${color}33`,
          borderTopColor: color,
          borderRadius: "50%",
          animation: "sd-spin 0.75s linear infinite",
          flexShrink: 0,
        }}
      />
    </>
  );
}

function GreenCheck({ size = 13 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(74,124,89,0.15)",
        color: "#4a7c59",
        fontSize: size * 0.7,
        fontWeight: 700,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      ✓
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function SourceDocsTray({ slug }: SourceDocsTrayProps) {
  const [expanded, setExpanded] = useState(false);
  const [docs, setDocs] = useState<SourceDoc[]>([]);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadingAll, setUploadingAll] = useState(false);
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

  // Poll while any saved doc is still extracting (null = not yet processed; "" or text = done)
  const hasExtracting = docs.some((d) => d.extractedText === null);
  useEffect(() => {
    if (!hasExtracting) return;
    const id = setTimeout(() => void loadDocs(), 3000);
    return () => clearTimeout(id);
  }, [hasExtracting, loadDocs]);

  // Add files to the queue (dedup by name)
  const enqueue = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    setQueue((prev) => {
      const existingNames = new Set(prev.map((q) => q.file.name));
      const newItems: QueuedFile[] = arr
        .filter((f) => !existingNames.has(f.name))
        .map((f) => ({
          id: uid(),
          file: f,
          label: slugToLabel(f.name),
          status: "pending",
        }));
      return [...prev, ...newItems];
    });
    setExpanded(true);
  }, []);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      enqueue(e.target.files);
      e.target.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      enqueue(e.dataTransfer.files);
    }
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const updateLabel = (id: string, label: string) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, label } : q)));
  };

  const uploadOne = async (item: QueuedFile): Promise<void> => {
    setQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: "uploading" } : q)),
    );

    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("label", item.label.trim() || slugToLabel(item.file.name));

    try {
      const res = await fetch(`/api/books/${slug}/source-docs`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Upload failed");
      }
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "done" } : q)),
      );
    } catch (err) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: "error", errorMsg: err instanceof Error ? err.message : "Upload failed" }
            : q,
        ),
      );
    }
  };

  const handleUploadAll = async () => {
    const pending = queue.filter((q) => q.status === "pending" || q.status === "error");
    if (pending.length === 0 || uploadingAll) return;
    setUploadingAll(true);
    await Promise.allSettled(pending.map(uploadOne));
    setUploadingAll(false);
    await loadDocs();
    // Auto-clear done items after a beat
    setTimeout(() => {
      setQueue((prev) => prev.filter((q) => q.status !== "done"));
    }, 1800);
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

  const enabledCount = docs.filter((d) => d.metadataJson?.enabled !== false).length;
  const pendingCount = queue.filter((q) => q.status === "pending" || q.status === "error").length;
  const uploadingCount = queue.filter((q) => q.status === "uploading").length;

  return (
    <div style={trayWrapperStyle}>
      {/* Collapse/expand bar */}
      <button style={trayBarStyle} onClick={() => setExpanded((v) => !v)}>
        <span style={{ fontSize: "13px", marginRight: "6px" }}>📎</span>
        <span style={trayBarLabelStyle}>Source Documents</span>
        {docs.length > 0 && (
          <span style={trayCountStyle}>{enabledCount}/{docs.length} active</span>
        )}
        {queue.length > 0 && (
          <span style={trayQueueBadgeStyle}>
            {uploadingCount > 0 ? `${uploadingCount} uploading` : `${pendingCount} queued`}
          </span>
        )}
        {docs.length === 0 && queue.length === 0 && (
          <span style={trayEmptyHintStyle}>Upload foundational docs for all agents</span>
        )}
        <span style={trayChevronStyle}>{expanded ? "▼" : "▲"}</span>
      </button>

      {expanded && (
        <div style={trayPanelStyle}>
          {/* Drop zone */}
          <div
            style={{ ...dropZoneStyle, ...(dragOver ? dropZoneHoverStyle : {}) }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.ppt,.pptx,.rtf"
              style={{ display: "none" }}
              onChange={handleFilePick}
            />
            <span style={dropZoneIconStyle}>+</span>
            <span style={dropZoneLabelStyle}>
              {dragOver ? "Drop to add…" : "Click or drop files — PDF, Word, Markdown, CSV"}
            </span>
            <span style={dropZoneHintStyle}>PDFs read by Claude · text + diagrams + visual models</span>
          </div>

          {/* ── Upload queue ── */}
          {queue.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <span style={sectionLabelStyle}>Uploading</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {pendingCount > 0 && (
                    <button
                      style={{ ...uploadAllBtnStyle, opacity: uploadingAll ? 0.45 : 1 }}
                      disabled={uploadingAll}
                      onClick={() => void handleUploadAll()}
                    >
                      {uploadingAll ? "Uploading…" : `Upload ${pendingCount > 1 ? `all ${pendingCount}` : "1 file"}`}
                    </button>
                  )}
                  <button style={clearQueueBtnStyle} onClick={() => setQueue([])}>
                    Clear
                  </button>
                </div>
              </div>

              {queue.map((item) => (
                <div key={item.id} style={docCardStyle}>
                  {/* Status icon */}
                  <div style={docCardIconColStyle}>
                    {item.status === "uploading" && <Spinner color="#B8793A" size={14} />}
                    {item.status === "done"     && <GreenCheck size={14} />}
                    {item.status === "pending"  && <span style={fileTypeChipStyle}>{extOf(item.file.name)}</span>}
                    {item.status === "error"    && <span style={{ color: "#c0392b", fontSize: "13px" }}>✗</span>}
                  </div>

                  {/* Title + sublabel */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={docCardTitleStyle}>
                      {item.status === "pending" ? (
                        <input
                          style={inlineLabelInputStyle}
                          type="text"
                          value={item.label}
                          onChange={(e) => updateLabel(item.id, e.target.value)}
                          placeholder="Label…"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span>{item.label || slugToLabel(item.file.name)}</span>
                      )}
                    </div>
                    <div style={docCardSubStyle}>
                      {item.status === "pending"   && <span style={{ color: "#9a8a7a" }}>{item.file.name} · {(item.file.size / 1024).toFixed(0)} KB — ready to upload</span>}
                      {item.status === "uploading" && <span style={{ color: "#B8793A" }}>Uploading…</span>}
                      {item.status === "done"      && <span style={{ color: "#4a7c59" }}>Uploaded — extraction starting</span>}
                      {item.status === "error"     && <span style={{ color: "#c0392b" }}>{item.errorMsg ?? "Upload failed"}</span>}
                    </div>
                  </div>

                  {/* Remove */}
                  {(item.status === "pending" || item.status === "error") && (
                    <button style={removeFileBtnStyle} onClick={() => removeFromQueue(item.id)} title="Remove">×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Saved docs ── */}
          {docs.length > 0 && (
            <div style={sectionStyle}>
              {docs.length > 0 && <div style={sectionHeaderStyle}><span style={sectionLabelStyle}>Source Library</span></div>}

              {docs.map((doc) => {
                const enabled = doc.metadataJson?.enabled !== false;
                const byteSize = doc.metadataJson?.byteSize;
                // null = extraction not yet run; "" = ran but empty/failed; string = ready
                const isReady = doc.extractedText !== null;
                const isPdf = doc.mimeType === "application/pdf";

                return (
                  <div key={doc.id} style={savedDocCardStyle(enabled)}>
                    {/* Status icon */}
                    <div style={docCardIconColStyle}>
                      {isReady
                        ? doc.extractedText
                          ? <GreenCheck size={15} />
                          : <span style={{ color: "#c0392b", fontSize: "13px", fontWeight: 700 }}>!</span>
                        : <Spinner color={enabled ? "#B8793A" : "#9a8a7a"} size={14} />
                      }
                    </div>

                    {/* Title + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={savedDocTitleStyle(enabled)}>{doc.title}</div>
                      <div style={docCardSubStyle}>
                        {byteSize ? `${(byteSize / 1024).toFixed(0)} KB · ` : ""}
                        {isReady
                          ? doc.extractedText
                            ? <span style={{ color: "#4a7c59" }}>Ready</span>
                            : <span style={{ color: "#c0392b" }}>No text extracted</span>
                          : <span style={{ color: "#B8793A" }}>{isPdf ? "Claude reading…" : "Extracting…"}</span>
                        }
                      </div>
                    </div>

                    {/* Toggle */}
                    <button
                      style={toggleBtnStyle(enabled)}
                      onClick={() => void handleToggle(doc)}
                      title={enabled ? "Disable — remove from agent context" : "Enable — inject into agent context"}
                    >
                      {enabled ? "Active" : "Off"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {docs.length === 0 && queue.length === 0 && (
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

function extOf(name: string): string {
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toUpperCase() : "FILE";
}

function iconForMime(mimeOrName: string): string {
  if (mimeOrName.includes("pdf") || mimeOrName.endsWith(".pdf")) return "📕";
  if (mimeOrName.includes("word") || mimeOrName.includes("docx") || mimeOrName.includes("msword") || mimeOrName.endsWith(".docx")) return "📘";
  if (mimeOrName.includes("presentation") || mimeOrName.includes("powerpoint") || mimeOrName.includes("pptx") || mimeOrName.endsWith(".pptx")) return "📊";
  if (mimeOrName.includes("text") || mimeOrName.includes("markdown") || mimeOrName.endsWith(".md") || mimeOrName.endsWith(".txt")) return "📄";
  if (mimeOrName.includes("csv") || mimeOrName.endsWith(".csv")) return "📋";
  return "📎";
}

// Suppress unused-variable warning — iconForMime kept for potential future use
void iconForMime;

// ── Styles ─────────────────────────────────────────────────────────────────────

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

const trayQueueBadgeStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#4a7c59",
  background: "rgba(74,124,89,0.1)",
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
  padding: "0 24px 14px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  maxHeight: "400px",
  overflowY: "auto",
};

const dropZoneStyle: React.CSSProperties = {
  border: "1px dashed rgba(45,36,29,0.18)",
  borderRadius: "6px",
  padding: "12px 16px",
  background: "rgba(254,251,245,0.5)",
  cursor: "pointer",
  transition: "border-color 150ms, background 150ms",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "3px",
  userSelect: "none",
};

const dropZoneHoverStyle: React.CSSProperties = {
  borderColor: "rgba(184,121,58,0.5)",
  background: "rgba(184,121,58,0.04)",
};

const dropZoneIconStyle: React.CSSProperties = {
  fontSize: "20px",
  color: "#B8793A",
  fontWeight: 300,
  lineHeight: 1,
};

const dropZoneLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6f6256",
  fontFamily: F,
  fontWeight: 600,
};

const dropZoneHintStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#9a8a7a",
  fontFamily: F,
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingBottom: "4px",
  borderBottom: "1px solid rgba(45,36,29,0.06)",
  marginBottom: "2px",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 700,
  color: "#9a8a7a",
  fontFamily: F,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const uploadAllBtnStyle: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: "4px",
  border: "none",
  background: "#2d241d",
  color: "#fefbf5",
  fontSize: "11px",
  fontFamily: F,
  cursor: "pointer",
  fontWeight: 600,
  transition: "opacity 120ms",
};

const clearQueueBtnStyle: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: "4px",
  border: "1px solid rgba(45,36,29,0.15)",
  background: "transparent",
  color: "#9a8a7a",
  fontSize: "11px",
  fontFamily: F,
  cursor: "pointer",
};

// Shared card layout
const docCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "7px 10px",
  borderRadius: "6px",
  background: "rgba(45,36,29,0.025)",
  border: "1px solid rgba(45,36,29,0.07)",
};

const docCardIconColStyle: React.CSSProperties = {
  flexShrink: 0,
  width: "18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const docCardTitleStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#2d241d",
  fontFamily: F,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const docCardSubStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#9a8a7a",
  fontFamily: F,
  marginTop: "1px",
};

const fileTypeChipStyle: React.CSSProperties = {
  fontSize: "8px",
  fontWeight: 700,
  color: "#9a8a7a",
  background: "rgba(45,36,29,0.07)",
  padding: "1px 3px",
  borderRadius: "3px",
  fontFamily: F,
  letterSpacing: "0.02em",
};

const inlineLabelInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "2px 6px",
  borderRadius: "4px",
  border: "1px solid rgba(45,36,29,0.15)",
  background: "#fff",
  fontSize: "12px",
  fontFamily: F,
  fontWeight: 600,
  color: "#2d241d",
  outline: "none",
  boxSizing: "border-box",
};

function savedDocCardStyle(enabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "7px 10px",
    borderRadius: "6px",
    background: enabled ? "rgba(74,124,89,0.05)" : "rgba(45,36,29,0.03)",
    border: `1px solid ${enabled ? "rgba(74,124,89,0.15)" : "rgba(45,36,29,0.08)"}`,
    opacity: enabled ? 1 : 0.55,
    transition: "all 200ms ease",
  };
}

function savedDocTitleStyle(enabled: boolean): React.CSSProperties {
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

const removeFileBtnStyle: React.CSSProperties = {
  padding: "0 5px",
  background: "transparent",
  border: "none",
  color: "#9a8a7a",
  fontSize: "15px",
  cursor: "pointer",
  lineHeight: 1,
  flexShrink: 0,
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
