import { createHash } from "node:crypto";

export const CITATION_AUDIT_POLICY_VERSION = "citation-audit-v1";

export type CitationEvidence = {
  key: string;
  kind: "RESEARCH_CLAIM" | "EXTERNAL_STORY";
  recordId: string;
  sourceRecordId: string;
  claimOrStory: string;
  supportingExcerpt: string;
  verificationFingerprint: string;
  admissionFingerprint?: string;
  admissionDecision?: string;
  sourceFingerprint: string;
  citation: {
    title: string;
    author: string | null;
    publisher: string | null;
    publishedAt: string | null;
    accessedAt: string | null;
    url: string;
    doi?: string | null;
    citationOverride?: string;
  };
};

export type ExtractedFinalClaim = {
  claimText: string;
  claimStart: number;
  claimEnd: number;
  evidenceKey: string | null;
  assessment: "SUPPORTED" | "MISSING_SOURCE" | "INACCESSIBLE" | "CONTRADICTED" | "DISTORTED" | "UNSUPPORTED" | "UNUSED";
  supportingExcerpt?: string | null;
  notes?: string | null;
};

export type CitationAuditFinding = ExtractedFinalClaim & {
  claimFingerprint: string;
  findingFingerprint: string;
  sourceLedgerFingerprint: string;
  policyVersion: string;
};

export function exactHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stableHash(value: unknown) {
  return exactHash(JSON.stringify(value));
}

export function buildSourceLedgerFingerprint(evidence: CitationEvidence[]) {
  return stableHash([...evidence]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((item) => ({
      key: item.key,
      verificationFingerprint: item.verificationFingerprint,
      admissionFingerprint: item.admissionFingerprint ?? null,
      sourceFingerprint: item.sourceFingerprint,
      citation: item.citation,
    })));
}

export function buildAuditFingerprint(input: {
  approvedFinalVersionId: string;
  finalText: string;
  sourceLedgerFingerprint: string;
  citationStyle: string;
  policyVersion?: string;
}) {
  return stableHash({
    approvedFinalVersionId: input.approvedFinalVersionId,
    finalTextHash: exactHash(input.finalText),
    sourceLedgerFingerprint: input.sourceLedgerFingerprint,
    citationStyle: input.citationStyle,
    policyVersion: input.policyVersion ?? CITATION_AUDIT_POLICY_VERSION,
  });
}

export function isBlockingFinding(kind: CitationAuditFinding["assessment"] | "UNUSED") {
  return kind !== "SUPPORTED" && kind !== "UNUSED";
}
