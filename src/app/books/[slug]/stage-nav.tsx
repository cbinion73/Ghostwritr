"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { StageKey } from "@prisma/client";
import type { StageGroup } from "@/lib/ui/stage-tokens";
import { STAGE_STATE_DISPLAY, GROUP_COLORS } from "@/lib/ui/stage-tokens";
import type { WorkspaceStage } from "./workspace-shell";

interface StageNavProps {
  slug: string;
  title: string;
  subtitle?: string | null;
  items: WorkspaceStage[];
  groupKeys: StageGroup[];
  selectedKey: StageKey;
  onSelect: (key: StageKey) => void;
}

export function StageNav({
  slug,
  title,
  subtitle,
  items,
  groupKeys,
  selectedKey,
  onSelect,
}: StageNavProps) {
  const router = useRouter();

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [subtitleDraft, setSubtitleDraft] = useState(subtitle ?? "");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);

  const saveTitle = async () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === title) return;
    await fetch(`/api/books/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleWorking: trimmed }),
    });
    router.refresh();
  };

  const saveSubtitle = async () => {
    setEditingSubtitle(false);
    const trimmed = subtitleDraft.trim();
    if (trimmed === (subtitle ?? "")) return;
    await fetch(`/api/books/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtitle: trimmed }),
    });
    router.refresh();
  };

  return (
    <aside style={navStyle}>
      {/* Book title — click to edit */}
      <div style={bookTitleStyle}>
        <div style={eyebrowStyle}>Ghostwritr · Manuscript</div>
        {editingTitle ? (
          <input
            ref={titleInputRef}
            style={titleInputStyle}
            value={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void saveTitle(); }
              if (e.key === "Escape") { setTitleDraft(title); setEditingTitle(false); }
            }}
          />
        ) : (
          <div
            style={bookNameStyle}
            onClick={() => { setTitleDraft(title); setEditingTitle(true); }}
            title="Click to edit title"
          >
            {title}
          </div>
        )}

        {editingSubtitle ? (
          <input
            ref={subtitleInputRef}
            style={subtitleInputStyle}
            value={subtitleDraft}
            autoFocus
            placeholder="Add subtitle…"
            onChange={(e) => setSubtitleDraft(e.target.value)}
            onBlur={() => void saveSubtitle()}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void saveSubtitle(); }
              if (e.key === "Escape") { setSubtitleDraft(subtitle ?? ""); setEditingSubtitle(false); }
            }}
          />
        ) : (
          <div
            style={{ ...bookSubtitleStyle, opacity: subtitle ? 1 : 0.3 }}
            onClick={() => { setSubtitleDraft(subtitle ?? ""); setEditingSubtitle(true); }}
            title="Click to edit subtitle"
          >
            {subtitle || "Add subtitle…"}
          </div>
        )}
      </div>

      <div style={stagesStyle}>
        {groupKeys.map((group) => {
          const groupItems = items.filter((s) => s.group === group);
          if (groupItems.length === 0) return null;
          const colors = GROUP_COLORS[group];
          return (
            <div key={group} style={groupContainerStyle}>
              <div style={{ ...groupLabelStyle, color: colors.gutter }}>
                {colors.label}
              </div>
              <div style={{ borderLeft: `2px solid ${colors.gutter}`, marginLeft: 8 }}>
                {groupItems.map((stage) => {
                  const display = STAGE_STATE_DISPLAY[stage.status];
                  const isSelected = stage.key === selectedKey;
                  const isLocked = stage.locked;
                  return (
                    <button
                      key={stage.key}
                      style={{
                        ...stageRowStyle,
                        background: isSelected
                          ? "linear-gradient(90deg, rgba(201,162,75,0.16), rgba(201,162,75,0))"
                          : "transparent",
                        borderLeft: isSelected ? "3px solid #c9a24b" : "3px solid transparent",
                        opacity: isLocked ? 0.45 : 1,
                        cursor: isLocked ? "default" : "pointer",
                      }}
                      onClick={() => !isLocked && onSelect(stage.key)}
                      disabled={isLocked}
                      title={isLocked ? "Complete the previous stage first" : stage.description}
                    >
                      <span style={{ ...statusDotStyle, color: display.color }}>
                        {display.shape}
                      </span>
                      <span style={stageLabelStyle}>{stage.label}</span>
                      {stage.artifactCount > 0 && (
                        <span style={artifactBadgeStyle}>{stage.artifactCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// The spine: a dark bottle-green book spine with a gilt edge — the hallway
// of the publishing house. All colors from the globals.css palette.
const navStyle: React.CSSProperties = {
  width: 220,
  flexShrink: 0,
  background: "linear-gradient(105deg, #0e211a 0%, #163328 22%, #163328 88%, #0e211a 100%)",
  borderRight: "2px solid rgba(201,162,75,0.45)",
  boxShadow: "inset -12px 0 24px -14px rgba(0,0,0,0.55)",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: "9px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#c9a24b",
  marginBottom: 8,
};

const bookTitleStyle: React.CSSProperties = {
  padding: "18px 16px 14px",
  borderBottom: "1px solid rgba(223,216,196,0.14)",
};

const bookNameStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 400,
  fontStyle: "italic",
  color: "#f3eedd",
  lineHeight: 1.25,
  cursor: "text",
  borderRadius: 3,
  padding: "2px 4px",
  margin: "-2px -4px",
  transition: "background 120ms",
};

const bookSubtitleStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8fa397",
  fontStyle: "italic",
  marginTop: 3,
  lineHeight: 1.3,
  cursor: "text",
  borderRadius: 3,
  padding: "2px 4px",
  margin: "3px -4px 0",
  transition: "background 120ms",
};

const titleInputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(223,216,196,0.08)",
  border: "1px solid rgba(223,216,196,0.2)",
  borderRadius: 4,
  color: "#f3eedd",
  fontSize: "15px",
  fontStyle: "italic",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  padding: "3px 6px",
  outline: "none",
  lineHeight: 1.25,
};

const subtitleInputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(223,216,196,0.06)",
  border: "1px solid rgba(223,216,196,0.14)",
  borderRadius: 4,
  color: "#8fa397",
  fontSize: "11px",
  fontStyle: "italic",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  padding: "3px 6px",
  outline: "none",
  lineHeight: 1.3,
  marginTop: 4,
};

const stagesStyle: React.CSSProperties = {
  padding: "12px 0",
  flex: 1,
};

const groupContainerStyle: React.CSSProperties = {
  marginBottom: 16,
  paddingLeft: 12,
};

const groupLabelStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: "9px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  fontWeight: 500,
  marginBottom: 6,
  paddingLeft: 10,
  opacity: 0.85,
};

const stageRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "6px 10px",
  border: "none",
  textAlign: "left",
  borderRadius: 4,
  transition: "background 150ms",
};

const statusDotStyle: React.CSSProperties = {
  fontSize: "12px",
  flexShrink: 0,
  width: 14,
  textAlign: "center",
};

const stageLabelStyle: React.CSSProperties = {
  fontSize: "12.5px",
  color: "#dcd3b0",
  flex: 1,
  lineHeight: 1.2,
};

const artifactBadgeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: "10px",
  color: "#8fa397",
  background: "rgba(223,216,196,0.08)",
  borderRadius: 3,
  padding: "1px 4px",
  flexShrink: 0,
};
