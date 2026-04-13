"use client";

import { useState } from "react";

export type ApprovalStatus = "pending" | "approved" | "rejected";

interface ApprovalButtonsProps {
  sectionId: string;
  status: ApprovalStatus;
  feedback?: string;
  onApprove: (sectionId: string) => void;
  onReject: (sectionId: string, feedback: string) => void;
  onRegenerate: (sectionId: string) => void | Promise<void>;
  isLoading?: boolean;
}

export function ApprovalButtons({
  sectionId,
  status,
  feedback,
  onApprove,
  onReject,
  onRegenerate,
  isLoading = false,
}: ApprovalButtonsProps) {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  const handleRejectClick = () => {
    if (!feedbackText.trim()) return;
    onReject(sectionId, feedbackText);
    setFeedbackText("");
    setShowFeedbackForm(false);
  };

  return (
    <div style={styles.container}>
      {/* Status Indicator */}
      <div style={styles.statusGroup}>
        {status === "approved" && (
          <div style={styles.statusBadge} title="This section is approved">
            <span style={styles.statusIcon}>✅</span>
            <span>Approved</span>
          </div>
        )}
        {status === "rejected" && (
          <div style={styles.statusBadgeRejected} title="Changes requested">
            <span style={styles.statusIcon}>⚠️</span>
            <span>Changes Requested</span>
          </div>
        )}
        {status === "pending" && (
          <div style={styles.statusBadgePending} title="Awaiting approval">
            <span style={styles.statusIcon}>⏳</span>
            <span>Pending</span>
          </div>
        )}
      </div>

      {/* Feedback Display */}
      {feedback && status === "rejected" && (
        <div style={styles.feedbackBox}>
          <p style={styles.feedbackLabel}>Feedback:</p>
          <p style={styles.feedbackText}>{feedback}</p>
        </div>
      )}

      {/* Action Buttons */}
      {status !== "approved" ? (
        <div style={styles.buttonGroup}>
          {status === "pending" && (
            <>
              <button
                onClick={() => onApprove(sectionId)}
                disabled={isLoading}
                style={{
                  ...styles.button,
                  ...styles.approveButton,
                  ...(isLoading && styles.disabled),
                }}
                title="Approve this section"
              >
                ✅ Approve
              </button>
              <button
                onClick={() => setShowFeedbackForm(!showFeedbackForm)}
                disabled={isLoading}
                style={{
                  ...styles.button,
                  ...styles.rejectButton,
                  ...(isLoading && styles.disabled),
                }}
                title="Request changes to this section"
              >
                ✏️ Request Changes
              </button>
            </>
          )}

          {status === "rejected" && (
            <button
              onClick={() => setShowFeedbackForm(!showFeedbackForm)}
              disabled={isLoading}
              style={{
                ...styles.button,
                ...styles.rejectButton,
                ...(isLoading && styles.disabled),
              }}
              title="Update feedback"
            >
              ✏️ Update Feedback
            </button>
          )}

          <button
            onClick={() => {
              void Promise.resolve(onRegenerate(sectionId)).catch(() => {});
            }}
            disabled={isLoading}
            style={{
              ...styles.button,
              ...styles.regenerateButton,
              ...(isLoading && styles.disabled),
            }}
            title="Regenerate this section with AI"
          >
            {isLoading ? "🔄 Regenerating..." : "🔄 Regenerate"}
          </button>
        </div>
      ) : (
        <div style={styles.buttonGroup}>
          <button
            onClick={() => setShowFeedbackForm(!showFeedbackForm)}
            style={{
              ...styles.button,
              ...styles.editButton,
            }}
            title="Request changes to this approved section"
          >
            ✏️ Request Changes
          </button>
        </div>
      )}

      {/* Feedback Form */}
      {showFeedbackForm && (
        <div style={styles.feedbackForm}>
          <label style={styles.label}>
            What would you like to change?
          </label>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Describe the changes you'd like to see..."
            style={styles.textarea}
            disabled={isLoading}
          />
          <div style={styles.formButtons}>
            <button
              onClick={() => {
                setShowFeedbackForm(false);
                setFeedbackText("");
              }}
              disabled={isLoading}
              style={styles.cancelButton}
            >
              Cancel
            </button>
            <button
              onClick={handleRejectClick}
              disabled={!feedbackText.trim() || isLoading}
              style={{
                ...styles.submitButton,
                ...((!feedbackText.trim() || isLoading) && styles.disabled),
              }}
            >
              {isLoading ? "Submitting..." : "Submit Feedback"}
            </button>
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
    backgroundColor: "rgba(45, 36, 29, 0.03)",
    borderRadius: "8px",
    borderLeft: "4px solid rgba(45, 36, 29, 0.1)",
    marginTop: "24px",
  },
  statusGroup: {
    display: "flex" as const,
    gap: "8px",
  },
  statusBadge: {
    display: "inline-flex" as const,
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    backgroundColor: "#dcfce7",
    color: "#166534",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
  },
  statusBadgeRejected: {
    display: "inline-flex" as const,
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    backgroundColor: "#fee2e2",
    color: "#991b1b",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
  },
  statusBadgePending: {
    display: "inline-flex" as const,
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    backgroundColor: "#fef3c7",
    color: "#92400e",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
  },
  statusIcon: {
    fontSize: "14px",
  },
  feedbackBox: {
    padding: "12px",
    backgroundColor: "#fef3c7",
    borderLeft: "3px solid #f59e0b",
    borderRadius: "4px",
  },
  feedbackLabel: {
    margin: "0 0 6px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#92400e",
  },
  feedbackText: {
    margin: 0,
    fontSize: "13px",
    color: "#78350f",
    lineHeight: 1.5,
  },
  buttonGroup: {
    display: "flex" as const,
    gap: "12px",
    flexWrap: "wrap" as const,
  },
  button: {
    padding: "8px 16px",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  approveButton: {
    backgroundColor: "#16a34a",
    color: "white",
  },
  rejectButton: {
    backgroundColor: "#ea580c",
    color: "white",
  },
  regenerateButton: {
    backgroundColor: "transparent",
    color: "#16384f",
    border: "2px solid #16384f",
  },
  editButton: {
    backgroundColor: "transparent",
    color: "#16384f",
    border: "2px solid #16384f",
  },
  disabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  feedbackForm: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "12px",
    padding: "12px",
    backgroundColor: "#fbf6ef",
    borderRadius: "6px",
  },
  label: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#2d241d",
  },
  textarea: {
    padding: "12px",
    border: "1px solid rgba(45, 36, 29, 0.2)",
    borderRadius: "6px",
    fontFamily: "inherit",
    fontSize: "13px",
    lineHeight: 1.5,
    minHeight: "80px",
    resize: "vertical" as const,
  },
  formButtons: {
    display: "flex" as const,
    gap: "12px",
    justifyContent: "flex-end",
  },
  cancelButton: {
    padding: "8px 16px",
    backgroundColor: "transparent",
    color: "#6f6256",
    border: "1px solid rgba(45, 36, 29, 0.2)",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
  },
  submitButton: {
    padding: "8px 16px",
    backgroundColor: "#16a34a",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
  },
};
