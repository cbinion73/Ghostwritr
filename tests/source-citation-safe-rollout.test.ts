import assert from "node:assert/strict";
import test from "node:test";

import {
  BookWorkflowType,
  CitationAuditChapterStatus,
  SourceAdmissionDecision,
  SourceVerificationVerdict,
} from "@prisma/client";

import { evaluatePublicationCitationGate } from "../src/lib/publication-citation-gate";
import { isCurrentHumanAdmission } from "../src/lib/repositories/source-verification";
import { mergeLockedCitationEntry, type LockedCitationEntry } from "../src/lib/repositories/citation-audit";
import { auditFinalChapter } from "../src/lib/workflows/citation-audit/engine";
import type { CitationEvidence } from "../src/lib/workflows/citation-audit/contracts";
import {
  type AdversarialVerificationResult,
  type VerificationCandidate,
} from "../src/lib/workflows/source-verification/contracts";
import { verifySourceCandidate } from "../src/lib/workflows/source-verification/engine";
import { executeSourceVerificationCandidate, type SourceVerificationExecutionDependencies } from "../src/lib/workflows/source-verification/jobs";

const baseCandidate: VerificationCandidate = {
  kind: "RESEARCH_CLAIM",
  bookId: "book-safe-rollout",
  chapterKey: "chapter-1",
  artifactVersionId: "research-v1",
  recordId: "claim-1",
  sourceRecordId: "source-1",
  sourceUrl: "https://sources.invalid/report",
  sourceTitle: "Verified Report",
  sourceAuthor: "Ada Author",
  sourcePublisher: "Truth Press",
  sourcePublishedAt: "2024-01-01",
  accessMode: "PUBLIC_WEB",
  claimOrStory: "The intervention reduced errors by 30 percent.",
};

