import Link from "next/link";
import { ArtifactType, StageKey } from "@prisma/client";
import {
  FictionDraftArtifactSchema,
  PlotBlueprintArtifactSchema,
  ScenePlanArtifactSchema,
  StoryCoreArtifactSchema,
  StorySetupArtifactSchema,
  WorldCastArtifactSchema,
  parseArtifactWithSchema,
  parseMetadataRecord,
} from "@/lib/artifact-schemas";

import {
  disableWorkflowAutomationAction,
  enableWorkflowAutomationAction,
  runWorkflowAutopilotAction,
  runWorkflowAutopilotModeAction,
  setWorkflowAutomationModeAction,
} from "./actions";

import {
  countDraftedChapters,
  countScenePlanScenes,
  getFictionNextStep,
  getFictionStoryMemory,
  sumDraftWords,
} from "@/lib/fiction-presenters";
import { getBookStageLinks } from "@/lib/navigation";
import { getBookBySlugOrThrow } from "@/lib/repositories/books";
import { getCommittedFictionArtifactVersion } from "@/lib/repositories/fiction-artifacts";
import { getEditingWorkspace } from "@/lib/workflows/editing-public";
import type { WorkflowAutomationMode } from "@/lib/workflows/workflow-automation";

type AutomationUiState = {
  enabled?: boolean;
  mode?: WorkflowAutomationMode;
  lastSummary?: { title?: string; detail?: string; status?: string; at?: string };
  history?: Array<{ title?: string; detail?: string; status?: string; at?: string }>;
};

function findStage(
  book: Awaited<ReturnType<typeof getBookBySlugOrThrow>>,
  stageKey: StageKey,
) {
  return book.stages.find((stage) => stage.stageKey === stageKey) ?? null;
}

