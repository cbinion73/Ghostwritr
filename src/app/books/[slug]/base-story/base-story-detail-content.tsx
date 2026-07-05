/**
 * The Base Story room — the narrative spine content, shared between the
 * Book Studio (rendered as the BASE_STORY stage slot) and the retired
 * standalone view. Server component: fetches the base-story workspace
 * itself.
 *
 * No chat here — this stage is generate/review/commit, not conversational,
 * distinct from the generic AgentChatPanel used by most other stages.
 */

import Link from "next/link";

import { commitBaseStoryStage, runBaseStoryStage } from "./actions";
import { getStaleDependencyRecoveryHint, getStaleDependencyState } from "@/lib/stale-dependency";
import { getBaseStoryWorkspace } from "@/lib/workflows/base-story";

export async function BaseStoryDetailContent({ slug }: { slug: string }) {
  const workspace = await getBaseStoryWorkspace(slug);
  const rawBundle = workspace.latestBundle;
  // Some legacy bundles were stored as free-text ({text}) rather than the
  // structured BaseStoryBundle shape — normalizeBaseStoryBundle defaults
  // chapters/bookMovement even for these, so check selectedFormat (never
  // set on legacy data) to detect a genuinely structured bundle.
  const bundle = rawBundle && typeof rawBundle.selectedFormat === "string" ? rawBundle : null;
  const legacyText =
    rawBundle && typeof rawBundle.selectedFormat !== "string" && "text" in rawBundle
      ? (rawBundle as unknown as { text?: string }).text ?? null
      : null;
  const isAutoRefreshing =
    workspace.progress.automationStatus === "queued" ||
    workspace.progress.automationStatus === "running";
  const staleDependency = getStaleDependencyState(workspace.stage?.metadataJson);

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "auto", gap: 0 }}>
      <main className="main-column" style={{ flex: 1, minWidth: 0 }}>
        <section className="glass-panel topbar">
          <div>
            <div className="microlabel" style={{ color: "var(--muted)" }}>Stage Workspace</div>
            <h2 style={{ margin: "6px 0" }}>Base Story</h2>
            <div className="muted">
              A chapter-by-chapter story spine that ties the whole manuscript together.
            </div>
            {staleDependency ? (
              <div className="muted" style={{ marginTop: 10 }}>
                <div>Stale: {staleDependency.reason}</div>
                <div style={{ marginTop: 6 }}>
                  Recommended recovery: {getStaleDependencyRecoveryHint(workspace.stage?.stageKey)}
                </div>
              </div>
            ) : null}
            {workspace.progress.usedFallback ? (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(192, 57, 43, 0.4)",
                  background: "rgba(192, 57, 43, 0.08)",
                  color: "#a5342a",
                  fontSize: 13,
                }}
              >
                <strong>Generation failed.</strong> This version is a generic placeholder, not a
                real narrative thread for this book — the AI call failed and this filled in
                instead. Regenerate before committing.
              </div>
            ) : null}
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}?stage=OUTLINE`}>
              Back to Outline
            </Link>
            <Link className="btn" href={`/books/${slug}/dashboard`}>
              Open Dashboard
            </Link>
            <form action={runBaseStoryStage.bind(null, slug)}>
              <button className="btn" disabled={!workspace.outlineReady} type="submit">
                {bundle ? "Regenerate Base Story" : "Generate Base Story"}
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
                The structure is chosen from the Promise and Outline so the book carries one
                unifying narrative thread from chapter to chapter.
              </div>
            </div>

            <div className="stack">
              <div className="card">
                <h4>Progress</h4>
                <div className="metric-row">
                  <div className="metric">State: {workspace.progress.automationStatus.replace(/_/g, " ")}</div>
                  <div className="metric">Chapters: {workspace.progress.completedChapters}/{workspace.progress.totalChapters}</div>
                </div>
                {isAutoRefreshing ? (
                  <div className="muted" style={{ marginTop: 8 }}>
                    Base Story is running. Refresh manually to see the latest progress.
                  </div>
                ) : null}
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
              ) : legacyText ? (
                <div className="empty-state">
                  This book's Base Story was generated before format/chapter tracking existed —
                  see the raw dossier alongside. Regenerate to get structured format options.
                </div>
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
              ) : legacyText ? (
                <div className="card">
                  <h4>Base Story Dossier</h4>
                  <p style={{ margin: 0, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{legacyText}</p>
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

      <aside className="glass-panel rightbar" style={{ width: 300, flexShrink: 0 }}>
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
