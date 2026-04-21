# GHOSTWRITR v1 — Epics + Stories

**Status:** Ready for development
**Author:** John (Product Manager)
**Date:** 2026-04-20
**Source:** PRD v1 (`02-prd.md`); Architecture (`03-architecture.md`); checkpoint `post-voice-framework`

## Structure

Each release phase (R1–R5) maps to one or more Epics. Each Epic contains Stories.
Effort scale: **XS** < half day · **S** < 1 day · **M** 1–2 days · **L** 3+ days. Relative, not wall-clock.
Status: **[READY]** = AC + deps + files identified, pickable now. **[DRAFT]** = needs more definition before a sprint pulls it.

---

## Epic E1 — Observable Pipeline [R1]

**Goal:** Every stage's state, cost, and gate decision is measurable, typed, and inspectable. Nothing in R2+ is safe to build until we can see what the system is doing.

**Why first:** We cannot verify the $40/book ceiling, we cannot debug production Stage 10, and we cannot prove quality gates are firing correctly without observable call logs and typed gate outputs. This is non-negotiable foundation.

### Stories

#### E1.S1: Baseline Prisma migration resolves schema drift [READY]
- **AC:**
  - `npx prisma migrate status` reports "Database schema is up to date" against local dev DB.
  - No pending migrations, no drift warnings on fresh clone + `prisma migrate deploy`.
  - A new `0000_baseline` migration exists that reflects current production DB state.
  - `WriterPersona.frameworkFlowJson` and `frameworkName` columns included in baseline.
  - Rollback plan documented in migration folder README: how to restore from `checkpoint/post-voice-framework` if this breaks.
- **Effort:** M
- **Depends on:** nothing (this unblocks everything)
- **Touches:** `prisma/schema.prisma`, `prisma/migrations/*`, dev DB, `checkpoint/post-voice-framework` reference

#### E1.S2: LLMCallLog schema + write-path instrumentation [READY]
- **AC:**
  - New Prisma model `LLMCallLog` with fields: `id`, `createdAt`, `workflowRunId`, `stage`, `agentName`, `provider`, `model`, `inputTokens`, `outputTokens`, `costUsd`, `latencyMs`, `status` (`success`/`error`/`timeout`), `errorMessage?`, `promptHash` (sha256 of input), `outputHash?`.
  - Every call through `src/lib/llm/routing.ts` (or equivalent provider dispatcher) writes one row per LLM invocation.
  - Failed calls also write a row with `status=error` — no silent failures.
  - An integration test verifies: invoking any agent results in at least one `LLMCallLog` row committed.
  - Query helper `getCallLogsForRun(runId)` returns logs in chronological order.
- **Effort:** M
- **Depends on:** E1.S1
- **Touches:** `prisma/schema.prisma`, `src/lib/llm/routing.ts`, `src/lib/repositories/` (new `llm-call-log.ts`), all direct provider call sites (audit needed — see E2.S1)

#### E1.S3: Typed GateDecision<A> discriminated union [READY]
- **AC:**
  - New type in `src/lib/workflows/types.ts`: `GateDecision<A> = { kind: 'pass', artifact: A, reasons: string[] } | { kind: 'retry', reasons: string[], hint?: string } | { kind: 'fail', reasons: string[] }`.
  - `src/lib/workflows/quality-agent.ts` returns `GateDecision<QualityArtifact>` (not a loose object).
  - `src/lib/workflows/stage-controls.ts` consumes the discriminated union via exhaustive switch — TS errors if a kind is unhandled.
  - At least one unit test per kind proves the consumer dispatches correctly.
  - No `any` in the gate return path.
- **Effort:** S
- **Depends on:** nothing (can parallelize with S1/S2)
- **Touches:** `src/lib/workflows/types.ts` (new or extended), `src/lib/workflows/quality-agent.ts`, `src/lib/workflows/stage-controls.ts`, `src/app/api/internal/workflow-runs/process/route.ts`

