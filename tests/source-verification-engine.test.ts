import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildVerificationFingerprints,
  type VerificationCandidate,
} from "../src/lib/workflows/source-verification/contracts";
import { verifySourceCandidate } from "../src/lib/workflows/source-verification/engine";
import { buildBoundedSourceVerificationContext, resolveOwnedSourceSnapshotPath, resolveOwnedSourceSnapshotRealPath } from "../src/lib/workflows/source-verification/jobs";

const candidate: VerificationCandidate = {
  kind: "RESEARCH_CLAIM",
  bookId: "book-1",
  chapterKey: "chapter-1",
  artifactVersionId: "version-1",
  recordId: "claim-1",
  sourceRecordId: "source-1",
  sourceUrl: "https://example.com/report",
  sourceTitle: "Annual Report",
  sourceAuthor: "A. Author",
  sourcePublisher: "Example Institute",
  sourcePublishedAt: "2025-01-01",
  accessMode: "PUBLIC_WEB",
  claimOrStory: "Retention increased by 12 percent.",
};

test("fingerprints are deterministic and claim-sensitive", () => {
  const first = buildVerificationFingerprints(candidate);
  const replay = buildVerificationFingerprints({ ...candidate });
  const changed = buildVerificationFingerprints({ ...candidate, claimOrStory: "Retention increased by 13 percent." });
  assert.deepEqual(first, replay);
  assert.notEqual(first.claimFingerprint, changed.claimFingerprint);
  assert.notEqual(first.verificationFingerprint, changed.verificationFingerprint);
  assert.notEqual(first.claimFingerprint, buildVerificationFingerprints({ ...candidate, claimOrStory: candidate.claimOrStory.toUpperCase() }).claimFingerprint);
  assert.notEqual(first.claimFingerprint, buildVerificationFingerprints({ ...candidate, claimOrStory: ` ${candidate.claimOrStory}` }).claimFingerprint);
  assert.notEqual(buildVerificationFingerprints({ ...candidate, existingExcerpt: "Exact Excerpt" }).claimFingerprint, buildVerificationFingerprints({ ...candidate, existingExcerpt: "exact excerpt" }).claimFingerprint);
  const changedSnapshot = buildVerificationFingerprints({ ...candidate, sourceContentFingerprint: "different-snapshot-hash" });
  assert.notEqual(first.sourceFingerprint, changedSnapshot.sourceFingerprint);
});

test("independent verifier requires a literal excerpt from the stored snapshot", async () => {
  let networkCalls = 0;
  const result = await verifySourceCandidate(candidate, {
    now: () => new Date("2026-07-14T12:00:00.000Z"),
    loadSnapshot: async () => "The audited report says retention increased by 12 percent year over year.",
    locatePublicSource: async () => {
      networkCalls += 1;
      throw new Error("network must not be used when a snapshot exists");
    },
    verifyAgainstText: async () => ({
      verdict: "VERIFIED",
      reasonCodes: ["LITERAL_SUPPORT"],
      supportingExcerpt: "retention increased by 12 percent year over year",
    }),
  });
  assert.equal(result.verdict, "VERIFIED");
  assert.equal(networkCalls, 0);
  assert.equal(result.supportingExcerpt, "retention increased by 12 percent year over year");
});

test("immutable result fingerprint changes when verdict evidence or notes change", async () => {
  const run = (notes: string, excerpt = "retention increased by 12 percent") => verifySourceCandidate(candidate, {
    loadSnapshot: async () => "The audited report says retention increased by 12 percent year over year.",
    verifyAgainstText: async () => ({ verdict: "VERIFIED", reasonCodes: ["LITERAL_SUPPORT"], supportingExcerpt: excerpt, notes }),
  });
  const first = await run("first assessment");
  const changedNotes = await run("second assessment");
  const changedExcerpt = await run("first assessment", "retention increased by 12 percent year over year");
  assert.equal(first.inputFingerprint, changedNotes.inputFingerprint);
  assert.notEqual(first.verificationFingerprint, changedNotes.verificationFingerprint);
  assert.notEqual(first.verificationFingerprint, changedExcerpt.verificationFingerprint);
});

