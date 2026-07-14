import Link from "next/link";

import {
  approveOutlinePhase,
  commitOutlineStage,
  commitParagraphOutlineFromOutline,
  finalizeOutlinePackage,
  generateOutline,
  generateOutlineToc,
  generateParagraphOutlineFromOutline,
  regenerateChapterBreakdown,
  requestOutlinePhaseChanges,
} from "./actions";
import { OutlinePhaseChat } from "./outline-phase-chat";
import { ChapterGenerationProgress } from "./components/chapter-generation-progress";

import type { BookOutline, OutlineChapter, OutlineSection } from "@/lib/outline-types";
import type {
  ChapterParagraphPlan,
  ParagraphOutline,
  ParagraphPlan,
} from "@/lib/paragraph-outline-types";
import type { OutlinePhaseApprovals, OutlineTocArtifact } from "@/lib/outline-toc-types";
import { getParagraphOutlineWorkspace } from "@/lib/workflows/outline-paragraphs";
import { getOutlineWorkspace } from "@/lib/workflows/outline-public";
import {
  getStoredOutlineTocArtifact,
  normalizeOutlinePhaseApprovals,
  normalizeOutlinePhaseChats,
} from "@/lib/workflows/outline-toc";

type OutlinePhaseId = "sections-chapters" | "chapter-breakdowns" | "full-toc";
type PhaseStatus = "locked" | "pending" | "approved" | "committed";

type OutlineTarget =
  | { type: "section"; section: OutlineSection }
  | { type: "chapter"; section: OutlineSection; chapter: OutlineChapter }
  | null;

type BreakdownTarget =
  | { type: "chapter"; sectionTitle: string; chapter: ChapterParagraphPlan }
  | {
      type: "paragraph";
      sectionTitle: string;
      chapter: ChapterParagraphPlan;
      paragraph: ParagraphPlan;
    }
  | null;

