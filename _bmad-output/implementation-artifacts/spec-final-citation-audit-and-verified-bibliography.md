---
title: 'Final Citation Audit and Verified Bibliography'
type: 'feature'
created: '2026-07-14'
status: 'done'
baseline_commit: '3b416eba4f76b6b84f594b6811180124f078c88a'
context:
  - docs/GHOSTWRITR-STABILIZATION-EXECUTION.md
  - _bmad-output/project-context.md
  - _bmad-output/implementation-artifacts/spec-pre-draft-source-admission.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ghostwritr’s bibliography is assembled from draft source-usage records, not independently reconciled to exact approved Opus prose, and remains detached from reader-facing exports. Unsupported or newly introduced final claims can therefore survive while Typesetting still declares a package print-ready.

**Approach:** Implement Packages 6–8 as one final evidence chain: a visible chapter-by-chapter Citation Audit, narrowly scoped correction/invalidation, and an immutable approved citation ledger that supplies the real bibliography to every publication output and gates print-ready status.

## Boundaries & Constraints

**Always:** Audit exact non-stale `approvedFinalVersionId` prose against only current Gate 1 admissions; preserve literal claim spans and evidence IDs; distinguish missing, inaccessible, contradicted, distorted, unsupported, and unused; bind approvals to final-version, source-ledger, policy, and citation-style fingerprints; default nonfiction to Chicago 17 while preserving a typed book setting; keep decisions chapter-scoped; separate internal warnings from reader bibliography; reuse durable jobs, attribution, cache, and $20 confirmation behavior; fail closed before export spend.

**Ask First:** Applying any migration, running live web/model verification, changing already approved prose automatically, or producing a replacement source beyond an inert proposal.

