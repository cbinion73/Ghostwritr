import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

const publicEntrypoints = [
  "src/lib/workflows/promise-public.ts",
  "src/lib/workflows/editing-public.ts",
  "src/lib/workflows/chapter-draft-public.ts",
  "src/lib/workflows/research-public.ts",
];

const directWorkflowImportPattern =
  /(?:@\/lib\/workflows|(?:\.\.\/)+src\/lib\/workflows)\/(promise|editing|chapter-draft|research)(?=["'])/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") return [];
      return walk(path);
    }
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

test("workflow public entrypoints exist for monolith split migration", () => {
  for (const file of publicEntrypoints) {
    const source = readFileSync(join(root, file), "utf8");
    assert.ok(source.includes("export {"), `${file} should re-export its public workflow API`);
  }
});

test("promise public entrypoint is organized by capability facades", () => {
  const publicSource = readFileSync(join(root, "src/lib/workflows/promise-public.ts"), "utf8");
  const expectedCapabilityModules = [
    "./promise/generation",
    "./promise/audience-personas",
    "./promise/market-analysis",
    "./promise/report-composition",
    "./promise/workspace",
  ];

  for (const modulePath of expectedCapabilityModules) {
    assert.ok(publicSource.includes(modulePath), `promise-public.ts should export from ${modulePath}`);
  }
  assert.equal(publicSource.includes("from \"./promise\""), false);

  const capabilityExports = new Map([
    ["src/lib/workflows/promise/generation.ts", "runPromiseWorkflow"],
    ["src/lib/workflows/promise/audience-personas.ts", "maybeGeneratePersonasDeepProfile"],
    ["src/lib/workflows/promise/market-analysis.ts", "maybeGenerateMarketReport"],
    ["src/lib/workflows/promise/report-composition.ts", "composeBookPromiseReportFromMarkdown"],
    ["src/lib/workflows/promise/workspace.ts", "getPromiseWorkspace"],
  ]);

  for (const [file, exportedSymbol] of capabilityExports) {
    const source = readFileSync(join(root, file), "utf8");
    assert.ok(source.includes(exportedSymbol), `${file} should expose ${exportedSymbol}`);
  }

  const promiseWorkspaceSource = readFileSync(
    join(root, "src/lib/workflows/promise/workspace.ts"),
    "utf8",
  );
  const promiseGenerationSource = readFileSync(
    join(root, "src/lib/workflows/promise/generation.ts"),
    "utf8",
  );
  const promiseGenerationModelsSource = readFileSync(
    join(root, "src/lib/workflows/promise/generation-models.ts"),
    "utf8",
  );
  const promiseAudiencePersonasSource = readFileSync(
    join(root, "src/lib/workflows/promise/audience-personas.ts"),
    "utf8",
  );
  assert.ok(
    promiseGenerationSource.includes("runPromiseWorkflow"),
    "promise generation module should expose runPromiseWorkflow",
  );
  assert.ok(
    promiseGenerationModelsSource.includes("getStructuredPromiseModel"),
    "promise generation model helpers should expose getStructuredPromiseModel",
  );
  assert.ok(
    promiseGenerationModelsSource.includes("getStructuredAudienceModel"),
    "promise generation model helpers should expose getStructuredAudienceModel",
  );
  assert.ok(
    promiseGenerationModelsSource.includes("getBookPitchModel"),
    "promise generation model helpers should expose getBookPitchModel",
  );
  assert.equal(
    promiseWorkspaceSource.includes("runPromiseWorkflow"),
    false,
    "promise workspace module should not own graph run orchestration",
  );
  assert.ok(
    promiseWorkspaceSource.includes("export async function commitPromiseWorkflow"),
    "promise workspace module should own commitPromiseWorkflow implementation",
  );
  assert.equal(
    /commitPromiseWorkflow[\s\S]*from "\.\.\/promise"/.test(promiseWorkspaceSource),
    false,
    "promise workspace module should not re-export commitPromiseWorkflow from the monolith",
  );
  assert.ok(
    promiseWorkspaceSource.includes("export async function getOutlineWorkspace"),
    "promise workspace module should own getOutlineWorkspace implementation",
  );
  assert.equal(
    /getOutlineWorkspace[\s\S]*from "\.\.\/promise"/.test(promiseWorkspaceSource),
    false,
    "promise workspace module should not re-export getOutlineWorkspace from the monolith",
  );
  assert.ok(
    promiseAudiencePersonasSource.includes("export async function maybeGenerateAudienceResearchPhase1"),
    "promise audience/personas module should own maybeGenerateAudienceResearchPhase1 implementation",
  );
  assert.equal(
    /maybeGenerateAudienceResearchPhase1[\s\S]*from "\.\.\/promise"/.test(promiseAudiencePersonasSource),
    false,
    "promise audience/personas module should not re-export maybeGenerateAudienceResearchPhase1 from the monolith",
  );
  assert.ok(
    promiseAudiencePersonasSource.includes("export async function maybeGeneratePersonasDeepProfile"),
    "promise audience/personas module should own maybeGeneratePersonasDeepProfile implementation",
  );
  assert.equal(
    /maybeGeneratePersonasDeepProfile[\s\S]*from "\.\.\/promise"/.test(promiseAudiencePersonasSource),
    false,
    "promise audience/personas module should not re-export maybeGeneratePersonasDeepProfile from the monolith",
  );
  assert.ok(
    promiseAudiencePersonasSource.includes("export async function maybeGeneratePersonaComparisonAnalysis"),
    "promise audience/personas module should own maybeGeneratePersonaComparisonAnalysis implementation",
  );
  assert.equal(
    /maybeGeneratePersonaComparisonAnalysis[\s\S]*from "\.\.\/promise"/.test(promiseAudiencePersonasSource),
    false,
    "promise audience/personas module should not re-export maybeGeneratePersonaComparisonAnalysis from the monolith",
  );
  assert.equal(
    promiseAudiencePersonasSource.includes('from "../promise"'),
    false,
    "promise audience/personas module should not import or re-export from the monolith after facade cleanup",
  );

  const binderTabsSource = readFileSync(
    join(root, "src/lib/workflows/research/binder-tabs.ts"),
    "utf8",
  );
  const ideaClipsSource = readFileSync(
    join(root, "src/lib/workflows/research/idea-clips.ts"),
    "utf8",
  );

  assert.equal(binderTabsSource.includes('from "../research"'), false);
  assert.equal(ideaClipsSource.includes('from "../research"'), false);
  assert.ok(binderTabsSource.includes("../../repositories/research-binder"));
  assert.ok(ideaClipsSource.includes("../../repositories/research-binder"));
});

