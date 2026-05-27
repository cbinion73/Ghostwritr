"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StageKey, StageStatus } from "@prisma/client";
import { getAgentForStage } from "@/lib/ui/agent-personas";
import { STAGE_STATE_DISPLAY } from "@/lib/ui/stage-tokens";
import { SourceDocsTray } from "./source-docs-tray";

type ChatMessage = {
  role: "user" | "agent";
  content: string;
  streaming?: boolean;
};

type ArtifactDraft = {
  type: string;
  title: string;
  content: string;
};

type DossierChapter = {
  title: string;
  status: "saved" | "pending";
};

type DossierData = {
  dossiers: Array<{ id: string; title: string }>;
  outlineContent: string | null;
};

interface AgentChatPanelProps {
  slug: string;
  stageKey: StageKey;
  stageLabel: string;
  stageRoute: string;
  status: StageStatus;
  artifactCount: number;
  bookTitle: string;
  committedContent?: string | null;
  onStageAdvance?: (key: StageKey) => void;
  /** Dossier mode: save individual dossiers without committing the whole stage */
  dossierMode?: boolean;
  /** Persist chat history to DB so conversation survives page refreshes */
  persistChat?: boolean;
}

export function AgentChatPanel({
  slug,
  stageKey,
  stageLabel,
  stageRoute,
  status,
  artifactCount,
  bookTitle,
  committedContent,
  onStageAdvance,
  dossierMode = false,
  persistChat = false,
}: AgentChatPanelProps) {
  const router = useRouter();
  const persona = getAgentForStage(stageKey);
  const stateDisplay = STAGE_STATE_DISPLAY[status];

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [artifact, setArtifact] = useState<ArtifactDraft | null>(null);
  const [artifactExpanded, setArtifactExpanded] = useState(false);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [autoRunFailed, setAutoRunFailed] = useState(false);
  const [savedDossierCount, setSavedDossierCount] = useState(artifactCount);
  const [dossierChapters, setDossierChapters] = useState<DossierChapter[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [autoPolishActive, setAutoPolishActive] = useState(false);
  const [autoPolishCount, setAutoPolishCount] = useState(0);
  const autoRunFiredRef = useRef(false);
  const autoPolishRef = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Save chat history to DB (non-blocking, best-effort)
  const persistMessages = (msgs: ChatMessage[]) => {
    if (!persistChat) return;
    const toSave = msgs
      .filter((m) => !m.streaming)
      .map(({ role, content }) => ({ role, content }));
    fetch(`/api/books/${slug}/agent-chat/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageKey, messages: toSave }),
    }).catch((err: unknown) => {
      console.warn("[AgentChatPanel] History save failed:", err);
    });
  };

  // Load persisted history on mount, or show intro if none exists
  useEffect(() => {
    if (!persistChat) {
      const intro = persona.intro(bookTitle, status, artifactCount);
      setMessages([{ role: "agent", content: intro }]);
      setHistoryLoaded(true);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/books/${slug}/agent-chat/history?stageKey=${stageKey}`);
        if (res.ok) {
          const data = await res.json() as { messages: ChatMessage[] };
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
            setHistoryLoaded(true);
            return;
          }
        }
      } catch { /* fall through to intro */ }
      // No persisted history — show intro
      const intro = persona.intro(bookTitle, status, artifactCount);
      setMessages([{ role: "agent", content: intro }]);
      setHistoryLoaded(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset messages and show intro when stage changes (non-persisted panels only)
  useEffect(() => {
    if (persistChat) return; // persisted panels never reset on stageKey change
    const intro = persona.intro(bookTitle, status, artifactCount);
    setMessages([{ role: "agent", content: intro }]);
    setDraft("");
    setArtifact(null);
    setArtifactExpanded(false);
    setIsAutoRunning(false);
    setAutoRunFailed(false);
    autoRunFiredRef.current = false;
    setSavedDossierCount(artifactCount);
  }, [stageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep saved dossier count in sync with artifactCount prop
  useEffect(() => {
    setSavedDossierCount(artifactCount);
  }, [artifactCount]);

  // Fetch dossier chapter progress when in dossier mode
  const fetchDossierProgress = async () => {
    if (!dossierMode) return;
    try {
      const res = await fetch(`/api/books/${slug}/agent-chat/dossiers`);
      if (!res.ok) return;
      const data = await res.json() as DossierData;
      const savedTitles = new Set(data.dossiers.map((d) => d.title.toLowerCase()));
      const chapters = parseOutlineChapters(data.outlineContent ?? "");
      setDossierChapters(
        chapters.map((title) => ({
          title,
          status: savedTitles.has(title.toLowerCase()) ? "saved" : "pending",
        }))
      );
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    void fetchDossierProgress();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, dossierMode]);

  // Auto-run: when stage is IN_PROGRESS with no prior artifact, draft autonomously.
  // BOOK_SETUP and PERSONAL_STORIES are conversational — greet the author first.
  useEffect(() => {
    if (
      stageKey !== "BOOK_SETUP" &&
      stageKey !== "RESEARCH" &&
      stageKey !== "PERSONAL_STORIES" &&
      status === "IN_PROGRESS" &&
      artifactCount === 0 &&
      !isAutoRunning &&
      !autoRunFailed &&
      !autoRunFiredRef.current
    ) {
      autoRunFiredRef.current = true;
      setIsAutoRunning(true);
      void runAutonomously();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, artifactCount, stageKey]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? draft).trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const snapshotMessages = [...messages, userMsg];
    setMessages([...snapshotMessages, { role: "agent", content: "", streaming: true }]);
    setDraft("");
    setIsSending(true);

    // placeholder is at index snapshotMessages.length (after user msg)
    const placeholderIdx = snapshotMessages.length;

    let latestParsedArtifact: ArtifactDraft | null = null;

    try {
      const webSearchStages = new Set(["RESEARCH", "EXTERNAL_STORIES"]);
      const apiUrl = stageKey === "RESEARCH"
        ? `/api/books/${slug}/scout-research`
        : stageKey === "EXTERNAL_STORIES"
          ? `/api/books/${slug}/chronicle-stories`
          : `/api/books/${slug}/agent-chat`;
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          webSearchStages.has(stageKey)
            ? {
                messages: snapshotMessages.map((m) => ({
                  role: m.role === "agent" ? "assistant" : "user",
                  content: m.content,
                })),
              }
            : {
                stageKey,
                // Always use polish mode during auto-polish loop so Reed uses Opus
                polishMode: autoPolishRef.current || undefined,
                messages: snapshotMessages.map((m) => ({
                  role: m.role === "agent" ? "assistant" : "user",
                  content: m.content,
                })),
              }
        ),
      });

      if (!res.ok || !res.body) {
        throw new Error(`${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const { text: t } = JSON.parse(raw) as { text: string };
            accumulated += t;

            // Check for ARTIFACT block
            const artStart = accumulated.indexOf("<ARTIFACT>");
            const artEnd = accumulated.indexOf("</ARTIFACT>");
            if (artStart !== -1 && artEnd !== -1) {
              const jsonStr = accumulated.slice(artStart + 10, artEnd).trim();
              let parsed: ArtifactDraft | null = null;

              // First try standard JSON.parse
              try {
                parsed = JSON.parse(jsonStr) as ArtifactDraft;
              } catch { /* fall through to manual extraction */ }

              // Fallback: manually extract fields — handles unescaped newlines in content
              // (common in large artifacts like Reed's 10-section editorial review)
              if (!parsed) {
                const typeMatch  = jsonStr.match(/"type"\s*:\s*"([^"]+)"/);
                const titleMatch = jsonStr.match(/"title"\s*:\s*"([^"]+)"/);
                const contentMatch = jsonStr.match(/"content"\s*:\s*"([\s\S]+?)"\s*\}\s*$/);
                if (typeMatch && titleMatch && contentMatch?.[1]) {
                  parsed = {
                    type: typeMatch[1],
                    title: titleMatch[1],
                    content: contentMatch[1]
                      .replace(/\\n/g, "\n")
                      .replace(/\\"/g, '"')
                      .replace(/\\\\/g, "\\")
                      .replace(/\\t/g, "\t"),
                  };
                }
              }

              if (parsed) {
                setArtifact(parsed);
                latestParsedArtifact = parsed;
              }
            }

            // Strip ARTIFACT block from displayed text
            const displayText = accumulated
              .replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "")
              .trim();

            setMessages((prev) => {
              const next = [...prev];
              next[placeholderIdx] = { role: "agent", content: displayText, streaming: true };
              return next;
            });
          } catch {
            // non-JSON line, skip
          }
        }
      }

      const finalDisplay = accumulated
        .replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "")
        .trim();

      setMessages((prev) => {
        const next = [...prev];
        next[placeholderIdx] = { role: "agent", content: finalDisplay, streaming: false };
        persistMessages(next);
        return next;
      });

      // Auto-polish: if active and a MANUSCRIPT_REVISION artifact was produced,
      // commit it automatically and continue to the next chapter.
      if (autoPolishRef.current) {
        if (latestParsedArtifact?.type === "MANUSCRIPT_REVISION") {
          setAutoPolishCount((n) => n + 1);
          setArtifact(null);
          try {
            const commitRes = await fetch(`/api/books/${slug}/agent-chat/commit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ stageKey, artifact: latestParsedArtifact }),
            });
            if (commitRes.ok) {
              router.refresh();
              setTimeout(() => {
                if (autoPolishRef.current) void send("Continue to the next chapter");
              }, 1500);
            } else {
              autoPolishRef.current = false;
              setAutoPolishActive(false);
            }
          } catch {
            autoPolishRef.current = false;
            setAutoPolishActive(false);
          }
        } else {
          // Reed produced no revision artifact — all chapters done (or nothing left)
          autoPolishRef.current = false;
          setAutoPolishActive(false);
          setMessages((prev) => [
            ...prev,
            { role: "agent", content: "✓ Auto-polish complete — all chapters have been revised and committed." },
          ]);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Network error";
      setMessages((prev) => {
        const next = [...prev];
        next[placeholderIdx] = {
          role: "agent",
          content: `Something went wrong (${errMsg}). Try again.`,
          streaming: false,
        };
        return next;
      });
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  // ── Autonomous run: stream "draft artifact" silently, save as REVIEW_READY ──
  const runAutonomously = async () => {
    // Use a unique symbol so we can find and replace this specific streaming message
    // without relying on a stale captured index (which causes undefined holes when
    // the stage advances and messages is reset mid-stream).
    const streamingId = Symbol("streaming");

    setMessages((prev) => [
      ...prev,
      { role: "agent", content: `Working on **${stageLabel}**…`, streaming: true, _id: streamingId } as ChatMessage & { _id: symbol },
    ]);

    const replaceStreaming = (update: ChatMessage) => {
      setMessages((prev) =>
        prev
          .filter((m): m is ChatMessage => m !== undefined)
          .map((m) => ((m as ChatMessage & { _id?: symbol })._id === streamingId ? update : m))
      );
    };

    try {
      const webSearchStages = new Set(["RESEARCH", "EXTERNAL_STORIES"]);
      const autoApiUrl = stageKey === "RESEARCH"
        ? `/api/books/${slug}/scout-research`
        : stageKey === "EXTERNAL_STORIES"
          ? `/api/books/${slug}/chronicle-stories`
          : `/api/books/${slug}/agent-chat`;
      const autoPrompt = stageKey === "RESEARCH"
        ? "Please draft the Research Pack artifact now. Research all chapters in the outline."
        : stageKey === "EXTERNAL_STORIES"
          ? "Please draft the External Story Pack artifact now. Find real-world case studies and anecdotes for all chapters in the outline."
          : "Please draft the artifact for this stage now.";
      const res = await fetch(autoApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          webSearchStages.has(stageKey)
            ? { messages: [{ role: "user", content: autoPrompt }] }
            : { stageKey, messages: [{ role: "user", content: autoPrompt }] }
        ),
      });

      if (!res.ok || !res.body) throw new Error(`${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const { text: t } = JSON.parse(raw) as { text: string };
            accumulated += t;
            const displayText = accumulated.replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim();
            replaceStreaming({ role: "agent", content: displayText || "Working…", streaming: true });
          } catch { /* skip */ }
        }
      }

      // Parse ARTIFACT block
      const artStart = accumulated.indexOf("<ARTIFACT>");
      const artEnd = accumulated.indexOf("</ARTIFACT>");
      if (artStart !== -1 && artEnd !== -1) {
        const jsonStr = accumulated.slice(artStart + 10, artEnd).trim();
        try {
          const parsed = JSON.parse(jsonStr) as ArtifactDraft;
          const saveRes = await fetch(`/api/books/${slug}/agent-chat/save-draft`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stageKey, artifact: parsed }),
          });
          if (saveRes.ok) {
            const displayText = accumulated.replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim();
            replaceStreaming({
              role: "agent",
              content: (displayText || "Draft complete.") + "\n\n**Ready for your review — approve to continue.**",
              streaming: false,
            });
            router.refresh();
            return;
          }
        } catch { /* fall through */ }
      }

      // No ARTIFACT block found — show raw response
      const displayText = accumulated.replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim();
      replaceStreaming({ role: "agent", content: displayText || "Draft complete.", streaming: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      replaceStreaming({
        role: "agent",
        content: `Auto-run failed: ${msg}\n\nYou can retry below or type a message to continue manually.`,
        streaming: false,
      });
      setAutoRunFailed(true);
    } finally {
      setIsAutoRunning(false);
    }
  };

  // ── Retry auto-run after failure ──────────────────────────────────────────
  const handleRetryAutoRun = () => {
    setAutoRunFailed(false);
    autoRunFiredRef.current = false;
    setMessages((prev) => [
      ...prev,
      { role: "agent", content: "Retrying…", streaming: true },
    ]);
    setIsAutoRunning(true);
    void runAutonomously();
  };

  // ── Approve existing REVIEW_READY draft ────────────────────────────────────
  const handleApprove = async () => {
    try {
      const res = await fetch(`/api/books/${slug}/agent-chat/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageKey }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { nextStageKey } = await res.json() as { nextStageKey: StageKey | null };
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: "Approved — moving to the next stage." },
      ]);
      router.refresh();
      if (nextStageKey && onStageAdvance) {
        setTimeout(() => onStageAdvance(nextStageKey), 400);
      }
    } catch (err) {
      alert(`Approve failed: ${err instanceof Error ? err.message : "Error"}`);
    }
  };

  // ── Auto-polish: Reed reviews and commits every chapter automatically ─────
  const startAutoPolish = () => {
    autoPolishRef.current = true;
    setAutoPolishActive(true);
    setAutoPolishCount(0);
    void send("Please begin your editorial pass. Review and revise the first chapter that still needs attention, producing a MANUSCRIPT_REVISION artifact.");
  };

  const stopAutoPolish = () => {
    autoPolishRef.current = false;
    setAutoPolishActive(false);
    setMessages((prev) => [
      ...prev,
      { role: "agent", content: "Auto-polish paused. You can continue manually or click Auto-Polish All to resume." },
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const handleDraftArtifact = () => {
    void send("Please draft the artifact for this stage now.");
  };

  const handleCommitArtifact = async () => {
    if (!artifact) return;
    try {
      const res = await fetch(`/api/books/${slug}/agent-chat/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageKey, artifact }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `${res.status}`);
      }
      const { nextStageKey } = await res.json() as { nextStageKey: StageKey | null };
      setArtifact(null);
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: "Committed — stage locked in." },
      ]);
      router.refresh();
      if (nextStageKey && onStageAdvance) {
        setTimeout(() => onStageAdvance(nextStageKey), 400);
      }
    } catch (err) {
      alert(`Failed to commit: ${err instanceof Error ? err.message : "Error"}`);
    }
  };

  // ── Dossier mode: save one chapter dossier without committing the stage ──────
  const handleSaveDossier = async () => {
    if (!artifact) return;
    try {
      const res = await fetch(`/api/books/${slug}/agent-chat/save-dossier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageKey, artifact }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { savedCount } = await res.json() as { savedCount: number };
      setSavedDossierCount(savedCount);
      setArtifact(null);
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: `Dossier saved (${savedCount} total). Ready for the next chapter — or commit the stage when all chapters are done.`,
        },
      ]);
      void fetchDossierProgress();
      router.refresh();
    } catch (err) {
      alert(`Failed to save dossier: ${err instanceof Error ? err.message : "Error"}`);
    }
  };

  // ── Dossier mode: commit the whole stage after all dossiers are saved ────────
  const handleCommitStage = async () => {
    try {
      const res = await fetch(`/api/books/${slug}/agent-chat/commit-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageKey }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { nextStageKey } = await res.json() as { nextStageKey: StageKey | null };
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: `All ${savedDossierCount} dossiers committed — moving to the next stage.` },
      ]);
      router.refresh();
      if (nextStageKey && onStageAdvance) {
        setTimeout(() => onStageAdvance(nextStageKey), 400);
      }
    } catch (err) {
      alert(`Failed to commit stage: ${err instanceof Error ? err.message : "Error"}`);
    }
  };

  return (
    <div style={panelStyle}>
      {/* Dossier checklist — right sidebar, only in dossier mode */}
      {dossierMode && dossierChapters.length > 0 && (
        <DossierChecklist chapters={dossierChapters} savedCount={savedDossierCount} />
      )}

      {/* Main chat column */}
      <div style={chatColumnStyle}>
      {/* Agent header */}
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ ...avatarStyle, background: persona.color }}>
            {persona.icon}
          </div>
          <div>
            <div style={agentNameStyle}>{persona.name}</div>
            <div style={agentTitleStyle}>{persona.title}</div>
          </div>
        </div>
        <div style={headerRightStyle}>
          <div style={stageBadgeStyle}>
            <span style={{ color: stateDisplay.color }}>{stateDisplay.shape}</span>
            <span style={stageBadgeLabelStyle}>{stageLabel} · {stateDisplay.label}</span>
          </div>
          {stageKey === "EDITING" && (
            autoPolishActive ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "#B8793A", fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}>
                  ⟳ Polishing…{autoPolishCount > 0 ? ` (${autoPolishCount} revised)` : ""}
                </span>
                <button style={stopPolishBtnStyle} onClick={stopAutoPolish}>
                  ■ Stop
                </button>
              </div>
            ) : (
              <button
                style={autoPolishBtnStyle}
                onClick={startAutoPolish}
                disabled={isSending}
                title="Reed will automatically review, revise, and commit every chapter"
              >
                ✦ Auto-Polish All
              </button>
            )
          )}
          {dossierMode && savedDossierCount > 0 && (
            <button style={commitStageBtnStyle} onClick={() => void handleCommitStage()}>
              Commit stage ({savedDossierCount} dossier{savedDossierCount !== 1 ? "s" : ""} saved) →
            </button>
          )}
          <Link href={stageRoute} style={openLinkStyle}>
            Open full view →
          </Link>
        </div>
      </div>

      {/* Approval gate — shown when agent has produced a draft awaiting review */}
      {status === "READY_FOR_REVIEW" && committedContent && (
        <div style={approvalGateStyle}>
          <div style={approvalHeaderStyle}>
            <span style={{ color: "#B8793A" }}>●</span>
            <span style={{ flex: 1 }}>Draft ready for your review</span>
            <button style={approveBtnStyle} onClick={() => void handleApprove()}>
              Approve &amp; continue →
            </button>
            <button
              style={requestChangesBtnStyle}
              onClick={() => setArtifactExpanded((v) => !v)}
            >
              {artifactExpanded ? "Hide draft" : "Read draft"}
            </button>
          </div>
          {artifactExpanded && (
            <div style={committedContentStyle}>
              <MarkdownText text={committedContent} />
            </div>
          )}
        </div>
      )}

      {/* Committed artifact viewer — shown for COMMITTED stages */}
      {status === "COMMITTED" && committedContent && (
        <div style={committedBannerStyle}>
          <button
            style={committedBannerToggleStyle}
            onClick={() => setArtifactExpanded((v) => !v)}
          >
            <span style={{ color: "#4a7c59", marginRight: "6px" }}>◆</span>
            Committed artifact
            <span style={{ marginLeft: "auto", opacity: 0.5 }}>{artifactExpanded ? "▲" : "▼"}</span>
          </button>
          {artifactExpanded && (
            <div style={committedContentStyle}>
              <MarkdownText text={committedContent} />
            </div>
          )}
        </div>
      )}

      {/* Message thread */}
      <div ref={threadRef} style={threadStyle}>
        {messages.filter((m): m is ChatMessage => m !== undefined).map((msg, i) => (
          <div
            key={i}
            style={{
              ...messageRowStyle,
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            {msg.role === "agent" && (
              <div style={{ ...smallAvatarStyle, background: persona.color }}>
                {persona.name[0]}
              </div>
            )}
            <div
              style={{
                ...bubbleStyle,
                ...(msg.role === "user" ? userBubbleStyle : agentBubbleStyle),
              }}
            >
              <MarkdownText text={msg.content} />
              {msg.streaming && <span style={cursorStyle}>▍</span>}
            </div>
          </div>
        ))}

        {/* Artifact card — shown above composer, inside thread */}
        {artifact && (
          <ArtifactCard
            artifact={artifact}
            onCommit={dossierMode ? () => void handleSaveDossier() : () => void handleCommitArtifact()}
            commitLabel={dossierMode ? "Save dossier →" : "Commit artifact →"}
            onDismiss={() => setArtifact(null)}
            tall={stageKey === "RESEARCH"}
          />
        )}
      </div>

      {/* Source Documents tray — sits above the composer, available in all stages */}
      <SourceDocsTray slug={slug} />

      {/* Composer */}
      <div style={composerStyle}>
        {autoRunFailed ? (
          <button
            style={retryAutoRunBtnStyle}
            onClick={handleRetryAutoRun}
            title="Retry the autonomous draft"
          >
            ↺ Retry auto-draft
          </button>
        ) : (
          <button
            style={draftArtifactBtnStyle}
            onClick={handleDraftArtifact}
            disabled={isSending}
            title="Ask the agent to draft the artifact for this stage"
          >
            Draft artifact
          </button>
        )}
        <textarea
          ref={inputRef}
          style={textareaStyle}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${persona.name}… (Enter to send, Shift+Enter for new line)`}
          rows={2}
          disabled={isSending}
        />
        <button
          style={{
            ...sendBtnStyle,
            opacity: draft.trim() && !isSending ? 1 : 0.4,
          }}
          disabled={!draft.trim() || isSending}
          onClick={() => void send()}
          aria-label="Send message"
        >
          {isSending ? "…" : "↑"}
        </button>
      </div>
      </div>{/* end chatColumnStyle */}
    </div>
  );
}

