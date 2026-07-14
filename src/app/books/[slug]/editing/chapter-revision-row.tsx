"use client";

import { useState } from "react";
import {
  applyManuscriptRevision,
  generateManuscriptRevision,
  rejectManuscriptRevision,
} from "./actions";
import { SubmitButton } from "@/app/components/submit-button";

const EDITORIAL_MODES = [
  { value: "structural-edit", label: "Structural Edit" },
  { value: "clarity-pass", label: "Clarity Pass" },
  { value: "pacing-pass", label: "Pacing Pass" },
  { value: "continuity-pass", label: "Continuity Pass" },
  { value: "voice-consistency-pass", label: "Voice Consistency" },
  { value: "line-edit", label: "Line Edit" },
] as const;

type RowState = "unrevised" | "pending" | "applied";
type Mode = "read" | "revise" | "notes" | null;

/**
 * One chapter's row in the Editing screen's "Step 3 · Revise & Polish"
 * list. Same interaction shape as chapter-draft-bmad-panel.tsx's chapter
 * row: a button row (Read / Revise / Regenerate / Notes) that expands an
 * inline panel below when clicked, plus a status pip that becomes a
 * clickable Apply (checkmark) once a revision is pending, then a static
 * indicator once applied.
 */
export function ChapterRevisionRow({
  slug,
  index,
  chapterKey,
  chapterLabel,
  wordCount,
  qualityScore,
  manuscriptReady,
  rowState,
  changeSummary,
  originalText,
  revisedText,
  approvedDraftVersionId,
  assessmentInstructions,
  revisionVersionId,
  chapterNote,
}: {
  slug: string;
  index: number;
  chapterKey: string;
  chapterLabel: string;
  wordCount: number;
  qualityScore: number | null;
  manuscriptReady: boolean;
  rowState: RowState;
  changeSummary: string | null;
  originalText: string;
  revisedText: string | null;
  approvedDraftVersionId: string | null;
  assessmentInstructions: string[];
  revisionVersionId: string | null;
  chapterNote: string | null;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const toggle = (next: Mode) => setMode((current) => (current === next ? null : next));

  return (
    <div style={chapterCardStyle(rowState)}>
      <div style={chapterRowStyle}>
        <div style={chapterNumStyle}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={chapterTitleStyle}>{chapterLabel}</div>
          <div style={wordCountStyle}>
            {wordCount.toLocaleString()} words
            {qualityScore != null ? ` · Quality ${qualityScore}/100` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button style={actionBtnStyle(mode === "read")} onClick={() => toggle("read")}>
            Read
          </button>
          {rowState !== "pending" ? (
            <button style={actionBtnStyle(mode === "revise")} onClick={() => toggle("revise")}>
              Revise
            </button>
          ) : (
            <button style={actionBtnStyle(mode === "revise")} onClick={() => toggle("revise")} title="Discard this proposed revision and generate a new one">
              ↺
            </button>
          )}
          {chapterNote ? (
            <button style={actionBtnStyle(mode === "notes")} onClick={() => toggle("notes")} title="Editorial assessment note for this chapter">
              🧠 Notes
            </button>
          ) : null}
          {rowState === "pending" && revisionVersionId ? (
            <>
              <form action={applyManuscriptRevision.bind(null, slug)}>
                <input type="hidden" name="revisionVersionId" value={revisionVersionId} />
                <SubmitButton className="btn btn-primary" label="✓ Approve Final Revision" pendingLabel="Approving…" />
              </form>
              <form action={rejectManuscriptRevision.bind(null, slug)}>
                <input type="hidden" name="revisionVersionId" value={revisionVersionId} />
                <SubmitButton label="Reject" pendingLabel="Rejecting…" />
              </form>
            </>
          ) : (
            <StatusPip state={rowState} />
          )}
        </div>
      </div>

      {mode === "read" ? (
        <div style={{ padding: "0 16px 14px" }}>
          {changeSummary ? <div style={{ ...wordCountStyle, marginBottom: 8 }}>{changeSummary}</div> : null}
          {approvedDraftVersionId ? (
            <div style={{ ...wordCountStyle, marginBottom: 8 }}>
              Approved Quill draft: {approvedDraftVersionId.slice(0, 8)}
            </div>
          ) : null}
          {assessmentInstructions.length > 0 ? (
            <div style={{ marginBottom: 12 }}>
              <div style={compareLabelStyle}>Revision guardrails</div>
              <ul style={{ margin: "6px 0 0 18px", color: "#6f6258", fontSize: 12, lineHeight: 1.55 }}>
                {assessmentInstructions.slice(0, 5).map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {revisedText ? (
            <>
              <div style={compareLabelStyle}>Before</div>
              <ChapterReader content={originalText} />
              <div style={{ ...compareLabelStyle, marginTop: 16 }}>After</div>
              <ChapterReader content={revisedText} />
            </>
          ) : (
            <ChapterReader content={originalText} />
          )}
        </div>
      ) : null}

      {mode === "notes" && chapterNote ? (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ ...wordCountStyle, fontStyle: "italic" }}>{chapterNote}</div>
        </div>
      ) : null}

      {mode === "revise" ? (
        <form
          action={generateManuscriptRevision.bind(null, slug)}
          style={{ padding: "0 16px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
        >
          <input type="hidden" name="chapterKey" value={chapterKey} />
          <select name="mode" defaultValue="structural-edit" style={modeSelectStyle}>
            {EDITORIAL_MODES.map((editorialMode) => (
              <option key={editorialMode.value} value={editorialMode.value}>
                {editorialMode.label}
              </option>
            ))}
          </select>
          <SubmitButton
            label={rowState === "pending" ? "Regenerate Revision" : "Generate Revision"}
            pendingLabel="Revising… (usually 1-2 min)"
            disabled={!manuscriptReady}
          />
        </form>
      ) : null}
    </div>
  );
}

function chapterCardStyle(state: RowState): React.CSSProperties {
  return {
    borderRadius: 8,
    border: `1px solid ${
      state === "applied" ? "rgba(74,124,89,0.3)" : state === "pending" ? "rgba(212,160,23,0.3)" : "rgba(45,36,29,0.1)"
    }`,
    background: state === "applied" ? "rgba(74,124,89,0.04)" : state === "pending" ? "rgba(212,160,23,0.04)" : "#fff",
  };
}

const chapterRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
};

const chapterNumStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  background: "rgba(45,36,29,0.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 600,
  color: "#6f6256",
  flexShrink: 0,
};

const chapterTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const wordCountStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#8a7a6a",
  marginTop: 2,
};

const compareLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#8a7a6a",
  marginBottom: 6,
  fontStyle: "italic",
};

const modeSelectStyle: React.CSSProperties = {
  fontSize: 12,
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  padding: "4px 8px",
  borderRadius: 5,
  border: "1px solid rgba(45,36,29,0.15)",
  background: "transparent",
  color: "#6f6256",
};

function actionBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 5,
    border: active ? "1px solid rgba(184,121,58,0.5)" : "1px solid rgba(45,36,29,0.2)",
    background: active ? "rgba(184,121,58,0.08)" : "transparent",
    color: active ? "#B8793A" : "#6f6256",
    fontSize: 11,
    fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
  };
}

function StatusPip({ state }: { state: RowState }) {
  const cfg =
    state === "applied"
      ? { color: "#4a7c59", label: "✓ Applied" }
      : { color: "#8a7a6a", label: "● Not revised" };
  return <span style={{ color: cfg.color, fontSize: 11 }}>{cfg.label}</span>;
}

function ChapterReader({ content }: { content: string }) {
  const paragraphs = content.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    <div style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', fontSize: 13, lineHeight: 1.7, color: "#2d241d" }}>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ margin: "0 0 12px" }}>
          {p}
        </p>
      ))}
    </div>
  );
}
