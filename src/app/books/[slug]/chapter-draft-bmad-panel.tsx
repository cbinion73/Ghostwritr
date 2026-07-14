"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { StageKey, StageStatus } from "@prisma/client";
import { ChapterLinkedNotes } from "./chapter-linked-notes";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChapterStatus = "pending" | "drafting" | "review" | "approved" | "error";

interface Chapter {
  key: string;          // ch-1, ch-2, …
  title: string;        // Full chapter title
  excerpt: string;      // Portion of outline text for this chapter
  status: ChapterStatus;
  artifactId?: string;
  content?: string;
  errorMsg?: string;
  completenessNote?: string;  // Set when validator flags thin/missing sections — prompts author to revise
}

interface ChapterDraftBmadPanelProps {
  slug: string;
  status: StageStatus;
  stageKey?: string;              // "CHAPTER_DRAFT" | "FICTION_DRAFT"
  outlineContent: string | null;  // committed OUTLINE / SCENE_PLAN artifact text
  bookTitle: string;
  onStageAdvance?: (key: StageKey) => void;
}

// ── Outline parser ────────────────────────────────────────────────────────────

// ── Structured (JSON) outline parser ─────────────────────────────────────────
// Nonfiction Outline artifacts are committed as structured JSON
// (sections[].chapters[]), not the markdown document the legacy parser below
// expects — feeding JSON into that regex-based parser was silently
// collapsing a real 16-chapter outline down to a single fallback "chapter".
// This reads the real structure directly and returns the actual backend
// chapterKey (chapter.id) instead of a synthetic ch-N placeholder, so
// already-drafted chapters correctly match their existing artifacts instead
// of always showing as pending.
function parseStructuredOutlineChapters(
  outline: string,
): Array<{ key: string; title: string; excerpt: string }> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outline);
  } catch {
    return null;
  }

  const sections = (parsed as { sections?: unknown })?.sections;
  if (!Array.isArray(sections)) return null;

  const chapters: Array<{ key: string; title: string; excerpt: string }> = [];
  for (const section of sections) {
    const sectionChapters = (section as { chapters?: unknown })?.chapters;
    if (!Array.isArray(sectionChapters)) continue;
    for (const chapter of sectionChapters) {
      const c = chapter as Record<string, unknown>;
      const key = typeof c.id === "string" ? c.id : null;
      const title = typeof c.title === "string" ? c.title : null;
      if (!key || !title) continue;

      const paragraphSummaries = Array.isArray(c.paragraphs)
        ? (c.paragraphs as Array<Record<string, unknown>>)
            .map((p) => (typeof p.mainIdea === "string" ? `- ${p.mainIdea}` : null))
            .filter((line): line is string => Boolean(line))
            .join("\n")
        : "";

      const excerptLines = [
        `Chapter: ${title}`,
        typeof c.subtitle === "string" ? c.subtitle : null,
        typeof c.bigIdea === "string" ? `Big idea: ${c.bigIdea}` : null,
        typeof c.coreIdea === "string" ? `Core idea: ${c.coreIdea}` : null,
        typeof c.description === "string" ? c.description : null,
        typeof c.whatGetsConveyed === "string" ? `What it conveys: ${c.whatGetsConveyed}` : null,
        typeof c.openingHook === "string" ? `Opening hook: ${c.openingHook}` : null,
        typeof c.closingBridge === "string" ? `Closing bridge: ${c.closingBridge}` : null,
        paragraphSummaries ? `Paragraph beats:\n${paragraphSummaries}` : null,
      ].filter((line): line is string => Boolean(line));

      chapters.push({ key, title, excerpt: excerptLines.join("\n\n") });
    }
  }

  return chapters.length > 0 ? chapters : null;
}

