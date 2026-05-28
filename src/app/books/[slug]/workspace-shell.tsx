"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StageKey, StageStatus } from "@prisma/client";
import type { StageGroup } from "@/lib/ui/stage-tokens";
import { StageNav } from "./stage-nav";
import { AgentChatPanel } from "./agent-chat-panel";
import { ChapterDraftBmadPanel } from "./chapter-draft-bmad-panel";
import { EditingBmadPanel } from "./editing-bmad-panel";
import { ScoutResearchPanel } from "./scout-research-panel";
import { ChronicleStoriesPanel } from "./chronicle-stories-panel";
import { ManifestPanel } from "./manifest-panel";
import { WorkbookSplitPanel } from "./workbook-split-panel";
import { CostPaceBar } from "./cost-pace-bar";

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
  const [typesetMode, setTypesetMode] = useState<"split" | "folio">("split");

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
        {/* Left: library link + stage shortcuts + utility pages */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap" }}>
          <Link href="/" style={breadcrumbLinkStyle} title="Library">← Library</Link>
          <span style={dividerStyle} />
          {NAV_SHORTCUTS.map((s) => {
            const stage = stages.find((st) => st.key === s.key);
            const isActive = selectedKey === s.key;
            const isLocked = stage?.locked ?? true;
            const isDone = stage?.status === "COMMITTED";
            return (
              <button
                key={s.key}
                style={navPillStyle(isActive, isLocked, isDone)}
                onClick={() => { if (!isLocked) setSelectedKey(s.key as StageKey); }}
                disabled={isLocked}
                title={isLocked ? `${s.label} (locked)` : s.label}
              >
                {isDone && !isActive ? <span style={{ marginRight: 3, opacity: 0.6 }}>✓</span> : null}
                {s.label}
              </button>
            );
          })}
          <span style={dividerStyle} />
          {UTILITY_LINKS.map((u) => (
            <Link key={u.href} href={`/books/${slug}${u.href}`} style={utilityLinkStyle} title={u.label}>
              {u.label}
            </Link>
          ))}
        </div>

        {/* Right: progress + cost + export */}
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
          <CostPaceBar slug={slug} />
          {totalCommitted > 0 && (
            <a
              href={`/api/books/${slug}/workspace-export?format=markdown`}
              download
              style={exportBtnStyle}
              title="Download draft as Markdown"
            >
              ↓ Draft
            </a>
          )}
          {(() => {
            const typesetStage = stages.find(s => s.key === "TYPESET");
            const typesetCommitted = typesetStage?.status === "COMMITTED";
            if (!typesetCommitted) return null;
            return (
              <>
                <a
                  href={`/api/books/${slug}/workspace-export?format=docx`}
                  download
                  style={docxBtnStyle}
                  title="Download KDP-ready DOCX (Word)"
                >
                  ↓ DOCX
                </a>
                <a
                  href={`/api/books/${slug}/workspace-export?format=manuscript`}
                  download
                  style={manuscriptBtnStyle}
                  title="Download complete manuscript as Markdown"
                >
                  ↓ MD
                </a>
              </>
            );
          })()}
        </div>
      </div>

      {/* ── Body: sidebar + panels ── */}
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

        {/* EDITING (Reed) — auto-loop panel, edits each chapter in sequence */}
        {(() => {
          const editingStage = stages.find((s) => s.key === "EDITING");
          if (!editingStage || editingStage.locked) return null;
          return (
            <div style={{ display: selectedKey === "EDITING" ? "flex" : "none", flex: 1, overflow: "hidden" }}>
              <EditingBmadPanel
                slug={slug}
                status={editingStage.status}
                bookTitle={bookTitle}
                onStageAdvance={advanceTo}
              />
            </div>
          );
        })()}

        {/* TYPESET — workbook split first, then Folio agent chat */}
        {(() => {
          const typesetStage = stages.find((s) => s.key === "TYPESET");
          if (!typesetStage || typesetStage.locked) return null;
          return (
            <div style={{ display: selectedKey === "TYPESET" ? "flex" : "none", flex: 1, overflow: "hidden" }}>
              {typesetMode === "split" ? (
                <WorkbookSplitPanel
                  slug={slug}
                  bookTitle={bookTitle}
                  onStageAdvance={advanceTo}
                  onSkip={() => setTypesetMode("folio")}
                />
              ) : (
                <AgentChatPanel
                  slug={slug}
                  stageKey="TYPESET"
                  stageLabel={typesetStage.label}
                  stageRoute={typesetStage.route}
                  status={typesetStage.status}
                  artifactCount={typesetStage.artifactCount}
                  bookTitle={bookTitle}
                  committedContent={typesetStage.committedContent}
                  onStageAdvance={advanceTo}
                  dossierMode={false}
                  persistChat={true}
                />
              )}
            </div>
          );
        })()}

        {/* All other panels — only rendered when selected */}
        {selectedKey !== "EDITING" && selectedKey !== "TYPESET" && (
          selectedStage && (selectedStage.key === "CHAPTER_DRAFT" || selectedStage.key === "FICTION_DRAFT") ? (
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
          ) : selectedStage?.key === "MANIFEST" ? (
            <ManifestPanel
              slug={slug}
              status={selectedStage.status}
              bookTitle={bookTitle}
              onStageAdvance={advanceTo}
            />
          ) : selectedStage?.key === "RESEARCH" ? (
            <ScoutResearchPanel
              slug={slug}
              status={selectedStage.status}
              outlineContent={stages.find((s) => s.key === "OUTLINE")?.committedContent ?? null}
              bookTitle={bookTitle}
              onStageAdvance={advanceTo}
            />
          ) : selectedStage?.key === "EXTERNAL_STORIES" ? (
            <ChronicleStoriesPanel
              slug={slug}
              status={selectedStage.status}
              outlineContent={stages.find((s) => s.key === "OUTLINE")?.committedContent ?? null}
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
              dossierMode={selectedStage.key === "PERSONAL_STORIES"}
            />
          )
        )}
      </div>
    </div>
  );
}