test("invented verifier excerpts are rejected", async () => {
  const result = await verifySourceCandidate(candidate, {
    loadSnapshot: async () => "The report discusses retention without a percentage.",
    verifyAgainstText: async () => ({
      verdict: "VERIFIED",
      reasonCodes: ["LITERAL_SUPPORT"],
      supportingExcerpt: "retention increased by 12 percent",
    }),
  });
  assert.equal(result.verdict, "REJECTED");
  assert.ok(result.reasonCodes.includes("INVALID_VERIFIER_OUTPUT"));
});

test("not-found and inaccessible remain distinct", async () => {
  const notFound = await verifySourceCandidate(candidate, {
    loadSnapshot: async () => null,
    locatePublicSource: async () => ({ state: "NOT_FOUND" }),
    verifyAgainstText: async () => { throw new Error("not reached"); },
  });
  const inaccessible = await verifySourceCandidate(candidate, {
    loadSnapshot: async () => null,
    locatePublicSource: async () => ({ state: "INACCESSIBLE" }),
    verifyAgainstText: async () => { throw new Error("not reached"); },
  });
  assert.equal(notFound.verdict, "NOT_FOUND");
  assert.equal(inaccessible.verdict, "INACCESSIBLE");
});

test("private uploads verify against stored extraction without public lookup", async () => {
  let lookupCalls = 0;
  const result = await verifySourceCandidate({ ...candidate, accessMode: "PRIVATE_UPLOAD", sourceUrl: null }, {
    loadSnapshot: async () => "Interview notes confirm the program began in 2021.",
    locatePublicSource: async () => { lookupCalls += 1; return { state: "NOT_FOUND" }; },
    verifyAgainstText: async () => ({
      verdict: "VERIFIED_WITH_CORRECTION",
      reasonCodes: ["LITERAL_SUPPORT", "METADATA_CORRECTION"],
      supportingExcerpt: "program began in 2021",
      corrections: [{ field: "publishedAt", original: "2025-01-01", corrected: "2021" }],
    }),
  });
  assert.equal(result.verdict, "VERIFIED_WITH_CORRECTION");
  assert.equal(lookupCalls, 0);
});

test("source fingerprints preserve case-sensitive paths and exact source text", async () => {
  const upperPath = buildVerificationFingerprints({ ...candidate, sourceUrl: "https://EXAMPLE.com/Report" });
  const lowerPath = buildVerificationFingerprints({ ...candidate, sourceUrl: "https://example.com/report" });
  assert.notEqual(upperPath.sourceFingerprint, lowerPath.sourceFingerprint);

  const upperText = await verifySourceCandidate(candidate, {
    loadSnapshot: async () => "Case Sensitive Evidence",
    verifyAgainstText: async () => ({ verdict: "VERIFIED", reasonCodes: ["LITERAL_SUPPORT"], supportingExcerpt: "Case Sensitive Evidence" }),
  });
  const lowerText = await verifySourceCandidate(candidate, {
    loadSnapshot: async () => "case sensitive evidence",
    verifyAgainstText: async () => ({ verdict: "VERIFIED", reasonCodes: ["LITERAL_SUPPORT"], supportingExcerpt: "case sensitive evidence" }),
  });
  assert.notEqual(upperText.sourceFingerprint, lowerText.sourceFingerprint);
});

test("literal support is case-sensitive", async () => {
  const result = await verifySourceCandidate(candidate, {
    loadSnapshot: async () => "Case Sensitive Evidence",
    verifyAgainstText: async () => ({ verdict: "VERIFIED", reasonCodes: ["LITERAL_SUPPORT"], supportingExcerpt: "case sensitive evidence" }),
  });
  assert.equal(result.verdict, "REJECTED");
});