// ── ArtifactCard ─────────────────────────────────────────────────────────────

function ArtifactCard({
  artifact,
  onCommit,
  commitLabel = "Commit artifact →",
  onDismiss,
  tall,
}: {
  artifact: ArtifactDraft;
  onCommit: () => void;
  commitLabel?: string;
  onDismiss: () => void;
  tall?: boolean;
}) {
  return (
    <div style={artifactCardStyle}>
      <div style={artifactHeaderStyle}>
        Artifact ready · {artifact.title}
      </div>
      <div style={{ ...artifactPreviewStyle, maxHeight: tall ? "600px" : "320px" }}>
        <MarkdownText text={artifact.content} />
      </div>
      <div style={{ display: "flex", gap: "8px", paddingTop: 4 }}>
        <button style={commitBtnStyle} onClick={onCommit}>
          {commitLabel}
        </button>
        <button style={dismissBtnStyle} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── Outline chapter title parser (mirrors chapter-draft-bmad-panel logic) ────

function parseOutlineChapters(outline: string): string[] {
  if (!outline.trim()) return [];
  const lines = outline.split("\n");
  const titles: string[] = [];

  // Heading-based
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,3}\s/.test(trimmed)) {
      const title = trimmed.replace(/^#{1,3}\s+/, "").trim();
      if (title) titles.push(title);
      continue;
    }
    const boldMatch = trimmed.match(/^\*\*(.{3,80})\*\*\s*$/);
    if (boldMatch && /chapter|part|act|\d/i.test(boldMatch[1])) {
      titles.push(boldMatch[1]);
      continue;
    }
    if (/^Chapter\s+\d+/i.test(trimmed)) {
      titles.push(trimmed);
      continue;
    }
  }

  // Fall back to numbered list items
  if (titles.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].trim().match(/^(\d{1,2})[.)]\s+(.+)$/);
      if (m && !lines[i].startsWith("  ") && !lines[i].startsWith("\t")) {
        titles.push(m[2]);
      }
    }
  }

  return titles;
}

