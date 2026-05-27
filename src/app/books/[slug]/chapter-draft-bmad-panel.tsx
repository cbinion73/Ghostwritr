"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { StageKey, StageStatus } from "@prisma/client";

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
  type ExpandedState = { key: string; mode: "read" | "edit" | "revise" | "notes" } | null;
  const [expanded, setExpanded] = useState<ExpandedState>(null);
  const [editDraft, setEditDraft] = useState("");
  const [revisePrompt, setRevisePrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [revisingKey, setRevisingKey] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [manifestBuilding, setManifestBuilding] = useState(false);
  const runningRef = useRef(false);
  const autoApproveRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const chaptersRef = useRef<Chapter[]>([]);
  // Ref so runFromIndex can call approveAll without a circular useCallback dependency
  const approveAllRef = useRef<(() => Promise<void>) | null>(null);

  // ── Bootstrap: check manifest, build if missing, then load chapters ─────────
  useEffect(() => {
    const init = async () => {
      // Always ensure a manifest exists before drafting — it cuts context from
      // 200K tokens to ~14K, which is what lets the model actually hit word targets.
      try {
        const mRes = await fetch(`/api/books/${slug}/manifest`);
        if (mRes.ok) {
          const mData = await mRes.json() as { status: string; content: string | null };
          if (!mData.content) {
            setManifestBuilding(true);
            try {
              const buildRes = await fetch(`/api/books/${slug}/manifest`, { method: "POST" });
              if (buildRes.ok && buildRes.body) {
                const mReader = buildRes.body.getReader();
                const mDecoder = new TextDecoder();
                mOuter: while (true) {
                  const { done, value } = await mReader.read();
                  if (done) break;
                  const chunk = mDecoder.decode(value, { stream: true });
                  for (const line of chunk.split("\n")) {
                    if (!line.startsWith("data: ")) continue;
                    const raw = line.slice(6).trim();
                    if (raw === "[DONE]") break mOuter;
                    try {
                      const evt = JSON.parse(raw) as { event?: string };
                      if (evt.event === "complete" || evt.event === "error") break mOuter;
                    } catch { /* skip */ }
                  }
                }
              }
            } finally {
              setManifestBuilding(false);
            }
          }
        }
      } catch { /* manifest check failed — proceed anyway */ }

      const res = await fetch(`/api/books/${slug}/agent-chat/chapter-draft?stageKey=${stageKey}`);
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

      // Parse the outline into the canonical chapter list
      const parsed = outlineContent ? parseChapters(outlineContent) : [];

      const merged: Chapter[] = parsed.map((p, idx) => {
        const key = `ch-${idx + 1}`;
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

  // Keep chaptersRef in sync for use inside callbacks
  useEffect(() => { chaptersRef.current = chapters; }, [chapters]);

  // ── Auto-start when stage is IN_PROGRESS and there are pending chapters ─────
  useEffect(() => {
    if (!initialized) return;
    if (status !== "IN_PROGRESS" && status !== "READY_FOR_REVIEW") return;
    if (runningRef.current) return;

    const firstPending = chapters.findIndex((c) => c.status === "pending");
    if (firstPending === -1) return;

    void runFromIndex(firstPending);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, chapters.length]);

  // ── Write a single chapter via SSE stream ───────────────────────────────────
  const writeChapter = useCallback(async (chapter: Chapter, abort: AbortController): Promise<{ content: string; completenessNote?: string } | null> => {
    const prompt = `Draft the artifact for this chapter: ${chapter.title}

${chapter.excerpt ? `Chapter outline section:\n${chapter.excerpt}\n\n` : ""}PHASE 1 — CHAPTER PLAN (do this before writing any prose)
State your plan in 6–8 bullet points. Each bullet is one sentence covering: what that section accomplishes, what evidence or story anchors it, and how it connects to the next section. Be specific — name the actual research, story, or framework you will use. This plan is your commitment before you write.

After your bullets, add one line: NATURAL LENGTH: X words — your honest estimate of what this specific chapter's content requires. A focused tactical chapter may need 2,200 words. A narrative-heavy or research-dense chapter may need 4,500. Base it on your plan, not a default. Do not pick the same number every time.

PHASE 2 — FULL CHAPTER PROSE
Write the complete chapter at the length your plan requires. The floor is 2,000 words — no chapter should feel rushed. The ceiling is 5,500 — no chapter should pad. Between those limits, let the content decide. A tight chapter that earns 2,400 words is better than a padded one hitting 4,000. A rich chapter that needs 4,800 words should not be cut to 3,500.

Follow your plan exactly. Cover every bullet you committed to in Phase 1. Do not summarize, outline, or hedge — write the prose the reader will see. Strong opening hook, named reader struggle, clear chapter promise, teaching with evidence woven in, practical application, closing turn that lands. End with The Author's Workbench tool.

Do not close the ARTIFACT until you have covered every section in your Phase 1 plan.

Wrap the final prose in the ARTIFACT block. The plan goes before the ARTIFACT, in chat. The artifact contains only the prose.`;

    const res = await fetch(`/api/books/${slug}/agent-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        stageKey,
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
          // Live update the drafting chapter content
          const displayText = accumulated.replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim();
          setChapters((prev) =>
            prev.map((c) =>
              c.key === chapter.key ? { ...c, content: displayText } : c,
            ),
          );
        } catch { /* skip */ }
      }
    }

    // Extract ARTIFACT block if present, otherwise use raw prose text
    const artStart = accumulated.indexOf("<ARTIFACT>");
    const artEnd = accumulated.indexOf("</ARTIFACT>");

    let extractedContent: string | null = null;

    if (artStart !== -1 && artEnd !== -1) {
      const jsonStr = accumulated.slice(artStart + 10, artEnd).trim();

      // First try standard JSON.parse
      try {
        const parsed = JSON.parse(jsonStr) as { content: string };
        if (parsed.content && parsed.content.length > 50) extractedContent = parsed.content;
      } catch { /* fall through to manual extraction */ }

      if (!extractedContent) {
        // Manual extraction — handles unescaped newlines inside the "content" field.
        const contentMatch = jsonStr.match(/"content"\s*:\s*"([\s\S]+)"\s*\}\s*$/);
        if (contentMatch?.[1]) {
          const raw = contentMatch[1]
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\")
            .replace(/\\t/g, "\t")
            .trim();
          if (raw.length > 50) extractedContent = raw;
        }
      }
      // If ARTIFACT found but content unextractable — fall through (extractedContent stays null)
    } else {
      // No ARTIFACT block — use raw prose, stopping before Package Notes section
      const notesIdx = accumulated.indexOf("## Quill Package Notes");
      const plainText = (notesIdx !== -1 ? accumulated.slice(0, notesIdx) : accumulated)
        .replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "")
        .trim();
      if (plainText && plainText.length > 50) extractedContent = plainText;
    }

    if (!extractedContent) return null;

    // ── Content completeness check (validator only — no auto-append) ──────────
    // Ask the model: "Given your plan, is this chapter complete?"
    // COMPLETE → return the chapter as-is.
    // Issues found → return the chapter anyway, but attach a completenessNote so
    // the author can review and use the Revise button to fix specific problems.
    // We never auto-append continuation prose — that produces broken seams, leaked
    // meta-instructions, and duplicated sections.
    const artifactOpenIdx = accumulated.indexOf("<ARTIFACT>");
    const planText = (artifactOpenIdx > 0 ? accumulated.slice(0, artifactOpenIdx) : "").trim();

    let completenessNote: string | undefined;

    if (planText && !abort.signal.aborted) {
      let validatorAccumulated = "";
      try {
        const validRes = await fetch(`/api/books/${slug}/agent-chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({
            stageKey,
            chapterContext: chapter.title,
            skipContext: true,   // saves ~54K input tokens — no manifest or prior stages needed
            messages: [
              {
                role: "user",
                content: `You just drafted chapter "${chapter.title}". Your Phase 1 plan was:

${planText}

Current word count: approximately ${extractedContent.split(/\s+/).filter(Boolean).length.toLocaleString()} words.

Review two things:
1. CONTENT — Is every section from your plan present and fully developed? Is the Author's Workbench complete with all questions or exercises written out?
2. DEVELOPMENT — Does each section have enough depth, specificity, and example to do its job — or do any sections feel rushed, thin, or summarized? Compare against your NATURAL LENGTH estimate.

If both are satisfied: output only the word COMPLETE
If there are issues: output only a short bullet list of what is missing or underdeveloped (2–6 bullets). No prose. No explanations. Just the specific gaps the author needs to address.`,
              },
            ],
          }),
        });

        if (validRes.ok && validRes.body) {
          const validReader = validRes.body.getReader();
          const validDecoder = new TextDecoder();
          valid: while (true) {
            const { done, value } = await validReader.read();
            if (done) break;
            const chunk = validDecoder.decode(value, { stream: true });
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") break valid;
              try {
                const { text } = JSON.parse(raw) as { text: string };
                validatorAccumulated += text;
              } catch { /* skip */ }
            }
          }
        }
      } catch { /* validator failed — save chapter without note */ }

      // If NOT "COMPLETE" and has actual content, fire an automatic revision pass
      const trimmed = validatorAccumulated.trim();
      const isComplete = /^\s*COMPLETE[.\s]*$/.test(trimmed)
        || trimmed.replace(/[^a-zA-Z]/g, "").toUpperCase() === "COMPLETE";

      if (!isComplete && trimmed.length > 10) {
        completenessNote = trimmed;

        // ── Auto-revision pass ───────────────────────────────────────────────
        // The validator already identified exactly what's wrong — use that list
        // as precise revision instructions. Full context (manifest materials)
        // so Quill has everything it needs to expand thin sections properly.
        // On success: return clean revised content, no badge.
        // On failure: fall through and save original + show ⚠ for manual review.
        let autoRevised: string | undefined;
        try {
          const revPrompt = `Revise the chapter "${chapter.title}" to address these specific gaps:

${completenessNote}

CURRENT DRAFT — keep everything that works, only fix what is flagged above:
${extractedContent}

Produce the complete revised chapter as a CHAPTER_DRAFT artifact. Same voice, same structure, same Author's Workbench format. Only expand or fix the flagged sections.`;

          const revRes = await fetch(`/api/books/${slug}/agent-chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abort.signal,
            body: JSON.stringify({
              stageKey,
              chapterContext: chapter.title,
              messages: [{ role: "user", content: revPrompt }],
            }),
          });

          if (revRes.ok && revRes.body) {
            let revAccumulated = "";
            const revReader = revRes.body.getReader();
            const revDecoder = new TextDecoder();

            revOuter: while (true) {
              const { done, value } = await revReader.read();
              if (done) break;
              const chunk = revDecoder.decode(value, { stream: true });
              for (const line of chunk.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6).trim();
                if (raw === "[DONE]") break revOuter;
                try {
                  const { text } = JSON.parse(raw) as { text: string };
                  revAccumulated += text;
                  // Show live word count while revision streams in
                  const displayText = revAccumulated
                    .replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "")
                    .replace(/## Quill Package Notes[\s\S]*/g, "")
                    .trim();
                  setChapters((prev) =>
                    prev.map((c) =>
                      c.key === chapter.key ? { ...c, content: displayText || extractedContent } : c
                    )
                  );
                } catch { /* skip */ }
              }
            }

            // Extract revised prose from ARTIFACT block
            const rArtStart = revAccumulated.indexOf("<ARTIFACT>");
            const rArtEnd   = revAccumulated.indexOf("</ARTIFACT>");
            if (rArtStart !== -1 && rArtEnd !== -1) {
              const rJson = revAccumulated.slice(rArtStart + 10, rArtEnd).trim();
              try {
                const rParsed = JSON.parse(rJson) as { content: string };
                if (rParsed.content && rParsed.content.length > 50) autoRevised = rParsed.content;
              } catch {
                const rMatch = rJson.match(/"content"\s*:\s*"([\s\S]+)"\s*\}\s*$/);
                if (rMatch?.[1]) {
                  const rRaw = rMatch[1]
                    .replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
                  if (rRaw.length > 50) autoRevised = rRaw;
                }
              }
            } else {
              // No ARTIFACT wrapper — use raw prose
              const notesIdx = revAccumulated.indexOf("## Quill Package Notes");
              const plain = (notesIdx !== -1 ? revAccumulated.slice(0, notesIdx) : revAccumulated)
                .replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim();
              if (plain.length > 50) autoRevised = plain;
            }
          }
        } catch { /* auto-revision failed — fall through with original + note */ }

        if (autoRevised) {
          return { content: autoRevised }; // note cleared — revision resolved the gaps
        }
      }
    }

    return { content: extractedContent, completenessNote };
  }, [slug, stageKey]);

  // ── Save a chapter draft to DB ───────────────────────────────────────────────
  const saveChapterDraft = useCallback(async (chapter: Chapter, content: string): Promise<string | null> => {
    const res = await fetch(`/api/books/${slug}/agent-chat/chapter-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageKey, chapterKey: chapter.key, chapterTitle: chapter.title, content }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { artifactId: string };
    return data.artifactId;
  }, [slug, stageKey]);

  // ── Run sequentially from a given index ─────────────────────────────────────
  const runFromIndex = useCallback(async (startIdx: number) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const snapshot = chaptersRef.current;
      for (let i = startIdx; i < snapshot.length; i++) {
        if (abort.signal.aborted) break;
        const chapter = chaptersRef.current[i];
        if (!chapter || chapter.status === "approved" || chapter.status === "review") continue;

        // Mark as drafting
        setChapters((prev) =>
          prev.map((c) => (c.key === chapter.key ? { ...c, status: "drafting", content: "" } : c)),
        );

        try {
          const result = await writeChapter(chapter, abort);
          if (abort.signal.aborted) break;

          if (result) {
            const { content, completenessNote } = result;
            const artifactId = await saveChapterDraft(chapter, content);
            setChapters((prev) =>
              prev.map((c) =>
                c.key === chapter.key
                  ? { ...c, status: "review", content, artifactId: artifactId ?? undefined, completenessNote }
                  : c,
              ),
            );
          } else {
            setChapters((prev) =>
              prev.map((c) =>
                c.key === chapter.key
                  ? { ...c, status: "error", errorMsg: "No content produced" }
                  : c,
              ),
            );
          }
        } catch (err) {
          if (abort.signal.aborted) break;
          const msg = err instanceof Error ? err.message : "Error";
          setChapters((prev) =>
            prev.map((c) =>
              c.key === chapter.key ? { ...c, status: "error", errorMsg: msg } : c,
            ),
          );
        }

        // Small yield between chapters
        await new Promise<void>((r) => setTimeout(r, 200));
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
      abortRef.current = null;

      // Auto-approve: if all chapters are drafted with no errors, commit and advance
      if (autoApproveRef.current) {
        autoApproveRef.current = false;
        const final = chaptersRef.current;
        const allDone = final.every((c) => c.status === "review" || c.status === "approved");
        const hasErrors = final.some((c) => c.status === "error");
        if (allDone && !hasErrors) {
          await approveAllRef.current?.();
        }
      }
    }
  }, [writeChapter, saveChapterDraft]);

  // ── Retry a single chapter ───────────────────────────────────────────────────
  const retryChapter = useCallback(async (chapter: Chapter) => {
    setChapters((prev) =>
      prev.map((c) => (c.key === chapter.key ? { ...c, status: "pending", content: undefined, errorMsg: undefined, completenessNote: undefined } : c)),
    );
    // Small delay so state settles, then write just this chapter
    await new Promise<void>((r) => setTimeout(r, 100));
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      setChapters((prev) =>
        prev.map((c) => (c.key === chapter.key ? { ...c, status: "drafting", content: "" } : c)),
      );
      const result = await writeChapter({ ...chapter, status: "drafting" }, abort);
      if (result) {
        const { content, completenessNote } = result;
        const artifactId = await saveChapterDraft(chapter, content);
        setChapters((prev) =>
          prev.map((c) =>
            c.key === chapter.key
              ? { ...c, status: "review", content, artifactId: artifactId ?? undefined, completenessNote }
              : c,
          ),
        );
      } else {
        setChapters((prev) =>
          prev.map((c) =>
            c.key === chapter.key ? { ...c, status: "error", errorMsg: "No content produced" } : c,
          ),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setChapters((prev) =>
        prev.map((c) =>
          c.key === chapter.key ? { ...c, status: "error", errorMsg: msg } : c,
        ),
      );
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, [writeChapter, saveChapterDraft]);

  // ── Save a manually-edited chapter draft ────────────────────────────────────
  const handleSaveEdit = async (chapter: Chapter) => {
    if (!editDraft.trim() || !chapter.artifactId || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/books/${slug}/agent-chat/chapter-draft`, {
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

  // ── Revise a chapter with AI using instructions ──────────────────────────────
  const handleRevise = async (chapter: Chapter) => {
    if (!revisePrompt.trim() || revisingKey) return;
    setRevisingKey(chapter.key);

    const prompt = `Revise the chapter "${chapter.title}" based on these instructions:

${revisePrompt}

CURRENT CHAPTER (revise this — keep what works, apply the requested changes):
${chapter.content ?? ""}

Produce the complete revised chapter as a CHAPTER_DRAFT artifact. Same structure and length range. The artifact contains only the revised prose — no revision notes inside it.`;

    const abort = new AbortController();
    let accumulated = "";

    try {
      const res = await fetch(`/api/books/${slug}/agent-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          stageKey,
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
            const displayText = accumulated.replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim();
            setChapters((prev) =>
              prev.map((c) => c.key === chapter.key ? { ...c, content: displayText } : c)
            );
          } catch { /* skip */ }
        }
      }

      // Extract content (same logic as writeChapter)
      const artStart = accumulated.indexOf("<ARTIFACT>");
      const artEnd = accumulated.indexOf("</ARTIFACT>");
      let newContent: string | null = null;

      if (artStart !== -1 && artEnd !== -1) {
        const jsonStr = accumulated.slice(artStart + 10, artEnd).trim();
        try {
          const parsed = JSON.parse(jsonStr) as { content: string };
          if (parsed.content && parsed.content.length > 50) newContent = parsed.content;
        } catch {
          const contentMatch = jsonStr.match(/"content"\s*:\s*"([\s\S]+)"\s*\}\s*$/);
          if (contentMatch?.[1]) {
            const raw = contentMatch[1]
              .replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
            if (raw.length > 50) newContent = raw;
          }
        }
      }

      if (!newContent) {
        const notesIdx = accumulated.indexOf("## Quill Package Notes");
        newContent = (notesIdx !== -1 ? accumulated.slice(0, notesIdx) : accumulated)
          .replace(/<ARTIFACT>[\s\S]*?<\/ARTIFACT>/g, "").trim() || null;
      }

      if (newContent) {
        // Save via PATCH if we have an artifactId, otherwise create new
        if (chapter.artifactId) {
          await fetch(`/api/books/${slug}/agent-chat/chapter-draft`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ artifactId: chapter.artifactId, content: newContent }),
          });
        } else {
          await saveChapterDraft(chapter, newContent);
        }
        setChapters((prev) =>
          prev.map((c) =>
            c.key === chapter.key ? { ...c, content: newContent!, status: "review", completenessNote: undefined } : c
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

  // ── Approve all and commit the stage ────────────────────────────────────────
  const approveAll = useCallback(async () => {
    const res = await fetch(`/api/books/${slug}/agent-chat/chapter-draft/approve-all`, {
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

  // Keep ref in sync so runFromIndex can call it without a circular dependency
  approveAllRef.current = approveAll;

  // ── Derived state ────────────────────────────────────────────────────────────
  const totalChapters = chapters.length;
  const doneCount = chapters.filter((c) => c.status === "review" || c.status === "approved").length;
  const approvedCount = chapters.filter((c) => c.status === "approved").length;
  const allReviewed = totalChapters > 0 && doneCount === totalChapters;
  const hasErrors = chapters.some((c) => c.status === "error");

  if (!initialized) {
    return (
      <div style={panelStyle}>
        {manifestBuilding ? (
          <div style={{ padding: "40px", color: "#8a7a6a", fontSize: "14px" }}>
            <div style={{ fontSize: "20px", marginBottom: "12px" }}>🗺️</div>
            <div style={{ fontWeight: 600, marginBottom: "6px", color: "#4a3728" }}>Building Chapter Manifest…</div>
            <div style={{ fontSize: "13px" }}>
              Cartographer is pre-assigning your research and stories to each chapter.
              This runs once and cuts drafting context by 85%.
            </div>
          </div>
        ) : (
          <div style={{ padding: "40px", color: "#8a7a6a", fontSize: "14px" }}>Loading chapters…</div>
        )}
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
          {isRunning && (
            <span style={runningBadgeStyle}>
              <span style={spinnerStyle}>⟳</span> Writing…
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
                ▶ Write chapters
              </button>
              <button
                style={writeFullBookBtnStyle}
                onClick={() => {
                  const first = chapters.findIndex((c) => c.status === "pending");
                  if (first >= 0) {
                    autoApproveRef.current = true;
                    void runFromIndex(first);
                  }
                }}
                title="Draft all chapters and auto-commit when done — no review step"
              >
                ▶▶ Write full book
              </button>
            </>
          )}
          {isRunning && (
            <button
              style={stopBtnStyle}
              onClick={() => { abortRef.current?.abort(); }}
            >
              ■ Stop
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
          const isRevising = revisingKey === chapter.key;

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
                  {isRevising && (
                    <div style={draftingProgressStyle}>
                      {chapter.content ? `Revising… ${chapter.content.trim().split(/\s+/).length} words` : "Revising…"}
                    </div>
                  )}
                  {(chapter.status === "review" || chapter.status === "approved") && !isRevising && (
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
                  <StatusPip status={isRevising ? "drafting" : chapter.status} />
                  {(chapter.status === "review" || chapter.status === "approved") && !isRevising && (
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
                        onClick={() => { setExpanded(null); void retryChapter(chapter); }}
                        title="Regenerate this chapter from scratch"
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
                          prev.map((c) => c.key === chapter.key ? { ...c, status: "approved" } : c)
                        )
                      }
                    >
                      ✓
                    </button>
                  )}
                  {chapter.status === "approved" && !isRevising && (
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
                    Tell Quill what to change — be specific. Quill will rewrite the full chapter with your instructions applied.
                  </div>
                  <textarea
                    style={{ ...editTextareaStyle, height: "100px" }}
                    value={revisePrompt}
                    onChange={(e) => setRevisePrompt(e.target.value)}
                    placeholder="e.g. Make the opening more personal. Add more from the Scout research on habit formation. Shorten the middle section. Strengthen the closing turn."
                    disabled={isRevising}
                  />
                  <div style={editFooterStyle}>
                    <span style={{ fontSize: 11, color: "#8a7a6a" }}>
                      {isRevising ? "Quill is revising…" : "Quill will rewrite the full chapter with your changes applied."}
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

const writeFullBookBtnStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "7px",
  border: "none",
  background: "#B8793A",
  color: "#fefbf5",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 600,
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
