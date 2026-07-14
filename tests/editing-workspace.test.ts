import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildDraftQualityRollup,
  buildExcerpt,
  computeEditorialReadinessGate,
  EDITING_WORKSPACE_EXTRACTION_DEPENDENCIES,
  getEditorialPreferenceProfile,
  parseEditingMessages,
} from "../src/lib/workflows/editing/workspace";
import type { ManuscriptAssembly } from "../src/lib/editing-types";

test("Editing workspace extraction has a static owner and dependency map", () => {
  const editing = readFileSync("src/lib/workflows/editing.ts", "utf8");
  const workspace = readFileSync("src/lib/workflows/editing/workspace.ts", "utf8");
  const workspaceSchemas = readFileSync("src/lib/workflows/editing/workspace-schemas.ts", "utf8");
  const chapterLoader = readFileSync("src/lib/workflows/editing/chapter-loader.ts", "utf8");
  const workspaceSupport = readFileSync("src/lib/workflows/editing/workspace-support.ts", "utf8");
  const publicEntrypoint = readFileSync("src/lib/workflows/editing-public.ts", "utf8");

  assert.match(publicEntrypoint, /from "\.\/editing\/workspace"/);
  assert.match(workspace, /EDITING_WORKSPACE_EXTRACTION_DEPENDENCIES/);
  assert.match(workspace, /from "\.\/workspace-support"/);
  assert.match(workspace, /from "\.\/workspace-schemas"/);
  assert.match(workspace, /from "\.\/chapter-loader"/);
  assert.doesNotMatch(workspace, /from "\.\.\/editing"/);
  assert.match(workspace, /export async function getEditingWorkspace/);
  assert.doesNotMatch(workspace, /getEditingWorkspace,\s*\n} from "\.\.\/editing"/);
  assert.doesNotMatch(editing, /export async function getEditingWorkspace/);
  assert.doesNotMatch(editing, /from "\.\/editing\/workspace-support"/);

  assert.deepEqual(
    EDITING_WORKSPACE_EXTRACTION_DEPENDENCIES.directDataLoaders,
    [
      "getBookBySlugOrThrow",
      "getStageForBook",
      "getCommittedBookSetup",
      "loadEditingChapters",
      "getLatestEditingArtifactVersion",
      "getEditingArtifactVersions",
    ],
  );
  assert.deepEqual(
    EDITING_WORKSPACE_EXTRACTION_DEPENDENCIES.artifactTypes,
    [
      "MANUSCRIPT_ASSEMBLY",
      "PUBLISHING_PACKAGE",
      "PROVENANCE_REPORT",
      "MARKETING_HANDOFF_PACKAGE",
      "EDITORIAL_ASSESSMENT",
      "MANUSCRIPT_REVISION",
    ],
  );
  assert.deepEqual(
    EDITING_WORKSPACE_EXTRACTION_DEPENDENCIES.pureHelpers,
    [
      "parseJson",
      "parseJsonWithSchema",
      "parseEditingMessages",
      "getEditorialPreferenceProfile",
      "buildDraftQualityRollup",
      "buildExcerpt",
      "computeEditorialReadinessGate",
      "buildPublishPackageSyncState",
    ],
  );

  for (const symbol of EDITING_WORKSPACE_EXTRACTION_DEPENDENCIES.directDataLoaders) {
    assert.ok(
      workspace.includes(symbol) || chapterLoader.includes(symbol),
      `workspace modules should own or consume ${symbol}`,
    );
  }

  for (const symbol of EDITING_WORKSPACE_EXTRACTION_DEPENDENCIES.schemas.filter(
    (schema) => schema !== "EditorialPreferenceProfileSchema" && schema !== "BookSetupProfileSchema",
  )) {
    assert.ok(workspaceSchemas.includes(symbol), `workspace-schemas.ts should own ${symbol}`);
  }

  assert.ok(workspace.includes("BookSetupProfileSchema"));
  assert.ok(workspace.includes("buildPublishPackageSyncState"));

  for (const symbol of [
    "parseJson",
    "parseJsonWithSchema",
    "parseEditingMessages",
    "getEditorialPreferenceProfile",
    "buildDraftQualityRollup",
    "buildExcerpt",
    "computeEditorialReadinessGate",
    "EditorialPreferenceProfileSchema",
  ]) {
    assert.ok(workspaceSupport.includes(symbol), `workspace-support.ts should own ${symbol}`);
  }

  assert.doesNotMatch(editing, /function parseEditingMessages/);
  assert.doesNotMatch(editing, /function buildDraftQualityRollup/);
  assert.doesNotMatch(editing, /function computeEditorialReadinessGate/);
});

