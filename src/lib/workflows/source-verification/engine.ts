import {
  SOURCE_VERIFICATION_POLICY_VERSION,
  buildVerificationFingerprints,
  buildVerificationResultFingerprint,
  type AdversarialReasonCode,
  type AdversarialVerificationResult,
  type AdversarialVerificationVerdict,
  type VerificationCandidate,
  type VerificationCorrection,
  sha256Exact,
} from "./contracts";

export type VerifierModelOutput = {
  verdict: AdversarialVerificationVerdict;
  reasonCodes: AdversarialReasonCode[];
  supportingExcerpt?: string | null;
  contradictingExcerpt?: string | null;
  corrections?: VerificationCorrection[];
  notes?: string;
};

export type DoiResolutionFound = {
  state: "FOUND";
  sourceText: string;
  canonicalUrl?: string;
  title?: string;
  author?: string | null;
  publisher?: string | null;
  publishedAt?: string | null;
  sourceRole?: "PRIMARY" | "SECONDARY" | "UNKNOWN";
};

export function applyDoiResolution(candidate: VerificationCandidate, resolved: DoiResolutionFound) {
  const next: VerificationCandidate = {
    ...candidate,
    sourceUrl: resolved.canonicalUrl ?? candidate.sourceUrl,
    sourceTitle: resolved.title ?? candidate.sourceTitle,
    sourceAuthor: resolved.author === undefined ? candidate.sourceAuthor : resolved.author,
    sourcePublisher: resolved.publisher === undefined ? candidate.sourcePublisher : resolved.publisher,
    sourcePublishedAt: resolved.publishedAt === undefined ? candidate.sourcePublishedAt : resolved.publishedAt,
    sourceRole: resolved.sourceRole ?? candidate.sourceRole,
  };
  const corrections: VerificationCorrection[] = [];
  const correctionFields = [
    ["url", candidate.sourceUrl, next.sourceUrl],
    ["title", candidate.sourceTitle, next.sourceTitle],
    ["author", candidate.sourceAuthor, next.sourceAuthor],
    ["publisher", candidate.sourcePublisher, next.sourcePublisher],
    ["publishedAt", candidate.sourcePublishedAt, next.sourcePublishedAt],
    ["sourceRole", candidate.sourceRole, next.sourceRole],
  ] as const;
  for (const [field, original, corrected] of correctionFields) {
    if ((original ?? null) !== (corrected ?? null) && corrected) {
      corrections.push({ field, original: original ?? null, corrected });
    }
  }
  next.resolutionCorrections = corrections;
  return next;
}

export type SourceVerificationDependencies = {
  loadSnapshot(candidate: VerificationCandidate): Promise<string | null>;
  verifyAgainstText(input: {
    candidate: VerificationCandidate;
    sourceText: string;
  }): Promise<VerifierModelOutput>;
  locatePublicSource?(candidate: VerificationCandidate): Promise<
    | { state: "FOUND"; sourceText: string }
    | { state: "NOT_FOUND" | "INACCESSIBLE" }
  >;
  resolveDoi?(candidate: VerificationCandidate & { sourceDoi: string }): Promise<
    | DoiResolutionFound
    | { state: "NOT_FOUND" | "INACCESSIBLE" }
  >;
  now?: () => Date;
  policyVersion?: string;
};

function excerptAppearsInSource(excerpt: string | null | undefined, sourceText: string) {
  if (!excerpt?.trim()) return false;
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  return normalize(sourceText).includes(normalize(excerpt));
}

function terminalResult(
  candidate: VerificationCandidate,
  verdict: AdversarialVerificationVerdict,
  reasonCode: AdversarialReasonCode,
  notes: string,
  now: Date,
  policyVersion: string,
): AdversarialVerificationResult {
  const fingerprints = buildVerificationFingerprints(candidate, policyVersion);
  const supportingExcerpt = null;
  const contradictingExcerpt = null;
  const corrections: VerificationCorrection[] = [];
  const reasonCodes = [reasonCode];
  const verificationFingerprint = buildVerificationResultFingerprint({
    inputFingerprint: fingerprints.inputFingerprint, verdict, reasonCodes,
    supportingExcerpt, contradictingExcerpt, corrections, notes,
  });
  return {
    candidate,
    ...fingerprints,
    verificationFingerprint,
    policyVersion,
    verdict,
    reasonCodes,
    supportingExcerpt,
    contradictingExcerpt,
    corrections,
    notes,
    verifiedAt: now.toISOString(),
  };
}

