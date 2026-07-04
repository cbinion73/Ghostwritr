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

  const handleToggle = () => {
    const newState = !localCollapsed;
    setLocalCollapsed(newState);
    onToggleCollapse?.(newState);
  };

  return (
    <div style={{ ...styles.container, ...(localCollapsed ? styles.containerCollapsed : {}) }}>
      <PromiseWorkflowWatcher slug={slug} />
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
            </div>

            {/* Composer */}
            <div style={styles.composerWrapper}>
              <PromiseComposer slug={slug} />
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
