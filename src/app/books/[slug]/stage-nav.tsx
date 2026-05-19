"use client";

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
  title,
  subtitle,
  items,
  groupKeys,
  selectedKey,
  onSelect,
}: StageNavProps) {
  return (
    <aside style={navStyle}>
      <div style={bookTitleStyle}>
        <div style={bookNameStyle}>{title}</div>
        {subtitle && <div style={bookSubtitleStyle}>{subtitle}</div>}
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
                        background: isSelected ? "rgba(255,255,255,0.06)" : "transparent",
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

const navStyle: React.CSSProperties = {
  width: 220,
  flexShrink: 0,
  background: "#120e0b",
  borderRight: "1px solid rgba(255,255,255,0.05)",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
};

const bookTitleStyle: React.CSSProperties = {
  padding: "16px 16px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const bookNameStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#d4c4b0",
  lineHeight: 1.3,
};

const bookSubtitleStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#6b5a4e",
  marginTop: 3,
  lineHeight: 1.3,
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
  fontSize: "9px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 700,
  marginBottom: 6,
  paddingLeft: 10,
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
  fontSize: "12px",
  color: "#c4b4a0",
  flex: 1,
  lineHeight: 1.2,
};

const artifactBadgeStyle: React.CSSProperties = {
  fontSize: "10px",
  color: "#6b5a4e",
  background: "rgba(255,255,255,0.06)",
  borderRadius: 3,
  padding: "1px 4px",
  flexShrink: 0,
};
