# Story P1.3: Expand The Editor Agent

Status: draft

## Story

As an author,
I want the editor agent to reason at both whole-book and chapter level,
so that revisions stay globally coherent while still fixing local problems.

## Acceptance Criteria

1. The editor agent can propose a whole-book revision strategy.
2. The editor can focus on one chapter while preserving whole-book context.
3. The editor can target selected sections for regeneration.
4. The system can apply revision preferences across the manuscript.

## Tasks / Subtasks

- [ ] Add whole-book revision plan generation
- [ ] Add chapter-focused editorial actions
- [ ] Add targeted section regeneration
- [ ] Add reusable author preference memory for editorial choices

## Dev Notes

- This story builds on P0.1, not in parallel with it.

### References

- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/workflows/editing.ts]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/app/books/[slug]/editing/page.tsx]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