// ── Stage shortcuts shown in the top bar ─────────────────────────────────────
// These are the stages authors actually navigate to. Everything else is
// accessible via the sidebar when needed.
const NAV_SHORTCUTS: Array<{ key: string; label: string }> = [
  { key: "BOOK_SETUP",       label: "Setup"     },
  { key: "OUTLINE",          label: "Outline"   },
  { key: "RESEARCH",         label: "Research"  },
  { key: "EXTERNAL_STORIES", label: "Stories"   },
  { key: "MANIFEST",         label: "Manifest"  },
  { key: "CHAPTER_DRAFT",    label: "Draft"     },
  { key: "EDITING",          label: "Edit"      },
  { key: "TYPESET",          label: "Typeset"   },
  // Post-production launch tools — unlock after Typeset
  { key: "LAUNCH_LISTING",   label: "Listing"   },
  { key: "PRESS_KIT",        label: "Press"     },
  { key: "SOCIAL_CAMPAIGN",  label: "Social"    },
  { key: "AUDIO_PREP",       label: "Audio"     },
  { key: "COURSE_DESIGN",    label: "Course"    },
  { key: "SPEAKING_KIT",     label: "Speaking"  },
];

// ── Utility pages (separate full routes, not workspace panels) ────────────────
const UTILITY_LINKS: Array<{ href: string; label: string }> = [
  { href: "/ideas",         label: "Ideas"      },
  { href: "/personas",      label: "Personas"   },
  { href: "/author",        label: "Author"     },
  { href: "/dashboard",     label: "Dashboard"  },
  { href: "/files",         label: "Files"      },
  { href: "/cost-analysis", label: "Costs"      },
  { href: "/publish",       label: "Publish"    },
];

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

const breadcrumbLinkStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#8a7060",
  textDecoration: "none",
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

const dividerStyle: React.CSSProperties = {
  width: "1px",
  height: "14px",
  background: "rgba(255,255,255,0.1)",
  margin: "0 4px",
  flexShrink: 0,
};

function navPillStyle(active: boolean, locked: boolean, done: boolean): React.CSSProperties {
  return {
    padding: "3px 9px",
    borderRadius: "4px",
    border: active
      ? "1px solid rgba(184,121,58,0.5)"
      : done
        ? "1px solid rgba(74,124,89,0.35)"
        : "1px solid rgba(255,255,255,0.08)",
    background: active
      ? "rgba(184,121,58,0.15)"
      : done
        ? "rgba(74,124,89,0.1)"
        : "transparent",
    color: locked
      ? "#3a2e26"
      : active
        ? "#d4954a"
        : done
          ? "#6aaa83"
          : "#8a7060",
    fontSize: "11px",
    fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
    cursor: locked ? "default" : "pointer",
    whiteSpace: "nowrap" as const,
    fontWeight: active ? 600 : 400,
    transition: "all 150ms ease",
    flexShrink: 0,
  };
}

const utilityLinkStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#5a4a3a",
  textDecoration: "none",
  padding: "3px 6px",
  whiteSpace: "nowrap",
  flexShrink: 0,
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
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

const docxBtnStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#2563eb",
  textDecoration: "none",
  padding: "3px 8px",
  border: "1px solid rgba(37,99,235,0.4)",
  borderRadius: "4px",
  whiteSpace: "nowrap",
  flexShrink: 0,
  fontWeight: 600,
};

const manuscriptBtnStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#4a7c59",
  textDecoration: "none",
  padding: "3px 8px",
  border: "1px solid rgba(74,124,89,0.4)",
  borderRadius: "4px",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
