# Story P0.4: Harden Workflow Integrity

Status: ready-for-dev

## Story

As a product owner,
I want stage progression to be deterministic and safe,
so that the system cannot advance on ambiguous or incomplete upstream state.

## Acceptance Criteria

1. All routes and actions enforce committed-upstream requirements consistently.
2. No stage can advance through an unintended loophole.
3. Commit, ready-for-review, blocked, and running semantics are standardized across workflows.
4. Automation-state handling is consistent for canceled, failed, retried, and resumed runs.
5. Workflow-run tests cover the critical progression paths.

## Tasks / Subtasks

- [ ] Audit routes/actions for committed-upstream enforcement
- [ ] Standardize stage status and automation metadata semantics
- [ ] Tighten retry/resume/cancel transitions
- [ ] Add regression tests for progression rules

## Dev Notes

- This story should remove “looks done but isn’t really done” states.
- Coordinate with artifact validation and dependency invalidation stories.

### Project Structure Notes

- Likely touch: `src/app/books/[slug]/**/actions.ts`, `src/lib/workflows/stage-controls.ts`, `src/lib/repositories/workflow-runs.ts`

### References

- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/workflows/stage-controls.ts]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/app/api/internal/workflow-runs/process/route.ts]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/repositories/workflow-runs.ts]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

