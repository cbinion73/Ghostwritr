import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WorkflowRunStatus } from "@prisma/client";
import { citationAuditRunDisposition } from "../src/lib/workflows/citation-audit/jobs";
import { assertCitationAuditPersistenceInput, mergeLockedCitationEntry, type LockedCitationEntry } from "../src/lib/repositories/citation-audit";
import type { CitationEvidence } from "../src/lib/workflows/citation-audit/contracts";

function read(path: string) { return readFileSync(path, "utf8"); }

test("nonfiction has visible Citation Audit between Editing and Typeset while fiction is unchanged", () => {
  const registry = read("src/lib/workflow-registry.ts");
  const nonfiction = registry.slice(registry.indexOf("const NONFICTION_WORKFLOW"), registry.indexOf("const FICTION_WORKFLOW"));
  assert.ok(nonfiction.indexOf("StageKey.EDITING") < nonfiction.indexOf("StageKey.CITATION_AUDIT"));
  assert.ok(nonfiction.indexOf("StageKey.CITATION_AUDIT") < nonfiction.indexOf("StageKey.TYPESET"));
  const fiction = registry.slice(registry.indexOf("const FICTION_WORKFLOW"), registry.indexOf("const WORKBOOK_WORKFLOW"));
  assert.equal(fiction.includes("StageKey.CITATION_AUDIT"), false);
});

test("citation jobs retry failed work and explicitly reset exhausted terminal work", () => {
  assert.equal(citationAuditRunDisposition(WorkflowRunStatus.FAILED, 1, 3), "REQUEUE");
  assert.equal(citationAuditRunDisposition(WorkflowRunStatus.FAILED, 3, 3), "UNCHANGED");
  assert.equal(citationAuditRunDisposition(WorkflowRunStatus.FAILED, 3, 3, true), "RESET");
  assert.equal(citationAuditRunDisposition(WorkflowRunStatus.SUCCEEDED, 1, 3, true), "RESET");
});

test("locked bibliography deduplicates one source while retaining all evidence keys and chapters", () => {
  const entries = new Map<string, LockedCitationEntry>();
  const base: CitationEvidence = { key: "RESEARCH_CLAIM:a", kind: "RESEARCH_CLAIM", recordId: "a", sourceRecordId: "source-1", claimOrStory: "A", supportingExcerpt: "A", verificationFingerprint: "v", sourceFingerprint: "s", citation: { title: "One Source", author: null, publisher: null, publishedAt: null, accessedAt: null, url: "https://example.test" } };
  mergeLockedCitationEntry(entries, base, "chapter-1");
  mergeLockedCitationEntry(entries, { ...base, key: "RESEARCH_CLAIM:b", recordId: "b" }, "chapter-2");
  assert.equal(entries.size, 1);
  assert.deepEqual([...entries.values()][0]?.evidenceKeys, ["RESEARCH_CLAIM:a", "RESEARCH_CLAIM:b"]);
  assert.deepEqual([...entries.values()][0]?.chapters, ["chapter-1", "chapter-2"]);
});

test("citation review route is ownership scoped and stale-safe", () => {
  const route = read("src/app/api/books/[slug]/citation-audit/route.ts");
  assert.ok(route.includes("requireAuthenticatedAppUser")); assert.ok(route.includes("getBookHeaderBySlugForUserOrThrow")); assert.ok(route.includes("expectedAuditFingerprint")); assert.ok(route.includes("409"));
});

test("citation UI preserves the newest append-only review returned by the API", () => {
  const ui = read("src/app/books/[slug]/citation-audit/citation-audit-content.tsx");
  assert.ok(ui.includes("if (!latest.has(review.findingFingerprint))"));
});

test("durable audit jobs reuse workflow leases and pause rather than fail for budget confirmation", () => {
  const jobs = read("src/lib/workflows/citation-audit/jobs.ts");
  for (const seam of ["createWorkflowRun", "claimWorkflowRun", "startWorkflowRunHeartbeat", "releaseWorkflowRunForBudgetConfirmation", "completeWorkflowRun"]) assert.ok(jobs.includes(seam), seam);
  assert.ok(jobs.includes("citation-audit:${input.chapterKey}:${auditFingerprint}"));
});

test("schema stores exact final version, literal spans, reviews, state, and immutable ledger", () => {
  const schema = read("prisma/schema.prisma");
  for (const contract of ["CITATION_AUDIT", "model CitationAuditFinding", "claimStart", "claimEnd", "approvedFinalVersionId", "model CitationAuditReview", "model CitationAuditChapterState", "model CitationLedger", "citationStyle CitationStyle"]) assert.ok(schema.includes(contract), contract);
});

test("persistence rejects an empty finding set for nonempty final prose", () => {
  assert.throws(() => assertCitationAuditPersistenceInput("A factual sentence.", []), /empty finding set/);
  assert.doesNotThrow(() => assertCitationAuditPersistenceInput("", []));
});