test("Editing workspace module does not yet own runtime orchestration", () => {
  const workspace = readFileSync("src/lib/workflows/editing/workspace.ts", "utf8");

  assert.equal(
    workspace.includes("getModelForRole"),
    false,
    "workspace extraction must not pull model calls into the workspace module",
  );
  assert.equal(
    workspace.includes("createEditingArtifactVersion"),
    false,
    "workspace extraction must not pull artifact mutation into the workspace module",
  );
  assert.equal(
    workspace.includes("updateStageForBook"),
    false,
    "workspace extraction must not pull stage mutation into the workspace module",
  );
});

test("Editing workspace projection helpers normalize stored metadata safely", () => {
  assert.deepEqual(
    parseEditingMessages([
      { role: "user", content: "Keep this story.", createdAt: "2026-07-13T00:00:00.000Z" },
      { role: "assistant", content: "I will.", createdAt: "2026-07-13T00:01:00.000Z" },
      { role: "system", content: 42 },
    ]),
    [
      { role: "user", content: "Keep this story.", createdAt: "2026-07-13T00:00:00.000Z" },
      { role: "assistant", content: "I will.", createdAt: "2026-07-13T00:01:00.000Z" },
    ],
  );

  assert.equal(buildExcerpt("abcdef", 4), "abcd...");
  assert.deepEqual(getEditorialPreferenceProfile({}), {
    updatedAt: "1970-01-01T00:00:00.000Z",
    styleNotes: "",
    preserveVoice: true,
    preferTighterProse: true,
    preferBolderCuts: false,
    acceptedRevisionCount: 0,
    rejectedRevisionCount: 0,
    acceptedModes: [],
    rejectedModes: [],
  });
});

test("Editing workspace quality and readiness helpers project deterministic dashboard state", () => {
  const manuscript: ManuscriptAssembly = {
    title: "Test Book",
    subtitle: null,
    assembledAt: "2026-07-13T00:00:00.000Z",
    sourceDraftSignature: "sig",
    chapterCount: 2,
    totalWords: 10000,
    editorialOverview: "Stable.",
    outstandingConcerns: [],
    chapters: [
      {
        chapterKey: "chapter-1",
        chapterLabel: "Chapter 1",
        sectionTitle: "Part 1",
        wordCount: 5000,
        reviewSummary: "Solid opening.",
        chapterText: "Chapter text.",
        quality: {
          score: 90,
          readiness: "strong",
          needsRevision: false,
          revisionPasses: 1,
          signals: [],
        },
      },
      {
        chapterKey: "chapter-2",
        chapterLabel: "Chapter 2",
        sectionTitle: "Part 1",
        wordCount: 5000,
        reviewSummary: "Needs clearer handoff.",
        chapterText: "Chapter text.",
        quality: {
          score: 62,
          readiness: "watch",
          needsRevision: true,
          revisionPasses: 2,
          signals: [{ label: "Continuity", state: "warn", detail: "Bridge is thin." }],
        },
      },
    ],
    fullText: "Chapter text.\n\nChapter text.",
    chapterKeys: ["chapter-1", "chapter-2"],
  };

  const rollup = buildDraftQualityRollup(manuscript.chapters);
  assert.equal(rollup?.averageScore, 76);
  assert.equal(rollup?.chaptersNeedingRevision, 1);
  assert.equal(rollup?.weakestChapterLabel, "Chapter 2");
  assert.match(rollup?.blockers[0] ?? "", /Continuity: Bridge is thin/);

  const gate = computeEditorialReadinessGate({
    manuscript,
    draftQualityRollup: rollup,
    latestAssessment: null,
    revisionPlan: null,
    revisionPlanExecution: null,
    appliedRevisionIds: [],
    rejectedRevisionIds: [],
    bookTargetWordCount: 10000,
    bookTargetTolerance: 1000,
  });

  assert.equal(gate.recommendation, "blocked");
  assert.match(gate.risks.join(" "), /No editorial assessment/);
});
