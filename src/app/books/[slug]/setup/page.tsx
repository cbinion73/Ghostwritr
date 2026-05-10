import Link from "next/link";
import { BookWorkflowType } from "@prisma/client";

import { commitBookSetupAction, saveBookSetupAction, saveAndCommitSetupAction } from "./actions";
import { TargetMetricsFields } from "./target-metrics";
import { VoiceBlendSection } from "./voice-blend-section";

import { getBookStageLinks } from "@/lib/navigation";
import { getBookSetupWorkspace } from "@/lib/workflows/book-setup";

export default async function BookSetupStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getBookSetupWorkspace(slug);
  const isCommitted = workspace.stage?.status === "COMMITTED";
  const stageLinks = getBookStageLinks(workspace.book.workflowType, slug);
  const nextStageHref =
    workspace.book.workflowType === BookWorkflowType.FICTION
      ? `/books/${slug}/story-setup`
      : `/books/${slug}/promise`;

  return (
    <div className="page-shell">
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Set the voice, targets, guardrails, and production intent before the
            workflow starts shaping the book.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Book Setup: <strong>{workspace.stage?.status ?? "NOT_STARTED"}</strong>
          </div>
        </div>

        <div className="stage-list">
          {stageLinks.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href}
              className={`stage-chip ${stage.key === "BOOK_SETUP" ? "active" : ""}`}
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
            <h2>Book Setup</h2>
            <div className="muted">
              This stage defines writer persona, length targets, publishing intent,
              provenance tracking, and the anti-AI-authorship guard before the creative
              workflow begins.
            </div>
          </div>

          <div className="button-row">
            <Link className="btn" href="/">
              Back to Library
            </Link>
            <Link className="btn" href="/personas">
              Manage Personas
            </Link>
            <Link className="btn" href={nextStageHref}>
              Open Next Stage
            </Link>
            <form action={commitBookSetupAction.bind(null, slug)}>
              <button className="btn btn-primary" type="submit">
                {isCommitted ? "Recommit Setup" : "Commit Setup"}
              </button>
            </form>
          </div>
        </section>

        <section className="workspace-grid" style={{ gridTemplateColumns: "1.15fr 0.85fr" }}>
          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>Core Setup</h3>
              <div className="muted">
                These settings should inform the full {workspace.book.workflowType === BookWorkflowType.FICTION ? "fiction" : "nonfiction"} workflow, from planning through drafting and publishing.
              </div>
            </div>

            <form action={saveAndCommitSetupAction.bind(null, slug)} className="stack">
              <label className="form-field">
                <span className="field-label">Working Title</span>
                <input
                  className="editor-input"
                  defaultValue={workspace.profile.workingTitle}
                  name="workingTitle"
                  placeholder="Your Working Title"
                  type="text"
                />
              </label>
              <label className="form-field">
                <span className="field-label">Subtitle</span>
                <input
                  className="editor-input"
                  defaultValue={workspace.profile.subtitle ?? ""}
                  name="subtitle"
                  placeholder="A practical leadership system for calmer decisions"
                  type="text"
                />
              </label>
              {/* Voice Blending Section */}
              <VoiceBlendSection
                slug={slug}
                workingTitle={workspace.profile.workingTitle}
                baseStoryFormatPreference={workspace.profile.baseStoryFormatPreference}
                subtitle={workspace.profile.subtitle ?? null}
                initialBlend={workspace.profile.writerPersonaBlend}
              />
              <label className="form-field">
                <span className="field-label">Base Story Format</span>
                <select
                  className="editor-input"
                  defaultValue={workspace.profile.baseStoryFormatPreference}
                  name="baseStoryFormatPreference"
                >
                  <option value="AUTO">Auto-select best format later</option>
                  <option value="PARABLE">Parable</option>
                  <option value="HERO_JOURNEY">Hero Journey</option>
                  <option value="GUIDE_JOURNEY">Guide Journey</option>
                  <option value="COMPOSITE_CHARACTER">Composite Character</option>
                  <option value="CASE_JOURNEY">Case Journey</option>
                  <option value="MOSAIC_VIGNETTES">Mosaic Vignettes</option>
                  <option value="QUEST">Quest</option>
                  <option value="RISE_FALL_REDEMPTION">Rise, Fall, Redemption</option>
                  <option value="LETTER_FRAME">Letter Frame</option>
                  <option value="FIELD_MANUAL_NARRATIVE">Field Manual Narrative</option>
                </select>
              </label>
              <TargetMetricsFields
                targetWordCount={workspace.profile.targetWordCount}
                wordCountTolerance={workspace.profile.wordCountTolerance}
                targetPageCount={workspace.profile.targetPageCount ?? null}
                trimSize={workspace.profile.trimSize}
              />
              <label className="form-field">
                <span className="field-label">Trim Size</span>
                <input
                  className="editor-input"
                  defaultValue={workspace.profile.trimSize}
                  name="trimSize"
                  placeholder="6 x 9 in"
                  type="text"
                />
              </label>

              <div className="card">
                <h4>Output Formats</h4>
                <label className="checkbox-row">
                  <input
                    defaultChecked={workspace.profile.outputFormats.includes("PRINT")}
                    name="outputFormats"
                    type="checkbox"
                    value="PRINT"
                  />
                  <span>Print</span>
                </label>
                <label className="checkbox-row">
                  <input
                    defaultChecked={workspace.profile.outputFormats.includes("EBOOK")}
                    name="outputFormats"
                    type="checkbox"
                    value="EBOOK"
                  />
                  <span>Ebook</span>
                </label>
                <label className="checkbox-row">
                  <input
                    defaultChecked={workspace.profile.outputFormats.includes("AUDIO")}
                    name="outputFormats"
                    type="checkbox"
                    value="AUDIO"
                  />
                  <span>Audio / spoken adaptation</span>
                </label>
              </div>

              <label className="form-field">
                <span className="field-label">Voice Reference Notes</span>
                <textarea
                  className="editor-textarea"
                  defaultValue={workspace.profile.voiceReferenceNotes.join("\n")}
                  name="voiceReferenceNotes"
                  placeholder="Voice reference notes or manuscript cues, one per line"
                />
              </label>
              <label className="form-field">
                <span className="field-label">System Notes And Human Direction</span>
                <textarea
                  className="editor-textarea"
                  defaultValue={workspace.profile.notesToSystem.join("\n")}
                  name="notesToSystem"
                  placeholder="Additional system notes and human direction, one per line"
                />
              </label>

              <div className="card">
                <h4>Guardrails</h4>
                <label className="checkbox-row">
                  <input
                    defaultChecked={workspace.profile.aiAuthorshipGuardEnabled}
                    name="aiAuthorshipGuardEnabled"
                    type="checkbox"
                  />
                  <span>Run AI-authorship risk detection and revision loops</span>
                </label>
                <label className="checkbox-row">
                  <input
                    defaultChecked={workspace.profile.provenanceTrackingEnabled}
                    name="provenanceTrackingEnabled"
                    type="checkbox"
                  />
                  <span>Capture human-direction and provenance ledger events</span>
                </label>
                <label className="checkbox-row">
                  <input
                    defaultChecked={workspace.profile.marketingHandoffEnabled}
                    name="marketingHandoffEnabled"
                    type="checkbox"
                  />
                  <span>Prepare structured marketing handoff exports</span>
                </label>
              </div>

              <button className="btn btn-primary" type="submit">
                Save Setup
              </button>
            </form>
          </section>

          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>What This Enables</h3>
              <div className="muted">
                These are the next-phase capabilities now anchored to a real stage.
              </div>
            </div>

            <div className="stack">
              <div className="card">
                <h4>Writer Personas</h4>
                <p className="muted" style={{ margin: 0 }}>
                  Promise and Drafting can inherit a specific writer persona and later map
                  example manuscripts into that voice.
                </p>
                {workspace.selectedWriterPersona ? (
                  <div className="stack" style={{ paddingTop: 12 }}>
                    <div className="pill">
                      Selected: {workspace.selectedWriterPersona.name}
                    </div>
                    <p className="muted" style={{ margin: 0 }}>
                      {workspace.selectedWriterPersona.description}
                    </p>
                    <div className="pill-row">
                      {workspace.selectedWriterPersona.voiceTraits.map((trait) => (
                        <span className="pill" key={`${workspace.selectedWriterPersona?.id}-${trait}`}>
                          {trait}
                        </span>
                      ))}
                    </div>
                    <div className="muted" style={{ margin: 0 }}>
                      Inspiration samples: {workspace.selectedWriterPersona.samples.length}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="card">
                <h4>Base Story Format</h4>
                <p className="muted" style={{ margin: 0 }}>
                  Choose the narrative spine early so Base Story follows your intended
                  book shape instead of surprising you later.
                </p>
              </div>
              <div className="card">
                <h4>Human Direction Ledger</h4>
                <p className="muted" style={{ margin: 0 }}>
                  We now have schema support for provenance and user-direction events so
                  authorship decisions can be defended later.
                </p>
              </div>
              <div className="card">
                <h4>AI Voice Guard</h4>
                <p className="muted" style={{ margin: 0 }}>
                  Drafting and final editorial review can now inherit a formal anti-AI
                  authorship-risk requirement from setup.
                </p>
              </div>
              <div className="card">
                <h4>Marketing Handoff</h4>
                <p className="muted" style={{ margin: 0 }}>
                  The platform is now being shaped to export reusable structured payloads
                  for a future marketing and promotion system.
                </p>
              </div>
              <div className="card">
                <h4>Saved Versions</h4>
                <div className="muted">
                  {workspace.versions.length > 0
                    ? workspace.versions.map((version) => `v${version.versionNumber} ${version.lifecycleState}`).join(" • ")
                    : "No saved setup versions yet."}
                </div>
              </div>
            </div>
          </section>
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <h3>Setup Direction Ledger</h3>
            <div className="muted">
              These events become part of the provenance record for how the human shaped
              the project before drafting began.
            </div>
          </div>

          <div className="version-list">
            {workspace.directionEvents.length > 0 ? (
              workspace.directionEvents.map((event) => (
                <div className="version-item" key={event.id}>
                  <div style={{ fontWeight: 600 }}>{event.title}</div>
                  {event.content ? (
                    <div className="muted" style={{ marginTop: 6, lineHeight: 1.55 }}>
                      {event.content}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="empty-state">No setup-direction events have been recorded yet.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