test("safe rollout blocks fabricated, inaccessible, unsupported, and quotation-mismatch evidence without network", async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = (async () => {
    networkCalls += 1;
    throw new Error("Package 9 network tripwire");
  }) as typeof fetch;
  try {
    const fabricated = await verifySourceCandidate(baseCandidate, {
      loadSnapshot: async () => null,
      locatePublicSource: async () => ({ state: "NOT_FOUND" }),
      verifyAgainstText: async () => { throw new Error("not reached"); },
    });
    const inaccessible = await verifySourceCandidate(baseCandidate, {
      loadSnapshot: async () => null,
      locatePublicSource: async () => ({ state: "INACCESSIBLE" }),
      verifyAgainstText: async () => { throw new Error("not reached"); },
    });
    const unsupported = await verifySourceCandidate(baseCandidate, {
      loadSnapshot: async () => "The report discusses the intervention but reports no outcome.",
      verifyAgainstText: async () => ({ verdict: "REJECTED", reasonCodes: ["UNSUPPORTED_DETAIL"] }),
    });
    const badQuote = await verifySourceCandidate(baseCandidate, {
      loadSnapshot: async () => "Errors declined after implementation.",
      verifyAgainstText: async () => ({ verdict: "VERIFIED", reasonCodes: ["LITERAL_SUPPORT"], supportingExcerpt: "Errors declined by 30 percent." }),
    });
    assert.deepEqual(
      [fabricated.verdict, inaccessible.verdict, unsupported.verdict, badQuote.verdict],
      ["NOT_FOUND", "INACCESSIBLE", "REJECTED", "REJECTED"],
    );
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("interrupted verification resumes exactly once and exact replay makes zero provider calls", async () => {
  let snapshot = "The report says the intervention reduced errors by 30 percent.";
  const candidates = [
    baseCandidate,
    { ...baseCandidate, recordId: "claim-2", claimOrStory: "The report was published in 2024." },
  ];
  const persisted = new Map<string, AdversarialVerificationResult & { id: string }>();
  let providerCalls = 0;
  let interruptAfter = 1;
  let lookupCalls = 0;

  const dependencies: SourceVerificationExecutionDependencies = {
    loadPersistedSnapshot: async () => snapshot,
    locatePublicSource: async () => { lookupCalls += 1; return { state: "NOT_FOUND" }; },
    resolveDoi: async () => ({ state: "NOT_FOUND" }),
    findCached: async (inputFingerprint) => [...persisted.values()].find((value) => value.inputFingerprint === inputFingerprint) as never ?? null,
    reuseCached: async () => undefined,
    append: async (result) => {
      persisted.set(result.verificationFingerprint, { ...result, id: `result-${persisted.size + 1}` });
    },
    verificationDependencies: async () => ({
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      loadSnapshot: async () => snapshot,
      verifyAgainstText: async ({ candidate: current }) => {
        if (providerCalls === interruptAfter) throw new Error("simulated lost lease");
        providerCalls += 1;
        return {
          verdict: "VERIFIED",
          reasonCodes: ["LITERAL_SUPPORT"],
          supportingExcerpt: current.recordId === "claim-1" ? "reduced errors by 30 percent" : "report says the intervention",
        };
      },
    }),
  };

  async function run() {
    for (const candidate of candidates) {
      await executeSourceVerificationCandidate({ candidate, workflowRunId: "run-1", policyVersion: "gate1-v1" }, dependencies);
    }
  }

  await assert.rejects(run, /simulated lost lease/);
  assert.equal(persisted.size, 1);
  interruptAfter = Number.POSITIVE_INFINITY;
  await run();
  assert.equal(persisted.size, 2);
  assert.equal(providerCalls, 2);
  await run();
  assert.equal(providerCalls, 2, "exact replay must make zero additional provider calls");
  assert.equal(lookupCalls, 0, "exact snapshot cache replay must not perform URL lookup");

  candidates[1] = { ...candidates[1], claimOrStory: "The report was published in late 2024." };
  await run();
  assert.equal(providerCalls, 3, "changed claim must miss the exact cache");
  snapshot = `${snapshot} Updated source bytes.`;
  await run();
  assert.equal(providerCalls, 5, "changed source must miss the exact cache for both records");
  await executeSourceVerificationCandidate({ candidate: candidates[0]!, policyVersion: "gate1-v2" }, dependencies);
  assert.equal(providerCalls, 6, "changed policy must miss the exact cache");
});

test("manual exceptions remain exact-fingerprint decisions", () => {
  const current = {
    artifactVersionId: "research-v1",
    verificationResultId: "result-1",
    verificationFingerprint: "verification-1",
    verdict: SourceVerificationVerdict.INACCESSIBLE,
    review: {
      artifactVersionId: "research-v1",
      verificationResultId: "result-1",
      verificationFingerprint: "verification-1",
      decision: SourceAdmissionDecision.MANUAL_EXCEPTION,
    },
  };
  assert.equal(isCurrentHumanAdmission(current), true);
  assert.equal(isCurrentHumanAdmission({ ...current, verificationResultId: "result-2" }), false);
  assert.equal(isCurrentHumanAdmission({ ...current, verificationFingerprint: "verification-2" }), false);
});

test("terminal input cache is checked before URL or DOI lookup", async () => {
  const stored: Array<AdversarialVerificationResult & { id: string }> = [];
  let lookups = 0;
  const deps: SourceVerificationExecutionDependencies = {
    loadPersistedSnapshot: async () => null,
    locatePublicSource: async () => { lookups += 1; return { state: "NOT_FOUND" }; },
    resolveDoi: async () => { lookups += 1; return { state: "NOT_FOUND" }; },
    findCached: async (inputFingerprint) => stored.find((item) => item.inputFingerprint === inputFingerprint) as never ?? null,
    reuseCached: async () => undefined,
    append: async (result) => { stored.push({ ...result, id: "terminal-1" }); },
    verificationDependencies: async () => { throw new Error("provider must not run"); },
  };
  const missing = { ...baseCandidate, sourceDoi: "10.1000/missing" };
  assert.equal(await executeSourceVerificationCandidate({ candidate: missing, policyVersion: "gate1-v1" }, deps), "completed");
  const firstLookups = lookups;
  assert.equal(await executeSourceVerificationCandidate({ candidate: missing, policyVersion: "gate1-v1" }, deps), "reused");
  assert.equal(lookups, firstLookups);
});

test("an Opus-introduced claim blocks only the changed chapter and publication", async () => {
  const evidence: CitationEvidence = {
    key: "RESEARCH_CLAIM:claim-1",
    kind: "RESEARCH_CLAIM",
    recordId: "claim-1",
    sourceRecordId: "source-1",
    claimOrStory: baseCandidate.claimOrStory,
    supportingExcerpt: "reduced errors by 30 percent",
    verificationFingerprint: "verification-1",
    sourceFingerprint: "source-1",
    citation: {
      title: "Verified Report",
      author: "Ada Author",
      publisher: "Truth Press",
      publishedAt: "2024-01-01",
      accessedAt: "2026-07-14",
      url: "https://sources.invalid/report",
    },
  };
  const chapter1 = "The intervention reduced errors by 30 percent.";
  const chapter2 = "This chapter contains the author's reflection.";
  const approved = await auditFinalChapter({ finalText: chapter1, evidence: [evidence] }, {
    extractClaims: async () => [{ claimText: chapter1, claimStart: 0, claimEnd: chapter1.length, evidenceKey: evidence.key, assessment: "SUPPORTED", supportingExcerpt: evidence.supportingExcerpt }],
  });
  const changed = `${chapter1} A new study proved the method doubles revenue.`;
  const stale = await auditFinalChapter({ finalText: changed, evidence: [evidence] }, {
    extractClaims: async () => [{ claimText: chapter1, claimStart: 0, claimEnd: chapter1.length, evidenceKey: evidence.key, assessment: "SUPPORTED", supportingExcerpt: evidence.supportingExcerpt }],
  });
  const unchanged = await auditFinalChapter({ finalText: chapter2, evidence: [] }, { extractClaims: async () => [] });
  assert.equal(approved.findings.some((finding) => finding.assessment === "UNSUPPORTED"), false);
  assert.equal(stale.findings.some((finding) => finding.assessment === "UNSUPPORTED" && finding.claimText.includes("doubles revenue")), true);
  assert.equal(unchanged.findings.some((finding) => finding.assessment === "UNSUPPORTED"), true, "zero-claim prose remains human-reviewable rather than silently trusted");

  const gate = evaluatePublicationCitationGate({
    workflowType: BookWorkflowType.NONFICTION,
    canonicalChapterKeys: ["chapter-1", "chapter-2"],
    approvals: [
      { chapterId: "chapter-1", approvedFinalVersionId: "final-v2" },
      { chapterId: "chapter-2", approvedFinalVersionId: "final-v1" },
    ],
    states: [
      { chapterKey: "chapter-1", approvedFinalVersionId: "final-v1", status: CitationAuditChapterStatus.APPROVED, policyVersion: "citation-audit-v1", citationStyle: "CHICAGO_17" },
      { chapterKey: "chapter-2", approvedFinalVersionId: "final-v1", status: CitationAuditChapterStatus.APPROVED, policyVersion: "citation-audit-v1", citationStyle: "CHICAGO_17" },
    ],
    citationStyle: "CHICAGO_17",
    hasCurrentLedger: false,
    ledgerValid: false,
  });
  assert.equal(gate.ready, false);
  assert.ok(gate.blockers.some((blocker) => blocker.includes("chapter-1")));
  assert.equal(gate.blockers.some((blocker) => blocker.includes("chapter-2")), false);
});

test("canonical DOI deduplicates distinct rows and kinds while conflicting metadata blocks lock", () => {
  const entries = new Map<string, LockedCitationEntry>();
  const evidence: CitationEvidence = {
    key: "RESEARCH_CLAIM:one",
    kind: "RESEARCH_CLAIM",
    recordId: "one",
    sourceRecordId: "source-shared",
    claimOrStory: "Claim one",
    supportingExcerpt: "Claim one",
    verificationFingerprint: "v1",
    sourceFingerprint: "s1",
    citation: { title: "Shared Source", author: null, publisher: null, publishedAt: null, accessedAt: null, url: "https://doi.org/10.1000/SHARED", doi: "10.1000/shared" },
  };
  mergeLockedCitationEntry(entries, evidence, "chapter-1");
  mergeLockedCitationEntry(entries, { ...evidence, key: "EXTERNAL_STORY:two", kind: "EXTERNAL_STORY", recordId: "two", sourceRecordId: "different-db-row", citation: { ...evidence.citation, url: "https://doi.org/10.1000/shared" } }, "chapter-2");
  assert.equal(entries.size, 1);
  assert.deepEqual([...entries.values()][0]?.chapters, ["chapter-1", "chapter-2"]);
  assert.throws(() => mergeLockedCitationEntry(entries, { ...evidence, sourceRecordId: "third-row", citation: { ...evidence.citation, title: "Conflicting Title" } }, "chapter-3"), /Conflicting locked citation metadata/);
});

test("policy or citation-style changes invalidate an otherwise approved publication state", () => {
  const base = {
    workflowType: BookWorkflowType.NONFICTION,
    canonicalChapterKeys: ["chapter-1"],
    approvals: [{ chapterId: "chapter-1", approvedFinalVersionId: "final-v1" }],
    states: [{ chapterKey: "chapter-1", approvedFinalVersionId: "final-v1", status: CitationAuditChapterStatus.APPROVED, policyVersion: "citation-audit-v1", citationStyle: "CHICAGO_17" }],
    citationStyle: "CHICAGO_17",
    hasCurrentLedger: true,
    ledgerValid: true,
  };
  assert.equal(evaluatePublicationCitationGate(base).ready, true);
  assert.equal(evaluatePublicationCitationGate({ ...base, states: [{ ...base.states[0]!, policyVersion: "citation-audit-v0" }] }).ready, false);
  assert.equal(evaluatePublicationCitationGate({ ...base, citationStyle: "APA_7" }).ready, false);
});
