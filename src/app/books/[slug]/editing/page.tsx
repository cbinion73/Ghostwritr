import Link from "next/link";

import { AppTopBar } from "@/app/components/app-top-bar";
import {
  applyManuscriptRevision,
  assembleManuscript,
  commitEditingStage,
  expandDraftTowardTarget,
  executeEditorialRevisionPlan,
  generateEditorialRevisionPlan,
  generateEditorialAssessment,
  generateManuscriptRevision,
  generateSuggestedRevisionFromConversation,
  rejectManuscriptRevision,
  runFullEditorialLoop,
  sendEditingMessage,
  updateEditorialPreferences,
} from "./actions";
import { EditingExportMenu } from "./export-menu";

import { BookWorkflowType } from "@prisma/client";
import { getBookStageLinks } from "@/lib/navigation";
import { getStaleDependencyRecoveryHint, getStaleDependencyState } from "@/lib/stale-dependency";
import { getEditingWorkspace } from "@/lib/workflows/editing";

const EDITORIAL_MODES = [
  { value: "structural-edit", label: "Structural Edit" },
  { value: "clarity-pass", label: "Clarity Pass" },
  { value: "pacing-pass", label: "Pacing Pass" },
  { value: "continuity-pass", label: "Continuity Pass" },
  { value: "voice-consistency-pass", label: "Voice Consistency" },
  { value: "line-edit", label: "Line Edit" },
] as const;

function getSearchParam(
  value: string | string[] | undefined,
) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function buildExcerpt(text: string, limit = 280) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function describeSelectedSections(
  selectedChapterKeys: string[] | undefined,
  chapters: Array<{ chapterKey: string; chapterLabel: string }>,
) {
  if (!selectedChapterKeys || selectedChapterKeys.length === 0) {
    return null;
  }

  const labelMap = new Map(chapters.map((chapter) => [chapter.chapterKey, chapter.chapterLabel]));
  const labels = selectedChapterKeys
    .map((chapterKey) => labelMap.get(chapterKey) ?? chapterKey)
    .filter(Boolean);

  if (labels.length === 0) {
    return null;
  }

  return labels.join(" • ");
}