test("research public entrypoint is organized by capability facades", () => {
  const publicSource = readFileSync(join(root, "src/lib/workflows/research-public.ts"), "utf8");
  const expectedCapabilityModules = [
    "./research/execution",
    "./research/jobs",
    "./research/commit",
    "./research/workspace",
    "./research/binder-tabs",
    "./research/idea-clips",
  ];

  for (const modulePath of expectedCapabilityModules) {
    assert.ok(publicSource.includes(modulePath), `research-public.ts should export from ${modulePath}`);
  }
  assert.equal(publicSource.includes("from \"./research\""), false);

  const capabilityExports = new Map([
    ["src/lib/workflows/research/execution.ts", "runFullResearchWorkflow"],
    ["src/lib/workflows/research/jobs.ts", "processWorkflowRun"],
    ["src/lib/workflows/research/commit.ts", "commitAllResearchWorkflow"],
    ["src/lib/workflows/research/workspace.ts", "getResearchWorkspace"],
    ["src/lib/workflows/research/binder-tabs.ts", "runResearchBinderTabWorkflow"],
    ["src/lib/workflows/research/idea-clips.ts", "addResearchIdeaClipWorkflow"],
  ]);

  for (const [file, exportedSymbol] of capabilityExports) {
    const source = readFileSync(join(root, file), "utf8");
    assert.ok(source.includes(exportedSymbol), `${file} should expose ${exportedSymbol}`);
  }
});

