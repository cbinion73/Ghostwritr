# Deferred Work

## Chapter Draft artifact lifecycle hardening

Surfaced during the post-stabilization consolidation review and verified as pre-existing behavior outside the behavior-preserving refactor scope:

- Scope Chapter Draft artifact reads and mutations by expected artifact type, stage, and stable chapter identity rather than broad book/title matches.
- Make artifact-version creation, approval-state changes, and stage transitions atomic so partial failures cannot leave lifecycle state split across records.
- Prevent empty or versionless Chapter Draft groups from satisfying approval or stage-advance gates.
- Reject unsupported or missing `stageKey` values instead of silently falling back to Chapter Draft behavior.
- Tighten PATCH lookup and authorization to the exact chapter artifact/version being revised.
- Add focused regression tests for concurrent saves, approve-all races, partial transaction failures, and malformed legacy artifacts.

## Prisma migration-history reconciliation

Surfaced while implementing pre-draft source admission and confirmed as pre-existing repository/database drift:

- Reconcile the local migration directory with the database migration table before any new migration is deployed.
- The inspected database reports three applied migrations absent locally, while nine local migrations are not recorded as applied there.
- Produce and review a live-schema diff before resolving or deploying `20260714120000_pre_draft_source_admission`.
- Do not use `prisma migrate deploy` against that database until the history split has an explicit, backed-up remediation plan.
