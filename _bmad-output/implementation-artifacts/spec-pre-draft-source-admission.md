---
title: Pre-draft adversarial source verification and admission
status: done
baseline_commit: 3b416eba4f76b6b84f594b6811180124f078c88a
context:
  - docs/GHOSTWRITR-STABILIZATION-EXECUTION.md
  - _bmad-output/project-context.md
---

# Intent

Implement Packages 1–5 as one fail-closed pre-draft evidence gate. Research facts and External Stories must be independently checked against real evidence, reviewed one chapter at a time by the author, and admitted only for the exact artifact versions reviewed. Manifest and Quill must never receive merely extractor-approved, rejected, stale, unverifiable, or unreviewed evidence.

# Boundaries

In scope: verification contracts and persistence; independent Research and External Story verification; durable, resumable, deduplicated jobs; existing spend controls including the per-book $20 confirmation gate; chapter-by-chapter source review; admission invalidation; Manifest/Quill enforcement; deterministic no-spend tests.

Out of scope: post-draft citation auditing, bibliography rendering, typesetting changes, KDP validation, automatic source replacement, production migration execution, or live-provider testing. An inaccessible source is not automatically fictional. Private uploads are checked against their stored extracted content rather than requiring a public URL.

# Inputs and outputs

| Input | Output |
|---|---|
| Committed chapter Research/External Story artifact version | Append-only independent verdicts with evidence excerpts, reason codes, source/claim hashes, policy version, and run ID |
| Public source | Existence/metadata check plus claim or story support check using saved snapshot and bounded web lookup when required |
| Private upload | Support check against immutable stored extraction |
| Author review of exact chapter evidence fingerprint | Per-record human decisions plus current chapter admission state |
| Changed source, claim, story, or artifact version | Previous admission becomes stale; only changed fingerprints are reverified |
| Manifest/Quill context request | Only current human-admitted evidence, or a clear blocking error before any drafting spend |

# Code map

- Extend `prisma/schema.prisma` and add an isolated migration for an `ADVERSARIAL_VERIFIER` identity, explicit human decision/admission state, exact reviewed fingerprint, reviewer/timestamps/notes, and useful lookup indexes. Do not apply it to production; current migration-history divergence must be reported.
- Add version-scoped append/read operations in `src/lib/repositories/research-artifacts.ts` and `src/lib/repositories/external-stories-artifacts.ts`; never overwrite extractor verdicts or mix historical artifact versions.
- Add a pure verification core under `src/lib/workflows/source-verification/` with injected snapshot, search, model, and clock dependencies. It independently locates support and emits typed verdicts: verified, verified-with-correction, needs-corroboration, not-found, inaccessible, contradicted, or rejected.
- Reuse `WorkflowRun` leasing, heartbeat, retry, recovery, and idempotency. Dispatch `inputJson.kind = "adversarial_source_verification"` separately from Research/External generation. Cache by source fingerprint + claim/story hash + policy version.
- Reuse the centralized LLM gateway/routing and existing per-book budget confirmation. Verification jobs must not bypass spend logging, concurrency limits, or the $20 approval gate.
- Add a combined one-chapter review surface before Manifest generation, reachable from Research and External Stories. Show source URL/upload, citation metadata, exact supporting or contradicting excerpt, verifier result, corrections, and reasons. Actions: approve, approve corrected citation, request corroboration, reject, document an exception, and reopen.
- Update `src/lib/source-evidence-contract.ts`, Manifest input loading, and chapter-draft context so technical eligibility and human admission are separate. A current human approval bound to exact versions/fingerprint is mandatory. Any upstream change invalidates that chapter only.

# Implementation tasks

- [x] Define shared verifier/admission types, Prisma state, migration, and repository functions. Preserve append-only audit history and version-scoped latest-verdict selection.
- [x] Build independent Research and External Story verification from persisted snapshots. Require literal support excerpts; flag invented story detail, metadata mismatch, contradiction, missing corroboration, missing snapshot, and inaccessible/not-found distinctly. Never silently substitute a source.
- [x] Add durable enqueue/process/resume behavior with idempotent writes, bounded attempts, heartbeat, partial-progress recovery, fingerprint cache, and operational-state reporting. Route all model use through existing gateway and budget gates.
- [x] Build the one-chapter Gate 1 UI and authenticated server actions. Bind author decisions to the displayed artifact versions and reject stale updates with a conflict response. Preserve approved chapters while reviewing another chapter.
- [x] Enforce admission at both downstream seams: Manifest receives admitted records only, and Quill readiness fails before model acquisition when the selected chapter lacks current admission. Remove/override permissive auto-promotion as an admission mechanism.
- [x] Update the stabilization checklist/ledger only if this package set is represented there; do not mark later bibliography/typesetting work complete.

