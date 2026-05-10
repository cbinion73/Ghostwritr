# Story P0.5: Reliability And Regression Coverage

Status: ready-for-dev

## Story

As a development team,
I want strong regression coverage around workflows and artifacts,
so that the platform can evolve without breaking core ghostwriting behavior.

## Acceptance Criteria

1. Seeded nonfiction and fiction reference books exist for repeatable tests.
2. End-to-end regression coverage exists for both workflow families.
3. Artifact contract tests exist for critical saved shapes.
4. Autopilot continuation tests exist.
5. Editing/export regression tests exist.

## Tasks / Subtasks

- [ ] Add seeded nonfiction reference book fixture
- [ ] Add seeded fiction reference book fixture
- [ ] Add workflow-family smoke/regression tests
- [ ] Add artifact contract tests
- [ ] Add autopilot continuation tests
- [ ] Add editing/export test coverage

## Dev Notes

- Use the current `fiction-smoke` pattern as a starting point, but make fixtures deterministic.
- Browser tests should focus on meaningful workflow correctness, not only page rendering.

### Project Structure Notes

- Likely touch: `scripts/`, `test-results/`, future test folders, seeded data utilities

### References

- [Source: /Users/chris/Desktop/GHOSTWRITR/scripts/e2e-audit.mjs]
- [Source: /Users/chris/Desktop/GHOSTWRITR/test-results/fiction-ui-smoke/report.json]
- [Source: /Users/chris/Desktop/GHOSTWRITR/test-results/workflow-autopilot-smoke/report.json]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