function parseChapters(outline: string): Array<{ title: string; excerpt: string }> {
  if (!outline.trim()) return [];

  const lines = outline.split("\n");

  // ── Skip the document header block ─────────────────────────────────────────
  // Outlines typically open with a book-title `#` heading, a `## Structural
  // Outline` label, and a `---` separator before the real chapter list starts.
  // Everything above the first `---` is metadata — skip it.
  const firstSepIdx = lines.findIndex((l) => /^-{3,}\s*$/.test(l.trim()));
  const startIdx = firstSepIdx >= 0 ? firstSepIdx + 1 : 0;
  const workingLines = lines.slice(startIdx);

  const chapters: Array<{ title: string; startLine: number }> = [];

  // ── Structured pass: recognise actual chapters, skip part dividers ─────────
  for (let i = 0; i < workingLines.length; i++) {
    const line = workingLines[i].trim();

    // Skip horizontal rules and blank lines
    if (!line || /^-{3,}$/.test(line)) continue;

    // ## PART … headers are section dividers, not draftable chapters — skip them
    if (/^#{1,3}\s+PART\s+/i.test(line)) continue;

    // ## Introduction / Closing / Conclusion / Epilogue / Preface / Afterword
    // Skip word-count annotations like "## Introduction: 2,000 words"
    if (
      /^#{1,3}\s+(Introduction|Closing|Conclusion|Epilogue|Appendix|Preface|Foreword|Afterword)\b/i.test(line) &&
      !/\d[\d,]*\s+words?$/i.test(line)
    ) {
      chapters.push({ title: line.replace(/^#{1,3}\s+/, "").trim(), startLine: i });
      continue;
    }

    // ### Chapter N: Title  OR  ## Chapter N: Title  OR  **Chapter N: Title**
    // Skip word-count annotations like "## Chapter 1 (Trust): 5,500 words"
    if (/^#{1,3}\s+Chapter\s+\d+/i.test(line) && !/\d[\d,]*\s+words?$/i.test(line)) {
      chapters.push({ title: line.replace(/^#{1,3}\s+/, "").trim(), startLine: i });
      continue;
    }

    // Bare "Chapter N:" lines (no markdown hashes)
    // Skip word-count annotations like "Chapter 1 (Trust): 5,500 words"
    if (/^Chapter\s+\d+/i.test(line) && !/\d[\d,]*\s+words?$/i.test(line)) {
      chapters.push({ title: line, startLine: i });
      continue;
    }

    // **Chapter N: Title** bold heading
    const boldMatch = line.match(/^\*\*(.{3,80})\*\*\s*$/);
    if (boldMatch && /chapter\s+\d+/i.test(boldMatch[1]) && !/\d[\d,]*\s+words?$/i.test(boldMatch[1])) {
      chapters.push({ title: boldMatch[1], startLine: i });
      continue;
    }
  }

  // ── Fallback: numbered list (e.g. "1. Title") if structured pass found nothing
  if (chapters.length === 0) {
    for (let i = 0; i < workingLines.length; i++) {
      const line = workingLines[i].trim();
      const m = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
      if (m && !workingLines[i].startsWith("  ") && !workingLines[i].startsWith("\t")) {
        chapters.push({ title: m[2], startLine: i });
      }
    }
  }

  // ── Last resort: blank-line paragraph split ────────────────────────────────
  if (chapters.length === 0) {
    const paras = workingLines.join("\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    return paras.slice(0, 30).map((p) => ({
      title: p.split("\n")[0].slice(0, 80),
      excerpt: p,
    }));
  }

  // Build per-chapter excerpts from the working (post-header) line array
  return chapters.map((ch, idx) => {
    const nextStart = chapters[idx + 1]?.startLine ?? workingLines.length;
    const excerpt = workingLines.slice(ch.startLine, nextStart).join("\n").trim();
    return { title: ch.title, excerpt };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChapterDraftBmadPanel({
  slug,
  status,
  stageKey = "CHAPTER_DRAFT",
  outlineContent,
  bookTitle,
  onStageAdvance,
}: ChapterDraftBmadPanelProps) {
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  type ExpandedState = { key: string; mode: "read" | "edit" | "revise" | "notes" | "brain" } | null;
  const [expanded, setExpanded] = useState<ExpandedState>(null);
  const [editDraft, setEditDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // ── Bootstrap: load existing chapter artifacts and outline chapters ─────────
  useEffect(() => {
    const init = async () => {
      const res = await fetch(`/api/books/${slug}/chapter-draft/artifacts?stageKey=${stageKey}`);
      if (!res.ok) { setInitialized(true); return; }
      const data = await res.json() as {
        chapters: Array<{
          artifactId: string;
          chapterKey: string;
          chapterTitle: string;
          status: string;
          content: string;
        }>;
        stageStatus: string;
      };

      // Build a map of DB-persisted chapters keyed by chapterKey
      const dbMap = new Map(data.chapters.map((c) => [c.chapterKey, c]));

      // Parse the outline into the canonical chapter list — try the
      // structured JSON shape (real nonfiction Outline artifacts) first,
      // since it also gives us the real chapterKey; fall back to the
      // markdown parser (used by FICTION_DRAFT's SCENE_PLAN content) with
      // synthetic keys when the outline isn't that JSON shape.
      const structuredParsed = outlineContent ? parseStructuredOutlineChapters(outlineContent) : null;
      const parsed: Array<{ key?: string; title: string; excerpt: string }> =
        structuredParsed ?? (outlineContent ? parseChapters(outlineContent) : []);

      const merged: Chapter[] = parsed.map((p, idx) => {
        const key = p.key ?? `ch-${idx + 1}`;
        const dbEntry = dbMap.get(key);
        return {
          key,
          title: p.title,
          excerpt: p.excerpt,
          status: dbEntry
            ? dbEntry.status === "COMMITTED" ? "approved" : "review"
            : "pending",
          artifactId: dbEntry?.artifactId,
          content: dbEntry?.content,
        };
      });

      // If no outline to parse but DB has chapters (edge case), surface them
      if (merged.length === 0 && data.chapters.length > 0) {
        const fromDb: Chapter[] = data.chapters.map((c, idx) => ({
          key: c.chapterKey || `ch-${idx + 1}`,
          title: c.chapterTitle,
          excerpt: "",
          status: c.status === "COMMITTED" ? "approved" as ChapterStatus : "review" as ChapterStatus,
          artifactId: c.artifactId,
          content: c.content,
        }));
        setChapters(fromDb);
      } else {
        setChapters(merged);
      }

      setInitialized(true);
    };
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Auto-start stays removed. The Book Studio panel now queues durable
  // server-side jobs instead of streaming model calls from the browser.
  // That keeps all generation behind the workflow-run lease, budget gates,
  // and LLM gateway attribution.
  const queueDurableRun = useCallback(async (
    action: "full" | "selected" | "stop" | "retry",
    chapterKey?: string,
  ) => {
    if (stageKey !== "CHAPTER_DRAFT") {
      alert("Durable generation from Book Studio is currently available for nonfiction Chapter Draft only.");
      return;
    }

    setIsQueueing(true);
    try {
      const res = await fetch(`/api/books/${slug}/chapter-draft/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, chapterKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? `Request failed with ${res.status}`);
      }

      if (action === "selected" && chapterKey) {
        setChapters((prev) =>
          prev.map((chapter) =>
            chapter.key === chapterKey
              ? { ...chapter, status: "drafting", errorMsg: undefined, completenessNote: undefined }
              : chapter,
          ),
        );
      }

      setIsRunning(action !== "stop");
      router.refresh();
    } catch (err) {
      alert(`Chapter Draft run request failed: ${err instanceof Error ? err.message : "Error"}`);
    } finally {
      setIsQueueing(false);
    }
  }, [router, slug, stageKey]);

  // ── Save a manually-edited chapter draft ────────────────────────────────────
  const handleSaveEdit = async (chapter: Chapter) => {
    if (!editDraft.trim() || !chapter.artifactId || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/books/${slug}/chapter-draft/artifacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId: chapter.artifactId, content: editDraft }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setChapters((prev) =>
        prev.map((c) =>
          c.key === chapter.key ? { ...c, content: editDraft, status: "review" } : c
        )
      );
      setExpanded(null);
      router.refresh();
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : "Error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Approve all and commit the stage ────────────────────────────────────────
  const approveAll = useCallback(async () => {
    const res = await fetch(`/api/books/${slug}/chapter-draft/approve-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageKey }),
    });
    if (!res.ok) { alert("Approve failed"); return; }
    const { nextStageKey } = await res.json() as { nextStageKey: StageKey | null };
    router.refresh();
    if (nextStageKey && onStageAdvance) {
      setTimeout(() => onStageAdvance(nextStageKey), 400);
    }
  }, [slug, stageKey, router, onStageAdvance]);

  // ── Derived state ────────────────────────────────────────────────────────────
  const totalChapters = chapters.length;
  const doneCount = chapters.filter((c) => c.status === "review" || c.status === "approved").length;
  const approvedCount = chapters.filter((c) => c.status === "approved").length;
  const allReviewed = totalChapters > 0 && doneCount === totalChapters;
  const hasErrors = chapters.some((c) => c.status === "error");
  const generationRunning = isRunning || status === "IN_PROGRESS";

  if (!initialized) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: "40px", color: "#8a7a6a", fontSize: "14px" }}>Loading chapters…</div>
      </div>
    );
  }

  if (!outlineContent && totalChapters === 0) {
    return (
      <div style={panelStyle}>
        <div style={emptyStateStyle}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📋</div>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>No Outline Found</div>
          <div style={{ color: "#8a7a6a", fontSize: "13px" }}>
            Commit the Outline stage first — this panel will parse it into chapters automatically.
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
          <div style={titleStyle}>Chapter Draft</div>
          <div style={subtitleStyle}>
            {bookTitle} · {totalChapters} chapters
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {generationRunning && (
            <span style={runningBadgeStyle}>
              <span style={spinnerStyle}>⟳</span> Durable job running…
            </span>
          )}
          <div style={progressTextStyle}>
            {doneCount}/{totalChapters} drafted
            {approvedCount > 0 && ` · ${approvedCount} approved`}
          </div>
          {allReviewed && status !== "COMMITTED" && (
            <button style={approveAllBtnStyle} onClick={() => void approveAll()}>
              Approve all & continue →
            </button>
          )}
          {!generationRunning && hasErrors && (
            <button
              style={retryAllBtnStyle}
              onClick={() => void queueDurableRun("retry")}
              disabled={isQueueing}
            >
              {isQueueing ? "Queueing…" : "Retry via durable job"}
            </button>
          )}
          {!generationRunning && chapters.some((c) => c.status === "pending") && (
            <>
              <button
                style={startBtnStyle}
                onClick={() => void queueDurableRun("full")}
                disabled={isQueueing}
              >
                {isQueueing ? "Queueing…" : "▶ Queue durable draft run"}
              </button>
            </>
          )}
          {generationRunning && (
            <button
              style={stopBtnStyle}
              onClick={() => void queueDurableRun("stop")}
              disabled={isQueueing}
            >
              {isQueueing ? "Stopping…" : "■ Stop durable job"}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={progressTrackStyle}>
        <div
          style={{
            ...progressFillStyle,
            width: totalChapters > 0 ? `${(doneCount / totalChapters) * 100}%` : "0%",
          }}
        />
      </div>

      {/* Chapter list */}
      <div style={listStyle}>
        {chapters.map((chapter, idx) => {
          const isExpanded = expanded?.key === chapter.key;
          const mode = isExpanded ? expanded!.mode : null;
          const wordCount = chapter.content ? chapter.content.trim().split(/\s+/).length : 0;
          return (
            <div key={chapter.key} style={chapterCardStyle(chapter.status)}>
              {/* Chapter row */}
              <div style={chapterRowStyle}>
                <div style={chapterNumStyle}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={chapterTitleStyle}>{chapter.title}</div>
                  {chapter.status === "drafting" && (
                    <div style={draftingProgressStyle}>
                      {chapter.content ? `${chapter.content.trim().split(/\s+/).length} words…` : "Planning…"}
                    </div>
                  )}
                  {(chapter.status === "review" || chapter.status === "approved") && (
                    <div style={wordCountStyle}>{wordCount.toLocaleString()} words</div>
                  )}
                  {chapter.completenessNote && chapter.status !== "error" && (
                    <div
                      style={{ fontSize: "11px", color: "#b07d2a", marginTop: "2px", cursor: "pointer" }}
                      onClick={() => setExpanded(isExpanded && mode === "notes" ? null : { key: chapter.key, mode: "notes" })}
                      title="Quill flagged gaps — click to review"
                    >
                      ⚠ Review needed
                    </div>
                  )}
                  {chapter.status === "error" && (
                    <div style={errorTextStyle}>{chapter.errorMsg}</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <StatusPip status={chapter.status} />
                  {(chapter.status === "review" || chapter.status === "approved") && (
                    <>
                      <button
                        style={actionBtnStyle(mode === "read")}
                        onClick={() => setExpanded(isExpanded && mode === "read" ? null : { key: chapter.key, mode: "read" })}
                      >
                        Read
                      </button>
                      <button
                        style={actionBtnStyle(mode === "edit")}
                        onClick={() => {
                          setEditDraft(chapter.content ?? "");
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
                        style={regenBtnStyle}
                        onClick={() => { setExpanded(null); void queueDurableRun("selected", chapter.key); }}
                        disabled={isQueueing || generationRunning}
                        title="Queue this chapter through the durable Chapter Draft workflow"
                      >
                        ↺
                      </button>
                      {chapter.status === "approved" && (
                        <button
                          style={actionBtnStyle(mode === "brain")}
                          onClick={() => setExpanded(isExpanded && mode === "brain" ? null : { key: chapter.key, mode: "brain" })}
                          title="Research and external stories behind this committed chapter"
                        >
                          🧠 Notes
                        </button>
                      )}
                    </>
                  )}
                  {chapter.status === "error" && (
                    <button
                      style={retryBtnStyle}
                      onClick={() => void queueDurableRun("selected", chapter.key)}
                      disabled={isQueueing || generationRunning}
                    >
                      Queue retry
                    </button>
                  )}
                  {chapter.status === "review" && (
                    <button
                      style={approveBtnStyle}
                      onClick={() =>
                        setChapters((prev) =>
                          prev.map((c) => c.key === chapter.key ? { ...c, status: "approved" } : c)
                        )
                      }
                    >
                      ✓
                    </button>
                  )}
                  {chapter.status === "approved" && (
                    <span style={approvedBadgeStyle}>✓</span>
                  )}
                </div>
              </div>

              {/* READ mode */}
              {isExpanded && mode === "read" && (
                <div style={expandedContentStyle}>
                  {chapter.content
                    ? <ChapterReader content={chapter.content} />
                    : <div style={{ fontSize: 13, color: "#8a7a6a", fontStyle: "italic" }}>No content loaded — try regenerating this chapter.</div>
                  }
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
                    Browser-side Quill revision has been retired. Use the durable workflow to regenerate this chapter, then make any surgical author edits with the Edit panel.
                  </div>
                  <div style={editFooterStyle}>
                    <span style={{ fontSize: 11, color: "#8a7a6a" }}>
                      Durable jobs enforce workflow leases, budget gates, and LLM gateway attribution.
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={cancelBtnStyle} onClick={() => setExpanded(null)}>Cancel</button>
                      <button
                        style={{ ...approveBtnStyle, padding: "6px 14px", opacity: isQueueing || generationRunning ? 0.5 : 1 }}
                        onClick={() => void queueDurableRun("selected", chapter.key)}
                        disabled={isQueueing || generationRunning}
                      >
                        {isQueueing ? "Queueing…" : "Regenerate via durable job →"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* NOTES mode — completeness issues flagged by validator */}
              {isExpanded && mode === "notes" && chapter.completenessNote && (
                <div style={expandedContentStyle}>
                  <div style={{ fontSize: "12px", color: "#b07d2a", fontWeight: 600, marginBottom: "8px", fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}>
                    ⚠ Quill flagged these gaps after drafting:
                  </div>
                  <div style={{ fontSize: "13px", color: "#4a3728", lineHeight: 1.6, fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', whiteSpace: "pre-wrap", marginBottom: "12px" }}>
                    {chapter.completenessNote}
                  </div>
                  <div style={{ fontSize: "11px", color: "#8a7a6a", fontStyle: "italic" }}>
                    Use the <strong>Revise</strong> button to address these — paste the relevant bullets as your revision instructions.
                  </div>
                </div>
              )}

              {/* BRAIN mode — the digital brain: research + external stories behind this committed chapter */}
              {isExpanded && mode === "brain" && (
                <div style={expandedContentStyle}>
                  <ChapterLinkedNotes slug={slug} chapterKey={chapter.key} />
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

function StatusPip({ status }: { status: ChapterStatus }) {
  const configs: Record<ChapterStatus, { color: string; label: string }> = {
    pending:  { color: "#8a7a6a", label: "●" },
    drafting: { color: "#B8793A", label: "⟳" },
    review:   { color: "#d4a017", label: "◐" },
    approved: { color: "#4a7c59", label: "◆" },
    error:    { color: "#c0392b", label: "✕" },
  };
  const cfg = configs[status];
  return (
    <span
      style={{
        color: cfg.color,
        fontSize: "14px",
        ...(status === "drafting" ? { animation: "spin 1.2s linear infinite", display: "inline-block" } : {}),
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
          const level = (p.match(/^(#+)/)?.[1].length ?? 1);
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

// ── Action button style function ──────────────────────────────────────────────

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

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#fefbf5",
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
  gap: "12px",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 700,
  color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8a7a6a",
  marginTop: "2px",
};

const runningBadgeStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  fontSize: "11px",
  color: "#B8793A",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const spinnerStyle: React.CSSProperties = {
  display: "inline-block",
  animation: "spin 1.2s linear infinite",
};

const progressTextStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8a7a6a",
  whiteSpace: "nowrap",
};

const approveAllBtnStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "7px",
  border: "none",
  background: "#4a7c59",
  color: "#fff",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 600,
};

const retryAllBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "7px",
  border: "1px solid rgba(192,57,43,0.4)",
  background: "transparent",
  color: "#c0392b",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
};

const startBtnStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "7px",
  border: "none",
  background: "#2d241d",
  color: "#fefbf5",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const stopBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "7px",
  border: "1px solid rgba(45,36,29,0.3)",
  background: "transparent",
  color: "#6f6256",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
};

const progressTrackStyle: React.CSSProperties = {
  height: "3px",
  background: "rgba(255,255,255,0.08)",
  flexShrink: 0,
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  background: "#4a7c59",
  transition: "width 400ms ease",
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "16px 24px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const chapterCardStyle = (status: ChapterStatus): React.CSSProperties => ({
  borderRadius: "8px",
  border: `1px solid ${
    status === "approved" ? "rgba(74,124,89,0.3)" :
    status === "review"   ? "rgba(212,160,23,0.3)" :
    status === "error"    ? "rgba(192,57,43,0.3)" :
    status === "drafting" ? "rgba(184,121,58,0.4)" :
    "rgba(45,36,29,0.1)"
  }`,
  background: status === "approved" ? "rgba(74,124,89,0.04)" :
              status === "review"   ? "rgba(212,160,23,0.04)" :
              status === "error"    ? "rgba(192,57,43,0.04)" :
              "#fff",
  transition: "border-color 200ms",
});

const chapterRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px 16px",
};

const chapterNumStyle: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "6px",
  background: "rgba(45,36,29,0.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "12px",
  fontWeight: 600,
  color: "#6f6256",
  flexShrink: 0,
};

const chapterTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 500,
  color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const draftingProgressStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#B8793A",
  marginTop: "2px",
};

const wordCountStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8a7a6a",
  marginTop: "2px",
};

const errorTextStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#c0392b",
  marginTop: "2px",
};

const regenBtnStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: "5px",
  border: "1px solid rgba(45,36,29,0.15)",
  background: "transparent",
  color: "#8a7a6a",
  fontSize: "13px",
  cursor: "pointer",
};

const retryBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: "5px",
  border: "1px solid rgba(192,57,43,0.3)",
  background: "transparent",
  color: "#c0392b",
  fontSize: "11px",
  cursor: "pointer",
};

const approveBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: "5px",
  border: "none",
  background: "#4a7c59",
  color: "#fff",
  fontSize: "11px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
};

const approvedBadgeStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#4a7c59",
  fontWeight: 600,
};

const expandedContentStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(45,36,29,0.08)",
  padding: "20px 20px 16px",
  maxHeight: "600px",
  overflowY: "auto",
};

const editTextareaStyle: React.CSSProperties = {
  width: "100%",
  height: "400px",
  padding: "12px",
  borderRadius: "6px",
  border: "1px solid rgba(45,36,29,0.15)",
  background: "#fff",
  fontSize: "13px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  lineHeight: 1.7,
  color: "#2d241d",
  resize: "vertical",
  outline: "none",
  boxSizing: "border-box",
};

const editFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginTop: 10,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "5px",
  border: "1px solid rgba(45,36,29,0.2)",
  background: "transparent",
  color: "#6f6256",
  fontSize: "11px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
};

const emptyStateStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "#4a3e33",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  textAlign: "center",
  padding: "40px",
};