export async function verifySourceCandidate(
  candidate: VerificationCandidate,
  dependencies: SourceVerificationDependencies,
): Promise<AdversarialVerificationResult> {
  const now = dependencies.now?.() ?? new Date();
  const policyVersion = dependencies.policyVersion ?? SOURCE_VERIFICATION_POLICY_VERSION;
  let effectiveCandidate = candidate;
  const resolverCorrections: VerificationCorrection[] = [...(candidate.resolutionCorrections ?? [])];
  let sourceText = await dependencies.loadSnapshot(candidate);
  let publicLookupState: "NOT_FOUND" | "INACCESSIBLE" | null = null;

  if (!sourceText?.trim() && candidate.accessMode === "PUBLIC_WEB" && dependencies.locatePublicSource) {
    const lookup = await dependencies.locatePublicSource(candidate);
    if (lookup.state !== "FOUND") publicLookupState = lookup.state;
    if (lookup.state === "FOUND") sourceText = lookup.sourceText;
  }

  // DOI resolution is an explicit fallback, never an automatic source
  // substitution. It resolves the same cited work and records every canonical
  // metadata change for human review.
  if (!sourceText?.trim() && candidate.accessMode === "PUBLIC_WEB" && candidate.sourceDoi?.trim() && dependencies.resolveDoi) {
    const resolved = await dependencies.resolveDoi({ ...candidate, sourceDoi: candidate.sourceDoi.trim() });
    if (resolved.state === "FOUND") {
      sourceText = resolved.sourceText;
      effectiveCandidate = applyDoiResolution(candidate, resolved);
      resolverCorrections.splice(0, resolverCorrections.length, ...(effectiveCandidate.resolutionCorrections ?? []));
      publicLookupState = null;
    } else if (!publicLookupState || (publicLookupState === "NOT_FOUND" && resolved.state === "INACCESSIBLE")) {
      publicLookupState = resolved.state;
    }
  }

  if (!sourceText?.trim() && publicLookupState) {
    const doiAttempted = Boolean(candidate.sourceDoi?.trim() && dependencies.resolveDoi);
    return terminalResult(
      candidate,
      publicLookupState === "NOT_FOUND" ? "NOT_FOUND" : "INACCESSIBLE",
      doiAttempted && publicLookupState === "NOT_FOUND" ? "DOI_NOT_FOUND" : publicLookupState === "NOT_FOUND" ? "SOURCE_NOT_FOUND" : "SOURCE_INACCESSIBLE",
      doiAttempted
        ? "Neither the cited URL nor its DOI resolved to accessible evidence."
        : publicLookupState === "NOT_FOUND" ? "No matching public source was found." : "The source exists but its contents could not be accessed.",
      now,
      policyVersion,
    );
  }

  if (!sourceText?.trim()) {
    return terminalResult(
      candidate,
      candidate.accessMode === "PRIVATE_UPLOAD" ? "REJECTED" : "INACCESSIBLE",
      "MISSING_SNAPSHOT",
      candidate.accessMode === "PRIVATE_UPLOAD"
        ? "The private upload has no stored extraction to verify."
        : "No stored snapshot is available and the public source could not be read.",
      now,
      policyVersion,
    );
  }

  // Bind the verdict to the one exact text value used below. This avoids a
  // second snapshot read and makes public-source changes invalidate the cache.
  const fingerprintCandidate = {
    ...effectiveCandidate,
    sourceContentFingerprint: sha256Exact(sourceText),
  };

  const output = await dependencies.verifyAgainstText({ candidate: fingerprintCandidate, sourceText });
  const support = output.supportingExcerpt?.trim() || null;
  const contradiction = output.contradictingExcerpt?.trim() || null;
  let verdict = output.verdict;
  const reasonCodes = [...new Set(output.reasonCodes ?? [])];

  if ((verdict === "VERIFIED" || verdict === "VERIFIED_WITH_CORRECTION") && !excerptAppearsInSource(support, sourceText)) {
    verdict = "REJECTED";
    reasonCodes.push("INVALID_VERIFIER_OUTPUT");
  }
  if (contradiction && !excerptAppearsInSource(contradiction, sourceText)) {
    verdict = "REJECTED";
    reasonCodes.push("INVALID_VERIFIER_OUTPUT");
  }
  if (verdict === "CONTRADICTED" && !contradiction) {
    verdict = "REJECTED";
    reasonCodes.push("INVALID_VERIFIER_OUTPUT");
  }
  const expectedMetadata: Record<string, string | null> = {
    title: fingerprintCandidate.sourceTitle,
    author: fingerprintCandidate.sourceAuthor ?? null,
    publisher: fingerprintCandidate.sourcePublisher ?? null,
    publishedAt: fingerprintCandidate.sourcePublishedAt ?? null,
    url: fingerprintCandidate.sourceUrl ?? null,
    doi: fingerprintCandidate.sourceDoi ?? null,
    sourceRole: fingerprintCandidate.sourceRole ?? null,
  };
  const modelCorrections = output.corrections ?? [];
  const correctionsValid = modelCorrections.every((correction) => {
    if (!correction.corrected.trim()) return false;
    if (correction.field === "citation") return correction.corrected !== correction.original;
    return correction.original === expectedMetadata[correction.field] && correction.corrected !== correction.original;
  });
  if (!correctionsValid) {
    verdict = "REJECTED";
    reasonCodes.push("INVALID_VERIFIER_OUTPUT");
  }
  const corrections = [...resolverCorrections, ...(correctionsValid ? modelCorrections : [])];
  if (resolverCorrections.length > 0) {
    reasonCodes.push("DOI_RESOLUTION", "METADATA_CORRECTION");
    if (verdict === "VERIFIED") verdict = "VERIFIED_WITH_CORRECTION";
  }
  if (verdict === "VERIFIED_WITH_CORRECTION" && corrections.length === 0) {
    verdict = "REJECTED";
    reasonCodes.push("INVALID_VERIFIER_OUTPUT");
  }
  if (fingerprintCandidate.requiresCorroboration && (verdict === "VERIFIED" || verdict === "VERIFIED_WITH_CORRECTION")) {
    verdict = "NEEDS_CORROBORATION";
    reasonCodes.push("MISSING_CORROBORATION");
  }
  if (fingerprintCandidate.claimedAsPrimary && fingerprintCandidate.sourceRole === "SECONDARY" && (verdict === "VERIFIED" || verdict === "VERIFIED_WITH_CORRECTION")) {
    verdict = "NEEDS_CORROBORATION";
    reasonCodes.push("SECONDARY_AS_PRIMARY", "MISSING_CORROBORATION");
  }

  const fingerprints = buildVerificationFingerprints(fingerprintCandidate, policyVersion);
  const notes = output.notes?.trim() || "Independent source verification completed.";
  const verificationFingerprint = buildVerificationResultFingerprint({
    inputFingerprint: fingerprints.inputFingerprint,
    verdict,
    reasonCodes: [...new Set(reasonCodes)],
    supportingExcerpt: support,
    contradictingExcerpt: contradiction,
    corrections,
    notes,
  });
  return {
    candidate: fingerprintCandidate,
    ...fingerprints,
    verificationFingerprint,
    policyVersion,
    verdict,
    reasonCodes: [...new Set(reasonCodes)],
    supportingExcerpt: support,
    contradictingExcerpt: contradiction,
    corrections,
    notes,
    verifiedAt: now.toISOString(),
  };
}
