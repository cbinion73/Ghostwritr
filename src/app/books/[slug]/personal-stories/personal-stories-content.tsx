/**
 * The Interview room — Personal Stories stage content, shared between the
 * Book Studio (rendered as the PERSONAL_STORIES stage slot) and the retired
 * standalone view. Server component: fetches the personal-stories
 * workspace itself.
 *
 * A chapter-aware interview + growing story encyclopedia — distinct from
 * the generic AgentChatPanel used by most other stages.
 */

import {
  commitPersonalStoriesStage,
  markNoStoryForCurrentQuestion,
  seedPersonalStoriesStage,
  sendPersonalStoriesMessage,
} from "./actions";

import { getPersonalStoriesWorkspace } from "@/lib/workflows/personal-stories";

function statusLabel(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function readinessLabel(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

export async function PersonalStoriesContent({ slug }: { slug: string }) {
  const workspace = await getPersonalStoriesWorkspace(slug);
  const isCommitted = workspace.stage?.status === "COMMITTED";
  const canStartInterview = workspace.outlineReady;
  const canCommit = workspace.outlineReady && workspace.encyclopedia.entries.length > 0;

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "auto", gap: 0 }}>
      <main className="main-column" style={{ flex: 1, minWidth: 0 }}>
        <section className="glass-panel topbar">
          <div>
            <div className="microlabel" style={{ color: "var(--muted)" }}>Stage Workspace</div>
            <h2 style={{ margin: "6px 0" }}>Personal Stories</h2>
            <div className="muted">
              The AI interviews you chapter by chapter and grows a reusable encyclopedia
              of experiences mapped back to the outline. If you do not have a story for
              an area, we mark it and move on.
            </div>
            {!workspace.outlineReady ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Commit the paragraph-level Outline first so Personal Stories can target
                real chapters instead of collecting generic anecdotes.
              </div>
            ) : null}
          </div>

          <div className="button-row">
            <form action={seedPersonalStoriesStage.bind(null, slug)}>
              <button className="btn" type="submit" disabled={!canStartInterview}>
                Start Chapter-Aware Interview
              </button>
            </form>
            <form action={commitPersonalStoriesStage.bind(null, slug)}>
              <button className="btn btn-primary" type="submit" disabled={!canCommit}>
                {isCommitted ? "Recommit Encyclopedia" : "Commit Encyclopedia"}
              </button>
            </form>
          </div>
        </section>

        <section className="workspace-grid">
          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>Interview</h3>
              <div className="muted">
                One good question at a time. Raw memories are welcome. Short concrete
                moments are often more useful than polished stories.
              </div>
            </div>

            <div className="conversation-thread">
              {workspace.transcript.length === 0 ? (
                <div className="empty-state">
                  Click <strong>Start Interview</strong> and the AI will begin building
                  your chapter-aware personal story encyclopedia.
                </div>
              ) : (
                workspace.transcript.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                    {message.content}
                  </div>
                ))
              )}
            </div>

            <form className="composer" action={sendPersonalStoriesMessage.bind(null, slug)}>
              <textarea
                name="message"
                placeholder="Answer the current question with a concrete memory, moment, or observation."
              />
              <div className="composer-actions" style={{ alignItems: "flex-end", gap: 16 }}>
                <div className="muted">
                  Current focus: <strong>{workspace.encyclopedia.interviewFocus}</strong>
                </div>
                <button className="btn btn-primary" type="submit">
                  Send Answer
                </button>
              </div>
            </form>
          </section>

          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>Story Encyclopedia</h3>
              <div className="muted">
                The system captures possible stories even when they are incomplete, then
                strengthens them over time.
              </div>
            </div>

            <div className="stack">
              <div className="card">
                <h4>Interview State</h4>
                <div className="pill-row">
                  <div className="pill">Status: {statusLabel(workspace.progress.interviewStatus)}</div>
                  <div className="pill">Stories: {workspace.progress.storyCount}</div>
                  <div className="pill">Ready: {workspace.encyclopedia.readinessSummary.readyStories}</div>
                  <div className="pill">Needs detail: {workspace.encyclopedia.readinessSummary.needsDetailStories}</div>
                  <div className="pill">Permission blocked: {workspace.encyclopedia.readinessSummary.permissionBlockedStories}</div>
                  <div className="pill">No-story areas: {workspace.progress.noStoryTopicCount}</div>
                </div>
                <p style={{ margin: "14px 0 0", lineHeight: 1.75 }}>
                  <strong>Next Question:</strong> {workspace.progress.nextQuestion}
                </p>
              </div>

              <div className="card">
                <h4>Chapter Coverage</h4>
                <div className="pill-row">
                  {workspace.chapterCoverage.length > 0 ? (
                    workspace.chapterCoverage.map((chapter) => (
                      <div className="pill" key={chapter.chapterKey}>
                        {chapter.chapterLabel} · {chapter.matchedStoryCount}
                      </div>
                    ))
                  ) : (
                    <div className="muted">Commit the paragraph-level Outline to see chapter targets.</div>
                  )}
                </div>
              </div>

              <div className="card">
                <h4>No Story For This</h4>
                <p className="muted" style={{ marginTop: 0, lineHeight: 1.7 }}>
                  If nothing comes to mind for the current area, mark it cleanly and move
                  to another angle.
                </p>
                <form action={markNoStoryForCurrentQuestion.bind(null, slug)}>
                  <input
                    type="hidden"
                    name="question"
                    value={workspace.progress.nextQuestion}
                  />
                  <button className="btn" type="submit">
                    I Don&apos;t Have A Story For This
                  </button>
                </form>
              </div>
            </div>
          </section>
        </section>

        <section className="glass-panel section-panel paper-wrap">
          <article className="paper">
            <div className="toc-kicker">Encyclopedia</div>
            <h3>Personal Story Encyclopedia</h3>

            {workspace.encyclopedia.entries.length === 0 ? (
              <div className="empty-state">
                No story entries yet. Start the interview and the encyclopedia will fill
                in as the conversation unfolds.
              </div>
            ) : (
              <div className="story-encyclopedia-grid">
                {workspace.encyclopedia.entries.map((entry) => (
                  <section className="story-entry-card" key={entry.id}>
                    <div className="story-entry-header">
                      <div>
                        <div className="label">{entry.storyType.replace(/_/g, " ")}</div>
                        <h4>{entry.title}</h4>
                      </div>
                      <div className={`pill personal-story-status status-${entry.status}`}>
                        {entry.status.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className="pill-row" style={{ marginTop: 10 }}>
                      <div className="pill">Readiness: {readinessLabel(entry.readiness)}</div>
                      <div className="pill">Permission: {entry.permission.status.replace(/_/g, " ")}</div>
                      <div className="pill">Assignments: {entry.assignments.length}</div>
                      <div className="pill">Usage: {entry.usageHistory.length}</div>
                    </div>

                    <p>{entry.summary}</p>
                    <p className="muted">
                      <strong>Lesson:</strong> {entry.lesson}
                    </p>
                    <p className="muted">
                      <strong>Why it matters:</strong> {entry.whyItMatters}
                    </p>

                    <div className="pill-row">
                      <div className="pill">Life area: {entry.lifeArea}</div>
                      {entry.assignments.map((assignment) => (
                        <div className="pill" key={`${entry.id}-${assignment.chapterKey}`}>
                          {assignment.chapterTitle ?? assignment.chapterKey}
                        </div>
                      ))}
                    </div>

                    {entry.missingDetails.length > 0 ? (
                      <div className="card" style={{ marginTop: 12, borderColor: "rgba(184,121,58,0.3)", background: "rgba(184,121,58,0.08)" }}>
                        <strong>Missing details before drafting</strong>
                        <ul className="clean-list" style={{ marginTop: 8 }}>
                          {entry.missingDetails.map((detail) => (
                            <li key={detail}>{detail}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {entry.permission.status !== "granted" ? (
                      <div className="card" style={{ marginTop: 12, borderColor: "rgba(184,121,58,0.3)", background: "rgba(184,121,58,0.08)" }}>
                        <strong>Permission needed</strong>
                        <div className="muted" style={{ marginTop: 8 }}>
                          {entry.permission.notes ??
                            "Confirm this story may be used before Quill can draft with it."}
                        </div>
                      </div>
                    ) : null}

                    {entry.emotionalNotes.length > 0 ? (
                      <div className="story-entry-emotions">
                        {entry.emotionalNotes.map((emotion) => (
                          <span key={emotion}>{emotion}</span>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
            )}
          </article>
        </section>
      </main>

      <aside className="glass-panel rightbar" style={{ width: 300, flexShrink: 0 }}>
        <div className="card">
          <div className="label">Interviewer Notes</div>
          <h3 style={{ marginTop: 6 }}>How To Answer</h3>
          <div className="recommendation">
            Give the AI the raw memory first: what happened, who was there, what was at
            stake, and what changed in you.
          </div>
          <div className="recommendation">
            It is fine if a memory is short, messy, or incomplete. The system is building
            an encyclopedia, not a polished manuscript yet.
          </div>
          <div className="recommendation">
            If a topic has no real story behind it, say so. That is better than inventing
            one.
          </div>
        </div>

        <div className="card">
          <h3>Latest Encyclopedia Versions</h3>
          <div className="stack" style={{ padding: 0 }}>
            {workspace.versions.encyclopedia.length > 0 ? (
              workspace.versions.encyclopedia.map((version) => (
                <div className="card" key={version.id}>
                  <div className="pill-row">
                    <div className="pill">v{version.versionNumber}</div>
                    <div className="pill">{version.lifecycleState.toLowerCase()}</div>
                  </div>
                  <div className="muted" style={{ marginTop: 10 }}>
                    {version.summary ?? "No summary"}
                  </div>
                </div>
              ))
            ) : (
              <div className="muted">No encyclopedia versions yet.</div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
