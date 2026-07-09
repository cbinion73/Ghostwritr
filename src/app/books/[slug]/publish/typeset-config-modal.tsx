"use client";

import { useState } from "react";
import { updateTypesetConfig } from "./actions";

interface TypesetConfigModalProps {
  slug: string;
  trimSize: string;
  targetPageCount: number | null;
  outputFormats: string[];
}

const FORMAT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "PRINT", label: "Print" },
  { value: "EBOOK", label: "Ebook" },
  { value: "AUDIO", label: "Audio / spoken adaptation" },
];

export function TypesetConfigModal({ slug, trimSize, targetPageCount, outputFormats }: TypesetConfigModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn" type="button" onClick={() => setOpen(true)}>
        ⚙ Configuration
      </button>

      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={{ margin: 0 }}>Typeset Configuration</h3>
              <button className="btn" type="button" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="muted" style={{ marginBottom: 16, lineHeight: 1.6 }}>
              These are the only inputs that change what Typeset produces — trim size, target
              page count, and output formats. Everything else in the publishing package
              (running heads, chapter opener style, table of contents, recto starts) is
              computed automatically from these plus your manuscript.
            </div>
            <form
              action={async (formData) => {
                await updateTypesetConfig(slug, formData);
                setOpen(false);
              }}
              className="stack"
              style={{ padding: 0 }}
            >
              <label className="form-field">
                <span className="field-label">Trim Size</span>
                <input
                  className="editor-input"
                  name="trimSize"
                  defaultValue={trimSize}
                  placeholder="6 x 9 in"
                />
              </label>

              <label className="form-field">
                <span className="field-label">Target Page Count</span>
                <input
                  className="editor-input"
                  name="targetPageCount"
                  type="number"
                  min={0}
                  defaultValue={targetPageCount ?? ""}
                  placeholder="Leave blank to auto-estimate"
                />
              </label>

              <div className="card">
                <h4 style={{ marginTop: 0 }}>Output Formats</h4>
                {FORMAT_OPTIONS.map((format) => (
                  <label key={format.value} className="checkbox-row">
                    <input
                      type="checkbox"
                      name="outputFormats"
                      value={format.value}
                      defaultChecked={outputFormats.includes(format.value)}
                    />
                    <span>{format.label}</span>
                  </label>
                ))}
              </div>

              <div className="button-row" style={{ marginTop: 8 }}>
                <button className="btn btn-primary" type="submit">
                  Save Configuration
                </button>
                <button className="btn" type="button" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(20,16,10,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "#fefbf5",
  borderRadius: 10,
  padding: "24px 28px",
  width: "min(480px, 92vw)",
  maxHeight: "85vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
};

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};