// ── DossierChecklist sidebar ──────────────────────────────────────────────────

function DossierChecklist({
  chapters,
  savedCount,
}: {
  chapters: DossierChapter[];
  savedCount: number;
}) {
  const total = chapters.length;
  const pct = total > 0 ? Math.round((savedCount / total) * 100) : 0;

  return (
    <div style={checklistSidebarStyle}>
      <div style={checklistHeaderStyle}>
        <div style={checklistTitleStyle}>Chapter Dossiers</div>
        <div style={checklistProgressLabelStyle}>{savedCount}/{total} saved</div>
      </div>

      {/* Progress bar */}
      <div style={checklistTrackStyle}>
        <div style={{ ...checklistFillStyle, width: `${pct}%` }} />
      </div>

      {/* Chapter rows */}
      <div style={checklistListStyle}>
        {chapters.map((ch, i) => (
          <div key={i} style={checklistRowStyle}>
            <div style={checklistPipStyle(ch.status)}>
              {ch.status === "saved" ? "✓" : ""}
            </div>
            <div style={checklistChapterTitleStyle(ch.status)}>
              {ch.title}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Minimal markdown renderer: bold (**text**), italic (*text*), line breaks */
function inlineMarkdown(line: string): React.ReactNode[] {
  // Handle **bold** and *italic* inline
  const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={j}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={j}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function MarkdownText({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^#{1,3} /.test(line)) {
      const level = (line.match(/^(#+)/)?.[1].length ?? 1);
      const content = line.replace(/^#+\s+/, "");
      const sizes = ["18px", "15px", "13px"];
      elements.push(
        <div key={i} style={{ fontSize: sizes[level - 1] ?? "13px", fontWeight: 700, marginTop: level === 1 ? 16 : 12, marginBottom: 4, color: "#2a1f14" }}>
          {inlineMarkdown(content)}
        </div>
      );
    } else if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid rgba(45,36,29,0.12)", margin: "10px 0" }} />);
    } else if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: 8 }} />);
    } else if (/^- /.test(line)) {
      elements.push(
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
          <span style={{ color: "#B8793A", flexShrink: 0 }}>•</span>
          <span>{inlineMarkdown(line.slice(2))}</span>
        </div>
      );
    } else {
      elements.push(<p key={i} style={{ margin: "2px 0 6px" }}>{inlineMarkdown(line)}</p>);
    }
    i++;
  }

  return <>{elements}</>;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "row-reverse", // checklist on right, chat on left
  height: "100%",
  background: "#fefbf5",
  overflow: "hidden",
};

const chatColumnStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 24px",
  borderBottom: "1px solid rgba(45,36,29,0.1)",
  background: "rgba(254,251,245,0.95)",
  flexShrink: 0,
};

const avatarStyle: React.CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "20px",
  flexShrink: 0,
};

const agentNameStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 700,
  color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const agentTitleStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8a7a6a",
  letterSpacing: "0.04em",
};

const headerRightStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "4px",
};

const stageBadgeStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  fontSize: "11px",
  color: "#8a7a6a",
};

const stageBadgeLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8a7a6a",
};

const openLinkStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#B8793A",
  textDecoration: "none",
  fontWeight: 500,
};

const commitStageBtnStyle: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: "6px",
  border: "none",
  background: "#4a7c59",
  color: "#fff",
  fontSize: "11px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 600,
};

const threadStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const messageRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "flex-start",
};

const smallAvatarStyle: React.CSSProperties = {
  width: "26px",
  height: "26px",
  borderRadius: "6px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "11px",
  fontWeight: 700,
  color: "#fff",
  flexShrink: 0,
  marginTop: "2px",
};

const bubbleStyle: React.CSSProperties = {
  maxWidth: "72%",
  padding: "10px 14px",
  borderRadius: "12px",
  fontSize: "14px",
  lineHeight: 1.55,
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const agentBubbleStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,36,29,0.1)",
  color: "#2d241d",
  borderTopLeftRadius: "3px",
};

const userBubbleStyle: React.CSSProperties = {
  background: "#2d241d",
  color: "#fefbf5",
  borderTopRightRadius: "3px",
};

const cursorStyle: React.CSSProperties = {
  display: "inline-block",
  animation: "blink 1s step-end infinite",
  color: "#B8793A",
  marginLeft: "2px",
};

const composerStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "flex-end",
  padding: "16px 24px",
  borderTop: "1px solid rgba(45,36,29,0.1)",
  background: "rgba(254,251,245,0.95)",
  flexShrink: 0,
};

const retryAutoRunBtnStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "7px",
  border: "1px solid rgba(192,57,43,0.4)",
  background: "rgba(192,57,43,0.08)",
  color: "#c0392b",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
  alignSelf: "flex-end",
  height: "38px",
};

const draftArtifactBtnStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "7px",
  border: "1px solid rgba(45,36,29,0.2)",
  background: "transparent",
  color: "#6f6256",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
  alignSelf: "flex-end",
  height: "38px",
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1px solid rgba(45,36,29,0.15)",
  background: "#fff",
  fontSize: "14px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  color: "#2d241d",
  resize: "none",
  lineHeight: 1.5,
  outline: "none",
};

const sendBtnStyle: React.CSSProperties = {
  width: "38px",
  height: "38px",
  borderRadius: "8px",
  border: "none",
  background: "#2d241d",
  color: "#fefbf5",
  fontSize: "18px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  transition: "opacity 120ms",
};

// Artifact card styles
const artifactCardStyle: React.CSSProperties = {
  background: "rgba(184,121,58,0.06)",
  border: "1px solid rgba(184,121,58,0.3)",
  borderRadius: "8px",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const artifactHeaderStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#B8793A",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const artifactPreviewStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#4a3e33",
  lineHeight: 1.7,
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  maxHeight: "320px",
  overflowY: "auto",
  borderTop: "1px solid rgba(184,121,58,0.15)",
  borderBottom: "1px solid rgba(184,121,58,0.15)",
  padding: "12px 0",
};

const commitBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "6px",
  border: "none",
  background: "#2d241d",
  color: "#fefbf5",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
};

const dismissBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "6px",
  border: "1px solid rgba(45,36,29,0.2)",
  background: "transparent",
  color: "#6f6256",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
};

const approvalGateStyle: React.CSSProperties = {
  flexShrink: 0,
  borderBottom: "1px solid rgba(184,121,58,0.3)",
  background: "rgba(184,121,58,0.06)",
};

const approvalHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 20px",
  fontSize: "12px",
  color: "#6f6256",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const approveBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "6px",
  border: "none",
  background: "#4a7c59",
  color: "#fff",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
  marginLeft: "auto",
};

const requestChangesBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "6px",
  border: "1px solid rgba(45,36,29,0.2)",
  background: "transparent",
  color: "#6f6256",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const committedBannerStyle: React.CSSProperties = {
  flexShrink: 0,
  borderBottom: "1px solid rgba(74,124,89,0.2)",
  background: "rgba(74,124,89,0.04)",
};

const committedBannerToggleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  padding: "8px 24px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: "12px",
  color: "#6f6256",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  gap: "4px",
};

const committedContentStyle: React.CSSProperties = {
  padding: "12px 24px 16px",
  fontSize: "13px",
  color: "#4a3e33",
  lineHeight: 1.7,
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  maxHeight: "320px",
  overflowY: "auto",
};

