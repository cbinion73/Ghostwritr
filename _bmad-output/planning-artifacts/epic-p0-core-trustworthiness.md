# Epic P0 — Core Trustworthiness

**Priority:** P0  
**Status:** Ready for execution  
**Objective:** Make GHOSTWRITR dependable enough to trust with real books, real artifacts, and long-running automation.

## Why this epic exists

The platform now has real nonfiction and fiction workflows, editing, export, dashboards, and autopilot beginnings. The remaining P0 gap is trust:

- can artifacts be trusted?
- can downstream stages detect upstream drift?
- can stage state be relied on?
- can the editor stage act as a serious review surface?
- can the system evolve without regressions?

If this epic is incomplete, later quality and publishing work will sit on unstable foundations.

## Stories

1. `P0.1` Finish Editing as a real editorial system
2. `P0.2` Unify artifact validation
3. `P0.3` Add dependency invalidation
4. `P0.4` Harden workflow integrity
5. `P0.5` Reliability and regression coverage

## Exit criteria

- Editing supports meaningful full-book and chapter-level revision workflows
- Artifacts are validated consistently
- Upstream changes reliably invalidate downstream state
- Workflow stage advancement is deterministic
- Regression coverage exists for both workflow families

