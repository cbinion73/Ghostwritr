"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { StageKey, StageStatus } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type EditingStatus = "pending" | "editing" | "review" | "committed" | "error";

interface EditedChapter {
  key: string;
  title: string;
  sourceDraftId: string;
  sourceContent: string;
  status: EditingStatus;
  editArtifactId?: string;
  editedContent?: string;
  summaryNotes?: string;
  errorMsg?: string;
}

interface EditingBmadPanelProps {
  slug: string;
  status: StageStatus;
  bookTitle: string;
  onStageAdvance?: (key: StageKey) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EditingBmadPanel({ slug, status, bookTitle, onStageAdvance }: EditingBmadPanelProps) {
  const router = useRouter();
  const [chapters, setChapters] = useState<EditedChapter[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  type ExpandedState = { key: string; mode: "read" | "source" | "edit" | "revise" | "summary" } | null;
  const [expanded, setExpanded] = useState<ExpandedState>(null);
  const [editDraft, setEditDraft] = useState("");
  const [revisePrompt, setRevisePrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [revisingKey, setRevisingKey] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const runningRef = useRef(false);
  const autoApproveRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const chaptersRef = useRef<EditedChapter[]>([]);
  const approveAllRef = useRef<(() => Promise<void>) | null>(null);

  // ── Bootstrap: load chapters ─────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const res = await fetch(`/api/books/${slug}/agent-chat/editing`);
      if (!res.ok) { setInitialized(true); return; }

      const data = await res.json() as {
        chapters: Array<{
          chapterKey: string;
          chapterTitle: string;
          sourceDraftId: string;
          sourceContent: string;
          editArtifactId: string | null;
          editedContent: string | null;
          summaryNotes: string | null;
          editStatus: string | null;
        }>;
        stageStatus: string;
      };

      const merged: EditedChapter[] = data.chapters.map((c) => ({
        key: c.chapterKey,
        title: c.chapterTitle,
        sourceDraftId: c.sourceDraftId,
        sourceContent: c.sourceContent,
        status: c.editArtifactId
          ? (c.editStatus === "COMMITTED" ? "committed" : "review")
          : "pending",
        editArtifactId: c.editArtifactId ?? undefined,
        editedContent: c.editedContent ?? undefined,
        summaryNotes: c.summaryNotes ?? undefined,
      }));

      setChapters(merged);
      setInitialized(true);
    };
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => { chaptersRef.current = chapters; }, [chapters]);

  // Auto-start (silently resuming editing whenever the stage was left
  // IN_PROGRESS) was removed 2026-07-08: a crash mid-run left this stage
  // stuck at IN_PROGRESS with no real generation underway, and simply
  // opening the Editing tab would silently re-fire a real Opus edit pass
  // with no user action. Starting/resuming editing now always requires an
  // explicit click on "Edit chapters" / "Edit full book" / "Retry errors"
  // below.

  // ── Edit a single chapter via SSE ────────────────────────────────────────────
  const editChapter = useCallback(async (
    chapter: EditedChapter,
    abort: AbortController,
  ): Promise<{ editedContent: string; summaryNotes: string } | null> => {
    const prompt = `Edit this chapter for "${bookTitle}".

CHAPTER: ${chapter.title}

CURRENT DRAFT:
${chapter.sourceContent}

Apply your editorial line pass:
1. Voice — remove AI tells, restore natural author voice, vary sentence rhythm
2. Line polish — clarity, active verbs, no throat-clearing, strong paragraph openings
3. Flow — smooth transitions, strong chapter opening hook, strong closing turn

Rules:
- Keep the author's voice, humor, and conviction intact
- Keep all personal stories exactly as written — do not rewrite them
- Keep all framework names and core thesis language intact
- Do not add new content — only refine what is there
- Preserve the chapter's length and depth

Produce the complete polished chapter as a MANUSCRIPT_REVISION artifact. Clean prose only — no editorial notes inside the artifact.

After the artifact, write your "## Reed's Editorial Summary" — 3–6 specific bullets about what you changed and why. Name the specific changes, not generic categories.`;

    const res = await fetch(`/api/books/${slug}/agent-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        stageKey: "EDITING",
        skipContext: true,
        polishMode: true,
        messages: [{ role: "user", content: prompt }],
        chapterContext: chapter.title,
      }),
    });

    if (!res.ok || !res.body) throw new Error(`Stream error ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break outer;
        try {
          const { text } = JSON.parse(raw) as { text: string };
          accumulated += text;
          // Show live streaming (strip artifact block for display)
          const displayText = accumulated
            .replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "")
            .replace(/## Reed's Editorial Summary[\s\S]*/g, "")
            .trim();
          setChapters((prev) =>
            prev.map((c) => c.key === chapter.key ? { ...c, editedContent: displayText || undefined } : c)
          );
        } catch { /* skip */ }
      }
    }

    // Extract ARTIFACT content
    const artStart = accumulated.indexOf("<ARTIFACT>");
    const artEnd = accumulated.indexOf("</ARTIFACT>");
    let extractedContent: string | null = null;

    if (artStart !== -1 && artEnd !== -1) {
      const jsonStr = accumulated.slice(artStart + 10, artEnd).trim();
      try {
        const parsed = JSON.parse(jsonStr) as { content: string };
        if (parsed.content && parsed.content.split(/\s+/).length > 100) extractedContent = parsed.content;
      } catch {
        const m = jsonStr.match(/"content"\s*:\s*"([\s\S]+)"\s*\}\s*$/);
        if (m?.[1]) {
          const raw = m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
          if (raw.split(/\s+/).length > 100) extractedContent = raw;
        }
      }
    }

    // Fallback: raw text before summary
    if (!extractedContent) {
      const summaryIdx = accumulated.indexOf("## Reed's Editorial Summary");
      const prose = (summaryIdx !== -1 ? accumulated.slice(0, summaryIdx) : accumulated)
        .replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim();
      if (prose.split(/\s+/).length > 100) extractedContent = prose;
    }

    if (!extractedContent) return null;

    // Extract Reed's Editorial Summary (after </ARTIFACT> or after prose)
    const summaryMatch = accumulated.match(/## Reed's Editorial Summary[\s\S]*/);
    const summaryNotes = summaryMatch
      ? summaryMatch[0].replace(/^## Reed's Editorial Summary\s*/m, "").trim()
      : "";

    return { editedContent: extractedContent, summaryNotes };
  }, [slug, bookTitle]);

  // ── Save editing result to DB ─────────────────────────────────────────────────
  const saveEdit = useCallback(async (
    chapter: EditedChapter,
    editedContent: string,
    summaryNotes: string,
  ): Promise<string | null> => {
    if (chapter.editArtifactId) {
      // Update existing
      await fetch(`/api/books/${slug}/agent-chat/editing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editArtifactId: chapter.editArtifactId,
          editedContent,
          summaryNotes,
          sourceDraftId: chapter.sourceDraftId,
        }),
      });
      return chapter.editArtifactId;
    } else {
      const res = await fetch(`/api/books/${slug}/agent-chat/editing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterKey: chapter.key,
          chapterTitle: chapter.title,
          editedContent,
          summaryNotes,
          sourceDraftId: chapter.sourceDraftId,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { editArtifactId: string };
      return data.editArtifactId;
    }
  }, [slug]);

  // ── Run sequentially from index ──────────────────────────────────────────────
  const runFromIndex = useCallback(async (startIdx: number) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      for (let i = startIdx; i < chaptersRef.current.length; i++) {
        if (abort.signal.aborted) break;
        const chapter = chaptersRef.current[i];
        if (!chapter || chapter.status === "review" || chapter.status === "committed") continue;

        setChapters((prev) =>
          prev.map((c) => c.key === chapter.key ? { ...c, status: "editing", editedContent: undefined } : c)
        );

        let result = null;
        let lastErr: string | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (abort.signal.aborted) break;
          if (attempt > 0) {
            // Brief pause before retry
            await new Promise<void>((r) => setTimeout(r, 2000 * attempt));
            setChapters((prev) =>
              prev.map((c) => c.key === chapter.key ? { ...c, status: "editing", editedContent: undefined } : c)
            );
          }
          try {
            result = await editChapter(chapter, abort);
            if (result) break; // success — exit retry loop
            lastErr = "No content produced";
          } catch (err) {
            if (abort.signal.aborted) break;
            lastErr = err instanceof Error ? err.message : "Error";
          }
        }

        if (abort.signal.aborted) break;

        if (result) {
          const { editedContent, summaryNotes } = result;
          const editArtifactId = await saveEdit(chapter, editedContent, summaryNotes);
          setChapters((prev) =>
            prev.map((c) =>
              c.key === chapter.key
                ? { ...c, status: "review", editedContent, summaryNotes, editArtifactId: editArtifactId ?? undefined }
                : c
            )
          );
        } else {
          setChapters((prev) =>
            prev.map((c) => c.key === chapter.key ? { ...c, status: "error", errorMsg: lastErr ?? "Failed after 3 attempts" } : c)
          );
        }

        await new Promise<void>((r) => setTimeout(r, 500));
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
      abortRef.current = null;

      if (autoApproveRef.current) {
        autoApproveRef.current = false;
        const final = chaptersRef.current;
        const allDone = final.every((c) => c.status === "review" || c.status === "committed");
        const hasErrors = final.some((c) => c.status === "error");
        if (allDone && !hasErrors) {
          await approveAllRef.current?.();
        }
      }
    }
  }, [editChapter, saveEdit]);

