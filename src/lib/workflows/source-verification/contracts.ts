import { createHash } from "node:crypto";

export const SOURCE_VERIFICATION_POLICY_VERSION = "gate1-v1";

export type SourceEvidenceKind = "RESEARCH_CLAIM" | "EXTERNAL_STORY";
export type SourceAccessMode = "PUBLIC_WEB" | "PRIVATE_UPLOAD";
export type SourceEvidenceRole = "PRIMARY" | "SECONDARY" | "UNKNOWN";

export type AdversarialVerificationVerdict =
  | "VERIFIED"
  | "VERIFIED_WITH_CORRECTION"
  | "NEEDS_CORROBORATION"
  | "NOT_FOUND"
  | "INACCESSIBLE"
  | "CONTRADICTED"
  | "REJECTED";

export type AdversarialReasonCode =
  | "LITERAL_SUPPORT"
  | "METADATA_CORRECTION"
  | "MISSING_CORROBORATION"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_INACCESSIBLE"
  | "CLAIM_CONTRADICTED"
  | "UNSUPPORTED_DETAIL"
  | "MISSING_SNAPSHOT"
  | "DOI_RESOLUTION"
  | "DOI_NOT_FOUND"
  | "SECONDARY_AS_PRIMARY"
  | "INVALID_VERIFIER_OUTPUT";

export type VerificationCandidate = {
  kind: SourceEvidenceKind;
  bookId: string;
  chapterKey: string;
  artifactVersionId: string;
  recordId: string;
  sourceRecordId: string;
  sourceUrl: string | null;
  sourceTitle: string;
  sourceAuthor?: string | null;
  sourcePublisher?: string | null;
  sourcePublishedAt?: string | null;
  sourceDoi?: string | null;
  sourceRole?: SourceEvidenceRole;
  claimedAsPrimary?: boolean;
  /** Canonical changes established by an identifier resolver before cache lookup. */
  resolutionCorrections?: VerificationCorrection[];
  accessMode: SourceAccessMode;
  claimOrStory: string;
  existingExcerpt?: string | null;
  requiresCorroboration?: boolean;
  /** Hash of the exact persisted source snapshot/extraction, when available. */
  sourceContentFingerprint?: string | null;
};

export type VerificationCorrection = {
  field: "title" | "author" | "publisher" | "publishedAt" | "citation" | "url" | "doi" | "sourceRole";
  original: string | null;
  corrected: string;
};

export type AdversarialVerificationResult = {
  candidate: VerificationCandidate;
  sourceFingerprint: string;
  claimFingerprint: string;
  inputFingerprint: string;
  verificationFingerprint: string;
  policyVersion: string;
  verdict: AdversarialVerificationVerdict;
  reasonCodes: AdversarialReasonCode[];
  supportingExcerpt: string | null;
  contradictingExcerpt: string | null;
  corrections: VerificationCorrection[];
  notes: string;
  verifiedAt: string;
};

function stable(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function sha256(parts: Array<string | null | undefined>) {
  return createHash("sha256").update(parts.map(stable).join("\u001f")).digest("hex");
}

/** Hash exact bytes. Source text is evidence, so case and whitespace matter. */
export function sha256Exact(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** URLs have case-insensitive schemes/hosts but may have case-sensitive paths. */
export function normalizeSourceUrl(value: string | null | undefined) {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value.trim());
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function buildVerificationFingerprints(
  candidate: VerificationCandidate,
  policyVersion = SOURCE_VERIFICATION_POLICY_VERSION,
) {
  const sourceMetadataFingerprint = sha256Exact([
    stable(candidate.accessMode),
    normalizeSourceUrl(candidate.sourceUrl),
    stable(candidate.sourceTitle),
    stable(candidate.sourceAuthor),
    stable(candidate.sourcePublisher),
    stable(candidate.sourcePublishedAt),
    stable(candidate.sourceDoi),
    stable(candidate.sourceRole),
  ].join("\u001f"));
  const sourceFingerprint = sha256Exact(
    `${sourceMetadataFingerprint}\u001f${candidate.sourceContentFingerprint ?? ""}`,
  );
  const claimFingerprint = sha256Exact([
    candidate.kind,
    candidate.claimOrStory,
    candidate.existingExcerpt ?? "",
    candidate.requiresCorroboration ? "requires-corroboration" : "single-source",
    candidate.claimedAsPrimary ? "claimed-primary" : "not-claimed-primary",
  ].join("\u001f"));
  const inputFingerprint = sha256Exact([sourceFingerprint, claimFingerprint, policyVersion].join("\u001f"));
  return {
    sourceFingerprint,
    claimFingerprint,
    inputFingerprint,
    // Compatibility alias for callers constructing cache identity. Persisted
    // results replace this with an exact result fingerprint.
    verificationFingerprint: inputFingerprint,
  };
}

export function buildVerificationResultFingerprint(input: {
  inputFingerprint: string;
  verdict: AdversarialVerificationVerdict;
  reasonCodes: AdversarialReasonCode[];
  supportingExcerpt: string | null;
  contradictingExcerpt: string | null;
  corrections: VerificationCorrection[];
  notes: string;
}) {
  return sha256Exact(JSON.stringify({
    inputFingerprint: input.inputFingerprint,
    verdict: input.verdict,
    reasonCodes: [...input.reasonCodes].sort(),
    supportingExcerpt: input.supportingExcerpt,
    contradictingExcerpt: input.contradictingExcerpt,
    corrections: input.corrections,
    notes: input.notes,
  }));
}

export function canHumanAdmitVerdict(verdict: AdversarialVerificationVerdict) {
  return verdict === "VERIFIED" || verdict === "VERIFIED_WITH_CORRECTION";
}