export async function FictionDashboardPage({ slug }: { slug: string }) {
  const book = await getBookBySlugOrThrow(slug);
  const stageLinks = getBookStageLinks(book.workflowType, slug);

  const [
    storySetupVersion,
    storyCoreVersion,
    worldCastVersion,
    plotBlueprintVersion,
    scenePlanVersion,
    draftVersion,
  ] = await Promise.all([
    getCommittedFictionArtifactVersion(book.id, ArtifactType.STORY_SETUP_PROFILE),
    getCommittedFictionArtifactVersion(book.id, ArtifactType.STORY_CORE_BIBLE),
    getCommittedFictionArtifactVersion(book.id, ArtifactType.WORLD_CAST_BIBLE),
    getCommittedFictionArtifactVersion(book.id, ArtifactType.FICTION_PLOT_BLUEPRINT),
    getCommittedFictionArtifactVersion(book.id, ArtifactType.FICTION_SCENE_PLAN),
    getCommittedFictionArtifactVersion(book.id, ArtifactType.FICTION_DRAFT_MANUSCRIPT),
  ]);

  const storySetup = parseArtifactWithSchema(storySetupVersion?.contentJson, StorySetupArtifactSchema);
  const storyCore = parseArtifactWithSchema(storyCoreVersion?.contentJson, StoryCoreArtifactSchema);
  const worldCast = parseArtifactWithSchema(worldCastVersion?.contentJson, WorldCastArtifactSchema);
  const plotBlueprint = parseArtifactWithSchema(plotBlueprintVersion?.contentJson, PlotBlueprintArtifactSchema);
  const scenePlan = parseArtifactWithSchema(scenePlanVersion?.contentJson, ScenePlanArtifactSchema);
  const draft = parseArtifactWithSchema(draftVersion?.contentJson, FictionDraftArtifactSchema);

  const storyMemory = getFictionStoryMemory({ storySetup, storyCore, worldCast });
  const editingWorkspace = await getEditingWorkspace(slug);
  const bookMetadata = parseMetadataRecord(book.metadataJson);
  const automation =
    bookMetadata.workflowAutomation && typeof bookMetadata.workflowAutomation === "object"
      ? (bookMetadata.workflowAutomation as AutomationUiState)
      : null;
  const nextStep = getFictionNextStep({ storySetup, storyCore, worldCast, plotBlueprint, scenePlan, draft });
  const draftWords = sumDraftWords(draft);
  const draftedChapters = countDraftedChapters(draft);
  const plannedChapters = scenePlan?.chapters.length ?? plotBlueprint?.chapterBeats.length ?? 0;

  const stageCards = [
    StageKey.STORY_SETUP,
    StageKey.STORY_CORE,
    StageKey.WORLD_CAST,
    StageKey.PLOT_BLUEPRINT,
    StageKey.SCENE_PLAN,
    StageKey.FICTION_DRAFT,
    StageKey.EDITING,
  ].map((stageKey) => {
    const stage = findStage(book, stageKey);
    const link = stageLinks.find((entry) => entry.key === stageKey);
    return {
      key: stageKey,
      label: link?.label ?? stageKey,
      href: link?.href ?? `/books/${slug}`,
      description: link?.description ?? "",
      status: stage?.status ?? "NOT_STARTED",
    };
  });

  return (
    <div className="page-shell">
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Fiction cockpit for a planning-first, chapter-based co-writing workflow.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{book.titleWorking ?? "Untitled Novel"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Mode: <strong>Fiction</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Chapters drafted: <strong>{draftedChapters}/{plannedChapters || 0}</strong>
          </div>
        </div>

        <div className="stage-list">
          <Link href="/" className="stage-chip">
            Library
          </Link>
          {stageLinks.map((stage) => (
            <Link key={stage.key} href={stage.href} className="stage-chip">
              {stage.label}
            </Link>
          ))}
        </div>
      </aside>

      <main className="main-column">
        <section className="glass-panel topbar">
          <div>
            <div className="label">Fiction Dashboard</div>
            <h2>Story Cockpit</h2>
            <div className="muted">
              One place to see the novel’s premise, plot pressure, scene coverage, and draft readiness.
            </div>
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}/${nextStep.href}`}>
              {nextStep.label}
            </Link>
            <Link className="btn" href={`/books/${slug}/editing`}>
              Open Editing
            </Link>
            <Link className="btn" href={`/books/${slug}/publish`}>
              Open Publish
            </Link>
          </div>
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <div>
              <h3>Next Best Move</h3>
              <div className="muted">{nextStep.detail}</div>
            </div>
          </div>
          <div className="card" style={{ marginBottom: 18 }}>
            <strong>Workflow Automation</strong>
            <div className="muted" style={{ marginTop: 8 }}>
              {automation?.enabled
                ? "Autopilot is enabled. When a background stage finishes, GHOSTWRITR keeps advancing the workflow automatically."
                : "Autopilot is off. Use Run Autopilot to advance the next eligible fiction stage now."}
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Current mode: {(automation?.mode ?? "manual").replace(/_/g, " ")}
            </div>
            {automation?.lastSummary?.title ? (
              <div className="muted" style={{ marginTop: 8 }}>
                Latest: {automation.lastSummary.title} {automation.lastSummary.detail ? `- ${automation.lastSummary.detail}` : ""}
              </div>
            ) : null}
            <div className="button-row" style={{ marginTop: 12 }}>
              <form action={runWorkflowAutopilotAction.bind(null, slug)}>
                <button className="btn btn-primary" type="submit">Run Autopilot</button>
              </form>
              <form action={runWorkflowAutopilotModeAction.bind(null, slug)}>
                <input type="hidden" name="mode" value="run_to_full_draft" />
                <button className="btn" type="submit">Run To Full Draft</button>
              </form>
              {automation?.enabled ? (
                <form action={disableWorkflowAutomationAction.bind(null, slug)}>
                  <button className="btn" type="submit">Disable Autopilot</button>
                </form>
              ) : (
                <form action={enableWorkflowAutomationAction.bind(null, slug)}>
                  <button className="btn" type="submit">Enable Continuous Autopilot</button>
                </form>
              )}
            </div>
            <div className="button-row" style={{ marginTop: 12 }}>
              <form action={setWorkflowAutomationModeAction.bind(null, slug)}>
                <input type="hidden" name="mode" value="assisted" />
                <button className="btn" type="submit">Set Assisted Mode</button>
              </form>
              <form action={setWorkflowAutomationModeAction.bind(null, slug)}>
                <input type="hidden" name="mode" value="run_to_next_boundary" />
                <button className="btn" type="submit">Set Boundary Mode</button>
              </form>
            </div>
            {automation?.history && automation.history.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <strong>Automation History</strong>
                <div className="muted" style={{ marginTop: 8 }}>
                  {automation.history.slice(0, 5).map((entry) => (
                    <div key={`${entry.at ?? "unknown"}-${entry.title ?? "event"}`} style={{ marginTop: 6 }}>
                      {entry.title ?? "Workflow event"}
                      {entry.detail ? ` - ${entry.detail}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="card" style={{ marginBottom: 18 }}>
            <strong>Publish Handoff</strong>
            <div className="muted" style={{ marginTop: 8 }}>
              Status:{" "}
              {editingWorkspace.publishPackageSyncState.status === "synced"
                ? "Synced"
                : editingWorkspace.publishPackageSyncState.status === "stale"
                  ? "Refresh required"
                  : "Package missing"}
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              {editingWorkspace.publishPackageSyncState.detail}
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Final handoff:{" "}
              {editingWorkspace.finalHandoffState
                ? `Finalized ${new Date(editingWorkspace.finalHandoffState.finalizedAt).toLocaleString()}`
                : "Not finalized yet"}
            </div>
          </div>
          <div className="card" style={{ marginBottom: 18 }}>
            <strong>Draft Quality Watchlist</strong>
            {editingWorkspace.draftQualityRollup ? (
              <>
                <div className="muted" style={{ marginTop: 8 }}>
                  {editingWorkspace.draftQualityRollup.headline}
                </div>
                <div className="muted" style={{ marginTop: 8 }}>
                  Average score: {editingWorkspace.draftQualityRollup.averageScore}/100 • Revision flags:{" "}
                  {editingWorkspace.draftQualityRollup.chaptersNeedingRevision}
                </div>
                {editingWorkspace.draftQualityRollup.blockers.length > 0 ? (
                  <ul className="clean-list" style={{ marginTop: 10 }}>
                    {editingWorkspace.draftQualityRollup.blockers.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <div className="muted" style={{ marginTop: 8 }}>
                Draft quality telemetry will appear here once the current chapter drafts have been regenerated with scoring.
              </div>
            )}
          </div>
          <div className="manuscript-progress-grid">
            <div className="metric-card">
              <div className="label">Premise</div>
              <strong>{storyMemory.premise ?? "Not locked yet"}</strong>
            </div>
            <div className="metric-card">
              <div className="label">Theme</div>
              <strong>{storyMemory.theme ?? "Not locked yet"}</strong>
            </div>
            <div className="metric-card">
              <div className="label">Central Conflict</div>
              <strong>{storyMemory.centralConflict ?? "Not locked yet"}</strong>
            </div>
            <div className="metric-card">
              <div className="label">Draft Words</div>
              <strong>{draftWords.toLocaleString()}</strong>
            </div>
          </div>
        </section>

        <section className="glass-panel section-panel" style={{ marginTop: 24 }}>
          <div className="section-header">
            <div>
              <h3>Workflow Progress</h3>
              <div className="muted">The fiction pipeline remains separate from nonfiction and advances through its own artifacts.</div>
            </div>
          </div>
          <div className="idea-list">
            {stageCards.map((card) => (
              <article className="idea-card" key={card.key}>
                <strong>{card.label}</strong>
                <div className="muted" style={{ marginTop: 6 }}>{card.description}</div>
                <div className="pill-row" style={{ marginTop: 10 }}>
                  <div className="pill">Status: {card.status}</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Link className="btn" href={card.href}>
                    Open {card.label}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="workspace-grid" style={{ marginTop: 24, gridTemplateColumns: "1.1fr 0.9fr" }}>
          <section className="glass-panel section-panel">
            <div className="section-header">
              <div>
                <h3>Plot and Scene Coverage</h3>
                <div className="muted">A quick read on whether the planning stack is deep enough to support drafting.</div>
              </div>
            </div>
            <div className="manuscript-progress-grid">
              <div className="metric-card">
                <div className="label">Plot Chapters</div>
                <strong>{plotBlueprint?.chapterBeats.length ?? 0}</strong>
              </div>
              <div className="metric-card">
                <div className="label">Scenes Planned</div>
                <strong>{countScenePlanScenes(scenePlan)}</strong>
              </div>
              <div className="metric-card">
                <div className="label">Drafted Chapters</div>
                <strong>{draftedChapters}/{plannedChapters || 0}</strong>
              </div>
            </div>

            <div className="card" style={{ marginTop: 18 }}>
              <strong>Turning Points</strong>
              <ul className="clean-list" style={{ marginTop: 10 }}>
                {(plotBlueprint?.turningPoints ?? []).map((turningPoint, index) => (
                  <li key={`turning-point-${index}`}>{turningPoint}</li>
                ))}
              </ul>
            </div>

            <div className="idea-list" style={{ marginTop: 18 }}>
              {(plotBlueprint?.chapterBeats ?? []).slice(0, 6).map((beat) => (
                <article className="idea-card" key={`beat-${beat.chapterNumber}`}>
                  <strong>Chapter {beat.chapterNumber}: {beat.title}</strong>
                  <div className="muted" style={{ marginTop: 6 }}>{beat.beat}</div>
                  <div className="muted">POV: {beat.pointOfView}</div>
                  <div className="muted">Hook: {beat.hook}</div>
                </article>
              ))}
            </div>
          </section>

          <section className="glass-panel section-panel">
            <div className="section-header">
              <div>
                <h3>Cast and Continuity</h3>
                <div className="muted">The story memory the draft should keep alive from chapter to chapter.</div>
              </div>
            </div>

            <div className="card">
              <strong>Setting</strong>
              <div className="muted" style={{ marginTop: 8 }}>{storyMemory.setting ?? "Not set yet"}</div>
              <div className="muted" style={{ marginTop: 6 }}>{storyMemory.atmosphere ?? ""}</div>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <strong>Continuity Watchouts</strong>
              <ul className="clean-list" style={{ marginTop: 10 }}>
                {(scenePlan?.continuityRules ?? storyMemory.worldRules).map((rule, index) => (
                  <li key={`continuity-${index}`}>{rule}</li>
                ))}
              </ul>
            </div>

            <div className="idea-list" style={{ marginTop: 18 }}>
              {(storyMemory.characters ?? []).slice(0, 6).map((character) => (
                <article className="idea-card" key={`character-${character.name}`}>
                  <strong>{character.name}</strong>
                  <div className="muted">{character.role}</div>
                  <div className="muted" style={{ marginTop: 6 }}>Desire: {character.desire}</div>
                  <div className="muted">Pressure: {character.pressure}</div>
                </article>
              ))}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
