import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ArtifactType, SourceAdmissionDecision, SourceVerificationVerdict } from "@prisma/client";
import { isCurrentHumanAdmission, selectCanonicalCommittedSourcePacks, shouldReuseLatestAdmissionReview } from "../src/lib/repositories/source-verification";
import { canonicalPersistedArtifactId } from "../src/lib/repositories/structured-dossiers";
import { LLMGatewayError } from "../src/lib/llm/gateway";
import { assertCanonicalVerificationCandidates, assertSourceVerificationArtifactVersion, sourceVerificationFailureDisposition, sourceVerificationRunDisposition } from "../src/lib/workflows/source-verification/jobs";
import type { VerificationCandidate } from "../src/lib/workflows/source-verification/contracts";
import { isSourcePackAdmissionReady, summarizeSourceAdmissionReadiness, validateSourceAdmissionDecision } from "../src/lib/workflows/source-verification/admission-policy";
import { assertIndependentSourceVerificationRouting } from "../src/lib/llm/routing";

test("human admission is bound to exact artifact version and verification fingerprint", () => {
  const review = {
    artifactVersionId: "version-1",
    verificationResultId: "result-1",
    verificationFingerprint: "fingerprint-1",
    decision: SourceAdmissionDecision.APPROVE,
  };
  assert.equal(isCurrentHumanAdmission({ artifactVersionId: "version-1", verificationResultId: "result-1", verificationFingerprint: "fingerprint-1", verdict: SourceVerificationVerdict.VERIFIED, review }), true);
  assert.equal(isCurrentHumanAdmission({ artifactVersionId: "version-2", verificationResultId: "result-1", verificationFingerprint: "fingerprint-1", verdict: SourceVerificationVerdict.VERIFIED, review }), false);
  assert.equal(isCurrentHumanAdmission({ artifactVersionId: "version-1", verificationResultId: "result-1", verificationFingerprint: "fingerprint-2", verdict: SourceVerificationVerdict.VERIFIED, review }), false);
  assert.equal(isCurrentHumanAdmission({ artifactVersionId: "version-1", verificationResultId: "result-1", verificationFingerprint: "fingerprint-1", verdict: SourceVerificationVerdict.CONTRADICTED, review }), false);
});

test("source jobs retry failures and force-refresh resets exhausted terminal work", () => {
  assert.equal(sourceVerificationRunDisposition("FAILED", 1, 3), "REQUEUE");
  assert.equal(sourceVerificationRunDisposition("FAILED", 3, 3), "UNCHANGED");
  assert.equal(sourceVerificationRunDisposition("FAILED", 3, 3, true), "RESET");
  assert.equal(sourceVerificationRunDisposition("SUCCEEDED", 1, 3, true), "RESET");
});

test("documented manual exceptions are explicit and current, while reopen blocks", () => {
  const base = { artifactVersionId: "version-1", verificationResultId: "result-1", verificationFingerprint: "fingerprint-1", verdict: SourceVerificationVerdict.INACCESSIBLE };
  assert.equal(isCurrentHumanAdmission({ ...base, review: { artifactVersionId: "version-1", verificationResultId: "result-1", verificationFingerprint: "fingerprint-1", decision: SourceAdmissionDecision.MANUAL_EXCEPTION } }), true);
  assert.equal(isCurrentHumanAdmission({ ...base, review: { artifactVersionId: "version-1", verificationResultId: "result-1", verificationFingerprint: "fingerprint-1", decision: SourceAdmissionDecision.REOPEN } }), false);
});

test("persisted UUID rows map back to canonical dossier identities", () => {
  assert.equal(canonicalPersistedArtifactId({ artifactRecordId: "fact-1" }, "artifactRecordId", "db-uuid"), "fact-1");
  assert.equal(canonicalPersistedArtifactId({ artifactSourceId: "source-1" }, "artifactSourceId", "source-db-uuid"), "source-1");
  assert.equal(canonicalPersistedArtifactId({}, "artifactRecordId", "legacy-db-uuid"), "legacy-db-uuid");
});

