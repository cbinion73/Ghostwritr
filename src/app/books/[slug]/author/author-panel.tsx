"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AuthorPanelProps {
  slug: string;
  bookTitle?: string;
  initialFull: string;
  initialShort: string;
  initialBackCover: string;
}

export function AuthorPanel({
  slug,
  initialFull,
  initialShort,
  initialBackCover,
}: AuthorPanelProps) {
  const router = useRouter();
  const [full,      setFull]      = useState(initialFull);
  const [short,     setShort]     = useState(initialShort);
  const [backCover, setBackCover] = useState(initialBackCover);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/books/${slug}/author`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorBioFull:      full,
          authorBioShort:     short,
          authorBioBackCover: backCover,
        }),
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={pageStyle}>
      {/* Page heading + save actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <h2 style={{ margin: 0, color: "#e8d5b0", fontSize: "20px", fontWeight: 700 }}>About the Author</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {saved && <span style={savedLabelStyle}>Saved ✓</span>}
          <button
            style={{ ...saveBtnStyle, opacity: saving ? 0.6 : 1 }}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save All"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={bodyStyle}>
        <div style={introStyle}>
          Three bio variants — injected into every agent that needs author credentials
          (Marquee, Bureau, Lectern). The short version is included in all agent context.
        </div>

        <BioSection
          label="Full Version"
          description="For media kits, author pages, and long-form profiles. 400–600 words."
          value={full}
          onChange={setFull}
          rows={14}
        />

        <BioSection
          label="Short Version"
          description="For podcast show notes, back-of-book, and retailer listings. 100–150 words."
          value={short}
          onChange={setShort}
          rows={7}
        />

        <BioSection
          label="Back Cover / Warmer Version"
          description="Conversational, reader-facing tone. For print back cover and online retail. 150–200 words."
          value={backCover}
          onChange={setBackCover}
          rows={9}
        />

        <div style={saveFooterStyle}>
          {saved && <span style={savedLabelStyle}>Saved ✓</span>}
          <button
            style={{ ...saveBtnStyle, opacity: saving ? 0.6 : 1 }}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save All"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BioSection({
  label,
  description,
  value,
  onChange,
  rows,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <div style={sectionLabelStyle}>{label}</div>
          <div style={sectionDescStyle}>{description}</div>
        </div>
        <span style={wordCountStyle}>{wordCount} words</span>
      </div>
      <textarea
        style={textareaStyle}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Write the ${label.toLowerCase()} here…`}
      />
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "transparent",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};


const saveBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: "6px",
  border: "none",
  background: "#4a7c59",
  color: "#fff",
  fontSize: "12px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  cursor: "pointer",
  fontWeight: 600,
};

const savedLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#4a7c59",
  fontWeight: 500,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  maxWidth: "820px",
  width: "100%",
  boxSizing: "border-box",
};

const introStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#8a7a6a",
  lineHeight: 1.6,
  marginBottom: "28px",
  padding: "12px 16px",
  background: "rgba(184,121,58,0.07)",
  border: "1px solid rgba(184,121,58,0.2)",
  borderRadius: "6px",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "32px",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  marginBottom: "10px",
  gap: "12px",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#c9a96e",
  marginBottom: "3px",
};

const sectionDescStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#8a7a6a",
  lineHeight: 1.4,
};

const wordCountStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#B8793A",
  whiteSpace: "nowrap",
  paddingTop: "2px",
  flexShrink: 0,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  background: "rgba(255,255,255,0.05)",
  fontSize: "14px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  color: "#e8d5b0",
  lineHeight: 1.65,
  resize: "vertical",
  outline: "none",
  boxSizing: "border-box",
};

const saveFooterStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: "12px",
  paddingTop: "8px",
};
