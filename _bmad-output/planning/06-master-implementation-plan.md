# GHOSTWRITR — Master Implementation Plan

**Status:** Plan of record  
**Date:** 2026-05-18  
**Supersedes:** `05-epics-and-stories.md` where in conflict  
**Scope:** Full vision — non-fiction + fiction, both pipelines, agent staff, orchestrator, control tower

---

## Structure

Seven phases. Each phase has one or more Epics. Each Epic contains Stories.  
Effort: **XS** < half day · **S** < 1 day · **M** 1–2 days · **L** 3+ days  
Status: **[DONE]** · **[READY]** (AC + deps + files identified) · **[DRAFT]** (needs more definition)

---

## Dependency Map

```
Phase 0 (Observable Foundation)
    └── Phase 1 (Agent Staff)
            ├── Phase 2 (Author Voice Profile)
            │       └─┐
            └── Phase 3 (Orchestrator)
                    └── Phase 4 (Control Tower)
                            └── Phase 5a (Non-fiction Production Quality) ──┐
            └── Phase 5b (Fiction Agent Staff) ─────────────────────────────┤
                                                                              └── Phase 6 (Canonical Runs)
                                                                                      └── Phase 7 (Stabilize)
```

Phases 2 and 3 run in parallel after Phase 1.  
Phases 5a and 5b run in parallel after Phase 1.

---

## Phase 0 — Observable Foundation

**Goal:** Every LLM call is logged and queryable. Gate types are typed. Schema is clean.  
**Gate to Phase 1:** `SELECT SUM(costUsd) FROM LLMCallLog WHERE bookSlug = '...'` returns a real number.

### Epic O — Observable Pipeline

#### O.S1: Baseline Prisma migration [DONE]
- **Status:** Complete (commit `41c8385`)

#### O.S2: LLMCallLog schema + write path [READY]
- **AC:**
  - New Prisma model `LLMCallLog`: `id`, `createdAt`, `workflowRunId`, `stage`, `agentName`, `provider`, `model`, `inputTokens`, `outputTokens`, `costUsd`, `latencyMs`, `status` (`success`/`error`/`timeout`), `errorMessage?`, `promptHash`
  - Every call through `src/lib/llm/routing.ts` writes one row per invocation
  - Failed calls write a row with `status=error` — no silent failures
  - Query helper `getCallLogsForRun(runId)` returns logs in chronological order
  - Integration test: invoking any agent results in at least one `LLMCallLog` row committed
- **Effort:** M
- **Depends on:** O.S1
- **Touches:** `prisma/schema.prisma`, `src/lib/llm/routing.ts`, new `src/lib/repositories/llm-call-log.ts`

#### O.S3: Typed GateDecision<A> discriminated union [DONE]
- **Status:** Complete (commit `f9081ae`)

#### O.S4: Router contract test [READY]
- **AC:**
  - New `src/lib/llm/__tests__/routing.contract.test.ts`
  - For each configured stage/agent pair: asserts expected provider, model, family
  - Explicitly asserts voice critic family ≠ author (Quill) family
  - Test fails loudly if a routing entry is added without a corresponding test entry
  - Runs in CI via `npm test`
- **Effort:** S
- **Depends on:** O.S3
- **Touches:** `src/lib/llm/routing.ts`, new `__tests__/routing.contract.test.ts`

---

## Phase 1 — Agent Staff as First-Class Code

**Goal:** All 11 named agents (Blueprint through Press) exist as typed `Agent<I,O>` implementations matching the manifest. Workflows no longer call providers directly.  
**Gate to Phase 1 complete:** `npm run agents:list` prints all 11 agents with name, stage, and model assignment. Every agent logs its name in `LLMCallLog`.

### Epic A — Agent Interface + Non-fiction Staff

#### A.S1: Agent<I,O> interface + AgentContext [READY]
- **AC:**
  - Interface in `src/lib/agents/types.ts`:
    ```ts
    interface Agent<I, O> {
      id: string;
      name: string;
      role: string;
      stage: StageKey;
      run(input: I, ctx: AgentContext): Promise<AgentResult<O>>;
    }
    interface AgentContext {
      llm: LLMHandle;       // resolves from routing; no direct provider imports in agent files
      logger: AgentLogger;  // structured, writes to LLMCallLog
      book: BookContext;    // slug, workflowType, authorVoiceProfile?
      db: PrismaClient;
    }
    type AgentResult<O> = { output: O; gateDecision: GateDecision<O>; costUsd: number; tokenCount: number; }
    ```
  - TypeScript strict mode: no `any` in the interface file
  - `src/lib/agents/index.ts` exports the registry of all agents
  - No agent file may import `@langchain/anthropic`, `openai`, or `google-genai` directly — only `ctx.llm`
- **Effort:** S
- **Depends on:** O.S3
- **Touches:** new `src/lib/agents/types.ts`, new `src/lib/agents/index.ts`

#### A.S2: Blueprint agent [READY]
- **AC:**
  - `src/lib/agents/blueprint/index.ts` implements `Agent<BlueprintInput, BookSetupArtifact>`
  - `src/lib/agents/blueprint/persona.md` — verbatim copy of Blueprint section from `agents-personas.md`
  - `src/lib/agents/blueprint/types.ts` — `BlueprintInput` includes `workflowType: BookWorkflowType` (different intake prompts per mode)
  - UI renders Blueprint as **"Marin"** during the voice-capture screen (presentation alias only — agent id, logs, and DB records unchanged)
  - Existing `BOOK_SETUP` stage actions call Blueprint; no behavior change on existing books
  - Snapshot test: Blueprint system prompt for NONFICTION shape is stable
- **Effort:** M
- **Depends on:** A.S1
- **Touches:** new `src/lib/agents/blueprint/`, `src/app/books/[slug]/setup/actions.ts`

