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

        <section className="glass-panel section-panel">
          <div className="section-header">
            <div>
              <h3>Step 3 · Revise &amp; Polish — Claude Opus</h3>
              <div className="muted">
                One chapter at a time. Revise, read the proposed rewrite, then Apply or Reject —
                nothing changes in the manuscript until you accept it.
              </div>
            </div>
          </div>

          <div className="chapter-list">
            {workspace.chapters.map((chapter, index) => {
              const revisionEntry = revisionByChapterKey.get(chapter.chapterKey);
              const changed = revisionEntry?.revision.changedChapters.find(
                (c) => c.chapterKey === chapter.chapterKey,
              );
              const applied = revisionEntry ? workspace.appliedRevisionIds.includes(revisionEntry.id) : false;
              const rejected = revisionEntry ? workspace.rejectedRevisionIds.includes(revisionEntry.id) : false;
              const pending = Boolean(revisionEntry) && !applied && !rejected;

              return (
                <div key={chapter.chapterKey} className="chapter-list-item">
                  <div className="chapter-list-header">
                    <strong>
                      {index + 1}. {chapter.chapterLabel}
                    </strong>
                    <span
                      className={`binder-status status-${applied ? "committed" : pending ? "review" : "draft"}`}
                    >
                      {applied ? "✓ Applied" : pending ? "Revised — pending review" : rejected ? "Rejected — not revised" : "Not revised"}
                    </span>
                  </div>
                  <div className="chapter-list-metrics">
                    <span>{chapter.wordCount.toLocaleString()} words</span>
                    <span>{chapter.quality ? `Quality ${chapter.quality.score}/100` : "Quality pending"}</span>
                  </div>

                  {changed && (pending || applied) ? (
                    <>
                      <div className="muted" style={{ marginTop: 8 }}>
                        {changed.changeSummary}
                      </div>
                      <details className="dossier-packet" style={{ marginTop: 10 }}>
                        <summary>Read proposed revision</summary>
                        <div className="dossier-packet-body">
                          <div className="muted" style={{ marginBottom: 6 }}>
                            Before
                          </div>
                          <p style={{ marginTop: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{changed.originalText}</p>
                          <div className="muted" style={{ marginTop: 14, marginBottom: 6 }}>
                            After
                          </div>
                          <p style={{ marginTop: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{changed.revisedText}</p>
                        </div>
                      </details>
                      {pending ? (
                        <div className="button-row" style={{ marginTop: 10 }}>
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
                    </>
                  ) : (
                    <form
                      action={generateManuscriptRevision.bind(null, slug)}
                      style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
                    >
                      <input type="hidden" name="chapterKey" value={chapter.chapterKey} />
                      <select name="mode" defaultValue="structural-edit">
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

          <div className="button-row" style={{ marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16 }}>
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
