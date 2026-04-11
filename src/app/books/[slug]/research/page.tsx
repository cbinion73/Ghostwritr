import Link from "next/link";

import {
  addResearchBinderTab,
  addResearchIdeaClip,
  archiveResearchBinderTab,
  combineResearchBinderTabs,
  commitAllResearch,
  commitSelectedResearchDossier,
  deleteResearchIdeaClip,
  renameResearchBinderTab,
  runFullResearchStage,
  runSelectedResearchDossier,
  separateResearchBinderTab,
} from "./actions";
import { ResearchAutoRefresh } from "./auto-refresh";
import { SubmitButton } from "@/app/components/submit-button";
import { CollapsibleRightbar } from "@/app/components/collapsible-rightbar";

import { STAGE_LINKS } from "@/lib/navigation";
import { getResearchWorkspace } from "@/lib/workflows/research";

function tierClassName(tier: string) {
  return `tier-badge tier-${tier.toLowerCase()}`;
}

function dossierStatusLabel(status: string) {
  switch (status) {
    case "COMMITTED":
      return "Committed";
    case "NEEDS_REVIEW":
      return "Needs review";
    case "DRAFT":
      return "Draft";
    default:
      return "Empty";
  }
}

function findChapterLabel(
  availableChapters: Array<{ chapterKey: string; chapterLabel: string }>,
  chapterKey: string | null,
) {
  if (!chapterKey) {
    return null;
  }

  return availableChapters.find((chapter) => chapter.chapterKey === chapterKey)?.chapterLabel ?? chapterKey;
}

