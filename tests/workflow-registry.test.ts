import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ArtifactType, BookWorkflowType, StageKey } from "@prisma/client";

import {
  getArtifactTypesForStage,
  getPrerequisiteStageKeys,
  getPrimaryArtifactTypeForStage,
  getStageApprovalMode,
  getStageRolesForStage,
  getStaleArtifactTypesForStage,
  getWorkflowDefinition,
} from "../src/lib/workflow-registry";
import {
  FICTION_STAGE_TOKENS,
  STAGE_TOKENS,
  WORKBOOK_STAGE_TOKENS,
} from "../src/lib/ui/stage-tokens";

const root = process.cwd();
const slug = "registry-test-book";

function appPageForHref(href: string) {
  const pathname = href.split("?")[0] ?? href;
  const relative = pathname
    .replace(`/books/${slug}`, "src/app/books/[slug]")
    .replace(/\/$/, "");
  return join(root, relative, "page.tsx");
}

test("workflow registry is the source for generated stage tokens", () => {
  const expectations = [
    [BookWorkflowType.NONFICTION, STAGE_TOKENS],
    [BookWorkflowType.FICTION, FICTION_STAGE_TOKENS],
    [BookWorkflowType.WORKBOOK, WORKBOOK_STAGE_TOKENS],
  ] as const;

  for (const [workflowType, tokens] of expectations) {
    const stages = getWorkflowDefinition(workflowType).stages;
    assert.deepEqual(
      tokens.map((token) => ({
        key: token.key,
        number: token.number,
        label: token.label,
        group: token.group,
        route: token.route(slug),
        description: token.description,
      })),
      stages.map((stage) => ({
        key: stage.key,
        number: stage.number,
        label: stage.label,
        group: stage.group,
        route: stage.href(slug),
        description: stage.description,
      })),
      `${workflowType} tokens must be a projection of workflow-registry.ts`,
    );
  }
});

test("registered workflow routes resolve to existing app pages", () => {
  for (const workflowType of Object.values(BookWorkflowType)) {
    for (const stage of getWorkflowDefinition(workflowType).stages) {
      const href = stage.href(slug);
      assert.equal(
        existsSync(appPageForHref(href)),
        true,
        `${workflowType}.${stage.key} route ${href} must resolve to an app page`,
      );
    }
  }
});

test("fiction draft route uses the existing draft page", () => {
  const fictionDraft = getWorkflowDefinition(BookWorkflowType.FICTION).stages.find(
    (stage) => stage.key === "FICTION_DRAFT",
  );

  assert.equal(fictionDraft?.href(slug), `/books/${slug}/draft`);
});

test("stage token file no longer maintains duplicate hard-coded workflow arrays", () => {
  const stageTokensSource = readFileSync(join(root, "src/lib/ui/stage-tokens.ts"), "utf8");

  assert.ok(stageTokensSource.includes("getWorkflowDefinition"));
  assert.equal(stageTokensSource.includes("key: \"BOOK_SETUP\""), false);
  assert.equal(stageTokensSource.includes("key: \"FICTION_DRAFT\""), false);
});

test("registered workflow stages expose typed operational metadata", () => {
  for (const workflowType of Object.values(BookWorkflowType)) {
    for (const stage of getWorkflowDefinition(workflowType).stages) {
      const artifactTypes = getArtifactTypesForStage(stage.key);

      if (stage.key === StageKey.WORKBOOK_DESIGN) {
        assert.equal(getPrimaryArtifactTypeForStage(stage.key), null);
      } else {
        assert.ok(
          getPrimaryArtifactTypeForStage(stage.key),
          `${workflowType}.${stage.key} should declare a primary artifact type`,
        );
        assert.ok(
          artifactTypes.length > 0,
          `${workflowType}.${stage.key} should declare artifact types`,
        );
      }

      assert.ok(
        ["none", "stage", "chapter", "phase-1"].includes(getStageApprovalMode(stage.key)),
        `${workflowType}.${stage.key} should declare a known approval mode`,
      );
    }
  }

  assert.equal(getPrimaryArtifactTypeForStage(StageKey.CHAPTER_DRAFT), ArtifactType.CHAPTER_DRAFT);
  assert.equal(getPrimaryArtifactTypeForStage(StageKey.FICTION_DRAFT), ArtifactType.FICTION_DRAFT_MANUSCRIPT);
  assert.equal(getStageApprovalMode(StageKey.PROMISE), "phase-1");
  assert.equal(getStageApprovalMode(StageKey.CHAPTER_DRAFT), "chapter");
  assert.ok(getStageRolesForStage(StageKey.RESEARCH).includes("research:agent-1-researcher"));
  assert.ok(getStageRolesForStage(StageKey.EDITING).includes("final-editor:polish"));
  assert.deepEqual(getStaleArtifactTypesForStage(StageKey.CHAPTER_DRAFT), [ArtifactType.CHAPTER_DRAFT]);
});

