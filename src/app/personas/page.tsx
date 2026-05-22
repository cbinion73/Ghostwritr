import {
  createWriterPersonaAction,
  deleteWriterPersonaAction,
  deleteWriterPersonaSampleAction,
  toggleWriterPersonaSampleAction,
  updateWriterPersonaAction,
} from "./actions";

import { listWriterPersonas } from "@/lib/repositories/writer-personas";
import { AppTopBar } from "@/app/components/app-top-bar";

export const dynamic = "force-dynamic";

const F = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';

export default async function WriterPersonasPage() {
  const personas = await listWriterPersonas();

  return (
    <div style={pageStyle}>
      <AppTopBar activePage="personas" />

      <div style={bodyStyle}>
        {/* Left: create form */}
        <aside style={sidebarStyle}>
          <div style={sidebarHeadStyle}>
            <div style={labelStyle}>NEW PERSONA</div>
            <div style={sidebarTitleStyle}>Add a voice</div>
            <div style={sidebarSubStyle}>
              Define a reusable writing style Blueprint can recommend when setting up a book.
            </div>
          </div>

          <form action={createWriterPersonaAction} style={formStyle}>
            <Field label="Persona Name">
              <input style={inputStyle} name="name" placeholder="e.g. Conversational Strategist" type="text" />
            </Field>
            <Field label="Description">
              <textarea style={textareaStyle} name="description" placeholder="Overall voice, reader effect, use case" rows={3} />
            </Field>
            <Field label="Voice Traits">
              <textarea style={textareaStyle} name="voiceTraits" placeholder="One trait per line&#10;e.g. warm&#10;direct&#10;plainspoken" rows={4} />
            </Field>
            <Field label="Signature Patterns">
              <textarea style={textareaStyle} name="signaturePatterns" placeholder="One move per line&#10;e.g. Opens with a question" rows={3} />
            </Field>
            <Field label="Avoid Patterns">
              <textarea style={textareaStyle} name="avoidPatterns" placeholder="One anti-pattern per line" rows={3} />
            </Field>
            <Field label="Sample Excerpt">
              <textarea style={textareaStyle} name="sampleExcerpt" placeholder="Short excerpt or style reference" rows={3} />
            </Field>
            <button style={createBtnStyle} type="submit">
              Create Persona →
            </button>
          </form>
        </aside>

        {/* Right: persona library */}
        <main style={libraryStyle}>
          <div style={libraryHeadStyle}>
            <div style={labelStyle}>VOICE LIBRARY</div>
            <div style={libraryTitleStyle}>
              {personas.length} persona{personas.length !== 1 ? "s" : ""}
              <span style={librarySubStyle}> · Blueprint uses these to suggest voice blends during Book Setup</span>
            </div>
          </div>

          {personas.length === 0 ? (
            <div style={emptyStyle}>No personas yet — create your first one.</div>
          ) : (
            <div style={gridStyle}>
              {personas.map((persona) => (
                <article key={persona.id} style={cardStyle}>
                  {/* Header */}
                  <div style={cardHeadStyle}>
                    <div>
                      <div style={cardTitleStyle}>{persona.name}</div>
                      <div style={cardMetaStyle}>
                        {persona.isBuiltIn ? "Built-in" : "Custom"} ·{" "}
                        <span style={{ color: persona.isActive ? "#4a7c59" : "#6a5a4a" }}>
                          {persona.isActive ? "Active" : "Inactive"}
                        </span>
                        {" · "}{persona.samples.length} sample{persona.samples.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    {persona.voiceTraits.length > 0 && (
                      <div style={traitRowStyle}>
                        {persona.voiceTraits.slice(0, 3).map((t) => (
                          <span key={t} style={traitChipStyle}>{t}</span>
                        ))}
                        {persona.voiceTraits.length > 3 && (
                          <span style={traitChipStyle}>+{persona.voiceTraits.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {persona.description && (
                    <div style={cardDescStyle}>{persona.description}</div>
                  )}

                  {/* Edit form */}
                  <details style={detailsStyle}>
                    <summary style={summaryStyle}>Edit persona ▸</summary>
                    <form action={updateWriterPersonaAction} style={{ ...formStyle, marginTop: 12 }}>
                      <input name="id" type="hidden" value={persona.id} />
                      <Field label="Name">
                        <input style={inputStyle} defaultValue={persona.name} name="name" type="text" />
                      </Field>
                      <Field label="Description">
                        <textarea style={textareaStyle} defaultValue={persona.description} name="description" rows={3} />
                      </Field>
                      <Field label="Voice Traits">
                        <textarea style={textareaStyle} defaultValue={persona.voiceTraits.join("\n")} name="voiceTraits" rows={4} />
                      </Field>
                      <Field label="Signature Patterns">
                        <textarea style={textareaStyle} defaultValue={persona.signaturePatterns.join("\n")} name="signaturePatterns" rows={3} />
                      </Field>
                      <Field label="Avoid Patterns">
                        <textarea style={textareaStyle} defaultValue={persona.avoidPatterns.join("\n")} name="avoidPatterns" rows={3} />
                      </Field>
                      <Field label="Sample Excerpt">
                        <textarea style={textareaStyle} defaultValue={persona.sampleExcerpt ?? ""} name="sampleExcerpt" rows={3} />
                      </Field>
                      <label style={checkboxRowStyle}>
                        <input defaultChecked={persona.isActive} name="isActive" type="checkbox" />
                        <span style={{ fontSize: "12px", color: "#8a7060", fontFamily: F }}>Available for Blueprint to suggest</span>
                      </label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button style={saveBtnStyle} type="submit">Save →</button>
                        {!persona.isBuiltIn && (
                          <form action={deleteWriterPersonaAction}>
                            <input name="id" type="hidden" value={persona.id} />
                            <button style={deleteBtnStyle} type="submit">Delete</button>
                          </form>
                        )}
                      </div>
                    </form>
                  </details>

                  {/* Inspiration samples */}
                  <div style={samplesStyle}>
                    <div style={samplesTitleStyle}>Inspiration Samples</div>
                    <div style={samplesSubStyle}>
                      Upload writing samples to teach cadence and voice. Never copied — inspiration only.
                    </div>
                    <form
                      action={`/api/personas/${persona.id}/samples`}
                      encType="multipart/form-data"
                      method="post"
                      style={{ display: "flex", gap: "8px", marginTop: "10px", alignItems: "center" }}
                    >
                      <input style={{ ...inputStyle, flex: 1, fontSize: "11px" }} multiple name="files" type="file" />
                      <input style={{ ...inputStyle, flex: 2, fontSize: "11px" }} name="note" placeholder="Why these matter" type="text" />
                      <button style={{ ...saveBtnStyle, whiteSpace: "nowrap" as const }} type="submit">Upload</button>
                    </form>

                    {persona.samples.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px", marginTop: "10px" }}>
                        {persona.samples.map((sample) => (
                          <div key={sample.id} style={sampleRowStyle}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "12px", color: "#e8d5b0", fontFamily: F, fontWeight: 600 }}>
                                {sample.title}
                              </div>
                              <div style={{ fontSize: "11px", color: "#6a5a4a", fontFamily: F }}>
                                {sample.note || sample.originalFileName || sample.mimeType}
                              </div>
                            </div>
                            <form action={toggleWriterPersonaSampleAction}>
                              <input name="sampleId" type="hidden" value={sample.id} />
                              <input name="useForInspiration" type="hidden" value={sample.useForInspiration ? "false" : "true"} />
                              <button style={toggleBtnStyle(sample.useForInspiration)} type="submit">
                                {sample.useForInspiration ? "On" : "Off"}
                              </button>
                            </form>
                            <form action={deleteWriterPersonaSampleAction}>
                              <input name="sampleId" type="hidden" value={sample.id} />
                              <button style={deleteBtnStyle} type="submit">✕</button>
                            </form>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: "4px" }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#1a1410",
  fontFamily: F,
  display: "flex",
  flexDirection: "column",
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  overflow: "hidden",
  minHeight: 0,
};

const sidebarStyle: React.CSSProperties = {
  width: "280px",
  flexShrink: 0,
  borderRight: "1px solid rgba(255,255,255,0.06)",
  padding: "32px 28px",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  overflowY: "auto",
};

const sidebarHeadStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const labelStyle: React.CSSProperties = {
  fontSize: "10px",
  letterSpacing: "0.1em",
  color: "#5a4a3a",
  fontWeight: 600,
  fontFamily: F,
};

const sidebarTitleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#e8d5b0",
  fontFamily: F,
};

const sidebarSubStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6a5a4a",
  lineHeight: 1.6,
  fontFamily: F,
};

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "#e8d5b0",
  fontSize: "13px",
  fontFamily: F,
  outline: "none",
  width: "100%",
  boxSizing: "border-box" as const,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical" as const,
  lineHeight: 1.5,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: "10px",
  letterSpacing: "0.08em",
  color: "#5a4a3a",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  fontFamily: F,
};

const createBtnStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: "6px",
  border: "none",
  background: "#B8793A",
  color: "#fff",
  fontSize: "13px",
  fontWeight: 600,
  fontFamily: F,
  cursor: "pointer",
  marginTop: "4px",
};

const saveBtnStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "5px",
  border: "none",
  background: "#B8793A",
  color: "#fff",
  fontSize: "12px",
  fontFamily: F,
  cursor: "pointer",
};

const deleteBtnStyle: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: "5px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "transparent",
  color: "#4a3a2a",
  fontSize: "12px",
  fontFamily: F,
  cursor: "pointer",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  cursor: "pointer",
};

// Library

const libraryStyle: React.CSSProperties = {
  flex: 1,
  padding: "32px 40px",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
};

const libraryHeadStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const libraryTitleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#e8d5b0",
  fontFamily: F,
};

const librarySubStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 400,
  color: "#5a4a3a",
};

const emptyStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#5a4a3a",
  fontFamily: F,
  padding: "40px 0",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
  gap: "16px",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(254,251,245,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: "10px",
  padding: "20px 22px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const cardHeadStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#e8d5b0",
  fontFamily: F,
};

const cardMetaStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#5a4a3a",
  fontFamily: F,
  marginTop: "3px",
};

const cardDescStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6a5a4a",
  fontFamily: F,
  lineHeight: 1.5,
  borderTop: "1px solid rgba(255,255,255,0.05)",
  paddingTop: "10px",
};

const traitRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
};

const traitChipStyle: React.CSSProperties = {
  fontSize: "10px",
  padding: "2px 7px",
  borderRadius: "10px",
  border: "1px solid rgba(184,121,58,0.3)",
  color: "#8a7060",
  background: "rgba(184,121,58,0.06)",
  fontFamily: F,
};

const detailsStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.05)",
  paddingTop: "10px",
};

const summaryStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#5a4a3a",
  fontFamily: F,
  cursor: "pointer",
  userSelect: "none" as const,
};

const samplesStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.05)",
  paddingTop: "12px",
};

const samplesTitleStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#8a7060",
  fontFamily: F,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

const samplesSubStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#4a3a2a",
  fontFamily: F,
  marginTop: "3px",
};

const sampleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 8px",
  borderRadius: "5px",
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.05)",
};

function toggleBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 8px",
    borderRadius: "4px",
    border: `1px solid ${active ? "rgba(74,124,89,0.4)" : "rgba(255,255,255,0.1)"}`,
    background: active ? "rgba(74,124,89,0.12)" : "transparent",
    color: active ? "#4a7c59" : "#5a4a3a",
    fontSize: "11px",
    fontFamily: F,
    cursor: "pointer",
    fontWeight: 600,
  };
}