function progressPercent(completed: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export default async function ResearchStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tabId?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const workspace = await getResearchWorkspace(slug, query.tabId);
  const selectedTab = workspace.selectedTab;
  const isAutoRefreshing =
    workspace.progress.automationStatus === "queued" ||
    workspace.progress.automationStatus === "running";

  return (
    <div className="page-shell">
      <ResearchAutoRefresh active={isAutoRefreshing} />
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Build a chapter-by-chapter research binder that is sourced, verifiable,
            and easy to reshape as the book sharpens.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Research status: <strong>{workspace.stage?.status ?? "NOT_STARTED"}</strong>
          </div>
        </div>

        <div className="stage-list">
          {STAGE_LINKS.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href(slug)}
              className={`stage-chip ${stage.key === "RESEARCH" ? "active" : ""}`}
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
            <h2>Research Dossiers</h2>
            <div className="muted">
              Each binder tab holds a chapter dossier. Add notes with the paperclip,
              regroup chapters when needed, and run the verification pipeline one tab
              at a time.
            </div>
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}/outline`}>
              Back to Outline
            </Link>
            <Link className="btn" href={`/books/${slug}/dashboard`}>
              Open Dashboard
            </Link>
            <form action={runFullResearchStage.bind(null, slug)}>
              <SubmitButton
                className="btn"
                label="Regenerate Full Research"
                pendingLabel="Starting Research..."
              />
            </form>
            {selectedTab ? (
              <>
                <form action={runSelectedResearchDossier.bind(null, slug)}>
                  <input name="tabId" type="hidden" value={selectedTab.id} />
                  <SubmitButton
                    className="btn"
                    label="Generate Selected Dossier"
                    pendingLabel="Generating..."
                  />
                </form>
                <form action={commitSelectedResearchDossier.bind(null, slug)}>
                  <input name="tabId" type="hidden" value={selectedTab.id} />
                  <SubmitButton
                    className="btn btn-primary"
                    label="Commit Selected Dossier"
                    pendingLabel="Committing..."
                  />
                </form>
                <form action={commitAllResearch.bind(null, slug)}>
                  <SubmitButton
                    className="btn btn-primary"
                    label="Commit All Research"
                    pendingLabel="Committing All..."
                  />
                </form>
              </>
            ) : null}
          </div>
        </section>

        <section className="glass-panel binder-panel">
          <div className="binder-tabs">
            {workspace.tabs.map((tab) => (
              <Link
                key={tab.id}
                href={`/books/${slug}/research?tabId=${tab.id}`}
                className={`binder-tab binder-${tab.colorToken} ${selectedTab?.id === tab.id ? "active" : ""}`}
              >
                <span>{tab.label}</span>
                <small>{tab.summary.chapterCount} dossier{tab.summary.chapterCount === 1 ? "" : "s"}</small>
                <div className="binder-meta">
                  <span className={`binder-status status-${tab.summary.status.toLowerCase()}`}>
                    {dossierStatusLabel(tab.summary.status)}
                  </span>
                  <span>{tab.summary.verifiedSourceCount} src</span>
                  <span>{tab.summary.verifiedItemCount} items</span>
                  <span>{tab.summary.ideaCount} ideas</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="workspace-grid research-workspace-grid">
          <section className="glass-panel section-panel paper-wrap">
            <article className="paper research-paper">
              <div className="toc-kicker">Binder Dossier</div>
              <h3>{selectedTab?.label ?? "Research Binder"}</h3>
              <div className="research-stage-progress">
                <div className="stage-progress-bar" aria-label="Research progress">
                  <div
                    className="stage-progress-fill"
                    style={{
                      width: `${progressPercent(
                        workspace.progress.completedChapters,
                        workspace.progress.totalChapters,
                      )}%`,
                    }}
                  />
                </div>
                <div className="metric">
                  Chapters completed: {workspace.progress.completedChapters}/
                  {workspace.progress.totalChapters}
                </div>
                <div className="metric">
                  Stage state: {workspace.progress.automationStatus.replace(/_/g, " ")}
                </div>
                {workspace.progress.currentChapterKey ? (
                  <div className="metric">
                    Working on: {findChapterLabel(
                      workspace.availableChapters,
                      workspace.progress.currentChapterKey,
                    )}
                  </div>
                ) : null}
                {workspace.progress.failedChapters.length > 0 ? (
                  <div className="metric">
                    Failed: {workspace.progress.failedChapters.length}
                  </div>
                ) : null}
                {workspace.progress.provisionalChapters.length > 0 ? (
                  <div className="metric">
                    Provisional: {workspace.progress.provisionalChapters.length}
                  </div>
                ) : null}
              </div>

              {selectedTab ? (
                <div className="stack research-stack" style={{ padding: 0 }}>
                  <div className="card chapter-membership-card">
                    <h4>Tab Coverage</h4>
                    <div className="pill-row">
                      {selectedTab.chapterKeys.map((chapterKey) => {
                        const chapter = workspace.availableChapters.find(
                          (item) => item.chapterKey === chapterKey,
                        );

                        return (
                          <div className="pill" key={chapterKey}>
                            {chapter?.chapterLabel ?? chapterKey}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {workspace.dossierEntries.length > 0 ? (
                    workspace.dossierEntries.map((entry) => (
                      <section className="dossier-section" key={entry.chapter.chapterKey}>
                        <div className="dossier-heading">
                          <div>
                            <div className="label">Chapter Dossier</div>
                            <h4>{entry.chapter.chapterLabel}</h4>
                          </div>
                          <div className="muted">
                            {entry.version
                              ? `Version ${entry.version.versionNumber}`
                              : "Not generated yet"}
                          </div>
                        </div>

                        <p className="dossier-description">
                          {entry.dossier?.chapterDescription ??
                            "This chapter dossier has not been generated yet."}
                        </p>

                        {entry.dossier ? (
                          <>
                            {entry.dossier.metadata?.provisional ? (
                              <div className="card" style={{ borderColor: "#b06733", background: "rgba(176, 103, 51, 0.08)" }}>
                                <strong>Provisional Research Dossier</strong>
                                <div className="muted" style={{ marginTop: 8 }}>
                                  {entry.dossier.metadata.warning ??
                                    "Generated without verified web sources. Use this as a scaffold, then retry once web access is configured."}
                                </div>
                              </div>
                            ) : null}

                            <div className="research-metrics">
                              <div className={`binder-status status-${entry.status.toLowerCase()}`}>
                                {dossierStatusLabel(entry.status)}
                              </div>
                              <div className="metric">
                                Verified sources: {entry.dossier.verificationSummary.verifiedSources}/
                                {entry.dossier.verificationSummary.totalSources}
                              </div>
                              <div className="metric">
                                Verified items: {entry.dossier.verificationSummary.verifiedItems}/
                                {entry.dossier.verificationSummary.totalItems}
                              </div>
                              <div className="metric">
                                Needs corroboration: {entry.dossier.verificationSummary.needsCorroborationItems}
                              </div>
                            </div>

                            <details className="dossier-packet" open>
                              <summary>Research Questions</summary>
                              <div className="dossier-packet-body">
                                <ul className="clean-list">
                                  {entry.dossier.researchQuestions.map((question) => (
                                    <li key={question.id}>{question.question}</li>
                                  ))}
                                </ul>
                              </div>
                            </details>

                            <details className="dossier-packet" open>
                              <summary>Verified Facts</summary>
                              <div className="dossier-packet-body">
                                {entry.dossier.factBank.length > 0 ? (
                                  <ul className="clean-list">
                                    {entry.dossier.factBank.map((item) => (
                                      <li key={item.id}>{item.claimText}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="muted">No verified facts admitted yet.</div>
                                )}
                              </div>
                            </details>

                            <div className="research-column-grid">
                              <details className="dossier-packet">
                                <summary>Statistics And Definitions</summary>
                                <div className="dossier-packet-body">
                                  <ul className="clean-list">
                                    {[...entry.dossier.statistics, ...entry.dossier.definitions]
                                      .slice(0, 6)
                                      .map((item) => (
                                        <li key={item.id}>{item.claimText}</li>
                                      ))}
                                  </ul>
                                </div>
                              </details>

                              <details className="dossier-packet">
                                <summary>Examples And Counterpoints</summary>
                                <div className="dossier-packet-body">
                                  <ul className="clean-list">
                                    {[...entry.dossier.examples, ...entry.dossier.counterpoints]
                                      .slice(0, 6)
                                      .map((item) => (
                                        <li key={item.id}>{item.claimText}</li>
                                      ))}
                                  </ul>
                                </div>
                              </details>
                            </div>

                            <details className="dossier-packet">
                              <summary>Source Register</summary>
                              <div className="dossier-packet-body source-register">
                                {entry.sources.length > 0 ? (
                                  entry.sources.map((source) => (
                                    <article className="source-card" key={source.id}>
                                      <div className="source-card-header">
                                        <div>
                                          <strong>{source.title}</strong>
                                          <div className="muted">
                                            {source.publisher ?? "Unknown publisher"}
                                          </div>
                                        </div>
                                        <span className={tierClassName(source.sourceTier)}>
                                          Tier {source.sourceTier}
                                        </span>
                                      </div>
                                      <div className="muted source-note">
                                        {source.verificationNotes ?? "Awaiting verification notes."}
                                      </div>
                                    </article>
                                  ))
                                ) : (
                                  <div className="muted">
                                    Generate this dossier to collect and verify source material.
                                  </div>
                                )}
                              </div>
                            </details>

                            <details className="dossier-packet">
                              <summary>Open Gaps</summary>
                              <div className="dossier-packet-body">
                                {entry.dossier.gaps.length > 0 ? (
                                  <ul className="clean-list">
                                    {entry.dossier.gaps.map((gap, index) => (
                                      <li key={`${entry.chapter.chapterKey}-gap-${index}`}>{gap}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="muted">No open gaps are currently flagged.</div>
                                )}
                              </div>
                            </details>
                          </>
                        ) : (
                          <div className="empty-state" style={{ padding: 0 }}>
                            No dossier has been generated for this chapter set yet. Use
                            the button above to run web research and verification.
                          </div>
                        )}
                      </section>
                    ))
                  ) : (
                    <div className="empty-state" style={{ padding: 0 }}>
                      Commit the outline first so the binder knows which chapters need
                      dossiers.
                    </div>
                  )}

                  {workspace.progress.failedChapters.length > 0 ? (
                    <details className="dossier-packet">
                      <summary>Research Generation Issues</summary>
                      <div className="dossier-packet-body">
                        <ul className="clean-list">
                          {workspace.progress.failedChapters.map((failure, index) => (
                            <li key={`${String(failure)}-${index}`}>
                              {typeof failure === "object" && failure && "chapterKey" in failure
                                ? `${findChapterLabel(workspace.availableChapters, String(failure.chapterKey))}: ${"message" in failure ? String(failure.message) : "Unknown error"}`
                                : String(failure)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 0 }}>
                  No binder tabs exist yet. Add one from the right rail.
                </div>
              )}
            </article>
          </section>
        </section>
      </main>

      <CollapsibleRightbar title="Ideas & Binder Tools">
        <div className="card paperclip-card">
          <div className="paperclip-header">
            <div>
              <div className="label">Paperclip</div>
              <h3>Clip An Idea</h3>
            </div>
            <div className="paperclip-mark">Paperclip</div>
          </div>

          {selectedTab ? (
            <form action={addResearchIdeaClip.bind(null, slug)} className="stack" style={{ padding: 0 }}>
              <input name="tabId" type="hidden" value={selectedTab.id} />
              <input
                name="chapterKey"
                type="hidden"
                value={selectedTab.chapterKeys[0] ?? ""}
              />
              <input
                name="title"
                placeholder="Idea title"
                className="editor-input"
                type="text"
              />
              <textarea
                className="editor-textarea"
                name="content"
                placeholder="Pin an insight, story lead, source lead, or direction for this chapter dossier."
              />
              <button className="btn btn-primary" type="submit">
                Clip Idea To Tab
              </button>
            </form>
          ) : (
            <div className="muted">Choose a dossier tab first.</div>
          )}
        </div>

        <div className="card">
          <h3>Binder Controls</h3>

          <form action={addResearchBinderTab.bind(null, slug)} className="stack compact-stack">
            <input
              className="editor-input"
              name="label"
              placeholder="Add a new dossier tab"
              type="text"
            />
            <select className="editor-input" name="chapterKey" defaultValue="">
              <option value="">No chapter assigned yet</option>
              {workspace.availableChapters.map((chapter) => (
                <option key={chapter.chapterKey} value={chapter.chapterKey}>
                  {chapter.chapterLabel}
                </option>
              ))}
            </select>
            <button className="btn" type="submit">
              Add Tab
            </button>
          </form>

          {selectedTab ? (
            <>
              <details className="organize-panel">
                <summary>Organize This Tab</summary>
                <div className="organize-panel-body">
                  <form action={renameResearchBinderTab.bind(null, slug)} className="stack compact-stack">
                    <input name="tabId" type="hidden" value={selectedTab.id} />
                    <input
                      className="editor-input"
                      defaultValue={selectedTab.label}
                      name="label"
                      type="text"
                    />
                    <button className="btn" type="submit">
                      Rename Tab
                    </button>
                  </form>

                  <form action={combineResearchBinderTabs.bind(null, slug)} className="stack compact-stack">
                    <input name="sourceTabId" type="hidden" value={selectedTab.id} />
                    <select className="editor-input" name="targetTabId" defaultValue="">
                      <option value="">Combine into...</option>
                      {workspace.tabs
                        .filter((tab) => tab.id !== selectedTab.id)
                        .map((tab) => (
                          <option key={tab.id} value={tab.id}>
                            {tab.label}
                          </option>
                        ))}
                    </select>
                    <button className="btn" type="submit">
                      Combine Tabs
                    </button>
                  </form>

                  {selectedTab.chapterKeys.length > 1 ? (
                    <form action={separateResearchBinderTab.bind(null, slug)} className="stack compact-stack">
                      <input name="sourceTabId" type="hidden" value={selectedTab.id} />
                      <select className="editor-input" name="chapterKey" defaultValue="">
                        <option value="">Separate chapter...</option>
                        {selectedTab.chapterKeys.map((chapterKey) => {
                          const chapter = workspace.availableChapters.find(
                            (item) => item.chapterKey === chapterKey,
                          );

                          return (
                            <option key={chapterKey} value={chapterKey}>
                              {chapter?.chapterLabel ?? chapterKey}
                            </option>
                          );
                        })}
                      </select>
                      <input
                        className="editor-input"
                        name="newLabel"
                        placeholder="New tab name"
                        type="text"
                      />
                      <button className="btn" type="submit">
                        Separate Into New Tab
                      </button>
                    </form>
                  ) : null}

                  <form action={archiveResearchBinderTab.bind(null, slug)} className="stack compact-stack">
                    <input name="tabId" type="hidden" value={selectedTab.id} />
                    <button className="btn" type="submit">
                      Remove Tab
                    </button>
                  </form>
                </div>
              </details>
            </>
          ) : null}
        </div>

        <div className="card">
          <h3>Clipped Ideas</h3>
          {selectedTab?.ideaClips.length ? (
            <div className="idea-list">
              {selectedTab.ideaClips.map((idea) => (
                <article className="idea-card" key={idea.id}>
                  <div className="idea-card-header">
                    <strong>{idea.title || "Untitled idea"}</strong>
                    <form action={deleteResearchIdeaClip.bind(null, slug)}>
                      <input name="ideaId" type="hidden" value={idea.id} />
                      <input name="tabId" type="hidden" value={selectedTab.id} />
                      <button className="text-link" type="submit">
                        Remove
                      </button>
                    </form>
                  </div>
                  <p>{idea.content}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="muted">
              No clipped ideas yet for this tab. Use the paperclip panel above to pin
              story leads, objections, examples, or questions.
            </div>
          )}
        </div>
      </CollapsibleRightbar>
    </div>
  );
}
