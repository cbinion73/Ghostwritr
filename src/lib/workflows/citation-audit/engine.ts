import {
  CITATION_AUDIT_POLICY_VERSION,
  buildSourceLedgerFingerprint,
  exactHash,
  stableHash,
  type CitationAuditFinding,
  type CitationEvidence,
  type ExtractedFinalClaim,
} from "./contracts";

export type CitationAuditDependencies = {
  extractClaims(input: { finalText: string; evidence: CitationEvidence[] }): Promise<ExtractedFinalClaim[]>;
  checkLink?: (url: string) => Promise<"FOUND" | "NOT_FOUND" | "INACCESSIBLE">;
};

export async function auditFinalChapter(input: {
  finalText: string;
  evidence: CitationEvidence[];
  policyVersion?: string;
  checkChangedLinks?: boolean;
}, dependencies: CitationAuditDependencies) {
  const policyVersion = input.policyVersion ?? CITATION_AUDIT_POLICY_VERSION;
  const sourceLedgerFingerprint = buildSourceLedgerFingerprint(input.evidence);
  const evidenceByKey = new Map(input.evidence.map((item) => [item.key, item]));
  const extracted = await dependencies.extractClaims({ finalText: input.finalText, evidence: input.evidence });
  const coveredRanges = extracted.flatMap((claim) => {
    const literal = input.finalText.slice(claim.claimStart, claim.claimEnd);
    return claim.claimStart >= 0 && claim.claimEnd > claim.claimStart && literal === claim.claimText
      ? [[claim.claimStart, claim.claimEnd] as const]
      : [];
  });
  const omittedLikelyClaims: ExtractedFinalClaim[] = [];
  const sentencePattern = /[^.!?\n]+[.!?]?/g;
  let sentence: RegExpExecArray | null;
  while ((sentence = sentencePattern.exec(input.finalText)) !== null) {
    const rawText = sentence[0];
    const leading = rawText.length - rawText.trimStart().length;
    const text = rawText.trim();
    const words = text.split(/\s+/).length;
    if (!text || words < 3 || !/(?:\d|%|“|”|"|according to|research|study|report|survey|data|found|showed|published|\b(?:is|are|was|were|has|have|causes?|reduces?|increases?|improves?|leads?|results?|rose|fell)\b)/i.test(text)) continue;
    const start = sentence.index + leading;
    const end = start + text.length;
    if (coveredRanges.some(([from, to]) => from <= start && to >= end)) continue;
    omittedLikelyClaims.push({ claimText: text, claimStart: start, claimEnd: end, evidenceKey: null, assessment: "UNSUPPORTED", notes: "Potential external claim was omitted by the verifier and must be reviewed." });
  }

  if (input.finalText.trim() && extracted.length === 0 && omittedLikelyClaims.length === 0) {
    const text = input.finalText.trim();
    const start = input.finalText.indexOf(text);
    omittedLikelyClaims.push({ claimText: text, claimStart: start, claimEnd: start + text.length, evidenceKey: null, assessment: "UNSUPPORTED", notes: "The verifier returned zero claims for nonempty final prose; human review is required." });
  }
  const findings: CitationAuditFinding[] = [];
  const usedEvidenceKeys = new Set<string>();

  for (const raw of [...extracted, ...omittedLikelyClaims]) {
    const literal = input.finalText.slice(raw.claimStart, raw.claimEnd);
    const spanValid = raw.claimStart >= 0 && raw.claimEnd > raw.claimStart && literal === raw.claimText;
    const evidence = raw.evidenceKey ? evidenceByKey.get(raw.evidenceKey) : undefined;
    if (evidence) usedEvidenceKeys.add(evidence.key);
    let assessment = spanValid ? raw.assessment : "UNSUPPORTED" as const;
    let notes = spanValid ? raw.notes ?? null : "Verifier returned a claim span that is not literal final prose.";
    if (assessment === "SUPPORTED" && !evidence) {
      assessment = "MISSING_SOURCE";
      notes = "A supported verdict must reference current Gate 1 admitted evidence.";
    }
    if (assessment === "SUPPORTED" && evidence && raw.supportingExcerpt?.trim() !== evidence.supportingExcerpt.trim()) {
      assessment = "DISTORTED";
      notes = "The cited support excerpt does not exactly match the admitted evidence excerpt.";
    }
    if (assessment === "SUPPORTED" && evidence && input.checkChangedLinks && dependencies.checkLink) {
      const state = await dependencies.checkLink(evidence.citation.url);
      if (state !== "FOUND") {
        assessment = state === "NOT_FOUND" ? "MISSING_SOURCE" : "INACCESSIBLE";
        notes = `Current link check returned ${state.toLowerCase().replace("_", " ")}.`;
      }
    }
    const claimFingerprint = exactHash(`${raw.claimStart}:${raw.claimEnd}:${raw.claimText}`);
    findings.push({
      ...raw,
      assessment,
      notes,
      claimFingerprint,
      sourceLedgerFingerprint,
      policyVersion,
      findingFingerprint: stableHash({ claimFingerprint, evidenceKey: raw.evidenceKey, assessment, sourceLedgerFingerprint, policyVersion }),
    });
  }

  const unusedFindings = input.evidence.filter((item) => !usedEvidenceKeys.has(item.key)).map((item) => {
    const claimFingerprint = exactHash(`unused:${item.key}:${item.claimOrStory}`);
    return {
      claimText: item.claimOrStory, claimStart: 0, claimEnd: 0, evidenceKey: item.key,
      assessment: "UNUSED" as const, supportingExcerpt: item.supportingExcerpt,
      notes: "Current Gate 1 evidence is not used by any audited final-prose claim.",
      claimFingerprint, sourceLedgerFingerprint, policyVersion,
      findingFingerprint: stableHash({ claimFingerprint, evidenceKey: item.key, assessment: "UNUSED", sourceLedgerFingerprint, policyVersion }),
    };
  });
  return {
    findings: [...findings, ...unusedFindings],
    usedEvidenceKeys: [...usedEvidenceKeys].sort(),
    unusedEvidenceKeys: input.evidence.map((item) => item.key).filter((key) => !usedEvidenceKeys.has(key)).sort(),
    sourceLedgerFingerprint,
  };
}