**Never:** Trust current/latest artifacts over exact approval pointers; silently replace a source; inherit an exception across a changed fingerprint; reopen unaffected chapters; include unused sources or internal warnings in the reader bibliography; call a blocked package print-ready; claim to create EPUB when only ebook-source HTML exists; commit, push, deploy, or apply production migrations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Exact supported claim | Current final version + current admitted evidence | Audited claim and chapter can be approved | None |
| Opus distortion/new claim | Number, quote, attribution, or factual span lacks exact support | Blocking finding; only that chapter returns to final-revision review | Typeset remains locked |
| Metadata/link correction | Proposition unchanged; corrected canonical metadata approved | Chapter approval preserved; ledger/bibliography refreshed | Stale decision returns `409` |
| Replacement proposal | Proposed alternate source | Inert until independently verified and human-admitted | No automatic substitution |
| Exception | Exact finding accepted with required reason | Append-only exception bound to exact fingerprints | Changed claim/source invalidates it |
| Publication | All chapters and locked ledger current | Same approved bibliography appears in DOCX, PDF source, HTML, Markdown, ebook source, and manifests | Block with `409`; explicit output is marked proof-only |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- add `CITATION_AUDIT`, audit artifact/state/review contracts, citation style, and locked-ledger identity.
- `src/lib/workflow-registry.ts`, `src/lib/workflows/stage-transition-service.ts` -- place nonfiction Citation Audit between Editing and Typeset; fiction remains unchanged.
- `src/lib/workflows/citation-audit/`, `src/lib/repositories/citation-audit.ts` -- exact-version loader, pure audit engine, durable jobs, review/currentness, remediation, and ledger lock.
- `src/app/api/internal/workflow-runs/process/route.ts` -- dispatch chapter audit jobs without generic auto-advance.
- `src/app/api/books/[slug]/citation-audit/`, `src/app/books/[slug]/citation-audit/` -- ownership-scoped one-chapter review and correction actions.
- `src/lib/workflows/bibliography-generator.ts` -- render used, approved ledger entries; keep audit warnings separate.
- `src/lib/manuscript-document.ts`, `src/lib/kdp-docx-export.ts` -- insert identical bibliography back matter into all reader formats.
- `src/app/api/books/[slug]/publish-package/route.ts`, export routes, `src/lib/typeset-preflight.ts` -- one shared publication gate, explicit proof mode, no bypass.
- `src/lib/workflows/publish-pipeline.ts`, Typeset UI -- surface citation readiness and disable final downloads while blocked.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma`, isolated migration -- persist exact chapter audit state, append-only reviews, immutable approved ledger, and citation style without applying it.
- [x] `src/lib/workflows/citation-audit/*`, repository, worker -- extract literal final claims, match only admitted evidence, validate model output deterministically, check changed links economically, and resume/cached-run safely.
- [x] registry, transitions, workspace/API/UI -- add nonfiction Citation Audit and one-chapter approve, exception, revision-request, reopen, and stale-conflict flows.
- [x] remediation/invalidation -- preserve approvals for metadata-only fixes; stale only prose-affected chapters and bibliography; require replacement reverification/admission.
- [x] bibliography/publication builders -- lock used-source ledger, apply corrected metadata/style, insert reader bibliography everywhere, keep verification report internal.
- [x] preflight/export/UI -- block all final routes on missing/stale/blocking audit; allow only visibly marked proof output.
- [x] tests -- add execution-level fake-provider/link-checker coverage, renderer parity including DOCX XML, route ownership/conflicts, durable resume/budget pause, invalidation, and bypass prevention.

**Acceptance Criteria:**
- Given approved Opus chapters, when Citation Audit runs, then every external claim has a literal final-prose span and either current admitted support or an explicit blocking finding.
- Given a metadata-only correction, when approved, then chapter approval is unchanged and only citation/bibliography outputs refresh.
- Given unsupported or newly introduced prose, when remediation begins, then only that chapter becomes stale and cannot regain approval without visible final-revision review.
- Given a replacement or exception, when fingerprints or prose change, then prior approval is not inherited.
- Given a current approved ledger, when any final export is built, then identical reader bibliography entries appear in every supported format and internal warnings remain report-only.
- Given any blocker or stale fingerprint, when print-ready export is requested, then it fails before file generation; explicit proof output is unmistakably non-publication.

## Spec Change Log

## Design Notes

The final audit reuses Gate 1 evidence and rechecks the web only for changed/broken links or unresolved evidence. `usedEvidenceKeys` from final prose—not draft context membership—controls bibliography inclusion. A locked ledger fingerprints ordered final versions, text, Gate 1 decisions, policy, and citation style so mutable source rows cannot silently change publication output.

## Verification

**Commands:**
- `npx prisma validate && npx prisma generate` -- schema/client valid; migration remains unapplied.
- `npx tsx --test <citation-audit and publication suites>` -- deterministic fake-provider/link checks and format parity pass without network.
- `npm run check` -- strict TypeScript passes.
- full non-live suite and `npm run build` -- no regression; publication build succeeds.
- `git diff --check` -- clean patch; no generated/runtime/provider-secret changes.

## Suggested Review Order

**Final evidence boundary**

- Start with exact-version loading, chapter completeness, reviews, invalidation, and ledger locking.
  [`citation-audit.ts:51`](../../src/lib/repositories/citation-audit.ts#L51)

- Review literal-span validation, uncovered-claim blockers, and explicit unused evidence.
  [`engine.ts:16`](../../src/lib/workflows/citation-audit/engine.ts#L16)

- Follow durable retry, force-rerun, cache identity, heartbeat, and budget pause behavior.
  [`jobs.ts:42`](../../src/lib/workflows/citation-audit/jobs.ts#L42)

**Workflow and human review**

- Confirm nonfiction inserts Citation Audit between Editing and Typeset only.
  [`workflow-registry.ts:116`](../../src/lib/workflow-registry.ts#L116)

- Inspect ownership-scoped chapter actions and stale-fingerprint conflict handling.
  [`route.ts:27`](../../src/app/api/books/[slug]/citation-audit/route.ts#L27)

- Review the one-chapter audit findings, decisions, and ledger-lock interface.
  [`citation-audit-content.tsx:16`](../../src/app/books/[slug]/citation-audit/citation-audit-content.tsx#L16)

**Publication gate and bibliography**

- See the single fail-closed gate and explicit proof metadata contract.
  [`publication-citation-gate.ts:27`](../../src/lib/publication-citation-gate.ts#L27)

- Review deterministic selected-style rendering from the immutable approved ledger.
  [`bibliography-generator.ts:1`](../../src/lib/workflows/bibliography-generator.ts#L1)

- Trace identical bibliography and proof state through the complete publish package.
  [`route.ts:55`](../../src/app/api/books/[slug]/publish-package/route.ts#L55)

- Confirm reader bibliography and proof notices enter every document renderer.
  [`manuscript-document.ts:114`](../../src/lib/manuscript-document.ts#L114)

- Confirm KDP DOCX receives the same locked back matter.
  [`kdp-docx-export.ts:681`](../../src/lib/kdp-docx-export.ts#L681)

**Schema and rollout boundary**

- Review exact audit state, append-only decisions, style, and immutable ledger schema.
  [`schema.prisma:608`](../../prisma/schema.prisma#L608)

- Inspect the isolated migration and existing-book Citation Audit stage backfill.
  [`migration.sql:1`](../../prisma/migrations/20260714170000_final_citation_audit/migration.sql#L1)

**Regression coverage**

- Review claim coverage, fingerprint, exception, and unused-evidence behavior.
  [`citation-audit-engine.test.ts:14`](../../tests/citation-audit-engine.test.ts#L14)

- Review retry, stage, ledger deduplication, ownership, and persistence contracts.
  [`citation-audit-contracts.test.ts:11`](../../tests/citation-audit-contracts.test.ts#L11)

- Review cross-format bibliography parity, proof flags, DOCX XML, and route gates.
  [`citation-publication-rendering.test.ts:16`](../../tests/citation-publication-rendering.test.ts#L16)
