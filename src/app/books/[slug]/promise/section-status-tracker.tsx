"use client";

import type { ApprovalStatus } from "./approval-buttons";

export interface SectionStatus {
  id: string;
  label: string;
  status: ApprovalStatus;
}

interface SectionStatusTrackerProps {
  sections: SectionStatus[];
  isGenerating?: Record<string, boolean>;
  onSectionClick?: (sectionId: string) => void;
}

export function SectionStatusTracker({
  sections,
  isGenerating = {},
  onSectionClick,
}: SectionStatusTrackerProps) {
  const approved = sections.filter((s) => s.status === "approved").length;
  const total = sections.length;
  const percentage = Math.round((approved / total) * 100);

  const getStatusIcon = (status: ApprovalStatus) => {
    switch (status) {
      case "approved":
        return "✅";
      case "rejected":
        return "⚠️";
      case "pending":
        return "⏳";
    }
  };

  const getStatusColor = (status: ApprovalStatus, sectionId: string) => {
    // Yellow if currently generating
    if (isGenerating[sectionId]) return "#f59e0b";

    switch (status) {
      case "approved":
        return "#16a34a"; // Green
      case "rejected":
        return "#ea580c"; // Orange
      case "pending":
        return "#ef4444"; // Red
    }
  };

  return (
    <div style={styles.container}>
      {/* Progress Summary */}
      <div style={styles.summary}>
        <div style={styles.progressInfo}>
          <h3 style={styles.title}>Promise Document Progress</h3>
          <p style={styles.description}>
            {approved} of {total} sections approved
          </p>
        </div>

        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${percentage}%`,
            }}
          />
        </div>

        <div style={styles.percentage}>{percentage}%</div>
      </div>

      {/* Section Status List */}
      <div style={styles.sectionList}>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => onSectionClick?.(section.id)}
            style={{
              ...styles.sectionItem,
              ...(onSectionClick && styles.sectionItemClickable),
            }}
          >
            <span style={styles.sectionIcon}>
              {getStatusIcon(section.status)}
            </span>
            <span style={styles.sectionLabel}>{section.label}</span>
            <span
              style={{
                ...styles.statusDot,
                backgroundColor: getStatusColor(section.status, section.id),
              }}
            />
          </button>
        ))}
      </div>

      {/* All Approved Banner */}
      {approved === total && (
        <div style={styles.completeBanner}>
          <span style={styles.completeIcon}>🎉</span>
          <div>
            <p style={styles.completeTitle}>All Sections Approved!</p>
            <p style={styles.completeDescription}>
              Your Book Pitch is ready to commit. Click "Commit Promise" to proceed to Outline.
            </p>
          </div>
        </div>
      )}

      {/* Need Approval Banner */}
      {approved < total && (
        <div style={styles.pendingBanner}>
          <span style={styles.pendingIcon}>👉</span>
          <div>
            <p style={styles.pendingTitle}>
              {total - approved} section{total - approved !== 1 ? "s" : ""} need approval
            </p>
            <p style={styles.pendingDescription}>
              Review and approve all sections to unlock the commit button.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "16px",
    padding: "16px",
    backgroundColor: "rgba(45, 36, 29, 0.02)",
    borderRadius: "12px",
    border: "1px solid rgba(45, 36, 29, 0.1)",
  },
  summary: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: "16px",
  },
  progressInfo: {
    flex: 1,
  },
  title: {
    margin: "0 0 4px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#2d241d",
  },
  description: {
    margin: 0,
    fontSize: "12px",
    color: "#6f6256",
  },
  progressBar: {
    flex: 2,
    height: "8px",
    backgroundColor: "rgba(45, 36, 29, 0.1)",
    borderRadius: "4px",
    overflow: "hidden" as const,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#16a34a",
    transition: "width 0.3s ease",
  },
  percentage: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#16a34a",
    minWidth: "40px",
    textAlign: "right" as const,
  },
  sectionList: {
    display: "grid" as const,
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "8px",
  },
  sectionItem: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: "8px",
    padding: "8px 12px",
    backgroundColor: "#fff",
    border: "1px solid rgba(45, 36, 29, 0.1)",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    color: "#2d241d",
    cursor: "default",
  },
  sectionItemClickable: {
    cursor: "pointer" as const,
    transition: "all 0.2s",
  },
  sectionIcon: {
    fontSize: "14px",
  },
  sectionLabel: {
    flex: 1,
    textAlign: "left" as const,
  },
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  completeBanner: {
    display: "flex" as const,
    gap: "12px",
    padding: "12px 16px",
    backgroundColor: "#dcfce7",
    border: "1px solid rgba(22, 163, 74, 0.3)",
    borderRadius: "8px",
  },
  completeIcon: {
    fontSize: "20px",
    flexShrink: 0,
  },
  completeTitle: {
    margin: "0 0 2px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#166534",
  },
  completeDescription: {
    margin: 0,
    fontSize: "11px",
    color: "#15803d",
    lineHeight: 1.4,
  },
  pendingBanner: {
    display: "flex" as const,
    gap: "12px",
    padding: "12px 16px",
    backgroundColor: "#fef3c7",
    border: "1px solid rgba(245, 158, 11, 0.3)",
    borderRadius: "8px",
  },
  pendingIcon: {
    fontSize: "20px",
    flexShrink: 0,
  },
  pendingTitle: {
    margin: "0 0 2px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#92400e",
  },
  pendingDescription: {
    margin: 0,
    fontSize: "11px",
    color: "#78350f",
    lineHeight: 1.4,
  },
};
