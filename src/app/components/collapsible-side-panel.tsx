"use client";

/**
 * Collapse/expand wrapper for a fixed-width side panel (Scout, Chronicle,
 * any future agent-chat panel rendered next to a stage's server content).
 * Mirrors the Promise "Refine" ChatSidebar's collapse behavior — these
 * panels had no way to close or minimize at all, permanently eating a
 * fixed slice of the screen even when the author just wants to read the
 * main content.
 */

import { useState } from "react";

export function CollapsibleSidePanel({
  title,
  width = 420,
  children,
}: {
  title: string;
  width?: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        width: collapsed ? 48 : width,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid var(--line)",
        transition: "width 0.2s ease-out",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: collapsed ? "center" : "space-between",
          alignItems: "center",
          padding: collapsed ? "10px 4px" : "10px 12px",
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
          background: "var(--paper, #fbf6ef)",
        }}
      >
        {!collapsed && (
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{title}</span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            color: "var(--muted)",
            padding: "4px 8px",
          }}
          title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          {collapsed ? "←" : "→"}
        </button>
      </div>

      {!collapsed && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      )}
    </div>
  );
}
