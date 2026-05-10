# Story P0.2: Unify Artifact Validation

Status: ready-for-dev

## Story

As a workflow platform,
I want one shared artifact validation layer,
so that malformed or stale artifacts fail clearly instead of degrading the product in unpredictable ways.

## Acceptance Criteria

1. A shared validator/parser layer exists for workflow artifacts across fiction and nonfiction.
2. Stage loaders and actions use the shared validator instead of ad hoc JSON assumptions.
3. Invalid artifacts surface clear errors to the UI and do not silently pass through.
4. Legacy or older artifact shapes are normalized where possible.
5. Tests cover malformed, partial, and stale artifact cases.

## Tasks / Subtasks

- [ ] Create shared artifact parse/validate module
- [ ] Replace remaining manual JSON parsing in workflow loaders
- [ ] Add clear UI-facing error messages for invalid artifacts
- [ ] Add normalization for known legacy shapes
- [ ] Add contract tests for artifact validation paths

## Dev Notes

- This should reduce repeated `parseJson`/raw-cast patterns across workflows.
- Validation needs to support both strict failure and controlled normalization.
- This story is foundational for stale-state handling and automation trust.

### Project Structure Notes

- Likely touch: `src/lib/json-utils.ts`, `src/lib/workflows/*`, `src/lib/repositories/*`
- Audit both fiction and nonfiction workflow loaders

### References

- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/workflows/promise.ts]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/workflows/outline.ts]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/workflows/fiction.ts]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/json-utils.ts]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

