import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BookWorkflowType } from "@prisma/client";

import type { ManuscriptAssembly } from "../src/lib/editing-types";
import {
  buildMarketingHandoffPackage,
  buildProvenanceReport,
  buildPublishingPackage,
  EDITING_PUBLISHING_COMMIT_EXTRACTION_DEPENDENCIES,
} from "../src/lib/workflows/editing/publishing-support";

const assembly: ManuscriptAssembly = {
  title: "The Trust Engine",
  subtitle: "A leadership field guide",
  assembledAt: "2026-07-13T00:00:00.000Z",
  sourceDraftSignature: "chapter-1:sig",
  chapterCount: 2,
  totalWords: 12000,
  editorialOverview: "The manuscript is coherent and ready for publishing prep.",
  outstandingConcerns: [],
  chapters: [
    {
      chapterKey: "chapter-1",
      chapterLabel: "Chapter 1: Trust",
      sectionTitle: "Part 1",
      wordCount: 6000,
      reviewSummary: "Strong opening.",
      chapterText: "Trust compounds through repeated promises kept.",
      approvedDraftVersionId: "draft-1",
      paragraphOutline: [],
      quality: {
        score: 88,
        readiness: "strong",
        needsRevision: false,
        revisionPasses: 1,
        signals: [],
      },
    },
    {
      chapterKey: "chapter-2",
      chapterLabel: "Chapter 2: Alignment",
      sectionTitle: "Part 1",
      wordCount: 6000,
      reviewSummary: "Clear continuation.",
      chapterText: "Alignment turns intent into coordinated behavior.",
      approvedDraftVersionId: "draft-2",
      paragraphOutline: [],
      quality: {
        score: 84,
        readiness: "strong",
        needsRevision: false,
        revisionPasses: 1,
        signals: [],
      },
    },
  ],
  fullText: "Full manuscript",
  chapterKeys: ["chapter-1", "chapter-2"],
};

test("Editing publishing and commit extraction has a static ownership and dependency map", () => {
  const publicEntrypoint = readFileSync("src/lib/workflows/editing-public.ts", "utf8");
  const assemblyModule = readFileSync("src/lib/workflows/editing/assembly.ts", "utf8");
  const publishingModule = readFileSync("src/lib/workflows/editing/publishing.ts", "utf8");
  const commitModule = readFileSync("src/lib/workflows/editing/commit.ts", "utf8");
  const supportModule = readFileSync("src/lib/workflows/editing/publishing-support.ts", "utf8");
  const editing = readFileSync("src/lib/workflows/editing.ts", "utf8");

  assert.match(publicEntrypoint, /from "\.\/editing\/assembly"/);
  assert.match(publicEntrypoint, /from "\.\/editing\/publishing"/);
  assert.match(publicEntrypoint, /from "\.\/editing\/commit"/);
  assert.doesNotMatch(assemblyModule, /from "\.\.\/editing"/);
  assert.match(assemblyModule, /export async function assembleManuscriptWorkflow/);
  assert.match(assemblyModule, /createEditingArtifactVersion/);
  assert.match(assemblyModule, /loadEditingChapters/);
  assert.doesNotMatch(publishingModule, /from "\.\.\/editing"/);
  assert.match(publishingModule, /export async function preparePublishingPackageWorkflow/);
  assert.match(publishingModule, /export async function finalizePublishingHandoffWorkflow/);
  assert.match(publishingModule, /syncPublishDerivedArtifacts/);
  assert.match(publishingModule, /buildPublishPackageSyncState/);
  assert.doesNotMatch(commitModule, /from "\.\.\/editing"/);
  assert.match(commitModule, /export async function commitEditingStageWorkflow/);
  assert.match(commitModule, /export async function runFullEditorialLoopWorkflow/);
  assert.match(commitModule, /clearStageStaleDependency/);
  assert.match(commitModule, /computeEditorialReadinessGate/);
  assert.match(commitModule, /syncPublishDerivedArtifacts/);
  assert.match(supportModule, /EDITING_PUBLISHING_COMMIT_EXTRACTION_DEPENDENCIES/);
  assert.doesNotMatch(editing, /buildPublishingSupportPackage/);
  assert.doesNotMatch(editing, /buildPublishingSupportProvenanceReport/);
  assert.doesNotMatch(editing, /buildPublishingSupportMarketingHandoffPackage/);
  assert.doesNotMatch(editing, /export async function assembleManuscriptWorkflow/);
  assert.doesNotMatch(editing, /export async function preparePublishingPackageWorkflow/);
  assert.doesNotMatch(editing, /export async function finalizePublishingHandoffWorkflow/);
  assert.doesNotMatch(editing, /export async function commitEditingStageWorkflow/);
  assert.doesNotMatch(editing, /export async function runFullEditorialLoopWorkflow/);

  assert.deepEqual(
    EDITING_PUBLISHING_COMMIT_EXTRACTION_DEPENDENCIES.publicWorkflows,
    [
      "assembleManuscriptWorkflow",
      "preparePublishingPackageWorkflow",
      "finalizePublishingHandoffWorkflow",
      "commitEditingStageWorkflow",
      "runFullEditorialLoopWorkflow",
    ],
  );

  for (const symbol of EDITING_PUBLISHING_COMMIT_EXTRACTION_DEPENDENCIES.pureHelpers) {
    assert.match(supportModule, new RegExp(`export function ${symbol}`));
  }
});