export default async function EditingStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const workspace = await getEditingWorkspace(slug);
  const assembledManuscript = workspace.manuscriptAssembly?.fullText ?? "";
  const stageLinks = getBookStageLinks(workspace.book.workflowType, slug);
  const staleDependency = getStaleDependencyState(workspace.stage?.metadataJson);
  const staleRecoveryHint = staleDependency
    ? getStaleDependencyRecoveryHint(workspace.stage?.stageKey)
    : null;
  const compareToId = getSearchParam(resolvedSearchParams.compareTo);
  const compareFromId = getSearchParam(resolvedSearchParams.compareFrom);
  const defaultCompareTo = workspace.manuscriptHistory[0] ?? null;
  const defaultCompareFrom = workspace.manuscriptHistory[1] ?? workspace.manuscriptHistory[0] ?? null;
  const compareToEntry =
    workspace.manuscriptHistory.find((entry) => entry.id === compareToId) ?? defaultCompareTo;
  const compareFromEntry =
    workspace.manuscriptHistory.find((entry) => entry.id === compareFromId) ?? defaultCompareFrom;
  const canCompare =
    Boolean(compareToEntry) &&
    Boolean(compareFromEntry) &&
    compareToEntry?.id !== compareFromEntry?.id &&
    Array.isArray(compareToEntry?.chapters) &&
    Array.isArray(compareFromEntry?.chapters);
  const compareMap = new Map(
    (compareFromEntry?.chapters ?? []).map((chapter) => [chapter.chapterKey, chapter]),
  );
  const compareChanges = (compareToEntry?.chapters ?? [])
    .map((chapter) => {
      const previous = compareMap.get(chapter.chapterKey);
      if (!previous || previous.chapterText === chapter.chapterText) {
        return null;
      }

      return {
        chapterKey: chapter.chapterKey,
        chapterLabel: chapter.chapterLabel,
        beforeWords: previous.wordCount,
        afterWords: chapter.wordCount,
        beforeExcerpt: buildExcerpt(previous.chapterText),
        afterExcerpt: buildExcerpt(chapter.chapterText),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const addedChapterLabels = (compareToEntry?.chapters ?? [])
    .filter((chapter) => !compareMap.has(chapter.chapterKey))
    .map((chapter) => chapter.chapterLabel);
  const removedChapterLabels = (compareFromEntry?.chapters ?? [])
    .filter(
      (chapter) =>
        !(compareToEntry?.chapters ?? []).some((entry) => entry.chapterKey === chapter.chapterKey),
    )
    .map((chapter) => chapter.chapterLabel);
  const compareWordDelta =
    compareToEntry && compareFromEntry ? compareToEntry.totalWords - compareFromEntry.totalWords : 0;
  const compareDeltaLabel =
    compareWordDelta === 0 ? "No word-count delta" : `${compareWordDelta > 0 ? "+" : ""}${compareWordDelta.toLocaleString()} words`;
  const suggestedSectionsLabel = describeSelectedSections(
    workspace.suggestedRevisionTarget?.selectedChapterKeys,
    workspace.chapters,
  );

  return (
    <div className="dark-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppTopBar bookSlug={slug} bookTitle={workspace.book.titleWorking ?? undefined} activePage="studio" />
      <div className="page-shell" style={{ flex: 1 }}>
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Read the manuscript as one book, then refine it chapter by chapter with the editor agent.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Editing: <strong>{workspace.stage?.status ?? "NOT_STARTED"}</strong>
          </div>
        </div>

        <div className="stage-list">
          {stageLinks.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href}
              className={`stage-chip ${stage.key === "EDITING" ? "active" : ""}`}
            >
              {stage.label}
            </Link>
          ))}
        </div>
      </aside>

      <main className="main-column">
        <section className="glass-panel topbar">
          <div>
            <div className="label">Stage Workspace</div>
            <h2>Editing</h2>
            <div className="muted">
              {workspace.book.workflowType === BookWorkflowType.FICTION
                ? "This is the full-manuscript review space for the fiction workflow. Once the committed draft exists, the editor can read the novel in its entirety and then refine it chapter by chapter."
                : "This is the full-manuscript review space. Once every chapter draft exists, the editor can read the book in its entirety and then refine it chapter by chapter."}
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
            {staleDependency ? (
              <div className="muted" style={{ marginTop: 10 }}>
                <div>Stale: {staleDependency.reason}</div>
                <div style={{ marginTop: 6 }}>Recommended recovery: {staleRecoveryHint}</div>
              </div>
            ) : null}
          </div>
          <div className="button-row">
            <Link className="btn" href={`/books/${slug}`}>← Book Studio</Link>
            <form action={assembleManuscript.bind(null, slug)}>
              <button className="btn" type="submit" disabled={!workspace.manuscriptReady}>
                {workspace.manuscriptAssembly ? "Reassemble Manuscript" : "Assemble Manuscript"}
              </button>
            </form>
            <form action={expandDraftTowardTarget.bind(null, slug)}>
              <input type="hidden" name="limit" value="2" />
              <button
                className="btn"
                type="submit"
                disabled={!workspace.manuscriptReady}
              >
                Expand Draft Toward Target
              </button>
            </form>
            <form action={commitEditingStage.bind(null, slug)}>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!workspace.manuscriptAssembly}
              >
                Commit Editing Stage
              </button>
            </form>
            <Link className="btn" href={`/books/${slug}/publish`}>
              Open Publish
            </Link>
            <EditingExportMenu
              slug={slug}
              title={workspace.book.titleWorking ?? "manuscript"}
              disabled={!workspace.manuscriptAssembly}
            />
          </div>
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <div>
              <h3>Manuscript Readiness</h3>
              <div className="muted">
                The editor stage should only start after the draft exists as a complete book.
              </div>
            </div>
          </div>

          <div className="manuscript-progress-grid">
            <div className="metric-card">
              <div className="label">Chapters drafted</div>
              <strong>
                {workspace.draftedChapters}/{workspace.totalChapters}
              </strong>
            </div>
            <div className="metric-card">
              <div className="label">Draft words</div>
              <strong>{workspace.totalWords.toLocaleString()}</strong>
            </div>
            <div className="metric-card">
              <div className="label">Editorial status</div>
              <strong>{workspace.manuscriptReady ? "Ready for full-book review" : "Blocked"}</strong>
            </div>
            <div className="metric-card">
              <div className="label">Typeset readiness</div>
              <strong>{workspace.manuscriptAssembly ? "Export-ready" : "Waiting on full draft"}</strong>
            </div>
            <div className="metric-card">
              <div className="label">Draft quality</div>
              <strong>
                {workspace.draftQualityRollup
                  ? `${workspace.draftQualityRollup.averageScore}/100`
                  : "Awaiting scored draft"}
              </strong>
            </div>
            <div className="metric-card">
              <div className="label">Revision flags</div>
              <strong>
                {workspace.draftQualityRollup
                  ? workspace.draftQualityRollup.chaptersNeedingRevision
                  : 0}
              </strong>
            </div>
          </div>
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <div>
              <h3>Draft Quality Rollup</h3>
              <div className="muted">
                Persistent chapter-quality signals carried forward from the drafting stages.
              </div>
            </div>
          </div>

          {workspace.draftQualityRollup ? (
            <>
              <div className="manuscript-progress-grid">
                <div className="metric-card">
                  <div className="label">Average score</div>
                  <strong>{workspace.draftQualityRollup.averageScore}/100</strong>
                </div>
                <div className="metric-card">
                  <div className="label">Strong chapters</div>
                  <strong>{workspace.draftQualityRollup.strongChapters}</strong>
                </div>
                <div className="metric-card">
                  <div className="label">Watch chapters</div>
                  <strong>{workspace.draftQualityRollup.watchChapters}</strong>
                </div>
                <div className="metric-card">
                  <div className="label">Needs attention</div>
                  <strong>{workspace.draftQualityRollup.attentionChapters}</strong>
                </div>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="recommendation">{workspace.draftQualityRollup.headline}</div>
                <div className="muted" style={{ marginTop: 10 }}>
                  Weakest chapter: {workspace.draftQualityRollup.weakestChapterLabel ?? "None recorded"} •
                  Revision passes already spent: {workspace.draftQualityRollup.totalRevisionPasses}
                </div>
                {workspace.draftQualityRollup.blockers.length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <strong>Current Blockers</strong>
                    <ul className="clean-list">
                      {workspace.draftQualityRollup.blockers.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty-state">
              Draft quality telemetry has not been persisted for these chapter drafts yet. Regenerate or refresh the affected drafts to score them directly.
            </div>
          )}
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <div>
              <h3>Editorial Readiness Gate</h3>
              <div className="muted">
                A go/no-go view for whether the manuscript is ready to commit or still needs another revision pass.
              </div>
            </div>
          </div>

          <div className="manuscript-progress-grid">
            <div className="metric-card">
              <div className="label">Readiness score</div>
              <strong>{workspace.editorialReadinessGate.score}/100</strong>
            </div>
            <div className="metric-card">
              <div className="label">Recommendation</div>
              <strong>{workspace.editorialReadinessGate.recommendation}</strong>
            </div>
            <div className="metric-card">
              <div className="label">Evaluated</div>
              <strong>{new Date(workspace.editorialReadinessGate.evaluatedAt).toLocaleString()}</strong>
            </div>
            <div className="metric-card">
              <div className="label">Next move</div>
              <strong>{workspace.editorialReadinessGate.nextActions[0] ?? "Run the next editorial action."}</strong>
            </div>
          </div>
          {workspace.editorialReadinessGate.recommendation === "blocked" ? (
            <div className="card" style={{ marginTop: 16 }}>
              <strong>Recovery Path</strong>
              <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
                If the manuscript is blocked because core chapters are still too short, run <strong>Expand Draft Toward Target</strong>. It will deepen the most under-target chapters, then refresh the manuscript assembly and publish package automatically.
              </div>
            </div>
          ) : null}
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <div>
              <h3>Editorial Engine</h3>
              <div className="muted">
                Generate structured assessments, create revision candidates, then apply the accepted
                revision back into the manuscript assembly.
              </div>
            </div>
          </div>

          <div className="workspace-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card">
              <div className="label">Assessment</div>
              <h3 style={{ marginTop: 6 }}>Run Editorial Assessment</h3>
              <form action={generateEditorialAssessment.bind(null, slug)} className="stack" style={{ padding: 0 }}>
                <label className="label" htmlFor="assessment-mode">
                  Revision Mode
                </label>
                <select id="assessment-mode" name="mode" defaultValue="structural-edit">
                  {EDITORIAL_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <label className="label" htmlFor="assessment-chapter">
                  Chapter Focus
                </label>
                <select id="assessment-chapter" name="chapterKey" defaultValue="">
                  <option value="">Whole book</option>
                  {workspace.chapters.map((chapter) => (
                    <option key={chapter.chapterKey} value={chapter.chapterKey}>
                      {chapter.chapterLabel}
                    </option>
                  ))}
                </select>
                <button className="btn" type="submit" disabled={!workspace.manuscriptAssembly}>
                  Generate Assessment
                </button>
              </form>
            </div>

            <div className="card">
              <div className="label">Revision</div>
              <h3 style={{ marginTop: 6 }}>Create Revision Candidate</h3>
              <form action={generateManuscriptRevision.bind(null, slug)} className="stack" style={{ padding: 0 }}>
                <label className="label" htmlFor="revision-mode">
                  Revision Mode
                </label>
                <select id="revision-mode" name="mode" defaultValue="clarity-pass">
                  {EDITORIAL_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <label className="label" htmlFor="revision-chapter">
                  Chapter Focus
                </label>
                <select id="revision-chapter" name="chapterKey" defaultValue="">
                  <option value="">Highest-leverage chapters</option>
                  {workspace.chapters.map((chapter) => (
                    <option key={chapter.chapterKey} value={chapter.chapterKey}>
                      {chapter.chapterLabel}
                    </option>
                  ))}
                </select>
                <label className="label" htmlFor="revision-brief">
                  Target Outcome
                </label>
                <textarea
                  id="revision-brief"
                  name="brief"
                  placeholder="Optional: tell the editor exactly what this revision should improve without losing the chapter's role in the book."
                />
                <details className="dossier-packet">
                  <summary>Target Selected Sections</summary>
                  <div className="dossier-packet-body">
                    <div className="muted" style={{ lineHeight: 1.7, marginBottom: 10 }}>
                      Leave this empty to target the selected chapter or let the editor choose the highest-leverage chapters. Use it when one revision should reshape several connected sections together.
                    </div>
                    <div className="stack" style={{ padding: 0 }}>
                      {workspace.chapters.map((chapter) => (
                        <label key={`selected-${chapter.chapterKey}`} className="muted">
                          <input type="checkbox" name="selectedChapterKeys" value={chapter.chapterKey} />{" "}
                          {chapter.chapterLabel}
                        </label>
                      ))}
                    </div>
                  </div>
                </details>
                <button className="btn" type="submit" disabled={!workspace.manuscriptAssembly}>
                  Generate Revision
                </button>
              </form>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="label">Autonomous Loop</div>
            <h3 style={{ marginTop: 6 }}>Run Full Editorial Loop</h3>
            <div className="muted" style={{ lineHeight: 1.7 }}>
              Generate an assessment, build a revision plan, execute the top queue items, optionally auto-apply them, and optionally commit Editing in one pass.
            </div>
            <form action={runFullEditorialLoop.bind(null, slug)} className="stack" style={{ marginTop: 12, padding: 0 }}>
              <select name="assessmentMode" defaultValue="structural-edit">
                {EDITORIAL_MODES.map((mode) => (
                  <option key={`loop-${mode.value}`} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
              <select name="planLimit" defaultValue="3">
                <option value="1">Top 1 plan item</option>
                <option value="2">Top 2 plan items</option>
                <option value="3">Top 3 plan items</option>
                <option value="5">Top 5 plan items</option>
              </select>
              <label className="muted">
                <input type="checkbox" name="autoApply" defaultChecked /> Auto-apply generated revisions
              </label>
              <label className="muted">
                <input type="checkbox" name="commitAfter" /> Commit Editing when the loop finishes
              </label>
              <button className="btn btn-primary" type="submit" disabled={!workspace.manuscriptAssembly}>
                Run Editorial Loop
              </button>
            </form>
          </div>
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <div>
              <h3>Manuscript History</h3>
              <div className="muted">
                Compare assembled manuscript versions and track what changed across revision passes.
              </div>
            </div>
          </div>

          {workspace.manuscriptHistory.length > 0 ? (
            <div className="stack" style={{ padding: 0, gap: 18 }}>
              <form method="get" className="card" style={{ padding: 18 }}>
                <div className="label">Compare Versions</div>
                <h3 style={{ marginTop: 6 }}>Compare Manuscript Assemblies</h3>
                <div className="muted" style={{ lineHeight: 1.7 }}>
                  Review revision progress with an actual version-to-version compare instead of scanning isolated excerpts.
                </div>
                <div className="button-row" style={{ marginTop: 12, alignItems: "end", flexWrap: "wrap" }}>
                  <label style={{ minWidth: 220 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>Compare from</div>
                    <select name="compareFrom" defaultValue={compareFromEntry?.id ?? ""}>
                      {workspace.manuscriptHistory.map((entry) => (
                        <option key={`from-${entry.id}`} value={entry.id}>
                          v{entry.versionNumber} · {new Date(entry.createdAt).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ minWidth: 220 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>Compare to</div>
                    <select name="compareTo" defaultValue={compareToEntry?.id ?? ""}>
                      {workspace.manuscriptHistory.map((entry) => (
                        <option key={`to-${entry.id}`} value={entry.id}>
                          v{entry.versionNumber} · {new Date(entry.createdAt).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn" type="submit">
                    Compare Versions
                  </button>
                </div>
                {canCompare && compareToEntry && compareFromEntry ? (
                  <div style={{ marginTop: 16 }}>
                    <div className="pill-row">
                      <div className="pill">
                        v{compareFromEntry.versionNumber} → v{compareToEntry.versionNumber}
                      </div>
                      <div className="pill">{compareDeltaLabel}</div>
                      <div className="pill">{compareChanges.length} changed chapters</div>
                    </div>
                    <div className="compare-grid" style={{ padding: "18px 0 0" }}>
                      <div className="compare-column">
                        <h4>Before</h4>
                        <div className="version-meta">
                          <span>{compareFromEntry.chapterCount} chapters</span>
                          <span>{compareFromEntry.totalWords.toLocaleString()} words</span>
                          <span>{new Date(compareFromEntry.createdAt).toLocaleString()}</span>
                        </div>
                        <p style={{ margin: 0, lineHeight: 1.7 }}>{compareFromEntry.summary}</p>
                      </div>
                      <div className="compare-column">
                        <h4>After</h4>
                        <div className="version-meta">
                          <span>{compareToEntry.chapterCount} chapters</span>
                          <span>{compareToEntry.totalWords.toLocaleString()} words</span>
                          <span>{new Date(compareToEntry.createdAt).toLocaleString()}</span>
                        </div>
                        <p style={{ margin: 0, lineHeight: 1.7 }}>{compareToEntry.summary}</p>
                      </div>
                    </div>
                    <div className="card" style={{ marginTop: 14 }}>
                      <div className="label">Changed Chapters</div>
                      <h4 style={{ marginTop: 6 }}>Changed Chapters</h4>
                      {compareChanges.length > 0 ? (
                        <div className="version-list">
                          {compareChanges.map((change) => (
                            <div key={change.chapterKey} className="version-item">
                              <strong>{change.chapterLabel}</strong>
                              <div className="muted" style={{ marginTop: 6 }}>
                                {change.beforeWords.toLocaleString()} → {change.afterWords.toLocaleString()} words ({`${change.afterWords - change.beforeWords >= 0 ? "+" : ""}${(change.afterWords - change.beforeWords).toLocaleString()}`})
                              </div>
                              <div className="compare-grid" style={{ padding: "14px 0 0" }}>
                                <div className="compare-column">
                                  <h4>Before</h4>
                                  <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                                    {change.beforeExcerpt}
                                  </p>
                                </div>
                                <div className="compare-column">
                                  <h4>After</h4>
                                  <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                                    {change.afterExcerpt}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="muted">
                          No chapter text changed between these two versions.
                        </div>
                      )}
                      {addedChapterLabels.length > 0 ? (
                        <div style={{ marginTop: 14 }}>
                          <strong>Added chapters</strong>
                          <ul className="clean-list">
                            {addedChapterLabels.map((label) => (
                              <li key={label}>{label}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {removedChapterLabels.length > 0 ? (
                        <div style={{ marginTop: 14 }}>
                          <strong>Removed chapters</strong>
                          <ul className="clean-list">
                            {removedChapterLabels.map((label) => (
                              <li key={label}>{label}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : workspace.manuscriptHistory.length > 1 ? (
                  <div className="muted" style={{ marginTop: 14 }}>
                    Pick two different manuscript assemblies to compare.
                  </div>
                ) : (
                  <div className="muted" style={{ marginTop: 14 }}>
                    Create another manuscript assembly to unlock side-by-side comparison.
                  </div>
                )}
              </form>

              <div className="idea-list">
                {workspace.manuscriptHistory.map((entry) => (
                  <article key={entry.id} className="idea-card">
                    <div className="chapter-list-header">
                      <strong>Assembly v{entry.versionNumber}</strong>
                      <span className={`binder-status status-${String(entry.lifecycleState).toLowerCase()}`}>
                        {entry.lifecycleState}
                      </span>
                    </div>
                    <div className="chapter-list-metrics" style={{ marginTop: 8 }}>
                      <span>{entry.chapterCount} chapters</span>
                      <span>{entry.totalWords.toLocaleString()} words</span>
                      <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="muted" style={{ marginTop: 10 }}>
                      {entry.summary}
                    </div>
                    <details className="dossier-packet" style={{ marginTop: 12 }}>
                      <summary>Editorial Overview</summary>
                      <div className="dossier-packet-body">
                        <p style={{ margin: 0, lineHeight: 1.8 }}>{entry.editorialOverview}</p>
                      </div>
                    </details>
                    <details className="dossier-packet" style={{ marginTop: 12 }}>
                      <summary>Excerpt</summary>
                      <div className="dossier-packet-body">
                        <p style={{ margin: 0, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                          {entry.excerpt}
                        </p>
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="muted">
              Assemble the manuscript to start building revision-aware manuscript history.
            </div>
          )}
        </section>

        <section className="workspace-grid chapter-draft-grid">
          <section className="glass-panel section-panel chapter-list-panel">
            <div className="section-header">
              <h3>Chapter Readiness</h3>
              <div className="muted">
                Every chapter needs a draft before the editor agent can make a serious full-book pass.
              </div>
            </div>

            <div className="chapter-list">
              {workspace.chapters.map((entry) => (
                <div key={entry.chapterKey} className="chapter-list-item">
                  <div className="chapter-list-header">
                    <strong>{entry.chapterLabel}</strong>
                    <span className={`binder-status status-${entry.chapterText.trim().length > 0 ? "committed" : "empty"}`}>
                      {entry.chapterText.trim().length > 0 ? "Draft ready" : "Missing"}
                    </span>
                  </div>
                  <div className="muted chapter-list-meta">{entry.sectionTitle}</div>
                  <div className="chapter-list-metrics">
                    <span>{entry.wordCount.toLocaleString()} words</span>
                    <span>{entry.reviewSummary ? "Reviewed" : "No review yet"}</span>
                    <span>{entry.quality ? `Quality ${entry.quality.score}/100` : "Quality pending"}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-panel section-panel paper-wrap">
            <article className="paper manuscript-paper">
              <div className="toc-kicker">Full Book</div>
              <h3>Assembled Manuscript Preview</h3>
              {workspace.manuscriptAssembly ? (
                <div className="manuscript-body">
                  {assembledManuscript.split("\n\n").map((paragraph, index) => (
                    <p key={`editing-preview-${index}`}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  The full-book editorial pass unlocks after every chapter has a draft.
                  Until then, use Chapter Draft to finish the manuscript chapter by chapter.
                </div>
              )}
            </article>
          </section>
        </section>
      </main>

      <aside className="glass-panel rightbar">
        <div className="card">
          <div className="label">Draft Quality</div>
          <h3 style={{ marginTop: 6 }}>Manuscript Baseline</h3>
          {workspace.draftQualityRollup ? (
            <div className="stack" style={{ padding: 0 }}>
              <div className="recommendation">{workspace.draftQualityRollup.headline}</div>
              <ul className="clean-list">
                <li>Average score: {workspace.draftQualityRollup.averageScore}/100</li>
                <li>Revision flags: {workspace.draftQualityRollup.chaptersNeedingRevision}</li>
                <li>Weakest chapter: {workspace.draftQualityRollup.weakestChapterLabel ?? "None recorded"}</li>
              </ul>
            </div>
          ) : (
            <div className="muted">Draft quality telemetry has not been persisted for this manuscript yet.</div>
          )}
        </div>

        <div className="card">
          <div className="label">Commit Gate</div>
          <h3 style={{ marginTop: 6 }}>Editorial Readiness</h3>
          <div className="recommendation">
            {workspace.editorialReadinessGate.recommendation === "ready_for_commit"
              ? "The editor gate says this manuscript is ready to commit and package."
              : workspace.editorialReadinessGate.recommendation === "blocked"
                ? "The editor gate says this manuscript is not ready to commit yet."
                : "The editor gate recommends at least one more revision pass before commit."}
          </div>
          <div style={{ marginTop: 12 }}>
            <strong>Strengths</strong>
            <ul className="clean-list">
              {workspace.editorialReadinessGate.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <strong>Risks</strong>
            <ul className="clean-list">
              {workspace.editorialReadinessGate.risks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <strong>Next Actions</strong>
            <ul className="clean-list">
              {workspace.editorialReadinessGate.nextActions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card">
          <div className="label">Latest Assessment</div>
          <h3 style={{ marginTop: 6 }}>Editorial Assessment</h3>
          {workspace.latestAssessment ? (
            <div className="stack" style={{ padding: 0 }}>
              <div className="pill-row">
                <div className="pill">{workspace.latestAssessment.mode}</div>
                <div className="pill">
                  {workspace.latestAssessment.chapterKey ? "Chapter-focused" : "Whole-book"}
                </div>
              </div>
              <div className="recommendation">{workspace.latestAssessment.assessmentSummary}</div>
              <div>
                <strong>Strengths</strong>
                <ul className="clean-list">
                  {workspace.latestAssessment.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Risks</strong>
                <ul className="clean-list">
                  {workspace.latestAssessment.risks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="muted">
              Generate an editorial assessment to get a structured whole-book or chapter-level read.
            </div>
          )}
        </div>

        <div className="card">
          <div className="label">Editorial Preferences</div>
          <h3 style={{ marginTop: 6 }}>Editor Memory</h3>
          <div className="muted" style={{ lineHeight: 1.7 }}>
            Capture how you want edits handled so the editor agent can stay consistent across revision passes.
          </div>
          <form className="stack" action={updateEditorialPreferences.bind(null, slug)} style={{ marginTop: 12, padding: 0 }}>
            <textarea
              name="styleNotes"
              defaultValue={workspace.editorialPreferences.styleNotes}
              placeholder="Examples: preserve my cadence, cut repetition aggressively, avoid flattening tension, keep it more conversational."
            />
            <label className="muted"><input type="checkbox" name="preserveVoice" defaultChecked={workspace.editorialPreferences.preserveVoice} /> Preserve voice strongly</label>
            <label className="muted"><input type="checkbox" name="preferTighterProse" defaultChecked={workspace.editorialPreferences.preferTighterProse} /> Prefer tighter prose</label>
            <label className="muted"><input type="checkbox" name="preferBolderCuts" defaultChecked={workspace.editorialPreferences.preferBolderCuts} /> Allow bolder cuts and reshaping</label>
            <button className="btn" type="submit">Save Preferences</button>
          </form>
          <div className="muted" style={{ marginTop: 10 }}>
            Accepted: {workspace.editorialPreferences.acceptedRevisionCount} • Rejected: {workspace.editorialPreferences.rejectedRevisionCount}
          </div>
        </div>

        <div className="card">
          <div className="label">Revision Plan</div>
          <h3 style={{ marginTop: 6 }}>Whole-Book Revision Plan</h3>
          <form action={generateEditorialRevisionPlan.bind(null, slug)} className="stack" style={{ padding: 0, marginTop: 12 }}>
            <select name="chapterKey" defaultValue="">
              <option value="">Whole book</option>
              {workspace.chapters.map((chapter) => (
                <option key={`plan-${chapter.chapterKey}`} value={chapter.chapterKey}>
                  {chapter.chapterLabel}
                </option>
              ))}
            </select>
            <button className="btn" type="submit" disabled={!workspace.manuscriptAssembly}>
              Generate Revision Plan
            </button>
          </form>
          <form action={executeEditorialRevisionPlan.bind(null, slug)} className="stack" style={{ padding: 0, marginTop: 12 }}>
            <select name="limit" defaultValue="3">
              <option value="1">Run top 1 item</option>
              <option value="2">Run top 2 items</option>
              <option value="3">Run top 3 items</option>
              <option value="5">Run top 5 items</option>
            </select>
            <label className="muted">
              <input type="checkbox" name="autoApply" /> Auto-apply generated revisions
            </label>
            <button className="btn" type="submit" disabled={!workspace.revisionPlan || !workspace.manuscriptAssembly}>
              Generate Plan Queue
            </button>
          </form>
          {workspace.revisionPlan ? (
            <div className="stack" style={{ padding: 0, marginTop: 12 }}>
              <div className="recommendation">{workspace.revisionPlan.summary}</div>
              {workspace.revisionPlan.globalObjectives.length > 0 ? (
                <div>
                  <strong>Whole-Book Objectives</strong>
                  <ul className="clean-list">
                    {workspace.revisionPlan.globalObjectives.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {workspace.revisionPlan.coherenceRisks.length > 0 ? (
                <div>
                  <strong>Coherence Watchlist</strong>
                  <ul className="clean-list">
                    {workspace.revisionPlan.coherenceRisks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <strong>Planned Passes</strong>
                <ul className="clean-list">
                  {workspace.revisionPlan.passes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Chapter Queue</strong>
                <ul className="clean-list">
                  {workspace.revisionPlan.chapterQueue.map((item) => (
                    <li key={`${item.chapterKey}-${item.recommendedMode}`}>
                      <div>
                        <strong>{item.chapterLabel}</strong> · {item.priority} · {item.recommendedMode}
                      </div>
                      <div>{item.reason}</div>
                      <div className="muted">Target outcome: {item.targetOutcome}</div>
                      {item.preserveNotes.length > 0 ? (
                        <div className="muted">
                          Preserve: {item.preserveNotes.join(" • ")}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
              {workspace.revisionPlanExecution ? (
                <div className="muted" style={{ lineHeight: 1.7 }}>
                  Last run {new Date(workspace.revisionPlanExecution.executedAt).toLocaleString()} • Generated {workspace.revisionPlanExecution.generatedCount} revision{workspace.revisionPlanExecution.generatedCount === 1 ? "" : "s"} • Auto-applied {workspace.revisionPlanExecution.autoAppliedCount}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 10 }}>
              Generate a revision plan to prioritize the next editorial passes.
            </div>
          )}
        </div>

        <div className="card">
          <div className="label">Strategy</div>
          <h3 style={{ marginTop: 6 }}>Whole-Book Coherence Watchlist</h3>
          {workspace.revisionPlan ? (
            <div className="stack" style={{ padding: 0 }}>
              <div className="recommendation">
                {workspace.revisionPlan.summary}
              </div>
              {workspace.revisionPlan.globalObjectives.length > 0 ? (
                <div>
                  <strong>What this pass must accomplish</strong>
                  <ul className="clean-list">
                    {workspace.revisionPlan.globalObjectives.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {workspace.revisionPlan.coherenceRisks.length > 0 ? (
                <div>
                  <strong>What must not break</strong>
                  <ul className="clean-list">
                    {workspace.revisionPlan.coherenceRisks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="muted">
              Generate a revision plan first. This card will then condense the whole-book objectives and coherence risks into one editorial watchlist.
            </div>
          )}
        </div>

        <div className="card">
          <div className="label">Editor Agent</div>
          <h3 style={{ marginTop: 6 }}>Whole-Book Revision Loop</h3>
          <div className="muted" style={{ lineHeight: 1.7 }}>
            Use this to discuss structure, pacing, redundancy, voice consistency,
            and chapter-level revision strategy with the editor agent.
          </div>

          <div className="conversation-thread" style={{ padding: "16px 0 0", gap: 12 }}>
            {workspace.editorConversation.length === 0 ? (
              <div className="empty-state">
                Assemble the manuscript, then start a conversation about whole-book or
                chapter-specific revisions.
              </div>
            ) : (
              workspace.editorConversation.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                  {message.content}
                </div>
              ))
            )}
          </div>

          <form className="composer" action={sendEditingMessage.bind(null, slug)}>
            <input type="hidden" name="chapterKey" value={workspace.focusChapterKey ?? ""} />
            <textarea
              name="message"
              placeholder="Ask for a whole-book revision pass, a chapter-focused critique, or a structural edit recommendation."
            />
            <div className="composer-actions">
              <div className="muted">
                Focus: <strong>{workspace.focusChapterKey ?? "Whole book"}</strong>
              </div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!workspace.manuscriptAssembly}
              >
                Send to Editor
              </button>
            </div>
          </form>

          {workspace.suggestedRevisionTarget ? (
            <div className="recommendation" style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <strong>Suggested Next Revision</strong>
                <form action={generateSuggestedRevisionFromConversation.bind(null, slug)}>
                  <button className="btn" type="submit" disabled={!workspace.manuscriptAssembly}>
                    Turn Suggestion Into Revision
                  </button>
                </form>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                {workspace.suggestedRevisionTarget.mode}
                {workspace.suggestedRevisionTarget.chapterKey ? ` • ${workspace.suggestedRevisionTarget.chapterKey}` : " • Whole-book priority pass"}
              </div>
              {suggestedSectionsLabel ? (
                <div className="muted" style={{ marginTop: 8 }}>
                  Selected sections: {suggestedSectionsLabel}
                </div>
              ) : null}
              <div style={{ marginTop: 8 }}>{workspace.suggestedRevisionTarget.brief}</div>
              {workspace.suggestedRevisionTarget.preserveNotes.length > 0 ? (
                <div className="muted" style={{ marginTop: 8 }}>
                  Preserve: {workspace.suggestedRevisionTarget.preserveNotes.join(" • ")}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="label">Editorial View</div>
          <h3 style={{ marginTop: 6 }}>Whole-Book Assessment</h3>
          <div className="recommendation">
            {workspace.wholeBookAssessment ??
              "Assemble the manuscript to generate a whole-book editorial view."}
          </div>
          <div style={{ marginTop: 14 }}>
            <strong>Next Actions</strong>
            <ul className="clean-list">
              {workspace.suggestedNextActions.length > 0 ? (
                workspace.suggestedNextActions.map((item) => <li key={item}>{item}</li>)
              ) : (
                <li>No editorial actions have been suggested yet.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="card">
          <div className="label">Revision Queue</div>
          <h3 style={{ marginTop: 6 }}>Revision Queue</h3>
          {workspace.revisionQueue.length > 0 ? (
            <div className="stack" style={{ padding: 0 }}>
              {workspace.revisionQueue.map((entry) => {
                const applied = workspace.appliedRevisionIds.includes(entry.id);
                const rejected = workspace.rejectedRevisionIds.includes(entry.id);
                return (
                  <div key={entry.id} className="recommendation">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <strong>Revision v{entry.versionNumber}</strong>
                      <span className="muted">
                        {applied ? "Applied" : rejected ? "Rejected" : "Pending"}
                      </span>
                    </div>
                  <div className="muted" style={{ marginTop: 8 }}>
                      {entry.revision.revisionSummary}
                    </div>
                    <div className="muted" style={{ marginTop: 8 }}>
                      {new Date(entry.createdAt).toLocaleString()} · {entry.lifecycleState}
                    </div>
                    <details className="dossier-packet" style={{ marginTop: 12 }}>
                      <summary>Revision Rationale</summary>
                      <div className="dossier-packet-body">
                        <p style={{ margin: 0, lineHeight: 1.8 }}>{entry.revision.rationale}</p>
                      </div>
                    </details>
                    <ul className="clean-list">
                      {entry.revision.changedChapters.map((chapter) => (
                        <li key={`${entry.id}-${chapter.chapterKey}`}>
                          {chapter.chapterLabel}: {chapter.changeSummary}
                        </li>
                      ))}
                    </ul>
                    <details className="dossier-packet" style={{ marginTop: 12 }}>
                      <summary>Text Compare</summary>
                      <div className="dossier-packet-body">
                        {entry.revision.changedChapters.map((chapter) => (
                          <div key={`${entry.id}-${chapter.chapterKey}-compare`} style={{ marginBottom: 18 }}>
                            <strong>{chapter.chapterLabel}</strong>
                            <div className="muted" style={{ marginTop: 8 }}>Before</div>
                            <p style={{ marginTop: 6, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                              {chapter.originalText}
                            </p>
                            <div className="muted" style={{ marginTop: 8 }}>After</div>
                            <p style={{ marginTop: 6, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                              {chapter.revisedText}
                            </p>
                          </div>
                        ))}
                      </div>
                    </details>
                    {!applied && !rejected ? (
                      <div className="button-row" style={{ marginTop: 12 }}>
                        <form action={applyManuscriptRevision.bind(null, slug)}>
                          <input type="hidden" name="revisionVersionId" value={entry.id} />
                          <button className="btn btn-primary" type="submit">
                            Apply Revision
                          </button>
                        </form>
                        <form action={rejectManuscriptRevision.bind(null, slug)}>
                          <input type="hidden" name="revisionVersionId" value={entry.id} />
                          <button className="btn" type="submit">
                            Reject
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="muted">
              Generate a revision candidate to create an apply/reject editorial loop.
            </div>
          )}
        </div>

        <div className="card">
          <div className="label">Publish-Ready</div>
          <h3 style={{ marginTop: 6 }}>Publishing Package</h3>
          <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
            <strong>Publish Package Sync:</strong>{" "}
            {workspace.publishPackageSyncState.status === "synced"
              ? "Synced"
              : workspace.publishPackageSyncState.status === "stale"
                ? "Refresh required"
                : "Missing"}
            . {workspace.publishPackageSyncState.detail}
            {workspace.publishPackageSyncState.lastRefreshedAt ? (
              <> Last refreshed {new Date(workspace.publishPackageSyncState.lastRefreshedAt).toLocaleString()}.</>
            ) : null}
          </div>
          {workspace.publishingPackage ? (
            <div className="stack" style={{ padding: 0 }}>
              <div className="pill-row">
                <div className="pill">Status: {workspace.publishingPackage.packageStatus}</div>
                <div className="pill">
                  Formats: {workspace.publishingPackage.exportFormats.join(", ")}
                </div>
              </div>
              <div className="muted" style={{ lineHeight: 1.7 }}>
                Prepared at {new Date(workspace.publishingPackage.preparedAt).toLocaleString()}.
              </div>
              <ul className="clean-list">
                {workspace.publishingPackage.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="muted">
              Commit the Editing stage after manuscript assembly to generate the publish-ready package.
            </div>
          )}
        </div>
      </aside>
      </div>
    </div>
  );
}