test("long-source context reaches matching evidence beyond the first 80k", () => {
  const marker = "Retention increased by twelve percent in the audited cohort.";
  const source = `${"preface ".repeat(14_000)}${marker}${" appendix".repeat(14_000)}`;
  const context = buildBoundedSourceVerificationContext(source, { claimOrStory: candidate.claimOrStory, existingExcerpt: marker });
  assert.ok(context.includes(marker));
  assert.ok(context.length <= 80_000);
});

test("snapshot path resolution is confined to owned processed storage", () => {
  assert.match(resolveOwnedSourceSnapshotPath("reference-library/processed/research-snapshots/book/chapter/source.txt", "/repo"), /^\/repo\/reference-library\/processed\//);
  assert.throws(() => resolveOwnedSourceSnapshotPath("../../etc/passwd", "/repo"), /outside Ghostwritr-owned storage/);
  assert.throws(() => resolveOwnedSourceSnapshotPath("/etc/passwd", "/repo"), /outside Ghostwritr-owned storage/);
});

test("snapshot physical resolution rejects symlinks escaping owned storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "ghostwritr-realpath-"));
  try {
    const owned = join(root, "reference-library", "processed");
    const outside = join(root, "outside");
    await mkdir(owned, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "secret.txt"), "outside");
    await symlink(join(outside, "secret.txt"), join(owned, "escape.txt"));
    await assert.rejects(resolveOwnedSourceSnapshotRealPath("reference-library/processed/escape.txt", root), /resolves outside/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("contradicting excerpts must also be literal", async () => {
  const result = await verifySourceCandidate(candidate, {
    loadSnapshot: async () => "The report says retention was unchanged.",
    verifyAgainstText: async () => ({
      verdict: "CONTRADICTED",
      reasonCodes: ["CLAIM_CONTRADICTED"],
      contradictingExcerpt: "retention fell by 12 percent",
    }),
  });
  assert.equal(result.verdict, "REJECTED");
  assert.ok(result.reasonCodes.includes("INVALID_VERIFIER_OUTPUT"));
});

test("contradicted verdicts require a literal contradiction excerpt", async () => {
  const result = await verifySourceCandidate(candidate, {
    loadSnapshot: async () => "The report says retention was unchanged.",
    verifyAgainstText: async () => ({ verdict: "CONTRADICTED", reasonCodes: ["CLAIM_CONTRADICTED"] }),
  });
  assert.equal(result.verdict, "REJECTED");
  assert.ok(result.reasonCodes.includes("INVALID_VERIFIER_OUTPUT"));
});

test("corrected verdicts require corrections and corroboration still wins", async () => {
  const missingCorrection = await verifySourceCandidate(candidate, {
    loadSnapshot: async () => "Retention increased by 12 percent.",
    verifyAgainstText: async () => ({ verdict: "VERIFIED_WITH_CORRECTION", reasonCodes: ["LITERAL_SUPPORT"], supportingExcerpt: "Retention increased by 12 percent" }),
  });
  assert.equal(missingCorrection.verdict, "REJECTED");

  const needsSecondSource = await verifySourceCandidate({ ...candidate, requiresCorroboration: true }, {
    loadSnapshot: async () => "Retention increased by 12 percent.",
    verifyAgainstText: async () => ({
      verdict: "VERIFIED_WITH_CORRECTION",
      reasonCodes: ["LITERAL_SUPPORT", "METADATA_CORRECTION"],
      supportingExcerpt: "Retention increased by 12 percent",
      corrections: [{ field: "title", original: "Annual Report", corrected: "Annual Review" }],
    }),
  });
  assert.equal(needsSecondSource.verdict, "NEEDS_CORROBORATION");
});

test("metadata corrections must name the actual stored original value", async () => {
  const result = await verifySourceCandidate(candidate, {
    loadSnapshot: async () => "Retention increased by 12 percent.",
    verifyAgainstText: async () => ({
      verdict: "VERIFIED_WITH_CORRECTION",
      reasonCodes: ["LITERAL_SUPPORT", "METADATA_CORRECTION"],
      supportingExcerpt: "Retention increased by 12 percent",
      corrections: [{ field: "title", original: "Invented original", corrected: "Annual Review" }],
    }),
  });
  assert.equal(result.verdict, "REJECTED");
  assert.ok(result.reasonCodes.includes("INVALID_VERIFIER_OUTPUT"));
});

test("broken URL falls back to the same work by DOI and records canonical corrections", async () => {
  let doiCalls = 0;
  const result = await verifySourceCandidate({ ...candidate, sourceDoi: "10.1000/verified", sourceTitle: "Wrong title" }, {
    loadSnapshot: async () => null,
    locatePublicSource: async () => ({ state: "NOT_FOUND" }),
    resolveDoi: async () => {
      doiCalls += 1;
      return {
        state: "FOUND",
        sourceText: "The canonical paper reports retention increased by 12 percent.",
        canonicalUrl: "https://doi.org/10.1000/verified",
        title: "Canonical Retention Study",
        author: "Ada Researcher",
        sourceRole: "PRIMARY",
      };
    },
    verifyAgainstText: async () => ({
      verdict: "VERIFIED",
      reasonCodes: ["LITERAL_SUPPORT"],
      supportingExcerpt: "retention increased by 12 percent",
    }),
  });
  assert.equal(doiCalls, 1);
  assert.equal(result.verdict, "VERIFIED_WITH_CORRECTION");
  assert.ok(result.reasonCodes.includes("DOI_RESOLUTION"));
  assert.equal(result.candidate.sourceUrl, "https://doi.org/10.1000/verified");
  assert.ok(result.corrections.some((correction) => correction.field === "title" && correction.corrected === "Canonical Retention Study"));
  assert.ok(result.corrections.some((correction) => correction.field === "author" && correction.corrected === "Ada Researcher"));
});

test("unresolved DOI stays blocked and never reaches the model", async () => {
  let modelCalls = 0;
  const result = await verifySourceCandidate({ ...candidate, sourceDoi: "10.1000/missing" }, {
    loadSnapshot: async () => null,
    locatePublicSource: async () => ({ state: "NOT_FOUND" }),
    resolveDoi: async () => ({ state: "NOT_FOUND" }),
    verifyAgainstText: async () => { modelCalls += 1; throw new Error("not reached"); },
  });
  assert.equal(result.verdict, "NOT_FOUND");
  assert.ok(result.reasonCodes.includes("DOI_NOT_FOUND"));
  assert.equal(modelCalls, 0);
});

test("URL not-found plus inaccessible DOI remains inaccessible rather than fictional", async () => {
  const result = await verifySourceCandidate({ ...candidate, sourceDoi: "10.1000/paywalled" }, {
    loadSnapshot: async () => null,
    locatePublicSource: async () => ({ state: "NOT_FOUND" }),
    resolveDoi: async () => ({ state: "INACCESSIBLE" }),
    verifyAgainstText: async () => { throw new Error("not reached"); },
  });
  assert.equal(result.verdict, "INACCESSIBLE");
});

test("secondary evidence presented as a primary source requires corroboration", async () => {
  const result = await verifySourceCandidate({ ...candidate, sourceRole: "SECONDARY", claimedAsPrimary: true }, {
    loadSnapshot: async () => "The review reports retention increased by 12 percent.",
    verifyAgainstText: async () => ({
      verdict: "VERIFIED",
      reasonCodes: ["LITERAL_SUPPORT"],
      supportingExcerpt: "retention increased by 12 percent",
    }),
  });
  assert.equal(result.verdict, "NEEDS_CORROBORATION");
  assert.ok(result.reasonCodes.includes("SECONDARY_AS_PRIMARY"));
});