#### A.S3: Mary agent [READY]
- **AC:**
  - `src/lib/agents/mary/index.ts` implements `Agent<MaryInput, MarketViabilityArtifact>`
  - Consolidates `PROMISE` / `AUDIENCE` / `MARKET_ANALYSIS` workflow logic into one agent
  - Returns `GateDecision<MarketViabilityArtifact>` — hard gate at 3.5/5:
    - Below 3.5 → `gateFail` with dimension breakdown
    - 3.5–4.0 → `gateRetry` with three actionable recommendations
    - Above 4.0 → `gatePass`
  - Fiction mode: scoring dimensions adapt (genre market size, comp-title velocity, reader expectations) when `book.workflowType === FICTION`
  - Existing promise/audience/market-analysis stage actions call Mary; all existing tests pass
- **Effort:** M
- **Depends on:** A.S1
- **Touches:** new `src/lib/agents/mary/`, `src/app/books/[slug]/promise/actions.ts`, `src/app/books/[slug]/audience/actions.ts`, `src/app/books/[slug]/market-analysis/actions.ts`

#### A.S4: Atlas agent [READY]
- **AC:**
  - `src/lib/agents/atlas/index.ts` implements `Agent<AtlasInput, OutlineArtifact>`
  - KB-first: input includes full knowledge base corpus, not just premise
  - Produces chapter arc with per-chapter one-liners and ≥2 KB source citations per chapter
  - Returns `gateRetry` if any chapter cites fewer than 2 KB sources (lists specific gaps)
  - Refactors `src/lib/workflows/outline.ts` to use Agent pattern
  - Existing outline page rendering unchanged
- **Effort:** M
- **Depends on:** A.S1
- **Touches:** new `src/lib/agents/atlas/`, `src/lib/workflows/outline.ts`, `src/app/books/[slug]/outline/actions.ts`

