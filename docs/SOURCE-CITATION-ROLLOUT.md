# Source and Citation Safe Rollout

This checklist is the deployment boundary for Ghostwritr's two evidence gates:

1. Gate 1 verifies and admits Research and External Stories before drafting.
2. Gate 2 audits the exact approved final prose, locks the used-source bibliography, and blocks publication until every chapter is current.

## Non-spending verification

Run from the repository root:

```sh
npm run qa:source-citations
npx prisma validate
npx prisma generate
npm run check
npm run build
npm audit --omit=dev
git diff --check
```

`qa:source-citations` uses deterministic fake search, DOI, link-check, and model behavior. Its network tripwire fails if a scenario attempts to use `fetch`. It creates only temporary DOCX/PDF files and makes no paid provider calls.

Do not run `prisma db push`, `prisma migrate dev`, or `prisma migrate deploy` as part of this QA command.

## Migration reconciliation blocker

The local migration directory and the target database migration history are known to have diverged. That is an explicit deployment blocker, not a warning to bypass.

Before any shared or production migration:

- [ ] Back up the target database and record its exact Prisma migration history.
- [ ] Diff the target live schema against `prisma/schema.prisma` without changing either side.
- [ ] Review the two additive migrations in order:
  - `20260714120000_pre_draft_source_admission`
  - `20260714170000_final_citation_audit`
- [ ] Confirm existing enum values, tables, indexes, and constraints do not collide with either migration.
- [ ] Write and review an explicit migration-history reconciliation plan.
- [ ] Obtain human authorization for that exact plan and target environment.
- [ ] Rehearse it against a disposable clone containing representative book, chapter, artifact, job, approval, and citation data.
- [ ] Verify rollback/restore, then rerun `npm run qa:source-citations` and the full non-live suite.

Until every item above is complete, do not run a migration command against a shared database and do not label the rollout ready.

## Disposable-environment acceptance

After reconciliation is approved, verify on a disposable database clone:

- Gate 1 preserves append-only verifier results and human decisions.
- Lost leases recover without duplicate effective verdicts.
- Exact fingerprint replays make no provider call; changed claim/source/policy fingerprints miss the cache.
- A changed chapter invalidates only its own source/citation approvals.
- Nonfiction Typesetting remains locked until every exact final chapter audit and the citation ledger are current.
- Normal exports return blocked status while proof mode remains visibly marked non-publication.
- DOCX and PDF contain the same used-source-only bibliography.

## Production release and monitoring

- [ ] Deploy application code only after the authorized migration sequence succeeds.
- [ ] Confirm the worker recognizes `adversarial_source_verification` and citation-audit jobs.
- [ ] Confirm the per-book $20 confirmation gate pauses and resumes both job types.
- [ ] Monitor failed/expired leases, cache reuse, manual exceptions, unresolved findings, and blocked publication attempts.
- [ ] Sample completed books to ensure bibliography entries correspond only to evidence actually used by approved final prose.
- [ ] Keep proof artifacts out of production distribution channels.

Stop the rollout on any migration discrepancy, provider call during fake QA, stale approval accepted as current, publication bypass, or bibliography mismatch.

### Deliberate polymorphic provenance exception

`SourceVerificationResult.sourceRecordId` can identify either a `ResearchSource` or an `ExternalStorySource`, so PostgreSQL cannot express it as one ordinary foreign key. The worker validates the matching record, committed artifact version, book, chapter, and pack type before execution. All non-polymorphic Package 9 provenance pointers—including artifact versions, workflow runs, verification results, final versions, and users—use database foreign keys with retention-safe `RESTRICT` or `SET NULL` behavior.