test("Editing publishing support builds deterministic package, provenance, and handoff data", () => {
  const publishingPackage = buildPublishingPackage({
    assembly,
    workflowType: BookWorkflowType.NONFICTION,
    bookSetup: {
      title: "The Trust Engine",
      subtitle: "A leadership field guide",
      premise: "Trust is operational.",
      targetReader: "Operators",
      promise: "Build durable influence.",
      voiceTone: "Clear and practical",
      chapterFormat: ["story", "framework"],
      readerLevel: "practitioner",
      targetWordCount: 12000,
      wordCountTolerance: 1000,
      targetPageCount: 80,
      trimSize: "6 x 9 in",
      outputFormats: ["PRINT", "EBOOK"],
      writerPersonaBlend: [],
    } as never,
    draftQualityRollup: {
      averageScore: 86,
      chaptersNeedingRevision: 0,
      strongChapters: 2,
      watchChapters: 0,
      attentionChapters: 0,
      totalRevisionPasses: 2,
      weakestChapterLabel: "Chapter 2: Alignment",
      headline: "Draft quality is stable.",
      blockers: [],
    },
    editorialRecommendation: "ready_for_commit",
  });

  assert.equal(publishingPackage.packageStatus, "ready_to_publish");
  assert.equal(publishingPackage.outputFormats.includes("PRINT"), true);
  assert.equal(publishingPackage.typesettingPlan.tocIncluded, true);
  assert.ok(publishingPackage.preflightChecks.length >= 8);

  const provenance = buildProvenanceReport({
    workflowType: BookWorkflowType.NONFICTION,
    bookTitle: assembly.title,
    publishingPackage,
    editorialPreferences: {
      updatedAt: "2026-07-13T00:00:00.000Z",
      styleNotes: "Tight prose.",
      preserveVoice: true,
      preferTighterProse: true,
      preferBolderCuts: false,
      acceptedRevisionCount: 2,
      rejectedRevisionCount: 1,
      acceptedModes: ["clarity-pass"],
      rejectedModes: ["line-edit"],
    },
    revisionPlanExecution: null,
  });
  assert.match(provenance.artifactTrail.map((entry) => entry.stage).join(" "), /Chapter Draft/);

  const handoff = buildMarketingHandoffPackage({
    workflowType: BookWorkflowType.NONFICTION,
    assembly,
    publishingPackage,
  });
  assert.match(handoff.synopsis, /leadership manuscript/);
  assert.match(handoff.exportReadiness.join(" "), /ready_to_publish/);
});
