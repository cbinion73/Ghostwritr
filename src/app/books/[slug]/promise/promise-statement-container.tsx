"use client";

import { useState, useRef, useEffect } from "react";
import type { PromiseBrief } from "@/lib/promise-types";
import { ApprovalButtons, type ApprovalStatus } from "./approval-buttons";
import { submitPromiseMessage, generatePromiseFromSetupAction } from "./actions";

interface PromiseStatementContainerProps {
  slug: string;
  promise?: PromiseBrief;
  isGenerating?: boolean;
  approvalStatus?: ApprovalStatus;
  approvalFeedback?: string;
  onApprove: (sectionId: string) => void;
  onReject: (sectionId: string, feedback: string) => void;
  onRegenerate: (sectionId: string) => void;
  onGeneratingStatusChange?: (isGenerating: boolean) => void;
  onPromiseChange?: (value: string) => void;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
}

export default function PromiseStatementContainer({
  slug,
  promise,
  isGenerating = false,
  approvalStatus = "pending",
  approvalFeedback,
  onApprove,
  onReject,
  onRegenerate,
  onGeneratingStatusChange,
  onPromiseChange,
  messages = [],
}: PromiseStatementContainerProps) {
  const [promiseText, setPromiseText] = useState(promise?.promiseStatement || "");
  const [chatMessages, setChatMessages] = useState(messages);
  const [inputValue, setInputValue] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Update chat messages from props
  useEffect(() => {
    setChatMessages(messages);
  }, [messages]);

  useEffect(() => {
    setPromiseText(promise?.promiseStatement || "");
  }, [promise?.promiseStatement]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleAutoGenerate = async () => {
    setIsAutoGenerating(true);
    onGeneratingStatusChange?.(true);
    try {
      const result = await generatePromiseFromSetupAction(slug);
      if (result?.promiseStatement) {
        setPromiseText(result.promiseStatement);
        onPromiseChange?.(result.promiseStatement);
      }
    } catch (error) {
      console.error("Failed to generate promise:", error);
      alert("Failed to generate promise. Check console for details.");
    } finally {
      setIsAutoGenerating(false);
      onGeneratingStatusChange?.(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isSendingMessage) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsSendingMessage(true);

    // Add user message to chat
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const formData = new FormData();
      formData.append("message", userMessage);
      await submitPromiseMessage(slug, formData);

      // Re-fetch messages from server (in a real app, you'd get the response directly)
      // For now, we rely on parent to update messages
    } catch (error) {
      console.error("Failed to send message:", error);
      alert("Failed to send message. Check console for details.");
    } finally {
      setIsSendingMessage(false);
    }
  };

  const styles = {
    container: {
      display: "grid" as const,
      gridTemplateRows: "auto 1fr auto auto",
      gap: "0",
      height: "100%",
      overflow: "hidden" as const,
    } as const,
    header: {
      padding: "24px",
      borderBottom: "1px solid rgba(45, 36, 29, 0.1)",
    } as const,
    title: {
      fontSize: "20px",
      fontWeight: 700,
      color: "#2d241d",
      margin: "0 0 12px",
    } as const,
    description: {
      fontSize: "14px",
      color: "#6f6256",
      margin: 0,
      lineHeight: 1.6,
    } as const,
    documentSection: {
      display: "grid" as const,
      gap: "16px",
      padding: "24px",
      overflowY: "auto" as const,
      backgroundColor: "rgba(255, 255, 255, 0.5)",
    } as const,
    documentBox: {
      padding: "24px",
      backgroundColor: "white",
      border: "1px solid rgba(45, 36, 29, 0.1)",
      borderRadius: "8px",
      lineHeight: 1.8,
      display: "grid" as const,
      gap: "12px",
    } as const,
    promiseTextarea: {
      padding: "12px",
      fontFamily: "inherit",
      fontSize: "15px",
      color: "#2d241d",
      border: "1px solid rgba(45, 36, 29, 0.1)",
      borderRadius: "4px",
      minHeight: "200px",
      resize: "vertical" as const,
      lineHeight: 1.8,
    } as const,
    promiseText: {
      fontSize: "15px",
      color: "#2d241d",
      margin: 0,
    } as const,
    chatSection: {
      display: "grid" as const,
      gridTemplateRows: "1fr auto",
      gap: "0",
      borderTop: "1px solid rgba(45, 36, 29, 0.1)",
      backgroundColor: "rgba(255, 255, 255, 0.3)",
      minHeight: "300px",
    } as const,
    messagesContainer: {
      display: "grid" as const,
      gap: "12px",
      padding: "16px",
      overflowY: "auto" as const,
      fontSize: "14px",
    } as const,
    message: {
      padding: "12px 16px",
      borderRadius: "8px",
      lineHeight: 1.6,
    } as const,
    userMessage: {
      backgroundColor: "rgba(22, 163, 74, 0.1)",
      borderLeft: "4px solid #16a34a",
      color: "#2d241d",
    } as const,
    assistantMessage: {
      backgroundColor: "rgba(59, 44, 31, 0.05)",
      borderLeft: "4px solid #8f6d32",
      color: "#2d241d",
    } as const,
    inputSection: {
      padding: "16px",
      borderTop: "1px solid rgba(45, 36, 29, 0.1)",
      backgroundColor: "white",
    } as const,
    form: {
      display: "grid" as const,
      gridTemplateColumns: "1fr auto",
      gap: "8px",
    } as const,
    input: {
      padding: "10px 12px",
      borderRadius: "6px",
      border: "1px solid rgba(45, 36, 29, 0.2)",
      fontFamily: "inherit",
      fontSize: "14px",
      color: "#2d241d",
    } as const,
    sendButton: {
      padding: "10px 16px",
      borderRadius: "6px",
      backgroundColor: "#16384f",
      color: "white",
      border: "none",
      fontSize: "14px",
      fontWeight: 600,
      cursor: "pointer",
      transition: "opacity 0.2s",
    } as const,
    sendButtonDisabled: {
      opacity: 0.5,
      cursor: "not-allowed",
    } as const,
    approvalSection: {
      display: "grid" as const,
      gap: "16px",
      padding: "16px",
      backgroundColor: "rgba(255, 255, 255, 0.5)",
      borderTop: "1px solid rgba(45, 36, 29, 0.1)",
    } as const,
    placeholderMessage: {
      fontSize: "14px",
      color: "rgba(59, 44, 31, 0.6)",
      fontStyle: "italic" as const,
      textAlign: "center" as const,
      padding: "12px",
    } as const,
    generateButton: {
      padding: "10px 16px",
      borderRadius: "6px",
      backgroundColor: "#f59e0b",
      color: "white",
      border: "none",
      fontSize: "14px",
      fontWeight: 600,
      cursor: "pointer",
      transition: "opacity 0.2s",
      marginTop: "12px",
    } as const,
    generateButtonDisabled: {
      opacity: 0.5,
      cursor: "not-allowed",
    } as const,
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Promise Statement</h2>
        <p style={styles.description}>
          Review the AI-generated promise statement below. Chat with the AI to refine it until you're satisfied, then approve to move to the next step.
        </p>
      </div>

      {/* Promise Document */}
      <div style={styles.documentSection}>
        <div style={styles.documentBox}>
          <textarea
            value={promiseText}
            onChange={(e) => {
              setPromiseText(e.target.value);
              onPromiseChange?.(e.target.value);
            }}
            placeholder={isAutoGenerating ? "Generating promise statement..." : "Promise statement will appear here..."}
            style={styles.promiseTextarea}
            disabled={isAutoGenerating || isGenerating}
          />
          {!promiseText && (
            <button
              onClick={handleAutoGenerate}
              disabled={isAutoGenerating || isGenerating}
              style={{
                ...styles.generateButton,
                ...(isAutoGenerating || isGenerating ? styles.generateButtonDisabled : {}),
              }}
            >
              {isAutoGenerating ? "Generating..." : "Generate from Setup"}
            </button>
          )}
        </div>
      </div>

      {/* Chat Interface */}
      <div style={styles.chatSection}>
        <div style={styles.messagesContainer}>
          {chatMessages.length === 0 ? (
            <p style={styles.placeholderMessage}>
              Chat with the AI to refine the promise statement
            </p>
          ) : (
            chatMessages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.message,
                  ...(msg.role === "user" ? styles.userMessage : styles.assistantMessage),
                }}
              >
                {msg.content}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSendMessage} style={styles.inputSection}>
          <div style={styles.form}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask the AI to refine the promise (e.g., 'Make it more concise' or 'Add focus on leadership')..."
              style={styles.input}
              disabled={isSendingMessage || !promiseText}
            />
            <button
              type="submit"
              style={{
                ...styles.sendButton,
                ...(isSendingMessage || !promiseText ? styles.sendButtonDisabled : {}),
              }}
              disabled={isSendingMessage || !promiseText}
            >
              {isSendingMessage ? "..." : "Send"}
            </button>
          </div>
        </form>
      </div>

      {/* Approval Section */}
      <div style={styles.approvalSection}>
        <ApprovalButtons
          sectionId="promise-statement"
          status={approvalStatus}
          feedback={approvalFeedback}
          onApprove={onApprove}
          onReject={onReject}
          onRegenerate={onRegenerate}
          isLoading={isGenerating}
        />
      </div>
    </div>
  );
}
