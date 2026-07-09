"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { WorkbookDesignPanel } from "./workbook-design-panel";
import { CostPaceBar } from "./cost-pace-bar";
import { ActivityTicker } from "./activity-ticker";
import { OvernightBuildControls, MorningReportBanner } from "./overnight-build-panel";
import { ReviewNotifier } from "./review-notifier";
import { StageLiveFeed } from "./stage-live-feed";
import { CollapsibleSidePanel } from "@/app/components/collapsible-side-panel";
import type { MorningReport } from "@/lib/workflows/overnight-build";

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
  /** Server-rendered Evidence Room content, mounted when RESEARCH is selected. */
  researchDetail?: React.ReactNode;
  /** Server-rendered Verdict room content, mounted when PROMISE is selected. */
  promiseDetail?: React.ReactNode;
  /** Server-rendered Outline room content, mounted when OUTLINE is selected. */
  outlineDetail?: React.ReactNode;
  /** Server-rendered Base Story room content, mounted when BASE_STORY is selected. */
  baseStoryDetail?: React.ReactNode;
  /** Server-rendered Story Vault content, mounted when EXTERNAL_STORIES is selected. */
  externalStoriesDetail?: React.ReactNode;
  /** Server-rendered Interview room content, mounted when PERSONAL_STORIES is selected. */
  personalStoriesDetail?: React.ReactNode;
  /** Server-rendered Settings room content, mounted when BOOK_SETUP is selected. */
  bookSetupDetail?: React.ReactNode;
  /** Server-rendered Editing room content, mounted when EDITING is selected. */
  editingDetail?: React.ReactNode;
  /** Server-rendered Typeset & Publish room content, mounted when TYPESET is selected. */
  typesetDetail?: React.ReactNode;
  /** Server-rendered Story Setup room content, mounted when STORY_SETUP is selected. */
  storySetupDetail?: React.ReactNode;
  /** Server-rendered Story Core room content, mounted when STORY_CORE is selected. */
  storyCoreDetail?: React.ReactNode;
  /** Server-rendered World & Cast room content, mounted when WORLD_CAST is selected. */
  worldCastDetail?: React.ReactNode;
  /** Server-rendered Plot Blueprint room content, mounted when PLOT_BLUEPRINT is selected. */
  plotBlueprintDetail?: React.ReactNode;
  /** Server-rendered Scene Plan room content, mounted when SCENE_PLAN is selected. */
  scenePlanDetail?: React.ReactNode;
  /** Overnight build session state (from book metadata). */
  overnightActive?: boolean;
  /** Unacknowledged Morning Report to surface, if any. */
  morningReport?: MorningReport | null;
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
  researchDetail = null,
  promiseDetail = null,
  outlineDetail = null,
  baseStoryDetail = null,
  externalStoriesDetail = null,
  personalStoriesDetail = null,
  bookSetupDetail = null,
  editingDetail = null,
  typesetDetail = null,
  storySetupDetail = null,
  storyCoreDetail = null,
  worldCastDetail = null,
  plotBlueprintDetail = null,
  scenePlanDetail = null,
  overnightActive = false,
  morningReport = null,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<StageKey>(defaultStageKey);

  const selectedStage = stages.find((s) => s.key === selectedKey) ?? stages[0];

  // Poll while any stage is running (or an overnight build session is live,
  // so the Morning Report appears without a manual reload). router.refresh()
  // re-runs page.tsx, which builds the server-rendered detail for EVERY
  // unlocked stage (not just the selected one — see src/app/books/[slug]/
  // page.tsx), reloading and JSON-parsing every saved dossier/draft across
  // Research, External Stories, Chapter Draft, etc. every single tick. That
  // was cheap when dossiers were small, but got severe enough with a few
  // oversized ones in the database to OOM-crash production (2026-07-08) —
  // even while sitting on an unrelated tab like Editing, since a running
  // Editing stage alone was enough to keep the blind 3s router.refresh()
  // loop firing.
  //
  // Fix: poll the cheap stage-status endpoint (keys + statuses only, no
  // artifact content) and only pay for the expensive router.refresh() when
  // a status actually changed — not on every tick of a run that can take
  // 30-120s+. Research/External Stories/Chapter Draft still skip this
  // entirely; they have their own lightweight StageRunPanel that polls its
  // own small progress endpoint, so a status-change refresh here would just
  // be redundant, more costly work on top of what they're already doing.
  const STAGES_WITH_OWN_LIVE_PANEL = new Set<StageKey>([
    "RESEARCH",
    "EXTERNAL_STORIES",
    "CHAPTER_DRAFT",
  ] as StageKey[]);
  const hasRunning = stages.some((s) => s.status === "IN_PROGRESS") || overnightActive;
  const lastKnownStatuses = useRef<string>("");
  useEffect(() => {
    lastKnownStatuses.current = stages.map((s) => `${s.key}:${s.status}`).sort().join(",");
  }, [stages]);
  // router.refresh() itself causes a re-render, and useRouter()'s returned
  // object isn't guaranteed to keep a stable identity across renders —
  // depending on `router` directly re-triggers this effect on every refresh
  // it just performed, tearing down and recreating the interval before it
  // ever waits out its 3s delay (confirmed in local testing: polling fired
  // in a tight loop instead of every 3s). Route through a ref instead so
  // the interval survives its own refresh calls.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  useEffect(() => {
    if (!hasRunning) return;
    if (STAGES_WITH_OWN_LIVE_PANEL.has(selectedKey)) return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/books/${slug}/stage-status`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { stages: { key: string; status: string }[] };
        const latest = data.stages.map((s) => `${s.key}:${s.status}`).sort().join(",");
        if (latest !== lastKnownStatuses.current) {
          lastKnownStatuses.current = latest;
          routerRef.current.refresh();
        }
      } catch {
        // Transient poll failure — try again next tick.
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hasRunning, selectedKey, slug]);

  // Advance to a specific stage (called by AgentChatPanel after commit/approve)
  const advanceTo = useCallback((key: StageKey) => {
    const target = stages.find((s) => s.key === key);
    if (target && !target.locked) setSelectedKey(key);
  }, [stages]);

  return (
    <div style={shellStyle}>
      {/* ── Top bar ── */}
      <div style={topBarStyle}>
        {/* Left: library link + stage shortcuts + utility pages.
            minWidth 0 + overflow lets this cluster shrink/scroll instead of
            pushing the right cluster (progress/cost/Write-the-Book) off-screen. */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap", minWidth: 0, flex: 1, overflowX: "auto", scrollbarWidth: "none" }}>
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
          <ActivityTicker slug={slug} />
          <CostPaceBar slug={slug} />
          <OvernightBuildControls slug={slug} active={overnightActive} />
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

      {/* ── Morning Report (unacknowledged overnight-build digest) ── */}
      {morningReport && <MorningReportBanner slug={slug} report={morningReport} />}
      <ReviewNotifier
        stages={stages.map((s) => ({ key: s.key, label: s.label, status: s.status }))}
        hasMorningReport={Boolean(morningReport)}
        bookTitle={bookTitle}
      />

      {/* ── Live activity strip for the selected stage's background run ── */}
      {selectedStage && <StageLiveFeed slug={slug} stageKey={selectedStage.key} />}

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

        {/* EDITING — the real editorial-pass room (editorial modes, revision
            plans, version comparison, export) when reachable; otherwise
            Reed's auto-loop panel, edits each chapter in sequence. */}
        {(() => {
          const editingStage = stages.find((s) => s.key === "EDITING");
          if (!editingStage || editingStage.locked) return null;
          return (
            <div style={{ display: selectedKey === "EDITING" ? "flex" : "none", flex: 1, overflow: "hidden" }}>
              {editingDetail ?? (
                <EditingBmadPanel
                  slug={slug}
                  status={editingStage.status}
                  bookTitle={bookTitle}
                  onStageAdvance={advanceTo}
                />
              )}
            </div>
          );
        })()}

        {/* WORKBOOK_DESIGN (Sage) — auto-loop enrichment panel */}
        {(() => {
          const WD_KEY = "WORKBOOK_DESIGN" as StageKey;
          const wdStage = stages.find((s) => s.key === WD_KEY);
          if (!wdStage || wdStage.locked) return null;
          return (
            <div style={{ display: selectedKey === WD_KEY ? "flex" : "none", flex: 1, overflow: "hidden" }}>
              <WorkbookDesignPanel slug={slug} />
            </div>
          );
        })()}

        {/* TYPESET — the real Export & Publishing Pipeline (deterministic:
            validation, chapter readiness, publish package). This is where
            the final document actually gets produced — Editing stays
            purely editorial. Chapter Split (the workbook-companion
            feature) used to gate this by default; removed 2026-07-09 —
            it's a separate, unrelated feature that shouldn't block the
            primary typeset/export function. */}
        {(() => {
          const typesetStage = stages.find((s) => s.key === "TYPESET");
          if (!typesetStage || typesetStage.locked) return null;
          return (
            <div style={{ display: selectedKey === "TYPESET" ? "flex" : "none", flex: 1, overflow: "hidden" }}>
              {typesetDetail ?? (
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
        {selectedKey !== "EDITING" && selectedKey !== "TYPESET" && selectedKey !== ("WORKBOOK_DESIGN" as StageKey) && (
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
          ) : selectedStage?.key === "OUTLINE" ? (
            outlineDetail ? (
              /* The Outline room — the real 3-phase approval flow (sections & chapters →
                 chapter breakdowns → full ToC), each with its own phase chat. */
              <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                {outlineDetail}
              </div>
            ) : (
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
                dossierMode={false}
              />
            )
          ) : selectedStage?.key === "BASE_STORY" ? (
            baseStoryDetail ? (
              /* The Base Story room — narrative spine: generate/review/commit, no chat. */
              <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                {baseStoryDetail}
              </div>
            ) : (
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
                dossierMode={false}
              />
            )
          ) : selectedStage?.key === "STORY_SETUP" ? (
            storySetupDetail ? (
              /* Fiction room (server-rendered) + stage agent chat side by side —
                 the Blueprint conversational pattern, kept as a companion. */
              <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                  {storySetupDetail}
                </div>
                <CollapsibleSidePanel title={selectedStage.label}>
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
                    dossierMode={false}
                  />
                </CollapsibleSidePanel>
              </div>
            ) : (
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
                dossierMode={false}
              />
            )
          ) : selectedStage?.key === "STORY_CORE" ? (
            storyCoreDetail ? (
              /* Fiction room (server-rendered) + stage agent chat side by side —
                 the Blueprint conversational pattern, kept as a companion. */
              <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                  {storyCoreDetail}
                </div>
                <CollapsibleSidePanel title={selectedStage.label}>
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
                    dossierMode={false}
                  />
                </CollapsibleSidePanel>
              </div>
            ) : (
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
                dossierMode={false}
              />
            )
          ) : selectedStage?.key === "WORLD_CAST" ? (
            worldCastDetail ? (
              /* Fiction room (server-rendered) + stage agent chat side by side —
                 the Blueprint conversational pattern, kept as a companion. */
              <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                  {worldCastDetail}
                </div>
                <CollapsibleSidePanel title={selectedStage.label}>
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
                    dossierMode={false}
                  />
                </CollapsibleSidePanel>
              </div>
            ) : (
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
                dossierMode={false}
              />
            )
          ) : selectedStage?.key === "PLOT_BLUEPRINT" ? (
            plotBlueprintDetail ? (
              /* Fiction room (server-rendered) + stage agent chat side by side —
                 the Blueprint conversational pattern, kept as a companion. */
              <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                  {plotBlueprintDetail}
                </div>
                <CollapsibleSidePanel title={selectedStage.label}>
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
                    dossierMode={false}
                  />
                </CollapsibleSidePanel>
              </div>
            ) : (
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
                dossierMode={false}
              />
            )
          ) : selectedStage?.key === "SCENE_PLAN" ? (
            scenePlanDetail ? (
              /* Fiction room (server-rendered) + stage agent chat side by side —
                 the Blueprint conversational pattern, kept as a companion. */
              <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                  {scenePlanDetail}
                </div>
                <CollapsibleSidePanel title={selectedStage.label}>
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
                    dossierMode={false}
                  />
                </CollapsibleSidePanel>
              </div>
            ) : (
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
                dossierMode={false}
              />
            )
          ) : selectedStage?.key === "MANIFEST" ? (
            <ManifestPanel
              slug={slug}
              status={selectedStage.status}
              bookTitle={bookTitle}
              onStageAdvance={advanceTo}
            />
          ) : selectedStage?.key === "RESEARCH" ? (
            researchDetail ? (
              /* The Evidence Room (server-rendered) + Scout agent panel side by side */
              <div style={{ flex: 1, display: "flex", minWidth: 0, overflow: "hidden" }}>
                <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", minWidth: 0, padding: "14px 16px" }}>
                  {researchDetail}
                </div>
                <CollapsibleSidePanel title="Scout">
                  <ScoutResearchPanel
                    slug={slug}
                    status={selectedStage.status}
                    outlineContent={stages.find((s) => s.key === "OUTLINE")?.committedContent ?? null}
                    bookTitle={bookTitle}
                    onStageAdvance={advanceTo}
                  />
                </CollapsibleSidePanel>
              </div>
            ) : (
              <ScoutResearchPanel
                slug={slug}
                status={selectedStage.status}
                outlineContent={stages.find((s) => s.key === "OUTLINE")?.committedContent ?? null}
                bookTitle={bookTitle}
                onStageAdvance={advanceTo}
              />
            )
          ) : selectedStage?.key === "EXTERNAL_STORIES" ? (
            externalStoriesDetail ? (
              /* The Story Vault (server-rendered) + Chronicle agent panel side by side */
              <div style={{ flex: 1, display: "flex", minWidth: 0, overflow: "hidden" }}>
                <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", minWidth: 0, padding: "14px 16px" }}>
                  {externalStoriesDetail}
                </div>
                <CollapsibleSidePanel title="Chronicle">
                  <ChronicleStoriesPanel
                    slug={slug}
                    status={selectedStage.status}
                    outlineContent={stages.find((s) => s.key === "OUTLINE")?.committedContent ?? null}
                    bookTitle={bookTitle}
                    onStageAdvance={advanceTo}
                  />
                </CollapsibleSidePanel>
              </div>
            ) : (
              <ChronicleStoriesPanel
                slug={slug}
                status={selectedStage.status}
                outlineContent={stages.find((s) => s.key === "OUTLINE")?.committedContent ?? null}
                bookTitle={bookTitle}
                onStageAdvance={advanceTo}
              />
            )
          ) : selectedStage?.key === "PROMISE" ? (
            promiseDetail ? (
              /* The Verdict room — gate verdict + the real 7-phase approval flow.
                 promiseDetail manages its own internal flex/scroll (main column + chat). */
              <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                {promiseDetail}
              </div>
            ) : (
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
                dossierMode={false}
              />
            )
          ) : selectedStage?.key === "PERSONAL_STORIES" ? (
            personalStoriesDetail ? (
              /* The Interview room — chapter-aware interview + growing story encyclopedia. */
              <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                {personalStoriesDetail}
              </div>
            ) : (
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
                dossierMode={true}
              />
            )
          ) : selectedStage?.key === "BOOK_SETUP" ? (
            bookSetupDetail ? (
              /* The Settings room (server-rendered form) + Blueprint chat side by side —
                 Blueprint's conversational flow is the loved pattern, kept as a companion. */
              <div style={{ flex: 1, display: "flex", minWidth: 0, overflow: "hidden" }}>
                <div style={{ flex: 1, overflowY: "auto", minWidth: 0, padding: "14px 16px" }}>
                  {bookSetupDetail}
                </div>
                <CollapsibleSidePanel title={selectedStage.label}>
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
                    dossierMode={false}
                  />
                </CollapsibleSidePanel>
              </div>
            ) : (
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
                dossierMode={false}
              />
            )
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
              dossierMode={false}
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
  { key: "WORKBOOK_DESIGN",  label: "Workbook"  },
  { key: "EDITING",          label: "Edit"      },
  { key: "TYPESET",          label: "Typeset"   },
  // Post-production launch tools — unlock after Typeset
  { key: "AUDIO_PREP",       label: "Audio"     },
  { key: "COURSE_DESIGN",    label: "Course"    },
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
  flexShrink: 0,
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
