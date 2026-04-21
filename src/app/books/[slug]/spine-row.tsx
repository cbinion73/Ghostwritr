import Link from "next/link";

import type { StageStatus } from "@prisma/client";

import {
  GROUP_COLORS,
  STAGE_STATE_DISPLAY,
  type StageToken,
} from "@/lib/ui/stage-tokens";

type SpineRowProps = {
  token: StageToken;
  status: StageStatus;
  artifactCount: number;
  updatedAt: Date | null;
  slug: string;
};

function formatArtifactCount(count: number, status: StageStatus): string {
  if (count === 0 && status === "NOT_STARTED") return "—";
  if (count === 0) return "0 artifacts";
  if (count === 1) return "1 artifact";
  return `${count} artifacts`;
}

function formatRelative(date: Date | null): string {
  if (!date) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SpineRow({
  token,
  status,
  artifactCount,
  updatedAt,
  slug,
}: SpineRowProps) {
  const state = STAGE_STATE_DISPLAY[status];
  const group = GROUP_COLORS[token.group];
  const isLocked = status === "NOT_STARTED";
  const relative = formatRelative(updatedAt);

  return (
    <Link
      href={token.route(slug)}
      style={rowStyle}
      aria-label={`Stage ${token.number}: ${token.label}. Status: ${state.ariaLabel}. ${formatArtifactCount(
        artifactCount,
        status,
      )}.`}
    >
      {/* Group gutter — 4px left edge, group color */}
      <span
        style={{
          ...gutterStyle,
          background: group.gutter,
          opacity: isLocked ? 0.35 : 0.9,
        }}
        aria-hidden="true"
      />

      {/* Stage number, name, description */}
      <span style={stageMetaStyle}>
        <span style={stageNumberStyle}>{String(token.number).padStart(2, "0")}</span>
        <span>
          <span style={stageLabelStyle}>{token.label}</span>
          <span style={stageDescStyle}>{token.description}</span>
        </span>
      </span>

      {/* State badge — shape + word */}
      <span
        style={{
          ...stateBadgeStyle,
          color: state.color,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            ...stateShapeStyle,
            color: state.color,
          }}
        >
          {state.shape}
        </span>
        <span style={stateLabelStyle}>{state.label}</span>
      </span>

      {/* Artifact count + timestamp */}
      <span style={artifactMetaStyle}>
        <span style={{ fontFeatureSettings: `"tnum" 1` }}>
          {formatArtifactCount(artifactCount, status)}
        </span>
        {relative ? <span style={timestampStyle}>{relative}</span> : null}
      </span>

      <span style={chevronStyle} aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

// Inline styles matching the existing pattern (see voice-blending-selector.tsx etc.)
// Plain CSS via style props — no Tailwind.

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "4px 1fr auto auto 16px",
  gap: "20px",
  alignItems: "center",
  padding: "14px 20px",
  textDecoration: "none",
  color: "inherit",
  background: "rgba(254, 251, 245, 0.55)",
  borderRadius: "6px",
  border: "1px solid rgba(45, 36, 29, 0.08)",
  transition: "background 160ms ease-out, transform 160ms ease-out",
  minHeight: "64px",
};

const gutterStyle: React.CSSProperties = {
  alignSelf: "stretch",
  width: "4px",
  borderRadius: "2px",
  marginLeft: "-12px",
};

const stageMetaStyle: React.CSSProperties = {
  display: "flex",
  gap: "14px",
  alignItems: "baseline",
  minWidth: 0,
};

const stageNumberStyle: React.CSSProperties = {
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
  fontSize: "13px",
  fontWeight: 600,
  color: "#6f6256",
  letterSpacing: "0.02em",
  fontFeatureSettings: `"tnum" 1`,
};

const stageLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "15px",
  fontWeight: 600,
  color: "#2d241d",
  lineHeight: 1.3,
};

const stageDescStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "#6f6256",
  lineHeight: 1.4,
  marginTop: "2px",
};

const stateBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "4px 10px",
  borderRadius: "4px",
  background: "rgba(45, 36, 29, 0.04)",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const stateShapeStyle: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: 1,
};

const stateLabelStyle: React.CSSProperties = {
  fontSize: "11px",
};

const artifactMetaStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "2px",
  fontSize: "12px",
  color: "#6f6256",
  whiteSpace: "nowrap",
  minWidth: "120px",
};

const timestampStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8a7a6a",
};

const chevronStyle: React.CSSProperties = {
  fontSize: "18px",
  color: "#bfae9a",
  lineHeight: 1,
};
