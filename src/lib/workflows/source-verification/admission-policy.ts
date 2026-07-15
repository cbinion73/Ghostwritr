import { SourceAdmissionDecision, SourceVerificationVerdict } from "@prisma/client";

export function validateSourceAdmissionDecision(input: {
  decision: SourceAdmissionDecision;
  verdict: SourceVerificationVerdict;
  corrections: unknown;
  notes: string;
}) {
  if (input.decision === SourceAdmissionDecision.APPROVE && input.verdict !== SourceVerificationVerdict.VERIFIED) {
    return "Only a verified source can be approved.";
  }
  if (input.decision === SourceAdmissionDecision.APPROVE_CORRECTED) {
    if (input.verdict !== SourceVerificationVerdict.VERIFIED_WITH_CORRECTION) {
      return "Corrected approval requires a corrected verifier verdict.";
    }
    if (!Array.isArray(input.corrections) || input.corrections.length === 0) {
      return "Corrected approval requires at least one explicit correction.";
    }
  }
  if (input.decision === SourceAdmissionDecision.MANUAL_EXCEPTION && !input.notes.trim()) {
    return "A documented reason is required for a manual exception.";
  }
  return null;
}

export function summarizeSourceAdmissionReadiness(input: {
  hasResearchPack: boolean;
  hasExternalStoryPack: boolean;
  records: Array<{ admitted: boolean; decided?: boolean; kind?: "RESEARCH_CLAIM" | "EXTERNAL_STORY" }>;
}) {
  const admitted = input.records.filter((record) => record.admitted).length;
  const undecided = input.records.filter((record) => record.decided !== true).length;
  const admittedResearch = input.records.filter((record) => record.kind === "RESEARCH_CLAIM" && record.admitted).length;
  const admittedStories = input.records.filter((record) => record.kind === "EXTERNAL_STORY" && record.admitted).length;
  return {
    total: input.records.length,
    admitted,
    excluded: input.records.filter((record) => record.decided === true && !record.admitted).length,
    undecided,
    blocked: undecided,
    ready:
      input.hasResearchPack &&
      input.hasExternalStoryPack &&
      input.records.length > 0 &&
      undecided === 0 &&
      admittedResearch > 0 &&
      admittedStories > 0,
  };
}

export function isSourcePackAdmissionReady(totalRecords: number, admissions: Iterable<{ admitted: boolean; decision: SourceAdmissionDecision | null }>) {
  const values = [...admissions];
  return totalRecords > 0 && values.length === totalRecords && values.every((value) => value.decision !== null && value.decision !== SourceAdmissionDecision.REOPEN) && values.some((value) => value.admitted);
}
