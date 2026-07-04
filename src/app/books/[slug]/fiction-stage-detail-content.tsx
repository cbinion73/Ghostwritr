import { StageKey } from "@prisma/client";

import {
  commitFictionStageAction,
  generateFictionStageAction,
  saveFictionStageAction,
} from "./fiction/actions";

import type {
  PlotBlueprintArtifact,
  ScenePlanArtifact,
  StoryCoreArtifact,
  StorySetupArtifact,
  WorldCastArtifact,
} from "@/lib/fiction-types";
import {
  countScenePlanScenes,
  getFictionStoryMemory,
} from "@/lib/fiction-presenters";
import { getFictionStageWorkspace } from "@/lib/workflows/fiction";
import {
  getStageArtifact,
  pageTitleForStage,
  renderPlotBlueprintWorkspace,
  renderScenePlanWorkspace,
  renderStoryCorePanel,
  renderStorySetupPanel,
  renderVersionsPanel,
  renderWorldCastPanel,
} from "./fiction-stage-page";

/**
 * Studio-native room for the five fiction planning stages (Story Setup,
 * Story Core, World & Cast, Plot Blueprint, Scene Plan). Reuses the same
 * panel renderers and workspace data as the retired standalone pages —
 * only the outer chrome (sidebar, page-shell, dashboard links) is dropped,
 * since Studio already provides stage nav.
 */
export async function FictionStageDetailContent({
  slug,
  stageKey,
  chapter,
}: {
  slug: string;
  stageKey: StageKey;
  chapter?: string;
}) {
  const workspace = await getFictionStageWorkspace(slug, stageKey);

  const storySetup =
    stageKey === StageKey.STORY_SETUP
      ? getStageArtifact<StorySetupArtifact>(workspace.latestArtifact, workspace.committedArtifact)
      : workspace.upstream.storySetup;
  const storyCore =
    stageKey === StageKey.STORY_CORE
      ? getStageArtifact<StoryCoreArtifact>(workspace.latestArtifact, workspace.committedArtifact)
      : workspace.upstream.storyCore;
  const worldCast =
    stageKey === StageKey.WORLD_CAST
      ? getStageArtifact<WorldCastArtifact>(workspace.latestArtifact, workspace.committedArtifact)
      : workspace.upstream.worldCast;
  const plotBlueprint =
    stageKey === StageKey.PLOT_BLUEPRINT
      ? getStageArtifact<PlotBlueprintArtifact>(workspace.latestArtifact, workspace.committedArtifact)
      : workspace.upstream.plotBlueprint;
  const scenePlan =
    stageKey === StageKey.SCENE_PLAN
      ? getStageArtifact<ScenePlanArtifact>(workspace.latestArtifact, workspace.committedArtifact)
      : workspace.upstream.scenePlan;

  const storyMemory = getFictionStoryMemory({ storySetup, storyCore, worldCast });

  const parsedChapter = Number(chapter ?? 0);
  const selectedChapterNumber = Number.isFinite(parsedChapter) && parsedChapter > 0 ? parsedChapter : null;

  let stageWorkspace = renderStorySetupPanel(storySetup);
  if (stageKey === StageKey.STORY_CORE) {
    stageWorkspace = renderStoryCorePanel(storyCore);
  } else if (stageKey === StageKey.WORLD_CAST) {
    stageWorkspace = renderWorldCastPanel(worldCast);
  } else if (stageKey === StageKey.PLOT_BLUEPRINT) {
    stageWorkspace = renderPlotBlueprintWorkspace(slug, plotBlueprint, selectedChapterNumber, storyMemory);
  } else if (stageKey === StageKey.SCENE_PLAN) {
    stageWorkspace = renderScenePlanWorkspace(
      slug,
      scenePlan,
      plotBlueprint ?? workspace.upstream.plotBlueprint,
      selectedChapterNumber,
      storyMemory,
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", minWidth: 0, padding: "14px 16px" }}>
      <section className="glass-panel topbar">
        <div>
          <div className="label">Fiction Stage</div>
          <h2>{pageTitleForStage(stageKey)}</h2>
          <div className="muted">{workspace.stageDefinition?.description}</div>
          {workspace.blockingReason ? (
            <div className="muted" style={{ marginTop: 10 }}>
              {workspace.blockingReason}
            </div>
          ) : null}
          {workspace.commitBlockedReason ? (
            <div className="muted" style={{ marginTop: 8 }}>
              {workspace.commitBlockedReason}
            </div>
          ) : null}
        </div>

        <div className="button-row">
          <form action={generateFictionStageAction.bind(null, slug)}>
            <input type="hidden" name="stageKey" value={stageKey} />
            <button className="btn" type="submit" disabled={Boolean(workspace.blockingReason)}>
              {workspace.latestArtifact ? "Regenerate" : "Generate"}
            </button>
          </form>
          <form action={commitFictionStageAction.bind(null, slug)}>
            <input type="hidden" name="stageKey" value={stageKey} />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={!workspace.latestArtifact || Boolean(workspace.blockingReason) || Boolean(workspace.commitBlockedReason)}
            >
              Commit Stage
            </button>
          </form>
        </div>
      </section>

      <section className="glass-panel section-panel" style={{ marginTop: 24, marginBottom: 24 }}>
        <div className="section-header">
          <div>
            <h3>Story Cockpit</h3>
            <div className="muted">The live novel state, so every stage stays connected to the same story memory.</div>
          </div>
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
            <div className="label">Plot Chapters</div>
            <strong>{plotBlueprint?.chapterBeats.length ?? 0}</strong>
          </div>
          <div className="metric-card">
            <div className="label">Scenes Planned</div>
            <strong>{countScenePlanScenes(scenePlan)}</strong>
          </div>
        </div>
      </section>

      {stageWorkspace}

      <section className="glass-panel section-panel" style={{ marginTop: 24 }}>
        <div className="section-header">
          <div>
            <h3>Artifact Lineage</h3>
            <div className="muted">Structured storage stays available, but it is now the fallback editor instead of the primary fiction UI.</div>
          </div>
        </div>
        {renderVersionsPanel(workspace)}
        <details style={{ marginTop: 18 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Advanced JSON Editor</summary>
          <div className="muted" style={{ marginTop: 10 }}>
            Use this only when you need direct control over the underlying structured artifact.
          </div>
          <form action={saveFictionStageAction.bind(null, slug)} className="stack" style={{ marginTop: 12 }}>
            <input type="hidden" name="stageKey" value={stageKey} />
            <textarea
              className="editor-textarea"
              name="sourceJson"
              defaultValue={workspace.sourceJson}
              style={{ minHeight: 420, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
            <button className="btn btn-primary" type="submit">
              Save Artifact
            </button>
          </form>
        </details>
      </section>
    </div>
  );
}
