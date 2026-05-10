# Story P0.1: Finish Editing As A Real Editorial System

Status: ready-for-dev

## Story

As an author,
I want the Editing stage to behave like a real whole-book editorial system,
so that GHOSTWRITR can refine a manuscript instead of only assembling and previewing it.

## Acceptance Criteria

1. Editing can generate a full-book editorial assessment from the committed manuscript.
2. Editing supports revision modes for structure, clarity, pacing, continuity, voice consistency, and line edit.
3. Editing supports chapter-level revision actions while preserving whole-book context.
4. Editing stores revision history and allows comparing at least two manuscript versions.
5. Editing supports apply/accept/reject workflows for proposed revisions.

## Tasks / Subtasks

- [ ] Add editorial assessment artifact type and workflow output
- [ ] Add revision mode selection to Editing UI
- [ ] Add chapter-targeted editorial actions
- [ ] Add persisted revision suggestions and decision states
- [ ] Add manuscript version diff/compare support
- [ ] Add tests for editorial artifact creation and editing-state transitions

## Dev Notes

- Editing already exists as a real stage with assembly and export plumbing; extend rather than replace it.
- Preserve both nonfiction and fiction support in the Editing layer.
- Revision artifacts should remain explicit and versioned, not hidden in chat transcripts.

### Project Structure Notes

- Primary workflow: `src/lib/workflows/editing.ts`
- Primary UI: `src/app/books/[slug]/editing/`
- Related types/repos: `src/lib/editing-types.ts`, `src/lib/repositories/editing-artifacts.ts`

### References

- [Source: /Users/chris/Desktop/GHOSTWRITR/src/lib/workflows/editing.ts]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/app/books/[slug]/editing/page.tsx]
- [Source: /Users/chris/Desktop/GHOSTWRITR/src/app/api/books/[slug]/manuscript-export/route.ts]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