test("workflow prerequisites are derived from registry order", () => {
  assert.deepEqual(
    getPrerequisiteStageKeys(BookWorkflowType.NONFICTION, StageKey.CHAPTER_DRAFT),
    [
      StageKey.BOOK_SETUP,
      StageKey.PROMISE,
      StageKey.OUTLINE,
      StageKey.BASE_STORY,
      StageKey.RESEARCH,
      StageKey.EXTERNAL_STORIES,
      StageKey.PERSONAL_STORIES,
      StageKey.MANIFEST,
    ],
  );
  assert.deepEqual(
    getPrerequisiteStageKeys(BookWorkflowType.FICTION, StageKey.FICTION_DRAFT),
    [
      StageKey.BOOK_SETUP,
      StageKey.PROMISE,
      StageKey.MARKET_ANALYSIS,
      StageKey.STORY_SETUP,
      StageKey.STORY_CORE,
      StageKey.WORLD_CAST,
      StageKey.PLOT_BLUEPRINT,
      StageKey.SCENE_PLAN,
    ],
  );
});

test("artifact and stale-dependency callers use registry helpers instead of local maps", () => {
  const commitRoute = readFileSync(join(root, "src/app/api/books/[slug]/stage-artifacts/commit/route.ts"), "utf8");
  const saveDraftRoute = readFileSync(join(root, "src/app/api/books/[slug]/stage-artifacts/save-draft/route.ts"), "utf8");
  const dependencies = readFileSync(join(root, "src/lib/workflow-dependencies.ts"), "utf8");
  const activityRoute = readFileSync(join(root, "src/app/api/books/[slug]/activity/route.ts"), "utf8");

  assert.ok(commitRoute.includes("getPrimaryArtifactTypeForStage(stageKey)"));
  assert.equal(commitRoute.includes("const STAGE_ARTIFACT_TYPE"), false);
  assert.ok(saveDraftRoute.includes("getPrimaryArtifactTypeForStage(stageKey)"));
  assert.equal(saveDraftRoute.includes("const STAGE_ARTIFACT_TYPE"), false);
  assert.ok(dependencies.includes("getStaleArtifactTypesForStage"));
  assert.equal(dependencies.includes("STAGE_CHAPTER_ARTIFACT_TYPES"), false);
  assert.ok(activityRoute.includes("getStageDefinitionForKey"));
  assert.equal(activityRoute.includes("STAGE_TOKENS"), false);
});

test("duplicate registry maps stay removed from known former call sites", () => {
  const forbiddenPatterns = [
    {
      file: "src/lib/ui/stage-tokens.ts",
      pattern: /export const (?:STAGE_TOKENS|FICTION_STAGE_TOKENS): readonly StageToken\[] = \[/,
      reason: "stage tokens must be generated from workflow-registry.ts",
    },
    {
      file: "src/app/api/books/[slug]/stage-artifacts/commit/route.ts",
      pattern: /STAGE_ARTIFACT_TYPE\s*:/,
      reason: "commit artifact type must come from getPrimaryArtifactTypeForStage",
    },
    {
      file: "src/app/api/books/[slug]/stage-artifacts/save-draft/route.ts",
      pattern: /STAGE_ARTIFACT_TYPE\s*:/,
      reason: "draft artifact type must come from getPrimaryArtifactTypeForStage",
    },
    {
      file: "src/lib/workflow-dependencies.ts",
      pattern: /STAGE_CHAPTER_ARTIFACT_TYPES\s*:/,
      reason: "stale artifact types must come from getStaleArtifactTypesForStage",
    },
    {
      file: "src/lib/workflow-registry.ts",
      pattern: /fiction-draft/,
      reason: "fiction draft route must stay aligned with the existing /draft page",
    },
  ];

  for (const { file, pattern, reason } of forbiddenPatterns) {
    const source = readFileSync(join(root, file), "utf8");
    assert.equal(pattern.test(source), false, `${file}: ${reason}`);
  }
});
