# Deferred Work

## Chapter Draft artifact lifecycle hardening

Surfaced during the post-stabilization consolidation review and verified as pre-existing behavior outside the behavior-preserving refactor scope:

- Scope Chapter Draft artifact reads and mutations by expected artifact type, stage, and stable chapter identity rather than broad book/title matches.
- Make artifact-version creation, approval-state changes, and stage transitions atomic so partial failures cannot leave lifecycle state split across records.
- Prevent empty or versionless Chapter Draft groups from satisfying approval or stage-advance gates.
- Reject unsupported or missing `stageKey` values instead of silently falling back to Chapter Draft behavior.
- Tighten PATCH lookup and authorization to the exact chapter artifact/version being revised.
- Add focused regression tests for concurrent saves, approve-all races, partial transaction failures, and malformed legacy artifacts.
