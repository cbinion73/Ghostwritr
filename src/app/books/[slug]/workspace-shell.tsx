"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StageKey, StageStatus } from "@prisma/client";
import type { StageGroup } from "@/lib/ui/stage-tokens";
import { StageNav } from "./stage-nav";
import { AgentChatPanel } from "./agent-chat-panel";
import { ChapterDraftBmadPanel } from "./chapter-draft-bmad-panel";

export type WorkspaceStage = {
  key: StageKey;
  number: number;
  label: string;
  group: StageGroup;
  description: string;
  route: string;
  status: StageStatus;
  artifactCount: number;
  locked: boolean;
  committedContent: string | null;
};

interface WorkspaceShellProps {
  slug: string;
  bookTitle: string;
  bookSubtitle?: string | null;
  stages: WorkspaceStage[];
  groupKeys: StageGroup[];
  defaultStageKey: StageKey;
  totalCommitted: number;
  totalArtifacts: number;
}

export function WorkspaceShell({
  slug,
  bookTitle,
  bookSubtitle,
  stages,
  groupKeys,
  defaultStageKey,
  totalCommitted,
  totalArtifacts: _totalArtifacts,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<StageKey>(defaultStageKey);

  const selectedStage = stages.find((s) => s.key === selectedKey) ?? stages[0];

  // Poll while any stage is running so the sidebar badge updates automatically
  const hasRunning = stages.some((s) => s.status === "IN_PROGRESS");
  useEffect(() => {
    if (!hasRunning) return;
    const id = setTimeout(() => router.refresh(), 3000);
    return () => clearTimeout(id);
  }, [hasRunning, stages, router]);

  // Advance to a specific stage (called by AgentChatPanel after commit/approve)
  const advanceTo = useCallback((key: StageKey) => {
    const target = stages.find((s) => s.key === key);
    if (target && !target.locked) setSelectedKey(key);
  }, [stages]);

  return (
    <div style={shellStyle}>
      {/* ── Top bar ── */}
      <div style={topBarStyle}>
        <nav style={breadcrumbStyle}>
          <Link href="/" style={breadcrumbLinkStyle}>← Library</Link>
          <span style={sepStyle}> · </span>
          <Link href={`/books/${slug}/voice-capture`} style={breadcrumbLinkStyle}>Voice</Link>
          <span style={sepStyle}> · </span>
          <Link href={`/books/${slug}/overrides`} style={breadcrumbLinkStyle}>Overrides</Link>
        </nav>
        <div style={progressStyle}>
          {hasRunning && (
            <span style={runningPulseStyle} title="Agent is working…">⟳</span>
          )}
          <span style={progressLabelStyle}>
            {totalCommitted}/{stages.length} committed
          </span>
          <div style={progressTrackStyle}>
            <div
              style={{
                ...progressFillStyle,
                width: `${stages.length > 0 ? (totalCommitted / stages.length) * 100 : 0}%`,
              }}
            />
          </div>
          {totalCommitted > 0 && (
            <a
              href={`/api/books/${slug}/workspace-export?format=markdown`}
              download
              style={exportBtnStyle}
              title="Download manuscript draft"
            >
              ↓ Export
            </a>
          )}
        </div>
      </div>

      {/* ── Body: sidebar + chat ── */}
      <div style={bodyStyle}>
        <StageNav
          slug={slug}
          title={bookTitle}
          subtitle={bookSubtitle}
          items={stages}
          groupKeys={groupKeys}
          selectedKey={selectedKey}
          onSelect={(key) => {
            const stage = stages.find((s) => s.key === key);
            if (!stage?.locked) setSelectedKey(key);
          }}
        />

        {selectedStage && (selectedStage.key === "CHAPTER_DRAFT" || selectedStage.key === "FICTION_DRAFT") ? (
          <ChapterDraftBmadPanel
            slug={slug}
            status={selectedStage.status}
            stageKey={selectedStage.key}
            outlineContent={
              selectedStage.key === "FICTION_DRAFT"
                ? (stages.find((s) => s.key === "SCENE_PLAN")?.committedContent ?? null)
                : (stages.find((s) => s.key === "OUTLINE")?.committedContent ?? null)
            }
            bookTitle={bookTitle}
            onStageAdvance={advanceTo}
          />
        ) : selectedStage && (
          <AgentChatPanel
            slug={slug}
            stageKey={selectedStage.key}
            stageLabel={selectedStage.label}
            stageRoute={selectedStage.route}
            status={selectedStage.status}
            artifactCount={selectedStage.artifactCount}
            bookTitle={bookTitle}
            committedContent={selectedStage.committedContent}
            onStageAdvance={advanceTo}
          />
        )}
      </div>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  overflow: "hidden",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 24px",
  background: "#1a1410",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  flexShrink: 0,
  gap: "16px",
};

const breadcrumbStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0",
};

const breadcrumbLinkStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#8a7060",
  textDecoration: "none",
};

const sepStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#3a2e26",
  margin: "0 4px",
};

const progressStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const runningPulseStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#B8793A",
  animation: "spin 1.2s linear infinite",
};

const progressLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8a7060",
  whiteSpace: "nowrap",
};

const progressTrackStyle: React.CSSProperties = {
  width: "120px",
  height: "3px",
  background: "rgba(255,255,255,0.08)",
  borderRadius: "2px",
  overflow: "hidden",
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  background: "#4a7c59",
  borderRadius: "2px",
  transition: "width 400ms ease",
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  overflow: "hidden",
};

const exportBtnStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#8a7060",
  textDecoration: "none",
  padding: "3px 8px",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "4px",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
