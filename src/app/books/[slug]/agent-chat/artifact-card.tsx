import type { CSSProperties } from "react";

import type { ArtifactDraft } from "./types";
import { MarkdownText } from "./markdown-text";

export function ArtifactCard({ artifact, onCommit, commitLabel = "Commit artifact →", onDismiss, tall }: {
  artifact: ArtifactDraft;
  onCommit: () => void;
  commitLabel?: string;
  onDismiss: () => void;
  tall?: boolean;
}) {
  return (
    <div style={cardStyle}>
      <div style={headerStyle}>Artifact ready · {artifact.title}</div>
      <div style={{ ...previewStyle, maxHeight: tall ? "600px" : "320px" }}>
        <MarkdownText text={artifact.content} />
      </div>
      <div style={{ display: "flex", gap: "8px", paddingTop: 4 }}>
        <button style={commitStyle} onClick={onCommit}>{commitLabel}</button>
        <button style={dismissStyle} onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}

const cardStyle: CSSProperties = { background: "rgba(184,121,58,0.06)", border: "1px solid rgba(184,121,58,0.3)", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" };
const headerStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "#B8793A", fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' };
const previewStyle: CSSProperties = { fontSize: "13px", color: "#4a3e33", lineHeight: 1.7, fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', overflowY: "auto", borderTop: "1px solid rgba(184,121,58,0.15)", borderBottom: "1px solid rgba(184,121,58,0.15)", padding: "12px 0" };
const commitStyle: CSSProperties = { padding: "8px 14px", borderRadius: "6px", border: "none", background: "#2d241d", color: "#fefbf5", fontSize: "12px", fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', cursor: "pointer" };
const dismissStyle: CSSProperties = { ...commitStyle, border: "1px solid rgba(45,36,29,0.2)", background: "transparent", color: "#6f6256" };
