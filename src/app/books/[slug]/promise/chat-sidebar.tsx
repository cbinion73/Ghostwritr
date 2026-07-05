"use client";

import { useState } from "react";
import { PromiseComposer } from "./promise-composer";
import { PromiseWorkflowWatcher } from "./promise-workflow-watcher";
import type { PromiseMessage } from "@/lib/promise-types";

interface ChatSidebarProps {
  slug: string;
  messages: PromiseMessage[];
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

export function ChatSidebar({
  slug,
  messages,
  isCollapsed = false,
  onToggleCollapse,
}: ChatSidebarProps) {
  const [localCollapsed, setLocalCollapsed] = useState(isCollapsed);
  const [armed, setArmed] = useState<{ armedFor: number; baselineCount: number } | null>(null);

  const handleToggle = () => {
    const newState = !localCollapsed;
    setLocalCollapsed(newState);
    onToggleCollapse?.(newState);
  };

  // The reply arrived once the transcript actually grew past where it stood
  // when this submission was armed — the same signal the watcher itself
  // stops on, so the indicator and the auto-refresh always agree.
  const isWaitingForReply = armed != null && messages.length <= armed.baselineCount;

  return (
    <div style={{ ...styles.container, ...(localCollapsed ? styles.containerCollapsed : {}) }}>
      <PromiseWorkflowWatcher
        slug={slug}
        messageCount={messages.length}
        armedFor={armed?.armedFor ?? null}
      />
      <div style={styles.sidebar}>
        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.title}>Refine</h3>
          <button
            onClick={handleToggle}
            style={styles.collapseButton}
            title={localCollapsed ? "Expand" : "Collapse"}
          >
            {localCollapsed ? "→" : "←"}
          </button>
        </div>

        {!localCollapsed && (
          <>
            {/* Messages */}
            <div style={styles.messagesContainer}>
              {messages.length === 0 ? (
                <div style={styles.emptyState}>
                  <p style={styles.emptyText}>
                    Share ideas, refinements, or directions to evolve your promise.
                  </p>
                </div>
              ) : (
                <div style={styles.messages}>
                  {messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      style={{
                        ...styles.message,
                        ...(message.role === "user" ? styles.userMessage : styles.assistantMessage),
                      }}
                    >
                      {message.content}
                    </div>
                  ))}
                </div>
              )}
              {isWaitingForReply && (
                <div style={styles.thinking}>
                  <span style={styles.thinkingDot} />
                  Reading your message and updating the promise…
                </div>
              )}
            </div>

            {/* Composer */}
            <div style={styles.composerWrapper}>
              <PromiseComposer
                slug={slug}
                onSubmitted={() =>
                  setArmed({ armedFor: Date.now(), baselineCount: messages.length })
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: "360px",
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    backgroundColor: "var(--panel, #fefbf5)",
    borderLeft: "1px solid rgba(45, 36, 29, 0.1)",
    transition: "width 0.3s ease-out",
    overflow: "hidden",
  },
  containerCollapsed: {
    width: "60px",
  },
  sidebar: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    width: "360px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px",
    borderBottom: "1px solid rgba(45, 36, 29, 0.1)",
    backgroundColor: "var(--paper, #fbf6ef)",
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--ink, #2d241d)",
  },
  collapseButton: {
    background: "none",
    border: "none",
    fontSize: "18px",
    cursor: "pointer",
    color: "var(--muted, #6f6256)",
    padding: "4px 8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 0.2s",
  },
  messagesContainer: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: "20px",
    textAlign: "center" as const,
  },
  thinking: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    alignSelf: "flex-start",
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "12.5px",
    fontStyle: "italic",
    color: "var(--muted, #6f6256)",
    backgroundColor: "var(--paper, #fbf6ef)",
  },
  thinkingDot: {
    display: "inline-block",
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    backgroundColor: "var(--gold, #8f6d32)",
    animation: "ghostwritr-pulse 1.4s ease-in-out infinite",
  },
  emptyText: {
    color: "var(--muted, #6f6256)",
    fontSize: "13px",
    lineHeight: 1.5,
    margin: 0,
  },
  messages: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  message: {
    padding: "12px 14px",
    borderRadius: "8px",
    lineHeight: 1.5,
    fontSize: "13px",
    wordWrap: "break-word" as const,
  },
  userMessage: {
    alignSelf: "flex-end",
    maxWidth: "90%",
    backgroundColor: "var(--accent, #16384f)",
    color: "white",
  },
  assistantMessage: {
    alignSelf: "flex-start",
    maxWidth: "90%",
    backgroundColor: "var(--paper, #fbf6ef)",
    color: "var(--ink, #2d241d)",
    borderLeft: "3px solid var(--gold, #8f6d32)",
  },
  composerWrapper: {
    borderTop: "1px solid rgba(45, 36, 29, 0.1)",
    padding: "16px",
    backgroundColor: "var(--paper, #fbf6ef)",
    flexShrink: 0,
  },
};
