# Story P2.2: Expand Autopilot Into A Full Workflow Conductor

Status: draft

## Story

As an author,
I want GHOSTWRITR to run a book intelligently to the next safe boundary,
so that I do not need to babysit every stage transition.

## Acceptance Criteria

1. Automation modes exist for manual, assisted, continuous, run-to-next-boundary, and run-to-full-draft.
2. The automation system keeps a visible audit trail.
3. Failure/retry/recovery behavior is clearer and smarter.
4. Per-book automation policy is configurable.

## Tasks / Subtasks

- [ ] Add automation mode model and controls
- [ ] Add automation audit trail/history
- [ ] Add smarter retry/recovery behaviors
- [ ] Add per-book automation policy settings

## Dev Notes

- Build on the current workflow autopilot work rather than replacing it.

### References

- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/workflows/workflow-automation.ts]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/app/api/internal/workflow-runs/process/route.ts]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

