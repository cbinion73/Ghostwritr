import Link from "next/link";

import {
  addExternalStoryBinderTab,
  addExternalStoryClip,
  archiveExternalStoryBinderTab,
  combineExternalStoryBinderTabs,
  commitSelectedExternalStories,
  deleteExternalStoryClip,
  renameExternalStoryBinderTab,
  runFullExternalStoriesStage,
  separateExternalStoryBinderTab,
} from "./actions";
import { ResearchAutoRefresh } from "../research/auto-refresh";
import { SubmitButton } from "@/app/components/submit-button";
import { CollapsibleRightbar } from "@/app/components/collapsible-rightbar";

import { STAGE_LINKS } from "@/lib/navigation";
import { getExternalStoriesWorkspace } from "@/lib/workflows/external-stories";

type ExternalStoriesWorkspace = Awaited<ReturnType<typeof getExternalStoriesWorkspace>>;

function statusLabel(status: string) {
  return status === "COMMITTED" ? "Committed" : status === "DRAFT" ? "Draft" : "Empty";
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

export default async function ExternalStoriesStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tabId?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const workspace = await getExternalStoriesWorkspace(slug, query.tabId);
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
            Gather an abundant vault of true external stories so each chapter has more
            emotional proof than it strictly needs.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            External Stories: <strong>{workspace.stage?.status ?? "NOT_STARTED"}</strong>
          </div>
        </div>

        <div className="stage-list">
          {STAGE_LINKS.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href(slug)}
              className={`stage-chip ${stage.key === "EXTERNAL_STORIES" ? "active" : ""}`}
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
            <h2>External Stories</h2>
            <div className="muted">
              Collect more true stories than the chapter requires so later drafting,
              editing, and marketing all have options.
            </div>
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}/outline`}>
              Back to Outline
            </Link>
            <Link className="btn" href={`/books/${slug}/dashboard`}>
              Open Dashboard
            </Link>
            <form action={runFullExternalStoriesStage.bind(null, slug)}>
              <SubmitButton
                className="btn"
                label="Regenerate Story Vault"
                pendingLabel="Starting Story Run..."
              />
            </form>
          </div>
        </section>

        <section className="glass-panel binder-panel">
            <div className="binder-tabs">
            {workspace.tabs.map((tab: ExternalStoriesWorkspace["tabs"][number]) => (
              <Link
                key={tab.id}
                href={`/books/${slug}/external-stories?tabId=${tab.id}`}
                className={`binder-tab binder-${tab.colorToken} ${selectedTab?.id === tab.id ? "active" : ""}`}
              >
                <span>{tab.label}</span>
                <small>{tab.summary.chapterCount} dossier{tab.summary.chapterCount === 1 ? "" : "s"}</small>
                <div className="binder-meta">
                  <span className={`binder-status status-${tab.summary.status.toLowerCase()}`}>
                    {statusLabel(tab.summary.status)}
                  </span>
                  <span>{tab.summary.storyCount} stories</span>
                  <span>{tab.summary.verifiedStoryCount} verified</span>
                  <span>{tab.summary.ideaCount} ideas</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="workspace-grid research-workspace-grid">
          <section className="glass-panel section-panel paper-wrap">
            <article className="paper research-paper">
              <div className="toc-kicker">Story Binder</div>
              <h3>{selectedTab?.label ?? "External Stories"}</h3>

              <div className="research-stage-progress">
                <div className="stage-progress-bar" aria-label="External stories progress">
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
                  Chapters completed: {workspace.progress.completedChapters}/{workspace.progress.totalChapters}
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
                  {workspace.dossierEntries.map((entry: ExternalStoriesWorkspace["dossierEntries"][number]) => (
                    <section className="dossier-section" key={entry.chapter.chapterKey}>
                      <div className="dossier-heading">
                        <div>
                          <div className="label">Chapter Story Vault</div>
                          <h4>{entry.chapter.chapterLabel}</h4>
                        </div>
                        <div className="button-row">
                          <form action={commitSelectedExternalStories.bind(null, slug)}>
                            <input name="chapterKey" type="hidden" value={entry.chapter.chapterKey} />
                            <SubmitButton
                              className="btn"
                              label="Commit Chapter Vault"
                              pendingLabel="Committing..."
                            />
                          </form>
                        </div>
                      </div>

                      <p className="dossier-description">
                        {entry.dossier?.storyGoal ?? "No story vault generated for this chapter yet."}
                      </p>

                      {entry.dossier ? (
                        <>
                          {entry.dossier.metadata?.provisional ? (
                            <div className="card" style={{ borderColor: "#b06733", background: "rgba(176, 103, 51, 0.08)" }}>
                              <strong>Provisional Story Vault</strong>
                              <div className="muted" style={{ marginTop: 8 }}>
                                {entry.dossier.metadata.warning ??
                                  "Generated without live web verification. Use these as story-hunt leads, then retry once web access is configured."}
                              </div>
                            </div>
                          ) : null}

                          <div className="research-metrics">
                            <div className="metric">Stories: {entry.dossier.verificationSummary.totalStories}</div>
                            <div className="metric">Verified: {entry.dossier.verificationSummary.verifiedStories}</div>
                            <div className="metric">Sources: {entry.dossier.verificationSummary.totalSources}</div>
                          </div>

                          <details className="dossier-packet" open>
                            <summary>Best Story Candidates</summary>
                            <div className="dossier-packet-body source-register">
                              {entry.stories.map((story) => (
                                <article className="source-card" key={story.id}>
                                  <div className="source-card-header">
                                    <div>
                                      <strong>{story.title}</strong>
                                      <div className="muted">
                                        {story.storyType.replace(/_/g, " ").toLowerCase()} • {story.storyFit.replace(/_/g, " ").toLowerCase()}
                                      </div>
                                    </div>
                                    <span className={`tier-badge tier-${String(story.sourceTier).toLowerCase()}`}>
                                      Tier {story.sourceTier}
                                    </span>
                                  </div>
                                  <div className="source-note">{story.summary}</div>
                                  <div className="muted" style={{ marginTop: 10 }}>{story.whyItMatters}</div>
                                </article>
                              ))}
                            </div>
                          </details>

                          <details className="dossier-packet">
                            <summary>Story Types Covered</summary>
                            <div className="dossier-packet-body pill-row">
                              {entry.dossier.storyTypesCovered.map((item) => (
                                <div className="pill" key={item}>{item.replace(/_/g, " ")}</div>
                              ))}
                            </div>
                          </details>

                          <details className="dossier-packet">
                            <summary>Source Register</summary>
                            <div className="dossier-packet-body source-register">
                              {entry.sources.map((source) => (
                                <article className="source-card" key={source.id}>
                                  <div className="source-card-header">
                                    <div>
                                      <strong>{source.title}</strong>
                                      <div className="muted">{source.publisher ?? "Unknown publisher"}</div>
                                    </div>
                                    <span className={`tier-badge tier-${String(source.sourceTier).toLowerCase()}`}>
                                      Tier {source.sourceTier}
                                    </span>
                                  </div>
                                  <div className="muted source-note">
                                    {source.verificationNotes ?? "Awaiting verification notes."}
                                  </div>
                                </article>
                              ))}
                            </div>
                          </details>
                        </>
                      ) : (
                        <div className="empty-state" style={{ padding: 0 }}>
                          No story vault generated yet for this chapter.
                        </div>
                      )}
                    </section>
                  ))}

                  {workspace.progress.failedChapters.length > 0 ? (
                    <details className="dossier-packet">
                      <summary>External Story Generation Issues</summary>
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
                  No external story tabs exist yet.
                </div>
              )}
            </article>
          </section>
        </section>
      </main>

      <CollapsibleRightbar title="Story Leads & Binder Tools">
        <div className="card paperclip-card">
          <div className="paperclip-header">
            <div>
              <div className="label">Paperclip</div>
              <h3>Clip Story Lead</h3>
            </div>
            <div className="paperclip-mark">Paperclip</div>
          </div>

          {selectedTab ? (
            <form action={addExternalStoryClip.bind(null, slug)} className="stack" style={{ padding: 0 }}>
              <input name="tabId" type="hidden" value={selectedTab.id} />
              <input name="chapterKey" type="hidden" value={selectedTab.chapterKeys[0] ?? ""} />
              <input className="editor-input" name="title" placeholder="Story lead title" type="text" />
              <textarea className="editor-textarea" name="content" placeholder="Pin a leader, company, event, or emotional angle to pursue later." />
              <button className="btn btn-primary" type="submit">Clip Story Lead</button>
            </form>
          ) : (
            <div className="muted">Choose a story tab first.</div>
          )}
        </div>

        <div className="card">
          <h3>Binder Controls</h3>
          <form action={addExternalStoryBinderTab.bind(null, slug)} className="stack compact-stack">
            <input className="editor-input" name="label" placeholder="Add a new story tab" type="text" />
            <select className="editor-input" name="chapterKey" defaultValue="">
              <option value="">No chapter assigned yet</option>
              {workspace.availableChapters.map((chapter: ExternalStoriesWorkspace["availableChapters"][number]) => (
                <option key={chapter.chapterKey} value={chapter.chapterKey}>{chapter.chapterLabel}</option>
              ))}
            </select>
            <button className="btn" type="submit">Add Tab</button>
          </form>

          {selectedTab ? (
            <details className="organize-panel">
              <summary>Organize This Tab</summary>
              <div className="organize-panel-body">
                <form action={renameExternalStoryBinderTab.bind(null, slug)} className="stack compact-stack">
                  <input name="tabId" type="hidden" value={selectedTab.id} />
                  <input className="editor-input" defaultValue={selectedTab.label} name="label" type="text" />
                  <button className="btn" type="submit">Rename Tab</button>
                </form>

                <form action={combineExternalStoryBinderTabs.bind(null, slug)} className="stack compact-stack">
                  <input name="sourceTabId" type="hidden" value={selectedTab.id} />
                  <select className="editor-input" name="targetTabId" defaultValue="">
                    <option value="">Combine into...</option>
                    {workspace.tabs
                      .filter((tab: ExternalStoriesWorkspace["tabs"][number]) => tab.id !== selectedTab.id)
                      .map((tab: ExternalStoriesWorkspace["tabs"][number]) => (
                      <option key={tab.id} value={tab.id}>{tab.label}</option>
                    ))}
                  </select>
                  <button className="btn" type="submit">Combine Tabs</button>
                </form>

                {selectedTab.chapterKeys.length > 1 ? (
                  <form action={separateExternalStoryBinderTab.bind(null, slug)} className="stack compact-stack">
                    <input name="sourceTabId" type="hidden" value={selectedTab.id} />
                    <select className="editor-input" name="chapterKey" defaultValue="">
                      <option value="">Separate chapter...</option>
                      {selectedTab.chapterKeys.map((chapterKey) => (
                        <option key={chapterKey} value={chapterKey}>{chapterKey}</option>
                      ))}
                    </select>
                    <input className="editor-input" name="newLabel" placeholder="New tab name" type="text" />
                    <button className="btn" type="submit">Separate Into New Tab</button>
                  </form>
                ) : null}

                <form action={archiveExternalStoryBinderTab.bind(null, slug)} className="stack compact-stack">
                  <input name="tabId" type="hidden" value={selectedTab.id} />
                  <button className="btn" type="submit">Remove Tab</button>
                </form>
              </div>
            </details>
          ) : null}
        </div>

        <div className="card">
          <h3>Clipped Story Leads</h3>
          {selectedTab?.storyClips.length ? (
            <div className="idea-list">
              {selectedTab.storyClips.map((clip) => (
                <article className="idea-card" key={clip.id}>
                  <div className="idea-card-header">
                    <strong>{clip.title || "Untitled lead"}</strong>
                    <form action={deleteExternalStoryClip.bind(null, slug)}>
                      <input name="clipId" type="hidden" value={clip.id} />
                      <input name="tabId" type="hidden" value={selectedTab.id} />
                      <button className="text-link" type="submit">Remove</button>
                    </form>
                  </div>
                  <p>{clip.content}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="muted">No clipped leads yet for this story tab.</div>
          )}
        </div>
      </CollapsibleRightbar>
    </div>
  );
}