#### E1.S4: Router contract test [READY]
- **AC:**
  - New test file `src/lib/llm/__tests__/routing.contract.test.ts`.
  - For each configured stage/agent pair in the routing config, the test asserts: expected provider, expected model, expected family (Claude / OpenAI / Gemini).
  - Explicitly asserts the critic family constraint: voice critic's model family ≠ author's model family (per routing philosophy).
  - Test fails loudly if a routing entry is added/removed without test update.
  - Runs in CI via `npm test` (or the equivalent script already wired).
- **Effort:** S
- **Depends on:** E1.S3 (types) only if router returns typed decisions; otherwise independent
- **Touches:** `src/lib/llm/routing.ts`, new `__tests__/routing.contract.test.ts`, `vitest.config.ts` (if test runner needs config)

---

## Epic E2 — Framework-Aware Production Draft [R2]

**Goal:** Stage 10 drafts hit production quality using the `WriterPersona.frameworkFlowJson` on record, with a voice-guard critic that can veto. Regenerate flow is idempotent.

**Why now:** PRD success criterion #2 is "Stage 10 production quality for Drucker and Elon." Everything here serves that.

### Stories

#### E2.S1: Agent<I,O> abstraction — refactor `chapter-draft` [READY]
- **AC:**
  - Interface `Agent<I,O> { name: string; run(input: I, ctx: AgentContext): Promise<O> }` in `src/lib/agents/types.ts`.
  - `src/lib/workflows/chapter-draft.ts` is rewritten as a class/function implementing `Agent<ChapterDraftInput, ChapterDraftOutput>`.
  - All LLM calls inside the agent go through `ctx.llm` — no direct `openai.*` / `anthropic.*` imports in the agent file.
  - Existing call sites updated; no behavior change observable in output for an identical input (golden test snapshot).
  - Logs via `ctx.logger` not `console.log`.
- **Effort:** M
- **Depends on:** E1.S2 (LLMCallLog needs `ctx.llm` as the single choke point)
- **Touches:** `src/lib/agents/types.ts` (new), `src/lib/workflows/chapter-draft.ts`, any caller in `src/app/api/**`

#### E2.S2: Agent<I,O> refactor — `research` workflow [READY]
- **AC:**
  - `src/lib/workflows/research.ts` refactored to the same `Agent<I,O>` shape.
  - Three-agent routing (GPT-5.4 researcher → 5.4-mini extractor → Haiku verifier, per memory note) preserved; each sub-call flows through `ctx.llm`.
  - Existing research artifact outputs unchanged for an identical knowledge base input.
  - `src/app/books/[slug]/research/actions.ts` updated to invoke the refactored agent.
- **Effort:** M
- **Depends on:** E2.S1 (pattern established), E1.S2
- **Touches:** `src/lib/workflows/research.ts`, `src/app/books/[slug]/research/actions.ts`, `src/lib/repositories/research-artifacts.ts`

#### E2.S3: Agent<I,O> refactor — `outline` workflow [READY]
- **AC:**
  - `src/lib/workflows/outline.ts` refactored to `Agent<OutlineInput, OutlineOutput>`.
  - ME-WE-TRUTH-YOU-WE framework per chapter preserved (per outline architecture memo).
  - Sonnet fallback scaffold path preserved (per outline fallback memo) — fallback invocation now also logs via `ctx.llm`.
  - Existing outline page rendering (`src/app/books/[slug]/outline/page.tsx`) unchanged.
- **Effort:** M
- **Depends on:** E2.S1, E1.S2
- **Touches:** `src/lib/workflows/outline.ts`, `src/app/books/[slug]/outline/page.tsx`

#### E2.S4: Framework-flow routing inside chapter-draft [READY]
- **AC:**
  - Chapter-draft agent reads `WriterPersona.frameworkFlowJson` for the book's selected persona.
  - Routes generation through the framework's declared beats/sections (not a hardcoded sequence).
  - Unit test: given a mock persona with a 3-beat framework, the agent produces 3 corresponding output sections.
  - Unit test: given a persona with no framework (null), falls back to current behavior — does not crash.
  - Works for both Drucker and Elon personas (canonical in `src/lib/personas/`).
