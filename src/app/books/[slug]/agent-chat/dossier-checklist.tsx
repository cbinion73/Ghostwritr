import type { CSSProperties } from "react";

import type { DossierChapter } from "./types";

export function parseOutlineChapters(outline: string): string[] {
  if (!outline.trim()) return [];
  const lines = outline.split("\n");
  const titles: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,3}\s/.test(trimmed)) {
      const title = trimmed.replace(/^#{1,3}\s+/, "").trim();
      if (title) titles.push(title);
      continue;
    }
    const boldMatch = trimmed.match(/^\*\*(.{3,80})\*\*\s*$/);
    if (boldMatch && /chapter|part|act|\d/i.test(boldMatch[1])) titles.push(boldMatch[1]);
    else if (/^Chapter\s+\d+/i.test(trimmed)) titles.push(trimmed);
  }

  if (titles.length === 0) {
    for (const line of lines) {
      const match = line.trim().match(/^(\d{1,2})[.)]\s+(.+)$/);
      if (match && !line.startsWith("  ") && !line.startsWith("\t")) titles.push(match[2]);
    }
  }
  return titles;
}

export function DossierChecklist({ chapters, savedCount }: { chapters: DossierChapter[]; savedCount: number }) {
  const total = chapters.length;
  const percent = total > 0 ? Math.round((savedCount / total) * 100) : 0;
  return (
    <div style={sidebarStyle}>
      <div style={headerStyle}>
        <div style={titleStyle}>Chapter Dossiers</div>
        <div style={progressLabelStyle}>{savedCount}/{total} saved</div>
      </div>
      <div style={trackStyle}><div style={{ ...fillStyle, width: `${percent}%` }} /></div>
      <div style={listStyle}>
        {chapters.map((chapter, index) => (
          <div key={index} style={rowStyle}>
            <div style={pipStyle(chapter.status)}>{chapter.status === "saved" ? "✓" : ""}</div>
            <div style={chapterTitleStyle(chapter.status)}>{chapter.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const sidebarStyle: CSSProperties = { width: "220px", flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid rgba(45,36,29,0.1)", background: "rgba(254,251,245,0.7)", overflow: "hidden" };
const headerStyle: CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "14px 16px 8px", flexShrink: 0 };
const titleStyle: CSSProperties = { fontSize: "11px", fontWeight: 700, color: "#6f6256", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' };
const progressLabelStyle: CSSProperties = { fontSize: "11px", color: "#B8793A", fontWeight: 600, fontFamily: titleStyle.fontFamily };
const trackStyle: CSSProperties = { height: "2px", background: "rgba(45,36,29,0.08)", margin: "0 16px 10px", borderRadius: "1px", overflow: "hidden", flexShrink: 0 };
const fillStyle: CSSProperties = { height: "100%", background: "#4a7c59", borderRadius: "1px", transition: "width 400ms ease" };
const listStyle: CSSProperties = { flex: 1, overflowY: "auto", padding: "0 0 16px" };
const rowStyle: CSSProperties = { display: "flex", alignItems: "flex-start", gap: "8px", padding: "5px 16px" };
const pipStyle = (status: DossierChapter["status"]): CSSProperties => ({ width: "16px", height: "16px", borderRadius: "4px", flexShrink: 0, marginTop: "1px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, background: status === "saved" ? "#4a7c59" : "transparent", border: status === "saved" ? "none" : "1.5px solid rgba(45,36,29,0.2)", color: status === "saved" ? "#fff" : "transparent", transition: "all 250ms ease" });
const chapterTitleStyle = (status: DossierChapter["status"]): CSSProperties => ({ fontSize: "12px", lineHeight: 1.4, color: status === "saved" ? "#2d241d" : "#9a8a7a", fontFamily: titleStyle.fontFamily, fontWeight: status === "saved" ? 500 : 400 });
