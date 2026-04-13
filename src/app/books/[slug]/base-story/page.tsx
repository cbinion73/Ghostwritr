import Link from "next/link";

import { commitBaseStoryStage, runBaseStoryStage } from "./actions";
import { ResearchAutoRefresh } from "../research/auto-refresh";

import { STAGE_LINKS } from "@/lib/navigation";
import { getBaseStoryWorkspace } from "@/lib/workflows/base-story";

export default async function BaseStoryStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getBaseStoryWorkspace(slug);
  const bundle = workspace.latestBundle;
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
            Shape the narrative thread that ties the entire book together while
            staying independent from Research and External Stories.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Base Story: <strong>{workspace.stage?.status ?? "NOT_STARTED"}</strong>
          </div>
        </div>

        <div className="stage-list">
          {STAGE_LINKS.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href(slug)}
              className={`stage-chip ${stage.key === "BASE_STORY" ? "active" : ""}`}
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
            <h2>Base Story</h2>
            <div className="muted">
              A chapter-by-chapter story spine that ties the whole manuscript together.
            </div>
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}/outline`}>
              Back to Outline
            </Link>
            <Link className="btn" href={`/books/${slug}/dashboard`}>
              Open Dashboard
            </Link>
            <form action={runBaseStoryStage.bind(null, slug)}>
              <button className="btn" disabled={!workspace.outlineReady} type="submit">
                Regenerate Base Story
              </button>
            </form>
            <form action={commitBaseStoryStage.bind(null, slug)}>
              <button className="btn btn-primary" disabled={!bundle} type="submit">
                Commit Base Story
              </button>
            </form>
          </div>
        </section>

        <section className="workspace-grid outline-workspace-grid">
          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>Narrative Options</h3>
              <div className="muted">
                The format is chosen from the Book Promise and Outline, but alternatives stay visible.
              </div>
            </div>

            <div className="stack">
              <div className="card">
                <h4>Progress</h4>
                <div className="metric-row">
                  <div className="metric">State: {workspace.progress.automationStatus.replace(/_/g, " ")}</div>
                  <div className="metric">Chapters: {workspace.progress.completedChapters}/{workspace.progress.totalChapters}</div>
                </div>
              </div>

              {bundle ? (
                <>
                  <div className="card">
                    <h4>Selected Format</h4>
                    <div className="pill">{bundle.selectedFormat.replace(/_/g, " ")}</div>
                  </div>

                  <div className="card">
                    <h4>Available Formats</h4>
                    <div className="stack" style={{ padding: 0 }}>
                      {bundle.availableFormats.map((format) => (
                        <div className="card" key={format.format} style={{ padding: 14 }}>
                          <strong>{format.label}</strong>
                          <div className="muted" style={{ marginTop: 6 }}>{format.description}</div>
                          <div className="muted" style={{ marginTop: 6 }}>Best for: {format.bestFor}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  {workspace.outlineReady
                    ? "No Base Story exists yet. Run generation from this page."
                    : "Commit the full Outline ToC first, then Base Story will unlock."}
                </div>
              )}
            </div>
          </section>

          <section className="glass-panel section-panel paper-wrap">
            <article className="paper research-paper">
              <div className="toc-kicker">Narrative Thread</div>
              <h3>{bundle?.workingTitle ?? workspace.book.titleWorking ?? "Base Story"}</h3>

              {bundle ? (
                <div className="stack research-stack" style={{ padding: 0 }}>
                  <div className="card">
                    <h4>Story Premise</h4>
                    <p style={{ margin: 0, lineHeight: 1.8 }}>{bundle.storyPremise}</p>
                  </div>

                  <div className="card">
                    <h4>Book Thread</h4>
                    <p style={{ margin: 0, lineHeight: 1.8 }}>{bundle.bookThread}</p>
                  </div>

                  <div className="card">
                    <h4>Book-Level Movement</h4>
                    <div className="stack" style={{ padding: 0 }}>
                      <div><strong>Me:</strong> {bundle.bookMovement.me}</div>
                      <div><strong>We:</strong> {bundle.bookMovement.we}</div>
                      <div><strong>Truth:</strong> {bundle.bookMovement.truth}</div>
                      <div><strong>You:</strong> {bundle.bookMovement.you}</div>
                      <div><strong>We Closing:</strong> {bundle.bookMovement.weClosing}</div>
                    </div>
                  </div>

                  {bundle.chapters.map((chapter) => (
                    <section className="dossier-section" key={chapter.chapterKey}>
                      <div className="dossier-heading">
                        <div>
                          <div className="label">Chapter Thread</div>
                          <h4>{chapter.chapterLabel}</h4>
                        </div>
                      </div>

                      <details className="dossier-packet" open>
                        <summary>Chapter Purpose</summary>
                        <div className="dossier-packet-body">
                          <p style={{ margin: 0, lineHeight: 1.8 }}>{chapter.chapterPurpose}</p>
                        </div>
                      </details>

                      <details className="dossier-packet" open>
                        <summary>Thread Role</summary>
                        <div className="dossier-packet-body">
                          <p style={{ margin: 0, lineHeight: 1.8 }}>{chapter.threadRole}</p>
                        </div>
                      </details>

                      <details className="dossier-packet" open>
                        <summary>Chapter Story</summary>
                        <div className="dossier-packet-body">
                          <p style={{ margin: 0, lineHeight: 1.9 }}>{chapter.chapterStory}</p>
                        </div>
                      </details>

                      <details className="dossier-packet" open>
                        <summary>Chapter-Level Movement</summary>
                        <div className="dossier-packet-body">
                          <div className="stack" style={{ padding: 0 }}>
                            <div><strong>Me:</strong> {chapter.movement.me}</div>
                            <div><strong>We:</strong> {chapter.movement.we}</div>
                            <div><strong>Truth:</strong> {chapter.movement.truth}</div>
                            <div><strong>You:</strong> {chapter.movement.you}</div>
                            <div><strong>We Closing:</strong> {chapter.movement.weClosing}</div>
                          </div>
                        </div>
                      </details>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 0 }}>
                  No Base Story has been generated yet.
                </div>
              )}
            </article>
          </section>
        </section>
      </main>

      <aside className="glass-panel rightbar">
        <div className="card">
          <h3>How This Is Used Later</h3>
          <ul className="clean-list">
            <li>Base Story stays independent from Research and External Stories.</li>
            <li>Later chapter drafting brings all three sibling stages together under the Outline.</li>
            <li>This page is the narrative spine, not the final chapter prose.</li>
          </ul>
        </div>

        {workspace.versions.length > 0 ? (
          <div className="card">
            <h3>Recent Versions</h3>
            <div className="idea-list">
              {workspace.versions.map((version) => (
                <article className="idea-card" key={version.id}>
                  <strong>Version {version.versionNumber}</strong>
                  <div className="muted">{version.lifecycleState}</div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