- **Effort:** M
- **Depends on:** E2.S1
- **Touches:** `src/lib/workflows/chapter-draft.ts`, `src/lib/personas/*`

#### E2.S5: Voice-guard critic agent [READY]
- **AC:**
  - New agent `src/lib/agents/voice-critic.ts` implementing `Agent<VoiceCriticInput, GateDecision<ChapterDraft>>`.
  - Critic's model family ≠ author's model family (enforced in router config, tested in E1.S4).
  - Input: draft + persona voice profile. Output: `GateDecision` with specific voice-violation reasons when retrying.
  - Integration test: a deliberately off-voice sample returns `{ kind: 'retry', reasons: [...] }` with non-empty reasons.
  - Integration test: an on-voice sample returns `{ kind: 'pass', ... }`.
- **Effort:** M
- **Depends on:** E1.S3, E2.S1
- **Touches:** `src/lib/agents/voice-critic.ts` (new), `src/lib/llm/routing.ts`, `src/lib/workflows/quality-agent.ts` (integration point)

#### E2.S6: Regenerate flow honors gate decisions [READY]
- **AC:**
  - When voice-critic returns `retry`, workflow regenerates the chapter with the critic's reasons fed back into the prompt.
  - Max retry count = 2 (configurable constant, documented). Third failure surfaces `fail` to UI, does not infinite-loop.
  - Each retry writes its own `LLMCallLog` row and a workflow-step row so the retry chain is auditable.
  - Manual "regenerate" button in UI triggers the same path with gate reasons visible to user.
  - Regeneration is idempotent against the same input — no duplicate artifacts, existing artifact is versioned or replaced with a clear rule.
- **Effort:** M
- **Depends on:** E2.S5, E1.S2, E1.S3
- **Touches:** `src/app/api/internal/workflow-runs/process/route.ts`, `src/lib/workflows/stage-controls.ts`, chapter-draft agent, UI trigger (existing)

---

## Epic E3 — Spine View UI [R3]

**Goal:** Chris can see the whole book as a spine — all chapters, their stage state, and jump into any one to inspect or regenerate.

**Why:** PRD success criterion #4. Also the only way Chris can efficiently walk the canonical book through R4 ship.

### Stories

#### E3.S1: Spine data aggregation endpoint [READY]
- **AC:**
  - New route: `GET /api/books/[slug]/spine` returns `{ chapters: Array<{ id, order, title, stage, status, artifactCount, lastRunId, costUsd }> }`.
  - Aggregates from existing workflow/artifact tables in a single DB round-trip (or documented N+1 if unavoidable).
  - Returns in < 500ms p95 for a 20-chapter book on dev DB.
  - Excluded chapters / soft-deleted rows filtered.
- **Effort:** S
- **Depends on:** E1.S1 (stable schema), E1.S2 (cost aggregation reads from LLMCallLog)
- **Touches:** `src/app/api/books/[slug]/spine/route.ts` (new), `src/lib/repositories/`

#### E3.S2: Spine view page component [READY]
- **AC:**
  - New page `src/app/books/[slug]/spine/page.tsx`.
  - Renders one row per chapter: order, title, stage badge, status (idle/running/failed/passed), cost-to-date, "open" action.
  - Uses the existing segmented progress bar component from commit `ef2df7f` for per-chapter stage progress.
  - No layout shift while loading; skeleton state while fetching.
  - Link from book home and from sidebar.
- **Effort:** M
- **Depends on:** E3.S1
- **Touches:** `src/app/books/[slug]/spine/page.tsx` (new), existing sidebar/nav, existing progress-bar component

#### E3.S3: Chapter drawer — artifact inspector [READY]
- **AC:**
  - Clicking a chapter row opens a drawer (or routes to `/books/[slug]/chapter/[id]`).
  - Tabs: Outline | Draft | Critic notes | Call log.
  - Call log tab reads `LLMCallLog` for that chapter's most recent run: timestamp, agent, model, tokens, cost, status.
  - Draft tab shows the current artifact content in a read-only Markdown view.
  - Critic notes tab shows the last `GateDecision` reasons if present; empty state otherwise.
