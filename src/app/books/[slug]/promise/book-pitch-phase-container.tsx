"use client";

import { useEffect, useState } from "react";
import type { BookPromiseReport } from "@/lib/promise-types";
import { buildBookPitchPreviewHtml } from "@/lib/book-pitch-document";
import { ApprovalButtons, type ApprovalStatus } from "./approval-buttons";
import {
  compileBookPromiseReportAction,
  saveBookPromiseReportAction,
} from "./actions";

interface BookPitchPhaseContainerProps {
  slug: string;
  data?: BookPromiseReport;
  shouldRefresh?: boolean;
  isGenerating?: boolean;
  approvalStatus?: ApprovalStatus;
  approvalFeedback?: string;
  onApprove: (sectionId: string) => void;
  onReject: (sectionId: string, feedback: string) => void;
  onRegenerate: (sectionId: string) => void | Promise<void>;
  onDataChange?: (data: BookPromiseReport) => void;
  onInvalidateApproval?: (sectionId: string) => void;
}

function formatDecisionLabel(value: "GO" | "NO_GO" | "CONDITIONAL_GO"): string {
  return value.replace(/_/g, " ");
}

function extractFilenameFromDisposition(
  contentDisposition: string | null,
  fallback: string,
): string {
  const match = contentDisposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? fallback;
}