#### A.S5: Skeleton agent [READY]
- **AC:**
  - `src/lib/agents/skeleton/index.ts` implements `Agent<SkeletonInput, ParagraphPlanArtifact>`
  - Input: Atlas output (one chapter's outline node)
  - Produces ordered paragraph topic sentences (minimum 8 per chapter)
  - Vagueness detection: topic sentences containing "various", "many", "things", "stuff" trigger `gateRetry` with specific rewrites
  - Runs per-chapter (invoked N times by orchestrator)
  - Refactors `src/lib/workflows/outline-paragraphs.ts`
- **Effort:** M
- **Depends on:** A.S1, A.S4
- **Touches:** new `src/lib/agents/skeleton/`, `src/lib/workflows/outline-paragraphs.ts`

#### A.S6: Thread agent [READY]
- **AC:**
  - `src/lib/agents/thread/index.ts` implements `Agent<ThreadInput, BaseStoryArtifact>`
  - Input: Skeleton output (paragraph plan) for one chapter
  - Produces first full prose pass; seam check runs automatically (last sentence of each paragraph checked against first sentence of next; rough seams flagged as soft warnings, not gate failures)
  - Gate: `auto` — no user review required
  - Refactors `src/lib/workflows/base-story.ts`
- **Effort:** M
- **Depends on:** A.S1, A.S5
- **Touches:** new `src/lib/agents/thread/`, `src/lib/workflows/base-story.ts`

#### A.S7: Scout agent [READY]
- **AC:**
  - `src/lib/agents/scout/index.ts` implements `Agent<ScoutInput, ResearchPackArtifact>`
  - Three sub-agents through `ctx.llm`: GPT researcher → GPT extractor → Haiku verifier
  - Every surviving fact carries a URL; unverified claims excluded, not softened
  - Returns `gateRetry` if verification pass rate < 80% (too many unverifiable claims)
  - Refactors `src/lib/workflows/research.ts`; existing research page unchanged
- **Effort:** M
- **Depends on:** A.S1
- **Touches:** new `src/lib/agents/scout/`, `src/lib/workflows/research.ts`, `src/app/books/[slug]/research/actions.ts`

#### A.S8: Chronicle agent [READY]
- **AC:**
  - `src/lib/agents/chronicle/index.ts` implements `Agent<ChronicleInput, ExternalStoriesArtifact>`
  - Sources illustrative stories and one counter-example per chapter beat
  - Relevance score per story; below threshold excluded with reason logged
  - Refactors `src/lib/workflows/external-stories.ts`; existing page unchanged
- **Effort:** M
- **Depends on:** A.S1, A.S7
- **Touches:** new `src/lib/agents/chronicle/`, `src/lib/workflows/external-stories.ts`

#### A.S9: Scribe agent [READY]
- **AC:**
  - `src/lib/agents/scribe/index.ts` implements `Agent<ScribeInput, PersonalStoriesArtifact>`
  - UI renders Scribe as **"Tova"** during the Campfire interview (presentation alias only)
  - "One more layer" follow-up probe fires automatically when initial answer < 200 words
  - Gate: `user-committed` — personal stories require explicit author commit before advancing
  - Refactors `src/lib/workflows/personal-stories.ts`; existing page unchanged
- **Effort:** M
- **Depends on:** A.S1, A.S5
- **Touches:** new `src/lib/agents/scribe/`, `src/lib/workflows/personal-stories.ts`, `src/app/books/[slug]/personal-stories/actions.ts`

#### A.S10: Quill agent [READY]
- **AC:**
  - `src/lib/agents/quill/index.ts` implements `Agent<QuillInput, ChapterDraftArtifact>`
  - Input: Thread + Scout + Chronicle + Scribe + Skeleton + `authorVoiceProfile?` + `frameworkFlow`
  - All LLM calls through `ctx.llm` — no direct provider imports
  - `workflowType` flag in input: FICTION mode swaps paragraph plan for scene plan (A.S10 lays the interface; fiction mode wired in F.S6)
  - Existing chapter-draft behavior preserved for identical input (snapshot test)
  - Refactors `src/lib/workflows/chapter-draft.ts`
- **Effort:** M
- **Depends on:** A.S1, A.S6, A.S7, A.S8, A.S9
- **Touches:** new `src/lib/agents/quill/`, `src/lib/workflows/chapter-draft.ts`, `src/app/books/[slug]/chapter-draft/actions.ts`

#### A.S11: Reed agent [READY]
- **AC:**
  - `src/lib/agents/reed/index.ts` implements `Agent<ReedInput, EditorialArtifact>`
  - Margin-note questions surfaced as explicit flags (not silent rewrites)
  - Returns `GateDecision` with unresolved flags list; flags go to FYI stream (not blocking gate)
  - Gate: `user-committed` on final manuscript approval
  - Refactors `src/lib/workflows/editing.ts`; existing editing page unchanged
- **Effort:** M
- **Depends on:** A.S1, A.S10
- **Touches:** new `src/lib/agents/reed/`, `src/lib/workflows/editing.ts`, `src/app/books/[slug]/editing/actions.ts`

#### A.S12: Press agent [READY]
- **AC:**
  - `src/lib/agents/press/index.ts` implements `Agent<PressInput, ManuscriptBuildArtifact>`
  - No LLM — mechanical assembly stage
  - Input: all committed Reed-edited chapters in order
  - Produces PDF (puppeteer) + EPUB + DOCX
  - Front matter: title page, copyright, table of contents
  - Build verification before download: chapter count matches expected, EPUB validates
  - Works for both NONFICTION and FICTION modes
  - Gate: `user-committed`
- **Effort:** L
- **Depends on:** A.S1, A.S11
- **Touches:** new `src/lib/agents/press/`, `src/app/books/[slug]/publish/actions.ts`

#### A.S13: Agent registry + stage routing [READY]
- **AC:**
  - New `src/lib/agents/registry.ts` maps each `StageKey` to its owning agent id
  - `npm run agents:list` script prints all registered agents with stage, name, model assignment
  - Each agent's `persona.md` is the verbatim excerpt from `_bmad-output/agents-personas.md`
  - `_bmad-output/agents-personas.md` is declared the single source of truth for all agent personas; registry points to it
- **Effort:** S
- **Depends on:** A.S1 through A.S12
- **Touches:** new `src/lib/agents/registry.ts`, `package.json` (scripts)

---

## Phase 2 — Author Voice Profile

**Goal:** Blueprint captures a persistent `AuthorVoiceProfile` that Quill and Reed use on every chapter. The book sounds like the author filtered through the structural framework — not just the framework alone.  
**Gate to Phase 2 complete:** A chapter produced by Quill with a voice profile reads demonstrably differently from one without. Chris signs off on the delta.

### Epic V — Author Voice Profile

#### V.S1: AuthorVoiceProfile schema + repository [READY]
- **AC:**
  - New Prisma model `AuthorVoiceProfile`:
    - `id`, `createdAt`, `authorProfileId` (FK), `bookSlug?` (nullable — profile can be book-specific or author-level)
    - `sentenceLengthPattern` (Json), `exampleDensity` (String), `rhetoricalMoveSequence` (Json)
    - `vocabularyRegister` (String), `signatureConstructions` (Json), `avoidPatterns` (Json)
    - `captureMethod` enum: `INTERVIEW` / `SAMPLE` / `BOTH`
  - New repository `src/lib/repositories/author-voice-profile.ts` with `create`, `getByBook`, `getByAuthor`, `update`
  - New Prisma migration
- **Effort:** S
- **Depends on:** O.S1
- **Touches:** `prisma/schema.prisma`, new `src/lib/repositories/author-voice-profile.ts`

#### V.S2: Blueprint voice intake — interview mode [READY]
- **AC:**
  - Blueprint has an `interviewMode` sub-flow: structured conversation that extracts voice fingerprint
  - Minimum 5 questions before profile can be generated; questions target: sentence rhythm, example density, argument construction, vocabulary register, what sounds wrong coming from the author
  - UI renders Blueprint as "Marin" during this flow
  - Profile written to `AuthorVoiceProfile` with `captureMethod=INTERVIEW`
  - `AuthorVoiceProfile` artifact linked to book in spine view (Stage 01 artifact count increments)
- **Effort:** M
- **Depends on:** V.S1, A.S2
- **Touches:** `src/lib/agents/blueprint/`, `src/app/books/[slug]/setup/`, new interview UI component

#### V.S3: Blueprint voice intake — sample upload + analysis [READY]
- **AC:**
  - Stage 01 UI accepts file uploads (MD, PDF, DOCX, TXT) as writing samples
  - Blueprint analyzes samples and extracts the same profile fields as interview mode
  - Minimum 1 sample required; UI communicates that 3+ improves quality
  - If both interview and samples provided: profile merged, `captureMethod=BOTH`
  - Reuses existing `SourceDocument` upload infrastructure where possible
  - Profile written with `captureMethod=SAMPLE`
- **Effort:** M
- **Depends on:** V.S2
- **Touches:** `src/lib/agents/blueprint/`, `src/app/books/[slug]/setup/`, `src/lib/services/document-extractor.ts`

#### V.S4: Wire AuthorVoiceProfile into Quill [READY]
- **AC:**
  - `QuillInput` type includes `authorVoiceProfile: AuthorVoiceProfile | null`
  - When present: voice profile injected into Quill's system prompt alongside `frameworkFlow`
  - System prompt structure: `Author voice fingerprint: [...fields] // Structural framework: [...frameworkFlow slots]`
  - When null: Quill runs without voice shaping (backward compatible with existing books)
  - Snapshot test: system prompt with voice profile differs meaningfully from without
- **Effort:** S
- **Depends on:** V.S1, A.S10
- **Touches:** `src/lib/agents/quill/types.ts`, `src/lib/agents/quill/index.ts`

#### V.S5: Wire AuthorVoiceProfile into Reed [READY]
- **AC:**
  - `ReedInput` includes `authorVoiceProfile: AuthorVoiceProfile | null`
  - When present: Reed will not silently rewrite constructions listed in `signatureConstructions`
  - Margin-note questions respect `avoidPatterns`: won't flag a stylistic choice the author has marked as intentional
- **Effort:** S
- **Depends on:** V.S1, A.S11
- **Touches:** `src/lib/agents/reed/types.ts`, `src/lib/agents/reed/index.ts`

---

## Phase 3 — Orchestrator + Autopilot

**Goal:** A Managing Editor agent runs the pipeline end-to-end, pausing only at `user-committed` gates. "Run book" is a single action.  
**Gate to Phase 3 complete:** Chris triggers "Run" on a book and the pipeline advances through three stages without further action, pausing correctly at the first `user-committed` gate.

### Epic M — Managing Editor

#### M.S1: ManagingEditor run plan generator [READY]
- **AC:**
  - New `src/lib/agents/managing-editor/index.ts`
  - Given a book's current state + `workflowType`, produces a `RunPlan`: ordered `AgentJob[]`, each with `{ agentId, inputs, dependencies, estimatedCostUsd, estimatedDurationMs, gateType }`
  - `RunPlan` written to new `ManagingEditorRun` DB table
  - Handles both NONFICTION and FICTION pipeline shapes
  - Per-chapter jobs generated: Scout / Thread / Canvas / etc. generate N jobs (one per chapter)
  - Parallelizable jobs identified: Scout + Chronicle can run concurrently; Scribe runs in parallel with both
- **Effort:** M
- **Depends on:** A.S13
- **Touches:** new `src/lib/agents/managing-editor/`, new `prisma/schema.prisma` (ManagingEditorRun table), new migration

#### M.S2: Autopilot pipeline runner [READY]
- **AC:**
  - New `src/lib/workflow-automation/autopilot.ts`
  - Reads `RunPlan`, fires jobs whose dependencies are complete
  - Max concurrent jobs: configurable constant, default 3
  - Each fired job creates a `WorkflowRun` row and invokes the corresponding agent via registry
  - Job completion updates `RunPlan` status and triggers next eligible jobs
  - Runner is idempotent: safe to call multiple times on the same `RunPlan`
- **Effort:** M
- **Depends on:** M.S1
- **Touches:** new `src/lib/workflow-automation/autopilot.ts`, `src/lib/agents/registry.ts`

#### M.S3: Hard gate pause/resume [READY]
- **AC:**
  - When autopilot reaches a `user-committed` gate: job marked `AWAITING_DECISION`, `ManagingEditorRun.state = PAUSED_AT_GATE`
  - All parallelizable work that doesn't depend on the gate continues running while paused
  - New `GateDecisionRecord` DB row created with `status=PENDING`, linked to gate + artifact
  - Resume endpoint: `POST /api/books/[slug]/gates/[gateId]/decision { action: "approve" | "revise" | "kill", notes?: string }`
  - On `approve`: downstream jobs unlock, autopilot continues
  - On `revise`: upstream agent re-runs with revision notes injected into input
  - On `kill`: `ManagingEditorRun` terminated, book stage marked `BLOCKED`
- **Effort:** M
- **Depends on:** M.S2, O.S3
- **Touches:** `src/lib/workflow-automation/autopilot.ts`, new `src/app/api/books/[slug]/gates/[gateId]/decision/route.ts`, `prisma/schema.prisma`

#### M.S4: FYI checkpoint stream [READY]
- **AC:**
  - `user-review` gate completions post to FYI stream (do not block autopilot)
  - New `FYIEvent` table: `id`, `bookSlug`, `agentId`, `summary`, `artifactId`, `createdAt`, `readAt?`
  - Events produced by: Scout (research summary), Chronicle (story selections), Thread (base draft complete), Reed (margin notes list)
  - SSE endpoint: `GET /api/books/[slug]/fyi-stream`
  - Events marked read when user views them; never block the pipeline
- **Effort:** S
- **Depends on:** M.S2
- **Touches:** `prisma/schema.prisma`, new `src/app/api/books/[slug]/fyi-stream/route.ts`, agent implementations (add FYI posting)

#### M.S5: Failure escalation to decisions queue [READY]
- **AC:**
  - When an agent returns `gateFail` (non-recoverable): escalated to decisions queue as a `DecisionCard`
  - When retry limit exhausted (default max 2): also escalated as failure
  - `DecisionCard` includes: agent name + icon, failure reasons (max 5), "Restart with notes" action, "Skip stage (logged)" action
  - Escalated failures surface in control tower with magenta triangle badge
  - Skip-stage override logs to override ledger with required rationale
- **Effort:** S
- **Depends on:** M.S3
- **Touches:** `src/lib/workflow-automation/autopilot.ts`, `prisma/schema.prisma` (DecisionCard or extend GateDecisionRecord)

#### M.S6: "Run book" UI trigger [READY]
- **AC:**
  - "Run" button on book spine header
  - On first click: modal asks "Run to next gate?" or "Run to completion?" — stores preference per book
  - Subsequent clicks use stored preference with one-click confirm
  - While running: button becomes "Pause autopilot" (requires confirmation)
  - Pause: current agent jobs finish, no new jobs fired until resumed
  - Running state visible in spine header: animated pulse on active agent name
- **Effort:** M
- **Depends on:** M.S2, M.S3
- **Touches:** `src/app/books/[slug]/spine-row.tsx`, `src/app/books/[slug]/page.tsx`, new `src/app/api/books/[slug]/run/route.ts`

---

## Phase 4 — Control Tower Dashboard

**Goal:** The home screen for a book in flight is an operations center — not a navigation surface. At a glance: what's running, what needs a decision, what it cost.  
**Gate to Phase 4 complete:** Chris opens the app and knows all three without navigating to any stage page.

### Epic C — Control Tower

#### C.S1: Active run panel [READY]
- **AC:**
  - New `ActiveRunPanel` component on book home (`/books/[slug]`)
  - One row per running/queued job: agent icon, agent name, status (running/queued/complete/failed), elapsed time, estimated cost
  - Refreshes via SSE or 5s polling from `/api/books/[slug]/run-status`
  - Completed rows stay visible 60s then fade to history
  - Empty state: "No agents running" — calm, neutral styling
- **Effort:** M
- **Depends on:** M.S2, A.S13
- **Touches:** new component, `src/app/books/[slug]/page.tsx`, new `/api/books/[slug]/run-status/route.ts`

#### C.S2: Decisions queue panel [READY]
- **AC:**
  - New `DecisionQueuePanel` component
  - One card per pending `user-committed` gate or escalated failure
  - Card shows: agent icon + name, verdict type (gate/failure), key reasons (max 3 bullets), primary action, secondary action
  - Empty state is intentionally prominent and positive: **"Nothing needs your attention"** — this is the goal state
  - Cards sorted: failures first (magenta triangle), then gates (blue circle)
  - Actions call the gate decision endpoint from M.S3
- **Effort:** M
- **Depends on:** M.S3, M.S5
- **Touches:** new component, `src/app/books/[slug]/page.tsx`

#### C.S3: FYI stream panel [READY]
- **AC:**
  - New `FYIStreamPanel` component (collapsible, collapsed by default)
  - Shows `FYIEvent` rows in reverse chronological order
  - Unread: full opacity + count badge on panel header
  - Read: dimmed after viewing
  - Clicking an event expands to full artifact summary with agent name + timestamp
  - Does not block any workflow action
- **Effort:** S
- **Depends on:** M.S4
- **Touches:** new component, `src/app/books/[slug]/page.tsx`

#### C.S4: Enriched book state panel [READY]
- **AC:**
  - Existing spine view enriched per chapter: draft status badge, voice-critic verdict (pass/soft-fail/hard-fail), cost to date, last agent action
  - Chapter voice-critic verdict badges: green check (pass), amber half-circle (soft-fail), magenta triangle (hard-fail)
  - Clicking a chapter row opens read-only artifact view with agent name, model, cost, timestamp
  - Chapter rows update in real-time as autopilot runs (via SSE)
  - Non-fiction and fiction spine groups render correct stage labels per `workflowType`
- **Effort:** M
- **Depends on:** M.S2, C.S1
- **Touches:** `src/app/books/[slug]/spine-row.tsx`, `src/app/books/[slug]/page.tsx`, `src/lib/repositories/book-spine.ts`

#### C.S5: Cost & pace bar [READY]
- **AC:**
  - `CostPaceBar` component in book page header, always visible
  - Shows: `$X.XX / $40 ceiling` with filled progress bar
  - Color: neutral → amber at $30 (75%) → magenta at $38 (95%)
  - Also shows: "N of M chapters drafted" (per-book chapter count from RunPlan)
  - Clicking opens observability timeline: `LLMCallLog` rows grouped by agent/stage, sortable by cost
  - $40 ceiling is a configurable constant (`BOOK_COST_CEILING_USD`) — not hardcoded in UI copy
- **Effort:** S
- **Depends on:** O.S2, M.S1
- **Touches:** new `CostPaceBar` component, `src/app/books/[slug]/page.tsx`, new `/api/books/[slug]/cost-summary/route.ts`

#### C.S6: Override ledger [READY]
- **AC:**
  - Override ledger page at `/books/[slug]/overrides`
  - Rows: timestamp, agent name, verdict overridden, rationale text, artifact link
  - Override dots in spine view: small magenta dot on chapter rows that have any override
  - Accessible from control tower header (icon link)
  - All gate overrides (approve below threshold, skip stage) and voice-guard overrides (accept-as-is) appear here
- **Effort:** S
- **Depends on:** M.S5, C.S4
- **Touches:** new `/books/[slug]/overrides/page.tsx`, `src/app/books/[slug]/spine-row.tsx`

---

## Phase 5a — Non-fiction Production Quality

**Goal:** Quill drafts production-grade chapters. Reed edits to manuscript standard. Press delivers PDF and EPUB. Voice Critic runs as a proper cross-family gate.  
**Gate to Phase 5a complete:** One chapter — drafted, voice-critic reviewed, Reed-edited — reads as production quality that Chris would sign his name to.

### Epic N — Non-fiction Production Quality

#### N.S1: Quill production quality — full context assembly [READY]
- **AC:**
  - Quill receives complete assembled context: Thread + Scout + Chronicle + Scribe + Skeleton + `authorVoiceProfile` + `frameworkFlow`
  - Framework-flow routing: generation runs per `frameworkFlow` slot (each slot is a separate LLM call with slot prompt injected), not as one monolithic prompt
  - Final output: slot outputs assembled into coherent chapter prose with smooth transitions between slots
  - Integration test: chapter drafted with DruckerGPT persona has measurably different structure from chapter drafted with AndyGPT persona (slot labels differ, argument shape differs)
- **Effort:** M
- **Depends on:** A.S10, V.S4
- **Touches:** `src/lib/agents/quill/index.ts`

#### N.S2: Voice Critic agent [READY]
- **AC:**
  - New `src/lib/agents/voice-critic/index.ts` implements `Agent<VoiceCriticInput, GateDecision<ChapterDraftArtifact>>`
  - Input: draft + `authorVoiceProfile` + `frameworkFlow`
  - Model family constraint: critic model ≠ Quill model family (enforced in routing config, covered by O.S4 contract test)
  - Returns `gatePass` (all paragraphs clean), `gateRetry` (with paragraph-number + violation + corrective hint per issue), or `gateFail` (fundamental voice mismatch)
  - Integration test: deliberately off-voice sample returns `gateRetry` with non-empty reasons
  - Integration test: on-voice sample returns `gatePass`
  - Max 2 auto-retries before escalating to decisions queue via M.S5
- **Effort:** M
- **Depends on:** A.S1, A.S10, O.S3, O.S4
- **Touches:** new `src/lib/agents/voice-critic/`, `src/lib/llm/routing.ts`

#### N.S3: Regenerate flow with critic feedback [READY]
- **AC:**
  - When Voice Critic returns `gateRetry`: Quill re-runs with critic reasons injected into prompt as revision brief
  - Each retry creates new `LLMCallLog` rows and new `ArtifactVersion`
  - Retry chain is auditable: `WorkflowRun` records retry count + critic reasons per attempt
  - Manual "Regenerate" button in chapter editor triggers same path (with critic notes visible to user)
  - CTA shows exact prompt delta before firing — user sees the instruction before it runs
- **Effort:** M
- **Depends on:** N.S2, M.S3, O.S2
- **Touches:** `src/lib/workflow-automation/autopilot.ts`, `src/app/books/[slug]/chapter-draft/`, new regen API route

#### N.S4: Reed production quality [READY]
- **AC:**
  - Reed uses Opus-class model (per routing config)
  - Per-chapter pass: line editing with explicit margin-note questions (not silent rewrites)
  - Will not alter author's `signatureConstructions` (from `authorVoiceProfile`)
  - Returns flags list as `FYIEvent` — not a blocking gate on the per-chapter pass
  - Hard gate (`user-committed`) on final manuscript approval after all chapters edited
- **Effort:** M
- **Depends on:** A.S11, V.S5
- **Touches:** `src/lib/agents/reed/index.ts`

#### N.S5: Cross-chapter coherence pass [READY]
- **AC:**
  - Separate Reed invocation after all chapters individually edited
  - Input: all edited chapters as single context window
  - Detects: repeated phrases across chapters, inconsistent terminology, argument contradictions, weak inter-chapter transitions
  - Returns cross-chapter flags as a consolidated `FYIEvent` (not blocking)
  - Does not re-edit chapters — flags only; author decides what to address
- **Effort:** M
- **Depends on:** N.S4
- **Touches:** `src/lib/agents/reed/index.ts` (new `crossChapterMode` input flag), new orchestrator step in Managing Editor

#### N.S6: Press PDF + EPUB [READY]
- **AC:**
  - Press assembles ordered committed Reed-edited chapters into manuscript
  - PDF via puppeteer: HTML render → print-to-PDF at true page size
  - EPUB: valid EPUB3 with table of contents, chapter navigation
  - Front matter: title page, copyright page, table of contents
  - Back matter: endnotes (if Scout citations present), acknowledgments placeholder
  - Build verification: PDF page count > 0, EPUB passes structural validation
  - Both formats written to artifact mirror disk path and trigger browser download
- **Effort:** L
- **Depends on:** A.S12, N.S4
- **Touches:** `src/lib/agents/press/index.ts`

#### N.S7: Voice-guard UX [READY]
- **AC:**
  - Chapter editor shows voice-critic verdict badges in 24px right gutter (per Sally's UX spec)
  - Pass: small green check — invisible unless looking
  - Soft-fail: amber half-circle — hover reveals critic note
  - Hard-fail: magenta triangle — always expanded inline; "Regenerate with these notes" CTA visible
  - CTA shows exact prompt delta before firing; one-click execute
  - "Accept as-is" override: one-line rationale required, logs to override ledger
  - Chapter-level summary banner: "N soft-fail, M hard-fail, P pass"
- **Effort:** M
- **Depends on:** N.S2, N.S3, C.S6
- **Touches:** `src/app/books/[slug]/chapter-draft/page.tsx`, new `VoiceVerdictInline` component, new `VoiceVerdictBanner` component

---

## Phase 5b — Fiction Agent Staff

**Goal:** The fiction pipeline has its own named agent staff (Spark, Lore, Arc, Canvas, Lens) with Story Frameworks parallel to structural personas. Both modes run under the same orchestrator and control tower.  
**Gate to Phase 5b complete:** A fiction book can be run from Blueprint through Quill + Lens + Reed + Press without manual stage-by-stage intervention.

### Epic F — Fiction Pipeline

#### F.S1: Story Framework system [READY]
- **AC:**
  - New `src/lib/story-frameworks/` directory, parallel to `src/lib/personas/`
  - Five frameworks as TypeScript constants: `HeroJourney`, `SaveTheCat`, `StoryGrid`, `StoryCircle`, `ThreeActClassic`
  - Each framework: `slug`, `name`, `description`, `frameworkFlow` (array of `{ beat, prompt }` — beats/stages with descriptive prompt)
  - `ensureCanonicalStoryFrameworks()` syncs to new `StoryFramework` DB table on boot (DB is cache; code is source of truth)
  - Integration test: all 5 frameworks produce valid `frameworkFlow` arrays
  - `StoryFramework` selectable in Blueprint fiction-mode setup (alongside genre, POV, etc.)
- **Effort:** M
- **Depends on:** A.S1
- **Touches:** new `src/lib/story-frameworks/`, `prisma/schema.prisma` (StoryFramework table), `src/lib/agents/blueprint/`

#### F.S2: Spark agent [READY]
- **AC:**
  - `src/lib/agents/spark/index.ts` implements `Agent<SparkInput, StoryCoreArtifact>`
  - Input: `StorySetupArtifact` from Blueprint fiction mode
  - Produces: theme, controlling idea, protagonist (with need), antagonist force, central conflict, stakes, transformation arc, story promise
  - Returns `gateRetry` if: antagonist force is undefined, stakes lack concrete consequence, or protagonist need contradicts transformation arc
  - Gate: `user-review`
- **Effort:** M
- **Depends on:** A.S1, A.S2, F.S1
- **Touches:** new `src/lib/agents/spark/`, `src/app/books/[slug]/story-core/`

#### F.S3: Lore agent [READY]
- **AC:**
  - `src/lib/agents/lore/index.ts` implements `Agent<LoreInput, WorldCastArtifact>`
  - Input: `StoryCoreArtifact` from Spark
  - Produces: setting, world rules, atmosphere, institutions, full character sheet per major character (desire, flaw, pressure, relationship web)
  - Minimum cast: protagonist + antagonist force agent + 1 supporting character
  - Returns `gateRetry` if protagonist's desire contradicts protagonist's established flaw (no dramatic irony)
  - Gate: `user-review`
- **Effort:** M
- **Depends on:** A.S1, F.S2
- **Touches:** new `src/lib/agents/lore/`, `src/app/books/[slug]/world-cast/`

#### F.S4: Arc agent [READY]
- **AC:**
  - `src/lib/agents/arc/index.ts` implements `Agent<ArcInput, PlotBlueprintArtifact>`
  - Input: `StoryCoreArtifact` + `WorldCastArtifact` + selected `StoryFramework`
  - Routes generation through chosen framework's beats — `structureModel` field set to `framework.slug`
  - Each chapter beat: beat name, purpose, conflict, turn, hook, target word count
  - Returns `gateRetry` if any act contains no turning point
  - Gate: `user-review` (this is Decision 2 — the structure gate — for fiction)
  - Integration test: Hero's Journey blueprint produces 12 chapter beats; Save the Cat produces 15
- **Effort:** M
- **Depends on:** A.S1, F.S1, F.S3
- **Touches:** new `src/lib/agents/arc/`, `src/app/books/[slug]/plot-blueprint/`

#### F.S5: Canvas agent [READY]
- **AC:**
  - `src/lib/agents/canvas/index.ts` implements `Agent<CanvasInput, ScenePlanArtifact>`
  - Input: `PlotBlueprintArtifact` + `WorldCastArtifact`
  - Produces per-chapter scene breakdowns: location, POV, objective, conflict, outcome, reveal, bridge to next scene
  - Generates `continuityRules` list on `ScenePlanArtifact` (rules Lens will enforce)
  - Minimum 2 scenes per chapter
  - Gate: `user-review`
- **Effort:** M
- **Depends on:** A.S1, F.S4
- **Touches:** new `src/lib/agents/canvas/`, `src/app/books/[slug]/scene-plan/`

#### F.S6: Quill fiction mode [READY]
- **AC:**
  - `QuillInput` in fiction mode: `ScenePlanChapter` + `WorldCastArtifact` + `authorVoiceProfile?` (instead of paragraph plan + research pack)
  - POV discipline: Quill receives POV character per scene, stays in that POV — POV breaks trigger `gateRetry`
  - No framework-flow slot structure (fiction prose is continuous, not beat-structured)
  - Word count target from `ScenePlanChapter.targetWords` — ±15% is acceptable
  - `workflowType === FICTION` flag in `QuillInput` switches modes (interface laid in A.S10)
- **Effort:** M
- **Depends on:** A.S10, F.S5, V.S4
- **Touches:** `src/lib/agents/quill/types.ts`, `src/lib/agents/quill/index.ts`

#### F.S7: Lens agent (continuity guardian) [READY]
- **AC:**
  - `src/lib/agents/lens/index.ts` implements `Agent<LensInput, GateDecision<FictionChapterDraft>>`
  - Input: drafted chapter + all previously committed chapters + `WorldCastArtifact` + `ScenePlanArtifact.continuityRules`
  - Checks: character behavior vs. established profiles, POV breaks, timeline contradictions, world-rule violations, repeated information from prior chapters
  - Model family constraint: Lens model ≠ Quill model family (same rule as Voice Critic — covered by O.S4)
  - Returns `gatePass`, `gateRetry` (specific violation list with chapter + paragraph references), or `gateFail`
  - Integration test: chapter contradicting an established character flaw returns `gateRetry` with specific violation
- **Effort:** M
- **Depends on:** A.S1, F.S6, O.S4
- **Touches:** new `src/lib/agents/lens/`, `src/lib/llm/routing.ts`

#### F.S8: Fiction spine view [READY]
- **AC:**
  - `/books/[slug]` spine view renders fiction stage groups when `book.workflowType === FICTION`:
    - **Setup** (Blueprint, Mary) — cool-grey gutter
    - **Story Architecture** (Spark, Lore, Arc, Canvas) — warm ochre gutter
    - **Production** (Quill, Lens, Reed, Press) — deep indigo gutter
  - Stage labels use agent display names, not generic stage keys
  - Same state badges, gate verdicts, cost tracking, and autopilot "Run" button as non-fiction
  - Locked-stage shake behavior unchanged
- **Effort:** S
- **Depends on:** F.S2 through F.S7, C.S4
- **Touches:** `src/lib/ui/stage-tokens.ts`, `src/app/books/[slug]/page.tsx`, `src/lib/repositories/book-spine.ts`

---

## Phase 6 — Canonical Book Runs

**Goal:** Chris runs one non-fiction book and one fiction book end-to-end. Both produce typeset manuscripts. Both cost ≤ $40 in LLM spend. Both pass human quality sign-off.  
**Gate:** Two manuscripts exist. Both have receipts. Both have sign-offs.

### Epic R — Reference Runs

#### R.S1: Select and prep non-fiction canonical book [READY]
- **AC:**
  - Chris selects book topic, uploads knowledge base, completes Blueprint/Marin voice intake
  - Structural persona selected (one of the five canonical personas)
  - Market viability gate passed (Mary scores ≥ 3.5/5)
  - Outline generated and Chris approves (Atlas → Decision 2)
- **Effort:** S (Chris's time, minimal dev)
- **Depends on:** Phase 5a complete

#### R.S2: Full non-fiction run with cost verification [READY]
- **AC:**
  - Autopilot runs all chapters through Quill + Voice Critic + Reed
  - Cross-chapter coherence pass completes
  - Press produces PDF + EPUB
  - `SUM(LLMCallLog.costUsd) WHERE bookSlug = '...'` ≤ $40
  - If over ceiling: cost breakdown by agent surfaced; flagged as regression before any ship decision
  - All chapters pass Voice Critic without manual override — or: all overrides explicitly logged with rationale
- **Effort:** L
- **Depends on:** R.S1, Phase 5a complete

#### R.S3: Human quality sign-off — non-fiction [READY]
- **AC:**
  - Chris reads manuscript cover to cover
  - Issues logged as GitHub issues (not ad-hoc)
  - Sign-off: "This is shippable" or "These N issues block ship" (which become new stories)
- **Effort:** M (Chris's reading time)
- **Depends on:** R.S2

#### R.S4: Select and prep fiction canonical book [READY]
- **AC:**
  - Chris selects a fiction premise, completes Blueprint fiction intake
  - Story Framework selected
  - Market viability gate passed (Mary fiction mode)
  - Plot blueprint generated and Chris approves (Arc → Decision 2)
- **Effort:** S
- **Depends on:** Phase 5b complete

#### R.S5: Full fiction run with cost verification [READY]
- **AC:**
  - Autopilot runs all chapters through Quill fiction mode + Lens + Reed
  - Cross-chapter coherence pass completes
  - Press produces PDF + EPUB
  - `SUM(LLMCallLog.costUsd)` ≤ $40
  - Lens continuity passes without manual override — or: all overrides logged
- **Effort:** L
- **Depends on:** R.S4, Phase 5b complete

#### R.S6: Human quality sign-off — fiction [READY]
- **AC:**
  - Chris reads fiction manuscript
  - Issues logged
  - Sign-off or issue list
- **Effort:** M
- **Depends on:** R.S5

---

## Phase 7 — Stabilize + Document

**Goal:** The system is safe to leave alone for a week. A new collaborator can operate it from docs. Test suite catches regressions.

### Epic S — Stabilize

#### S.S1: Artifact mirror (DB → disk) [READY]
- **AC:**
  - On every committed artifact save: Markdown + YAML frontmatter written to `artifacts/[bookSlug]/[stage]/[artifact-id].md`
  - Frontmatter: `id`, `bookSlug`, `stage`, `agentId`, `createdAt`, `runId`, `costUsd`, `model`
  - Write failures do not crash the workflow — logged as warning, pipeline continues
  - DB stays primary; disk is read-only output
  - `.gitignore` updated: `artifacts/` can optionally be tracked (Chris's choice per book)
- **Effort:** M
- **Depends on:** Phase 1 complete
- **Touches:** repository save hooks, new `src/lib/mirror/writer.ts`

#### S.S2: Delete stale template files [READY]
- **AC:**
  - All `*.md.template` files in `_bmad-output/` removed
  - Commit message explains what replaced each (personas-as-code, story-frameworks-as-code)
  - `npm run check` passes after removal
- **Effort:** XS
- **Depends on:** F.S1 (story frameworks as code must exist before templates removed)
- **Touches:** `_bmad-output/*.md.template`

#### S.S3: Vitest suite [READY]
- **AC:**
  - Unit test for every `Agent<I,O>` implementation: happy path + one failure path each
  - Integration test: full non-fiction pipeline on fixture book (2 chapters, mocked LLMs)
  - Integration test: full fiction pipeline on fixture book (2 chapters, mocked LLMs)
  - Router contract test from O.S4 runs in CI
  - `npm test` passes on clean clone
  - Coverage report generated (threshold not enforced — visible only)
- **Effort:** L
- **Depends on:** Phase 5a + 5b complete
- **Touches:** `__tests__/` across the tree, CI config

#### S.S4: Operator docs [READY]
- **AC:**
  - New `docs/operating.md` covering both modes:
    - Non-fiction: upload KB → voice intake → viability gate → outline → draft → edit → typeset → ship
    - Fiction: premise → story framework → viability gate → plot blueprint → scene plan → draft → edit → typeset → ship
  - Each step names the agent, the screen, and the action
  - Troubleshooting: what to do when a stage fails (check LLMCallLog, rerun, escalate)
  - A reader not in this session can follow it cold
- **Effort:** M
- **Depends on:** Phase 6 complete

#### S.S5: Retrospective [READY]
- **AC:**
  - One-page `docs/v1-retro.md`: what worked, what didn't, what to cut in hindsight
  - Measures each PRD success criterion — did it land?
  - Feeds v1.1 planning (pricing, multi-user, additional personas/frameworks)
- **Effort:** S
- **Depends on:** R.S3 + R.S6

---

## Critical Path

Shortest route to both manuscripts shipped:

```
O.S1 (done) → O.S3 (done) → O.S2 → O.S4
    → A.S1 → A.S10 (Quill) → N.S1 → N.S2 → N.S3 → N.S4 → N.S6
    → R.S1 → R.S2 → R.S3  ← non-fiction done

    → A.S1 → F.S1 → F.S4 (Arc) → F.S5 (Canvas) → F.S6 (Quill fiction) → F.S7 (Lens) → A.S11 (Reed)
    → R.S4 → R.S5 → R.S6  ← fiction done
```

V.S1–V.S5 (voice profile) can run in parallel with any Phase 1 story after A.S1.  
M.S1–M.S6 (orchestrator) can run in parallel with Phase 2 after Phase 1.  
C.S1–C.S6 (control tower) can run in parallel with Phase 5a/5b after Phase 3.

---

## Story Count Summary

| Phase | Epic | Stories | Status |
|---|---|---|---|
| 0 | O — Observable Pipeline | 4 | 2 done, 2 ready |
| 1 | A — Agent Staff | 13 | All ready |
| 2 | V — Author Voice Profile | 5 | All ready |
| 3 | M — Managing Editor | 6 | All ready |
| 4 | C — Control Tower | 6 | All ready |
| 5a | N — Non-fiction Production | 7 | All ready |
| 5b | F — Fiction Pipeline | 8 | All ready |
| 6 | R — Reference Runs | 6 | All ready |
| 7 | S — Stabilize | 5 | All ready |
| **Total** | | **60** | **4 done, 56 ready** |