  // ── Retry a single chapter ───────────────────────────────────────────────────
  const retryChapter = useCallback(async (chapter: EditedChapter) => {
    setChapters((prev) =>
      prev.map((c) => c.key === chapter.key ? { ...c, status: "pending", editedContent: undefined, errorMsg: undefined } : c)
    );
    await new Promise<void>((r) => setTimeout(r, 100));
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      setChapters((prev) =>
        prev.map((c) => c.key === chapter.key ? { ...c, status: "editing", editedContent: undefined } : c)
      );
      const result = await editChapter({ ...chapter, status: "editing" }, abort);
      if (result) {
        const { editedContent, summaryNotes } = result;
        const editArtifactId = await saveEdit(chapter, editedContent, summaryNotes);
        setChapters((prev) =>
          prev.map((c) =>
            c.key === chapter.key
              ? { ...c, status: "review", editedContent, summaryNotes, editArtifactId: editArtifactId ?? undefined }
              : c
          )
        );
      } else {
        setChapters((prev) =>
          prev.map((c) => c.key === chapter.key ? { ...c, status: "error", errorMsg: "No content produced" } : c)
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setChapters((prev) =>
        prev.map((c) => c.key === chapter.key ? { ...c, status: "error", errorMsg: msg } : c)
      );
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, [editChapter, saveEdit]);

  // ── Save a manually-edited chapter ──────────────────────────────────────────
  const handleSaveEdit = async (chapter: EditedChapter) => {
    if (!editDraft.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await saveEdit(chapter, editDraft, chapter.summaryNotes ?? "");
      setChapters((prev) =>
        prev.map((c) => c.key === chapter.key ? { ...c, editedContent: editDraft, status: "review" } : c)
      );
      setExpanded(null);
      router.refresh();
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : "Error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Revise with AI instructions ──────────────────────────────────────────────
  const handleRevise = async (chapter: EditedChapter) => {
    if (!revisePrompt.trim() || revisingKey) return;
    setRevisingKey(chapter.key);

    const contentToRevise = chapter.editedContent ?? chapter.sourceContent;
    const prompt = `Revise this polished chapter based on these instructions:

${revisePrompt}

CURRENT VERSION:
${contentToRevise}

Produce the complete revised chapter as a MANUSCRIPT_REVISION artifact. Same voice and length. After the artifact, update your "## Reed's Editorial Summary" to reflect the revision.`;

    const abort = new AbortController();
    let accumulated = "";

    try {
      const res = await fetch(`/api/books/${slug}/agent-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          stageKey: "EDITING",
          skipContext: true,
          polishMode: true,
          messages: [{ role: "user", content: prompt }],
          chapterContext: chapter.title,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break outer;
          try {
            const { text } = JSON.parse(raw) as { text: string };
            accumulated += text;
            const displayText = accumulated
              .replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "")
              .replace(/## Reed's Editorial Summary[\s\S]*/g, "")
              .trim();
            setChapters((prev) =>
              prev.map((c) => c.key === chapter.key ? { ...c, editedContent: displayText || chapter.editedContent } : c)
            );
          } catch { /* skip */ }
        }
      }

      // Extract content
      const artStart = accumulated.indexOf("<ARTIFACT>");
      const artEnd = accumulated.indexOf("</ARTIFACT>");
      let newContent: string | null = null;

      if (artStart !== -1 && artEnd !== -1) {
        const jsonStr = accumulated.slice(artStart + 10, artEnd).trim();
        try {
          const parsed = JSON.parse(jsonStr) as { content: string };
          if (parsed.content && parsed.content.split(/\s+/).length > 100) newContent = parsed.content;
        } catch {
          const m = jsonStr.match(/"content"\s*:\s*"([\s\S]+)"\s*\}\s*$/);
          if (m?.[1]) {
            const raw = m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
            if (raw.split(/\s+/).length > 100) newContent = raw;
          }
        }
      }

      if (!newContent) {
        const summaryIdx = accumulated.indexOf("## Reed's Editorial Summary");
        const fallback = (summaryIdx !== -1 ? accumulated.slice(0, summaryIdx) : accumulated)
          .replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim();
        if (fallback.split(/\s+/).length > 100) newContent = fallback;
      }

      const summaryMatch = accumulated.match(/## Reed's Editorial Summary[\s\S]*/);
      const newSummary = summaryMatch
        ? summaryMatch[0].replace(/^## Reed's Editorial Summary\s*/m, "").trim()
        : chapter.summaryNotes ?? "";

      if (newContent) {
        await saveEdit(chapter, newContent, newSummary);
        setChapters((prev) =>
          prev.map((c) =>
            c.key === chapter.key
              ? { ...c, editedContent: newContent!, summaryNotes: newSummary, status: "review" }
              : c
          )
        );
        setRevisePrompt("");
        setExpanded({ key: chapter.key, mode: "read" });
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setChapters((prev) =>
        prev.map((c) => c.key === chapter.key ? { ...c, status: "error", errorMsg: `Revision failed: ${msg}` } : c)
      );
    } finally {
      setRevisingKey(null);
    }
  };

  // ── Approve all and advance to TYPESET ───────────────────────────────────────
  const approveAll = useCallback(async () => {
    const res = await fetch(`/api/books/${slug}/agent-chat/editing/approve-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) { alert("Approve failed"); return; }
    const { nextStageKey } = await res.json() as { nextStageKey: StageKey | null };
    router.refresh();
    if (nextStageKey && onStageAdvance) {
      setTimeout(() => onStageAdvance(nextStageKey), 400);
    }
  }, [slug, router, onStageAdvance]);

  approveAllRef.current = approveAll;

  // ── Derived state ─────────────────────────────────────────────────────────────
  const totalChapters = chapters.length;
  const doneCount = chapters.filter((c) => c.status === "review" || c.status === "committed").length;
  const committedCount = chapters.filter((c) => c.status === "committed").length;
  const allReviewed = totalChapters > 0 && doneCount === totalChapters;
  const hasErrors = chapters.some((c) => c.status === "error");

  if (!initialized) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: "40px", color: "#8a7a6a", fontSize: "14px" }}>Loading chapters…</div>
      </div>
    );
  }

  if (totalChapters === 0) {
    return (
      <div style={panelStyle}>
        <div style={emptyStateStyle}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>✍️</div>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>No Chapters Found</div>
          <div style={{ color: "#8a7a6a", fontSize: "13px" }}>
            Commit the Chapter Draft stage first — Reed edits each chapter in sequence.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <div style={titleStyle}>Chapter Edit</div>
          <div style={subtitleStyle}>{bookTitle} · {totalChapters} chapters</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {isRunning && (
            <span style={runningBadgeStyle}>
              <span style={spinnerStyle}>⟳</span> Editing…
            </span>
          )}
          <div style={progressTextStyle}>
            {doneCount}/{totalChapters} edited
            {committedCount > 0 && ` · ${committedCount} committed`}
          </div>
          {allReviewed && status !== "COMMITTED" && (
            <button style={approveAllBtnStyle} onClick={() => void approveAll()}>
              Commit all & continue →
            </button>
          )}
          {!isRunning && hasErrors && (
            <button
              style={retryAllBtnStyle}
              onClick={() => {
                const firstError = chapters.findIndex((c) => c.status === "error");
                if (firstError >= 0) void runFromIndex(firstError);
              }}
            >
              Retry errors
            </button>
          )}
          {!isRunning && chapters.some((c) => c.status === "pending") && (
            <>
              <button
                style={startBtnStyle}
                onClick={() => {
                  const first = chapters.findIndex((c) => c.status === "pending");
                  if (first >= 0) void runFromIndex(first);
                }}
              >
                ▶ Edit chapters
              </button>
              <button
                style={editFullBookBtnStyle}
                onClick={() => {
                  const first = chapters.findIndex((c) => c.status === "pending");
                  if (first >= 0) {
                    autoApproveRef.current = true;
                    void runFromIndex(first);
                  }
                }}
                title="Edit all chapters and auto-commit when done"
              >
                ▶▶ Edit full book
              </button>
            </>
          )}
          {isRunning && (
            <button style={stopBtnStyle} onClick={() => abortRef.current?.abort()}>
              ■ Stop
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={progressTrackStyle}>
        <div style={{ ...progressFillStyle, width: totalChapters > 0 ? `${(doneCount / totalChapters) * 100}%` : "0%" }} />
      </div>

      {/* Chapter list */}
      <div style={listStyle}>
        {chapters.map((chapter, idx) => {
          const isExpanded = expanded?.key === chapter.key;
          const mode = isExpanded ? expanded!.mode : null;
          const wordCount = chapter.editedContent ? chapter.editedContent.trim().split(/\s+/).length : 0;
          const isRevising = revisingKey === chapter.key;

          return (
            <div key={chapter.key} style={chapterCardStyle(chapter.status)}>
              {/* Chapter row */}
              <div style={chapterRowStyle}>
                <div style={chapterNumStyle}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={chapterTitleStyle}>{chapter.title}</div>
                  {chapter.status === "editing" && (
                    <div style={editingProgressStyle}>
                      {chapter.editedContent
                        ? `${chapter.editedContent.trim().split(/\s+/).length} words…`
                        : "Reading…"}
                    </div>
                  )}
                  {isRevising && (
                    <div style={editingProgressStyle}>
                      {chapter.editedContent
                        ? `Revising… ${chapter.editedContent.trim().split(/\s+/).length} words`
                        : "Revising…"}
                    </div>
                  )}
                  {(chapter.status === "review" || chapter.status === "committed") && !isRevising && (
                    <div style={wordCountStyle}>{wordCount.toLocaleString()} words</div>
                  )}
                  {chapter.status === "error" && (
                    <div style={errorTextStyle}>{chapter.errorMsg}</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <StatusPip status={isRevising ? "editing" : chapter.status} />

                  {(chapter.status === "review" || chapter.status === "committed") && !isRevising && (
                    <>
                      <button
                        style={actionBtnStyle(mode === "read")}
                        onClick={() => setExpanded(isExpanded && mode === "read" ? null : { key: chapter.key, mode: "read" })}
                      >
                        Read
                      </button>
                      <button
                        style={actionBtnStyle(mode === "source")}
                        onClick={() => setExpanded(isExpanded && mode === "source" ? null : { key: chapter.key, mode: "source" })}
                        title="Read original draft before editing"
                      >
                        Original
                      </button>
                      <button
                        style={actionBtnStyle(mode === "edit")}
                        onClick={() => {
                          setEditDraft(chapter.editedContent ?? "");
                          setExpanded(isExpanded && mode === "edit" ? null : { key: chapter.key, mode: "edit" });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        style={actionBtnStyle(mode === "revise")}
                        onClick={() => setExpanded(isExpanded && mode === "revise" ? null : { key: chapter.key, mode: "revise" })}
                      >
                        Revise
                      </button>
                      <button
                        style={actionBtnStyle(mode === "summary")}
                        onClick={() => setExpanded(isExpanded && mode === "summary" ? null : { key: chapter.key, mode: "summary" })}
                        title="Reed's editorial notes for this chapter"
                      >
                        Summary
                      </button>
                      <button
                        style={regenBtnStyle}
                        onClick={() => { setExpanded(null); void retryChapter(chapter); }}
                        title="Re-edit this chapter from scratch"
                      >
                        ↺
                      </button>
                    </>
                  )}

                  {chapter.status === "error" && (
                    <button style={retryBtnStyle} onClick={() => void retryChapter(chapter)}>
                      Retry
                    </button>
                  )}

                  {chapter.status === "review" && !isRevising && (
                    <button
                      style={approveBtnStyle}
                      onClick={() =>
                        setChapters((prev) =>
                          prev.map((c) => c.key === chapter.key ? { ...c, status: "committed" } : c)
                        )
                      }
                    >
                      ✓
                    </button>
                  )}
                  {chapter.status === "committed" && !isRevising && (
                    <span style={approvedBadgeStyle}>✓</span>
                  )}
                </div>
              </div>

              {/* READ mode — polished prose */}
              {isExpanded && mode === "read" && (
                <div style={expandedContentStyle}>
                  {chapter.editedContent
                    ? <ChapterReader content={chapter.editedContent} />
                    : <div style={{ fontSize: 13, color: "#8a7a6a", fontStyle: "italic" }}>No edited content yet.</div>
                  }
                </div>
              )}

              {/* SOURCE mode — original draft */}
              {isExpanded && mode === "source" && (
                <div style={expandedContentStyle}>
                  <div style={{ fontSize: 11, color: "#8a7a6a", marginBottom: 12, fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}>
                    Original draft before Reed's edits
                  </div>
                  <ChapterReader content={chapter.sourceContent} />
                </div>
              )}

              {/* EDIT mode */}
              {isExpanded && mode === "edit" && (
                <div style={expandedContentStyle}>
                  <textarea
                    style={editTextareaStyle}
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    placeholder="Chapter content…"
                  />
                  <div style={editFooterStyle}>
                    <span style={{ fontSize: 11, color: "#8a7a6a" }}>
                      {editDraft.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={cancelBtnStyle} onClick={() => setExpanded(null)}>Cancel</button>
                      <button
                        style={{ ...approveBtnStyle, padding: "6px 14px" }}
                        onClick={() => void handleSaveEdit(chapter)}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* REVISE mode */}
              {isExpanded && mode === "revise" && (
                <div style={expandedContentStyle}>
                  <div style={{ fontSize: 12, color: "#6f6256", marginBottom: 8, fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}>
                    Tell Reed what to change — Reed will revise the polished chapter with your instructions applied.
                  </div>
                  <textarea
                    style={{ ...editTextareaStyle, height: "100px" }}
                    value={revisePrompt}
                    onChange={(e) => setRevisePrompt(e.target.value)}
                    placeholder="e.g. The opening hook is too generic. Strengthen the middle section. The closing turn needs more emotional weight."
                    disabled={isRevising}
                  />
                  <div style={editFooterStyle}>
                    <span style={{ fontSize: 11, color: "#8a7a6a" }}>
                      {isRevising ? "Reed is revising…" : "Reed will rewrite the chapter with your changes applied."}
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={cancelBtnStyle} onClick={() => setExpanded(null)} disabled={isRevising}>Cancel</button>
                      <button
                        style={{ ...approveBtnStyle, padding: "6px 14px", opacity: isRevising || !revisePrompt.trim() ? 0.5 : 1 }}
                        onClick={() => void handleRevise(chapter)}
                        disabled={isRevising || !revisePrompt.trim()}
                      >
                        {isRevising ? "Revising…" : "Revise chapter →"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SUMMARY mode — Reed's editorial notes */}
              {isExpanded && mode === "summary" && (
                <div style={expandedContentStyle}>
                  <div style={{ fontSize: 12, color: "#B8793A", fontWeight: 600, marginBottom: 10, fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}>
                    Reed's Editorial Summary
                  </div>
                  {chapter.summaryNotes ? (
                    <div style={{ fontSize: 13, color: "#4a3728", lineHeight: 1.7, fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', whiteSpace: "pre-wrap" }}>
                      {chapter.summaryNotes}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: "#8a7a6a", fontStyle: "italic" }}>
                      No summary available for this chapter.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status pip ────────────────────────────────────────────────────────────────

function StatusPip({ status }: { status: EditingStatus }) {
  const configs: Record<EditingStatus, { color: string; label: string }> = {
    pending:   { color: "#8a7a6a", label: "●" },
    editing:   { color: "#B8793A", label: "⟳" },
    review:    { color: "#d4a017", label: "◐" },
    committed: { color: "#4a7c59", label: "◆" },
    error:     { color: "#c0392b", label: "✕" },
  };
  const cfg = configs[status];
  return (
    <span
      style={{
        color: cfg.color,
        fontSize: "14px",
        ...(status === "editing" ? { animation: "spin 1.2s linear infinite", display: "inline-block" } : {}),
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Chapter reader ────────────────────────────────────────────────────────────

function ChapterReader({ content }: { content: string }) {
  const paragraphs = content.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    <div style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', fontSize: 14, lineHeight: 1.75, color: "#2d241d" }}>
      {paragraphs.map((p, i) => {
        if (/^#{1,3} /.test(p)) {
          const level = p.match(/^(#+)/)?.[1].length ?? 1;
          const text = p.replace(/^#+\s+/, "");
          const sizes = ["18px", "15px", "13px"];
          return <div key={i} style={{ fontSize: sizes[Math.min(level - 1, 2)], fontWeight: 700, marginTop: 20, marginBottom: 6 }}>{text}</div>;
        }
        if (/^- /.test(p)) {
          const items = p.split("\n").filter((l) => l.startsWith("- "));
          return (
            <ul key={i} style={{ paddingLeft: 20, margin: "8px 0" }}>
              {items.map((item, j) => <li key={j} style={{ marginBottom: 4 }}>{item.slice(2)}</li>)}
            </ul>
          );
        }
        return <p key={i} style={{ margin: "0 0 14px" }}>{p}</p>;
      })}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function actionBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: "5px",
    border: active ? "1px solid rgba(184,121,58,0.5)" : "1px solid rgba(45,36,29,0.2)",
    background: active ? "rgba(184,121,58,0.08)" : "transparent",
    color: active ? "#B8793A" : "#6f6256",
    fontSize: "11px",
    fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
  };
}

const panelStyle: React.CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column", height: "100%",
  background: "#fefbf5", overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "16px 24px", borderBottom: "1px solid rgba(45,36,29,0.1)",
  background: "rgba(254,251,245,0.95)", flexShrink: 0, gap: "12px", flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontSize: "15px", fontWeight: 700, color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "11px", color: "#8a7a6a", marginTop: "2px",
};

const runningBadgeStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#B8793A",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const spinnerStyle: React.CSSProperties = {
  display: "inline-block", animation: "spin 1.2s linear infinite",
};

const progressTextStyle: React.CSSProperties = {
  fontSize: "11px", color: "#8a7a6a", whiteSpace: "nowrap",
};

const approveAllBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: "7px", border: "none",
  background: "#4a7c59", color: "#fff", fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer", whiteSpace: "nowrap", fontWeight: 600,
};

const retryAllBtnStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: "7px", border: "1px solid rgba(192,57,43,0.4)",
  background: "transparent", color: "#c0392b", fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', cursor: "pointer",
};

const startBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: "7px", border: "none",
  background: "#2d241d", color: "#fefbf5", fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer", whiteSpace: "nowrap",
};

const editFullBookBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: "7px", border: "none",
  background: "#B8793A", color: "#fefbf5", fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer", whiteSpace: "nowrap", fontWeight: 600,
};

const stopBtnStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: "7px", border: "1px solid rgba(45,36,29,0.3)",
  background: "transparent", color: "#6f6256", fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', cursor: "pointer",
};

const progressTrackStyle: React.CSSProperties = { height: "3px", background: "rgba(255,255,255,0.08)", flexShrink: 0 };
const progressFillStyle: React.CSSProperties = { height: "100%", background: "#4a7c59", transition: "width 400ms ease" };

const listStyle: React.CSSProperties = {
  flex: 1, overflowY: "auto", padding: "16px 24px",
  display: "flex", flexDirection: "column", gap: "8px",
};

const chapterCardStyle = (status: EditingStatus): React.CSSProperties => ({
  borderRadius: "8px",
  border: `1px solid ${
    status === "committed" ? "rgba(74,124,89,0.3)" :
    status === "review"    ? "rgba(212,160,23,0.3)" :
    status === "error"     ? "rgba(192,57,43,0.3)" :
    status === "editing"   ? "rgba(184,121,58,0.4)" :
    "rgba(45,36,29,0.1)"
  }`,
  background:
    status === "committed" ? "rgba(74,124,89,0.04)" :
    status === "review"    ? "rgba(212,160,23,0.04)" :
    status === "error"     ? "rgba(192,57,43,0.04)" : "#fff",
  transition: "border-color 200ms",
});

const chapterRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px",
};

const chapterNumStyle: React.CSSProperties = {
  width: "28px", height: "28px", borderRadius: "6px",
  background: "rgba(45,36,29,0.06)", display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: "12px", fontWeight: 600, color: "#6f6256", flexShrink: 0,
};

const chapterTitleStyle: React.CSSProperties = {
  fontSize: "14px", fontWeight: 500, color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

const editingProgressStyle: React.CSSProperties = { fontSize: "11px", color: "#B8793A", marginTop: "2px" };
const wordCountStyle: React.CSSProperties = { fontSize: "11px", color: "#8a7a6a", marginTop: "2px" };
const errorTextStyle: React.CSSProperties = { fontSize: "11px", color: "#c0392b", marginTop: "2px" };

const regenBtnStyle: React.CSSProperties = {
  padding: "4px 8px", borderRadius: "5px", border: "1px solid rgba(45,36,29,0.15)",
  background: "transparent", color: "#8a7a6a", fontSize: "13px", cursor: "pointer",
};

const retryBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: "5px", border: "1px solid rgba(192,57,43,0.3)",
  background: "transparent", color: "#c0392b", fontSize: "11px", cursor: "pointer",
};

const approveBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: "5px", border: "none",
  background: "#4a7c59", color: "#fff", fontSize: "11px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', cursor: "pointer",
};

const approvedBadgeStyle: React.CSSProperties = { fontSize: "11px", color: "#4a7c59", fontWeight: 600 };

const expandedContentStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(45,36,29,0.08)", padding: "20px 20px 16px",
  maxHeight: "600px", overflowY: "auto",
};

const editTextareaStyle: React.CSSProperties = {
  width: "100%", height: "400px", padding: "12px", borderRadius: "6px",
  border: "1px solid rgba(45,36,29,0.15)", background: "#fff",
  fontSize: "13px", fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  lineHeight: 1.7, color: "#2d241d", resize: "vertical", outline: "none", boxSizing: "border-box",
};

const editFooterStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: "5px", border: "1px solid rgba(45,36,29,0.2)",
  background: "transparent", color: "#6f6256", fontSize: "11px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', cursor: "pointer",
};

const emptyStateStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  height: "100%", color: "#4a3e33", fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  textAlign: "center", padding: "40px",
};
