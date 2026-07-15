---
title: 'Legacy Completed Stage View Access'
type: 'bugfix'
created: '2026-07-15'
status: 'done'
baseline_commit: '3b416eba4f76b6b84f594b6811180124f078c88a'
context:
  - CLAUDE.md
  - _bmad-output/project-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The new nonfiction Phase 1 Strategic Brief gate locks every downstream Studio room when the brief is absent. Completed books created before that artifact existed still retain committed stage data, but their pages cannot be opened for reading.

**Approach:** Preserve the strict Phase 1 gate for all new or unfinished downstream work, while treating an already-committed stage as grandfathered read access. This is a presentation-access exception only; generation, transition, approval, and publication gates remain unchanged.

## Boundaries & Constraints

**Always:** A stage whose own status is `COMMITTED` must remain viewable even if its preceding stage is newly inserted or its book lacks a Phase 1 Strategic Brief. Any `NOT_STARTED`, `IN_PROGRESS`, `READY_FOR_REVIEW`, or `BLOCKED` downstream nonfiction stage without an approved brief remains locked.

**Ask First:** Any expansion from view access into permission to generate, recommit, advance, publish, or backfill artifacts.

**Never:** Create or fake a Phase 1 artifact, alter stage status, mutate legacy books, weaken workflow-side Phase 1 assertions, or exempt new work from the gate.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Legacy completed stage | Stage committed; brief absent; prior stage absent or not started | Room is selectable and its persisted content loads | No data mutation |
| New downstream stage | Stage not started; brief absent | Room remains locked | Existing dependency guidance remains |
| Unfinished legacy stage | In progress, review ready, or blocked; brief absent | Room remains locked | User must complete Phase 1 |
| Current valid book | Brief committed; prerequisites complete | Existing navigation behavior is unchanged | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/ui/stage-access-policy.ts` -- pure Studio visibility policy separating legacy read access from workflow authorization.
- `src/app/books/[slug]/page.tsx` -- applies the policy while constructing navigable Studio stages.
- `tests/studio-stage-access-policy.test.ts` -- non-spending regression coverage for legacy and new-book states.
- `tests/phase1-strategic-brief.test.ts` -- confirms workflow-side strict Phase 1 enforcement remains wired.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/ui/stage-access-policy.ts` -- add a pure lock decision with committed-stage grandfathering.
- [x] `src/app/books/[slug]/page.tsx` -- delegate stage locking to the policy without changing artifact or stage queries.
- [x] `tests/studio-stage-access-policy.test.ts` -- cover committed legacy access and strict unfinished-stage gating.
- [x] Verify completed local nonfiction books can deep-link to committed rooms without database writes.

**Acceptance Criteria:**
- Given a legacy nonfiction book with a committed Typeset stage and no strategic brief, when Typeset is requested, then Typeset loads instead of falling back to Setup.
- Given a new nonfiction book without a strategic brief, when an unstarted downstream stage is requested, then that stage remains unavailable.
- Given any generation or transition operation, when the strategic brief is absent, then existing workflow assertions still reject the operation.

## Spec Change Log

## Design Notes

Grandfather the stage, not the entire book. A legacy book may contain both completed historical rooms and newly added unfinished rooms; only the former receive read access.

## Verification

**Commands:**
- `npm run check` -- expected: clean TypeScript.
- `GHOSTWRITR_LIVE_LLM_TESTS=0 npx tsx --test tests/studio-stage-access-policy.test.ts tests/phase1-strategic-brief.test.ts` -- expected: all tests pass without provider calls.
- `npm run build` -- expected: production build completes.

**Manual checks:**
- Request committed Outline, Chapter Draft, Editing, and Typeset rooms on legacy books; confirm the requested room stays selected.

## Suggested Review Order

**Access policy**

- Committed rooms bypass display locks while unfinished work retains every prerequisite.
  [`stage-access-policy.ts:18`](../../src/lib/ui/stage-access-policy.ts#L18)

- Studio stage construction applies the pure policy without mutating stored state.
  [`page.tsx:105`](../../src/app/books/%5Bslug%5D/page.tsx#L105)

**Regression coverage**

- Tests separate legacy view access from strict new-work gating.
  [`studio-stage-access-policy.test.ts:6`](../../tests/studio-stage-access-policy.test.ts#L6)