function formatWordCount(value: number | null | undefined) {
  if (!value) {
    return "0";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function toPreviewText(value: string | null | undefined, maxLength = 320) {
  if (!value) {
    return "Not available yet.";
  }

  const cleaned = value
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength).trim()}...`;
}

function getPhaseAccent(status: PhaseStatus) {
  switch (status) {
    case "committed":
      return "#16a34a";
    case "approved":
      return "#2563eb";
    case "pending":
      return "#f59e0b";
    case "locked":
      return "#9ca3af";
  }
}

function isApprovedLike(status: PhaseStatus) {
  return status === "approved" || status === "committed";
}

function getActionPhaseId(phase: OutlinePhaseId) {
  switch (phase) {
    case "sections-chapters":
      return "sectionsChapters" as const;
    case "chapter-breakdowns":
      return "chapterBreakdowns" as const;
    case "full-toc":
      return "fullToc" as const;
  }
}

function getSelectedOutlineTarget(
  outline: BookOutline | null,
  targetType?: string,
  targetId?: string,
): OutlineTarget {
  if (!outline) {
    return null;
  }

  if (targetType === "chapter" && targetId) {
    for (const section of outline.sections) {
      const chapter = section.chapters.find((item) => item.id === targetId);
      if (chapter) {
        return { type: "chapter", section, chapter };
      }
    }
  }

  if (targetType === "section" && targetId) {
    const section = outline.sections.find((item) => item.id === targetId);
    if (section) {
      return { type: "section", section };
    }
  }

  const firstSection = outline.sections[0];
  return firstSection ? { type: "section", section: firstSection } : null;
}

function getSelectedBreakdownTarget(
  breakdown: ParagraphOutline | null,
  targetType?: string,
  targetId?: string,
): BreakdownTarget {
  if (!breakdown) {
    return null;
  }

  if (targetType === "paragraph" && targetId) {
    for (const section of breakdown.sections) {
      for (const chapter of section.chapters) {
        const paragraph = chapter.paragraphs.find((item) => item.id === targetId);
        if (paragraph) {
          return { type: "paragraph", sectionTitle: section.sectionTitle, chapter, paragraph };
        }
      }
    }
  }

  if (targetType === "chapter" && targetId) {
    for (const section of breakdown.sections) {
      const chapter = section.chapters.find((item) => item.chapterId === targetId);
      if (chapter) {
        return { type: "chapter", sectionTitle: section.sectionTitle, chapter };
      }
    }
  }

  const firstSection = breakdown.sections[0];
  const firstChapter = firstSection?.chapters[0];
  return firstSection && firstChapter
    ? { type: "chapter", sectionTitle: firstSection.sectionTitle, chapter: firstChapter }
    : null;
}

function getOutlineChapterById(outline: BookOutline | null, chapterId: string) {
  if (!outline) {
    return null;
  }

  for (const section of outline.sections) {
    const chapter = section.chapters.find((item) => item.id === chapterId);
    if (chapter) {
      return { section, chapter };
    }
  }

  return null;
}

function renderMeWePhaseBadges(phases: string[]) {
  if (!phases.length) {
    return <span className="muted">No phases tagged yet.</span>;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {phases.map((phase) => (
        <span
          key={phase}
          style={{
            borderRadius: 999,
            border: "1px solid var(--line)",
            padding: "6px 10px",
            fontSize: 12,
            background: "rgba(255,255,255,0.07)",
          }}
        >
          {phase}
        </span>
      ))}
    </div>
  );
}

function renderPhaseOneSectionDetail(section: OutlineSection) {
  return (
    <div className="stack">
      <div className="card">
        <div className="label">Section {section.number}</div>
        <h3 style={{ marginTop: 8, marginBottom: 8 }}>{section.title}</h3>
        {section.subtitle ? (
          <div className="muted" style={{ marginBottom: 12 }}>
            {section.subtitle}
          </div>
        ) : null}
        <div style={{ lineHeight: 1.72 }}>{section.description}</div>
      </div>

      <div className="card">
        <h4>Big Idea</h4>
        <p style={{ margin: 0, lineHeight: 1.72, fontWeight: 500 }}>{section.bigIdea}</p>
      </div>

      <div className="card">
        <h4>Why This Section Exists</h4>
        <p style={{ margin: 0, lineHeight: 1.72 }}>{section.whyThisSectionExists}</p>
      </div>

      <div className="card">
        <h4>What It Covers</h4>
        <p style={{ margin: 0, lineHeight: 1.72 }}>{section.whatItCovers}</p>
      </div>

      <div className="card">
        <h4>How It Serves the Larger Story</h4>
        <p style={{ margin: 0, lineHeight: 1.72 }}>{section.howItServesTheLargerStory}</p>
      </div>

      <div className="card">
        <h4>Reader Journey Phases</h4>
        {renderMeWePhaseBadges(section.readerJourneyPhases)}
      </div>

      <div className="card">
        <h4>Word Count Breakdown</h4>
        <div className="metric-row">
          <div className="metric">Section target: {formatWordCount(section.wordCountTarget)}</div>
          <div className="metric">Chapters: {section.chapters.length}</div>
        </div>
        <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
          {section.calculationDisplay}
        </div>
      </div>
    </div>
  );
}

function renderPhaseOneChapterDetail(section: OutlineSection, chapter: OutlineChapter) {
  return (
    <div className="stack">
      <div className="card">
        <div className="label">Chapter {chapter.number}</div>
        <h3 style={{ marginTop: 8, marginBottom: 8 }}>{chapter.title}</h3>
        {chapter.subtitle ? (
          <div className="muted" style={{ marginBottom: 12 }}>
            {chapter.subtitle}
          </div>
        ) : null}
        <div style={{ lineHeight: 1.72 }}>{chapter.description}</div>
      </div>

      <div className="card">
        <h4>Big Idea</h4>
        <p style={{ margin: 0, lineHeight: 1.72, fontWeight: 500 }}>{chapter.bigIdea}</p>
      </div>

      <div className="card">
        <h4>Core Idea</h4>
        <p style={{ margin: 0, lineHeight: 1.72 }}>{chapter.coreIdea}</p>
      </div>

      <div className="card">
        <h4>What Gets Conveyed</h4>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
          {chapter.whatGetsConveyed.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h4>Why This Chapter Exists</h4>
        <p style={{ margin: 0, lineHeight: 1.72 }}>{chapter.whyThisChapterExists}</p>
      </div>

      <div className="card">
        <h4>How It Tells the Story</h4>
        <div className="metric-row">
          <div className="metric">Technique: {chapter.storytellingTechnique}</div>
          <div className="metric">Section: {section.title}</div>
          <div className="metric">Target: {formatWordCount(chapter.wordCountTarget)} words</div>
        </div>
      </div>

      <div className="card">
        <h4>Phase 1 Scope</h4>
        <p style={{ margin: 0, lineHeight: 1.72 }}>
          This phase is intentionally limited to the section-and-chapter architecture.
          Hooks, voice emphasis, audience nuance, and paragraph-level skeletons get pressure-tested
          in later phases instead of overloading the outline.
        </p>
      </div>
    </div>
  );
}

function renderPhaseTwoChapterDetail(
  breakdownChapter: ChapterParagraphPlan,
  outlineChapter: OutlineChapter | null,
  selectedParagraphId?: string,
  slug?: string,
) {
  return (
    <div className="stack">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="label">Chapter {breakdownChapter.chapterNumber}</div>
            <h3 style={{ marginTop: 8, marginBottom: 8 }}>{breakdownChapter.chapterTitle}</h3>
            <div style={{ lineHeight: 1.72 }}>{breakdownChapter.chapterDescription}</div>
          </div>
          {slug ? (
            <form action={regenerateChapterBreakdown.bind(null, slug, breakdownChapter.chapterId)} style={{ flexShrink: 0 }}>
              <button className="btn btn-sm" type="submit" title="Regenerate this chapter's breakdown">
                ↻ Regenerate
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {outlineChapter ? (
        <>
          <div className="card">
            <h4>Locked Chapter Intent</h4>
            <p style={{ margin: 0, lineHeight: 1.72 }}>{outlineChapter.coreIdea}</p>
          </div>

          <div className="card">
            <h4>Chapter Notes from Phase 1</h4>
            <div className="metric-row">
              <div className="metric">Technique: {outlineChapter.storytellingTechnique}</div>
              <div className="metric">Structure: {outlineChapter.internalStructureLabel}</div>
            </div>
            <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
              Opening hook: {outlineChapter.openingHook}
            </div>
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
              Closing bridge: {outlineChapter.closingBridge}
            </div>
          </div>
        </>
      ) : null}

      <div className="card">
        <h4>Breakdown Summary</h4>
        <div className="metric-row">
          <div className="metric">
            Total words: {formatWordCount(breakdownChapter.chapterWordCountTarget)}
          </div>
          <div className="metric">Paragraphs: {breakdownChapter.paragraphs.length}</div>
        </div>
        <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
          {breakdownChapter.calculationDisplay}
        </div>
      </div>

      <div className="card">
        <h4>Structural Mapping</h4>
        <div className="muted" style={{ marginBottom: 12 }}>
          {breakdownChapter.structureLabel ?? "Chapter flow"}
        </div>
        <div className="stack" style={{ padding: 0 }}>
          {breakdownChapter.structureBlocks.map((block) => (
            <div key={`${block.label}-${block.paragraphRange}`}>
              <strong>
                {block.label} · {block.paragraphRange} · {formatWordCount(block.wordCountTarget)} words
              </strong>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h4>Paragraph Blueprints</h4>
        <div className="stack" style={{ padding: 0 }}>
          {breakdownChapter.paragraphs.map((paragraph) => {
            const selected = paragraph.id === selectedParagraphId;
            return (
              <div
                key={paragraph.id}
                style={{
                  borderRadius: 18,
                  border: selected ? "2px solid rgba(184,121,58,0.3)" : "1px solid rgba(255,255,255,0.08)",
                  padding: 14,
                  background: selected
                    ? "rgba(184,121,58,0.12)"
                    : "rgba(255,255,255,0.05)",
                }}
              >
                <div className="metric-row">
                  <strong>Para {paragraph.number}</strong>
                  <div className="metric">{formatWordCount(paragraph.wordCountTarget)} words</div>
                </div>
                <div style={{ marginTop: 10, lineHeight: 1.7 }}>
                  <strong>Main Idea:</strong> {paragraph.mainIdea}
                </div>
                <div style={{ marginTop: 10, lineHeight: 1.7 }}>
                  <strong>Purpose:</strong> {paragraph.purpose}
                </div>
                <div style={{ marginTop: 10, lineHeight: 1.7 }}>
                  <strong>Content Type:</strong> {paragraph.contentType}
                </div>
                <div style={{ marginTop: 10, lineHeight: 1.7 }}>
                  <strong>Hook:</strong> {paragraph.hook || "[No hook]"}
                </div>
                {paragraph.structuralElement ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Structural element: {paragraph.structuralElement}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function renderOutlineProgressTracker(input: {
  slug: string;
  currentPhase: OutlinePhaseId;
  phaseStatuses: Record<OutlinePhaseId, PhaseStatus>;
  hasPhaseOneDraft: boolean;
  hasPhaseTwoDraft: boolean;
  hasPhaseThreeDraft: boolean;
}) {
  const phases: Array<{
    id: OutlinePhaseId;
    label: string;
    description: string;
    enabled: boolean;
    hasDraft: boolean;
  }> = [
    {
      id: "sections-chapters",
      label: "Phase 1 · Sections & Chapters",
      description: "Lock the section and chapter architecture first.",
      enabled: true,
      hasDraft: input.hasPhaseOneDraft,
    },
    {
      id: "chapter-breakdowns",
      label: "Phase 2 · Chapter Breakdowns",
      description: "Break every locked chapter into paragraph blueprints.",
      enabled: input.phaseStatuses["chapter-breakdowns"] !== "locked",
      hasDraft: input.hasPhaseTwoDraft,
    },
    {
      id: "full-toc",
      label: "Phase 3 · Full ToC",
      description: "Review the complete section > chapter > paragraph package before Base Story.",
      enabled: input.phaseStatuses["full-toc"] !== "locked",
      hasDraft: input.hasPhaseThreeDraft,
    },
  ];

  const approvedCount = Object.values(input.phaseStatuses).filter((status) =>
    isApprovedLike(status),
  ).length;
  const total = phases.length;
  const percentage = Math.round((approvedCount / total) * 100);

  const getStatusDot = (status: PhaseStatus, hasDraft: boolean) => {
    if (status === "committed" || status === "approved") return "#16a34a";
    if (status === "locked") return "#9ca3af";
    return hasDraft ? "#f59e0b" : "#ef4444";
  };

  const getStatusIcon = (status: PhaseStatus, hasDraft: boolean) => {
    if (status === "committed" || status === "approved") return "✓";
    if (status === "locked") return "■";
    return hasDraft ? "⏳" : "○";
  };

  return (
    <section
      className="glass-panel section-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 4px" }}>Outline Document Progress</h3>
          <div className="muted">{approvedCount} of {total} phases approved</div>
        </div>
        <div
          style={{
            flex: 2,
            height: 8,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${percentage}%`,
              height: "100%",
              background: "#16a34a",
              transition: "width 0.2s ease",
            }}
          />
        </div>
        <div style={{ minWidth: 42, textAlign: "right", color: "#16a34a", fontWeight: 700 }}>
          {percentage}%
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {phases.map((phase) => {
          const status = input.phaseStatuses[phase.id];
          const active = input.currentPhase === phase.id;
          const accent = getPhaseAccent(status);
          const dot = getStatusDot(status, phase.hasDraft);
          const icon = getStatusIcon(status, phase.hasDraft);

          return phase.enabled ? (
            <Link
              key={phase.id}
              href={`/books/${input.slug}?stage=OUTLINE&phase=${phase.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                border: active
                  ? `2px solid ${accent}`
                  : "1px solid rgba(255,255,255,0.08)",
                background: active
                  ? "rgba(255,255,255,0.09)"
                  : "rgba(255,255,255,0.04)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span style={{ fontSize: 14 }}>{icon}</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{phase.label}</span>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: dot,
                  flexShrink: 0,
                }}
              />
            </Link>
          ) : (
            <div
              key={phase.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                color: "#6a5a4a",
              }}
            >
              <span style={{ fontSize: 14 }}>■</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{phase.label}</span>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#9ca3af",
                  flexShrink: 0,
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function renderCurrentPhaseBanner(input: {
  currentPhase: OutlinePhaseId;
  status: PhaseStatus;
  hasDraft: boolean;
}) {
  const title =
    input.currentPhase === "sections-chapters"
      ? "All Sections & Chapters Approved!"
      : input.currentPhase === "chapter-breakdowns"
        ? "All Chapter Breakdowns Approved!"
        : "Full Table of Contents Approved!";

  const description =
    input.currentPhase === "sections-chapters"
      ? 'Your outline architecture is ready to commit. Click "Commit Outline" to proceed to Chapter Breakdowns.'
      : input.currentPhase === "chapter-breakdowns"
        ? 'Your paragraph blueprints are ready to commit. Click "Commit Outline" to proceed to the final ToC.'
        : 'Your validated ToC is ready to commit. Click "Commit Outline" to proceed to Base Story.';

  if (input.status === "approved") {
    return (
      <section
        className="glass-panel section-panel"
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 16px",
          background: "rgba(74,124,89,0.15)",
          border: "1px solid rgba(74,124,89,0.3)",
        }}
      >
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#e8d5b0" }}>
            {title}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#c9a96e", lineHeight: 1.45 }}>
            {description}
          </p>
        </div>
      </section>
    );
  }

  if (input.hasDraft) {
    return (
      <section
        className="glass-panel section-panel"
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 16px",
          background: "rgba(184,121,58,0.12)",
          border: "1px solid rgba(184,121,58,0.3)",
        }}
      >
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#e8d5b0" }}>
            This phase needs approval
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#c9a96e", lineHeight: 1.45 }}>
            Review the current output and approve this phase to unlock the Commit Outline button.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="glass-panel section-panel"
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 16px",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div>
        <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#e8d5b0" }}>
          Generate this phase first
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "#6a5a4a", lineHeight: 1.45 }}>
          Once this phase has content, you can review it, approve it, and move forward.
        </p>
      </div>
    </section>
  );
}

function renderChapterGenerationProgress(
  slug: string,
  isGenerating: boolean,
) {
  return (
    <section className="glass-panel section-panel">
      <ChapterGenerationProgress bookSlug={slug} isGenerating={isGenerating} />
    </section>
  );
}

function renderOutlineGenerationStatus(outline: BookOutline | null) {
  const meta = outline?.generationMeta;

  if (!meta || meta.source === "unknown") {
    return null;
  }

  if (meta.source === "fallback") {
    return (
      <section
        className="glass-panel section-panel"
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 16px",
          background: "rgba(184,121,58,0.08)",
          border: "1px solid rgba(184,121,58,0.3)",
        }}
      >
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#e8d5b0" }}>
            This outline generation fell back before saving a real draft
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#6a5a4a", lineHeight: 1.5 }}>
            Sonnet did not complete successfully, so the app kept the prior outline state and only used the local scaffold for diagnostics.
            {meta.reason ? ` Last failure: ${meta.reason}` : ""}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="glass-panel section-panel"
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 16px",
        background: "rgba(74,124,89,0.12)",
        border: "1px solid rgba(74,124,89,0.3)",
      }}
    >
      <div>
        <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#e8d5b0" }}>
          Sonnet generated the current outline draft
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "#6a5a4a", lineHeight: 1.5 }}>
          This draft came from {meta.model ?? "Claude Sonnet"} rather than the local scaffold.
        </p>
      </div>
    </section>
  );
}

function renderPhaseApprovalCard(input: {
  slug: string;
  phase: "sectionsChapters" | "chapterBreakdowns" | "fullToc";
  approval: OutlinePhaseApprovals["sectionsChapters"];
  title: string;
  canApprove: boolean;
  pendingTitle: string;
  pendingDescription: string;
  approvedTitle: string;
  approvedDescription: string;
}) {
  return (
    <div
      className="card"
      style={{
        border:
          input.approval.status === "approved"
            ? "1px solid rgba(74,124,89,0.3)"
            : "1px solid rgba(184,121,58,0.3)",
        background:
          input.approval.status === "approved"
            ? "rgba(74,124,89,0.15)"
            : "rgba(184,121,58,0.12)",
      }}
    >
      <h3>{input.title}</h3>
      <div
        style={{
          display: "grid",
          gap: 8,
          marginTop: 10,
        }}
      >
        <div style={{ fontWeight: 600 }}>
          {input.approval.status === "approved"
            ? input.approvedTitle
            : input.pendingTitle}
        </div>
        <div className="muted" style={{ lineHeight: 1.65 }}>
          {input.approval.status === "approved"
            ? input.approvedDescription
            : input.canApprove
              ? input.pendingDescription
              : "Generate this phase first, then approve it once you've reviewed the output."}
        </div>
        <div className="button-row" style={{ justifyContent: "flex-start" }}>
          {input.approval.status !== "approved" ? (
            <form action={approveOutlinePhase.bind(null, input.slug, input.phase)}>
              <button className="btn btn-primary" disabled={!input.canApprove} type="submit">
                Approve Phase
              </button>
            </form>
          ) : null}
          {input.approval.status === "approved" ? (
            <form action={requestOutlinePhaseChanges.bind(null, input.slug, input.phase)}>
              <button className="btn" type="submit">
                Request Changes
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function renderFullToc(
  tocArtifact: OutlineTocArtifact,
  slug: string,
) {
  return (
    <section className="workspace-grid outline-workspace-grid">
      <section className="glass-panel section-panel paper-wrap" style={{ gridColumn: "1 / -1" }}>
        <article className="paper research-paper">
          <div className="toc-kicker">Full Table of Contents</div>
          <h3>{tocArtifact.workingTitle}</h3>
          {tocArtifact.subtitle ? (
            <div className="muted" style={{ marginBottom: 16 }}>
              {tocArtifact.subtitle}
            </div>
          ) : null}

          <div className="stack research-stack" style={{ padding: 0 }}>
            <div className="card">
              <h4>Executive Overview</h4>
              <p style={{ margin: 0, lineHeight: 1.82 }}>{tocArtifact.executiveOverview}</p>
            </div>

            <div className="card">
              <h4>Verification Report</h4>
              <div className="metric-row">
                <div className="metric">
                  Sections: {tocArtifact.verificationReport.structureSummary.sections}
                </div>
                <div className="metric">
                  Chapters: {tocArtifact.verificationReport.structureSummary.chapters}
                </div>
                <div className="metric">
                  Paragraphs: {tocArtifact.verificationReport.structureSummary.paragraphs}
                </div>
                <div className="metric">
                  Book total: {formatWordCount(tocArtifact.totalWordCount)}
                </div>
              </div>
              <div className="stack" style={{ padding: 0, marginTop: 14 }}>
                {tocArtifact.verificationReport.wordCountChecks.map((item) => (
                  <div key={item} className="muted" style={{ lineHeight: 1.65 }}>
                    {item}
                  </div>
                ))}
                {tocArtifact.verificationReport.structuralIntegrityChecks.map((item) => (
                  <div key={item} className="muted" style={{ lineHeight: 1.65 }}>
                    {item}
                  </div>
                ))}
                {tocArtifact.verificationReport.dataCompletenessChecks.map((item) => (
                  <div key={item} className="muted" style={{ lineHeight: 1.65 }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {tocArtifact.sections.map((section) => {
              return (
                <section className="dossier-section" key={section.id}>
                  <div className="dossier-heading">
                    <div>
                      <div className="label">Section {section.number}</div>
                      <h4>{section.title}</h4>
                    </div>
                    <div className="metric">{formatWordCount(section.wordCountTarget)} words</div>
                  </div>

                  <details className="dossier-packet" open>
                    <summary>Section Role</summary>
                    <div className="dossier-packet-body">
                      <p style={{ margin: 0, lineHeight: 1.8 }}>{section.description}</p>
                      <p style={{ margin: "12px 0 0", lineHeight: 1.8 }}>
                        <strong>Why this section exists:</strong> {section.whyThisSectionExists}
                      </p>
                      <p style={{ margin: "12px 0 0", lineHeight: 1.8 }}>
                        <strong>What it covers:</strong> {section.whatItCovers}
                      </p>
                      <p style={{ margin: "12px 0 0", lineHeight: 1.8 }}>
                        <strong>How it serves the larger story:</strong>{" "}
                        {section.howItServesTheStory}
                      </p>
                      <p style={{ margin: "12px 0 0", lineHeight: 1.8 }}>
                        <strong>Section Total:</strong> {formatWordCount(section.chapterWordCountTotal)} words ✓
                      </p>
                    </div>
                  </details>

                  {section.chapters.map((chapter) => {
                    return (
                  <details className="dossier-packet" key={chapter.id}>
                        <summary>
                          Chapter {chapter.number}: {chapter.title}
                        </summary>
                        <div className="dossier-packet-body">
                          <div className="metric-row" style={{ marginBottom: 12 }}>
                            <div className="metric">
                              {formatWordCount(chapter.wordCountTarget)} words
                            </div>
                            <div className="metric">
                              {chapter.paragraphs.length} paragraphs
                            </div>
                            <Link className="btn" href={`/books/${slug}?stage=OUTLINE&phase=chapter-breakdowns&targetType=chapter&targetId=${chapter.id}`}>
                              Open Phase 2 View
                            </Link>
                          </div>

                          <p style={{ margin: 0, lineHeight: 1.8 }}>{chapter.description}</p>
                          <p style={{ margin: "12px 0 0", lineHeight: 1.8 }}>
                            <strong>Core idea:</strong> {chapter.coreIdea}
                          </p>
                          <p style={{ margin: "12px 0 0", lineHeight: 1.8 }}>
                            <strong>Why this chapter exists:</strong> {chapter.whyThisChapterExists}
                          </p>
                          <div style={{ marginTop: 12 }}>
                            <strong>What gets conveyed:</strong>
                            <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                              {chapter.whatGetsConveyed.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>

                          {chapter.paragraphs.length > 0 ? (
                            <details className="dossier-packet" style={{ marginTop: 14 }}>
                              <summary>
                                Paragraph Blueprints ({chapter.paragraphs.length}) ·{" "}
                                {formatWordCount(chapter.paragraphWordCountTotal)} words
                              </summary>
                              <div className="dossier-packet-body">
                                <div className="stack" style={{ padding: 0 }}>
                                  {chapter.paragraphs.map((paragraph) => (
                                    <div
                                      key={paragraph.id}
                                      style={{
                                        borderRadius: 16,
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        padding: 14,
                                        background: "rgba(255,255,255,0.05)",
                                      }}
                                    >
                                      <div className="metric-row">
                                        <strong>Para {paragraph.number}</strong>
                                        <div className="metric">
                                          {formatWordCount(paragraph.wordCountTarget)} words
                                        </div>
                                      </div>
                                      <div style={{ marginTop: 8, lineHeight: 1.7 }}>
                                        <strong>Main Idea:</strong> {paragraph.mainIdea}
                                      </div>
                                      <div style={{ marginTop: 8, lineHeight: 1.7 }}>
                                        <strong>Purpose:</strong> {paragraph.purpose}
                                      </div>
                                      <div style={{ marginTop: 8, lineHeight: 1.7 }}>
                                        <strong>Content Type:</strong> {paragraph.contentType}
                                      </div>
                                      <div style={{ marginTop: 8, lineHeight: 1.7 }}>
                                        <strong>Hook:</strong> {paragraph.hook || "[No hook]"}
                                      </div>
                                      {paragraph.structuralElement ? (
                                        <div className="muted" style={{ marginTop: 8 }}>
                                          Structural element: {paragraph.structuralElement}
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                  <div className="metric-row">
                                    <strong>Chapter Total</strong>
                                    <div className="metric">
                                      {formatWordCount(chapter.paragraphWordCountTotal)} words ✓
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </details>
                          ) : (
                            <div className="empty-state" style={{ marginTop: 14 }}>
                              Commit Phase 2 to see the paragraph-level ToC.
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </section>
              );
            })}

            <div className="card">
              <h4>Word Count Summary</h4>
              <div className="stack" style={{ padding: 0 }}>
                {tocArtifact.wordCountSummary.map((section) => (
                  <div key={section.sectionTitle}>
                    <strong>
                      {section.sectionTitle} — {formatWordCount(section.sectionWordCount)} words ({section.percentOfBook}% of book)
                    </strong>
                    <div className="muted" style={{ marginTop: 6, lineHeight: 1.65 }}>
                      {section.chapters
                        .map(
                          (chapter) =>
                            `${chapter.chapterTitle} — ${formatWordCount(chapter.chapterWordCount)} words (${chapter.percentOfSection}% of section)`,
                        )
                        .join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h4>Reader Journey Phase Mapping</h4>
              <div className="stack" style={{ padding: 0 }}>
                {tocArtifact.readerJourneyMapping.map((entry) => (
                  <div key={entry.phase}>
                    <strong>{entry.phase}</strong>
                    <div className="muted" style={{ marginTop: 6, lineHeight: 1.65 }}>
                      Sections: {entry.sectionNumbers.length > 0 ? entry.sectionNumbers.join(", ") : "Distributed"}
                    </div>
                    <div className="muted" style={{ marginTop: 4, lineHeight: 1.65 }}>
                      Word allocation: {formatWordCount(entry.wordAllocation)} words
                    </div>
                    <div className="muted" style={{ marginTop: 4, lineHeight: 1.65 }}>
                      {entry.explanation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
      </section>
    </section>
  );
}

/**
 * The Outline room — Outline stage content, shared between the Book Studio
 * (rendered as the OUTLINE stage slot) and the retired standalone view.
 * Server component: fetches the outline/paragraph workspaces itself.
 *
 * Includes the real 3-phase approval mechanism (sections & chapters →
 * chapter breakdowns → full ToC), each with its own OutlinePhaseChat —
 * distinct from the generic AgentChatPanel used by most other stages.
 */
export async function OutlineDetailContent({
  slug,
  query,
}: {
  slug: string;
  query: { phase?: string; targetType?: string; targetId?: string };
}) {

  const [outlineWorkspace, paragraphWorkspace] = await Promise.all([
    getOutlineWorkspace(slug),
    getParagraphOutlineWorkspace(slug),
  ]);

  const latestOutline = outlineWorkspace.latestOutline;
  const committedOutline = outlineWorkspace.committedOutline;
  const latestBreakdown = paragraphWorkspace.latestParagraphOutline;
  const committedBreakdown = paragraphWorkspace.committedParagraphOutline;
  const phaseApprovals = normalizeOutlinePhaseApprovals(
    outlineWorkspace.outlineStage?.metadataJson,
  );
  const phaseChats = normalizeOutlinePhaseChats(
    outlineWorkspace.outlineStage?.metadataJson,
  );
  const tocArtifact = getStoredOutlineTocArtifact(
    outlineWorkspace.outlineStage?.metadataJson,
  );

  const phaseStatuses: Record<OutlinePhaseId, PhaseStatus> = {
    "sections-chapters": committedOutline
      ? "committed"
      : phaseApprovals.sectionsChapters.status === "approved"
        ? "approved"
        : "pending",
    "chapter-breakdowns": !committedOutline
      ? "locked"
      : committedBreakdown
        ? "committed"
        : phaseApprovals.chapterBreakdowns.status === "approved"
          ? "approved"
          : "pending",
    "full-toc": !committedBreakdown
      ? "locked"
      : outlineWorkspace.outlineStage?.status === "COMMITTED"
        ? "committed"
        : phaseApprovals.fullToc.status === "approved"
          ? "approved"
          : "pending",
  };

  const requestedPhase = query.phase;
  const currentPhase: OutlinePhaseId =
    requestedPhase === "chapter-breakdowns" && phaseStatuses["chapter-breakdowns"] !== "locked"
      ? "chapter-breakdowns"
      : requestedPhase === "full-toc" && phaseStatuses["full-toc"] !== "locked"
        ? "full-toc"
        : requestedPhase === "sections-chapters"
          ? "sections-chapters"
          : !committedOutline
            ? "sections-chapters"
            : !committedBreakdown
              ? "chapter-breakdowns"
              : "full-toc";

  const outlineSelection = getSelectedOutlineTarget(
    latestOutline,
    query.targetType,
    query.targetId,
  );
  const breakdownSelection = getSelectedBreakdownTarget(
    latestBreakdown,
    query.targetType,
    query.targetId,
  );

  const selectedOutlineChapter =
    breakdownSelection?.type === "chapter"
      ? getOutlineChapterById(committedOutline ?? latestOutline, breakdownSelection.chapter.chapterId)
      : breakdownSelection?.type === "paragraph"
        ? getOutlineChapterById(committedOutline ?? latestOutline, breakdownSelection.chapter.chapterId)
        : null;

  const phaseTitle =
    currentPhase === "sections-chapters"
      ? "Phase 1 · Sections & Chapters"
      : currentPhase === "chapter-breakdowns"
        ? "Phase 2 · Chapter Breakdowns"
        : "Phase 3 · Full ToC";

  const phaseSubtitle =
    currentPhase === "sections-chapters"
      ? "Lock the section and chapter architecture before deeper expansion."
      : currentPhase === "chapter-breakdowns"
        ? "Build paragraph blueprints for every chapter from the locked outline."
        : "Review the complete table of contents package before Base Story begins. Research stays manual.";
  const currentPhaseStatus = phaseStatuses[currentPhase];
  const currentPhaseHasDraft =
    currentPhase === "sections-chapters"
      ? Boolean(latestOutline)
      : currentPhase === "chapter-breakdowns"
        ? Boolean(latestBreakdown)
        : Boolean(tocArtifact);
  const selectedPhaseOneTargetLabel =
    outlineSelection?.type === "section"
      ? `Section ${outlineSelection.section.number}: ${outlineSelection.section.title}`
      : outlineSelection?.type === "chapter"
        ? `Chapter ${outlineSelection.chapter.number}: ${outlineSelection.chapter.title}`
        : undefined;
  const selectedPhaseTwoTargetLabel =
    breakdownSelection?.type === "chapter"
      ? `Chapter ${breakdownSelection.chapter.chapterNumber}: ${breakdownSelection.chapter.chapterTitle}`
      : breakdownSelection?.type === "paragraph"
        ? `Paragraph ${breakdownSelection.paragraph.number} in Chapter ${breakdownSelection.chapter.chapterNumber}`
        : undefined;

  return (
    <div className="page-shell" style={{ gridTemplateColumns: "minmax(0,1fr) 360px", flex: 1, minHeight: 0, overflow: "auto" }}>
      <main className="main-column">
        <section className="glass-panel topbar">
          <div>
            <div className="label">Stage Workspace</div>
            <h2>Outline</h2>
            <div className="muted">{phaseSubtitle}</div>
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}/promise`}>
              Back to Promise
            </Link>
            <Link className="btn" href={`/books/${slug}/dashboard`}>
              Open Dashboard
            </Link>

            {currentPhase === "sections-chapters" ? (
              <>
                <form action={generateOutline.bind(null, slug)}>
                  <input
                    name="note"
                    type="hidden"
                    value="Generate the section and chapter architecture for Phase 1 from the locked Book Pitch."
                  />
                  <button
                    className="btn"
                    disabled={outlineWorkspace.outlineReadiness.status !== "ready"}
                    type="submit"
                  >
                    {latestOutline?.generationMeta?.source === "fallback"
                      ? "Retry Generation"
                      : latestOutline
                        ? "Regenerate Outline"
                        : "Generate Outline"}
                  </button>
                </form>
                <form action={commitOutlineStage.bind(null, slug)}>
                  <button
                    className="btn btn-primary"
                    disabled={
                      !latestOutline || phaseApprovals.sectionsChapters.status !== "approved"
                    }
                    type="submit"
                  >
                    Commit Outline
                  </button>
                </form>
              </>
            ) : null}

            {currentPhase === "chapter-breakdowns" ? (
              <>
                <Link className="btn" href={`/books/${slug}?stage=OUTLINE&phase=sections-chapters`}>
                  Back to Phase 1
                </Link>
                <form action={generateParagraphOutlineFromOutline.bind(null, slug)}>
                  <button
                    className="btn"
                    disabled={paragraphWorkspace.readiness.status !== "ready"}
                    type="submit"
                  >
                    {latestBreakdown ? "Regenerate Breakdowns" : "Generate Chapter Breakdowns"}
                  </button>
                </form>
                <form action={commitParagraphOutlineFromOutline.bind(null, slug)}>
                  <button
                    className="btn btn-primary"
                    disabled={
                      !latestBreakdown ||
                      phaseApprovals.chapterBreakdowns.status !== "approved" ||
                      paragraphWorkspace.commitReadiness.status !== "ready"
                    }
                    title={
                      paragraphWorkspace.commitReadiness.status !== "ready"
                        ? paragraphWorkspace.commitReadiness.nextMoves.join(" ")
                        : undefined
                    }
                    type="submit"
                  >
                    Commit Outline
                  </button>
                </form>
              </>
            ) : null}

            {currentPhase === "full-toc" ? (
              <>
                <Link className="btn" href={`/books/${slug}?stage=OUTLINE&phase=chapter-breakdowns`}>
                  Back to Phase 2
                </Link>
                <form action={generateOutlineToc.bind(null, slug)}>
                  <button
                    className="btn"
                    disabled={!committedOutline || !committedBreakdown}
                    type="submit"
                  >
                    {tocArtifact ? "Regenerate Table of Contents" : "Generate Table of Contents"}
                  </button>
                </form>
                <form action={finalizeOutlinePackage.bind(null, slug)}>
                  <button
                    className="btn btn-primary"
                    disabled={!tocArtifact || phaseApprovals.fullToc.status !== "approved"}
                    type="submit"
                  >
                    Commit Outline
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </section>

        {renderOutlineProgressTracker({
          slug,
          currentPhase,
          phaseStatuses,
          hasPhaseOneDraft: Boolean(latestOutline),
          hasPhaseTwoDraft: Boolean(latestBreakdown),
          hasPhaseThreeDraft: Boolean(tocArtifact),
        })}

        {renderCurrentPhaseBanner({
          currentPhase,
          status: currentPhaseStatus,
          hasDraft: currentPhaseHasDraft,
        })}

        {currentPhase === "sections-chapters"
          ? renderOutlineGenerationStatus(latestOutline)
          : null}

        {currentPhase === "chapter-breakdowns"
          ? renderChapterGenerationProgress(slug, true)
          : null}

        <section className="glass-panel section-panel">
          <div className="section-header">
            <h3>{phaseTitle}</h3>
            <div className="muted">
              {outlineWorkspace.bookPromiseReport
                ? "The locked Book Pitch and Promise work remain the governing blueprint."
                : "Lock the Book Pitch before outlining."}
            </div>
          </div>

          <div className="stack">
            {outlineWorkspace.bookPromiseReport ? (
              <>
                <div className="card">
                  <h4>Promise Statement</h4>
                  <p style={{ margin: 0, lineHeight: 1.72 }}>
                    {toPreviewText(
                      outlineWorkspace.committedPromise?.promiseStatement ??
                        outlineWorkspace.bookPromiseReport.corePromise,
                    )}
                  </p>
                </div>
                <div className="card">
                  <h4>Book Pitch Anchor</h4>
                  <div className="metric-row">
                    <div className="metric">
                      Title: {outlineWorkspace.bookPromiseReport.title}
                    </div>
                    <div className="metric">
                      Target words: {formatWordCount(outlineWorkspace.bookSetupProfile?.targetWordCount)}
                    </div>
                  </div>
                  <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
                    {toPreviewText(outlineWorkspace.bookPromiseReport.corePromise)}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">
                Lock the Book Pitch before generating the outline phases.
              </div>
            )}
          </div>
        </section>

        {currentPhase === "sections-chapters" ? (
          <section className="workspace-grid outline-workspace-grid">
            <section className="glass-panel section-panel paper-wrap">
              <div className="paper toc-paper">
                <div className="toc-kicker">Phase 1 Navigator</div>
                <h3>{latestOutline?.workingTitle ?? outlineWorkspace.book.titleWorking ?? "Book Outline"}</h3>
                {latestOutline?.subtitle ? (
                  <div className="muted" style={{ marginBottom: 16 }}>
                    {latestOutline.subtitle}
                  </div>
                ) : null}

                {latestOutline ? (
                  <div className="toc-list">
                    {latestOutline.sections.map((section) => (
                      <article className="toc-entry" key={section.id}>
                        <Link
                          href={`/books/${slug}?stage=OUTLINE&phase=sections-chapters&targetType=section&targetId=${section.id}`}
                          className="toc-link"
                        >
                          <div className="toc-line">
                            <span className="toc-number">Section {section.number}</span>
                            <span className="toc-title">{section.title}</span>
                          </div>
                          <p className="toc-description">
                            {section.description}
                            <br />
                            <strong>{formatWordCount(section.wordCountTarget)} words</strong>
                          </p>
                        </Link>

                        <div className="toc-sublist">
                          {section.chapters.map((chapter) => (
                            <div className="toc-subentry" key={chapter.id}>
                              <Link
                                href={`/books/${slug}?stage=OUTLINE&phase=sections-chapters&targetType=chapter&targetId=${chapter.id}`}
                                className="toc-section-link"
                              >
                                <div className="toc-subtitle">
                                  Chapter {chapter.number}: {chapter.title}
                                </div>
                                <div className="toc-subdescription">{chapter.description}</div>
                                <div className="muted" style={{ marginTop: 6 }}>
                                  {formatWordCount(chapter.wordCountTarget)} words
                                </div>
                              </Link>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: 0 }}>
                    Generate Phase 1 to see the section and chapter architecture.
                  </div>
                )}
              </div>
            </section>

            <section className="glass-panel section-panel">
              {latestOutline ? (
                <div className="stack">
                  <div className="card">
                    <div className="label">Outline Overview</div>
                    <h3 style={{ marginTop: 8, marginBottom: 10 }}>{latestOutline.workingTitle}</h3>
                    <p style={{ margin: 0, lineHeight: 1.75 }}>{latestOutline.overview}</p>
                    <div className="muted" style={{ marginTop: 12, lineHeight: 1.7 }}>
                      {latestOutline.structureRationale}
                    </div>
                  </div>

                  <div className="card">
                    <h4>Word Count Verification</h4>
                    <div className="metric-row">
                      <div className="metric">
                        Book target: {formatWordCount(latestOutline.wordCountVerification.bookTargetWordCount)}
                      </div>
                      <div className="metric">
                        Sections: {formatWordCount(latestOutline.wordCountVerification.sectionWordCountTotal)}
                      </div>
                      <div className="metric">
                        Chapters: {formatWordCount(latestOutline.wordCountVerification.chapterWordCountTotal)}
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <h4>Reader Journey Phase Mapping</h4>
                    <div className="stack" style={{ padding: 0 }}>
                      {latestOutline.readerJourneyMapping.map((entry) => (
                        <div key={entry.phase}>
                          <strong>{entry.phase}</strong>
                          <div className="muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
                            Sections:{" "}
                            {entry.sectionNumbers.length > 0
                              ? entry.sectionNumbers.join(", ")
                              : "Distributed across the book"}
                          </div>
                          <div className="muted" style={{ marginTop: 4, lineHeight: 1.6 }}>
                            {entry.explanation}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {outlineSelection?.type === "section"
                    ? renderPhaseOneSectionDetail(outlineSelection.section)
                    : outlineSelection?.type === "chapter"
                      ? renderPhaseOneChapterDetail(
                          outlineSelection.section,
                          outlineSelection.chapter,
                        )
                      : null}
                </div>
              ) : (
                <div className="empty-state">
                  Generate Phase 1 to review the structure.
                </div>
              )}
            </section>
          </section>
        ) : null}

        {currentPhase === "chapter-breakdowns" ? (
          <section className="workspace-grid outline-workspace-grid">
            <section className="glass-panel section-panel paper-wrap">
              <div className="paper toc-paper">
                <div className="toc-kicker">Chapter Breakdowns</div>
                <h3>
                  {latestBreakdown?.workingTitle ??
                    outlineWorkspace.book.titleWorking ??
                    "Chapter Breakdowns"}
                </h3>

                {latestBreakdown ? (
                  <div className="toc-list">
                    {latestBreakdown.sections.map((section) => (
                      <article className="toc-entry" key={section.sectionId}>
                        <div className="toc-line">
                          <span className="toc-number">Section {section.sectionNumber}</span>
                          <span className="toc-title">{section.sectionTitle}</span>
                        </div>
                        <p className="toc-description">{section.sectionDescription}</p>

                        <div className="toc-sublist">
                          {section.chapters.map((chapter) => (
                            <div className="toc-subentry" key={chapter.chapterId}>
                              <Link
                                href={`/books/${slug}?stage=OUTLINE&phase=chapter-breakdowns&targetType=chapter&targetId=${chapter.chapterId}`}
                                className="toc-section-link"
                              >
                                <div className="toc-subtitle">
                                  Chapter {chapter.chapterNumber}: {chapter.chapterTitle}
                                </div>
                                <div className="toc-subdescription">
                                  {formatWordCount(chapter.chapterWordCountTarget)} words ·{" "}
                                  {chapter.paragraphs.length} paragraphs
                                </div>
                              </Link>

                              <div className="toc-subchapter-list">
                                {chapter.paragraphs.map((paragraph) => (
                                  <Link
                                    key={paragraph.id}
                                    href={`/books/${slug}?stage=OUTLINE&phase=chapter-breakdowns&targetType=paragraph&targetId=${paragraph.id}`}
                                    className="toc-subchapter"
                                  >
                                    <div className="toc-subchapter-title">
                                      Para {paragraph.number}: {paragraph.mainIdea}
                                    </div>
                                    <div className="toc-subchapter-description">
                                      {formatWordCount(paragraph.wordCountTarget)} words · Hook:{" "}
                                      {paragraph.hook && paragraph.hook !== "[No hook]" ? "yes" : "no"}
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: 0 }}>
                    Generate Phase 2 to build paragraph blueprints for every chapter.
                  </div>
                )}
              </div>
            </section>

            <section className="glass-panel section-panel">
              {breakdownSelection ? (
                renderPhaseTwoChapterDetail(
                  breakdownSelection.chapter,
                  selectedOutlineChapter?.chapter ?? null,
                  breakdownSelection.type === "paragraph"
                    ? breakdownSelection.paragraph.id
                    : undefined,
                  slug,
                )
              ) : (
                <div className="empty-state">
                  Select a chapter or paragraph to review the breakdown blueprint.
                </div>
              )}
            </section>
          </section>
        ) : null}

        {currentPhase === "full-toc" && tocArtifact
          ? renderFullToc(tocArtifact, slug)
          : null}
        {currentPhase === "full-toc" && !tocArtifact ? (
          <section className="workspace-grid outline-workspace-grid">
            <section
              className="glass-panel section-panel paper-wrap"
              style={{ gridColumn: "1 / -1" }}
            >
              <div className="empty-state">
                Generate the Table of Contents to assemble and verify the locked Outline
                and Chapter Breakdowns.
              </div>
            </section>
          </section>
        ) : null}
      </main>

      <aside className="glass-panel rightbar">
        {currentPhase === "sections-chapters" ? (
          <>
            {renderPhaseApprovalCard({
              slug,
              phase: "sectionsChapters",
              approval: phaseApprovals.sectionsChapters,
              title: "Phase 1 Approval",
              canApprove: Boolean(latestOutline),
              pendingTitle: "Review Phase 1, then approve it.",
              pendingDescription:
                "When the section and chapter architecture feels right, approve this phase to unlock Commit Outline and move to Chapter Breakdowns.",
              approvedTitle: "All Sections Approved",
              approvedDescription:
                "Phase 1 is approved. Commit Outline to lock the section and chapter architecture and progress to Phase 2.",
            })}
            <OutlinePhaseChat
              slug={slug}
              phase="sections-chapters"
              actionPhase={getActionPhaseId("sections-chapters")}
              messages={phaseChats.sectionsChapters}
              placeholder={
                outlineSelection?.type === "section"
                  ? "Ask AI to revise this section's role, sequencing, stage coverage, or word-count distribution."
                  : outlineSelection?.type === "chapter"
                    ? "Ask AI to sharpen this chapter's title, hook, bridge, audience resonance, or core idea."
                    : "Ask AI to regenerate or improve the outline architecture."
              }
              helperText="Use chat to revise the outline architecture conversationally. If you have a section or chapter selected, the AI will focus on that target."
              targetType={outlineSelection?.type}
              targetId={
                outlineSelection?.type === "section"
                  ? outlineSelection.section.id
                  : outlineSelection?.type === "chapter"
                    ? outlineSelection.chapter.id
                    : undefined
              }
              targetLabel={selectedPhaseOneTargetLabel}
            />

            <div className="card">
              <h3>What Commits in Phase 1</h3>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                <li>Section architecture and sequencing.</li>
                <li>Chapter titles, purpose, hooks, and bridges.</li>
                <li>Section and chapter word-count math.</li>
                <li>The top-level transformation flow across the book.</li>
              </ul>
            </div>
          </>
        ) : null}

        {currentPhase === "chapter-breakdowns" ? (
          <>
            {renderPhaseApprovalCard({
              slug,
              phase: "chapterBreakdowns",
              approval: phaseApprovals.chapterBreakdowns,
              title: "Phase 2 Approval",
              canApprove: Boolean(latestBreakdown),
              pendingTitle: "Review Phase 2, then approve it.",
              pendingDescription:
                "Approve the paragraph blueprints once the chapter math, hook placement, and paragraph purposes feel solid.",
              approvedTitle: "All Chapter Breakdowns Approved",
              approvedDescription:
                "Phase 2 is approved. Commit Outline to lock the chapter breakdowns and move to the final ToC assembly.",
            })}
            <OutlinePhaseChat
              slug={slug}
              phase="chapter-breakdowns"
              actionPhase={getActionPhaseId("chapter-breakdowns")}
              messages={phaseChats.chapterBreakdowns}
              placeholder={
                breakdownSelection?.type === "chapter"
                  ? "Ask AI to rebalance this chapter's paragraphs, hooks, or word allocation."
                  : breakdownSelection?.type === "paragraph"
                    ? "Ask AI to revise this paragraph's main idea, purpose, content type, or hook."
                    : "Ask AI to regenerate or improve the chapter breakdowns."
              }
              helperText="Use chat to refine paragraph blueprints conversationally. If you have a chapter or paragraph selected, the AI will focus there."
              targetType={breakdownSelection?.type}
              targetId={
                breakdownSelection?.type === "chapter"
                  ? breakdownSelection.chapter.chapterId
                  : breakdownSelection?.type === "paragraph"
                    ? breakdownSelection.paragraph.id
                    : undefined
              }
              targetLabel={selectedPhaseTwoTargetLabel}
            />

            <div className="card">
              <h3>What Commits in Phase 2</h3>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                <li>Paragraph count and paragraph-level word allocation.</li>
                <li>Main idea, purpose, content type, and hook placement.</li>
                <li>The writing skeleton the later drafting stages will fill.</li>
                <li>The chapter math that must still match Phase 1 totals.</li>
              </ul>
            </div>
          </>
        ) : null}

        {currentPhase === "full-toc" ? (
          <>
            {renderPhaseApprovalCard({
              slug,
              phase: "fullToc",
              approval: phaseApprovals.fullToc,
              title: "Phase 3 Approval",
              canApprove: Boolean(tocArtifact),
              pendingTitle: "Review the final Table of Contents, then approve it.",
              pendingDescription:
                "Approve the assembled and verified ToC to unlock the final Commit Outline action and complete the Outline stage.",
              approvedTitle: "Table of Contents Approved",
              approvedDescription:
                "The final Outline package is approved. Commit Outline to lock the validated ToC and progress into Base Story.",
            })}
            <OutlinePhaseChat
              slug={slug}
              phase="full-toc"
              actionPhase={getActionPhaseId("full-toc")}
              messages={phaseChats.fullToc}
              placeholder="Ask AI to reassemble the Table of Contents, verify the math again, or tell you whether a change belongs in Phase 1 or Phase 2."
              helperText="Phase 3 is a validation and assembly pass. Use chat to reassemble the ToC or to diagnose whether requested changes belong back in Phase 1 or Phase 2."
            />
            <div className="card">
              <h3>What Commits in Phase 3</h3>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                <li>The full section &gt; chapter &gt; paragraph ToC package.</li>
                <li>The final locked outline blueprint for Base Story.</li>
                <li>The approved structure that downstream story and research work will use.</li>
              </ul>
            </div>

            <div className="card">
              <h3>Next Stage</h3>
              <div className="recommendation">
                Once you commit the full ToC, Base Story begins. Research stays idle until you
                explicitly start it from the Research stage.
              </div>
            </div>
          </>
        ) : null}

        <div className="card">
          <h3>Version History</h3>
          <div className="version-list">
            {currentPhase === "chapter-breakdowns"
              ? paragraphWorkspace.paragraphVersions.map((version) => (
                  <div className="version-item" key={version.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <strong>v{version.versionNumber}</strong>
                      <span className="muted">{version.lifecycleState}</span>
                    </div>
                    <div className="muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
                      {version.paragraphOutline?.overview ?? "Paragraph outline data is unavailable for this version."}
                    </div>
                  </div>
                ))
              : outlineWorkspace.outlineVersions.map((version) => (
                  <div className="version-item" key={version.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <strong>v{version.versionNumber}</strong>
                      <span className="muted">{version.lifecycleState}</span>
                    </div>
                    <div className="muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
                      {version.outline?.structureRationale ?? "Outline version"}
                    </div>
                  </div>
                ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
