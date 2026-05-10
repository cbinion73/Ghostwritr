# Story P0.3: Add Dependency Invalidation

Status: ready-for-dev

## Story

As an author,
I want downstream stages to become visibly stale when upstream artifacts change,
so that I never mistake outdated outputs for current truth.

## Acceptance Criteria

1. Nonfiction dependency invalidation rules are defined and enforced.
2. Fiction dependency invalidation rules are defined and enforced.
3. When an upstream committed artifact changes, affected downstream stages are marked stale.
4. UI surfaces explain what changed and what needs regeneration.
5. Authors can intentionally reset or regenerate stale stages.

## Tasks / Subtasks

- [ ] Define stage dependency graph for nonfiction
- [ ] Define stage dependency graph for fiction
- [ ] Implement stale-state metadata and stage updates
- [ ] Add stale banners/messages to affected UIs
- [ ] Add explicit reset/regenerate flows
- [ ] Add tests for invalidation propagation

## Dev Notes

- Keep workflow-family boundaries explicit; do not smear fiction/nonfiction semantics together.
- Stale-state metadata should be machine-readable for automation and UI.
- This story directly affects automation correctness.

### Project Structure Notes

- Likely touch: `src/lib/workflow-registry.ts`, `src/lib/workflows/*`, stage actions/pages

### References

- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/workflow-registry.ts]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/workflows/fiction.ts]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/workflows/outline.ts]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/workflows/editing.ts]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

