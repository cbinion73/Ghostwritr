import test from "node:test";
import assert from "node:assert/strict";

import { auditFinalChapter } from "../src/lib/workflows/citation-audit/engine";
import { buildAuditFingerprint, buildSourceLedgerFingerprint, type CitationEvidence } from "../src/lib/workflows/citation-audit/contracts";

const evidence: CitationEvidence = {
  key: "RESEARCH_CLAIM:fact-1", kind: "RESEARCH_CLAIM", recordId: "fact-1", sourceRecordId: "source-1",
  claimOrStory: "The program reduced errors by 30%.", supportingExcerpt: "Errors declined by 30 percent after implementation.",
  verificationFingerprint: "verified-1", sourceFingerprint: "source-fp-1",
  citation: { title: "Program Results", author: "A. Writer", publisher: "Institute", publishedAt: "2025-01-02", accessedAt: "2026-07-14", url: "https://example.test/results" },
};

test("final citation audit accepts only literal spans and exact current admitted excerpts", async () => {
  const finalText = "The program reduced errors by 30%.";
  const result = await auditFinalChapter({ finalText, evidence: [evidence] }, {
    extractClaims: async () => [{ claimText: finalText, claimStart: 0, claimEnd: finalText.length, evidenceKey: evidence.key, assessment: "SUPPORTED", supportingExcerpt: evidence.supportingExcerpt }],
  });
  assert.equal(result.findings[0]?.assessment, "SUPPORTED");
  assert.deepEqual(result.usedEvidenceKeys, [evidence.key]);
  assert.deepEqual(result.unusedEvidenceKeys, []);
});

test("invalid spans, unknown evidence, changed excerpts, and changed links fail closed", async () => {
  const finalText = "The program reduced errors by 30%.";
  const invalid = await auditFinalChapter({ finalText, evidence: [evidence] }, { extractClaims: async () => [{ claimText: "not literal", claimStart: 0, claimEnd: 3, evidenceKey: evidence.key, assessment: "SUPPORTED", supportingExcerpt: evidence.supportingExcerpt }] });
  assert.equal(invalid.findings[0]?.assessment, "UNSUPPORTED");
  const unknown = await auditFinalChapter({ finalText, evidence: [evidence] }, { extractClaims: async () => [{ claimText: finalText, claimStart: 0, claimEnd: finalText.length, evidenceKey: "RESEARCH_CLAIM:missing", assessment: "SUPPORTED", supportingExcerpt: evidence.supportingExcerpt }] });
  assert.equal(unknown.findings[0]?.assessment, "MISSING_SOURCE");
  const distorted = await auditFinalChapter({ finalText, evidence: [evidence] }, { extractClaims: async () => [{ claimText: finalText, claimStart: 0, claimEnd: finalText.length, evidenceKey: evidence.key, assessment: "SUPPORTED", supportingExcerpt: "Different excerpt" }] });
  assert.equal(distorted.findings[0]?.assessment, "DISTORTED");
  const missing = await auditFinalChapter({ finalText, evidence: [evidence], checkChangedLinks: true }, { extractClaims: async () => [{ claimText: finalText, claimStart: 0, claimEnd: finalText.length, evidenceKey: evidence.key, assessment: "SUPPORTED", supportingExcerpt: evidence.supportingExcerpt }], checkLink: async () => "NOT_FOUND" });
  assert.equal(missing.findings[0]?.assessment, "MISSING_SOURCE");
});

test("audit identity changes with exact final prose, source ledger, style, and policy", () => {
  const base = { approvedFinalVersionId: "v1", finalText: "Text", sourceLedgerFingerprint: "sources", citationStyle: "CHICAGO_17" };
  const fingerprint = buildAuditFingerprint(base);
  assert.notEqual(fingerprint, buildAuditFingerprint({ ...base, finalText: "Text changed" }));
  assert.notEqual(fingerprint, buildAuditFingerprint({ ...base, citationStyle: "APA_7" }));
  assert.notEqual(fingerprint, buildAuditFingerprint({ ...base, sourceLedgerFingerprint: "other" }));
});

test("source ledger identity changes when a manual-exception decision or reason changes", () => {
  const first = buildSourceLedgerFingerprint([{ ...evidence, admissionFingerprint: "exception:reason-a" }]);
  const second = buildSourceLedgerFingerprint([{ ...evidence, admissionFingerprint: "exception:reason-b" }]);
  assert.notEqual(first, second);
});

test("deterministic coverage catches likely external claims omitted by model extraction", async () => {
  const finalText = "A transition follows. The 2025 study found that errors fell 30%.";
  const result = await auditFinalChapter({ finalText, evidence: [evidence] }, { extractClaims: async () => [] });
  const unsupported = result.findings.filter((finding) => finding.assessment === "UNSUPPORTED");
  assert.equal(unsupported.length, 1);
  assert.equal(unsupported[0]?.claimText, "The 2025 study found that errors fell 30%.");
});

test("zero-claim output fails closed for ordinary factual prose and records unused evidence", async () => {
  const finalText = "The program is the largest provider in the region.";
  const result = await auditFinalChapter({ finalText, evidence: [evidence] }, { extractClaims: async () => [] });
  assert.ok(result.findings.some((finding) => finding.assessment === "UNSUPPORTED" && finding.claimText === finalText));
  assert.ok(result.findings.some((finding) => finding.assessment === "UNUSED" && finding.evidenceKey === evidence.key));
  assert.deepEqual(result.unusedEvidenceKeys, [evidence.key]);
});

test("partial extraction cannot hide a second uncovered factual sentence", async () => {
  const first = "The program reduced errors by 30%.";
  const second = "The organization is the largest provider in the region.";
  const finalText = `${first} ${second}`;
  const result = await auditFinalChapter({ finalText, evidence: [evidence] }, { extractClaims: async () => [{ claimText: first, claimStart: 0, claimEnd: first.length, evidenceKey: evidence.key, assessment: "SUPPORTED", supportingExcerpt: evidence.supportingExcerpt }] });
  assert.ok(result.findings.some((finding) => finding.assessment === "UNSUPPORTED" && finding.claimText === second));
});

test("partial extraction cannot hide a short numeric factual claim", async () => {
  const first = "The program reduced errors by 30%.";
  const second = "Sales rose 20%.";
  const result = await auditFinalChapter({ finalText: `${first} ${second}`, evidence: [evidence] }, {
    extractClaims: async () => [{ claimText: first, claimStart: 0, claimEnd: first.length, evidenceKey: evidence.key, assessment: "SUPPORTED", supportingExcerpt: evidence.supportingExcerpt }],
  });
  assert.ok(result.findings.some((finding) => finding.assessment === "UNSUPPORTED" && finding.claimText === second));
});
