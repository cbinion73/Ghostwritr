import Link from "next/link";
import { BookWorkflowType, StageKey } from "@prisma/client";

import {
  commitFictionStageAction,
  expandFictionDraftChapterTowardTargetAction,
  expandUnderTargetFictionDraftsAction,
  generateFictionDraftChapterAction,
  generateFictionStageAction,
  repairWeakFictionDraftsAction,
  saveFictionStageAction,
} from "./fiction/actions";

import type {
  FictionDraftArtifact,
  PlotBlueprintArtifact,
  ScenePlanArtifact,
  StoryCoreArtifact,
  StorySetupArtifact,
  WorldCastArtifact,
} from "@/lib/fiction-types";
import {
  countDraftedChapters,
  countScenePlanScenes,
  getFictionChapterNumbers,
  getFictionNextStep,
  getFictionStoryMemory,
  getSelectedDraftChapter,
  getSelectedPlotBeat,
  getSelectedSceneChapter,
  sumDraftWords,
} from "@/lib/fiction-presenters";
import { getFictionStageWorkspace } from "@/lib/workflows/fiction";

type StagePageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

type DraftQualitySignal = {
  label: string;
  state: "pass" | "warn" | "fail";
  detail: string;
};

type PersistedFictionDraftQuality = {
  score: number;
  readiness: "strong" | "watch" | "needs attention";
  revisionPasses: number;
  signals: DraftQualitySignal[];
};

export function pageTitleForStage(stageKey: StageKey) {
  switch (stageKey) {
    case StageKey.STORY_SETUP:
      return "Story Setup";
    case StageKey.STORY_CORE:
      return "Story Core";
    case StageKey.WORLD_CAST:
      return "World & Cast";
    case StageKey.PLOT_BLUEPRINT:
      return "Plot Blueprint";
    case StageKey.SCENE_PLAN:
      return "Scene Plan";
    case StageKey.FICTION_DRAFT:
      return "Draft";
    default:
      return "Fiction Stage";
  }
}

export function getStageArtifact<T>(latestArtifact: unknown, committedArtifact: unknown) {
  return (latestArtifact ?? committedArtifact ?? null) as T | null;
}