export default function BookPitchPhaseContainer({
  slug,
  data,
  shouldRefresh = false,
  isGenerating = false,
  approvalStatus = "pending",
  approvalFeedback,
  onApprove,
  onReject,
  onRegenerate,
  onDataChange,
  onInvalidateApproval,
}: BookPitchPhaseContainerProps) {
  const [reportData, setReportData] = useState<BookPromiseReport | undefined>(data);
  const [draftMarkdown, setDraftMarkdown] = useState(data?.documentMarkdown ?? "");
  const [localIsGenerating, setLocalIsGenerating] = useState(isGenerating);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeDownload, setActiveDownload] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoTriggered, setHasAutoTriggered] = useState(false);
  const needsRegeneration = !reportData || !reportData.documentMarkdown || shouldRefresh;

  useEffect(() => {
    setReportData(data);
  }, [data]);

  useEffect(() => {
    setDraftMarkdown(reportData?.documentMarkdown ?? data?.documentMarkdown ?? "");
  }, [data, reportData]);

  useEffect(() => {
    setLocalIsGenerating(isGenerating);
  }, [isGenerating]);

  useEffect(() => {
    if (shouldRefresh) {
      setHasAutoTriggered(false);
    }
  }, [shouldRefresh]);

  const handleGenerate = async () => {
    setLocalIsGenerating(true);
    setError(null);
    try {
      const generated = await compileBookPromiseReportAction(slug);
      setReportData(generated);
      setDraftMarkdown(generated.documentMarkdown);
      onDataChange?.(generated);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate book pitch package",
      );
    } finally {
      setLocalIsGenerating(false);
    }
  };

  useEffect(() => {
    if (needsRegeneration && !localIsGenerating && !hasAutoTriggered) {
      setHasAutoTriggered(true);
      void handleGenerate();
    }
  }, [needsRegeneration, localIsGenerating, hasAutoTriggered]);

  const handleRegenerate = async (_sectionId: string) => {
    setLocalIsGenerating(true);
    setError(null);
    try {
      await onRegenerate("book-promise");
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to regenerate book pitch package",
      );
    } finally {
      setLocalIsGenerating(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const saved = await saveBookPromiseReportAction(slug, draftMarkdown);
      setReportData(saved);
      setDraftMarkdown(saved.documentMarkdown);
      setIsEditing(false);
      onDataChange?.(saved);
      onInvalidateApproval?.("book-promise");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save book pitch package",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async (format: "docx" | "markdown" | "html" | "json") => {
    setActiveDownload(format);
    setError(null);
    try {
      const response = await fetch(`/api/books/${slug}/promise-export?format=${format}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const filename = extractFilenameFromDisposition(
        response.headers.get("content-disposition"),
        `book-pitch.${format}`,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Failed to export book pitch package",
      );
    } finally {
      setActiveDownload(null);
    }
  };

  const previewMarkdown = draftMarkdown || reportData?.documentMarkdown || "";

  const styles = {
    container: {
      display: "grid" as const,
      gap: "24px",
      padding: "24px",
    },
    header: {
      display: "grid" as const,
      gap: "12px",
    },
    title: {
      fontSize: "20px",
      fontWeight: 700,
      color: "#2d241d",
      margin: 0,
    },
    description: {
      fontSize: "14px",
      color: "#6f6256",
      margin: 0,
      lineHeight: 1.6,
    },
    errorBox: {
      padding: "12px 14px",
      backgroundColor: "#fee2e2",
      border: "1px solid #fecaca",
      borderRadius: "8px",
      color: "#991b1b",
      fontSize: "14px",
    },
    highlightBox: {
      padding: "20px",
      backgroundColor: "rgba(22, 56, 79, 0.06)",
      border: "1px solid rgba(22, 56, 79, 0.16)",
      borderRadius: "12px",
      display: "grid" as const,
      gap: "12px",
    },
    highlightText: {
      fontSize: "16px",
      fontWeight: 600,
      color: "#16384f",
      lineHeight: 1.6,
      margin: 0,
    },
    metaRow: {
      display: "flex" as const,
      flexWrap: "wrap" as const,
      gap: "10px",
      alignItems: "center" as const,
    },
    badge: {
      display: "inline-flex",
      alignItems: "center" as const,
      padding: "6px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 700,
      backgroundColor: "rgba(245, 158, 11, 0.12)",
      border: "1px solid rgba(245, 158, 11, 0.24)",
      color: "#92400e",
      width: "fit-content",
    },
    subtleMeta: {
      fontSize: "12px",
      color: "#6f6256",
      margin: 0,
    },
    groundingBox: {
      padding: "18px",
      backgroundColor: "rgba(22, 163, 74, 0.05)",
      border: "1px solid rgba(22, 163, 74, 0.18)",
      borderRadius: "12px",
      display: "grid" as const,
      gap: "14px",
    },
    sectionTitle: {
      fontSize: "16px",
      fontWeight: 700,
      color: "#2d241d",
      margin: 0,
    },
    sectionGrid: {
      display: "grid" as const,
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: "16px",
    },
    subsection: {
      display: "grid" as const,
      gap: "6px",
    },
    label: {
      fontSize: "11px",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      color: "#6f6256",
      letterSpacing: "0.04em",
      margin: 0,
    },
    list: {
      margin: 0,
      paddingLeft: "18px",
      display: "grid" as const,
      gap: "6px",
    },
    listItem: {
      fontSize: "14px",
      color: "#2d241d",
      lineHeight: 1.6,
    },
    documentCard: {
      padding: "20px",
      backgroundColor: "rgba(255, 255, 255, 0.88)",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      borderRadius: "12px",
      display: "grid" as const,
      gap: "16px",
    },
    toolbar: {
      display: "flex" as const,
      flexWrap: "wrap" as const,
      gap: "10px",
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
    },
    toolbarLeft: {
      display: "flex" as const,
      flexWrap: "wrap" as const,
      gap: "10px",
      alignItems: "center" as const,
    },
    toolbarRight: {
      display: "flex" as const,
      flexWrap: "wrap" as const,
      gap: "10px",
      alignItems: "center" as const,
    },
    toolButton: {
      padding: "9px 14px",
      borderRadius: "999px",
      border: "1px solid rgba(31, 58, 77, 0.18)",
      backgroundColor: "#fffdf9",
      color: "#1f3a4d",
      fontSize: "13px",
      fontWeight: 600,
      cursor: "pointer",
    },
    primaryButton: {
      backgroundColor: "#1f3a4d",
      color: "#fffdf9",
      border: "1px solid #1f3a4d",
    },
    mutedButton: {
      opacity: 0.7,
    },
    note: {
      fontSize: "13px",
      color: "#6f6256",
      margin: 0,
      lineHeight: 1.6,
    },
    editor: {
      width: "100%",
      minHeight: "880px",
      padding: "24px",
      borderRadius: "12px",
      border: "1px solid rgba(59, 44, 31, 0.14)",
      backgroundColor: "#fffdf9",
      color: "#2d241d",
      fontSize: "15px",
      lineHeight: 1.8,
      fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
      resize: "vertical" as const,
    },
    previewShell: {
      minHeight: "720px",
      padding: "28px",
      borderRadius: "12px",
      border: "1px solid rgba(59, 44, 31, 0.14)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(252,248,241,0.96))",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
      overflowX: "auto" as const,
    },
    approvalSection: {
      display: "grid" as const,
      gap: "16px",
      padding: "16px",
      backgroundColor: "rgba(255, 255, 255, 0.5)",
      borderRadius: "12px",
      border: "1px solid rgba(59, 44, 31, 0.12)",
    },
    placeholderBox: {
      padding: "24px",
      backgroundColor: "rgba(59, 44, 31, 0.04)",
      border: "2px dashed rgba(59, 44, 31, 0.2)",
      borderRadius: "12px",
      textAlign: "center" as const,
    },
    placeholderText: {
      fontSize: "14px",
      color: "rgba(59, 44, 31, 0.6)",
      fontStyle: "italic" as const,
      margin: 0,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Book Pitch Package</h2>
        <p style={styles.description}>
          This is the living proposal document for the book. Regenerate it with Claude Opus when needed, edit it directly, and save the version that should guide the rest of the project.
        </p>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {reportData ? (
        <>
          <div style={styles.highlightBox}>
            <p style={styles.highlightText}>{reportData.executiveSummary}</p>
            <div style={styles.metaRow}>
              <span style={styles.badge}>{formatDecisionLabel(reportData.recommendation)}</span>
              <p style={styles.subtleMeta}>
                Target audience: {reportData.targetAudience}
              </p>
              <p style={styles.subtleMeta}>
                Source: {reportData.metadata?.model ?? "draft"}
              </p>
            </div>
          </div>

          <div style={styles.groundingBox}>
            <h3 style={styles.sectionTitle}>Grounded By</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Previous Phases</p>
                <ul style={styles.list}>
                  {(reportData.metadata?.grounding?.previousPhases ?? []).map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Audience Signals Used</p>
                <ul style={styles.list}>
                  {(reportData.metadata?.grounding?.audienceSignals ?? []).map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Knowledge Base Sources</p>
                <ul style={styles.list}>
                  {(reportData.metadata?.grounding?.kbSources ?? []).map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div style={styles.documentCard}>
            <div style={styles.toolbar}>
              <div style={styles.toolbarLeft}>
                <h3 style={styles.sectionTitle}>Validated Book Pitch Document</h3>
                <p style={styles.note}>
                  Saved edits become the working artifact downstream stages can rely on.
                </p>
              </div>
              <div style={styles.toolbarRight}>
                <button
                  type="button"
                  onClick={() => setIsEditing((current) => !current)}
                  style={styles.toolButton}
                >
                  {isEditing ? "Preview" : "Edit Document"}
                </button>
                {isEditing && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftMarkdown(reportData.documentMarkdown);
                        setIsEditing(false);
                      }}
                      style={{ ...styles.toolButton, ...styles.mutedButton }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      style={{ ...styles.toolButton, ...styles.primaryButton }}
                    >
                      {isSaving ? "Saving..." : "Save Document"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void handleExport("docx")}
                  disabled={Boolean(activeDownload)}
                  style={styles.toolButton}
                >
                  {activeDownload === "docx" ? "Preparing..." : "Download Word"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport("markdown")}
                  disabled={Boolean(activeDownload)}
                  style={styles.toolButton}
                >
                  {activeDownload === "markdown" ? "Preparing..." : "Markdown"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport("html")}
                  disabled={Boolean(activeDownload)}
                  style={styles.toolButton}
                >
                  {activeDownload === "html" ? "Preparing..." : "HTML"}
                </button>
              </div>
            </div>

            {isEditing ? (
              <textarea
                value={draftMarkdown}
                onChange={(event) => setDraftMarkdown(event.target.value)}
                style={styles.editor}
                spellCheck={true}
              />
            ) : (
              <div
                style={styles.previewShell}
                dangerouslySetInnerHTML={{
                  __html: buildBookPitchPreviewHtml(previewMarkdown),
                }}
              />
            )}
          </div>
        </>
      ) : (
        <div style={styles.placeholderBox}>
          <p style={styles.placeholderText}>
            The final Book Pitch package will auto-generate here once the phase opens.
          </p>
        </div>
      )}

      <div style={styles.approvalSection}>
        <ApprovalButtons
          sectionId="book-promise"
          status={approvalStatus}
          feedback={approvalFeedback}
          onApprove={onApprove}
          onReject={onReject}
          onRegenerate={handleRegenerate}
          isLoading={localIsGenerating || isSaving}
        />
      </div>
    </div>
  );
}
