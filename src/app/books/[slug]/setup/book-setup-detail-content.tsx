/**
 * The Settings room — Book Setup's real configuration form, shared between
 * the Book Studio (rendered as the BOOK_SETUP stage slot) and the retired
 * standalone view. Server component: fetches the book-setup workspace
 * itself.
 *
 * This is where book size/page/word-count targets, voice blend, chapter
 * format, reader level, output formats, and guardrails actually live —
 * distinct from Blueprint's conversational AgentChatPanel, which stays
 * mounted alongside it as a companion (same relationship as Promise's
 * tabs + Refine chat).
 */

import { BookWorkflowType } from "@prisma/client";

import { commitBookSetupAction, saveAndCommitSetupAction } from "./actions";
import { TargetMetricsFields } from "./target-metrics";
import { VoiceBlendSection } from "./voice-blend-section";

import { getBookSetupWorkspace } from "@/lib/workflows/book-setup";

export async function BookSetupDetailContent({ slug }: { slug: string }) {
  const workspace = await getBookSetupWorkspace(slug);
  const isCommitted = workspace.stage?.status === "COMMITTED";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto" }}>
      <section className="glass-panel topbar">
        <div>
          <div className="microlabel" style={{ color: "var(--muted)" }}>Stage Workspace</div>
          <h2 style={{ margin: "6px 0" }}>Book Setup</h2>
          <div className="muted">
            This stage defines writer persona, length targets, publishing intent,
            provenance tracking, and the anti-AI-authorship guard before the creative
            workflow begins.
          </div>
        </div>

        <div className="button-row">
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
              <span className="field-label">Author Voice Tone</span>
              <input
                className="editor-input"
                defaultValue={workspace.profile.voiceTone ?? ""}
                name="voiceTone"
                placeholder="e.g. warm and conversational, direct and plainspoken, witty with depth"
                type="text"
              />
              <span className="field-hint">How would your ideal reader describe your writing voice in a few words?</span>
            </label>

            <div className="card">
              <h4>Chapter Format</h4>
              <p className="muted" style={{ margin: "0 0 10px" }}>What structured tools will appear inside chapters?</p>
              {[
                { value: "reflection-questions", label: "Reflection Questions" },
                { value: "exercises", label: "Exercises" },
                { value: "sidebars", label: "Sidebars" },
                { value: "checklists", label: "Checklists" },
                { value: "case-studies", label: "Case Studies" },
                { value: "callout-boxes", label: "Callout Boxes" },
              ].map(({ value, label }) => (
                <label className="checkbox-row" key={value}>
                  <input
                    defaultChecked={workspace.profile.chapterFormat?.includes(value) ?? false}
                    name="chapterFormat"
                    type="checkbox"
                    value={value}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="card">
              <h4>Reader Level</h4>
              <p className="muted" style={{ margin: "0 0 10px" }}>Who are you writing for?</p>
              {[
                { value: "casual", label: "Casual Reader", hint: "General audience, minimal assumed knowledge" },
                { value: "practitioner", label: "Practitioner", hint: "Someone working in the field but not expert" },
                { value: "professional", label: "Professional", hint: "Experienced, expects depth and precision" },
                { value: "expert", label: "Expert", hint: "High assumed knowledge, peer-level writing" },
              ].map(({ value, label, hint }) => (
                <label className="checkbox-row" key={value} style={{ alignItems: "flex-start", gap: 8 }}>
                  <input
                    defaultChecked={(workspace.profile.readerLevel ?? "casual") === value}
                    name="readerLevel"
                    style={{ marginTop: 3 }}
                    type="radio"
                    value={value}
                  />
                  <span>
                    <strong>{label}</strong>
                    <span className="muted" style={{ display: "block", fontSize: "12px" }}>{hint}</span>
                  </span>
                </label>
              ))}
            </div>

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
              trimSize={workspace.profile.trimSize ?? "6 x 9 in"}
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
                  defaultChecked={workspace.profile.outputFormats?.includes("PRINT") ?? false}
                  name="outputFormats"
                  type="checkbox"
                  value="PRINT"
                />
                <span>Print</span>
              </label>
              <label className="checkbox-row">
                <input
                  defaultChecked={workspace.profile.outputFormats?.includes("EBOOK") ?? false}
                  name="outputFormats"
                  type="checkbox"
                  value="EBOOK"
                />
                <span>Ebook</span>
              </label>
              <label className="checkbox-row">
                <input
                  defaultChecked={workspace.profile.outputFormats?.includes("AUDIO") ?? false}
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
                defaultValue={(workspace.profile.voiceReferenceNotes ?? []).join("\n")}
                name="voiceReferenceNotes"
                placeholder="Voice reference notes or manuscript cues, one per line"
              />
            </label>
            <label className="form-field">
              <span className="field-label">System Notes And Human Direction</span>
              <textarea
                className="editor-textarea"
                defaultValue={(workspace.profile.notesToSystem ?? []).join("\n")}
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
    </div>
  );
}