export function parseSelectedChapter(searchParams: Record<string, string | string[] | undefined> | undefined) {
  const raw = searchParams?.chapter;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveActiveChapterNumber(chapterNumbers: number[], selectedChapterNumber: number | null) {
  if (selectedChapterNumber && chapterNumbers.includes(selectedChapterNumber)) {
    return selectedChapterNumber;
  }

  return chapterNumbers[0] ?? null;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function countSceneMentions(text: string, sceneTitles: string[]) {
  const body = normalizeText(text);
  return sceneTitles.filter((title) => {
    const firstWord = title.split(/\W+/).find(Boolean);
    return firstWord ? body.includes(firstWord.toLowerCase()) : false;
  }).length;
}

function buildFictionDraftQuality(args: {
  persistedQuality?: PersistedFictionDraftQuality | null;
  draftText: string;
  draftWordCount: number;
  draftPointOfView: string | null | undefined;
  targetWords: number | null | undefined;
  plannedPointOfView: string | null | undefined;
  plannedScenes: { title: string }[];
  plannedConflict: string | null | undefined;
  characterNames: string[];
}) {
  if (args.persistedQuality && args.persistedQuality.signals.length > 0) {
    return args.persistedQuality;
  }

  const signals: DraftQualitySignal[] = [];
  const targetWords = args.targetWords ?? null;
  const lowerBound = targetWords ? Math.max(250, Math.round(targetWords * 0.82)) : null;
  const upperBound = targetWords ? Math.round(targetWords * 1.18) : null;

  signals.push({
    label: "Length fit",
    state:
      lowerBound == null || upperBound == null
        ? "warn"
        : args.draftWordCount < lowerBound || args.draftWordCount > upperBound
          ? "fail"
          : "pass",
    detail:
      targetWords == null
        ? "No chapter target is locked yet."
        : `${args.draftWordCount.toLocaleString()} words against a ${(lowerBound ?? 0).toLocaleString()}-${(upperBound ?? 0).toLocaleString()} target band.`,
  });

  signals.push({
    label: "POV continuity",
    state:
      !args.plannedPointOfView
        ? "warn"
        : normalizeText(args.draftPointOfView) === normalizeText(args.plannedPointOfView)
          ? "pass"
          : "fail",
    detail: args.plannedPointOfView
      ? `Planned POV is ${args.plannedPointOfView}; draft POV is ${args.draftPointOfView || "not declared"}.`
      : "No planned POV is available for this chapter.",
  });

  const mentionedScenes = countSceneMentions(
    args.draftText,
    args.plannedScenes.map((scene) => scene.title),
  );
  signals.push({
    label: "Scene carry-through",
    state:
      args.plannedScenes.length === 0
        ? "warn"
        : mentionedScenes >= Math.max(1, Math.ceil(args.plannedScenes.length / 2))
          ? "pass"
          : mentionedScenes > 0
            ? "warn"
            : "fail",
    detail:
      args.plannedScenes.length === 0
        ? "No planned scenes are available to compare against."
        : `${mentionedScenes} of ${args.plannedScenes.length} planned scene anchors echo back in the draft.`,
  });

  const body = normalizeText(args.draftText);
  const matchingCharacters = args.characterNames.filter((name) => body.includes(name.toLowerCase())).length;
  signals.push({
    label: "Story memory",
    state:
      matchingCharacters >= 2
        ? "pass"
        : matchingCharacters === 1 || !args.plannedConflict
          ? "warn"
          : "fail",
    detail:
      matchingCharacters > 0
        ? `${matchingCharacters} cast anchors show up in the prose, helping continuity stick.`
        : "The prose is not obviously carrying forward cast or conflict anchors yet.",
  });

  const score = Math.max(
    0,
    100 -
      signals.reduce(
        (sum, signal) => sum + (signal.state === "fail" ? 24 : signal.state === "warn" ? 10 : 0),
        0,
      ),
  );

  return {
    score,
    readiness: (score >= 85 ? "strong" : score >= 65 ? "watch" : "needs attention") as PersistedFictionDraftQuality["readiness"],
    signals,
    revisionPasses: 0,
  };
}

function isInsideTargetBand(wordCount: number, targetWords: number | null | undefined) {
  if (!targetWords) {
    return true;
  }

  const lowerBound = Math.max(250, Math.round(targetWords * 0.82));
  const upperBound = Math.round(targetWords * 1.18);
  return wordCount >= lowerBound && wordCount <= upperBound;
}

function buildFictionContinuityWatchlist(args: {
  quality: PersistedFictionDraftQuality | null;
  chapterBeat:
    | {
        conflict?: string | null;
        turn?: string | null;
        hook?: string | null;
      }
    | null;
  sceneChapter:
    | {
        bridge: string;
        scenes: Array<{ objective: string; reveal: string; conflict: string }>;
      }
    | null;
  storyMemory: ReturnType<typeof getFictionStoryMemory>;
}) {
  const watchlist = new Set<string>();

  for (const signal of args.quality?.signals ?? []) {
    if (signal.state !== "pass") {
      watchlist.add(`${signal.label}: ${signal.detail}`);
    }
  }

  if (args.chapterBeat?.conflict) {
    watchlist.add(`Keep the chapter conflict alive on the page: ${args.chapterBeat.conflict}`);
  }
  if (args.chapterBeat?.turn) {
    watchlist.add(`The chapter turn still needs to land clearly by the end of the prose: ${args.chapterBeat.turn}`);
  }
  if (args.sceneChapter?.bridge) {
    watchlist.add(`Make the chapter bridge visible enough that the next chapter feels inevitable: ${args.sceneChapter.bridge}`);
  }

  for (const scene of args.sceneChapter?.scenes.slice(0, 2) ?? []) {
    watchlist.add(`Scene pressure check: ${scene.objective} | reveal: ${scene.reveal} | conflict: ${scene.conflict}`);
  }

  for (const rule of args.storyMemory.worldRules.slice(0, 2)) {
    watchlist.add(`World pressure to keep alive: ${rule}`);
  }

  for (const character of args.storyMemory.characters.slice(0, 2)) {
    watchlist.add(`Relationship pressure to preserve through ${character.name}: ${character.role}`);
  }

  return Array.from(watchlist).slice(0, 6);
}

export function renderStorySetupPanel(storySetup: StorySetupArtifact | null) {
  if (!storySetup) {
    return <div className="empty-state">Generate the story foundation to lock the novel’s core setup.</div>;
  }

  return (
    <div className="stack">
      <div className="card">
        <strong>Premise</strong>
        <div className="muted" style={{ marginTop: 8 }}>{storySetup.premise}</div>
      </div>
      <div className="pill-row">
        <div className="pill">Genre: {storySetup.genre}</div>
        <div className="pill">Tone: {storySetup.tone}</div>
        <div className="pill">POV: {storySetup.pointOfView}</div>
        <div className="pill">Tense: {storySetup.tense}</div>
      </div>
      <div className="card">
        <strong>Story Question</strong>
        <div className="muted" style={{ marginTop: 8 }}>{storySetup.storyQuestion}</div>
      </div>
      <div className="card">
        <strong>Target Reader</strong>
        <div className="muted" style={{ marginTop: 8 }}>{storySetup.targetAudience}</div>
      </div>
    </div>
  );
}

export function renderStoryCorePanel(storyCore: StoryCoreArtifact | null) {
  if (!storyCore) {
    return <div className="empty-state">Generate Story Core to define the novel’s emotional and dramatic engine.</div>;
  }

  return (
    <div className="stack">
      <div className="card">
        <strong>Theme</strong>
        <div className="muted" style={{ marginTop: 8 }}>{storyCore.theme}</div>
      </div>
      <div className="card">
        <strong>Central Conflict</strong>
        <div className="muted" style={{ marginTop: 8 }}>{storyCore.centralConflict}</div>
      </div>
      <div className="card">
        <strong>Transformation Arc</strong>
        <div className="muted" style={{ marginTop: 8 }}>{storyCore.transformationArc}</div>
      </div>
      <div className="pill-row">
        <div className="pill">Protagonist: {storyCore.protagonist}</div>
        <div className="pill">Antagonist Force: {storyCore.antagonistForce}</div>
        <div className="pill">Stakes: {storyCore.stakes}</div>
      </div>
    </div>
  );
}

export function renderWorldCastPanel(worldCast: WorldCastArtifact | null) {
  if (!worldCast) {
    return <div className="empty-state">Generate World & Cast to define the novel’s pressure environment.</div>;
  }

  return (
    <div className="stack">
      <div className="card">
        <strong>Setting</strong>
        <div className="muted" style={{ marginTop: 8 }}>{worldCast.setting}</div>
      </div>
      <div className="card">
        <strong>Atmosphere</strong>
        <div className="muted" style={{ marginTop: 8 }}>{worldCast.atmosphere}</div>
      </div>
      <div className="card">
        <strong>World Rules</strong>
        <ul className="clean-list" style={{ marginTop: 10 }}>
          {worldCast.worldRules.map((rule, index) => (
            <li key={`rule-${index}`}>{rule}</li>
          ))}
        </ul>
      </div>
      <div className="idea-list">
        {worldCast.characters.map((character) => (
          <article className="idea-card" key={character.name}>
            <strong>{character.name}</strong>
            <div className="muted">{character.role}</div>
            <div className="muted" style={{ marginTop: 6 }}>Desire: {character.desire}</div>
            <div className="muted">Flaw: {character.flaw}</div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function renderPlotBlueprintWorkspace(
  slug: string,
  plotBlueprint: PlotBlueprintArtifact | null,
  selectedChapterNumber: number | null,
  storyMemory: ReturnType<typeof getFictionStoryMemory>,
) {
  if (!plotBlueprint) {
    return <div className="empty-state">Generate the plot blueprint to shape the novel chapter by chapter.</div>;
  }

  const chapterNumbers = getFictionChapterNumbers({ plotBlueprint });
  const activeChapterNumber = resolveActiveChapterNumber(chapterNumbers, selectedChapterNumber);
  const selectedBeat = getSelectedPlotBeat(plotBlueprint, activeChapterNumber);

  return (
    <section className="workspace-grid" style={{ gridTemplateColumns: "0.8fr 1.25fr 0.95fr" }}>
      <section className="glass-panel section-panel">
        <div className="section-header">
          <div>
            <h3>Chapter Beat Map</h3>
            <div className="muted">{plotBlueprint.chapterBeats.length} chapters mapped across {plotBlueprint.actSummaries.length} acts.</div>
          </div>
        </div>
        <div className="stack">
          {plotBlueprint.chapterBeats.map((beat) => (
            <Link
              key={beat.chapterNumber}
              href={`/books/${slug}/plot-blueprint?chapter=${beat.chapterNumber}`}
              className={`idea-card ${beat.chapterNumber === activeChapterNumber ? "active" : ""}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <strong>Chapter {beat.chapterNumber}: {beat.title}</strong>
              <div className="muted" style={{ marginTop: 6 }}>{beat.beat}</div>
              <div className="muted" style={{ marginTop: 6 }}>{beat.targetWords.toLocaleString()} words</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="glass-panel section-panel">
        <div className="section-header">
          <div>
            <h3>{selectedBeat ? `Chapter ${selectedBeat.chapterNumber}: ${selectedBeat.title}` : "Plot Blueprint"}</h3>
            <div className="muted">Organic chapter architecture before scene-level planning begins.</div>
          </div>
        </div>

        {selectedBeat ? (
          <div className="stack">
            <div className="card">
              <strong>Beat</strong>
              <div className="muted" style={{ marginTop: 8 }}>{selectedBeat.beat}</div>
            </div>
            <div className="pill-row">
              <div className="pill">POV: {selectedBeat.pointOfView}</div>
              <div className="pill">Target: {selectedBeat.targetWords.toLocaleString()} words</div>
            </div>
            <div className="card">
              <strong>Purpose</strong>
              <div className="muted" style={{ marginTop: 8 }}>{selectedBeat.purpose}</div>
            </div>
            <div className="card">
              <strong>Conflict</strong>
              <div className="muted" style={{ marginTop: 8 }}>{selectedBeat.conflict}</div>
            </div>
            <div className="card">
              <strong>Turn</strong>
              <div className="muted" style={{ marginTop: 8 }}>{selectedBeat.turn}</div>
            </div>
            <div className="card">
              <strong>Hook</strong>
              <div className="muted" style={{ marginTop: 8 }}>{selectedBeat.hook}</div>
            </div>
          </div>
        ) : (
          <div className="empty-state">Select a chapter beat to inspect the story architecture.</div>
        )}
      </section>

      <section className="glass-panel section-panel">
        <div className="section-header">
          <div>
            <h3>Story Memory</h3>
            <div className="muted">The story engine that each beat must serve.</div>
          </div>
        </div>
        <div className="card">
          <strong>Theme</strong>
          <div className="muted" style={{ marginTop: 8 }}>{storyMemory.theme ?? "Not set yet"}</div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <strong>Central Conflict</strong>
          <div className="muted" style={{ marginTop: 8 }}>{storyMemory.centralConflict ?? "Not set yet"}</div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <strong>Turning Points</strong>
          <ul className="clean-list" style={{ marginTop: 10 }}>
            {plotBlueprint.turningPoints.map((turningPoint, index) => (
              <li key={`turning-point-${index}`}>{turningPoint}</li>
            ))}
          </ul>
        </div>
      </section>
    </section>
  );
}

export function renderScenePlanWorkspace(
  slug: string,
  scenePlan: ScenePlanArtifact | null,
  plotBlueprint: PlotBlueprintArtifact | null,
  selectedChapterNumber: number | null,
  storyMemory: ReturnType<typeof getFictionStoryMemory>,
) {
  if (!scenePlan) {
    return <div className="empty-state">Generate the scene plan to turn chapter beats into a draftable sequence.</div>;
  }

  const chapterNumbers = getFictionChapterNumbers({ scenePlan, plotBlueprint });
  const activeChapterNumber = resolveActiveChapterNumber(chapterNumbers, selectedChapterNumber);
  const selectedChapter = getSelectedSceneChapter(scenePlan, activeChapterNumber);
  const selectedBeat = getSelectedPlotBeat(plotBlueprint, activeChapterNumber);

  return (
    <section className="workspace-grid" style={{ gridTemplateColumns: "0.8fr 1.25fr 0.95fr" }}>
      <section className="glass-panel section-panel">
        <div className="section-header">
          <div>
            <h3>Chapter Scene Map</h3>
            <div className="muted">{scenePlan.chapters.length} chapters and {countScenePlanScenes(scenePlan)} scenes planned.</div>
          </div>
        </div>
        <div className="stack">
          {scenePlan.chapters.map((chapter) => (
            <Link
              key={chapter.chapterNumber}
              href={`/books/${slug}/scene-plan?chapter=${chapter.chapterNumber}`}
              className={`idea-card ${chapter.chapterNumber === activeChapterNumber ? "active" : ""}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <strong>Chapter {chapter.chapterNumber}: {chapter.title}</strong>
              <div className="muted" style={{ marginTop: 6 }}>{chapter.summary}</div>
              <div className="muted" style={{ marginTop: 6 }}>{chapter.scenes.length} scenes • {chapter.targetWords.toLocaleString()} words</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="glass-panel section-panel">
        <div className="section-header">
          <div>
            <h3>{selectedChapter ? `Chapter ${selectedChapter.chapterNumber}: ${selectedChapter.title}` : "Scene Plan"}</h3>
            <div className="muted">Scene-by-scene continuity and momentum for the selected chapter.</div>
          </div>
          {selectedChapter ? (
            <Link className="btn" href={`/books/${slug}/draft?chapter=${selectedChapter.chapterNumber}`}>
              Open Draft Workspace
            </Link>
          ) : null}
        </div>

        {selectedChapter ? (
          <div className="stack">
            <div className="pill-row">
              <div className="pill">POV: {selectedChapter.pointOfView}</div>
              <div className="pill">Target: {selectedChapter.targetWords.toLocaleString()} words</div>
              <div className="pill">{selectedChapter.scenes.length} scenes</div>
            </div>
            <div className="card">
              <strong>Chapter Purpose</strong>
              <div className="muted" style={{ marginTop: 8 }}>{selectedChapter.purpose}</div>
            </div>
            <div className="card">
              <strong>Chapter Summary</strong>
              <div className="muted" style={{ marginTop: 8 }}>{selectedChapter.summary}</div>
            </div>
            {selectedBeat ? (
              <div className="card">
                <strong>Inherited Beat</strong>
                <div className="muted" style={{ marginTop: 8 }}>{selectedBeat.beat}</div>
              </div>
            ) : null}
            <div className="idea-list">
              {selectedChapter.scenes.map((scene) => (
                <article className="idea-card" key={`${selectedChapter.chapterNumber}-${scene.sceneNumber}`}>
                  <strong>Scene {scene.sceneNumber}: {scene.title}</strong>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {scene.location} • {scene.pointOfView}
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>Objective: {scene.objective}</div>
                  <div className="muted">Conflict: {scene.conflict}</div>
                  <div className="muted">Outcome: {scene.outcome}</div>
                  <div className="muted">Reveal: {scene.reveal}</div>
                  <div className="muted">Bridge: {scene.bridge}</div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state">Select a chapter to inspect its scene progression.</div>
        )}
      </section>

      <section className="glass-panel section-panel">
        <div className="section-header">
          <div>
            <h3>Story Memory</h3>
            <div className="muted">This context should stay alive while drafting scenes into prose.</div>
          </div>
        </div>
        <div className="card">
          <strong>Continuity Rules</strong>
          <ul className="clean-list" style={{ marginTop: 10 }}>
            {scenePlan.continuityRules.map((rule, index) => (
              <li key={`continuity-rule-${index}`}>{rule}</li>
            ))}
          </ul>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <strong>World Rules</strong>
          <ul className="clean-list" style={{ marginTop: 10 }}>
            {storyMemory.worldRules.map((rule, index) => (
              <li key={`world-rule-${index}`}>{rule}</li>
            ))}
          </ul>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <strong>Core Pressure</strong>
          <div className="muted" style={{ marginTop: 8 }}>{storyMemory.centralConflict ?? "Not set yet"}</div>
        </div>
      </section>
    </section>
  );
}

function renderDraftWorkspace(
  slug: string,
  draft: FictionDraftArtifact | null,
  scenePlan: ScenePlanArtifact | null,
  plotBlueprint: PlotBlueprintArtifact | null,
  selectedChapterNumber: number | null,
  storyMemory: ReturnType<typeof getFictionStoryMemory>,
) {
  const chapterNumbers = getFictionChapterNumbers({ draft, scenePlan, plotBlueprint });
  const activeChapterNumber = resolveActiveChapterNumber(chapterNumbers, selectedChapterNumber);
  const selectedDraft = getSelectedDraftChapter(draft, activeChapterNumber);
  const selectedSceneChapter = getSelectedSceneChapter(scenePlan, activeChapterNumber);
  const selectedBeat = getSelectedPlotBeat(plotBlueprint, activeChapterNumber);
  const draftedChapters = countDraftedChapters(draft);
  const plannedChapters = scenePlan?.chapters.length ?? 0;
  const selectedQuality =
    selectedDraft?.text.trim()
      ? buildFictionDraftQuality({
          persistedQuality: selectedDraft.quality,
          draftText: selectedDraft.text,
          draftWordCount: selectedDraft.wordCount,
          draftPointOfView: selectedDraft.pointOfView,
          targetWords: selectedSceneChapter?.targetWords ?? selectedBeat?.targetWords ?? null,
          plannedPointOfView: selectedSceneChapter?.pointOfView ?? selectedBeat?.pointOfView ?? null,
          plannedScenes: selectedSceneChapter?.scenes ?? [],
          plannedConflict: selectedBeat?.conflict ?? selectedSceneChapter?.purpose ?? null,
          characterNames: storyMemory.characters.map((character) => character.name).slice(0, 6),
        })
        : null;
  const selectedTargetWords = selectedSceneChapter?.targetWords ?? selectedBeat?.targetWords ?? null;
  const selectedUnderTarget =
    Boolean(selectedDraft?.text.trim()) &&
    selectedTargetWords != null &&
    !isInsideTargetBand(selectedDraft?.wordCount ?? 0, selectedTargetWords) &&
    (selectedDraft?.wordCount ?? 0) < Math.max(250, Math.round(selectedTargetWords * 0.82));
  const continuityWatchlist =
    activeChapterNumber && selectedSceneChapter
      ? buildFictionContinuityWatchlist({
          quality: selectedQuality,
          chapterBeat: selectedBeat,
          sceneChapter: {
            bridge: selectedSceneChapter.scenes.at(-1)?.bridge ?? "",
            scenes: selectedSceneChapter.scenes,
          },
          storyMemory,
        })
      : [];

  return (
    <section className="workspace-grid" style={{ gridTemplateColumns: "0.82fr 1.28fr 0.9fr" }}>
      <section className="glass-panel section-panel">
        <div className="section-header">
          <div>
            <h3>Draft Progress</h3>
            <div className="muted">{draftedChapters}/{plannedChapters || chapterNumbers.length} chapters currently have prose.</div>
          </div>
        </div>
        <div className="stack">
          {chapterNumbers.map((chapterNumber) => {
            const chapterDraft = getSelectedDraftChapter(draft, chapterNumber);
            const chapterPlan = getSelectedSceneChapter(scenePlan, chapterNumber);
            const hasText = Boolean(chapterDraft?.text.trim());
            const chapterQuality =
              chapterDraft?.text.trim()
                ? buildFictionDraftQuality({
                    persistedQuality: chapterDraft?.quality ?? null,
                    draftText: chapterDraft.text,
                    draftWordCount: chapterDraft.wordCount,
                    draftPointOfView: chapterDraft.pointOfView,
                    targetWords: chapterPlan?.targetWords ?? getSelectedPlotBeat(plotBlueprint, chapterNumber)?.targetWords ?? null,
                    plannedPointOfView: chapterPlan?.pointOfView ?? getSelectedPlotBeat(plotBlueprint, chapterNumber)?.pointOfView ?? null,
                    plannedScenes: chapterPlan?.scenes ?? [],
                    plannedConflict:
                      getSelectedPlotBeat(plotBlueprint, chapterNumber)?.conflict ?? chapterPlan?.purpose ?? null,
                    characterNames: storyMemory.characters.map((character) => character.name).slice(0, 6),
                  })
                : null;
            return (
              <div className="idea-card" key={`draft-nav-${chapterNumber}`}>
                <Link
                  href={`/books/${slug}/draft?chapter=${chapterNumber}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <strong>Chapter {chapterNumber}: {chapterDraft?.title ?? chapterPlan?.title ?? "Untitled Chapter"}</strong>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {hasText
                      ? `${chapterDraft?.wordCount.toLocaleString()} words drafted`
                      : "Ready to draft from scene plan"}
                  </div>
                </Link>
                {chapterQuality ? (
                  <div className="muted" style={{ marginTop: 6 }}>
                    Quality: {chapterQuality.score}/100 • {chapterQuality.readiness}
                  </div>
                ) : null}
                <div className="button-row" style={{ marginTop: 10 }}>
                  <form action={generateFictionDraftChapterAction.bind(null, slug)}>
                    <input type="hidden" name="chapterNumber" value={chapterNumber} />
                    <button className="btn" type="submit">
                      {hasText ? "Regenerate Chapter" : "Draft This Chapter"}
                    </button>
                  </form>
                  <form action={expandFictionDraftChapterTowardTargetAction.bind(null, slug)}>
                    <input type="hidden" name="chapterNumber" value={chapterNumber} />
                    <button
                      className="btn"
                      type="submit"
                      disabled={
                        !hasText ||
                        isInsideTargetBand(
                          chapterDraft?.wordCount ?? 0,
                          chapterPlan?.targetWords ?? getSelectedPlotBeat(plotBlueprint, chapterNumber)?.targetWords ?? null,
                        )
                      }
                    >
                      Expand Toward Target
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass-panel section-panel">
        <div className="section-header">
          <div>
            <h3>
              {activeChapterNumber ? `Chapter ${activeChapterNumber}` : "Draft Workspace"}
              {selectedDraft?.title ? `: ${selectedDraft.title}` : selectedSceneChapter?.title ? `: ${selectedSceneChapter.title}` : ""}
            </h3>
            <div className="muted">The draft sits at the center, with planning context visible beside it.</div>
          </div>
          {activeChapterNumber ? (
            <div className="button-row">
              <form action={generateFictionDraftChapterAction.bind(null, slug)}>
                <input type="hidden" name="chapterNumber" value={activeChapterNumber} />
                <button className="btn" type="submit">
                  {selectedDraft?.text.trim() ? "Regenerate This Chapter" : "Generate This Chapter"}
                </button>
              </form>
              <form action={expandFictionDraftChapterTowardTargetAction.bind(null, slug)}>
                <input type="hidden" name="chapterNumber" value={activeChapterNumber} />
                <button className="btn" type="submit" disabled={!selectedUnderTarget}>
                  Expand Toward Target
                </button>
              </form>
              <form action={expandUnderTargetFictionDraftsAction.bind(null, slug)}>
                <input type="hidden" name="limit" value="2" />
                <button className="btn" type="submit">
                  Expand Under-Target Chapters
                </button>
              </form>
            </div>
          ) : null}
        </div>

        {selectedDraft?.text.trim() ? (
          <div className="stack">
            <div className="pill-row">
              <div className="pill">POV: {selectedDraft.pointOfView}</div>
              <div className="pill">{selectedDraft.wordCount.toLocaleString()} words</div>
              {selectedQuality ? (
                <div className="pill">Quality: {selectedQuality.score}/100</div>
              ) : null}
              {selectedQuality ? (
                <div className="pill">Revision passes: {selectedQuality.revisionPasses}</div>
              ) : null}
              {selectedTargetWords != null ? (
                <div className="pill">Target: {selectedTargetWords.toLocaleString()} words</div>
              ) : null}
            </div>
            {selectedUnderTarget ? (
              <div className="card">
                <strong>Length Recovery Recommended</strong>
                <div className="muted" style={{ marginTop: 8 }}>
                  This chapter is materially short for its planned target. Use <strong>Expand Toward Target</strong> to add finished scene prose before moving the novel forward.
                </div>
              </div>
            ) : null}
            <div className="card">
              <strong>Chapter Summary</strong>
              <div className="muted" style={{ marginTop: 8 }}>{selectedDraft.summary}</div>
            </div>
            {selectedQuality ? (
              <div className="card">
                <strong>Quality Signals</strong>
                <ul className="clean-list" style={{ marginTop: 10 }}>
                  {selectedQuality.signals.map((signal) => (
                    <li key={signal.label}>
                      <strong>{signal.label}</strong>: {signal.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="card" style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
              {selectedDraft.text}
            </div>
          </div>
        ) : activeChapterNumber && selectedSceneChapter ? (
          <div className="empty-state">
            This chapter is planned but not yet drafted. Use <strong>Generate This Chapter</strong> to turn the committed scene plan into prose without rerunning the whole novel.
          </div>
        ) : (
          <div className="empty-state">Generate the full draft or select a chapter to draft scene-by-scene.</div>
        )}
      </section>

      <section className="glass-panel section-panel">
        <div className="section-header">
          <div>
            <h3>Story Memory</h3>
            <div className="muted">The continuity rail for the currently selected chapter.</div>
          </div>
        </div>
        <div className="card">
          <strong>Story Promise</strong>
          <div className="muted" style={{ marginTop: 8 }}>{storyMemory.storyPromise ?? "Not set yet"}</div>
        </div>
        {selectedBeat ? (
          <div className="card" style={{ marginTop: 14 }}>
            <strong>Chapter Beat</strong>
            <div className="muted" style={{ marginTop: 8 }}>{selectedBeat.beat}</div>
            <div className="muted" style={{ marginTop: 8 }}>Conflict: {selectedBeat.conflict}</div>
            <div className="muted">Turn: {selectedBeat.turn}</div>
            <div className="muted">Hook: {selectedBeat.hook}</div>
          </div>
        ) : null}
        {selectedSceneChapter ? (
          <div className="card" style={{ marginTop: 14 }}>
            <strong>Scene Sequence</strong>
            <ul className="clean-list" style={{ marginTop: 10 }}>
              {selectedSceneChapter.scenes.map((scene) => (
                <li key={`draft-scene-${scene.sceneNumber}`}>
                  <div>
                    Scene {scene.sceneNumber}: {scene.objective} ({scene.location})
                  </div>
                  <form
                    action={generateFictionDraftChapterAction.bind(null, slug)}
                    style={{ marginTop: 6 }}
                  >
                    <input type="hidden" name="chapterNumber" value={selectedSceneChapter.chapterNumber} />
                    <input type="hidden" name="sceneNumber" value={scene.sceneNumber} />
                    <button className="btn" type="submit">
                      Rewrite Scene Focus
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="card" style={{ marginTop: 14 }}>
          <strong>Cast in Memory</strong>
          <ul className="clean-list" style={{ marginTop: 10 }}>
            {storyMemory.characters.slice(0, 5).map((character) => (
              <li key={`memory-character-${character.name}`}>{character.name}: {character.role}</li>
            ))}
          </ul>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <strong>Continuity Watchlist</strong>
          {continuityWatchlist.length > 0 ? (
            <ul className="clean-list" style={{ marginTop: 10 }}>
              {continuityWatchlist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <div className="muted" style={{ marginTop: 8 }}>
              Generate or select a chapter to see the highest-pressure continuity checks for the next rewrite pass.
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

export function renderVersionsPanel(workspace: Awaited<ReturnType<typeof getFictionStageWorkspace>>) {
  return (
    <div className="card">
      <div className="label">Versions</div>
      <ul className="clean-list">
        {workspace.versions.length > 0 ? (
          workspace.versions.map((version) => (
            <li key={version.id}>
              v{version.versionNumber} • {version.lifecycleState} • {new Date(version.createdAt).toLocaleString()}
            </li>
          ))
        ) : (
          <li>No saved versions yet.</li>
        )}
      </ul>
    </div>
  );
}

export async function renderFictionStagePage(
  {
    params,
    searchParams,
  }: StagePageProps,
  stageKey: StageKey,
) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
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
  const draft =
    stageKey === StageKey.FICTION_DRAFT
      ? getStageArtifact<FictionDraftArtifact>(workspace.latestArtifact, workspace.committedArtifact)
      : workspace.upstream.draft;

  const storyMemory = getFictionStoryMemory({
    storySetup,
    storyCore,
    worldCast,
  });
  const nextStep = getFictionNextStep({
    storySetup: workspace.upstream.storySetup,
    storyCore: workspace.upstream.storyCore,
    worldCast: workspace.upstream.worldCast,
    plotBlueprint: workspace.upstream.plotBlueprint,
    scenePlan: workspace.upstream.scenePlan,
    draft: workspace.upstream.draft ?? draft,
  });
  const selectedChapterNumber = parseSelectedChapter(resolvedSearchParams);
  const weakDraftChapters =
    stageKey === StageKey.FICTION_DRAFT
      ? getFictionChapterNumbers({ draft, scenePlan: workspace.upstream.scenePlan, plotBlueprint: workspace.upstream.plotBlueprint }).filter((chapterNumber) => {
          const chapterDraft = getSelectedDraftChapter(draft, chapterNumber);
          return Boolean(
            chapterDraft?.text.trim() &&
              (
                !chapterDraft.quality ||
                chapterDraft.quality.signals.length === 0 ||
                chapterDraft.quality.needsRevision
              ),
          );
        }).length
      : 0;

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
  } else if (stageKey === StageKey.FICTION_DRAFT) {
    stageWorkspace = renderDraftWorkspace(
      slug,
      draft,
      workspace.upstream.scenePlan,
      workspace.upstream.plotBlueprint,
      selectedChapterNumber,
      storyMemory,
    );
  }

  return (
    <div className="page-shell">
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Fiction workflow for novel-length, planning-first, chapter-based co-writing.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Workflow: <strong>{workspace.book.workflowType === BookWorkflowType.FICTION ? "Fiction" : "Nonfiction"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Stage: <strong>{workspace.stage?.status ?? "NOT_STARTED"}</strong>
          </div>
          {workspace.draftMetrics ? (
            <div style={{ marginTop: 6 }}>
              Draft coverage: <strong>{workspace.draftMetrics.draftedChapters}/{workspace.draftMetrics.plannedChapters}</strong>
            </div>
          ) : null}
        </div>

        <div className="stage-list">
          <Link href="/" className="stage-chip">
            Library
          </Link>
          <Link href={`/books/${slug}/dashboard`} className="stage-chip">
            Story Dashboard
          </Link>
          {workspace.stageLinks.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href}
              className={`stage-chip ${stage.key === stageKey ? "active" : ""}`}
            >
              {stage.label}
            </Link>
          ))}
        </div>
      </aside>

      <main className="main-column">
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
            <Link className="btn" href={`/books/${slug}/dashboard`}>
              Open Story Dashboard
            </Link>
            {(stageKey === StageKey.PLOT_BLUEPRINT || stageKey === StageKey.SCENE_PLAN) ? (
              <Link className="btn" href={`/books/${slug}/draft`}>
                Open Draft
              </Link>
            ) : null}
            {stageKey === StageKey.FICTION_DRAFT ? (
              <Link className="btn" href={`/books/${slug}/editing`}>
                Open Editing
              </Link>
            ) : null}
            <form action={generateFictionStageAction.bind(null, slug)}>
              <input type="hidden" name="stageKey" value={stageKey} />
              <button className="btn" type="submit" disabled={Boolean(workspace.blockingReason)}>
                {stageKey === StageKey.FICTION_DRAFT
                  ? workspace.latestArtifact ? "Regenerate Full Draft" : "Generate Full Draft"
                  : workspace.latestArtifact ? "Regenerate" : "Generate"}
              </button>
            </form>
            {stageKey === StageKey.FICTION_DRAFT ? (
              <form action={repairWeakFictionDraftsAction.bind(null, slug)}>
                <input type="hidden" name="limit" value="3" />
                <button className="btn" type="submit" disabled={weakDraftChapters === 0}>
                  Repair Weak Chapters
                </button>
              </form>
            ) : null}
            <form action={commitFictionStageAction.bind(null, slug)}>
              <input type="hidden" name="stageKey" value={stageKey} />
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!workspace.latestArtifact || Boolean(workspace.blockingReason) || Boolean(workspace.commitBlockedReason)}
              >
                {stageKey === StageKey.FICTION_DRAFT ? "Commit Draft" : "Commit Stage"}
              </button>
            </form>
          </div>
        </section>

        <section className="glass-panel section-panel" style={{ marginBottom: 24 }}>
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
            <div className="metric-card">
              <div className="label">Draft Words</div>
              <strong>{sumDraftWords(draft).toLocaleString()}</strong>
            </div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <strong>Next Best Move</strong>
            <div className="muted" style={{ marginTop: 8 }}>{nextStep.detail}</div>
            <div style={{ marginTop: 12 }}>
              <Link className="btn" href={`/books/${slug}/${nextStep.href}`}>
                {nextStep.label}
              </Link>
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
      </main>
    </div>
  );
}