test("chapter draft public entrypoint is organized by capability facades", () => {
  const publicSource = readFileSync(join(root, "src/lib/workflows/chapter-draft-public.ts"), "utf8");
  const expectedCapabilityModules = [
    "./chapter-draft/execution",
    "./chapter-draft/repair",
    "./chapter-draft/jobs",
    "./chapter-draft/commit",
    "./chapter-draft/workspace",
  ];

  for (const modulePath of expectedCapabilityModules) {
    assert.ok(publicSource.includes(modulePath), `chapter-draft-public.ts should export from ${modulePath}`);
  }
  assert.equal(publicSource.includes("from \"./chapter-draft\""), false);

  const capabilityExports = new Map([
    ["src/lib/workflows/chapter-draft/execution.ts", "runChapterDraftWorkflow"],
    ["src/lib/workflows/chapter-draft/repair.ts", "repairWeakChapterDraftsWorkflow"],
    ["src/lib/workflows/chapter-draft/jobs.ts", "processChapterDraftWorkflowRun"],
    ["src/lib/workflows/chapter-draft/commit.ts", "commitAllChapterDraftsWorkflow"],
    ["src/lib/workflows/chapter-draft/workspace.ts", "getChapterDraftWorkspace"],
  ]);

  for (const [file, exportedSymbol] of capabilityExports) {
    const source = readFileSync(join(root, file), "utf8");
    assert.ok(source.includes(exportedSymbol), `${file} should expose ${exportedSymbol}`);
  }
});

test("editing public entrypoint is organized by capability facades", () => {
  const publicSource = readFileSync(join(root, "src/lib/workflows/editing-public.ts"), "utf8");
  const expectedCapabilityModules = [
    "./editing/assembly",
    "./editing/assessment",
    "./editing/revision",
    "./editing/publishing",
    "./editing/interaction",
    "./editing/commit",
    "./editing/workspace",
  ];

  for (const modulePath of expectedCapabilityModules) {
    assert.ok(publicSource.includes(modulePath), `editing-public.ts should export from ${modulePath}`);
  }
  assert.equal(publicSource.includes("from \"./editing\""), false);

  const capabilityExports = new Map([
    ["src/lib/workflows/editing/assembly.ts", "assembleManuscriptWorkflow"],
    ["src/lib/workflows/editing/assessment.ts", "generateEditorialAssessmentWorkflow"],
    ["src/lib/workflows/editing/revision.ts", "executeEditorialRevisionPlanWorkflow"],
    ["src/lib/workflows/editing/publishing.ts", "finalizePublishingHandoffWorkflow"],
    ["src/lib/workflows/editing/interaction.ts", "sendEditingMessageWorkflow"],
    ["src/lib/workflows/editing/commit.ts", "runFullEditorialLoopWorkflow"],
    ["src/lib/workflows/editing/workspace.ts", "getEditingWorkspace"],
  ]);

  for (const [file, exportedSymbol] of capabilityExports) {
    const source = readFileSync(join(root, file), "utf8");
    assert.ok(source.includes(exportedSymbol), `${file} should expose ${exportedSymbol}`);
  }
});

test("app, scripts, and tests import workflow public entrypoints instead of monolith files", () => {
  const scannedFiles = ["src/app", "scripts", "tests"]
    .flatMap((dir) => walk(join(root, dir)))
    .filter((file) => !file.endsWith("workflow-public-entrypoints.test.ts"));

  for (const file of scannedFiles) {
    const source = readFileSync(file, "utf8");
    assert.equal(
      directWorkflowImportPattern.test(source),
      false,
      `${relative(root, file)} should import *-public workflow entrypoints`,
    );
  }
});