- **Effort:** M
- **Depends on:** E3.S2, E1.S2, E1.S3
- **Touches:** new drawer/page component, call-log repository query

---

## Epic E4 — Artifact Mirror [R3]

**Goal:** Every artifact in the DB has a Markdown+YAML twin on disk that Chris can `git diff` and `grep`.

**Why:** PRD success criterion #5. Also makes retrospectives (R5) dramatically cheaper — we can diff two runs in a text editor.

### Stories

#### E4.S1: Mirror writer — DB → filesystem on artifact save [READY]
- **AC:**
  - On every `ResearchArtifact` / outline / chapter-draft save, a corresponding file is written under `artifacts/[bookSlug]/[stage]/[chapter-id].md`.
  - File has YAML frontmatter: `id`, `bookSlug`, `stage`, `chapterId`, `createdAt`, `runId`, `costUsd`, `model`.
  - Body is the artifact's primary text content in Markdown.
  - Write failures do not crash the workflow — logged as warning, workflow continues.
  - `.gitignore` updated so `artifacts/` can optionally be tracked or ignored (Chris's choice per book).
- **Effort:** M
- **Depends on:** E1.S1
- **Touches:** `src/lib/repositories/research-artifacts.ts`, new `src/lib/mirror/writer.ts`, repository save hooks, `.gitignore`

#### E4.S2: Delete stale `.md.template` files [READY]
- **AC:**
  - Winston flagged this as needed planned breakage. Identify all `.md.template` files in repo.
  - Remove them in a single commit with message explaining what replaced each one (the new mirror or the personas-as-code pattern).
  - CI/build green after removal — no reference left dangling.
- **Effort:** XS
- **Depends on:** E4.S1 (replacement must exist before removal)
- **Touches:** repo-wide, identified via audit

#### E4.S3: Mirror reader + drift check [DRAFT]
- **AC:**
  - TBD: do we need a round-trip reader (filesystem → DB) for v1, or is write-only enough?
  - **Question for Winston:** Is the mirror read-only from Chris's perspective in v1, or does he edit the file and expect re-sync?
  - Defer until answered.
- **Effort:** TBD
- **Depends on:** E4.S1
- **Touches:** TBD

---

## Epic E5 — Typesetting Stage [R3]

**Goal:** Stage 11 takes a shipped draft and produces a final-form rendered output (editorial pass + typeset).

**Why:** PRD success criterion #3.

### Stories

#### E5.S1: Typesetting renderer — Markdown → book-form HTML/PDF [READY]
- **AC:**
  - New agent `src/lib/agents/typesetter.ts` implementing `Agent<TypesetInput, TypesetOutput>`.
  - Input: ordered chapters (from spine). Output: a rendered artifact (HTML first; PDF via existing tooling if present, otherwise deferred to E5.S3).
  - Handles chapter title hierarchy, epigraphs, section breaks, and block quotes per a defined stylesheet.
  - Unit test: given 3 sample chapters, output has correct heading structure and a single combined artifact.
- **Effort:** M
- **Depends on:** E2.S1 (Agent pattern), E3.S1 (spine as input source)
- **Touches:** `src/lib/agents/typesetter.ts` (new), new stylesheet file

#### E5.S2: Editorial pass agent [READY]
- **AC:**
  - New agent `src/lib/agents/editor.ts` — pre-typeset pass that catches repetition, transition breaks, and section-length outliers across chapters.
  - Returns a `GateDecision<EditedManuscript>` so E2's critic pattern is reused.
  - Runs over the whole book at once, not per-chapter (that's the point — inter-chapter coherence).
  - Test: seeded manuscript with a repeated paragraph returns `retry` with that paragraph cited.
- **Effort:** M
- **Depends on:** E1.S3, E2.S1
- **Touches:** `src/lib/agents/editor.ts` (new)

#### E5.S3: PDF export [DRAFT]
- **AC:**
  - **Question for Winston:** What's the current PDF tooling, if any? Puppeteer? Pandoc? Does v1 require PDF, or is HTML+print-CSS sufficient?
  - Defer scope until answered.
- **Effort:** TBD
- **Depends on:** E5.S1
- **Touches:** TBD

---

## Epic E6 — Canonical Book Run [R4]

**Goal:** Chris runs one of his own books through the full pipeline, end to end, and the output is production-grade.

**Why:** PRD success criterion #1. This is the whole point. Everything else is scaffolding for this.

### Stories

#### E6.S1: Select and prep canonical book [READY]
- **AC:**
  - Chris picks one of his books (the "canonical" book). Knowledge base loaded, persona selected (Chris's own voice — not Drucker, not Elon).
  - Market viability gate passed (per framework memo, score ≥ 3.5/5).
  - Outline generated and approved by Chris.
- **Effort:** S (mostly Chris's time, not dev time)
- **Depends on:** E2 complete, E3.S1 (spine view optional but helpful)
- **Touches:** book selection; content upload

#### E6.S2: Full-book run with cost verification [READY]
- **AC:**
  - Run all chapters through Stage 10 (production draft + voice critic).
  - Run through Stage 11 (editor + typesetter).
  - Sum `LLMCallLog.costUsd` for the run ≤ $40 (PRD ceiling).
  - If over ceiling: produce a breakdown by stage/agent and flag as a regression before any shipping.
  - All chapters pass voice-critic without manual override (or: manual overrides are explicitly logged with reason).
- **Effort:** L
- **Depends on:** E6.S1, E2 complete, E5.S1, E5.S2
- **Touches:** production pipeline end-to-end

#### E6.S3: Human quality sign-off [READY]
- **AC:**
  - Chris reads the output cover-to-cover.
  - Red-line pass: issues logged as GitHub issues or notes in repo, not handled ad hoc.
  - Sign-off documented: "This is shippable" or "These N issues block ship."
  - If issues block ship: they become new stories, triaged against the v1 scope. Out-of-scope issues become v1.1.
- **Effort:** M (Chris's reading time + triage)
- **Depends on:** E6.S2
- **Touches:** issue tracker, this document (may spawn stories)

---

## Epic E7 — Stabilize + Document [R5]

**Goal:** The system is safe to leave alone for a week and still works. A new collaborator (or future-Chris) can operate it from docs.

### Stories

#### E7.S1: Vitest suite covers all critical paths [READY]
- **AC:**
  - Unit tests for every `Agent<I,O>` implementation (happy path + one failure path each).
  - Integration test: full workflow run on a fixture book (2 chapters, mocked LLMs).
  - Contract test from E1.S4 runs in CI.
  - `npm test` passes on clean clone.
  - Coverage report generated (threshold not enforced — just visible).
- **Effort:** L
- **Depends on:** E2 complete, E5 complete
- **Touches:** `__tests__/` across the tree, CI config

#### E7.S2: Operator doc — "How to ship a book" [READY]
- **AC:**
  - New doc `docs/operating.md` covering: upload knowledge base → viability gate → outline → draft → edit → typeset → ship.
  - Each step names the screen or CLI command.
  - Troubleshooting section: what to do when a stage fails (check `LLMCallLog`, rerun, escalate).
  - A reader who was not in this session can follow it.
- **Effort:** M
- **Depends on:** E3 and E6 complete
- **Touches:** `docs/operating.md` (new)

#### E7.S3: Retrospective [READY]
- **AC:**
  - One-page doc: what worked, what didn't, what surprised us, what we'd cut from v1 in hindsight.
  - Specifically measures PRD v1's 6 success criteria — did each land?
  - Feeds v1.1 planning.
- **Effort:** S
- **Depends on:** E6.S3 (can't retro until the book is shipped)
- **Touches:** `docs/v1-retro.md` (new)

---

## Critical Path (shortest route to v1 done)

Only the load-bearing stories. If any of these slip, v1 slips.

1. **E1.S1** baseline migration — unblocks everything with DB touch
2. **E1.S2** LLMCallLog — required for cost verification, artifact mirror, spine view, critic logging
3. **E2.S1** chapter-draft as Agent<I,O> — establishes the pattern the other two workflows follow
4. **E2.S4** framework-flow routing — the PRD explicitly names Drucker + Elon quality
5. **E2.S5** voice critic — no Stage 10 quality claim without it
6. **E2.S6** regenerate flow — critic is useless without a retry loop
7. **E5.S1** typesetter — Stage 11 requirement
8. **E5.S2** editor agent — Stage 11 requirement
9. **E6.S1** canonical book prep
10. **E6.S2** full-book run with cost verification — the actual ship
11. **E6.S3** Chris's sign-off — the actual actual ship

Everything else is support or insurance.

## Parallel Tracks

These can run simultaneously without blocking each other. Good for a second pair of hands, or interleaved work when one track is waiting on a review.

- **Track A (foundation):** E1.S1 → E1.S2 → E2.S1 → E2.S4 → E2.S5 → E2.S6
- **Track B (types + tests, after S1):** E1.S3 → E1.S4 → E7.S1 (started early, grown)
- **Track C (refactors, after E2.S1 pattern lands):** E2.S2 and E2.S3 can go in parallel to each other
- **Track D (UI, after E1.S2 lands):** E3.S1 → E3.S2 → E3.S3
- **Track E (mirror, after E1.S1):** E4.S1 → E4.S2
- **Track F (ship prep):** E6.S1 (Chris-side content work) can start the moment E2 is demonstrably working on any sample chapter

## First Sprint (next 5 shovel-ready stories)

These 5 should start this week. Chris (or whoever pairs with him) can pick any of them without asking me a clarifying question.

1. **E1.S1 — Baseline Prisma migration.** Defense: the schema is drifted, we know it, and every single other story with a DB touch is blocked until this is clean. Starting anywhere else risks building on sand. Size M, one sitting.

2. **E1.S2 — LLMCallLog schema + instrumentation.** Defense: we cannot prove the $40 ceiling without this, and cost proof is non-negotiable. It's also the join point for E3's call-log tab and E4's cost metadata. Start immediately after S1 merges. Size M.

3. **E1.S3 — Typed GateDecision<A>.** Defense: independent of S1/S2, can go in parallel. Small, contained, and it's the type every gate/critic downstream will return. Getting it right once saves refactors in E2.S5, E2.S6, E5.S2. Size S.

4. **E1.S4 — Router contract test.** Defense: we're about to add a voice critic whose correctness depends on cross-family routing (claude vs openai vs gemini). A contract test now means when someone swaps a model in a hurry, we catch the family violation in CI, not in production output. Small, defensive, done in hours. Size S.

5. **E2.S1 — Chapter-draft as Agent<I,O>.** Defense: this is the template for E2.S2 and E2.S3. Getting it right once means the other two refactors are mechanical. It also forces the `ctx.llm` choke point that E1.S2's instrumentation rides on — so it proves the plumbing. Size M.

Five stories. Two M, two S, one M. Realistic for one sprint with one dev. Any of them can be picked up without a meeting.

---

## Flagged questions (not scope — open items)

- **For Winston (E4.S3):** Is the Markdown+YAML mirror read-only in v1, or bidirectional? If bidirectional, how are conflicts resolved?
- **For Winston (E5.S3):** What's the current PDF tooling, if any? Is HTML+print-CSS acceptable for v1, or is PDF required for ship?
- **For Sally (E2.S5):** Voice-critic retry message — who owns the prompt wording that goes back to the author agent when a retry fires? I've specced the mechanism but not the voice of the feedback.

## Cuts (what I removed from v1)

Tempting but out of scope. Flagging so they're not forgotten.

- ~~Multi-user auth / collaboration~~ — Chris is the only user. Defer to v2.
- ~~Cost dashboard UI~~ — E1.S2 gives us the data; a dashboard is v1.1. `LLMCallLog` query + a spreadsheet is enough for v1.
- ~~Automatic model fallback on provider outage~~ — manual retry is fine for v1. One user, one operator.
- ~~Style transfer across personas~~ — locked to per-book persona for v1. The framework routing (E2.S4) is enough.
- ~~Book versioning / draft branches~~ — git + the artifact mirror (E4.S1) covers this for one user.
