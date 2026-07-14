import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { EDITING_REVISION_EXTRACTION_DEPENDENCIES } from "../src/lib/workflows/editing/revision";
import {
  buildBookWideEditorialFindings,
  buildDeterministicRevisionPlan,
  buildFinalRevisionInstructions,
  buildSourceDraftSignature,
  resolveRevisionTargetChapters,
} from "../src/lib/workflows/editing/revision-support";
import type { EditingChapterSnapshot, ManuscriptAssembly } from "../src/lib/editing-types";

test("Editing revision extraction has a static ownership and dependency map", () => {
  const editing = readFileSync("src/lib/workflows/editing.ts", "utf8");
  const revision = readFileSync("src/lib/workflows/editing/revision.ts", "utf8");
  const assessment = readFileSync("src/lib/workflows/editing/assessment.ts", "utf8");
  const publicEntrypoint = readFileSync("src/lib/workflows/editing-public.ts", "utf8");

  assert.match(publicEntrypoint, /from "\.\/editing\/assessment"/);
  assert.match(publicEntrypoint, /from "\.\/editing\/revision"/);
  assert.match(revision, /EDITING_REVISION_EXTRACTION_DEPENDENCIES/);
  assert.doesNotMatch(revision, /from "\.\.\/editing"/);
  assert.doesNotMatch(revision, /Parameters<typeof import\("\.\.\/editing"\)/);
  assert.doesNotMatch(revision, /await import\("\.\.\/editing"\)/);
  assert.match(revision, /from "\.\/publishing"/);
  assert.doesNotMatch(assessment, /from "\.\.\/editing"/);
  assert.match(assessment, /export async function generateEditorialAssessmentWorkflow/);
  assert.match(assessment, /getModelForRole\("final-editor:assess"/);
  assert.match(assessment, /createEditingArtifactVersion/);
  assert.match(assessment, /updateStageForBook/);
  assert.match(assessment, /sourceDraftSignature/);
  assert.doesNotMatch(editing, /export async function generateEditorialAssessmentWorkflow/);
  assert.doesNotMatch(editing, /const EditorialAssessmentReplySchema/);
  assert.match(revision, /export async function generateManuscriptRevisionWorkflow/);
  assert.match(revision, /getModelForRole\("final-editor:polish"/);
  assert.match(revision, /const ManuscriptRevisionReplySchema/);
  assert.match(revision, /ArtifactType\.MANUSCRIPT_REVISION/);
  assert.match(revision, /chapterKey: selectedChapterKeys\.length === 1/);
  assert.match(revision, /export async function applyManuscriptRevisionWorkflow/);
  assert.match(revision, /export async function rejectManuscriptRevisionWorkflow/);
  assert.match(revision, /markFinalRevisionApproved/);
  assert.match(revision, /appliedRevisionIds/);
  assert.match(revision, /rejectedRevisionIds/);
  assert.match(revision, /export async function generateEditorialRevisionPlanWorkflow/);
  assert.match(revision, /export async function executeEditorialRevisionPlanWorkflow/);
  assert.match(revision, /export async function generateSuggestedRevisionFromConversationWorkflow/);
  assert.match(revision, /const EditorialRevisionPlanReplySchema/);
  assert.match(revision, /revisionPlanExecution/);
  assert.match(revision, /SuggestedEditorialRevisionTargetSchema/);
  assert.doesNotMatch(editing, /export async function generateManuscriptRevisionWorkflow/);
  assert.doesNotMatch(editing, /export async function applyManuscriptRevisionWorkflow/);
  assert.doesNotMatch(editing, /export async function rejectManuscriptRevisionWorkflow/);
  assert.doesNotMatch(editing, /export async function generateEditorialRevisionPlanWorkflow/);
  assert.doesNotMatch(editing, /export async function executeEditorialRevisionPlanWorkflow/);
  assert.doesNotMatch(editing, /export async function generateSuggestedRevisionFromConversationWorkflow/);
  assert.doesNotMatch(editing, /const ManuscriptRevisionReplySchema/);
  assert.doesNotMatch(editing, /const EditorialRevisionPlanReplySchema/);

  assert.deepEqual(
    EDITING_REVISION_EXTRACTION_DEPENDENCIES.publicWorkflows,
    [
      "generateEditorialAssessmentWorkflow",
      "generateManuscriptRevisionWorkflow",
      "applyManuscriptRevisionWorkflow",
      "rejectManuscriptRevisionWorkflow",
      "generateEditorialRevisionPlanWorkflow",
      "executeEditorialRevisionPlanWorkflow",
      "generateSuggestedRevisionFromConversationWorkflow",
    ],
  );

  assert.deepEqual(
    EDITING_REVISION_EXTRACTION_DEPENDENCIES.modelSeams,
    [
      "getEditorAssessModel",
      "getEditorModel",
      "EditorialAssessmentReplySchema",
      "ManuscriptRevisionReplySchema",
      "EditorialRevisionPlanReplySchema",
    ],
  );

  for (const symbol of EDITING_REVISION_EXTRACTION_DEPENDENCIES.publicWorkflows) {
    assert.ok(
      editing.includes(symbol) || assessment.includes(symbol) || revision.includes(symbol),
      `editing, assessment, or revision module should currently define or consume ${symbol}`,
    );
  }

  for (const symbol of EDITING_REVISION_EXTRACTION_DEPENDENCIES.modelSeams) {
    assert.ok(
      editing.includes(symbol) || assessment.includes(symbol) || revision.includes(symbol),
      `editing, assessment, or revision module should currently define or consume ${symbol}`,
    );
  }

  const revisionSupport = readFileSync("src/lib/workflows/editing/revision-support.ts", "utf8");
  for (const symbol of EDITING_REVISION_EXTRACTION_DEPENDENCIES.pureHelpers) {
    assert.ok(revisionSupport.includes(symbol), `revision-support.ts should own ${symbol}`);
  }

  assert.doesNotMatch(editing, /from "\.\/editing\/revision-support"/);
  assert.doesNotMatch(editing, /function buildDeterministicRevisionPlan/);
  assert.doesNotMatch(editing, /function resolveRevisionTargetChapters/);
  assert.doesNotMatch(editing, /function buildFinalRevisionInstructions/);
});

test("Editing revision extraction map does not absorb publishing or commit ownership", () => {
  const revision = readFileSync("src/lib/workflows/editing/revision.ts", "utf8");
  const assessment = readFileSync("src/lib/workflows/editing/assessment.ts", "utf8");

  assert.equal(
    revision.includes("commitEditingStageWorkflow"),
    false,
    "revision extraction must not pull commit workflow ownership into the revision module",
  );
  assert.equal(
    revision.includes("finalizePublishingHandoffWorkflow"),
    false,
    "revision extraction must not pull publishing handoff ownership into the revision module",
  );
  assert.match(revision, /getModelForRole\("final-editor:polish"/);
  assert.match(revision, /ArtifactType\.MANUSCRIPT_REVISION/);
  assert.equal(
    assessment.includes("final-editor:polish"),
    false,
    "assessment extraction must not pull polish/rewrite model routing into the assessment module",
  );
  assert.equal(
    assessment.includes("ArtifactType.MANUSCRIPT_REVISION"),
    false,
    "assessment extraction must not pull revision artifact writes into the assessment module",
  );
});

function chapter(overrides: Partial<EditingChapterSnapshot>): EditingChapterSnapshot {
  return {
    chapterKey: "chapter-1",
    chapterLabel: "Chapter 1",
    sectionTitle: "Part 1",
    wordCount: 100,
    reviewSummary: null,
    chapterText: "This chapter text has trust and accountability. It needs a citation.",
    approvedDraftVersionId: "draft-1",
    paragraphOutline: [{ id: "p1", topicSentence: "Opening trust.", purpose: "Set frame." }],
    quality: {
      score: 62,
      readiness: "watch",
      needsRevision: true,
      revisionPasses: 1,
      signals: [
        { label: "Continuity", state: "warn", detail: "Bridge is thin." },
        { label: "Voice", state: "pass", detail: "Sounds human." },
      ],
    },
    ...overrides,
  };
}

test("Editing revision support projects source signatures, findings, and final instructions", () => {
  const chapters = [
    chapter({}),
    chapter({
      chapterKey: "chapter-2",
      chapterLabel: "Chapter 2",
      approvedDraftVersionId: "draft-2",
      wordCount: 80,
      reviewSummary: "Preserve the clean handoff.",
      chapterText: "This chapter text has trust and accountability.",
      quality: {
        score: 88,
        readiness: "strong",
        needsRevision: false,
        revisionPasses: 0,
        signals: [{ label: "Clarity", state: "pass", detail: "Clear." }],
      },
    }),
  ];

  assert.match(buildSourceDraftSignature(chapters), /chapter-1:draft-1/);

  const findings = buildBookWideEditorialFindings(chapters);
  assert.match(findings.citations.join(" "), /Chapter 1/);
  assert.match(findings.preservation.join(" "), /Chapter 2/);
  assert.match(findings.chapterInstructions.join(" "), /Chapter 1/);

  const instructions = buildFinalRevisionInstructions(
    chapters[0],
    {
      assessedAt: "2026-07-13T00:00:00.000Z",
      mode: "clarity-pass",
      chapterKey: null,
      assessmentSummary: "Assess.",
      bookWideFindings: findings,
      strengths: [],
      risks: [],
      chapterNotes: [{ chapterKey: "chapter-1", chapterLabel: "Chapter 1", observation: "Fix bridge.", priority: "high" }],
      nextActions: [],
      sourceDraftSignature: "sig",
    },
    ["Preserve the central story."],
  );
  assert.match(instructions.join(" "), /draft-1/);
  assert.match(instructions.join(" "), /Fix bridge/);
});

test("Editing revision support resolves targets and deterministic plans", () => {
  const chapters = [chapter({}), chapter({ chapterKey: "chapter-2", chapterLabel: "Chapter 2", approvedDraftVersionId: "draft-2" })];
  const manuscript: ManuscriptAssembly = {
    title: "Book",
    subtitle: null,
    assembledAt: "2026-07-13T00:00:00.000Z",
    sourceDraftSignature: "sig",
    chapterCount: chapters.length,
    totalWords: 180,
    editorialOverview: "Overview.",
    outstandingConcerns: [],
    chapters,
    fullText: "Full text.",
    chapterKeys: chapters.map((entry) => entry.chapterKey),
  };

  const target = resolveRevisionTargetChapters({
    manuscript,
    selectedChapterKeys: ["chapter-2"],
  });
  assert.deepEqual(target.selectedChapterKeys, ["chapter-2"]);
  assert.equal(target.focusChapters[0]?.chapterLabel, "Chapter 2");

  const plan = buildDeterministicRevisionPlan({
    chapters,
    assessment: null,
    focusChapterKey: null,
  });
  assert.equal(plan.focus, "whole-book");
  assert.equal(plan.chapterQueue.length, 2);
  assert.equal(plan.chapterQueue[0]?.priority, "high");
});