# Acceptance criteria

1. Extractor or Scout/Chronicle self-verification alone can never make evidence available to Manifest or Quill.
2. The adversarial verifier uses persisted evidence independently and records an exact excerpt and reasoned verdict; External Stories no longer fabricate second-pass verification.
3. `NOT_FOUND` and `INACCESSIBLE` remain distinct. Private uploads can be verified from stored content. No source is automatically replaced.
4. Duplicate/restarted jobs reuse completed fingerprints, resume unfinished work, and cannot duplicate effective verdicts. Tests make zero network/provider calls.
5. At projected book spend above $20, new verification generation blocks on the existing per-book confirmation and resumes after approval.
6. The author can review and decide one chapter at a time. Approval is tied to exact versions/fingerprint; changed evidence makes only that chapter stale.
7. Only verified, verified-with-correction, or documented manual-exception records with current human admission can flow downstream; rejected, pending, contradicted, missing, stale, or corroboration-required records are excluded.
8. Manifest generation and selected-chapter Quill drafting fail closed before paid generation when admission is missing or stale, while other approved chapters remain draftable.

# Verification

- Add focused contract, verifier, repository, durable-job, route/action, admission-invalidation, Manifest-input, and selected-chapter Quill tests using fixtures/fake models plus a network tripwire.
- Run `npx prisma validate`, Prisma client generation, focused `tsx --test` suites, `npm run check`, and the full non-live test suite required by the repository.
- Inspect `git diff --check` and confirm no provider keys, generated runtime artifacts, production migrations, live API calls, commits, or pushes occurred.

## Suggested Review Order

**Admission boundary**

- Start with the policy separating machine verification from current human admission.
  [`source-verification.ts:200`](../../src/lib/repositories/source-verification.ts#L200)

- See how corrected citations, recovered excerpts, and exceptions become drafting-safe evidence.
  [`source-evidence-contract.ts:120`](../../src/lib/source-evidence-contract.ts#L120)

- Confirm Quill loads only exact-version, currently admitted chapter evidence.
  [`source-availability.ts:29`](../../src/lib/workflows/chapter-draft/source-availability.ts#L29)

**Independent durable verification**

- Review exact-text verification, literal excerpt validation, and distinct failure verdicts.
  [`engine.ts:63`](../../src/lib/workflows/source-verification/engine.ts#L63)

- Follow fingerprinted caching, explicit refresh, budget pause, and durable completion.
  [`jobs.ts:234`](../../src/lib/workflows/source-verification/jobs.ts#L234)

- Verify the adversarial role uses a provider family separate from Research verification.
  [`routing.ts:196`](../../src/lib/llm/routing.ts#L196)

- Inspect resumable budget waiting and explicit rerun state transitions.
  [`workflow-runs.ts:248`](../../src/lib/repositories/workflow-runs.ts#L248)

**Schema and persistence**

- Review append-only verification and human-review state bound to exact fingerprints.
  [`schema.prisma:568`](../../prisma/schema.prisma#L568)

- Inspect the isolated, intentionally unapplied migration before any deployment work.
  [`migration.sql:1`](../../prisma/migrations/20260714120000_pre_draft_source_admission/migration.sql#L1)

**Chapter review and downstream gate**

- Follow ownership-scoped loading, readiness calculation, verification, and stale-safe decisions.
  [`route.ts:99`](../../src/app/api/books/[slug]/source-review/route.ts#L99)

- Review the one-chapter Gate 1 presentation and admitted-versus-blocked status.
  [`source-review-gate.tsx:32`](../../src/app/books/[slug]/source-review-gate.tsx#L32)

- Confirm Manifest reads exact committed versions and blocks before paid generation.
  [`manifest-generator.ts:25`](../../src/lib/workflows/manifest-generator.ts#L25)

**Regression coverage**

- Inspect behavioral admission, budget, readiness, routing, and downstream gate tests.
  [`source-verification-admission.test.ts:14`](../../tests/source-verification-admission.test.ts#L14)

- Inspect no-network verifier tests for excerpts, fingerprints, uploads, and corrections.
  [`source-verification-engine.test.ts:26`](../../tests/source-verification-engine.test.ts#L26)
