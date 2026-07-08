import {
  applyManuscriptRevision,
  assembleManuscript,
  commitEditingStage,
  expandDraftTowardTarget,
  generateEditorialAssessment,
  generateManuscriptRevision,
  rejectManuscriptRevision,
  updateEditorialPreferences,
} from "./actions";

import { BookWorkflowType } from "@prisma/client";
import { getStaleDependencyRecoveryHint, getStaleDependencyState } from "@/lib/stale-dependency";
import { getEditingWorkspace } from "@/lib/workflows/editing";
import { SubmitButton } from "@/app/components/submit-button";

const EDITORIAL_MODES = [
  { value: "structural-edit", label: "Structural Edit" },
  { value: "clarity-pass", label: "Clarity Pass" },
  { value: "pacing-pass", label: "Pacing Pass" },
  { value: "continuity-pass", label: "Continuity Pass" },
  { value: "voice-consistency-pass", label: "Voice Consistency" },
  { value: "line-edit", label: "Line Edit" },
] as const;

/**
 * The Editing room — the real editorial pass content, shared between the
 * Book Studio (rendered as the EDITING stage slot) and the retired
 * standalone view. Server component: fetches the editing workspace itself.
 *
 * Redesigned 2026-07-08 around three explicit steps at three explicit cost
 * tiers: Assemble (free, deterministic) -> Assess (Sonnet, whole-book read)
 * -> Revise & Polish (Opus, one chapter at a time — matching the Chapter
 * Draft pattern: read the proposed rewrite, Apply or Reject it yourself,
 * rather than an opaque "run the full loop" auto-apply button). Everything
 * that isn't one of those three steps (draft-quality dashboards, manuscript
 * history/diffing, the whole-book chat, revision-plan batching) was cut,
 * not just hidden — it was either a narrative restatement of what the
 * Assessment already says, or superseded by seeing per-chapter state
 * directly in the list below.
 */