// ── Dossier checklist sidebar styles ─────────────────────────────────────────

const checklistSidebarStyle: React.CSSProperties = {
  width: "220px",
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  borderLeft: "1px solid rgba(45,36,29,0.1)",
  background: "rgba(254,251,245,0.7)",
  overflow: "hidden",
};

const checklistHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  padding: "14px 16px 8px",
  flexShrink: 0,
};

const checklistTitleStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#6f6256",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const checklistProgressLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#B8793A",
  fontWeight: 600,
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const checklistTrackStyle: React.CSSProperties = {
  height: "2px",
  background: "rgba(45,36,29,0.08)",
  margin: "0 16px 10px",
  borderRadius: "1px",
  overflow: "hidden",
  flexShrink: 0,
};

const checklistFillStyle: React.CSSProperties = {
  height: "100%",
  background: "#4a7c59",
  borderRadius: "1px",
  transition: "width 400ms ease",
};

const checklistListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "0 0 16px",
};

const checklistRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "8px",
  padding: "5px 16px",
};

function checklistPipStyle(status: DossierChapter["status"]): React.CSSProperties {
  const saved = status === "saved";
  return {
    width: "16px",
    height: "16px",
    borderRadius: "4px",
    flexShrink: 0,
    marginTop: "1px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
    fontWeight: 700,
    background: saved ? "#4a7c59" : "transparent",
    border: saved ? "none" : "1.5px solid rgba(45,36,29,0.2)",
    color: saved ? "#fff" : "transparent",
    transition: "all 250ms ease",
  };
}

const autoPolishBtnStyle: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: "6px",
  border: "1px solid rgba(184,121,58,0.4)",
  background: "rgba(184,121,58,0.1)",
  color: "#B8793A",
  fontSize: "11px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 600,
};

const stopPolishBtnStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: "5px",
  border: "1px solid rgba(192,57,43,0.4)",
  background: "rgba(192,57,43,0.08)",
  color: "#c0392b",
  fontSize: "11px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
};

function checklistChapterTitleStyle(status: DossierChapter["status"]): React.CSSProperties {
  const saved = status === "saved";
  return {
    fontSize: "12px",
    lineHeight: 1.4,
    color: saved ? "#2d241d" : "#9a8a7a",
    fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
    fontWeight: saved ? 500 : 400,
    textDecoration: saved ? "none" : "none",
  };
}
