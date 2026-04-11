"use client";

import { useState, useEffect } from "react";
import { PromiseComposer } from "./promise-composer";
import type { PromiseMessage } from "@/lib/promise-types";

interface CollapsibleConversationPanelProps {
  slug: string;
  messages: PromiseMessage[];
}

export function CollapsibleConversationPanel({
  slug,
  messages,
}: CollapsibleConversationPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(messages.length > 0);

  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      setHasUnread(true);
    }
  }, [messages.length, isOpen]);

  return (
    <>
      {/* Chat bubble indicator when panel is closed */}
      {!isOpen && hasUnread && (
        <button
          onClick={() => setIsOpen(true)}
          style={styles.chatBubble}
          title="You have new messages"
        >
          <span style={styles.bubbleDot} />
        </button>
      )}

      {/* Collapsible panel */}
      <div style={{ ...styles.panelContainer, transform: isOpen ? "translateX(0)" : "translateX(100%)" }}>
        <div style={styles.panel}>
          {/* Header */}
          <div style={styles.header}>
            <h3 style={styles.title}>Refine Promise</h3>
            <button
              onClick={() => setIsOpen(false)}
              style={styles.closeButton}
              aria-label="Close conversation panel"
            >
              ✕
            </button>
          </div>

          {/* Conversation thread */}
          <div style={styles.conversationThread}>
            {messages.length === 0 ? (
              <div style={styles.emptyState}>
                <p style={styles.emptyText}>
                  Start refining your promise by sharing ideas, objections, or directions for change.
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  style={{
                    ...styles.message,
                    ...(message.role === "user" ? styles.userMessage : styles.assistantMessage),
                  }}
                >
                  {message.content}
                </div>
              ))
            )}
          </div>

          {/* Composer */}
          <div style={styles.composerWrapper}>
            <PromiseComposer slug={slug} />
          </div>
        </div>

        {/* Backdrop when open */}
        {isOpen && (
          <div
            style={styles.backdrop}
            onClick={() => setIsOpen(false)}
          />
        )}
      </div>
    </>
  );
}

const styles = {
  panelContainer: {
    position: "fixed" as const,
    top: 0,
    right: 0,
    width: "100%",
    maxWidth: "420px",
    height: "100vh",
    display: "flex",
    transition: "transform 0.3s ease-out",
    zIndex: 100,
  },
  backdrop: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    zIndex: -1,
  },
  panel: {
    display: "flex",
    flexDirection: "column" as const,
    width: "100%",
    backgroundColor: "var(--panel, #fefbf5)",
    borderLeft: "1px solid rgba(45, 36, 29, 0.1)",
    boxShadow: "-4px 0 12px rgba(0, 0, 0, 0.1)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(45, 36, 29, 0.1)",
    backgroundColor: "var(--paper, #fbf6ef)",
  },
  title: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--ink, #2d241d)",
  },
  closeButton: {
    background: "none",
    border: "none",
    fontSize: "20px",
    cursor: "pointer",
    color: "var(--muted, #6f6256)",
    padding: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 0.2s",
  },
  conversationThread: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  message: {
    padding: "12px 14px",
    borderRadius: "8px",
    lineHeight: 1.5,
    fontSize: "14px",
  },
  userMessage: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    backgroundColor: "var(--accent, #16384f)",
    color: "white",
  },
  assistantMessage: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    backgroundColor: "var(--paper, #fbf6ef)",
    color: "var(--ink, #2d241d)",
    borderLeft: "3px solid var(--gold, #8f6d32)",
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: "20px",
    textAlign: "center" as const,
  },
  emptyText: {
    color: "var(--muted, #6f6256)",
    fontSize: "14px",
    lineHeight: 1.6,
    margin: 0,
  },
  composerWrapper: {
    borderTop: "1px solid rgba(45, 36, 29, 0.1)",
    padding: "16px",
    backgroundColor: "var(--paper, #fbf6ef)",
  },
  chatBubble: {
    position: "fixed" as const,
    bottom: "32px",
    right: "32px",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    backgroundColor: "var(--accent, #16384f)",
    border: "none",
    boxShadow: "0 4px 12px rgba(22, 56, 79, 0.3)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99,
    transition: "transform 0.2s",
  },
  bubbleDot: {
    width: "12px",
    height: "12px",
    backgroundColor: "#ff6b6b",
    borderRadius: "50%",
    display: "block",
    animation: "pulse 2s ease-in-out infinite",
  },
};

// Add animation keyframes via a style tag
const animationStyles = `
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
  }
`;

if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = animationStyles;
  document.head.appendChild(style);
}
