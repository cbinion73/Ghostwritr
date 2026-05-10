# GHOSTWRITR — Delivery Backlog (May 2026)

**Status:** Plan of record for current product completion work  
**Author:** Codex + Chris backlog synthesis  
**Date:** 2026-05-04  
**Supersedes for active delivery:** `_bmad-output/planning/05-epics-and-stories.md` for near-term build sequencing

---

## Purpose

This backlog converts the current product-gap assessment into a BMAD-ready delivery set that engineering can build from directly.

The backlog is organized by delivery priority:

- **P0** — Make the core product trustworthy
- **P1** — Make the writing output exceptional
- **P2** — Make it fully automated and publish-ready

This document is the index. Detailed epic docs live in:

- `_bmad-output/planning-artifacts/epic-p0-core-trustworthiness.md`
- `_bmad-output/planning-artifacts/epic-p1-writing-quality.md`
- `_bmad-output/planning-artifacts/epic-p2-publish-automation.md`

Detailed story files live in:

- `_bmad-output/implementation-artifacts/stories/`

Current execution tracking lives in:

- `_bmad-output/planning/07-execution-tracker.csv`

---

## Current Product Estimate

- **Platform shell completeness:** ~72%
- **Full ghostwriter vision completeness:** ~58–62%

The remaining gap is no longer foundational workflow construction. It is:

1. editorial intelligence
2. artifact integrity and stale-state correctness
3. publish-ready finishing
4. stronger automation orchestration
5. richer draft quality across nonfiction and fiction

## Live Tracker

The original story files remain the plan-of-record artifact set, but active implementation progress is now tracked separately in:

- `_bmad-output/planning/07-execution-tracker.csv`

That tracker reflects current codebase reality and includes:

- epic
- story
- status
- percent
- evidence files
- remaining gap

---

## Delivery Order

### P0 — Trust the machine

**Objective:** make the current system dependable enough to run real books through without ambiguity or silent drift.

**Epics**

1. Finish Editing as a real editorial system
2. Unify artifact validation
3. Add dependency invalidation
4. Harden workflow integrity
5. Add reliability and regression coverage

### P1 — Improve book quality

**Objective:** make the output materially better, not just more automated.

**Epics**

1. Deepen nonfiction draft intelligence
2. Deepen fiction draft intelligence
3. Expand the editor agent
4. Polish stage UX

### P2 — Complete the product

**Objective:** make the app fully automated and publish-ready.

**Epics**

1. Build Publish / Typesetting
2. Expand autopilot into a full workflow conductor
3. Upgrade dashboard and library management
4. Build final publish-ready package UI

---

## Immediate Build Queue

These are the first five stories I would pull:

1. `P0.1` — Finish Editing as a real editorial system
2. `P0.2` — Unify artifact validation
3. `P0.3` — Add dependency invalidation
4. `P0.5` — Reliability and regression coverage
5. `P2.1` — Publish / Typesetting

Why this queue:

- `Editing` is the largest remaining product-value gap.
- Validation and stale-state handling protect every later stage.
- Test coverage reduces regression risk while the app gets more agentic.
- `Publish` closes the end-to-end promise faster than polishing intermediate stages forever.

---

## Story Index

### P0 Stories

- `story-p0-1-editing-system.md`
- `story-p0-2-artifact-validation.md`
- `story-p0-3-dependency-invalidation.md`
- `story-p0-4-workflow-integrity.md`
- `story-p0-5-reliability-regression.md`

### P1 Stories

- `story-p1-1-nonfiction-draft-intelligence.md`
- `story-p1-2-fiction-draft-intelligence.md`
- `story-p1-3-editor-agent-expansion.md`
- `story-p1-4-stage-ux-polish.md`

### P2 Stories

- `story-p2-1-publish-typesetting.md`
- `story-p2-2-full-workflow-conductor.md`
- `story-p2-3-dashboard-library-management.md`
- `story-p2-4-publish-ready-package-ui.md`

---

## Build Rules

1. P0 stories should be treated as **ready-for-dev**.
2. P1 stories are **ready-for-refinement / ready-for-dev depending on team bandwidth**.
3. P2 stories should begin only after P0 is mostly complete unless a dependency-free slice is obvious.
4. Nonfiction behavior must not regress while fiction matures.
5. Shared substrate should continue to be reused, but workflow-family boundaries must remain explicit.
