---
title: 'Source Verification Safe Rollout'
type: 'feature'
created: '2026-07-14'
status: 'in-review'
baseline_commit: '3b416eba4f76b6b84f594b6811180124f078c88a'
context:
  - docs/GHOSTWRITR-STABILIZATION-EXECUTION.md
  - _bmad-output/project-context.md
  - _bmad-output/implementation-artifacts/spec-pre-draft-source-admission.md
  - _bmad-output/implementation-artifacts/spec-final-citation-audit-and-verified-bibliography.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Packages 1–8 establish the evidence gates, but several required safety claims are covered only by isolated helpers or source-text assertions. Ghostwritr needs executed, non-spending proof that false sources cannot enter prose and unresolved final citations cannot reach print-ready output.

**Approach:** Complete Package 9 with deterministic fake search/model/identifier providers, stateful workflow simulations, real document-output inspection, and a repeatable rollout gate. Close defects exposed by these tests without weakening either human approval boundary.

## Boundaries & Constraints

**Always:** Exercise the real Gate 1, durable-job, Gate 2, ledger, and publication seams wherever practical; use injected fakes, fixed clocks, temporary files, and network/provider tripwires; model DOI fallback and primary-versus-secondary source semantics explicitly; verify exact fingerprints, resumability, chapter isolation, and identical bibliography content; preserve the one-chapter-at-a-time approval flow.

**Ask First:** Applying any migration, connecting to a live/shared database, accepting a migration-history remediation, changing product approval policy, or broadening Package 9 beyond defects necessary to satisfy its safety scenarios.

**Never:** Call live web/LLM providers; spend provider money; use production data; deploy, commit, or push; run `db push`, `migrate dev`, or `migrate deploy`; silently replace a source; treat inaccessible as fictional; convert static string-presence assertions into claimed execution coverage; mark rollout ready while local/database migration histories remain unreconciled.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Fabricated or unsupported source | Fake lookup returns not-found, or real snapshot does not support claim | Distinct blocking verdict; no admission/drafting | No substitution or provider fallback |
| Incorrect metadata | Wrong title/author with resolvable source | Explicit correction bound to reviewed fingerprint | Stale correction cannot flow downstream |
| Broken URL, valid DOI | URL fails; fake DOI resolver finds canonical source | Verify canonical evidence and record correction | Unresolved DOI remains blocked |
| Secondary presented as primary | Secondary source asserted as primary evidence | Corroboration/role finding prevents ordinary approval | Manual exception remains explicit |
| Paywall or quotation mismatch | Source inaccessible, or quote differs from exact text | Distinct inaccessible/distorted result | Approval requires documented exception or revision |
| Opus introduces claim | Final prose contains unsupported new fact | Gate 2 blocks only that chapter | Typesetting stays locked |
| Duplicate source | Same canonical source supports multiple chapters | One bibliography entry retains all evidence/chapter links | Conflicting metadata blocks ledger lock |
| Restart/cache/invalidation | Interrupted job, exact replay, then one changed chapter | Resume exactly once; replay avoids provider; only changed chapter stales | Changed source/claim/policy misses cache |
| Publication | Approved ledger or unresolved finding | DOCX and PDF contain identical bibliography when ready; normal exports block otherwise | Proof mode is visibly non-publication |

</frozen-after-approval>

## Code Map

- `src/lib/workflows/source-verification/contracts.ts`, `engine.ts`, `jobs.ts` -- add typed DOI/source-role inputs and injectable resolution needed for deterministic metadata, fallback, cache, and resume scenarios.
- `src/lib/repositories/source-verification.ts`, `src/lib/repositories/workflow-runs.ts` -- expose/test exact cache reuse and lease recovery without duplicate effective verdicts.
- `src/lib/workflows/citation-audit/`, `src/lib/repositories/citation-audit.ts`, `src/lib/publication-citation-gate.ts` -- exercise chapter invalidation, exception currency, ledger deduplication, and fail-closed Typesetting behavior; fix only proven boundary defects.
- `tests/source-verification-engine.test.ts`, `tests/source-verification-admission.test.ts` -- label and complete focused metadata, source-role, unsupported, inaccessible, quote, and exception cases.
- `tests/source-citation-safe-rollout.test.ts` -- stateful fake-provider simulations for admission, interruption/resume, cache hit/miss, two-chapter invalidation, ledger lock, and blocked publication.
- `tests/citation-audit-engine.test.ts`, `tests/citation-publication-rendering.test.ts` -- cover new Opus claims, duplicate sources, real DOCX XML/PDF text, and proof markings.
- `tests/database-integrity-contracts.test.ts`, `tests/api-route-contracts.test.ts` -- verify additive schema/migration contracts and every mutation/export route without applying migrations.
- `package.json`, `docs/SOURCE-CITATION-ROLLOUT.md` -- provide one non-spending QA command and an explicit migration-reconciliation/deployment checklist.

## Tasks & Acceptance

**Execution:**
- [x] Verification contracts/engine/jobs -- implement DOI fallback and source-role semantics through injected dependencies; preserve exact fingerprints, budget gates, and no-substitution policy.
- [x] Stateful test harness -- execute all matrix scenarios with fake model/search/DOI providers, fixed time, temporary storage, and a network tripwire.
- [x] Durable/cache tests -- simulate lost lease, recovery, retry, exact cache reuse, cache invalidation, and exactly-once effective verdict persistence.
- [x] Citation/publication tests -- simulate two chapters through Gate 2 and ledger lock; extract bibliography text from generated DOCX and PDF; execute normal-block/proof-only behavior.
- [x] Safe rollout -- add the focused QA command, schema/migration contract checks, and deployment checklist that keeps migration-history reconciliation an explicit blocker.

**Acceptance Criteria:**
- Given any fabricated, mismatched, secondary, inaccessible, or unsupported evidence scenario, when the deterministic chain runs, then it cannot become ordinary admitted evidence or print-ready prose.
- Given an interrupted or repeated verification, when work resumes, then effective results are not duplicated and exact cache hits make zero provider calls.
- Given one changed chapter in a two-chapter book, when invalidation runs, then the other chapter remains approved while publication stays blocked until the changed chapter is reapproved.
- Given a current locked ledger, when DOCX and PDF are generated, then both contain the same used-source-only bibliography; unresolved findings block normal Typesetting and visibly marked proof output remains available.

## Spec Change Log

- 2026-07-14: Implemented Package 9 and checked all execution tasks after focused and full non-live verification. Status intentionally remains `in-progress` pending human review and migration-history reconciliation.

## Design Notes

Prefer behavioral seams with injected repositories/providers over module mocking. If database execution needs a local disposable PostgreSQL instance, keep those tests opt-in and retain deterministic in-memory contract coverage in the default suite; never reinterpret skipped live-database tests as passed rollout evidence.

## Verification

**Commands:**
- `npm run qa:source-citations` -- all Package 9 fake-provider and document-output scenarios pass with network disabled.
- `npx prisma validate && npx prisma generate` -- schema/client are valid; migrations remain unapplied.
- `npm run check` -- strict TypeScript passes.
- full repository non-live `tsx --test` suite and `npm run build` -- no regression or provider calls.
- `npm audit --omit=dev && git diff --check` -- production dependency audit and patch hygiene pass.