test("approve, reopen, approve is append-only instead of reusing historical approval", () => {
  const common = {
    artifactVersionId: "version-1",
    verificationFingerprint: "fingerprint-1",
    reviewerUserId: "user-1",
    notes: null,
  };
  assert.equal(shouldReuseLatestAdmissionReview({ ...common, decision: SourceAdmissionDecision.APPROVE }, { ...common, decision: SourceAdmissionDecision.APPROVE }), true);
  assert.equal(shouldReuseLatestAdmissionReview({ ...common, decision: SourceAdmissionDecision.REOPEN }, { ...common, decision: SourceAdmissionDecision.APPROVE }), false);
});

test("budget confirmation pauses the durable run instead of failing it", () => {
  assert.equal(sourceVerificationFailureDisposition(new LLMGatewayError("confirm", "budget_confirmation_required")), "PAUSE_FOR_BUDGET");
  assert.equal(sourceVerificationFailureDisposition(new Error("provider failed")), "FAIL");
});

test("admission action policy executes corrected and manual-exception rules", () => {
  assert.equal(validateSourceAdmissionDecision({
    decision: SourceAdmissionDecision.APPROVE_CORRECTED,
    verdict: SourceVerificationVerdict.VERIFIED_WITH_CORRECTION,
    corrections: [],
    notes: "",
  }), "Corrected approval requires at least one explicit correction.");
  assert.equal(validateSourceAdmissionDecision({
    decision: SourceAdmissionDecision.MANUAL_EXCEPTION,
    verdict: SourceVerificationVerdict.INACCESSIBLE,
    corrections: [],
    notes: "Documented private interview transcript.",
  }), null);
});

test("Manifest readiness accepts decided exclusions but requires one admission from each pack", () => {
  const blocked = summarizeSourceAdmissionReadiness({
    hasResearchPack: true,
    hasExternalStoryPack: true,
    records: [{ kind: "RESEARCH_CLAIM", admitted: true, decided: true }, { kind: "EXTERNAL_STORY", admitted: false, decided: false }],
  });
  assert.equal(blocked.ready, false); assert.equal(blocked.undecided, 1);
  assert.equal(summarizeSourceAdmissionReadiness({
    hasResearchPack: true,
    hasExternalStoryPack: true,
    records: [{ kind: "RESEARCH_CLAIM", admitted: true, decided: true }, { kind: "RESEARCH_CLAIM", admitted: false, decided: true }, { kind: "EXTERNAL_STORY", admitted: true, decided: true }],
  }).ready, true);
});

test("server manifest pack readiness requires every record decided but permits exclusions", () => {
  assert.equal(isSourcePackAdmissionReady(2, [{ admitted: true, decision: SourceAdmissionDecision.APPROVE }, { admitted: false, decision: SourceAdmissionDecision.REJECT }]), true);
  assert.equal(isSourcePackAdmissionReady(2, [{ admitted: true, decision: SourceAdmissionDecision.APPROVE }, { admitted: false, decision: null }]), false);
  assert.equal(isSourcePackAdmissionReady(1, [{ admitted: false, decision: SourceAdmissionDecision.REJECT }]), false);
});

test("canonical pack selection keeps only newest ordered artifact per chapter and kind", () => {
  const now = new Date();
  const selected = selectCanonicalCommittedSourcePacks([
    { id: "new", artifactType: "RESEARCH_PACK" as never, chapterId: "chapter-1", committedVersionId: "v2", updatedAt: now },
    { id: "old", artifactType: "RESEARCH_PACK" as never, chapterId: "chapter-1", committedVersionId: "v1", updatedAt: new Date(0) },
    { id: "story", artifactType: "EXTERNAL_STORY_PACK" as never, chapterId: "chapter-1", committedVersionId: "s1", updatedAt: now },
  ]);
  assert.deepEqual(selected.map((item) => item.versionId), ["v2", "s1"]);
});

test("adversarial verification is routed independently from Research agent 3", () => {
  const adversarialOverride = process.env.LLM_SOURCE_VERIFICATION_ADVERSARIAL;
  const researchOverride = process.env.LLM_RESEARCH_AGENT_3_VERIFIER;
  delete process.env.LLM_SOURCE_VERIFICATION_ADVERSARIAL;
  delete process.env.LLM_RESEARCH_AGENT_3_VERIFIER;
  try {
    const routing = assertIndependentSourceVerificationRouting();
    assert.notEqual(routing.adversarial.split(":")[0], routing.researchVerifier.split(":")[0]);
  } finally {
    if (adversarialOverride === undefined) delete process.env.LLM_SOURCE_VERIFICATION_ADVERSARIAL;
    else process.env.LLM_SOURCE_VERIFICATION_ADVERSARIAL = adversarialOverride;
    if (researchOverride === undefined) delete process.env.LLM_RESEARCH_AGENT_3_VERIFIER;
    else process.env.LLM_RESEARCH_AGENT_3_VERIFIER = researchOverride;
  }
});

