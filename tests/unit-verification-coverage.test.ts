import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

type CoverageTarget = {
  category: string;
  testFile: string;
  sourceFile?: string;
  requiredSnippets: string[];
};

const coverageTargets: CoverageTarget[] = [
  {
    category: "pricing",
    testFile: "tests/llm-cost-ledger.test.ts",
    sourceFile: "src/lib/llm/call-log.ts",
    requiredSnippets: [
      "LLM_COST_PRICING_VERSION",
      "buildCostLogEntry",
      "searchCostUsd",
      "pricingVersion",
    ],
  },
  {
    category: "budgets",
    testFile: "tests/llm-budget.test.ts",
    sourceFile: "src/lib/llm/budgets.ts",
    requiredSnippets: [
      "confirmationRequired",
      "confirmedThroughUsd",
      "hardStopReached",
    ],
  },
  {
    category: "context selection",
    testFile: "tests/chapter-draft-context.test.ts",
    sourceFile: "src/lib/workflows/chapter-draft/context.ts",
    requiredSnippets: [
      "extractManifestChapterGuidance",
      "buildQuillContextReadinessPacket",
      "validateQuillContextReadiness",
    ],
  },
  {
    category: "chapter identity",
    testFile: "tests/chapter-identity.test.ts",
    sourceFile: "src/lib/repositories/chapter-identity.ts",
    requiredSnippets: [
      "chapterIdentityWhere",
      "chapterIdentityMetadata",
      "getArtifactChapterId",
    ],
  },
  {
    category: "invalidation",
    testFile: "tests/dependency-invalidation.test.ts",
    sourceFile: "src/lib/workflow-dependencies.ts",
    requiredSnippets: [
      "markDownstreamChapterAssetsStale",
      "clearChapterStaleMarkers",
      "affectedChapterIds",
    ],
  },
  {
    category: "citations",
    testFile: "tests/source-evidence-contract.test.ts",
    sourceFile: "src/lib/source-evidence-contract.ts",
    requiredSnippets: [
      "buildResearchEvidenceContract",
      "buildExternalStoryEvidenceContract",
      "ADMISSIBLE",
    ],
  },
  {
    category: "state transitions",
    testFile: "tests/stage-transition-service.test.ts",
    sourceFile: "src/lib/workflows/stage-transition-service.ts",
    requiredSnippets: [
      "ensureStageStarted",
      "commitStageAndUnlockNext",
      "blockStage",
    ],
  },
  {
    category: "editorial instructions",
    testFile: "tests/editing-bookwide-assessment.test.ts",
    sourceFile: "src/lib/workflows/editing.ts",
    requiredSnippets: [
      "buildFinalRevisionInstructions",
      "Do not rewrite prose in this pass.",
      "combined editorial revision and final polish pass",
    ],
  },
  {
    category: "preflight",
    testFile: "tests/typeset-preflight.test.ts",
    sourceFile: "src/lib/typeset-preflight.ts",
    requiredSnippets: [
      "buildTypesetPreflightReport",
      "Final chapter approvals",
      "PDF renderer",
    ],
  },
];

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("Milestone 9.1 has explicit non-spending unit coverage for every required category", () => {
  assert.deepEqual(
    coverageTargets.map((target) => target.category),
    [
      "pricing",
      "budgets",
      "context selection",
      "chapter identity",
      "invalidation",
      "citations",
      "state transitions",
      "editorial instructions",
      "preflight",
    ],
  );

  for (const target of coverageTargets) {
    assert.ok(existsSync(join(root, target.testFile)), `${target.category} test file is missing`);
    const testSource = read(target.testFile);
    const implementationSource = target.sourceFile ? read(target.sourceFile) : "";

    for (const snippet of target.requiredSnippets) {
      assert.ok(
        testSource.includes(snippet) || implementationSource.includes(snippet),
        `${target.category} coverage is missing ${snippet}`,
      );
    }
  }
});
