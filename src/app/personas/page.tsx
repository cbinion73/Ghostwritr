import Link from "next/link";

import {
  createWriterPersonaAction,
  deleteWriterPersonaAction,
  deleteWriterPersonaSampleAction,
  toggleWriterPersonaSampleAction,
  updateWriterPersonaAction,
} from "./actions";

import { listWriterPersonas } from "@/lib/repositories/writer-personas";

export const dynamic = "force-dynamic";

export default async function WriterPersonasPage() {
  const personas = await listWriterPersonas();

  return (
    <div className="page-shell">
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Build a reusable library of writer personas with voice rules and inspiration
            samples that shape the writing without copying source material.
          </p>
        </div>

        <div className="stage-list">
          <Link className="stage-chip active" href="/personas">
            Writer Personas
          </Link>
          <Link className="stage-chip" href="/">
            Library
          </Link>
        </div>
      </aside>

      <main className="main-column">
        <section className="glass-panel topbar">
          <div>
            <div className="label">Program Workspace</div>
            <h2>Writer Personas</h2>
            <div className="muted">
              Upload exemplar writing for inspiration only. The system should absorb
              voice traits, never plagiarize wording or structure.
            </div>
          </div>

          <div className="button-row">
            <Link className="btn" href="/">
              Back to Library
            </Link>
          </div>
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <h3>Create Persona</h3>
            <div className="muted">
              Start a new reusable author style with voice rules and anti-patterns.
            </div>
          </div>

          <form action={createWriterPersonaAction} className="stack">
            <label className="form-field">
              <span className="field-label">Persona Name</span>
              <input className="editor-input" name="name" placeholder="Operational Storyteller" type="text" />
            </label>
            <label className="form-field">
              <span className="field-label">Description</span>
              <textarea
                className="editor-textarea"
                name="description"
                placeholder="Describe the overall voice, reader effect, and use case."
              />
            </label>
            <label className="form-field">
              <span className="field-label">Voice Traits</span>
              <textarea
                className="editor-textarea"
                name="voiceTraits"
                placeholder="One trait per line"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Signature Patterns</span>
              <textarea
                className="editor-textarea"
                name="signaturePatterns"
                placeholder="One signature move per line"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Avoid Patterns</span>
              <textarea
                className="editor-textarea"
                name="avoidPatterns"
                placeholder="One anti-pattern per line"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Sample Excerpt</span>
              <textarea
                className="editor-textarea"
                name="sampleExcerpt"
                placeholder="A short excerpt or manual style reference"
              />
            </label>
            <button className="btn btn-primary" type="submit">
              Create Persona
            </button>
          </form>
        </section>

        <section className="workspace-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
          {personas.map((persona) => (
            <section className="glass-panel section-panel" key={persona.id}>
              <div className="section-header">
                <div>
                  <h3>{persona.name}</h3>
                  <div className="muted">{persona.isBuiltIn ? "Built-in" : "Custom"} persona</div>
                </div>
                <div className="pill-row">
                  <span className="pill">{persona.isActive ? "Active" : "Inactive"}</span>
                  <span className="pill">{persona.samples.length} samples</span>
                </div>
              </div>

              <form action={updateWriterPersonaAction} className="stack">
                <input name="id" type="hidden" value={persona.id} />
                <label className="form-field">
                  <span className="field-label">Persona Name</span>
                  <input className="editor-input" defaultValue={persona.name} name="name" type="text" />
                </label>
                <label className="form-field">
                  <span className="field-label">Description</span>
                  <textarea className="editor-textarea" defaultValue={persona.description} name="description" />
                </label>
                <label className="form-field">
                  <span className="field-label">Voice Traits</span>
                  <textarea
                    className="editor-textarea"
                    defaultValue={persona.voiceTraits.join("\n")}
                    name="voiceTraits"
                  />
                </label>
                <label className="form-field">
                  <span className="field-label">Signature Patterns</span>
                  <textarea
                    className="editor-textarea"
                    defaultValue={persona.signaturePatterns.join("\n")}
                    name="signaturePatterns"
                  />
                </label>
                <label className="form-field">
                  <span className="field-label">Avoid Patterns</span>
                  <textarea
                    className="editor-textarea"
                    defaultValue={persona.avoidPatterns.join("\n")}
                    name="avoidPatterns"
                  />
                </label>
                <label className="form-field">
                  <span className="field-label">Sample Excerpt</span>
                  <textarea
                    className="editor-textarea"
                    defaultValue={persona.sampleExcerpt ?? ""}
                    name="sampleExcerpt"
                  />
                </label>
                <label className="checkbox-row">
                  <input defaultChecked={persona.isActive} name="isActive" type="checkbox" />
                  <span>Available for selection</span>
                </label>
                <div className="button-row">
                  <button className="btn btn-primary" type="submit">
                    Save Persona
                  </button>
                </div>
              </form>
              {!persona.isBuiltIn ? (
                <form action={deleteWriterPersonaAction} className="button-row" style={{ marginTop: 12 }}>
                  <input name="id" type="hidden" value={persona.id} />
                  <button className="btn" type="submit">
                    Delete Persona
                  </button>
                </form>
              ) : null}

              <div className="card">
                <h4>Inspiration Samples</h4>
                <p className="muted" style={{ margin: 0 }}>
                  Upload examples to teach cadence, texture, and voice. These are for
                  inspiration only and must never be copied.
                </p>
                <form
                  action={`/api/personas/${persona.id}/samples`}
                  className="stack"
                  encType="multipart/form-data"
                  method="post"
                  style={{ marginTop: 12 }}
                >
                  <label className="form-field">
                    <span className="field-label">Writing Samples</span>
                    <input className="editor-input" multiple name="files" type="file" />
                  </label>
                  <label className="form-field">
                    <span className="field-label">Upload Note</span>
                    <input className="editor-input" name="note" placeholder="Why these samples matter" type="text" />
                  </label>
                  <button className="btn" type="submit">
                    Upload Samples
                  </button>
                </form>

                <div className="stack" style={{ paddingTop: 16 }}>
                  {persona.samples.length > 0 ? (
                    persona.samples.map((sample) => (
                      <div className="card" key={sample.id}>
                        <div className="pill-row" style={{ justifyContent: "space-between" }}>
                          <strong>{sample.title}</strong>
                          <span className="pill">
                            {sample.useForInspiration ? "Inspiration on" : "Inspiration off"}
                          </span>
                        </div>
                        <div className="muted" style={{ marginTop: 8 }}>
                          {sample.note || sample.originalFileName || sample.mimeType}
                        </div>
                        <div className="button-row" style={{ marginTop: 12 }}>
                          <form action={toggleWriterPersonaSampleAction}>
                            <input name="sampleId" type="hidden" value={sample.id} />
                            <input
                              name="useForInspiration"
                              type="hidden"
                              value={sample.useForInspiration ? "false" : "true"}
                            />
                            <button className="btn" type="submit">
                              {sample.useForInspiration ? "Turn Off" : "Turn On"}
                            </button>
                          </form>
                          <form action={deleteWriterPersonaSampleAction}>
                            <input name="sampleId" type="hidden" value={sample.id} />
                            <button className="btn" type="submit">
                              Remove
                            </button>
                          </form>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="muted">No inspiration samples uploaded yet.</div>
                  )}
                </div>
              </div>
            </section>
          ))}
        </section>
      </main>
    </div>
  );
}
