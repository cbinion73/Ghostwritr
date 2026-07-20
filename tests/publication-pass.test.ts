import assert from "node:assert/strict";
import test from "node:test";

import type { PublicationPassFinding, PublicationPassReport } from "../src/lib/editing-types";
import {
  evaluatePublicationPassReport,
  PublicationPassReportSchema,
} from "../src/lib/workflows/editing/publication-pass";
import {
  DUST_PUBLICATION_BENCHMARK,
  scorePublicationPassBenchmark,
} from "../src/lib/workflows/editing/publication-pass-benchmark";
import { assertIndependentPublicationPassRouting } from "../src/lib/llm/routing";

function finding(overrides: Partial<PublicationPassFinding> = {}): PublicationPassFinding {
  return {
    id: "finding-1",
    chapterKey: "ch-1",
    chapterLabel: "Chapter One",
    locator: "Chapter One — paragraph 4",
    category: "copyedit",
    severity: "recommended",
    findThis: "the repeated phrase",
    changeTo: "the phrase",
    reason: "This is unnecessary repetition.",
    sourceTitle: null,
    sourceUrl: null,
    confidence: "high",
    disposition: "open",
    resolutionNote: null,
    adversarialNote: "Keep: exact and actionable.",
    ...overrides,
  };
}

function report(overrides: Partial<PublicationPassReport> = {}): PublicationPassReport {
  return {
    policyVersion: "publication-pass-v1",
    auditedAt: "2026-07-20T12:00:00.000Z",
    sourceDraftSignature: "sig-1",
    status: "ready",
    modelStatus: "complete",
    adversarialReviewed: true,
    summary: "Independent review complete.",
    findings: [],
    specialistPasses: [],
    styleSheet: { voicePrinciples: [], capitalization: [], scripture: [], originalLanguages: [], citations: [] },
    blockers: [],
    invalidFindingCount: 0,
    ...overrides,
  };
}

test("publication pass blocks missing, stale, partial, and unresolved required work", () => {
  assert.equal(evaluatePublicationPassReport(null, "sig-1").status, "blocked");
  assert.equal(evaluatePublicationPassReport(report(), "sig-2").status, "stale");
  assert.equal(evaluatePublicationPassReport(report({ modelStatus: "partial" }), "sig-1").status, "blocked");
  assert.equal(evaluatePublicationPassReport(report({
    findings: [finding({ category: "author-decision", severity: "blocker" })],
  }), "sig-1").status, "blocked");
});

test("Publication Pass specialist and adjudicator use independent provider families", () => {
  const routing = assertIndependentPublicationPassRouting();
  assert.notEqual(routing.specialist.split(":", 1)[0], routing.adjudicator.split(":", 1)[0]);
});

test("publication pass distinguishes recommended work from a cleared manuscript", () => {
  assert.equal(evaluatePublicationPassReport(report({ findings: [finding()] }), "sig-1").status, "needs-changes");
  assert.equal(evaluatePublicationPassReport(report({
    findings: [finding({ disposition: "resolved", resolutionNote: "Applied to final prose." })],
  }), "sig-1").status, "ready");
  assert.equal(evaluatePublicationPassReport(report({ invalidFindingCount: 1 }), "sig-1").status, "blocked");
});

test("publication pass report remains schema-valid after human resolutions", () => {
  const parsed = PublicationPassReportSchema.safeParse(report({
    findings: [finding({ disposition: "accepted-risk", resolutionNote: "Author confirmed this is intentional." })],
  }));
  assert.equal(parsed.success, true);
});

test("Dust benchmark requires confirmed editorial categories and rejects invented URLs", () => {
  const benchmarkFindings = DUST_PUBLICATION_BENCHMARK.map((item, index) => finding({
    id: `dust-${index}`,
    category: item.category,
    severity: item.requiredSeverity ?? "required",
    findThis: item.searchTerms.join(" "),
    reason: `Confirmed ${item.searchTerms.join(" ")} issue.`,
  }));
  const passing = scorePublicationPassBenchmark(report({ findings: benchmarkFindings }));
  assert.equal(passing.recall, 1);
  assert.equal(passing.passes, true);

  benchmarkFindings[0] = { ...benchmarkFindings[0], sourceUrl: "made-up.example/source" };
  const failing = scorePublicationPassBenchmark(report({ findings: benchmarkFindings }));
  assert.equal(failing.fabricatedSourceCount, 1);
  assert.equal(failing.passes, false);
});