test("durable verifier dispatch is separate, idempotent, bounded and gateway-routed", () => {
  const jobs = readFileSync(join(process.cwd(), "src/lib/workflows/source-verification/jobs.ts"), "utf8");
  const worker = readFileSync(join(process.cwd(), "src/app/api/internal/workflow-runs/process/route.ts"), "utf8");
  assert.match(jobs, /idempotencyKey: `source-verify:/);
  assert.match(jobs, /maxAttempts: 3/);
  assert.match(jobs, /findCachedSourceVerification/);
  assert.match(jobs, /executeSourceVerificationCandidate/);
  assert.match(jobs, /startWorkflowRunHeartbeat/);
  assert.match(jobs, /acquireLLMCallForRole/);
  assert.match(jobs, /source-verification:adversarial/);
  assert.match(worker, /input\.kind === "adversarial_source_verification"/);
  assert.ok(worker.indexOf("adversarial_source_verification") < worker.indexOf('run.stage.stageKey === "RESEARCH"'));
});

test("Gate 1 route is authenticated, ownership-scoped, stale-safe, and never auto-substitutes", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/books/[slug]/source-review/route.ts"), "utf8");
  assert.match(route, /requireAuthenticatedAppUser/);
  assert.match(route, /getBookHeaderBySlugForUserOrThrow/);
  assert.match(route, /status: 409/);
  assert.match(route, /validateSourceAdmissionDecision/);
  assert.doesNotMatch(route, /replaceSource|substituteSource|autoReplace/);
});

test("Manifest and Quill fail closed on missing human admission before model generation", () => {
  const manifest = readFileSync(join(process.cwd(), "src/lib/workflows/manifest-generator.ts"), "utf8");
  const quill = readFileSync(join(process.cwd(), "src/lib/quill-context-contract.ts"), "utf8");
  assert.ok(manifest.indexOf("const researchParts") < manifest.indexOf("const gatewayCall"));
  assert.match(manifest, /Manifest generation is blocked until/);
  assert.match(quill, /record\.humanAdmitted !== true/);
  assert.match(quill, /verificationFingerprint/);
});

test("verification jobs reject wrong ownership, pack type, stale versions, and duplicate canonical IDs", () => {
  const descriptor = { artifact: { bookId: "book-1", chapterId: "chapter-1", artifactType: ArtifactType.RESEARCH_PACK, committedVersionId: "version-1" } };
  assert.doesNotThrow(() => assertSourceVerificationArtifactVersion({ bookId: "book-1", chapterKey: "chapter-1", versionId: "version-1", expectedType: ArtifactType.RESEARCH_PACK, version: descriptor }));
  assert.throws(() => assertSourceVerificationArtifactVersion({ bookId: "other", chapterKey: "chapter-1", versionId: "version-1", expectedType: ArtifactType.RESEARCH_PACK, version: descriptor }), /non-current/);
  assert.throws(() => assertSourceVerificationArtifactVersion({ bookId: "book-1", chapterKey: "chapter-1", versionId: "version-1", expectedType: ArtifactType.EXTERNAL_STORY_PACK, version: descriptor }), /non-current/);
  const base = { kind: "RESEARCH_CLAIM", bookId: "book-1", chapterKey: "chapter-1", artifactVersionId: "version-1", sourceRecordId: "source-1", sourceUrl: null, sourceTitle: "Source", accessMode: "PRIVATE_UPLOAD", claimOrStory: "Claim" } satisfies Omit<VerificationCandidate, "recordId">;
  assert.throws(() => assertCanonicalVerificationCandidates([{ ...base, recordId: "same" }, { ...base, recordId: " same " }]), /duplicate/);
  assert.throws(() => assertCanonicalVerificationCandidates([{ ...base, recordId: " " }]), /blank/);
});