export async function EditingDetailContent({
  slug,
  query,
}: {
  slug: string;
  query: Record<string, string | string[] | undefined>;
}) {
  const workspace = await getEditingWorkspace(slug);
  const staleDependency = getStaleDependencyState(workspace.stage?.metadataJson);
  const staleRecoveryHint = staleDependency
    ? getStaleDependencyRecoveryHint(workspace.stage?.stageKey)
    : null;
  void query;

  // Latest (first, since revisionQueue is ordered most-recent-first) pending
  // or resolved revision touching each chapter, so the per-chapter list
  // below can show real state instead of a generic "run everything" button.
  const revisionByChapterKey = new Map<string, (typeof workspace.revisionQueue)[number]>();
  for (const entry of workspace.revisionQueue) {
    for (const changed of entry.revision.changedChapters) {
      if (!revisionByChapterKey.has(changed.chapterKey)) {
        revisionByChapterKey.set(changed.chapterKey, entry);
      }
    }
  }
  const hasPendingRevision = workspace.revisionQueue.some(
    (entry) =>
      !workspace.appliedRevisionIds.includes(entry.id) && !workspace.rejectedRevisionIds.includes(entry.id),
  );

  const nextStep = workspace.blockingReason || !workspace.manuscriptReady
    ? null // already covered by the blocking/readiness message below
    : !workspace.manuscriptAssembly
      ? "Click “Assemble” below — nothing else unlocks until the full manuscript exists."
      : !workspace.latestAssessment
        ? "Click “Generate Assessment” below for a structured read before revising anything."
        : hasPendingRevision
          ? "You have a revised chapter waiting for review below — read it, then Apply or Reject."
          : "Pick a chapter below to revise, or Commit Editing Stage when you're satisfied.";

  return (
    <div className="page-shell" style={{ gridTemplateColumns: "minmax(0,1fr)", flex: 1, minHeight: 0, overflow: "auto" }}>
      <main className="main-column">
        <section className="glass-panel topbar">
          <div>
            <div className="label">Stage Workspace</div>
            <h2>Editing</h2>
            <div className="muted">
              {workspace.book.workflowType === BookWorkflowType.FICTION
                ? "Once the committed draft exists: assemble the full manuscript, get a whole-book assessment, then revise chapter by chapter."
                : "Once every chapter draft exists: assemble the full manuscript, get a whole-book assessment, then revise chapter by chapter."}
            </div>
            {workspace.blockingReason ? (
              <div className="muted" style={{ marginTop: 10 }}>
                {workspace.blockingReason}
              </div>
            ) : !workspace.manuscriptReady ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Finish drafting every chapter before the editorial pass can begin.
              </div>
            ) : null}
            {nextStep ? (
              <div className="recommendation" style={{ marginTop: 12, fontWeight: 600 }}>
                Next step: {nextStep}
              </div>
            ) : null}
            {staleDependency ? (
              <div className="muted" style={{ marginTop: 10 }}>
                <div>Stale: {staleDependency.reason}</div>
                <div style={{ marginTop: 6 }}>Recommended recovery: {staleRecoveryHint}</div>
              </div>
            ) : null}
          </div>
          <div className="button-row">
            <form action={assembleManuscript.bind(null, slug)}>
              <SubmitButton
                label={workspace.manuscriptAssembly ? "✓ Reassemble (Step 1 · Free)" : "Assemble (Step 1 · Free)"}
                pendingLabel="Assembling…"
                disabled={!workspace.manuscriptReady}
              />
            </form>
            <form action={generateEditorialAssessment.bind(null, slug)}>
              <input type="hidden" name="mode" value="structural-edit" />
              <input type="hidden" name="chapterKey" value="" />
              <SubmitButton
                label={workspace.latestAssessment ? "✓ Regenerate Assessment (Step 2 · Sonnet)" : "Generate Assessment (Step 2 · Sonnet)"}
                pendingLabel="Assessing… (usually 1-2 min)"
                disabled={!workspace.manuscriptAssembly}
              />
            </form>
          </div>
        </section>

        <details style={{ marginTop: 4 }}>
          <summary className="btn" style={{ display: "inline-block", cursor: "pointer" }}>
            ⚙ Settings
          </summary>
          <section className="glass-panel section-panel" style={{ marginTop: 12 }}>
            <div className="section-header">
              <div>
                <h3>Editorial Preferences</h3>
                <div className="muted">
                  Capture how you want edits handled so the editor agent stays consistent across
                  revision passes.
                </div>
              </div>
            </div>
            <form className="stack" action={updateEditorialPreferences.bind(null, slug)} style={{ padding: 0 }}>
              <textarea
                name="styleNotes"
                defaultValue={workspace.editorialPreferences.styleNotes}
                placeholder="Examples: preserve my cadence, cut repetition aggressively, avoid flattening tension, keep it more conversational."
              />
              <label className="muted">
                <input type="checkbox" name="preserveVoice" defaultChecked={workspace.editorialPreferences.preserveVoice} /> Preserve
                voice strongly
              </label>
              <label className="muted">
                <input type="checkbox" name="preferTighterProse" defaultChecked={workspace.editorialPreferences.preferTighterProse} />{" "}
                Prefer tighter prose
              </label>
              <label className="muted">
                <input type="checkbox" name="preferBolderCuts" defaultChecked={workspace.editorialPreferences.preferBolderCuts} /> Allow
                bolder cuts and reshaping
              </label>
              <button className="btn" type="submit">
                Save Preferences
              </button>
            </form>
            <div className="muted" style={{ marginTop: 10 }}>
              Accepted: {workspace.editorialPreferences.acceptedRevisionCount} • Rejected:{" "}
              {workspace.editorialPreferences.rejectedRevisionCount}
            </div>
          </section>
        </details>

        <section style={stepThreePanelStyle}>
          <div style={{ marginBottom: 14 }}>
            <div style={stepThreeTitleStyle}>Step 3 · Revise &amp; Polish — Claude Opus</div>
            <div style={stepThreeSubtitleStyle}>
              One chapter at a time. Revise, read the proposed rewrite, then Apply or Reject —
              nothing changes in the manuscript until you accept it.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {workspace.chapters.map((chapter, index) => {
              const revisionEntry = revisionByChapterKey.get(chapter.chapterKey);
              const changed = revisionEntry?.revision.changedChapters.find(
                (c) => c.chapterKey === chapter.chapterKey,
              );
              const applied = revisionEntry ? workspace.appliedRevisionIds.includes(revisionEntry.id) : false;
              const rejected = revisionEntry ? workspace.rejectedRevisionIds.includes(revisionEntry.id) : false;
              const pending = Boolean(revisionEntry) && !applied && !rejected;
              const rowState: "unrevised" | "pending" | "applied" = applied ? "applied" : pending ? "pending" : "unrevised";

              return (
                <div key={chapter.chapterKey} style={chapterCardStyle(rowState)}>
                  <div style={chapterRowStyle}>
                    <div style={chapterNumStyle}>{index + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={chapterTitleStyle}>{chapter.chapterLabel}</div>
                      <div style={wordCountStyle}>
                        {chapter.wordCount.toLocaleString()} words
                        {rejected && !pending ? " · rejected previously" : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <StatusPip state={rowState} />
                      <span style={statusLabelStyle}>
                        {applied ? "Applied" : pending ? "Pending review" : "Not revised"}
                      </span>
                    </div>
                  </div>

                  {changed && (pending || applied) ? (
                    <div style={{ padding: "0 16px 14px" }}>
                      <div style={{ ...wordCountStyle, marginTop: 0 }}>{changed.changeSummary}</div>
                      <details style={{ marginTop: 8 }}>
                        <summary style={readSummaryStyle}>Read proposed revision</summary>
                        <div style={{ marginTop: 10 }}>
                          <div style={compareLabelStyle}>Before</div>
                          <ChapterReader content={changed.originalText} />
                          <div style={{ ...compareLabelStyle, marginTop: 16 }}>After</div>
                          <ChapterReader content={changed.revisedText} />
                        </div>
                      </details>
                      {pending ? (
                        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                          <form action={applyManuscriptRevision.bind(null, slug)}>
                            <input type="hidden" name="revisionVersionId" value={revisionEntry!.id} />
                            <SubmitButton className="btn btn-primary" label="Apply" pendingLabel="Applying…" />
                          </form>
                          <form action={rejectManuscriptRevision.bind(null, slug)}>
                            <input type="hidden" name="revisionVersionId" value={revisionEntry!.id} />
                            <SubmitButton label="Reject" pendingLabel="Rejecting…" />
                          </form>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <form
                      action={generateManuscriptRevision.bind(null, slug)}
                      style={{ padding: "0 16px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
                    >
                      <input type="hidden" name="chapterKey" value={chapter.chapterKey} />
                      <select name="mode" defaultValue="structural-edit" style={modeSelectStyle}>
                        {EDITORIAL_MODES.map((mode) => (
                          <option key={mode.value} value={mode.value}>
                            {mode.label}
                          </option>
                        ))}
                      </select>
                      <SubmitButton
                        label="Revise"
                        pendingLabel="Revising… (usually 1-2 min)"
                        disabled={!workspace.manuscriptAssembly}
                      />
                    </form>
                  )}
                </div>
              );
            })}
          </div>

          <div className="button-row" style={{ marginTop: 20, borderTop: "1px solid rgba(45,36,29,0.1)", paddingTop: 16 }}>
            <form action={expandDraftTowardTarget.bind(null, slug)}>
              <input type="hidden" name="limit" value="2" />
              <SubmitButton
                label="Expand Draft Toward Target"
                pendingLabel="Expanding…"
                disabled={!workspace.manuscriptReady}
              />
            </form>
            <form action={commitEditingStage.bind(null, slug)}>
              <SubmitButton
                className="btn btn-primary"
                label="Commit Editing Stage"
                pendingLabel="Committing…"
                disabled={!workspace.manuscriptAssembly}
              />
            </form>
            <a className="btn" href={`/books/${slug}?stage=TYPESET`}>
              Open Typeset →
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

// ── Step 3 styling — matches chapter-draft-bmad-panel.tsx's visual language
// (same cream panel, serif type, number badges, status pips, pill buttons)
// so Revise & Polish reads as the same trusted pattern as Chapter Draft,
// not a different-looking screen bolted on next to it. ──────────────────────

const stepThreePanelStyle: React.CSSProperties = {
  background: "#fefbf5",
  border: "1px solid rgba(45,36,29,0.1)",
  borderRadius: 10,
  padding: "20px 24px",
};

const stepThreeTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#2d241d",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const stepThreeSubtitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#8a7a6a",
  marginTop: 4,
};

function chapterCardStyle(state: "unrevised" | "pending" | "applied"): React.CSSProperties {
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

const statusLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#8a7a6a",
  whiteSpace: "nowrap",
};

const readSummaryStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#B8793A",
  cursor: "pointer",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
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

function StatusPip({ state }: { state: "unrevised" | "pending" | "applied" }) {
  const cfg =
    state === "applied"
      ? { color: "#4a7c59", label: "◆" }
      : state === "pending"
        ? { color: "#d4a017", label: "◐" }
        : { color: "#8a7a6a", label: "●" };
  return <span style={{ color: cfg.color, fontSize: 14 }}>{cfg.label}</span>;
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
