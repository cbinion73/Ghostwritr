# GHOSTWRITR Stabilization Execution Contract

This document is the canonical unattended execution reference for GPT-5.4 medium.

## Objective

Stabilize GHOSTWRITR, reduce token waste, protect data, simplify execution, and implement the approved book-production flow without adding unrelated features or rewriting the application from scratch.

## Product contract

1. Phase 1 is a guided BMAD-style discovery process covering uploaded background material, book promise, readers and personas, exactly three comparable titles, market analysis, book type, target length, voice, writer-persona blend, chapter elements, and KDP production choices.
2. After approval, generate a high-level section/chapter outline and editable paragraph-level outlines.
3. Generate a Base Story that provides a cohesive thread across the book.
4. Generate and save verified Research and attributable External Stories per chapter.
5. Interview the author for confirmed Personal Stories and assign selected stories to chapters. Never invent personal stories.
6. Quill drafts one chapter at a time from the approved outline, Base Story guidance, verified Research, External Stories, assigned Personal Stories, voice guide, and relevant craft notes.
7. The author approves every Quill chapter individually.
8. After all drafts are approved, run one economical book-wide editorial assessment. It analyzes duplication, continuity, structure, voice, AI artifacts, citations, and chapter-specific corrections but does not rewrite prose.
9. Opus performs the only post-draft prose transformation: one combined editorial revision and polish per chapter using the approved draft and editorial instructions.
10. The author reviews and approves every Opus-revised chapter individually.
11. Typesetting remains locked until every chapter has an approved final revision. It assembles those exact versions, generates the bibliography from sources actually used, and produces print-ready KDP outputs.
12. Exports include DOCX, print-ready PDF, Markdown, ebook-oriented source, a production manifest, and a preflight report.
13. Audiobook output is a book-specific production instruction package for an external AI audiobook agent, not necessarily synthesized audio.
14. If an approved upstream artifact changes, mark only affected downstream chapter assets stale. Preserve unaffected work and never regenerate automatically without authorization.

## Standing execution rules

- Read `AGENTS.md` and this document at the start of every heartbeat.
- Use GPT-5.4 with medium reasoning.
- Execute only the first unchecked work package whose prerequisites are complete.
- Finish, test, and document that package before selecting another.
- Do not start unrelated features or new architecture outside this contract.
- Do not rewrite the application from scratch.
- Preserve all user-owned changes in the dirty working tree.
- Do not modify `.agents`, `.claude`, `.github/skills`, reference-library content, archives, logs, generated files, or unrelated data.
- Use `apply_patch` for source edits.
- Use `./start-dev.sh` for runtime testing.
- Do not run live LLM tests or any operation that can spend provider money unless the package explicitly requires it and the user has authorized the spend.
- Routine tests must use fake or recorded model providers.
- Run `npm run check` after every package.
- Run targeted tests for every changed behavior.
- Run `npm run build` at milestone boundaries and before declaring the program complete.
- Do not commit, push, migrate production data, delete data, or deploy unless explicitly authorized.
- Never hide a failure behind plausible fallback content.
- Never treat unverified research, fabricated market data, or deterministic scaffolding as production output.
- If blocked, record the exact blocker under `Execution ledger`, leave the package unchecked, and stop.
- Keep changes narrow enough to review. If a package proves too large, split it into lettered subpackages in this file before editing code.

## Definition of done for a work package

A package is complete only when:

1. Its implementation is finished.
2. Relevant tests pass.
3. `npm run check` passes.
4. No live provider spend occurred unless explicitly authorized.
5. Changed files and behavioral effects are recorded in the execution ledger.
6. Newly discovered risks are recorded.
7. The package checkbox is changed to `[x]`.

## Working boundary baseline

- Recorded on 2026-07-12 in `/Users/chris/Desktop/CODE/CODE/GHOSTWRITR`
- Branch: `main`
- HEAD at baseline: `191838998fcbdb6731aa4893dc70b4c041c086e2`
- Dirty-tree classification at baseline:
  - `.agents`: large unrelated user-owned BMAD skill changes
  - `.claude`: large unrelated user-owned mirrored skill changes
  - `_bmad`: unrelated module/config changes
  - `.github`: unrelated agent-support additions
  - `AGENTS.md`: user-owned repository instructions
  - `next-env.d.ts`: generated file drift
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`: stabilization control document
- Source ownership boundary for this program:
  - Treat all existing dirty files as user-owned unless this program changes them intentionally.
  - Do not clean, revert, delete, or normalize unrelated changes as part of stabilization work.
  - Limit stabilization edits to files required by the active package plus this execution document.
  - Avoid changes under `.agents`, `.claude`, `_bmad`, and unrelated `.github` content unless a later checked package explicitly requires it.
- Safe remediation scope at baseline:
  - Application source under `src/`
  - Relevant API routes under `src/app/api/`
  - Relevant app pages/components under `src/app/`
  - Prisma schema and related tests when a checked package requires them
  - Targeted docs that steer unattended execution
- Baseline operating rule:
  - If a required edit overlaps an unrelated dirty file, stop and record the conflict before proceeding.

## Ordered work queue

### Milestone 1: Containment

- [x] **1.1 Working boundary** — Record branch, HEAD, dirty-tree classification, source ownership boundaries, and safe remediation scope. Do not alter unrelated files.
- [x] **1.2 Authentication and ownership** — Require authentication for application routes, verify book ownership, and establish separately authenticated JARVIS and worker boundaries. Local development may use an explicit local-user mechanism; production must not silently fall back.
- [x] **1.2a App auth foundation** — Add one explicit app-user authentication mechanism for local development and a fail-closed gate for production. Protect app pages and book/persona APIs with middleware and shared auth helpers.
- [x] **1.2b Ownership enforcement** — Route book reads, writes, lists, and server actions through ownership-aware helpers so users can only access their own books and related resources.
- [x] **1.2b1 Ownership-aware book access** — Add ownership-scoped book and list helpers plus ownership-scoped spine loading. Leave unrestricted helpers only for explicitly internal callers.
- [x] **1.2b2 App entrypoints** — Migrate the Library, Book Studio entrypoints, and core server actions to the ownership-aware helpers.
- [x] **1.2b3 Book APIs** — Migrate public book APIs to the ownership-aware helpers and remove direct slug-only book lookups from route handlers.
- [x] **1.2b3a Polling and status APIs** — Migrate polling, progress, status, and lightweight read endpoints to ownership-aware helpers.
- [x] **1.2b3a2 Remaining read-only APIs** — Migrate remaining read-only book APIs such as exports, archive download, author reads, and similar non-mutating endpoints to ownership-aware helpers.
- [x] **1.2b3b Mutating book APIs** — Migrate book metadata, source-doc, author, manuscript/export, and commit/approve mutation routes to ownership-aware helpers.
- [x] **1.2b3b1 Core mutating book APIs** — Migrate book metadata, author PATCH, craft-note POST, and source-doc POST/PATCH routes to ownership-aware helpers.
- [x] **1.2b3b2 Workflow mutation APIs** — Migrate manifest generation, workbook design, promise references, commit/approve, and similar workflow mutation routes to ownership-aware helpers.
- [x] **1.2b3b2a Workflow support mutations** — Migrate manifest generation, promise reference upload, and workbook design routes to ownership-aware helpers.
- [x] **1.2b3b2b Approval and commit mutations** — Migrate stage approve, commit, approve-all, and related transition routes to ownership-aware helpers.
- [x] **1.2b3c Chapter and workflow APIs** — Migrate chapter drafting, editing, dossier/history, research/story save routes, and related chapter APIs to ownership-aware helpers.
- [x] **1.2b3c1 Chat persistence APIs** — Migrate agent-chat, history, dossiers, save-draft, save-dossier, and editing persistence routes to ownership-aware helpers.
- [x] **1.2b3c2 Chapter generation APIs** — Migrate chapter-draft, scout research, chronicle stories, and related generation/save routes to ownership-aware helpers.
- [x] **1.2c Internal boundaries** — Separate JARVIS and worker authentication with distinct credentials and fail-closed checks.
- [x] **1.3 Destructive administration** — Remove the public destructive dedup route and hard-coded fallback secret. Replace it with an explicit dry-run-first maintenance command that preserves referenced and historical versions.
- [x] **1.4 Request and upload limits** — Add centralized JSON, chat, file, archive, expanded-archive, file-count, rate, and per-book concurrency limits.
- [x] **1.5 Dependency security** — Upgrade the smallest safe dependency set addressing known production advisories; verify with `npm audit --omit=dev`, typecheck, targeted tests, and build.

### Milestone 2: Cost control

- [x] **2.1 Central LLM gateway** — Create one server-side gateway owning routing, reasoning effort, limits, caching, retries, timeouts, usage, costs, request IDs, attribution, structured validation, and budgets.
- [x] **2.2 Migrate model calls** — Route every OpenAI, Anthropic, and Gemini call, including PDF extraction and validation utilities, through the gateway. Reject unattributed calls.
- [x] **2.2a Validation utilities** — Migrate direct OpenAI/Gemini validation utilities under `src/lib/validation` to the gateway or explicitly block them behind the gateway until replacement is safe.
- [x] **2.2b Interactive API model calls** — Migrate agent-chat, Scout, Chronicle, workbook, manifest, and bibliography API/workflow-adjacent model calls to gateway invocation/stream helpers with unified usage logging.
- [x] **2.2b1 Interactive stream routes** — Migrate agent-chat, Scout, Chronicle, and workbook enrichment model calls to gateway acquisition/usage logging without changing streaming behavior.
- [x] **2.2b2 Workflow-adjacent API helpers** — Migrate manifest, bibliography, and other API-adjacent model calls to gateway invocation/stream helpers with unified usage logging.
- [x] **2.2c Workflow model calls** — Migrate long-running workflow model calls and structured-output calls to gateway helpers without changing workflow semantics.
- [x] **2.2c1 Workflow attribution foundation** — Ensure `getModelForRole()` carries ambient workflow book/stage/run/chapter context into gateway acquisition for long-running workflow callers.
- [x] **2.2c2 Workflow caller cleanup** — Migrate or verify each long-running workflow model factory and structured-output caller uses context-aware gateway acquisition without direct provider construction.
- [x] **2.2d Document extraction and raw SDK clients** — Route PDF vision extraction and any remaining raw SDK clients through the gateway boundary or mark explicitly non-LLM/local.
- [x] **2.2e Attribution enforcement** — Add static checks/tests that fail on new direct provider construction or unattributed model calls outside the gateway.
- [x] **2.3 Canonical cost ledger** — Add stage, operation, attempt, provider request, cached/reasoning token, status, error, pricing-version, generation-mode, and search-cost fields. Record failed and canceled attempts.
- [x] **2.4 Cost UI** — Rebuild cost reporting from canonical database events. Remove hard-coded role-to-stage inference and reconcile totals.
- [x] **2.5 Budgets and forecasts** — Add per-book warning, confirmation, and hard-stop budgets plus preflight cost estimates. Suggested defaults: $10 warning, $20 confirmation, $30 hard stop.
- [x] **2.6 Retry policy** — Eliminate nested retry multiplication. Centrally limit attempts and never rerun completed chapters during recovery.

### Milestone 3: Durable execution

- [x] **3.1 Durable jobs** — Replace detached child processes with PostgreSQL-backed jobs supporting atomic claims, leases, heartbeats, recovery, idempotency, cancellation, bounded attempts, and concurrency controls.
- [x] **3.2 Typed operational state** — Move chat messages, craft notes, job state, stage progress, budgets, approvals, source assignments, and automation configuration out of shared `metadataJson` blobs.
- [x] **3.3 Stage transition service** — Centralize prerequisites, approval gates, commit rules, staleness, next-stage unlocking, and reopening. Routes must not update stage status directly.

### Milestone 4: Artifact integrity

- [x] **4.1 Stable chapter identity** — Use immutable chapter IDs independent of titles and enforce canonical uniqueness by book, stage, artifact type, and chapter.
- [x] **4.2 Transactional artifact service** — Centralize version creation, approval, rejection, supersession, staleness, stage commit, and advance operations. Preserve history.
- [x] **4.3 Approval states** — Store exact approved Quill and final Opus version IDs with explicit draft-pending, draft-approved, final-revision-pending, final-revision-approved, and stale states.
- [x] **4.4 Dependency invalidation** — Mark only affected downstream chapter assets stale when strategy, outline, paragraph plan, Base Story, sources, or story assignments change.

### Milestone 5: Canonical production flow

- [x] **5.1 Unified Phase 1** — Consolidate discovery into one guided journey and one approved strategic artifact containing all required book, reader, market, voice, length, and KDP choices.
  - [x] **5.1a Strategic brief contract** — Define the canonical approved Phase 1 strategic brief shape and compile it from existing setup, promise, audience, and market artifacts without live model calls.
  - [x] **5.1b Strategic brief persistence** — Save and commit the compiled strategic brief as the single approved Phase 1 artifact and copy downstream-critical fields into typed/metadata state.
  - [x] **5.1c Guided Phase 1 UI** — Present Book Setup, Promise, audience/personas, exactly three comparable titles, market, voice, length, and KDP decisions as one guided journey.
  - [x] **5.1d Phase 1 gate cleanup** — Make downstream stages depend on the approved strategic brief and remove misleading duplicate Phase 1 gates.
- [x] **5.2 Outline system** — Maintain linked high-level and paragraph-level outlines with stable chapter IDs, per-chapter editing, and targeted invalidation.
  - [x] **5.2a Outline linkage contract** — Validate that committed high-level outlines and paragraph-level outlines use the same stable chapter IDs, order, and word-count targets before downstream stages trust them.
  - [x] **5.2b Per-chapter outline editing** — Ensure chapter/paragraph edits target one stable chapter ID at a time and preserve unaffected chapters.
  - [x] **5.2c Outline targeted invalidation** — Mark only affected downstream chapter artifacts stale when outline or paragraph-plan chapters change.
- [x] **5.3 Base Story** — Store book-wide narrative guidance plus compact chapter-specific guidance without confusing it with personal stories.
  - [x] **5.3a Base Story guidance contract** — Define the canonical book-wide and per-chapter guidance shape, normalize legacy Base Story bundles into it, and label it as guidance rather than personal-story material.
  - [x] **5.3b Base Story persistence/readiness** — Validate committed Base Story bundles against the approved outline and block downstream stages when chapter guidance is missing or stale.
  - [x] **5.3c Base Story consumption/UI cleanup** — Send compact chapter guidance to Research/External Stories/Quill and rename UI/copy that currently implies actual chapter stories.
- [x] **5.4 Research and External Stories** — Store claims, source metadata, supporting excerpts, verification status, case studies, relevance, and exclusions per chapter.
  - [x] **5.4a Source evidence contracts** — Define canonical per-chapter Research and External Story evidence contracts covering source metadata, supporting excerpts, verification status, relevance, and exclusions without live model calls.
  - [x] **5.4b Research persistence/readiness** — Normalize saved Research dossiers into the evidence contract and block downstream use when claims lack source metadata, excerpts, or verification status.
  - [x] **5.4c External Stories persistence/readiness** — Normalize saved case-study/story dossiers into the evidence contract and block downstream use when stories lack attribution, relevance, exclusions, or verification status.
  - [x] **5.4d Chapter-scoped source invalidation** — Ensure changed Research or External Story dossiers mark only affected downstream chapter assets stale.
  - [x] **5.4e Evidence UI/copy cleanup** — Surface verification, excerpts, relevance, exclusions, and warnings clearly without treating unverified leads as usable facts.
- [x] **5.5 Personal Stories** — Store confirmed stories, raw notes, missing details, permissions, assignments, and usage history. Send agents compact relevant state, not full transcripts.
  - [x] **5.5a Personal story contract** — Define the canonical confirmed-story shape with raw-note provenance, missing details, permissions, chapter assignments, and usage history.
  - [x] **5.5b Personal story readiness** — Block downstream use of unconfirmed, permission-blocked, or detail-incomplete stories and preserve them as interview follow-ups instead.
  - [x] **5.5c Compact personal-story context** — Send Quill only compact assigned story cards for the active chapter, not full interview transcripts or unrelated stories.
  - [x] **5.5d Personal story UI/copy cleanup** — Surface confirmation, permission, missing-detail, assignment, and usage status one chapter at a time.
- [x] **5.6 Quill context** — Draft from only the approved brief, current paragraph outline, chapter Base Story guidance, verified chapter sources, assigned stories, voice guide, and relevant craft notes.
  - [x] **5.6a Quill context contract** — Define the canonical per-chapter context packet and verify it excludes stale, unapproved, unverified, unassigned, and raw-transcript material.
  - [x] **5.6b Quill source readiness gate** — Block chapter drafting unless the active chapter has approved brief, current outline, Base Story guidance, admissible sources, assigned ready stories, voice guide, and relevant craft notes.
  - [x] **5.6c Quill prompt/input cleanup** — Route author/revise/fallback paths through the canonical packet and remove duplicate or oversized context fields.
  - [x] **5.6d Quill context UI summary** — Show the author exactly which approved inputs Quill will use for the selected chapter.
- [x] **5.7 Quill approval** — Present every chapter for direct author review and store the exact approved draft version.

### Milestone 6: Combined editorial revision and polish

- [x] **6.1 Book-wide assessment** — Run one economical analytical pass producing duplication, continuity, structure, voice, AI-artifact, terminology, citation, preservation, and chapter-instruction findings without rewriting prose.
- [x] **6.2 Opus final revision** — Perform one combined editorial revision and polish per chapter using only the approved draft, paragraph outline, voice guide, protected material, verified citations, and chapter-specific assessment instructions.
- [x] **6.3 Final chapter approval** — Show approved Quill draft, Opus revision, change summary, comparison, preserved stories/citations, and unresolved warnings. Support approve, reject with instructions, manual edit, and chapter-only retry.

### Milestone 7: Final production

- [x] **7.1 Canonical assembly** — Assemble only approved, non-stale Opus versions in approved outline order. Fail on missing, stale, unordered, or unapproved chapters.
- [x] **7.2 Bibliography** — Generate a deduplicated bibliography from research sources actually cited in approved final chapters and flag incomplete citations.
- [x] **7.3 KDP typesetting** — Generate print-ready DOCX and PDF with selected trim, mirrored margins, gutter, bleed, section breaks, page numbering, headers, footers, embedded fonts, working TOC, paragraph styles, image checks, and preflight validation.
  - [x] **7.3a Typeset plan contract** — Normalize selected trim, margins, gutter, bleed, font, page-numbering, header/footer, TOC, section-break, image, and preflight settings into one deterministic plan consumed by DOCX, HTML, PDF, and manifest outputs.
  - [x] **7.3b DOCX print interior** — Make `buildKdpDocx` consume the deterministic plan and enforce trim size, mirrored margins/gutter, section breaks, page numbering, paragraph styles, TOC placeholders or fields, headers/footers, and front/back matter from the canonical manuscript.
  - [x] **7.3c PDF print interior** — Generate a print-ready PDF from the canonical typeset interior without live provider calls, with page size, margins, fonts, page breaks, headers/footers, and page numbering matching the plan.
  - [x] **7.3d Preflight validation** — Produce blocking/warning checks for missing final approvals, bibliography gaps, page-size mismatch, missing fonts, image issues, TOC readiness, blank-page/signature math, and KDP-critical layout settings.
  - [x] **7.3e Publish package wiring** — Ensure DOCX, PDF, HTML, CSS, layout manifest, bibliography, and preflight report all derive from the same canonical manuscript and typeset plan.
- [x] **7.4 Other exports** — Generate Markdown, ebook-oriented source, production manifest, and preflight report from the same canonical manuscript.
- [x] **7.5 Audiobook package** — Generate narrator tone, pacing, emotional direction, pronunciation, acronym, chapter-break, quote/table, multi-voice, sensitive-passage, and production instructions.

### Milestone 8: Simplification

- [x] **8.1 Authoritative registry** — Parent simplification package. Complete through the subpackages below so the registry can become authoritative without a risky all-at-once rewrite.
  - [x] **8.1a Registry navigation contract** — Make `workflow-registry.ts` authoritative for stage order, routes, labels, grouping, and book-type availability. Generate stage tokens/navigation from it and test route existence.
  - [x] **8.1b Registry operational metadata** — Move roles, artifact types, approvals, prerequisites, and dependency declarations into the registry behind typed helpers.
  - [x] **8.1c Registry caller migration** — Migrate gate, commit/save, status, and workflow callers to registry helpers instead of local stage maps.
  - [x] **8.1d Registry duplicate-map guardrails** — Add static tests that fail on new duplicate navigation, artifact-type, role, or stage-order maps outside the registry.
- [x] **8.2 Split monoliths** — Parent simplification package. Complete through the subpackages below so large workflow files can be split without breaking callers.
  - [x] **8.2a Stable workflow public entrypoints** — Add public entrypoint modules for Promise, Editing, Chapter Draft, and Research, then migrate app/scripts/tests imports to those entrypoints.
  - [x] **8.2b Promise capability split** — Parent Promise split package. Complete through the subpackages below so `promise.ts` can be reduced safely.
    - [x] **8.2b1 Promise capability facades** — Add Promise capability modules for generation, audience/personas, market analysis, report composition, and workspace orchestration, then route `promise-public.ts` through those modules.
    - [x] **8.2b2 Promise report composition extraction** — Parent Promise report-composition extraction package. Complete through the subpackages below so the private helper chain can move safely.
      - [x] **8.2b2a Promise report markdown helpers** — Extract pure markdown label, section, executive-summary, and numbered-list parsing helpers from `promise.ts` with focused tests.
      - [x] **8.2b2b Promise report fallback helpers** — Parent Promise report fallback extraction package. Complete through the subpackages below so the fallback report can move safely.
        - [x] **8.2b2b1 Promise report presentation helpers** — Extract title/subtitle, audience profile, voice summary, and markdown list helpers with focused tests.
        - [x] **8.2b2b2 Promise report rendering helpers** — Parent fallback markdown rendering extraction package. Complete through the subpackages below so the full renderer can move safely.
          - [x] **8.2b2b2a Promise report executive/book-vision renderer** — Extract the executive summary and Book Vision fallback markdown section with focused tests.
          - [x] **8.2b2b2b Promise report audience/transformation renderer** — Extract the Audience & Personas and Transformation Journey fallback markdown sections with focused tests.
          - [x] **8.2b2b2c Promise report market/business/launch renderer** — Extract the Competitive Landscape, Market Opportunity, Business Model, and Launch Strategy fallback markdown sections with focused tests.
          - [x] **8.2b2b2d Promise report financial/recommendations renderer** — Extract Financial Projections, Success Metrics, Recommendations, and Appendices fallback markdown sections with focused tests.
        - [x] **8.2b2b3 Promise fallback report builder** — Move `fallbackBookPromiseReport` after its helper dependencies are extracted.
      - [x] **8.2b2c Promise report composition move** — Parent Promise report composition package. Complete through the subpackages below so `composeBookPromiseReportFromMarkdown` can move safely.
        - [x] **8.2b2c1 Promise report composition pure helpers** — Extract legacy markdown fallback, named-audience detection, and persona-name replacement helpers with focused tests.
        - [x] **8.2b2c2 Promise report composition grounding dependencies** — Parent grounding-dependency package. Complete through the subpackages below so markdown composition can move without dragging the full prompt payload chain.
          - [x] **8.2b2c2a Promise report persona-context helpers** — Extract `normalizeTruthVoice` and `buildTruthPersonaContexts` with focused tests.
          - [x] **8.2b2c2b Promise report composition grounding metadata** — Extract or adapt the composition-only grounding metadata needed by `composeBookPromiseReportFromMarkdown`.
          - [x] **8.2b2c2c Promise report composition grounding handoff** — Rewire markdown composition to depend only on extracted grounding helpers, leaving model prompt payload generation in place.
        - [x] **8.2b2c3 Promise report composition function move** — Move `composeBookPromiseReportFromMarkdown` into the report-composition module after helper dependencies are extracted.
    - [x] **8.2b3 Promise workspace extraction** — Parent Promise workspace extraction package. Complete through the subpackages below so workspace assembly and commit/run orchestration can move safely.
      - [x] **8.2b3a Promise workspace artifact availability** — Extract the artifact availability projection used by `getPromiseWorkspace`.
      - [x] **8.2b3b Promise workspace source document projection** — Extract the source-document view model mapping used by `getPromiseWorkspace`.
      - [x] **8.2b3c Promise workspace parsed artifact bundle** — Parent parsed workspace bundle package. Complete through the subpackages below so artifact parsing can move without a broad workspace regression.
        - [x] **8.2b3c1 Promise workspace phase approval helpers** — Extract Promise phase approval defaults and normalization with focused tests.
        - [x] **8.2b3c2 Promise workspace version comparison helpers** — Extract parsed Promise version projection and comparison assembly with focused tests.
        - [x] **8.2b3c3 Promise workspace normalized artifact bundle** — Parent normalized artifact bundle package. Complete through the subpackages below so parsing and fallback chains can move safely.
          - [x] **8.2b3c3a Promise workspace artifact map and conversation** — Extract artifact lookup and conversation-message parsing helpers with focused tests.
          - [x] **8.2b3c3b Promise workspace base artifact parsing** — Extract setup, promise, scorecard, persona, and audience parsing helpers with focused tests.
          - [x] **8.2b3c3c Promise workspace downstream artifact normalization** — Extract truth, transformation, market, recommendations, title, and Book Promise report normalization handoff.
        - [x] **8.2b3c4 Promise workspace return assembly** — Rewire `getPromiseWorkspace` to consume extracted bundle helpers.
      - [x] **8.2b3d Promise workspace orchestration move** — Parent Promise workspace orchestration move. Complete through the subpackages below so orchestration can move without dragging the graph runtime at once.
        - [x] **8.2b3d1 Promise workspace commit orchestration** — Move `commitPromiseWorkflow` implementation behind the workspace module.
        - [x] **8.2b3d2 Promise outline workspace orchestration** — Move `getOutlineWorkspace` implementation behind the workspace module.
        - [x] **8.2b3d3 Promise workspace loader orchestration** — Move `getPromiseWorkspace` implementation behind the workspace module after helper extraction.
        - [x] **8.2b3d4 Promise graph run handoff** — Route `runPromiseWorkflow` through the correct generation/workspace facade without circular imports.
    - [x] **8.2b4 Promise generation extraction** — Parent Promise generation extraction package. Complete through the subpackages below so generation helpers can move without changing gateway attribution or spending behavior.
      - [x] **8.2b4a Promise generation model helpers** — Extract env loading and structured/book-pitch model factories with focused static tests.
      - [x] **8.2b4b Promise generation prompt constants** — Parent prompt-constant extraction package. Complete through the subpackages below so prompt movement stays reviewable.
        - [x] **8.2b4b1 Book Pitch section plans** — Move `BOOK_PITCH_SECTION_PLANS` behind the generation prompt module with focused tests.
        - [x] **8.2b4b2 Book Pitch prompt constant** — Move the Book Pitch markdown prompt behind the generation prompt module.
        - [x] **8.2b4b3 Audience/persona prompt constants** — Parent audience/persona prompt extraction package. Complete through the subpackages below.
          - [x] **8.2b4b3a Audience Phase 1 prompt constant** — Move the audience discovery prompt behind the generation prompt module.
          - [x] **8.2b4b3b Audience Phase 2 persona prompt constant** — Move the detailed persona prompt behind the generation prompt module.
          - [x] **8.2b4b3c Audience Phase 3 comparison prompt constant** — Move the persona comparison prompt behind the generation prompt module.
        - [x] **8.2b4b4 Market/recommendation/title prompt constants** — Parent market/recommendation/title prompt extraction package. Complete through the subpackages below.
          - [x] **8.2b4b4a Market Report prompt constant** — Move the market report prompt behind the generation prompt module.
          - [x] **8.2b4b4b Positioning Recommendations prompt constant** — Move the recommendations prompt behind the generation prompt module.
          - [x] **8.2b4b4c Title/subtitle finalization prompt constant** — Move the title/subtitle prompt behind the generation prompt module.
        - [x] **8.2b4b5 Truth/transformation prompt constants** — Parent truth/transformation prompt extraction package. Complete through the subpackages below.
          - [x] **8.2b4b5a Core Truths prompt constant** — Move the Core Truths prompt behind the generation prompt module.
          - [x] **8.2b4b5b Transformation Arc prompt constant** — Move the Transformation Arc prompt behind the generation prompt module.
      - [x] **8.2b4c Promise audience/persona generation** — Parent audience/persona generation extraction package. Complete through the subpackages below so generation moves without dragging every private helper at once.
        - [x] **8.2b4c1 Audience/persona generation support helpers** — Extract or expose the pure normalization, prompt-summary, fallback, batching, and timeout helpers needed by audience/persona generation.
        - [x] **8.2b4c2 Audience Phase 1 generation function** — Parent Audience Phase 1 generation move. Complete through the subpackages below so the function moves without circular imports.
          - [x] **8.2b4c2a Promise generation response helpers** — Extract shared response text, JSON extraction, metadata, stop-reason, truncation, and timeout helpers used by generation functions.
          - [x] **8.2b4c2b Promise generation prompt context helpers** — Extract shared book setup and knowledge-context prompt helpers needed by moved generation functions.
          - [x] **8.2b4c2c Audience Phase 1 implementation move** — Move `maybeGenerateAudienceResearchPhase1` behind the audience-personas module.
        - [x] **8.2b4c3 Persona deep profile generation function** — Move persona deep-profile batch generation and `maybeGeneratePersonasDeepProfile` behind the audience-personas module.
        - [x] **8.2b4c4 Persona comparison generation function** — Move `maybeGeneratePersonaComparisonAnalysis` behind the audience-personas module.
        - [x] **8.2b4c5 Audience/persona facade cleanup** — Remove the temporary re-export facade once the moved functions are owned by the audience-personas module.
      - [x] **8.2b4d Promise market/recommendation generation** — Parent market/recommendation generation extraction package. Complete through the subpackages below so market-analysis generation can move without one risky helper dump.
        - [x] **8.2b4d1 Promise market normalization support** — Move low-level market normalization helpers behind the market-analysis module with focused non-spending tests.
        - [x] **8.2b4d2 Promise market generation support** — Parent market generation support package. Complete through the subpackages below so the market report support can move without one broad edit.
          - [x] **8.2b4d2a Promise market report schema move** — Move the Market Report schema behind the market-analysis module with focused non-spending tests.
          - [x] **8.2b4d2b Promise market fallback move** — Move market report fallback helpers behind the market-analysis module with focused non-spending tests.
          - [x] **8.2b4d2c Promise market grounding move** — Move market grounding context assembly behind the market-analysis module with focused non-spending tests.
          - [x] **8.2b4d2d Promise market high-level normalization move** — Move high-level market report normalization behind the market-analysis module with focused non-spending tests.
        - [x] **8.2b4d3 Promise market report generation move** — Move `maybeGenerateMarketReport` behind the market-analysis module while preserving gateway attribution and fallback behavior.
        - [x] **8.2b4d4 Promise recommendation generation support** — Move recommendations fallback, grounding, and normalization helpers behind the market-analysis module with focused non-spending tests.
        - [x] **8.2b4d5 Promise recommendations generation move** — Move `maybeGenerateRecommendations` behind the market-analysis module while preserving gateway attribution and fallback behavior.
        - [x] **8.2b4d6 Promise market-analysis facade cleanup** — Remove temporary re-export/import shims once market and recommendation generation are owned by the market-analysis module.
      - [x] **8.2b4e Promise truth/transformation generation** — Parent truth/transformation generation extraction package. Complete through the subpackages below so truth and transformation generation can move without one risky helper dump.
        - [x] **8.2b4e1 Promise Core Truths support move** — Move Core Truths schema, fallback, grounding, and normalization helpers behind the generation module with focused non-spending tests.
        - [x] **8.2b4e2 Promise Core Truths generation move** — Move `maybeGenerateCoreTruths` behind the generation module while preserving gateway attribution and fallback behavior.
        - [x] **8.2b4e3 Promise Transformation support move** — Move Transformation schema, fallback, and normalization helpers behind the generation module with focused non-spending tests.
        - [x] **8.2b4e4 Promise Transformation generation move** — Move `maybeGenerateTransformationArc` behind the generation module while preserving gateway attribution and fallback behavior.
        - [x] **8.2b4e5 Promise truth/transformation facade cleanup** — Remove temporary re-export/import shims once truth and transformation generation are owned by the generation module.
      - [x] **8.2b4f Promise graph runtime handoff** — Parent Promise graph runtime extraction package. Complete through the subpackages below so the LangGraph runtime can move without one risky graph/persistence dump.
        - [x] **8.2b4f1 Promise graph state and node support split** — Move graph state types and pure node-support helpers behind the generation runtime module with focused non-spending tests.
        - [x] **8.2b4f2 Promise graph context and message nodes move** — Move context loading, user-message append, and assistant-reply nodes behind the generation runtime module while preserving source-document and setup context behavior.
        - [x] **8.2b4f3 Promise graph artifact generation nodes move** — Move extraction, scorecard, persona, market, and recommendation graph nodes behind the generation runtime module while preserving moved generation-function ownership.
        - [x] **8.2b4f4 Promise graph persistence node move** — Move Promise graph artifact persistence behind the generation runtime module with focused artifact-shape tests.
        - [x] **8.2b4f5 Promise run workflow move** — Move compiled graph and `runPromiseWorkflow` behind the generation runtime module, then route the public generation facade there without circular imports.
        - [x] **8.2b4f6 Promise graph facade cleanup** — Remove remaining temporary graph-runtime imports/re-exports after `runPromiseWorkflow` is owned outside the monolith.
  - [x] **8.2c Research capability split** — Parent Research split package. Complete through the subpackages below so `research.ts` can be reduced safely.
    - [x] **8.2c1 Research capability facades** — Add Research capability modules for agent pipeline, durable jobs, commits, workspace assembly, binder tabs, and idea clips, then route `research-public.ts` through those modules.
    - [x] **8.2c2 Research workspace extraction** — Move workspace assembly helpers behind the workspace module with focused non-spending tests. Complete through the subpackages below so the workspace can move without one risky helper-chain extraction.
      - [x] **8.2c2a Research workspace support helpers** — Move pure dossier-status and source-normalization helpers behind the workspace module with focused non-spending tests.
      - [x] **8.2c2b Research workspace chapter seed assembly** — Move committed outline, paragraph outline, base story, and chapter seed assembly behind the workspace module with focused tests.
      - [x] **8.2c2c Research chapter workspace assembly** — Move single-chapter research workspace assembly behind the workspace module while preserving artifact-schema validation.
      - [x] **8.2c2d Research binder workspace summaries** — Move tab, selected-tab, dossier-entry, warning, and progress summary assembly behind the workspace module.
      - [x] **8.2c2e Research workspace facade cleanup** — Route `research/workspace.ts` to owned implementations and remove remaining temporary workspace re-exports.
    - [x] **8.2c3 Research binder extraction** — Move binder tab and idea clip operations behind binder/idea modules with focused tests.
    - [x] **8.2c4 Research execution extraction** — Move research agent pipeline and durable job processing behind execution/job modules while preserving gateway attribution. Complete through the subpackages below so the live-research path can move without one risky extraction.
      - [x] **8.2c4a Research unfinished chapter discovery** — Move read-only unfinished-chapter discovery behind the jobs module with focused non-spending tests.
      - [x] **8.2c4b Research durable job enqueue helpers** — Move queue/enqueue/trigger helpers behind the jobs module while preserving idempotency and non-provider behavior.
      - [x] **8.2c4c Research durable job processor wrapper** — Move claim/lease/complete/fail/heartbeat processing behind the jobs module while preserving quality-agent side effects.
      - [x] **8.2c4d Research chapter execution wrapper** — Move single-chapter research execution behind the execution module while preserving gateway attribution.
      - [x] **8.2c4e Research full-run orchestration** — Move full research run orchestration behind the execution module while preserving retry, cancellation, and provisional fallback behavior. Complete through the subpackages below so the orchestration body can move without dragging every support concern at once.
        - [x] **8.2c4e1 Research run progress support** — Move run activity, stage pulse, and cancellation helpers behind a support module with focused non-spending tests.
        - [x] **8.2c4e2 Research run result accounting** — Move completed/failed/provisional chapter result accounting helpers behind a support module with focused tests.
        - [x] **8.2c4e3 Research full-run function move** — Move `runFullResearchWorkflow` behind the execution module once support helpers are extracted.
      - [x] **8.2c4f Research execution facade cleanup** — Remove remaining temporary execution/job re-exports once ownership is complete.
      - [x] **8.2c4g Research chapter implementation extraction** — Move the provider-adjacent single-chapter implementation body behind the execution module with focused seam tests while preserving gateway attribution and no-spend verification. Complete through the subpackages below so the live web/model body can move safely.
        - [x] **8.2c4g1 Research chapter execution setup** — Move committed artifact loading, chapter context resolution, lens setup, book subject, and quality feedback loading behind an execution setup module with focused non-spending tests.
        - [x] **8.2c4g2 Research chapter persistence/fallback support** — Move provisional fallback packaging and final dossier persistence helpers behind support modules with focused tests. Complete through the subpackages below so fallback and persistence move separately.
          - [x] **8.2c4g2a Research provisional fallback pack** — Move provisional fallback packaging behind a support module with focused tests.
          - [x] **8.2c4g2b Research dossier persistence helper** — Move final dossier persistence and model-name accounting behind a support module with focused tests.
        - [x] **8.2c4g3 Research chapter live pipeline move** — Move the remaining live question/search/fetch/extract/verify/adjudicate body behind the execution module while preserving gateway attribution. Complete through the subpackages below so provider-adjacent code moves in reviewable slices.
          - [x] **8.2c4g3a Research live pipeline pure helpers** — Move source text/tier/summary helpers and dossier assembly behind support modules with focused non-spending tests.
          - [x] **8.2c4g3b Research question/search helper extraction** — Move question generation, search discovery, fetch, and source-integrity helpers behind support modules while preserving model and web gateway attribution.
          - [x] **8.2c4g3c Research extraction/verification/adjudication helper extraction** — Move extraction, verification, and ambiguity adjudication helpers behind support modules while preserving model attribution and fallback behavior.
          - [x] **8.2c4g3d Research live pipeline orchestration move** — Move the remaining single-chapter live orchestration body behind the execution module after helper ownership is complete.
  - [x] **8.2d Chapter Draft capability split** — Parent Chapter Draft split package. Complete through the subpackages below so `chapter-draft.ts` can be reduced safely.
    - [x] **8.2d1 Chapter Draft capability facades** — Add Chapter Draft capability modules for execution, repair/expansion, durable jobs, commits, and workspace assembly, then route `chapter-draft-public.ts` through those modules.
    - [x] **8.2d2 Chapter Draft workspace/context extraction** — Move workspace and canonical context assembly behind dedicated modules with focused tests. Complete through the subpackages below so workspace/context movement does not repeat the oversized-monolith problem.
      - [x] **8.2d2a Chapter Draft workspace projection helpers** — Move pure metrics, source availability, approval-state, and Quill context summary projection helpers behind a workspace support module with focused tests.
      - [x] **8.2d2b Chapter Draft source availability helpers** — Move committed research/external/personal/base-story availability assembly behind a support module with focused tests.
      - [x] **8.2d2c Chapter Draft canonical context assembly** — Move draft input loading and Quill readiness/context packet assembly behind dedicated modules.
      - [x] **8.2d2d Chapter Draft workspace orchestration move** — Move `getChapterDraftWorkspace` behind the workspace module after helper ownership is complete.
    - [x] **8.2d3 Chapter Draft execution extraction** — Move drafting, repair/expansion, and durable job processing behind execution/job modules while preserving gateway attribution. Complete through the subpackages below so durable jobs, wrappers, and provider-adjacent drafting move separately.
      - [x] **8.2d3a Chapter Draft durable job orchestration move** — Move enqueue/trigger/process workflow-run orchestration behind the jobs module with focused non-spending tests.
      - [x] **8.2d3b Chapter Draft repair and expansion wrappers move** — Move repair/expansion workflow wrappers behind the repair module while preserving context readiness and target math.
      - [x] **8.2d3c Chapter Draft run orchestration move** — Move `runChapterDraftWorkflow` behind the execution module after job and repair wrappers are independent.
      - [x] **8.2d3d Chapter Draft single-chapter implementation extraction** — Move provider-adjacent draft/revise/review implementation behind execution support modules while preserving gateway attribution and no-spend verification. Complete through the subpackages below so pure support, model calls, persistence, and temporary seam cleanup move separately.
        - [x] **8.2d3d1 Chapter Draft single-chapter pure support extraction** — Move deterministic prose cleanup, source-weave, framework-slot rendering, and quality helper logic behind execution support modules with focused non-spending tests.
        - [x] **8.2d3d2 Chapter Draft single-chapter model helper extraction** — Move draft/revise/review/tune model-call helpers behind execution modules while preserving gateway attribution and fake-provider/no-spend verification.
        - [x] **8.2d3d3 Chapter Draft single-chapter orchestration and persistence move** — Move `generateSingleChapterDraft` and `expandSingleChapterDraftTowardTarget` orchestration/persistence behind execution modules.
        - [x] **8.2d3d4 Chapter Draft execution seam cleanup** — Collapse temporary monolith exports and ensure execution/repair modules no longer import provider-adjacent helpers from `chapter-draft.ts`.
    - [x] **8.2d4 Chapter Draft commit extraction** — Move approval/commit helpers behind the commit module with focused tests.
  - [x] **8.2e Editing capability split** — Parent Editing split package. Complete through the subpackages below so `editing.ts` can be reduced safely.
    - [x] **8.2e1 Editing capability facades** — Add Editing capability modules for manuscript assembly, assessment, revision, publishing handoff, chat/preferences, commit/loop, and workspace assembly, then route `editing-public.ts` through those modules.
    - [x] **8.2e2 Editing workspace extraction** — Parent Editing workspace extraction package. Complete through the subpackages below so `getEditingWorkspace` can move without dragging assessment, revision, publishing, and interaction orchestration at once.
      - [x] **8.2e2a Editing workspace static ownership and dependency map** — Identify the exact helper/data dependencies of `getEditingWorkspace`, add static guardrails, and preserve public entrypoint behavior without moving runtime code.
      - [x] **8.2e2b Editing workspace projection helper extraction** — Move pure workspace projection/parsing helpers behind `editing/workspace.ts` with focused non-spending tests.
      - [x] **8.2e2c Editing workspace loader move** — Move `getEditingWorkspace` behind `editing/workspace.ts` after helper extraction while keeping callers on `editing-public.ts`.
      - [x] **8.2e2d Editing workspace seam cleanup** — Collapse temporary re-exports and ensure workspace callers no longer import workspace assembly from `editing.ts`.
    - [x] **8.2e3 Editing revision extraction** — Parent Editing revision extraction package. Complete through the subpackages below so assessment, revision, planning, execution, and suggested-target movement happens without breaking gateway attribution or stage metadata behavior.
      - [x] **8.2e3a Editing revision static ownership and dependency map** — Identify the exact public workflows, helper chain, model-call seams, artifact mutations, and stage metadata fields before moving runtime code.
      - [x] **8.2e3b Editing revision pure support extraction** — Move pure target-selection, prompt-context, final-instruction, deterministic-plan, and assessment-finding helpers behind revision support modules with focused non-spending tests.
      - [x] **8.2e3c Editing assessment extraction** — Move `generateEditorialAssessmentWorkflow` behind the assessment module while preserving assess-model routing, cache skip behavior, artifact attribution, and stage metadata updates.
      - [x] **8.2e3d Editing revision generation extraction** — Move `generateManuscriptRevisionWorkflow` behind the revision module while preserving polish-model routing, fallback behavior, chapter attribution, and no-spend tests.
      - [x] **8.2e3e Editing revision apply/reject extraction** — Move apply/reject revision workflows behind the revision module while preserving assembly updates, final approval state updates, preferences, and publish-package refresh triggers.
      - [x] **8.2e3f Editing revision planning/execution extraction** — Move revision plan generation, plan execution, and suggested revision target generation behind revision modules while preserving metadata and readiness-gate behavior.
      - [x] **8.2e3g Editing revision seam cleanup** — Collapse temporary revision/assessment re-exports and ensure public callers no longer import revision or assessment behavior from `editing.ts`.
    - [x] **8.2e4 Editing publishing/commit extraction** — Move publishing handoff, commit, and full-loop helpers behind dedicated modules with focused tests. Complete through the subpackages below so deterministic publishing helpers, package workflows, commit, and full-loop orchestration move separately.
      - [x] **8.2e4a Editing publishing/commit static ownership and support extraction** — Identify publishing/commit workflow ownership, move pure publishing package/provenance/handoff builders behind support modules, and add focused non-spending guardrails.
      - [x] **8.2e4b Editing publishing workflow extraction** — Move `preparePublishingPackageWorkflow` and `finalizePublishingHandoffWorkflow` behind the publishing module while preserving derived artifact refresh and final handoff metadata.
      - [x] **8.2e4c Editing commit and full-loop extraction** — Move `commitEditingStageWorkflow` and `runFullEditorialLoopWorkflow` behind the commit module while preserving readiness gates, stale checks, stage commit behavior, and full-loop orchestration.
      - [x] **8.2e4d Editing publishing/commit seam cleanup** — Collapse temporary publishing/commit re-exports and ensure public callers no longer import publishing or commit behavior from `editing.ts`.
- [x] **8.3 Remove duplicate paths** — Parent duplicate-path cleanup package. Complete through the subpackages below so cleanup remains reviewable and non-destructive.
  - [x] **8.3a Duplicate-path inventory and guardrails** — Record the remaining duplicate/facade seams and add static tests so subsequent cleanup removes known paths instead of chasing guesses.
  - [x] **8.3b Workflow facade cleanup** — Parent workflow-facade cleanup package. Complete through the subpackages below so each remaining monolith facade is removed safely.
    - [x] **8.3b1 Research commit facade cleanup** — Move remaining Research commit facade behavior behind `research/commit.ts`.
    - [x] **8.3b2 Editing assembly facade cleanup** — Move manuscript assembly behavior behind `editing/assembly.ts`.
    - [x] **8.3b3 Editing interaction facade cleanup** — Move editing chat/preferences behavior behind `editing/interaction.ts`.
    - [x] **8.3b4 Promise generation facade cleanup** — Parent Promise generation facade cleanup package. Complete through the subpackages below so live-generation seams move without changing provider behavior accidentally.
      - [x] **8.3b4a Promise generation static ownership map** — Record the remaining Promise generation facade exports, owner modules, and targeted no-spend verification before moving runtime code.
      - [x] **8.3b4b Promise title/report generation extraction** — Parent title/report generation extraction package. Complete through the subpackages below so support de-duplication and live-generation movement stay reviewable.
        - [x] **8.3b4b1 Promise title/report support reuse** — Reuse extracted title/subtitle normalization, fallback, and token-usage helpers from Promise support modules in the generation path.
        - [x] **8.3b4b2 Promise title/report runtime move** — Move title/subtitle finalization and book promise report generation behind Promise generation modules while preserving grounding metadata and fallback behavior.
      - [x] **8.3b4c Promise comprehensive statement extraction** — Move setup-derived comprehensive promise statement generation behind Promise generation modules while preserving knowledge-base grounding and fallback behavior.
      - [x] **8.3b4d Promise runtime facade cleanup** — Move or wire `runPromiseWorkflow` so `promise/generation.ts` no longer imports from the monolith, then close 8.3b.
  - [x] **8.3c Direct provider utility cleanup** — Remove or explicitly quarantine remaining raw provider utilities outside the LLM gateway boundary.
  - [x] **8.3d Client-side model orchestration cleanup** — Remove client-side or UI-triggered model orchestration paths that bypass durable jobs, budgets, or gateway attribution.
  - [x] **8.3e Redundant save/commit route cleanup** — Consolidate duplicate save, approve, and commit route behavior behind stage transition and artifact services.
  - [x] **8.3f Misleading fallback cleanup** — Rename, downgrade, or block fallback paths that can be mistaken for verified production output.
  - [x] **8.3g Duplicate navigation-map cleanup** — Remove duplicate route/stage/navigation maps now covered by the authoritative workflow registry.

### Milestone 9: Verification

- [x] **9.1 Unit tests** — Cover pricing, budgets, context selection, chapter identity, invalidation, citations, state transitions, editorial instructions, and preflight.
- [x] **9.2 Database tests** — Cover concurrent version creation, atomic commits, duplicate jobs, cancellation, lease recovery, ownership, lost updates, and stale propagation.
- [x] **9.3 API tests** — Cover authentication, ownership, validation, size limits, idempotency, and rate limiting.
- [x] **9.4 Workflow simulations** — Use fake providers for success, malformed output, timeout, rate limit, partial stream, cancellation, retry, restart, rejection, outline change, and stale downstream work.
- [x] **9.5 Final verification** — Run typecheck, production build, non-spending regression suite, database-integrity checks, dependency audit, route-contract tests, and documented manual acceptance review.

## Execution ledger

Append one entry after each heartbeat that changes or verifies the repository.

### Entry template

```markdown
### YYYY-MM-DD HH:MM — Package X.Y

- Status: completed | blocked | in progress
- Objective:
- Files changed:
- Schema or migration changes:
- Tests run:
- Live provider spend: none | explicitly authorized amount
- Behavioral result:
- Risks discovered:
- Blocker or next package:
```

## Completion condition

The stabilization program is complete only when all packages are checked, all final verification passes, no unresolved data-integrity or spending-control blocker remains, and the user has reviewed the final result. Do not mark work complete merely because a heartbeat ended.

### 2026-07-13 14:12 — Package 8.2b4d1

- Status: completed
- Objective: Move the low-level market normalization helpers out of the Promise monolith and behind the Promise market-analysis module boundary with focused non-spending coverage.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/market-analysis-support.ts`
  - `tests/promise-market-analysis-support.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-market-analysis-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Market risk, comparable-title, direct/indirect competitor, persona-urgency, pricing-tier, and ancillary-product normalization now live in `promise/market-analysis-support.ts` and are consumed by `promise.ts`. This reduces the Promise monolith without changing generation behavior or gateway attribution.
- Risks discovered: The high-level market report schemas, fallback, grounding context, and generation function still live in `promise.ts`; those remain in the next market-generation subpackages.
- Blocker or next package: Next package is 8.2b4d2 Promise market generation support.

### 2026-07-13 14:21 — Package 8.2b4d2a

- Status: completed
- Objective: Move the Market Report schema out of the Promise monolith and behind the Promise market-analysis report module with focused non-spending coverage.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/market-analysis-report.ts`
  - `tests/promise-market-analysis-report.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-market-analysis-report.test.ts tests/promise-market-analysis-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `MarketReportSchema` now lives in `promise/market-analysis-report.ts` and is consumed by `promise.ts`, preserving the strict enum and nullable metadata behavior while reducing the monolith.
- Risks discovered: Market fallback, grounding, normalization, and generation still live in `promise.ts`; those remain in the next 8.2b4d2 subpackages.
- Blocker or next package: Next package is 8.2b4d2b Promise market fallback move.

### 2026-07-13 14:31 — Package 8.2b4d2b

- Status: completed
- Objective: Move market report fallback helpers out of the Promise monolith and behind the Promise market-analysis fallback module with focused non-spending coverage.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/market-analysis-fallback.ts`
  - `tests/promise-market-analysis-fallback.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-market-analysis-fallback.test.ts tests/promise-market-analysis-report.test.ts tests/promise-market-analysis-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `createFallbackMarketReport` and `fallbackMarketReport` now live in `promise/market-analysis-fallback.ts`, and `promise.ts` uses the module-owned fallback constructor. The moved fallback now also includes explicit `metadata.tokenUsage: null`, making the no-provider fallback schema-valid.
- Risks discovered: Market grounding context and high-level normalization still live in `promise.ts`; those remain in 8.2b4d2c and 8.2b4d2d.
- Blocker or next package: Next package is 8.2b4d2c Promise market grounding move.

### 2026-07-13 14:38 — Package 8.2b4d2c

- Status: completed
- Objective: Move market grounding context assembly out of the Promise monolith and behind the Promise market-analysis grounding module with focused non-spending coverage.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/market-analysis-grounding.ts`
  - `tests/promise-market-analysis-grounding.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-market-analysis-grounding.test.ts tests/promise-market-analysis-fallback.test.ts tests/promise-market-analysis-report.test.ts tests/promise-market-analysis-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `buildMarketGroundingContext` now lives in `promise/market-analysis-grounding.ts` and is consumed by `promise.ts`, preserving compact prior-phase payload assembly for market generation without changing gateway or provider behavior.
- Risks discovered: High-level market report normalization still lives in `promise.ts`; it remains in 8.2b4d2d.
- Blocker or next package: Next package is 8.2b4d2d Promise market high-level normalization move.

### 2026-07-13 14:47 — Package 8.2b4d2d

- Status: completed
- Objective: Move high-level market report normalization out of the Promise monolith and behind the Promise market-analysis normalization module with focused non-spending coverage.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/market-analysis-support.ts`
  - `src/lib/workflows/promise/market-analysis-normalization.ts`
  - `tests/promise-market-analysis-normalization.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-market-analysis-normalization.test.ts tests/promise-market-analysis-grounding.test.ts tests/promise-market-analysis-fallback.test.ts tests/promise-market-analysis-report.test.ts tests/promise-market-analysis-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `normalizeMarketReport` now lives in `promise/market-analysis-normalization.ts` and is consumed by `promise.ts`, preserving fallback filling, enum normalization, competitor/title coercion, and token-usage metadata normalization. Parent package 8.2b4d2 is complete.
- Risks discovered: The live `maybeGenerateMarketReport` function still lives in `promise.ts`; it remains in 8.2b4d3.
- Blocker or next package: Next package is 8.2b4d3 Promise market report generation move.

### 2026-07-13 14:56 — Package 8.2b4d3

- Status: completed
- Objective: Move `maybeGenerateMarketReport` out of the Promise monolith and behind the Promise market-analysis module while preserving gateway routing, knowledge grounding, fallback behavior, parsing, and usage metadata handling.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/market-analysis.ts`
  - `src/lib/workflows/promise/market-analysis-normalization.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-market-analysis-normalization.test.ts tests/promise-market-analysis-grounding.test.ts tests/promise-market-analysis-fallback.test.ts tests/promise-market-analysis-report.test.ts tests/promise-market-analysis-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `maybeGenerateMarketReport` now lives in `promise/market-analysis.ts` and `promise.ts` imports that moved implementation for graph execution. The public Promise facade still exports market generation through the market-analysis capability module. `maybeGenerateRecommendations` remains temporarily available from the same capability module through a lazy handoff until its own extraction package moves it, avoiding a static circular import.
- Risks discovered: Recommendations support and generation still live in `promise.ts`; they remain in 8.2b4d4 and 8.2b4d5.
- Blocker or next package: Next package is 8.2b4d4 Promise recommendation generation support.

### 2026-07-13 15:00 — Package 8.2b4d4

- Status: completed
- Objective: Move recommendations fallback, grounding, schema, and normalization helpers out of the Promise monolith and behind the Promise market-analysis capability area with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/market-recommendations-support.ts`
  - `tests/promise-market-recommendations-support.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-market-recommendations-support.test.ts tests/promise-market-analysis-normalization.test.ts tests/promise-market-analysis-grounding.test.ts tests/promise-market-analysis-fallback.test.ts tests/promise-market-analysis-report.test.ts tests/promise-market-analysis-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `PositioningRecommendationsSchema`, recommendations fallback construction, recommendations grounding context assembly, and recommendations artifact normalization now live in `promise/market-recommendations-support.ts`. `promise.ts` imports those helpers for existing graph execution, preserving generated/fallback metadata stamping, enum coercion, persona strategy defaults, market-summary grounding, and workspace parsing behavior.
- Risks discovered: The live `maybeGenerateRecommendations` function still lives in `promise.ts`; it remains in 8.2b4d5. The fallback helper itself returns the strategy body while callers continue to stamp metadata, matching the existing boundary.
- Blocker or next package: Next package is 8.2b4d5 Promise recommendations generation move.

### 2026-07-13 15:04 — Package 8.2b4d5

- Status: completed
- Objective: Move `maybeGenerateRecommendations` out of the Promise monolith and behind the Promise market-analysis module while preserving gateway attribution, fallback behavior, grounding, parsing, and usage metadata handling.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/market-analysis.ts`
  - `src/lib/workflows/promise/market-recommendations-support.ts`
  - `tests/promise-market-recommendations-support.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-market-recommendations-support.test.ts tests/promise-market-analysis-normalization.test.ts tests/promise-market-analysis-grounding.test.ts tests/promise-market-analysis-fallback.test.ts tests/promise-market-analysis-report.test.ts tests/promise-market-analysis-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `maybeGenerateRecommendations` now lives in `promise/market-analysis.ts` beside market report generation. `promise.ts` imports the moved implementation for graph execution, while `promise-public.ts` continues exporting the function from the market-analysis capability module. The move preserves the market-analysis gateway role, no-model fallback, source-document grounding lookup, response JSON extraction, normalized metadata stamping, and error logging.
- Risks discovered: Market-analysis still contains temporary compatibility boundaries: `promise.ts` imports market-analysis implementations and the parent package still needs 8.2b4d6 facade cleanup to remove remaining shims/import shape left from the staged extraction.
- Blocker or next package: Next package is 8.2b4d6 Promise market-analysis facade cleanup.

### 2026-07-13 15:07 — Package 8.2b4d6

- Status: completed
- Objective: Remove temporary market-analysis re-export/import shims once market and recommendation generation are owned by the market-analysis module.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `rg -n "lazy|handoff|await import\\(\\\"\\.\\./promise\\\"\\)|maybeGenerateRecommendations\\(|maybeGenerateMarketReport\\(|createFallbackMarketReportFromModule|normalizeMarketReport|market-recommendations-support|market-analysis" src/lib/workflows/promise.ts src/lib/workflows/promise/market-analysis.ts src/lib/workflows/promise-public.ts`
  - `npx tsx --test tests/promise-market-recommendations-support.test.ts tests/promise-market-analysis-normalization.test.ts tests/promise-market-analysis-grounding.test.ts tests/promise-market-analysis-fallback.test.ts tests/promise-market-analysis-report.test.ts tests/promise-market-analysis-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Inspection found the temporary lazy recommendations handoff removed from `promise/market-analysis.ts`; market and recommendations generation are both owned directly by the market-analysis module. Remaining `promise.ts` imports are real graph/workspace parsing dependencies, not temporary re-export shims. Parent package 8.2b4d is complete.
- Risks discovered: `promise.ts` still uses market/recommendation support helpers for title finalization, Book Promise report composition, and workspace parsing; those should move with later title/report/workspace extraction packages rather than this facade cleanup.
- Blocker or next package: Next package is 8.2b4e Promise truth/transformation generation.

### 2026-07-13 15:10 — Package 8.2b4e split

- Status: split only
- Objective: Evaluate whether Promise truth/transformation generation can move safely as one package.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `rg -n "maybeGenerateCoreTruths|maybeGenerateTransformationArc|buildCoreTruthsGroundingContext|buildTransformationGroundingContext|fallbackCoreTruths|fallbackTransformation|normalizeCoreTruthsArtifact|normalizeTransformationArtifact|CoreTruthsArtifactSchema|TransformationArtifactSchema" src/lib/workflows/promise.ts src/lib/workflows/promise -g '*.ts'`
  - `npm run check`
- Live provider spend: none
- Behavioral result: No code movement. The original 8.2b4e package spans Core Truths schema/fallback/normalization/generation and Transformation schema/fallback/normalization/generation, so it was split into 8.2b4e1 through 8.2b4e5 before editing code.
- Risks discovered: Moving truth and transformation generation together would create a broad review surface and likely repeat the market/recommendation extraction risk pattern. Start with Core Truths support helpers first.
- Blocker or next package: Next package is 8.2b4e1 Promise Core Truths support move.

### 2026-07-13 15:16 — Package 8.2b4e1

- Status: completed
- Objective: Move Core Truths schema, fallback, grounding, and normalization helpers behind the Promise generation module area with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-core-truths-support.ts`
  - `tests/promise-core-truths-support.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-core-truths-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `CoreTruthsArtifactSchema`, `buildTruthGroundingContext`, `createFallbackCoreTruthArtifact`, and `normalizeCoreTruthsArtifact` now live in `promise/generation-core-truths-support.ts`. `promise.ts` imports those helpers for the existing generator and workspace parsing paths, preserving fallback artifact content, legacy truth normalization, strict schema parsing, persona voice coercion, and compact truth grounding payloads.
- Risks discovered: `maybeGenerateCoreTruths` still lives in `promise.ts`; it remains in 8.2b4e2. The new support module intentionally duplicates small local coercion/defaulting helpers instead of exporting additional private monolith helpers.
- Blocker or next package: Next package is 8.2b4e2 Promise Core Truths generation move.

### 2026-07-13 15:21 — Package 8.2b4e2

- Status: completed
- Objective: Move `maybeGenerateCoreTruths` behind the Promise generation module while preserving gateway attribution, fallback behavior, grounding, parsing, and usage metadata handling.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation.ts`
  - `src/lib/workflows/promise/generation-core-truths.ts`
  - `src/lib/workflows/promise/generation-core-truths-support.ts`
  - `tests/promise-core-truths-support.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-core-truths-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `maybeGenerateCoreTruths` now lives in `promise/generation-core-truths.ts`, and `promise/generation.ts` exports that implementation instead of re-exporting it from the monolith. `promise.ts` imports the moved implementation for graph execution. The move preserves the `promise:author` gateway role, no-model fallback, knowledge-grounding lookup, response JSON extraction, normalized metadata stamping, and existing error logging.
- Risks discovered: Transformation support and generation still live in `promise.ts`; they remain in 8.2b4e3 and 8.2b4e4. `promise/generation.ts` still re-exports other generation functions from the monolith until their packages move.
- Blocker or next package: Next package is 8.2b4e3 Promise Transformation support move.

### 2026-07-13 15:27 — Package 8.2b4e3

- Status: completed
- Objective: Move Transformation schema, fallback, and normalization helpers behind the Promise generation module area with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-transformation-support.ts`
  - `tests/promise-transformation-support.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-transformation-support.test.ts tests/promise-core-truths-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `TransformationArtifactSchema`, `createFallbackTransformationArtifact`, and `normalizeTransformationArtifact` now live in `promise/generation-transformation-support.ts`. `promise.ts` imports those helpers for the existing transformation generator and workspace parsing paths, preserving fallback arc content, flat-or-nested arc normalization, persona voice coercion, metadata defaulting, and strict schema parsing.
- Risks discovered: `maybeGenerateTransformationArc` still lives in `promise.ts`; it remains in 8.2b4e4. The new support module intentionally duplicates small local coercion/defaulting helpers instead of exporting additional private monolith helpers.
- Blocker or next package: Next package is 8.2b4e4 Promise Transformation generation move.

### 2026-07-13 15:34 — Package 8.2b4e4

- Status: completed
- Objective: Move `maybeGenerateTransformationArc` behind the Promise generation module while preserving gateway attribution, fallback behavior, knowledge context, parsing, and usage metadata handling.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation.ts`
  - `src/lib/workflows/promise/generation-transformation.ts`
  - `src/lib/workflows/promise/generation-transformation-support.ts`
  - `tests/promise-transformation-support.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-transformation-support.test.ts tests/promise-core-truths-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `maybeGenerateTransformationArc` now lives in `promise/generation-transformation.ts`, and `promise/generation.ts` exports that implementation instead of re-exporting it from the monolith. `promise.ts` imports the moved implementation for graph execution. The move preserves the `promise:author` gateway role via the Promise generation model helper, no-model fallback, knowledge-context lookup, response JSON extraction, normalized metadata stamping, and JsonExtractionError logging.
- Risks discovered: `promise/generation.ts` still re-exports non-truth/transformation generation functions from the monolith; 8.2b4e5 should only clean truth/transformation shims and leave unrelated generation re-exports for their own packages.
- Blocker or next package: Next package is 8.2b4e5 Promise truth/transformation facade cleanup.

### 2026-07-13 15:38 — Package 8.2b4e5

- Status: completed
- Objective: Remove temporary truth/transformation re-export/import shims once Core Truths and Transformation generation are owned by the generation module.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `rg -n "maybeGenerateCoreTruths|maybeGenerateTransformationArc|generation-core-truths|generation-transformation|CoreTruthsArtifactSchema|TransformationArtifactSchema|createFallbackCoreTruthArtifact|createFallbackTransformationArtifact|normalizeCoreTruthsArtifact|normalizeTransformationArtifact|CORE_TRUTHS_SYSTEM_PROMPT|TRANSFORMATION_ARC_SYSTEM_PROMPT" src/lib/workflows/promise.ts src/lib/workflows/promise/generation.ts src/lib/workflows/promise/generation-core-truths.ts src/lib/workflows/promise/generation-transformation.ts src/lib/workflows/promise/generation-core-truths-support.ts src/lib/workflows/promise/generation-transformation-support.ts`
  - `npx tsx --test tests/promise-transformation-support.test.ts tests/promise-core-truths-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Inspection found no temporary lazy handoff for Core Truths or Transformation generation. `promise/generation.ts` exports the moved implementations directly from `generation-core-truths.ts` and `generation-transformation.ts`. Remaining `promise.ts` imports are real graph execution and workspace parsing dependencies, not temporary facade shims. Parent package 8.2b4e is complete.
- Risks discovered: `promise/generation.ts` still re-exports other generation functions from the monolith; those are unrelated to truth/transformation cleanup and remain for later extraction packages.
- Blocker or next package: Next package is 8.2b4f Promise graph runtime handoff.

### 2026-07-13 15:41 — Package 8.2b4f split

- Status: split only
- Objective: Evaluate whether Promise graph runtime handoff can move safely as one package.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `rg -n "8\\.2b4f|graph runtime handoff|StateGraph|WorkflowState|loadContextNode|appendUserMessageNode|generatePromiseReplyNode|extractPromiseNode|scorePromiseNode|personaNode|marketNode|recommendationsNode|persistNode|runPromiseWorkflow" docs/GHOSTWRITR-STABILIZATION-EXECUTION.md src/lib/workflows/promise.ts src/lib/workflows/promise -g '*.ts'`
  - `npm run check`
- Live provider spend: none
- Behavioral result: No code movement. The original 8.2b4f package spans LangGraph state, context/message nodes, artifact generation nodes, persistence, compiled graph wiring, public facade routing, and cleanup, so it was split into 8.2b4f1 through 8.2b4f6 before editing code.
- Risks discovered: Moving the compiled graph and persistence in one package would create a high-risk circular-import and artifact-write review surface. Start with graph state and pure node-support boundaries first.
- Blocker or next package: Next package is 8.2b4f1 Promise graph state and node support split.

### 2026-07-13 15:44 — Package 8.2b4f1

- Status: completed
- Objective: Move Promise graph runtime state and pure node-support helpers behind the generation runtime module without moving graph execution, DB context loading, or persistence.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-runtime-state.ts`
  - `tests/promise-generation-runtime-state.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-runtime-state.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `PromiseWorkflowState`, `WorkflowState`, `parseArtifactJson`, and `normalizeBookSetupProfile` now live in `promise/generation-runtime-state.ts`. The Promise monolith imports those runtime primitives while still owning all graph nodes and persistence for later subpackages.
- Risks discovered: `BookSetupProfile` has an older duplicate normalization helper in `book-setup-types.ts`; this package intentionally preserved the Promise runtime helper boundary and did not consolidate cross-domain helpers.
- Blocker or next package: Next package is 8.2b4f2 Promise graph context and message nodes move.

### 2026-07-13 15:52 — Package 8.2b4f2

- Status: completed
- Objective: Move Promise graph context loading, user-message append, and assistant-reply node bodies behind the generation runtime module while keeping DB/LLM dependencies injected from the monolith.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-runtime-nodes.ts`
  - `tests/promise-generation-runtime-nodes.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-runtime-state.test.ts tests/promise-generation-runtime-nodes.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Context loading, author message append, and assistant reply graph nodes now live in `promise/generation-runtime-nodes.ts`. The Promise monolith still supplies repository and LLM helper dependencies, which keeps this package free of circular imports and preserves later artifact/persistence moves.
- Risks discovered: The assistant reply node still depends on monolith-owned `maybeGenerateAssistantReplyWithSetup`; moving that helper would affect several non-node Promise generation functions, so it was intentionally left for a later generation/runtime cleanup instead of expanding this package.
- Blocker or next package: Next package is 8.2b4f3 Promise graph artifact generation nodes move.

### 2026-07-13 15:58 — Package 8.2b4f3

- Status: completed
- Objective: Move Promise graph artifact-generation node wrappers behind the generation runtime module while preserving existing generation-function ownership and avoiding live provider calls in tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-runtime-nodes.ts`
  - `tests/promise-generation-runtime-nodes.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-runtime-state.test.ts tests/promise-generation-runtime-nodes.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Extraction, scorecard, persona, market report, and positioning recommendation graph nodes now live in `promise/generation-runtime-nodes.ts` as dependency-injected factories. The Promise monolith still owns the underlying generation functions and wires them into the graph, preserving attribution/fallback behavior while shrinking the graph runtime surface.
- Risks discovered: Existing structured-output functions infer slightly looser Zod output types than the app's domain types, so the runtime node boundary performs explicit domain casts after delegated generation. This mirrors the previous monolith behavior and should be revisited only if the schemas/domain types are normalized later.
- Blocker or next package: Next package is 8.2b4f4 Promise graph persistence node move.

### 2026-07-13 16:04 — Package 8.2b4f4

- Status: completed
- Objective: Move Promise graph persistence node behind the generation runtime module with focused artifact-shape tests and no database writes during verification.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-runtime-nodes.ts`
  - `tests/promise-generation-runtime-nodes.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-runtime-state.test.ts tests/promise-generation-runtime-nodes.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Promise chat, brief, scorecard, persona, market, recommendations, and direction-event persistence now live in `promise/generation-runtime-nodes.ts` as an injected persistence node. Tests cover no-book-id short-circuiting and the exact artifact types/content summaries/direction metadata emitted by a full state.
- Risks discovered: Repository write functions still require Prisma-specific input types, so `promise.ts` uses narrow injection wrappers to preserve the existing write contracts while allowing the runtime module to stay persistence-implementation agnostic.
- Blocker or next package: Next package is 8.2b4f5 Promise run workflow move.

### 2026-07-13 16:11 — Package 8.2b4f5

- Status: completed
- Objective: Move compiled Promise LangGraph construction and `runPromiseWorkflow` runner creation behind the generation runtime module without creating circular imports.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-runtime.ts`
  - `tests/promise-generation-runtime.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-runtime-state.test.ts tests/promise-generation-runtime-nodes.test.ts tests/promise-generation-runtime.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `StateGraph` construction and seeded workflow invocation now live in `promise/generation-runtime.ts` through `createPromiseWorkflowRunner`. `promise.ts` injects the already-extracted graph nodes and exports the resulting `runPromiseWorkflow`, preserving the public facade while removing LangGraph construction from the monolith.
- Risks discovered: The runtime module cannot directly import monolith-owned generation/repository functions without a circular import, so the dependency-injected runner is the safe boundary until the remaining Promise generation functions move.
- Blocker or next package: Next package is 8.2b4f6 Promise graph facade cleanup.

### 2026-07-13 16:14 — Package 8.2b4f6

- Status: completed
- Objective: Verify and clean up remaining temporary Promise graph-runtime imports or re-exports after `runPromiseWorkflow` moved behind the generation runtime module.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `rg -n "StateGraph|START|END|promiseGraph|WorkflowState" src/lib/workflows/promise.ts src/lib/workflows/promise/*.ts tests/promise-generation-runtime*.test.ts`
  - `npx tsx --test tests/promise-generation-runtime-state.test.ts tests/promise-generation-runtime-nodes.test.ts tests/promise-generation-runtime.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Cleanup inspection found no remaining LangGraph construction or temporary graph shim in `promise.ts`; graph state, nodes, compiled graph construction, and runner creation are now owned by the Promise generation runtime modules. Parent package 8.2b4f is complete.
- Risks discovered: `promise/generation.ts` still exposes `runPromiseWorkflow` through the monolith because node dependency wiring still lives in `promise.ts`; changing that would require moving remaining generation/repository dependencies and belongs to later Promise split work, not graph facade cleanup.
- Blocker or next package: Next unchecked package is 8.2c2 Research workspace extraction; 8.2c4 remains dependent on later execution/job extraction scope.

### 2026-07-13 00:10 — Package 1.2b3c1

- Status: completed
- Objective: Migrate chat persistence endpoints to authenticated, ownership-aware book resolution before reading or writing chat history, dossiers, draft saves, dossier saves, editing artifacts, or the main agent-chat stream context.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/agent-chat/route.ts`
  - `src/app/api/books/[slug]/agent-chat/history/route.ts`
  - `src/app/api/books/[slug]/agent-chat/dossiers/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-draft/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-dossier/route.ts`
  - `src/app/api/books/[slug]/agent-chat/editing/route.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/auth-shared.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The main agent chat endpoint and chat persistence routes now require the authenticated app user and resolve the book through ownership-aware helpers before accessing stage metadata or artifacts. The remaining direct slug-only lookups under `agent-chat` are isolated to the chapter-draft generation route, which belongs to package 1.2b3c2.
- Risks discovered: `agent-chat/chapter-draft/route.ts` still has three slug-only book lookups and remains unchecked until the chapter generation package is completed.
- Blocker or next package: Next package is 1.2b3c2 Chapter generation APIs.

### 2026-07-13 00:11 — Package 1.2b3c2

- Status: completed
- Objective: Migrate chapter drafting, Scout research, Chronicle stories, and their save-chapter APIs to ownership-aware book resolution.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/route.ts`
  - `src/app/api/books/[slug]/scout-research/route.ts`
  - `src/app/api/books/[slug]/scout-research/save-chapter/route.ts`
  - `src/app/api/books/[slug]/chronicle-stories/route.ts`
  - `src/app/api/books/[slug]/chronicle-stories/save-chapter/route.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/auth-shared.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Chapter draft, research, and external-story generation/save routes now require the authenticated app user and use ownership-aware book resolution before reading or mutating chapter artifacts. Static checks confirm the package scope no longer contains direct slug-only book lookups.
- Risks discovered: The streaming Scout and Chronicle routes still perform live web/model operations when invoked by the app; this heartbeat did not call them and therefore spent no provider money.
- Blocker or next package: Next package is 1.2c Internal boundaries.

### 2026-07-13 00:14 — Package 1.2c

- Status: completed
- Objective: Separate internal workflow-worker authentication from JARVIS internal API authentication and make both fail closed when secrets are missing.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/auth/shared.ts`
  - `src/app/api/internal/workflow-runs/process/route.ts`
  - `src/app/api/internal/jarvis/route.ts`
  - `tests/auth-shared.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/auth-shared.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The workflow processor now requires `INTERNAL_WORKFLOW_TOKEN` via `x-internal-workflow-token` or Bearer auth and returns 503 instead of failing open if the secret is absent. The JARVIS internal API now requires a separate `GHOSTWRITR_JARVIS_INTERNAL_TOKEN` via `x-ghostwritr-jarvis-token` or Bearer auth and also fails closed if unconfigured.
- Risks discovered: Any local JARVIS integration or background workflow processing environment without these tokens configured will now be blocked until the appropriate secrets are added.
- Blocker or next package: Next package is 1.3 Destructive administration.

### 2026-07-13 00:16 — Package 1.3

- Status: completed
- Objective: Remove the destructive public deduplication behavior and hard-coded fallback secret, replacing it with a dry-run-first maintenance command that preserves artifact history.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/admin/dedup-artifacts/route.ts`
  - `scripts/dedup-artifacts.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx scripts/dedup-artifacts.ts --slug __ghostwritr_nonexistent_verification__`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The admin URL is now a non-destructive `410 Gone` tombstone with no secret handling and no cleanup execution. The CLI maintenance command is dry-run by default, requires `--apply --confirm-supersede` for changes, marks safe duplicate artifacts `SUPERSEDED` instead of deleting them, skips artifacts whose versions are referenced by the stage, and never deletes artifact versions.
- Risks discovered: The maintenance command still mutates artifact status if run with both explicit apply flags; use dry-run output review before authorizing any real cleanup.
- Blocker or next package: Next package is 1.4 Request and upload limits.

### 2026-07-13 00:24 — Package 1.4

- Status: completed
- Objective: Add centralized request body, chat, upload, archive, file-count, rate, and per-book concurrency limits to reduce runaway token spend, large uploads, and duplicate concurrent generation work.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/request-limits.ts`
  - `tests/request-limits.test.ts`
  - `src/app/api/books/[slug]/agent-chat/route.ts`
  - `src/app/api/books/[slug]/agent-chat/history/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-draft/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-dossier/route.ts`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/route.ts`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/approve-all/route.ts`
  - `src/app/api/books/[slug]/agent-chat/editing/route.ts`
  - `src/app/api/books/[slug]/agent-chat/approve/route.ts`
  - `src/app/api/books/[slug]/agent-chat/commit/route.ts`
  - `src/app/api/books/[slug]/agent-chat/commit-stage/route.ts`
  - `src/app/api/books/[slug]/scout-research/route.ts`
  - `src/app/api/books/[slug]/scout-research/save-chapter/route.ts`
  - `src/app/api/books/[slug]/chronicle-stories/route.ts`
  - `src/app/api/books/[slug]/chronicle-stories/save-chapter/route.ts`
  - `src/app/api/books/[slug]/workbook-design/route.ts`
  - `src/app/api/books/[slug]/source-docs/route.ts`
  - `src/app/api/books/import-archive/route.ts`
  - `src/app/api/personas/[personaId]/samples/route.ts`
  - `src/app/api/books/[slug]/route.ts`
  - `src/app/api/books/[slug]/author/route.ts`
  - `src/app/api/books/[slug]/craft-notes/route.ts`
  - `src/app/api/internal/jarvis/route.ts`
  - `src/app/api/internal/workflow-runs/process/route.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/request-limits.test.ts`
  - `npx tsx --test tests/auth-shared.test.ts`
  - `npm run check`
  - `rg "await req\\.json\\(|await request\\.json\\(" src/app/api -g 'route.ts'`
- Live provider spend: none
- Behavioral result: API JSON parsing is centralized through `parseLimitedJson`; no raw `req.json()` or `request.json()` calls remain in API route handlers. Chat/model-entry routes now enforce chat body limits, message limits, rate limits, and per-book concurrent generation caps before LLM or web-search work begins. Source document uploads, persona sample uploads, and archive imports now enforce centralized file-size, aggregate request-size, archive-size, and file-count limits.
- Risks discovered: Rate and concurrency limits are in-memory process-local controls, so they protect this local/single-process app but are not a distributed production limiter. Package 3.1 durable jobs and later production hardening should move these controls to the database or a shared store.
- Blocker or next package: Next package is 1.5 Dependency security.

### 2026-07-13 00:28 — Package 1.5

- Status: completed
- Objective: Upgrade the smallest safe production dependency set needed to address known advisories, then verify with production audit, typecheck, targeted tests, and a milestone build.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `package.json`
  - `package-lock.json`
- Schema or migration changes: none
- Tests run:
  - `npm audit --omit=dev`
  - `npm ls @xmldom/xmldom langsmith uuid postcss next --omit=dev`
  - `npx tsx --test tests/request-limits.test.ts tests/auth-shared.test.ts`
  - `npm run check`
  - `npm run build`
- Live provider spend: none
- Behavioral result: Production audit now reports `found 0 vulnerabilities`. Direct dependencies were updated without `--force`, and explicit npm overrides lift vulnerable transitive packages to `@xmldom/xmldom@0.9.10`, `langsmith@0.8.1`, and `postcss@8.5.18`. Next.js builds successfully at `16.2.10`.
- Risks discovered: Build emits a Next.js deprecation warning that the `middleware` file convention should move to `proxy`; this is not a build failure but should be handled in a later compatibility cleanup.
- Blocker or next package: Milestone 1 is complete. Next package is 2.1 Central LLM gateway.

### 2026-07-13 00:31 — Package 2.1

- Status: completed
- Objective: Create a central server-side LLM gateway that owns request IDs, attribution requirements, model acquisition defaults, timeout/retry/output-token policies, in-process model caching, budget checks, usage/cost recording, and structured-output validation.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/llm/gateway.ts`
  - `src/lib/llm/routing.ts`
  - `tests/llm-gateway.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/llm-gateway.test.ts tests/request-limits.test.ts tests/auth-shared.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `getModelForRole()` now acquires models through the gateway, so role-based callers inherit centralized timeout, retry, max-output-token, reasoning-effort, request-id, attribution, model-cache, and budget policy defaults. The gateway exposes non-spending helpers for request cost estimates, hard-stop checks, structured-output validation, and usage recording. Direct provider calls are intentionally not migrated in this package; that work remains in 2.2.
- Risks discovered: Gateway model caching is process-local and provider-call migration is incomplete until 2.2. Existing manual cost logging routes still need migration to avoid duplicate or missing attribution paths.
- Blocker or next package: Next package is 2.2 Migrate model calls.

### 2026-07-13 00:34 — Package 2.2a

- Status: completed
- Objective: Remove direct OpenAI/Gemini model construction from validation utilities and route validation text calls through the LLM gateway.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/validation/validation-llm.ts`
  - `src/lib/validation/simple-refinement.ts`
  - `src/lib/validation/auto-optimize.ts`
  - `src/lib/validation/intelligent-gap-filler.ts`
  - `src/lib/validation/gemini-market-research.ts`
- Schema or migration changes: none
- Tests run:
  - `rg "ChatOpenAI|GoogleGenerativeAI|fetch\\(\\\"https://api\\.openai|OPENAI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|GOOGLE_API_KEY|generateContent|getGenerativeModel|new Chat" src/lib/validation -n`
  - `npx tsx --test tests/llm-gateway.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Validation utilities now call `invokeValidationText()`, which acquires models through the central LLM gateway with attribution, request policy, no direct provider construction, and no direct provider API-key reads in `src/lib/validation`.
- Risks discovered: These validation helpers are still legacy prompt/parse utilities. They now use the gateway boundary, but their parsing behavior and fallback quality are unchanged until later product-flow cleanup.
- Blocker or next package: Next package is 2.2b Interactive API model calls.

### 2026-07-13 00:38 — Package 2.2b1

- Status: completed
- Objective: Route the interactive streaming model calls through the central LLM gateway and remove route-local provider/model cost attribution.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/llm/routing.ts`
  - `src/app/api/books/[slug]/agent-chat/route.ts`
  - `src/app/api/books/[slug]/scout-research/route.ts`
  - `src/app/api/books/[slug]/chronicle-stories/route.ts`
  - `src/app/api/books/[slug]/workbook-design/route.ts`
- Schema or migration changes: none
- Tests run:
  - `rg "getModelForRole|resolveModelSpec|parseModelSpec|logLLMCall" src/app/api/books/[slug]/agent-chat/route.ts src/app/api/books/[slug]/scout-research/route.ts src/app/api/books/[slug]/chronicle-stories/route.ts src/app/api/books/[slug]/workbook-design/route.ts -n`
  - `npx tsx --test tests/llm-gateway.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Agent chat, Scout, Chronicle, and workbook enrichment now acquire models through `acquireLLMCallForRole()` with book/stage/chapter/operation attribution. Streaming token usage is recorded through the gateway call object instead of direct route-local `logLLMCall()` calls. Workbook enrichment now captures usage metadata when providers return it.
- Risks discovered: Manifest, bibliography, and other workflow-adjacent API helpers still need migration before parent package 2.2b can be marked complete.
- Blocker or next package: Next package is 2.2b2 Workflow-adjacent API helpers.

### 2026-07-13 00:40 — Package 2.2b2

- Status: completed
- Objective: Route manifest and bibliography workflow-adjacent API model calls through the central LLM gateway with explicit attribution and gateway usage logging.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/manifest/route.ts`
  - `src/lib/workflows/manifest-generator.ts`
  - `src/lib/workflows/bibliography-generator.ts`
- Schema or migration changes: none
- Tests run:
  - `rg "getModelForRole|runWithLLMContext|resolveModelSpec|parseModelSpec|logLLMCall" src/lib/workflows/manifest-generator.ts src/lib/workflows/bibliography-generator.ts src/app/api/books/[slug]/manifest/route.ts -n`
  - `npx tsx --test tests/llm-gateway.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Manifest generation now acquires its primary Haiku model and `press:kit` fallback through `acquireLLMCallForRole()` with book, stage, operation, slug, and title attribution, then records streamed token usage through the gateway. The manifest route no longer relies on ambient `runWithLLMContext()` for cost accounting. Bibliography generation now also acquires and logs through the gateway with TYPESET-stage attribution.
- Risks discovered: Existing manifest regeneration still deletes prior manifest artifacts before generation when the endpoint is invoked. This heartbeat did not invoke the route or delete data, but the behavior remains a future data-integrity target for the artifact-service packages.
- Blocker or next package: Parent package 2.2b is complete. Next package is 2.2c Workflow model calls.

### 2026-07-13 00:50 — Package 2.2c1

- Status: completed
- Objective: Make workflow model acquisition carry ambient workflow attribution into the central LLM gateway without changing workflow semantics or invoking live providers.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/llm/routing.ts`
  - `tests/llm-gateway.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/llm-gateway.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `getModelForRole()` now builds gateway attribution from `runWithLLMContext()` when present, including book id, slug, title, stage key, workflow run id, and chapter key. Long-running workflow callers that already run inside the workflow context now acquire models with book-aware budget checks and workflow attribution instead of anonymous `role-model-acquisition` metadata.
- Risks discovered: This is the workflow attribution foundation, not the full workflow cleanup. Several workflow files still need explicit caller review in 2.2c2, and raw SDK/direct-constructor cleanup remains in 2.2d.
- Blocker or next package: Next package is 2.2c2 Workflow caller cleanup.

### 2026-07-13 01:01 — Package 2.2c2

- Status: completed
- Objective: Clean up remaining long-running workflow model caller seams so workflow artifacts and structured-output calls use routed model identities rather than stale direct-provider imports or OpenAI-key guesses.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/base-story.ts`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/personal-stories.ts`
  - `src/lib/workflows/promise.ts`
- Schema or migration changes: none
- Tests run:
  - `rg "import \\{ ChatOpenAI \\}|new ChatOpenAI|OPENAI_PERSONAL_STORIES_MODEL|OPENAI_CHAPTER_DRAFT|hasUsableOpenAIKey\\(" src/lib/workflows/base-story.ts src/lib/workflows/chapter-draft.ts src/lib/workflows/personal-stories.ts src/lib/workflows/promise.ts`
  - `npx tsx --test tests/llm-gateway.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Base Story, Chapter Draft, Personal Stories, and Promise no longer import unused `ChatOpenAI` constructors. Chapter Draft and Personal Stories artifact metadata now records the routed role model via `resolveModelSpec()` instead of checking `OPENAI_API_KEY` and writing stale `gpt-5.4` or local fallback labels. Parent package 2.2c is complete because long-running workflow `getModelForRole()` callers now inherit gateway attribution from 2.2c1 and no longer carry these stale direct-provider caller seams.
- Risks discovered: Promise still contains Gemini raw SDK construction for market report and recommendations, and document extraction still contains direct Anthropic PDF vision logic. Those are intentionally left for 2.2d Document extraction and raw SDK clients.
- Blocker or next package: Next package is 2.2d Document extraction and raw SDK clients.

### 2026-07-13 01:12 — Package 2.2d

- Status: completed
- Objective: Remove remaining direct raw provider SDK calls from Promise market/recommendation generation and PDF vision document extraction, routing them through the LLM gateway boundary or local no-spend extraction.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/llm/routing.ts`
  - `src/lib/workflows/promise.ts`
  - `src/lib/services/document-extractor.ts`
- Schema or migration changes: none
- Tests run:
  - `rg "GoogleGenerativeAI|getGenerativeModel|generateContent|@anthropic-ai/sdk|new Anthropic|ChatOpenAI|ChatAnthropic|new OpenAI|fetch\\(\\\"https://api\\.openai|api\\.anthropic" src/lib src/app/api -g '*.ts' -g '*.tsx' -g '!src/lib/llm/providers.ts'`
  - `npx tsx --test tests/llm-gateway.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Promise market report and positioning recommendations now use `getModelForRole("market-analysis:research")` instead of direct Gemini SDK construction. PDF vision extraction now uses a routed `document:extract` role through `acquireLLMCallForRole()` and records returned token usage through the gateway; text-only PDF, DOCX, PPTX, text, JSON, and unknown-file fallback extraction remain local/no-spend paths. No direct raw provider constructors remain outside `src/lib/llm/providers.ts`.
- Risks discovered: Promise still has a legacy `.env` loading shim that reads provider key names into `process.env`; it no longer constructs raw provider clients in this package, but that shim should be revisited when startup/env handling is simplified. Native PDF document blocks now pass through LangChain's Anthropic chat model rather than the raw SDK; this typechecks but should be covered by future fake/recorded workflow simulation before relying on live extraction behavior.
- Blocker or next package: Next package is 2.2e Attribution enforcement.

### 2026-07-13 01:22 — Package 2.2e

- Status: completed
- Objective: Add static attribution guardrails that fail if new direct provider SDK construction, raw model factories, cost logging, or unattributed gateway acquisition paths are introduced outside approved gateway boundaries.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `tests/llm-attribution-enforcement.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/llm-attribution-enforcement.test.ts`
  - `npx tsx --test tests/llm-attribution-enforcement.test.ts tests/llm-gateway.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Static regression coverage now fails when provider SDK imports/constructors/API fetches appear outside `src/lib/llm/providers.ts`, when raw `getModel()` or `logLLMCall()` calls appear outside gateway/provider internals, or when direct `acquireLLMGatewayCall()` usage appears outside the gateway, role-routing layer, or the validation helper boundary.
- Risks discovered: These regex-based guardrails are conservative static checks. They prevent the most expensive regressions and complement runtime gateway tests, but full proof that every workflow records complete usage still belongs to later fake-provider workflow simulations and canonical cost-ledger work.
- Blocker or next package: Parent package 2.2 is complete. Next package is 2.3 Canonical cost ledger.

### 2026-07-13 01:29 — Package 2.3

- Status: completed
- Objective: Extend the LLM cost ledger so each recorded attempt can carry canonical attribution, operation, request, status, error, token-breakdown, pricing-version, generation-mode, and search-cost fields instead of only role/model/token totals.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `prisma/schema.prisma`
  - `prisma/migrations/20260713052900_canonical_llm_cost_ledger/migration.sql`
  - `src/lib/llm/call-log.ts`
  - `src/lib/llm/gateway.ts`
  - `src/lib/llm/providers.ts`
  - `tests/llm-cost-ledger.test.ts`
- Schema or migration changes: Added additive `LLMCallLog` columns plus a migration file for request/provider request IDs, stage key, operation, attempt, generation mode, status, error details, reasoning tokens, search cost, and pricing version. Ran `npm run db:generate`; did not run `db:push`, `db:migrate:*`, or apply the migration to any database.
- Tests run:
  - `npm run db:generate`
  - `npx tsx --test tests/llm-cost-ledger.test.ts tests/llm-gateway.test.ts tests/llm-attribution-enforcement.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Gateway-recorded usage now writes canonical success rows with request ID, stage, operation, attempt, generation mode, cached token details, reasoning token fields, search cost, pricing version, and status. The gateway call object can also record failed and canceled attempts with zero-or-known token usage plus error code/message. Ambient provider callback logging now includes operation/generation/status fields. JSONL audit entries include the same canonical fields as the database-backed ledger path.
- Risks discovered: The migration file was created but intentionally not applied; any runtime database must apply this additive migration before code that writes the new fields can persist cost rows. Failed/canceled attempt support now exists at the gateway boundary, but individual streaming/workflow callers still need broader fake-provider simulations in later verification packages to prove every catch/cancel path records failures.
- Blocker or next package: Next package is 2.4 Cost UI.

### 2026-07-13 01:36 — Package 2.4

- Status: completed
- Objective: Rebuild cost reporting from canonical ledger events instead of hard-coded role-to-stage inference, and expose canonical aggregation through the usage API.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/llm-usage/route.ts`
  - `src/app/books/[slug]/cost-analysis/page.tsx`
  - `src/lib/llm/call-log.ts`
- Schema or migration changes: none beyond the 2.3 additive schema/migration file; no database migration was applied.
- Tests run:
  - `npx tsx --test tests/llm-cost-ledger.test.ts tests/llm-gateway.test.ts tests/llm-attribution-enforcement.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Cost API responses now include canonical ledger aggregation by recorded stage, role, operation, generation mode, and status. The Cost Analysis page now derives actual stage spend from recorded `stageKey` values rather than mapping stage roles back to stages, and its detailed actual-cost table shows stage, operation, status, generation mode, role, calls, tokens, search cost, and total cost. Overall totals come from all canonical ledger rows so unknown legacy rows do not vanish from accounting.
- Risks discovered: Historical rows without the new `stageKey` column will show as `(unknown-stage)` until backfilled or naturally replaced by new gateway rows. The page still includes forecast estimates based on static workflow assumptions; package 2.5 should replace that with budget/forecast controls.
- Blocker or next package: Next package is 2.5 Budgets and forecasts.

### 2026-07-13 01:42 — Package 2.5

- Status: blocked
- Objective: Add per-book warning, confirmation, and hard-stop budgets plus preflight cost estimates with suggested defaults of $10 warning, $20 confirmation, and $30 hard stop.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run: none for this blocked package
- Live provider spend: none
- Behavioral result: Package left unchecked. Existing gateway hard-stop support remains in place, but confirmation-threshold behavior was not changed.
- Risks discovered: The $20 confirmation budget is an ambiguous product decision. The implementation needs a chosen behavior for whether the app blocks generation, shows a confirmation modal, stores a per-book confirmation timestamp, requires a one-request override token, or only warns in the Cost UI. Implementing one silently could either block valid writing work or allow spend the author expected to approve explicitly.
- Blocker or next package: Needs user/product decision for confirmation-budget UX and state. Routed around to independent package 2.6 Retry policy.

### 2026-07-13 01:42 — Package 2.6

- Status: completed
- Objective: Eliminate nested retry multiplication by centralizing provider/workflow retry caps, and preserve the existing recovery behavior that avoids rerunning completed chapter work.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/retry-policy.ts`
  - `src/lib/llm/gateway.ts`
  - `src/lib/llm/providers.ts`
  - `src/lib/workflows/research.ts`
  - `tests/retry-policy.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/retry-policy.test.ts tests/llm-gateway.test.ts tests/llm-cost-ledger.test.ts tests/llm-attribution-enforcement.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Provider SDK retries now pass through `getProviderMaxRetries()` with a default of one retry and an absolute default cap of two. Gateway policy clamps requested `maxRetries` through the same central policy before model construction. Research chapter retry attempts now pass through `getWorkflowAttemptLimit()` with a default of one total attempt and a central `LLM_WORKFLOW_ATTEMPT_CAP`; existing explicit `RESEARCH_CHAPTER_RETRY_LIMIT=2` semantics still mean two total attempts. Stage recovery already selects failed/unfinished chapter keys from saved artifacts rather than blindly rerunning completed chapters, and this behavior was preserved.
- Risks discovered: This package reduces retry multiplication at the provider and research-loop seams, but other quality-improvement loops such as chapter draft revision passes are still content-quality loops rather than transport retries. Later workflow simulation packages should verify that those loops cannot restart completed chapters after process death.
- Blocker or next package: 2.5 remains blocked. Next independent package is 3.1 Durable jobs, but it is a major architecture/database package and should not start until the user accepts routing around the blocked 2.5 budget-confirmation decision.

### 2026-07-13 07:26 — Package 2.5

- Status: completed
- Objective: Implement the user-approved $20 LLM spend confirmation gate: block new generation when projected spend crosses $20, show confirmation, store per-book approval, and continue after approval.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/llm/budgets.ts`
  - `src/lib/llm/gateway.ts`
  - `src/lib/llm/gateway-http.ts`
  - `src/app/api/books/[slug]/llm-usage/route.ts`
  - `src/app/api/books/[slug]/llm-budget/confirm/route.ts`
  - `src/app/api/books/[slug]/agent-chat/route.ts`
  - `src/app/api/books/[slug]/scout-research/route.ts`
  - `src/app/api/books/[slug]/chronicle-stories/route.ts`
  - `src/app/books/[slug]/agent-chat-panel.tsx`
  - `src/app/books/[slug]/cost-pace-bar.tsx`
  - `tests/llm-budget.test.ts`
  - `tests/llm-gateway.test.ts`
- Schema or migration changes: none. The approval is temporarily stored under `Book.metadataJson.llmBudget` until package 3.2 moves budgets into typed operational state.
- Tests run:
  - `npx tsx --test tests/llm-budget.test.ts tests/llm-gateway.test.ts tests/llm-cost-ledger.test.ts tests/retry-policy.test.ts tests/llm-attribution-enforcement.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The LLM gateway now preflights projected request cost against per-book budgets before provider acquisition. Defaults are $10 warning, $20 confirmation, and $30 hard stop. If projected spend crosses $20 without book approval, gateway acquisition returns a structured 402 budget-confirmation response for the interactive generation routes and no provider call is made. The Book Studio cost panel displays warning/confirmation state and posts to an authenticated per-book confirmation endpoint; confirmation records `confirmedAt`, `confirmedBy`, and `confirmedThroughUsd` in book metadata, after which generation can continue until the hard stop. The cost usage endpoint now returns budget state alongside canonical ledger totals.
- Risks discovered: The preflight estimate uses the configured max output token ceiling plus known current spend; actual prompt tokens are only known after context assembly and provider usage reporting. This is intentionally conservative for output-heavy calls but not a complete forecast engine. Package 3.2 should move budget approval out of `metadataJson`, and package 9.1 should expand coverage around forecast accuracy and hard-stop edge cases.
- Blocker or next package: Milestone 2 is now complete. Next package is 3.1 Durable jobs.

### 2026-07-13 07:31 — Package 3.1

- Status: completed
- Objective: Replace detached workflow child processes with PostgreSQL-backed durable workflow jobs supporting leases, heartbeats, recovery, idempotency, cancellation metadata, bounded attempts, and concurrency-safe run ownership.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `prisma/schema.prisma`
  - `prisma/migrations/20260713073100_durable_workflow_jobs/migration.sql`
  - `scripts/process-workflow-run.mjs`
  - `src/lib/repositories/workflow-runs.ts`
  - `src/lib/workflow-queue.ts`
  - `src/lib/workflows/base-story.ts`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/external-stories.ts`
  - `src/lib/workflows/research.ts`
  - `tests/workflow-durable-jobs.test.ts`
- Schema or migration changes: Added a migration file for `WorkflowRun` durable-job fields: `idempotencyKey`, `attempt`, `maxAttempts`, `leaseOwner`, `leaseExpiresAt`, `heartbeatAt`, `canceledAt`, `cancelReason`, `updatedAt`, lease/status indexes, lease-owner index, and book/stage/idempotency uniqueness. Ran `npm run db:generate`; did not apply the migration to any production database.
- Tests run:
  - `npm run db:generate`
  - `npx tsx --test tests/workflow-durable-jobs.test.ts tests/retry-policy.test.ts tests/llm-attribution-enforcement.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Workflow runs are now durable database jobs rather than detached child-process launches. `triggerWorkflowRunInBackground()` no longer spawns `scripts/process-workflow-run.mjs`; it dispatches the existing authenticated internal worker endpoint and leaves the `WorkflowRun` row as the source of truth if dispatch fails. `WorkflowRun` creation supports idempotency keys and bounded attempts. Claims are atomic per run, increment attempts, set a lease owner, and set lease/heartbeat timestamps. Expired leases are recoverable: exhausted runs fail, otherwise they requeue. Long-running Research, External Stories, Base Story, and Chapter Draft processors renew their leases while running and clear lease ownership on completion, failure, or cancellation. The obsolete detached worker shim was deleted.
- Risks discovered: This package establishes durable job mechanics and removes detached child processes, but it does not yet move all operational state out of `metadataJson`; that remains package 3.2. Dispatch still depends on the Next.js internal worker route being reachable from the app process; if dispatch fails, the database row remains queued/recoverable instead of disappearing.
- Blocker or next package: Next package is 3.2 Typed operational state.

### 2026-07-13 07:48 — Package 3.2

- Status: completed
- Objective: Move the highest-risk operational state out of shared `metadataJson` blobs into typed database rows while preserving legacy fallback for existing books.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `prisma/schema.prisma`
  - `prisma/migrations/20260713074200_stage_operational_state/migration.sql`
  - `prisma/migrations/20260713074300_typed_budget_and_chat_state/migration.sql`
  - `src/lib/repositories/stage-operational-state.ts`
  - `src/lib/repositories/agent-chat-messages.ts`
  - `src/lib/repositories/books.ts`
  - `src/lib/llm/budgets.ts`
  - `src/app/api/books/[slug]/research/progress/route.ts`
  - `src/app/api/books/[slug]/external-stories/progress/route.ts`
  - `src/app/api/books/[slug]/chapter-draft/progress/route.ts`
  - `src/app/api/books/[slug]/agent-chat/history/route.ts`
  - `src/app/api/books/[slug]/llm-budget/confirm/route.ts`
  - `src/app/api/books/[slug]/llm-usage/route.ts`
  - `src/app/books/[slug]/dashboard/page.tsx`
  - `tests/typed-operational-state.test.ts`
- Schema or migration changes: Added migration files for typed operational state tables: `StageOperationalState`, `BookLLMBudgetState`, and `AgentChatMessage`. Ran `npm run db:generate`; did not apply migrations to any production database.
- Tests run:
  - `npm run db:generate`
  - `npx tsx --test tests/typed-operational-state.test.ts tests/llm-budget.test.ts tests/workflow-durable-jobs.test.ts tests/retry-policy.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Stage progress and automation UI state now have a typed one-row-per-stage home. The common `updateStageForBook()` path mirrors existing operational metadata writes into `StageOperationalState`, so legacy workflow writers continue to work while progress APIs and the dashboard read typed state first with legacy metadata fallback. Per-book LLM budget approval now persists to `BookLLMBudgetState` instead of `Book.metadataJson.llmBudget`, and budget reads prefer the typed row with metadata fallback for old books. Agent chat history now persists ordered rows in `AgentChatMessage`; the history API no longer writes `chatHistory` into stage metadata and reads legacy metadata only when no typed messages exist.
- Risks discovered: Some non-operational artifact descriptors still legitimately use `metadataJson` for chapter keys, source flags, and artifact-specific metadata; those are outside package 3.2 and should not be removed until packages 4.x and 5.x create stable chapter/source assignment models. Workflow loops still pass progress through `updateStageForBook()` as a compatibility bridge; later cleanup can replace those call sites with direct typed progress writes once 3.3 centralizes stage transitions.
- Blocker or next package: Next package is 3.3 Stage transition service.

### 2026-07-12 13:38 — Package 1.1

- Status: completed
- Objective: Record the stabilization working boundary so unattended runs preserve user-owned changes and stay inside a safe remediation scope.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npm run check`
- Live provider spend: none
- Behavioral result: The execution contract now contains the concrete branch, HEAD, dirty-tree classification, ownership boundary, safe remediation scope, and overlap-stop rule. Package 1.1 is checked complete.
- Risks discovered: The repository contains a very large unrelated dirty tree concentrated in `.agents`, `.claude`, `_bmad`, and support files, so broad cleanup remains unsafe without a separate explicit scope.
- Blocker or next package: Next package is 1.2 Authentication and ownership.

### 2026-07-12 13:52 — Package 1.2a

- Status: completed
- Objective: Add an explicit local-development authentication mechanism plus a fail-closed protection layer for application pages and public book/persona APIs.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/auth/shared.ts`
  - `src/lib/auth/app-auth.ts`
  - `src/middleware.ts`
  - `tests/auth-shared.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/auth-shared.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Requests to the Library, Book Studio routes, book APIs, and persona APIs now fail closed unless explicit local auth is configured outside production. When local auth is enabled, middleware injects a stable authenticated user identity and the server can materialize that user record through a shared helper.
- Risks discovered: Ownership enforcement is still incomplete because many repository functions, pages, routes, and server actions still query books by slug or list books without scoping by the authenticated user.
- Blocker or next package: Next package is 1.2b Ownership enforcement.

### 2026-07-12 14:03 — Package 1.2b1

- Status: completed
- Objective: Introduce ownership-scoped book repository and spine access helpers while preserving explicit unrestricted helpers for internal callers.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/repositories/books.ts`
  - `src/lib/repositories/book-spine.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/auth-shared.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The repository now exposes ownership-aware book lookup, book listing, deletion, and Book Studio spine loading helpers that can be used by authenticated app surfaces without relying on slug-only access.
- Risks discovered: Many public book route handlers still bypass these helpers and query Prisma directly by slug.
- Blocker or next package: Next package is 1.2b2 App entrypoints.

### 2026-07-12 14:03 — Package 1.2b2

- Status: completed
- Objective: Route the Library, Ideas, Book Studio entrypoints, and core book server actions through the authenticated user and ownership-aware helpers.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/page.tsx`
  - `src/app/actions.ts`
  - `src/app/books/[slug]/page.tsx`
  - `src/app/ideas/page.tsx`
  - `src/app/ideas/actions.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/auth-shared.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Library and Ideas now list only the authenticated user's books, Book Studio resolves the requested slug through the authenticated owner, and the main book create/archive/restore/delete/cover actions now verify ownership before mutating records.
- Risks discovered: Public book APIs remain the largest ownership gap because many handlers still perform direct slug-based lookups and updates.
- Blocker or next package: Next package is 1.2b3 Book APIs.

### 2026-07-12 23:44 — Package 1.2b3a

- Status: completed
- Objective: Route the highest-frequency polling, progress, status, and lightweight read endpoints through ownership-aware book resolution so background UI refreshes do not leak cross-book access.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/repositories/books.ts`
  - `src/app/api/books/[slug]/promise-status/route.ts`
  - `src/app/api/books/[slug]/chapter-draft/progress/route.ts`
  - `src/app/api/books/[slug]/external-stories/progress/route.ts`
  - `src/app/api/books/[slug]/research/progress/route.ts`
  - `src/app/api/books/[slug]/stage-status/route.ts`
  - `src/app/api/books/[slug]/activity/route.ts`
  - `src/app/api/books/[slug]/llm-usage/route.ts`
  - `src/app/api/books/[slug]/chapters/[chapterKey]/linked-notes/route.ts`
  - `src/app/api/books/[slug]/promise/reply-stream/route.ts`
  - `src/app/api/books/[slug]/outline/chapter-progress/route.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/auth-shared.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The Studio polling endpoints, workflow progress APIs, lightweight activity/usage reads, linked-note reads, and in-memory status trackers now all verify the authenticated user owns the requested book before returning data.
- Risks discovered: Remaining read-only export and archive-style APIs still use slug-only lookup paths, and mixed read/write route files such as author and craft-notes still need ownership enforcement.
- Blocker or next package: Next package is 1.2b3a2 Remaining read-only APIs.

### 2026-07-12 23:57 — Package 1.2b3a2

- Status: completed
- Objective: Require ownership checks before returning downloadable exports, archive bundles, author bio reads, source document listings, craft-note listings, and related non-mutating book data.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/repositories/books.ts`
  - `src/app/api/books/[slug]/workspace-export/route.ts`
  - `src/app/api/books/[slug]/manuscript-export/route.ts`
  - `src/app/api/books/[slug]/publish-package/route.ts`
  - `src/app/api/books/[slug]/archive/route.ts`
  - `src/app/api/books/[slug]/promise-export/route.ts`
  - `src/app/api/books/[slug]/author/route.ts`
  - `src/app/api/books/[slug]/source-docs/route.ts`
  - `src/app/api/books/[slug]/craft-notes/route.ts`
- Schema or migration changes: none
- Tests run:
  - `npm run check`
  - `npx tsx --test tests/auth-shared.test.ts`
- Live provider spend: none
- Behavioral result: Export, archive, author-read, source-document-list, and craft-note-list routes now verify the authenticated user owns the requested book before returning book content or files.
- Risks discovered: Several mixed or mutating API routes still contain slug-only lookups and remain assigned to 1.2b3b and 1.2b3c, including source-doc mutations, author PATCH, craft-note POST, manifest generation, agent-chat routes, and chapter/research/story save routes.
- Blocker or next package: Next package is 1.2b3b Mutating book APIs.

### 2026-07-13 00:08 — Package 1.2b3b1

- Status: completed
- Objective: Require ownership checks before core book metadata updates, author bio updates, craft-note creation, and source-document upload/toggle operations.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/repositories/source-documents.ts`
  - `src/app/api/books/[slug]/route.ts`
  - `src/app/api/books/[slug]/author/route.ts`
  - `src/app/api/books/[slug]/craft-notes/route.ts`
  - `src/app/api/books/[slug]/source-docs/route.ts`
  - `src/app/books/[slug]/files/actions.ts`
  - `src/app/books/[slug]/promise/actions.ts`
- Schema or migration changes: none
- Tests run:
  - `npm run check`
  - `npx tsx --test tests/auth-shared.test.ts`
- Live provider spend: none
- Behavioral result: Core book mutations now resolve the requested book through the authenticated owner before changing metadata, author fields, craft notes, or source documents. Source-document toggles now also verify the document belongs to the current book, closing the cross-book document toggle risk.
- Risks discovered: Some page-level server actions still resolve books through `getOrCreateBookBySlug`; they now pass the owning book ID into source-document toggles but still need a later ownership-focused pass.
- Blocker or next package: Next package is 1.2b3b2 Workflow mutation APIs.

### 2026-07-13 00:15 — Package 1.2b3b2a

- Status: completed
- Objective: Require ownership checks before manifest reads/generation, promise reference uploads, and workbook design read/enrich/commit actions.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/manifest/route.ts`
  - `src/app/api/books/[slug]/promise-references/route.ts`
  - `src/app/api/books/[slug]/workbook-design/route.ts`
- Schema or migration changes: none
- Tests run:
  - `npm run check`
  - `npx tsx --test tests/auth-shared.test.ts`
- Live provider spend: none
- Behavioral result: Manifest and workbook design routes now resolve the book through the authenticated owner before reading, generating, enriching, or committing workflow artifacts. Promise reference uploads now require ownership before adding source documents or direction events.
- Risks discovered: Approval and commit mutation routes still contain slug-only lookups and remain assigned to the next package.
- Blocker or next package: Next package is 1.2b3b2b Approval and commit mutations.

### 2026-07-13 00:25 — Package 1.2b3b2b

- Status: completed
- Objective: Require ownership checks before stage approval, artifact commit, no-artifact stage commit, chapter draft approve-all, and editing approve-all transition routes.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/agent-chat/approve/route.ts`
  - `src/app/api/books/[slug]/agent-chat/commit/route.ts`
  - `src/app/api/books/[slug]/agent-chat/commit-stage/route.ts`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/approve-all/route.ts`
  - `src/app/api/books/[slug]/agent-chat/editing/approve-all/route.ts`
- Schema or migration changes: none
- Tests run:
  - `npm run check`
  - `npx tsx --test tests/auth-shared.test.ts`
- Live provider spend: none
- Behavioral result: Stage transition and bulk approval endpoints now resolve the requested book through the authenticated owner before mutating stage, artifact, and version state.
- Risks discovered: Chapter/chat/dossier/history routes still contain slug-only lookups and remain assigned to 1.2b3c.
- Blocker or next package: Next package is 1.2b3c Chapter and workflow APIs.

### 2026-07-13 09:03 — Package 4.2

- Status: completed
- Objective: Introduce a transactional artifact service for version creation, commit, rejection, staleness, and supersession, and stop destructive artifact/version cleanup in core flows.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/repositories/artifact-transaction-service.ts`
  - `src/lib/repositories/artifact-lifecycle.ts`
  - `src/app/api/books/[slug]/agent-chat/approve/route.ts`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/approve-all/route.ts`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/route.ts`
  - `src/app/api/books/[slug]/agent-chat/commit/route.ts`
  - `src/app/api/books/[slug]/agent-chat/editing/approve-all/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-dossier/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-draft/route.ts`
  - `src/app/api/books/[slug]/chronicle-stories/save-chapter/route.ts`
  - `src/app/api/books/[slug]/manifest/route.ts`
  - `src/app/api/books/[slug]/scout-research/save-chapter/route.ts`
  - `tests/artifact-transaction-service.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/artifact-transaction-service.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added central helpers for artifact version creation, version commit, version rejection, staleness marking, and duplicate supersession. The legacy `pruneToSingleCommittedArtifact` seam now preserves history by marking old versions/artifacts `SUPERSEDED` instead of deleting them. Main approval/commit routes use the commit helper, main chapter/source save routes use the version creation helper, and manifest regeneration supersedes older manifests rather than deleting them.
- Risks discovered: Some older repository-specific artifact writers still create versions directly; they are non-destructive after this package, but should be folded into the service as Package 8.3 simplification or when touched by Packages 4.3 and 4.4.
- Blocker or next package: None for 4.2. Next package is 4.3 Approval states.

### 2026-07-13 09:30 — Package 4.3

- Status: completed
- Objective: Store exact per-chapter Quill draft and final Opus/Reed revision version IDs with explicit approval lifecycle states.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `prisma/schema.prisma`
  - `prisma/migrations/20260713093000_chapter_approval_states/migration.sql`
  - `src/lib/repositories/chapter-approval-state.ts`
  - `src/lib/repositories/chapter-draft-artifacts.ts`
  - `src/lib/repositories/editing-artifacts.ts`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/route.ts`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/approve-all/route.ts`
  - `src/app/api/books/[slug]/agent-chat/editing/route.ts`
  - `src/app/api/books/[slug]/agent-chat/editing/approve-all/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-draft/route.ts`
  - `src/app/api/books/[slug]/agent-chat/commit/route.ts`
  - `tests/chapter-approval-state.test.ts`
- Schema or migration changes: Added `ChapterApprovalStatus` and `ChapterApprovalState` with one row per `(bookId, chapterId)`, explicit pending/approved version pointer columns for draft and final revision, and stale status fields.
- Tests run:
  - `npm run db:generate`
  - `npx tsx --test tests/chapter-approval-state.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: New and updated Quill chapter drafts mark `DRAFT_PENDING`; Quill approvals mark `DRAFT_APPROVED` with the exact approved version ID; saved final revision/polish artifacts mark `FINAL_REVISION_PENDING`; final revision approve-all marks `FINAL_REVISION_APPROVED` with the exact approved version ID. A reusable stale transition is available for Package 4.4 dependency invalidation.
- Risks discovered: The current UI still primarily displays artifact status rather than the new approval-state table; direct per-chapter final approval UX is intentionally deferred to Package 6.3.
- Blocker or next package: None for 4.3. Next package is 4.4 Dependency invalidation.

### 2026-07-13 09:31 — Package 4.4

- Status: completed
- Objective: Mark only affected downstream chapter assets stale when upstream strategy, outline, Base Story, source dossiers, story material, or chapter drafts change, while preserving unaffected chapters.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflow-dependencies.ts`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/external-stories.ts`
  - `src/lib/workflows/chapter-draft.ts`
  - `tests/dependency-invalidation.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/dependency-invalidation.test.ts`
  - `npm run check`
  - `npx tsx --test tests/dependency-invalidation.test.ts tests/chapter-approval-state.test.ts`
  - `npm run build`
- Live provider spend: none
- Behavioral result: Dependency invalidation now accepts optional chapter IDs. Chapter-scoped invalidation marks matching downstream chapter artifacts stale, marks chapter approval state stale for draft/final approval gates, records affected chapter IDs in stage metadata, and does not block the entire downstream stage. Full-stage upstream changes still block downstream stages as before. Single-chapter research, external story, and chapter draft commits now clear and invalidate only that chapter; bulk commits pass the committed chapter set.
- Risks discovered: Personal story encyclopedia commits still invalidate all downstream chapters because current story assignment data is hint-based rather than a stable typed chapter-assignment table; Package 5.5 should make that narrower once confirmed story assignments exist.
- Blocker or next package: None for 4.4. Milestone 4 is complete. Next package is 5.1 Unified Phase 1.

### 2026-07-13 09:41 — Package 5.1a

- Status: completed
- Objective: Split the oversized Unified Phase 1 package into reviewable subpackages and define the canonical Phase 1 strategic brief contract plus deterministic compiler from existing approved artifacts.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/artifact-schemas.ts`
  - `src/lib/phase1-strategic-brief.ts`
  - `tests/phase1-strategic-brief.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/phase1-strategic-brief.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added `Phase1StrategicBriefSchema`, `compilePhase1StrategicBrief()`, and `compilePhase1StrategicBriefForBook()` so GHOSTWRITR can assemble one canonical Phase 1 strategic brief from committed Book Setup, Promise, Audience/Persona, Market, and Book Promise artifacts. The compiler includes readiness reporting instead of filling missing approved source material with fallback display data, and it flags the required exactly-three comparable-title rule.
- Risks discovered: The compiler currently reads existing committed artifacts only; persistence, UI, and downstream stage gates remain open in 5.1b-5.1d.
- Blocker or next package: None for 5.1a. Next package is 5.1b Strategic brief persistence.

### 2026-07-13 09:45 — Package 5.1b

- Status: completed
- Objective: Persist the compiled Phase 1 strategic brief as a dedicated committed artifact and copy downstream-critical fields into book metadata for existing context consumers.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `prisma/schema.prisma`
  - `prisma/migrations/20260713094500_phase1_strategic_brief_artifact/migration.sql`
  - `src/lib/repositories/phase1-strategic-brief-artifacts.ts`
  - `src/lib/workflows/phase1-strategic-brief.ts`
  - `src/lib/workflows/promise.ts`
  - `tests/phase1-strategic-brief.test.ts`
- Schema or migration changes: Added `ArtifactType.PHASE1_STRATEGIC_BRIEF` via migration.
- Tests run:
  - `npm run db:generate`
  - `npx tsx --test tests/phase1-strategic-brief.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Promise commit now compiles the approved Phase 1 source artifacts, rejects incomplete strategic briefs, commits a dedicated `PHASE1_STRATEGIC_BRIEF` artifact, records its version ID on the Promise commit direction event, and propagates downstream-critical fields such as promise, target reader, voice, reader level, chapter format, target length, trim size, and output formats into `Book.metadataJson`.
- Risks discovered: This makes exactly-three comparable titles and approved audience/persona source material part of Phase 1 readiness; existing in-progress books with incomplete market/persona data will need that material completed before the new strategic brief can be approved.
- Blocker or next package: None for 5.1b. Next package is 5.1c Guided Phase 1 UI.

### 2026-07-13 08:15 — Package 4.1

- Status: completed
- Objective: Add title-independent chapter identity for chapter-scoped artifacts and enforce canonical uniqueness by book, stage, artifact type, and chapter for new canonical rows.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `prisma/schema.prisma`
  - `prisma/migrations/20260713081500_stable_chapter_identity/migration.sql`
  - `src/lib/repositories/chapter-identity.ts`
  - `src/lib/repositories/artifact-lifecycle.ts`
  - `src/lib/repositories/books.ts`
  - `src/lib/repositories/chapter-draft-artifacts.ts`
  - `src/lib/repositories/chapter-linked-notes.ts`
  - `src/lib/repositories/chapter-paragraph-artifacts.ts`
  - `src/lib/repositories/editing-artifacts.ts`
  - `src/lib/repositories/external-stories-artifacts.ts`
  - `src/lib/repositories/research-artifacts.ts`
  - `src/lib/repositories/structured-dossiers.ts`
  - `src/lib/book-archive-export.ts`
  - `src/lib/book-archive-import.ts`
  - `src/lib/workflows/publish-pipeline.ts`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/approve-all/route.ts`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/route.ts`
  - `src/app/api/books/[slug]/agent-chat/commit/route.ts`
  - `src/app/api/books/[slug]/agent-chat/dossiers/route.ts`
  - `src/app/api/books/[slug]/agent-chat/editing/approve-all/route.ts`
  - `src/app/api/books/[slug]/agent-chat/editing/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-dossier/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-draft/route.ts`
  - `src/app/api/books/[slug]/chronicle-stories/save-chapter/route.ts`
  - `src/app/api/books/[slug]/scout-research/save-chapter/route.ts`
  - `tests/chapter-identity.test.ts`
- Schema or migration changes: Added nullable `Artifact.chapterId`, a supporting index, and a raw partial unique index on `(bookId, stageId, artifactType, chapterId)` for non-null chapter IDs. The migration backfills only one canonical legacy artifact per duplicate group so existing duplicate data does not block migration application.
- Tests run:
  - `npm run db:generate`
  - `npx tsx --test tests/chapter-identity.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: New chapter-scoped artifacts are now written and found by immutable `chapterId` instead of title text or metadata-only `chapterKey`; legacy metadata and title fallbacks remain for old rows. Bulk approval, publish readiness, structured dossier lookup, linked notes, archive import/export, and book clone paths now preserve or consume stable chapter identity.
- Risks discovered: Existing duplicate legacy artifact rows are not deleted or force-merged by this migration; duplicate cleanup and exact version lifecycle should be handled by Package 4.2's transactional artifact service.
- Blocker or next package: None for 4.1. Next package is 4.2 Transactional artifact service.

### 2026-07-13 08:01 — Package 3.3

- Status: completed
- Objective: Centralize stage lifecycle transitions so public API routes no longer directly mutate `BookStage` status or perform copy-pasted next-stage unlocking.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/stage-transition-service.ts`
  - `src/lib/workflows/manifest-generator.ts`
  - `src/lib/workflows/stage-controls.ts`
  - `src/app/api/books/[slug]/agent-chat/approve/route.ts`
  - `src/app/api/books/[slug]/agent-chat/commit/route.ts`
  - `src/app/api/books/[slug]/agent-chat/commit-stage/route.ts`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/approve-all/route.ts`
  - `src/app/api/books/[slug]/agent-chat/chapter-draft/route.ts`
  - `src/app/api/books/[slug]/agent-chat/editing/approve-all/route.ts`
  - `src/app/api/books/[slug]/agent-chat/editing/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-dossier/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-draft/route.ts`
  - `src/app/api/books/[slug]/chronicle-stories/save-chapter/route.ts`
  - `src/app/api/books/[slug]/scout-research/save-chapter/route.ts`
  - `src/app/api/books/[slug]/workbook-design/route.ts`
  - `tests/stage-transition-service.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/stage-transition-service.test.ts`
  - `npm run check`
  - `npm run build`
- Live provider spend: none
- Behavioral result: Added a stage transition service for starting stages, marking review-ready, committing stages, unlocking the next workflow stage, resetting failed generated stages, and blocking canceled stages. Public API routes now use the service rather than directly writing `BookStage` lifecycle state, and the targeted test guards against reintroducing direct route-level stage writes.
- Risks discovered: Repository-level artifact helpers still contain local `BookStage` updates for active draft/review bookkeeping; Package 4.2's transactional artifact service should absorb those when artifact lifecycle is centralized.
- Blocker or next package: None for 3.3. Milestone 3 is complete. Next package is 4.1 Stable chapter identity.

### 2026-07-13 09:54 — Package 5.1c

- Status: completed
- Objective: Present Book Setup, Promise, audience/personas, exactly three comparable titles, market, voice, length, and KDP decisions as one guided Phase 1 journey without running live model calls.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/books/[slug]/promise/phase1-guided-journey-panel.tsx`
  - `src/app/books/[slug]/promise/promise-detail-content.tsx`
  - `src/lib/workflows/promise.ts`
  - `tests/phase1-strategic-brief.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/phase1-strategic-brief.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The Promise room now shows a unified Phase 1 strategic-brief gate that links back to Book Setup and Promise, displays readiness for setup, promise, readers/personas, exactly three comparable titles, market, and voice/length/KDP decisions, and distinguishes visible readiness from the committed `PHASE1_STRATEGIC_BRIEF` artifact. The Promise workspace now exposes the committed strategic brief version metadata for that panel.
- Risks discovered: This is a guided surface over the current Promise room rather than a full wizard rewrite; 5.1d still needs to make downstream gates depend on the approved strategic brief and remove misleading duplicate Phase 1 gates.
- Blocker or next package: None for 5.1c. Next package is 5.1d Phase 1 gate cleanup.

### 2026-07-13 10:05 — Package 5.1d

- Status: completed
- Objective: Make downstream stages depend on the approved Phase 1 strategic brief and remove misleading duplicate Phase 1 gates.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/agent-chat/commit/route.ts`
  - `src/app/books/[slug]/market-analysis/actions.ts`
  - `src/app/books/[slug]/market-analysis/page.tsx`
  - `src/app/books/[slug]/outline/actions.ts`
  - `src/app/books/[slug]/page.tsx`
  - `src/lib/stages.ts`
  - `src/lib/ui/stage-tokens.ts`
  - `src/lib/workflow-registry.ts`
  - `src/lib/workflows/outline.ts`
  - `src/lib/workflows/phase1-gates.ts`
  - `src/lib/workflows/promise.ts`
  - `tests/phase1-strategic-brief.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/phase1-strategic-brief.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Nonfiction Book Studio navigation no longer presents `MARKET_ANALYSIS` as a separate gate between Promise and Outline. Old `/market-analysis` links now redirect into the Promise room. The generic agent-chat commit route refuses `PROMISE` and `MARKET_ANALYSIS` commits so Phase 1 cannot bypass strategic-brief creation. Nonfiction downstream stages now stay locked until a committed `PHASE1_STRATEGIC_BRIEF` exists, and Outline generation/actions also assert that approved Phase 1 gate before doing work.
- Risks discovered: Existing databases may still contain legacy `MARKET_ANALYSIS` stage rows, but the nonfiction registry and Book Studio token list no longer use that row. Full registry cleanup and data migration should wait for Package 8.1/8.3 rather than deleting historical rows here.
- Blocker or next package: None for 5.1d. Package 5.1 Unified Phase 1 is complete. Next package is 5.2 Outline system.

### 2026-07-13 10:09 — Package 5.2a

- Status: completed
- Objective: Add a deterministic linkage contract so the high-level outline and paragraph-level outline must share the same stable chapter IDs, chapter order, and word-count targets before downstream stages trust the outline package.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/books/[slug]/outline/outline-detail-content.tsx`
  - `src/lib/outline-linkage.ts`
  - `src/lib/workflows/outline-paragraphs.ts`
  - `tests/outline-linkage.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/outline-linkage.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added `validateLinkedOutlinePackage()` and `assertLinkedOutlinePackage()` to detect missing paragraph plans, orphan paragraph plans, duplicate chapter IDs, chapter order mismatches, and chapter word-count mismatches. Paragraph-outline commit now fails if the generated breakdown package is not linked to the committed high-level outline. The Outline room still allows generating breakdowns after the high-level outline is ready, but disables committing the breakdowns until linkage is valid.
- Risks discovered: This package validates linkage and blocks bad commits, but it does not yet implement isolated per-chapter editing or chapter-scoped downstream invalidation; those remain in 5.2b and 5.2c.
- Blocker or next package: None for 5.2a. Next package is 5.2b Per-chapter outline editing.

### 2026-07-13 10:18 — Package 5.2b

- Status: completed
- Objective: Ensure chapter/paragraph outline edits target one stable chapter ID at a time and preserve unaffected chapters.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/books/[slug]/outline/actions.ts`
  - `src/lib/outline-linkage.ts`
  - `src/lib/repositories/chapter-paragraph-artifacts.ts`
  - `src/lib/workflows/outline-paragraphs.ts`
  - `tests/outline-linkage.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/outline-linkage.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added `assembleLinkedParagraphOutline()` so paragraph packages are reassembled from per-chapter plans in the committed outline order while ignoring orphan plans. Single-chapter breakdown regeneration now saves the changed chapter plan and immediately persists a refreshed linked paragraph-outline package, preserving unaffected chapter plans. Chapter paragraph artifact lookup now orders newest rows first so legacy duplicate rows do not win during reassembly.
- Risks discovered: The existing single-chapter regenerate action still uses a live model when clicked in the app; this heartbeat did not invoke it. Package 5.2c still needs chapter-scoped downstream invalidation after outline changes.
- Blocker or next package: None for 5.2b. Next package is 5.2c Outline targeted invalidation.

### 2026-07-13 10:22 — Package 5.2c

- Status: completed
- Objective: Mark only affected downstream chapter artifacts stale when outline or paragraph-plan chapters change.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/books/[slug]/outline/actions.ts`
  - `tests/dependency-invalidation.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/dependency-invalidation.test.ts tests/outline-linkage.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Single-chapter paragraph breakdown regeneration now refreshes the linked outline package and calls `invalidateDependentStagesForBook(slug, StageKey.OUTLINE, { chapterIds: [chapter.id] })`, so only downstream assets for that stable chapter ID are marked stale. Existing full-outline commits still use stage-scoped invalidation because the whole outline package changed.
- Risks discovered: The chapter regeneration action itself remains a live LLM action when invoked in the app; this heartbeat did not invoke it. Later workflow-simulation packages should cover this with fake providers.
- Blocker or next package: None for 5.2c. Package 5.2 Outline system is complete. Next package is 5.3 Base Story.

### 2026-07-13 10:31 — Package 5.3a

- Status: completed
- Objective: Define the canonical Base Story guidance contract so the book-wide narrative spine and per-chapter guidance are stored as guidance, not personal stories, and legacy Base Story bundles normalize into that shape.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/artifact-schemas.ts`
  - `src/lib/base-story-types.ts`
  - `src/lib/base-story-utils.ts`
  - `src/lib/workflows/base-story.ts`
  - `src/lib/workflows/research.ts`
  - `tests/base-story-guidance-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/base-story-guidance-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added explicit `narrativeGuidance` and per-chapter `guidance` contract fields with a `base_story_guidance` boundary and personal-story policy. Legacy Base Story bundles are normalized into the new contract, generated/fallback bundles inherit it before storage, and Research now normalizes committed Base Story reads before use.
- Risks discovered: Downstream prompts and UI still read/display the legacy `chapterStory` field in places. That is intentionally left for 5.3c so consumption and copy can be changed together after 5.3b adds readiness validation.
- Blocker or next package: None for 5.3a. Next package is 5.3b Base Story persistence/readiness.

### 2026-07-13 10:38 — Package 5.3b

- Status: completed
- Objective: Validate committed Base Story bundles against the approved paragraph-level outline and block downstream consumers when Base Story chapter guidance is missing or stale.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/repositories/base-story-artifacts.ts`
  - `src/lib/workflows/research.ts`
  - `tests/base-story-guidance-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/base-story-guidance-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `commitBaseStory()` now refuses to commit while the Base Story stage has a stale upstream dependency and validates the current version against committed paragraph-outline chapter IDs before marking it committed. Research normalizes committed Base Story bundles and asserts the guidance contract before seeding or running chapter research, so incomplete Base Story guidance cannot advance into the next costly stage.
- Risks discovered: The validation uses committed paragraph-outline chapter IDs; if a legacy book has a committed outline but no committed paragraph-level outline, the commit-time expected chapter list is empty. This matches the current locked-outline prerequisite, but older data may need regeneration before it can pass the stricter downstream guard.
- Blocker or next package: None for 5.3b. Next package is 5.3c Base Story consumption/UI cleanup.

### 2026-07-13 10:45 — Package 5.3c

- Status: completed
- Objective: Make downstream consumers and visible UI treat Base Story as compact narrative guidance rather than personal-story or case-study material.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/books/[slug]/base-story/base-story-detail-content.tsx`
  - `src/app/books/[slug]/chapter-draft/page.tsx`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/external-stories.ts`
  - `src/lib/workflows/research.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/base-story-guidance-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Research and External Stories now consume normalized Base Story guidance text rather than the legacy `chapterStory` value. Quill receives book-wide and chapter-specific guidance packets with explicit boundary policy instead of an ambiguous chapter-story field. The Base Story room and Chapter Draft source panel now display “Base Story Guidance” / “Chapter Guidance” and explain that the material is not a confirmed personal story, external case study, citation, or final prose.
- Risks discovered: Some internal field names remain `baseStoryChapterThread` or `chapterStory` for backward compatibility with existing schemas and legacy artifacts. They now carry normalized guidance values in the updated consumers, but a future cleanup could rename those internal fields after downstream contracts are stable.
- Blocker or next package: None for 5.3c. Package 5.3 Base Story is complete. Next package is 5.4 Research and External Stories.

### 2026-07-13 10:55 — Package 5.4a

- Status: completed
- Objective: Define canonical per-chapter Research and External Story evidence contracts covering source metadata, supporting excerpts, verification status, relevance, and exclusions without live model calls.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/source-evidence-contract.ts`
  - `tests/source-evidence-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/source-evidence-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added a shared `ChapterEvidenceContract` abstraction that normalizes Research claims and External Story candidates into records with source metadata, supporting excerpt, verification status, relevance, exclusions, and admissibility. Verified sourced records with excerpts become `ADMISSIBLE`; missing source metadata, missing excerpts, rejected/provisional/excluded records are blocked as `EXCLUDED`; incomplete but not disqualifying records stay `NEEDS_CORROBORATION`.
- Risks discovered: External Story supporting excerpts currently come from `metadata.supportingExcerpt`; generators/persistence may not consistently populate that field yet. Package 5.4c should either populate it from extraction or keep such stories blocked until excerpts exist.
- Blocker or next package: None for 5.4a. Next package is 5.4b Research persistence/readiness.

### 2026-07-13 11:02 — Package 5.4b

- Status: completed
- Objective: Normalize saved Research dossiers into the evidence contract and block downstream use when claims lack source metadata, supporting excerpts, or verified status.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/artifact-schemas.ts`
  - `src/lib/research-types.ts`
  - `src/lib/source-evidence-contract.ts`
  - `src/lib/workflows/chapter-draft.ts`
  - `tests/source-evidence-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/source-evidence-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added `getAdmissibleResearchItems()` to derive a drafting-safe Research dossier from the evidence contract. Quill now receives only admissible Research items: records must be verified, have verified source metadata, and include a supporting excerpt. Chapter Draft readiness now requires admissible Research items rather than accepting a non-empty source register or stale verified-item count.
- Risks discovered: Existing committed Research artifacts without excerpts will now be filtered out for drafting and may cause Chapter Draft to block until Research is regenerated or repaired. This is stricter, but it prevents unsupported facts from entering prose.
- Blocker or next package: None for 5.4b. Next package is 5.4c External Stories persistence/readiness.

### 2026-07-13 11:08 — Package 5.4c

- Status: completed
- Objective: Normalize saved External Story dossiers into the evidence contract and block downstream use when stories lack attribution, supporting excerpts, relevance, exclusions, or verified status.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/artifact-schemas.ts`
  - `src/lib/external-story-types.ts`
  - `src/lib/source-evidence-contract.ts`
  - `src/lib/workflows/chapter-draft.ts`
  - `tests/source-evidence-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/source-evidence-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added `getAdmissibleExternalStories()` to derive a drafting-safe External Stories dossier from the evidence contract. Quill now receives only story candidates with verified source metadata, verified story status, and supporting excerpts. Chapter Draft readiness now requires admissible External Stories rather than accepting a non-empty source register or stale verified-story count.
- Risks discovered: Existing committed External Story artifacts without `metadata.supportingExcerpt` will now be filtered out for drafting and may block Chapter Draft until Chronicle regenerates or backfills excerpts. Package 5.4e should surface this clearly in the UI.
- Blocker or next package: None for 5.4c. Next package is 5.4d Chapter-scoped source invalidation.

### 2026-07-13 11:12 — Package 5.4d

- Status: completed
- Objective: Ensure changed Research or External Story dossiers mark only affected downstream chapter assets stale.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/dependency-invalidation.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Verified the existing scoped invalidation implementation for Research and External Stories. Single-chapter commits clear and invalidate only `[chapterKey]`; all-chapter commits pass `committedChapterKeys`, so downstream Chapter Draft/Editing assets are marked stale only for affected chapters.
- Risks discovered: This package verified the workflow commit paths. Manual low-level repository calls that bypass workflow commit functions would still bypass scoped invalidation, so UI/API routes should keep using workflow-layer commit functions.
- Blocker or next package: None for 5.4d. Next package is 5.4e Evidence UI/copy cleanup.

### 2026-07-13 11:20 — Package 5.4e

- Status: completed
- Objective: Surface verification, excerpts, relevance, exclusions, and warnings clearly without treating unverified leads as usable facts.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/books/[slug]/external-stories/external-stories-content.tsx`
  - `src/app/books/[slug]/research/evidence-room-content.tsx`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/source-evidence-contract.test.ts tests/dependency-invalidation.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Research and External Stories screens now show draft-admissible and excluded evidence counts derived from the evidence contract. Research displays “Draft-Admissible Facts,” shows supporting excerpts, and warns when verified-looking items are blocked. External Stories displays “Draft-Admissible Story Candidates” and warns when stories are missing source metadata, supporting excerpts, or verified attribution.
- Risks discovered: This package surfaces contract state in the main Research and External Stories rooms. Chapter Draft’s source-context side panel already receives filtered dossiers, but it does not yet show excluded-item counts there; that can be refined in 5.6 Quill context if needed.
- Blocker or next package: None for 5.4e. Package 5.4 Research and External Stories is complete. Next package is 5.5 Personal Stories.

### 2026-07-13 11:29 — Package 5.5a

- Status: completed
- Objective: Define the canonical confirmed-story shape with raw-note provenance, missing details, permissions, chapter assignments, and usage history.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/personal-story-contract.ts`
  - `src/lib/personal-story-types.ts`
  - `tests/personal-story-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/personal-story-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added canonical Personal Story contract fields for provenance raw notes, source message IDs, explicit permissions, missing details, chapter assignments, and usage history. Legacy entries normalize into `CanonicalPersonalStory` records with readiness states: `READY`, `NEEDS_DETAIL`, `PERMISSION_BLOCKED`, or `NOT_APPLICABLE`.
- Risks discovered: Legacy `chapterFitHints` may be human-readable hints rather than stable chapter IDs. The normalizer preserves them as assignments with a warning-style relevance note, but 5.5b/5.5c should avoid treating them as authoritative stable chapter assignments without confirmation.
- Blocker or next package: None for 5.5a. Next package is 5.5b Personal story readiness.

### 2026-07-13 11:45 — Package 5.5b

- Status: completed
- Objective: Block downstream use of unconfirmed, permission-blocked, or detail-incomplete personal stories and preserve them as interview follow-ups instead.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/personal-story-contract.ts`
  - `src/lib/workflows/chapter-draft.ts`
  - `tests/personal-story-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/personal-story-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Personal stories now require explicit `permission.status: "granted"` and complete detail before they can reach Quill. `needs_detail`, permission `needs_review`, permission `restricted`, and `not_applicable` stories are excluded from source material and preserved as chapter follow-ups. Quill’s author packet now includes `personalStoryFollowUps` separately from usable `personalStories`.
- Risks discovered: Existing legacy personal stories without explicit permission will now be blocked from drafting until permission is confirmed. This is stricter than prior behavior, but it prevents accidental use of unconfirmed personal material.
- Blocker or next package: None for 5.5b. Next package is 5.5c Compact personal-story context.

### 2026-07-13 11:52 — Package 5.5c

- Status: completed
- Objective: Send Quill only compact assigned story cards for the active chapter, not full interview transcripts or unrelated stories.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/personal-story-contract.ts`
  - `src/lib/workflows/chapter-draft.ts`
  - `tests/personal-story-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/personal-story-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added `getCompactPersonalStoryCardsForChapter()` and switched Chapter Draft source packets, fallback drafting, source availability, and source-weave planning to compact assigned story cards. Quill receives only chapter-assigned, permission-granted, detail-complete story cards with title, summary, lesson, why-it-matters, emotional notes, assignment relevance, and permission status. Raw notes, provenance, source message IDs, and full interview transcript material are not included in the drafting packet.
- Risks discovered: Legacy `chapterFitHints` are still normalized into assignments, but compact cards only include stories whose normalized assignment matches the active chapter key or title. Books with vague legacy hints may need explicit assignment cleanup in the UI package.
- Blocker or next package: None for 5.5c. Next package is 5.5d Personal story UI/copy cleanup.

### 2026-07-13 12:01 — Package 5.5d

- Status: completed
- Objective: Surface confirmation, permission, missing-detail, assignment, and usage status one chapter at a time.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/books/[slug]/personal-stories/personal-stories-content.tsx`
  - `src/lib/workflows/personal-stories.ts`
  - `tests/personal-story-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/personal-story-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Personal Stories workspace now normalizes the encyclopedia through the canonical contract before display. The room shows ready, needs-detail, permission-blocked, and no-story counts; each story card shows readiness, permission status, assignment count, usage count, chapter assignments, missing details, and permission warnings.
- Risks discovered: This UI surfaces the canonical status but does not yet provide inline edit controls for granting permission or correcting assignments. Those edits may need a follow-up package if manual correction is preferred over interview-based updates.
- Blocker or next package: None for 5.5d. Package 5.5 Personal Stories is complete. Next package is 5.6 Quill context.

### 2026-07-13 12:08 — Package 5.6a

- Status: completed
- Objective: Define the canonical per-chapter Quill context packet and verify it excludes stale, unapproved, unverified, unassigned, and raw-transcript material.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/quill-context-contract.ts`
  - `tests/quill-context-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/quill-context-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added `QuillContextPacket` and `validateQuillContextPacket()` covering approved brief, current paragraph outline, Base Story guidance, admissible Research/External Story records, compact assigned personal story cards, voice guide, and craft notes. The validator rejects non-admissible evidence, missing approved/current inputs, missing voice guide, ungranted personal-story permission, and forbidden raw context fields such as transcript, raw notes, provenance, source message IDs, source quotes, and content text.
- Risks discovered: This package defines and tests the target contract but does not yet route the live Chapter Draft generation path through it. That belongs in 5.6b/5.6c.
- Blocker or next package: None for 5.6a. Next package is 5.6b Quill source readiness gate.

### 2026-07-13 11:01 — Package 5.6b

- Status: completed
- Objective: Block chapter drafting unless the active chapter has an approved brief, current paragraph outline, Base Story guidance, admissible sources, assigned ready stories, voice guide, and relevant craft notes.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `tests/quill-context-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/quill-context-contract.test.ts tests/personal-story-contract.test.ts tests/source-evidence-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Chapter Draft readiness now builds and validates a canonical Quill context packet before drafting can begin. The live gate requires a committed complete Phase 1 strategic brief, current paragraph outline, Base Story chapter guidance, admissible Research evidence, admissible External Story evidence, compact permission-granted personal story cards when any are assigned, a voice guide from Book Setup, and craft notes. It blocks with explicit chapter-level reasons before any Quill generation spend.
- Risks discovered: Personal stories remain optional per chapter because the product flow allows personal stories only for select chapters. Package 5.6c should still remove duplicate/oversized fields from the actual Quill author packet so the generation input is not merely validated but fully routed through the canonical packet.
- Blocker or next package: None for 5.6b. Next package is 5.6c Quill prompt/input cleanup.

### 2026-07-13 11:01 — Package 5.6c

- Status: completed
- Objective: Route author/revise/fallback paths through the canonical Quill packet and remove duplicate or oversized context fields.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `tests/personal-story-contract.test.ts`
  - `tests/quill-context-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/quill-context-contract.test.ts tests/personal-story-contract.test.ts tests/source-evidence-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Quill author and revise inputs now build `quillContext` from the canonical readiness packet instead of carrying full Promise, Book Setup, Base Story, Research, External Stories, and personal story objects in the per-chapter payload. The packet is revalidated immediately before generation/revision input construction, keeps source IDs for citation tracing, keeps craft notes under `quillContext.craftNotes`, and preserves blocked personal-story follow-ups separately from usable story cards.
- Risks discovered: `buildSharedBookContextJson()` still sends a compact cached shared context for book-level promise, voice, and Base Story spine. That is intentional for quality and token caching, but 5.6d should show the author the exact split between shared book context and per-chapter Quill context.
- Blocker or next package: None for 5.6c. Next package is 5.6d Quill context UI summary.

### 2026-07-13 11:08 — Package 5.6d

- Status: completed
- Objective: Show the author exactly which approved inputs Quill will use for the selected chapter.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/books/[slug]/chapter-draft/page.tsx`
  - `src/lib/workflows/chapter-draft.ts`
  - `tests/quill-context-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/quill-context-contract.test.ts tests/personal-story-contract.test.ts tests/source-evidence-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Chapter Draft workspace entries now include `quillContextSummary` derived from the same canonical readiness packet used by the generation gate. The Chapter Draft UI shows a selected-chapter Quill Context card with approved brief, paragraph outline anchors, Base Story guidance, verified Research/External Story counts and examples, assigned permissioned personal story cards, voice guide, and craft notes. Chapter list pills now show whether Quill is ready or blocked for each chapter.
- Risks discovered: The UI now reveals the canonical packet, but correction actions still live in upstream stages. Package 5.7 should focus on direct per-chapter draft approval state rather than expanding this summary into an editor for upstream inputs.
- Blocker or next package: None for 5.6d. Package 5.6 Quill context is complete. Next package is 5.7 Quill approval.

### 2026-07-13 11:08 — Package 5.7

- Status: completed
- Objective: Present every chapter for direct author review and store the exact approved draft version.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/books/[slug]/chapter-draft/page.tsx`
  - `src/lib/workflows/chapter-draft.ts`
  - `tests/chapter-approval-state.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-approval-state.test.ts tests/quill-context-contract.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Chapter Draft workspace now loads per-chapter approval state and exposes the pending and approved draft version IDs beside the selected chapter. The UI presents each chapter one at a time, changes commit copy to `Approve Chapter Draft`, shows approval status in the chapter list and right rail, and explains that the exact approved draft version ID is stored for Editing.
- Risks discovered: The action still calls the existing `commitChapterDraftWorkflow`, which already marks `approvedDraftVersionId`; this package intentionally changed the author-facing approval presentation without introducing another approval endpoint. Milestone 6 should consume only these approved draft version pointers.
- Blocker or next package: None for 5.7. Milestone 5 Canonical production flow is complete. Next package is 6.1 Book-wide assessment.

### 2026-07-13 11:21 — Package 6.1

- Status: completed
- Objective: Run one economical analytical pass producing duplication, continuity, structure, voice, AI-artifact, terminology, citation, preservation, and chapter-instruction findings without rewriting prose.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/editing-types.ts`
  - `src/lib/workflows/editing.ts`
  - `tests/editing-bookwide-assessment.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-bookwide-assessment.test.ts tests/chapter-approval-state.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Editing now assembles nonfiction manuscripts from exact approved Quill draft version IDs instead of latest draft versions. The editorial assessment contract now carries explicit book-wide analytical categories for duplication, continuity, structure, voice, AI artifacts, terminology, citations, preservation, and chapter instructions. A deterministic analyzer populates those categories without rewriting prose, and optional `final-editor:assess` output is normalized back into the same complete category shape.
- Risks discovered: Citation detection is intentionally conservative and only flags visible citation/source cues in approved draft text. Later bibliography and final-revision packages should replace this with source-usage-aware citation tracing.
- Blocker or next package: None for 6.1. Next package is 6.2 Opus final revision.

### 2026-07-13 11:21 — Package 6.2

- Status: completed
- Objective: Perform one combined editorial revision and polish per chapter using only the approved draft, paragraph outline, voice guide, protected material, verified citations, and chapter-specific assessment instructions.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/editing-types.ts`
  - `src/lib/workflows/editing.ts`
  - `tests/editing-bookwide-assessment.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-bookwide-assessment.test.ts tests/chapter-approval-state.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Manuscript revision changes now carry approved draft version IDs and assessment instructions. The revision path builds `finalRevisionInstructions` from the approved Quill draft version, paragraph outline anchors, latest book-wide assessment findings, preservation notes, citation warnings, voice guidance, and chapter-specific assessment notes. The Opus path remains `final-editor:polish`, but verification used only deterministic/source-level tests and made no provider calls.
- Risks discovered: Citation guidance is still assessment-derived rather than full bibliography/source-usage-derived. Package 7.2 should make citation verification exact from actually cited approved final chapters.
- Blocker or next package: None for 6.2. Next package is 6.3 Final chapter approval.

### 2026-07-13 11:21 — Package 6.3

- Status: completed
- Objective: Show approved Quill draft, Opus revision, change summary, comparison, preserved stories/citations, and unresolved warnings. Support approve, reject with instructions, manual edit, and chapter-only retry.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/books/[slug]/editing/chapter-revision-row.tsx`
  - `src/app/books/[slug]/editing/editing-detail-content.tsx`
  - `src/lib/workflows/editing.ts`
  - `tests/editing-bookwide-assessment.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-bookwide-assessment.test.ts tests/chapter-approval-state.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Applying an editing revision now marks the affected chapter's final revision approved with the exact revision version ID. The Editing row now presents pending revisions as `Approve Final Revision`, shows the approved Quill draft version, before/after comparison, change summary, and revision guardrails derived from assessment instructions. Reject and regenerate paths remain chapter-scoped.
- Risks discovered: Manual edit support is still implicit through regeneration/rejection paths rather than an inline rich-text editor. If true manual prose editing is required before final approval, it should be added as a dedicated package to avoid mixing it into the approval-state fix.
- Blocker or next package: None for 6.3. Milestone 6 Combined editorial revision and polish is complete. Next package is 7.1 Canonical assembly.

### 2026-07-13 11:26 — Package 7.1

- Status: completed
- Objective: Assemble final production exports only from approved, non-stale Opus revision versions in approved outline order, and fail on missing, stale, unordered, or unapproved chapters.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/manuscript-export.ts`
  - `tests/final-assembly.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/final-assembly.test.ts tests/editing-bookwide-assessment.test.ts tests/chapter-approval-state.test.ts`
  - `npx tsc --noEmit --pretty false --skipLibCheck`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Nonfiction final manuscript exports, DOCX exports, publish packages, and typeset-plan input now all flow through one canonical assembly boundary that requires the approved paragraph-level outline and exact per-chapter `FINAL_REVISION_APPROVED` state. Each chapter is loaded from its stored `approvedFinalVersionId`, verified to be an Editing `MANUSCRIPT_REVISION`, matched by stable chapter ID, and emitted in outline order. Export now fails instead of falling back to committed Quill drafts when final approvals are missing, stale, orphaned outside the outline, or missing revised text.
- Risks discovered: Fiction export still uses the committed fiction draft path because the current approval-state packages are Quill/Opus nonfiction specific. If fiction needs the same final-approval gate, add a dedicated fiction approval package rather than silently applying the nonfiction contract.
- Blocker or next package: None for 7.1. Next package is 7.2 Bibliography.

### 2026-07-13 11:31 — Package 7.2

- Status: completed
- Objective: Generate a deduplicated bibliography from research sources actually cited in approved final chapters and flag incomplete citations.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/publish-package/route.ts`
  - `src/lib/workflows/bibliography-generator.ts`
  - `tests/bibliography-generator.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/bibliography-generator.test.ts tests/final-assembly.test.ts tests/editing-bookwide-assessment.test.ts tests/chapter-approval-state.test.ts`
  - `npx tsc --noEmit --pretty false --skipLibCheck`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The bibliography generator no longer calls an LLM or scans broad research dossiers. It deterministically traces each approved final chapter back to its approved Quill draft, reads `sourceUsage.researchItemIds` and `sourceUsage.externalStoryItemIds`, resolves structured Research and External Story source records, deduplicates them, emits conservative bibliography entries, and reports incomplete citation metadata or missing visible source cues. The publish package now includes `bibliography.html`, `bibliography-report.json`, and bibliography gap counts in the preflight report.
- Risks discovered: The citation trace depends on Quill preserving accurate `sourceUsage` through draft approval and Opus revisions preserving the approved draft pointer. If Opus removes a cited passage entirely, the deterministic cue check will warn when no obvious author/title/site cue remains, but it is not a semantic citation detector.
- Blocker or next package: None for 7.2. Next package is 7.3 KDP typesetting.

### 2026-07-13 11:40 — Package 7.3a

- Status: completed
- Objective: Normalize selected trim, margins, gutter, bleed, font, page-numbering, header/footer, TOC, section-break, image, and preflight settings into one deterministic plan consumed by DOCX, HTML, PDF, and manifest outputs.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/publish-package/route.ts`
  - `src/lib/manuscript-document.ts`
  - `src/lib/manuscript-export.ts`
  - `src/lib/typeset-plan.ts`
  - `tests/typeset-plan.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/typeset-plan.test.ts tests/final-assembly.test.ts tests/bibliography-generator.test.ts`
  - `npx tsc --noEmit --pretty false --skipLibCheck`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added a canonical deterministic `TypesetPlan` contract with KDP trim profiles, mirrored margins/gutter, bleed, typography, page numbering, header/footer, TOC, section-break, image policy, front/back matter, signature estimates, and required preflight checks. `buildTypesetPlanInput`, print CSS, typeset interior HTML, layout manifest, cover brief, distribution manifest, and publish package metadata now consume the normalized plan instead of loose optional fields and hard-coded 6x9 CSS.
- Risks discovered: DOCX generation still uses the old `typesetContent` design-spec parser and the publish package still converts generic manuscript HTML to DOCX. Package 7.3b should make DOCX generation consume the canonical `TypesetPlan` directly.
- Blocker or next package: None for 7.3a. Next package is 7.3b DOCX print interior.

### 2026-07-13 11:47 — Package 7.3b

- Status: completed
- Objective: Make `buildKdpDocx` consume the deterministic plan and enforce trim size, mirrored margins/gutter, section breaks, page numbering, paragraph styles, TOC placeholders or fields, headers/footers, and front/back matter from the canonical manuscript.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/publish-package/route.ts`
  - `src/app/api/books/[slug]/workspace-export/route.ts`
  - `src/lib/kdp-docx-export.ts`
  - `tests/kdp-docx-plan.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/kdp-docx-plan.test.ts tests/typeset-plan.test.ts tests/final-assembly.test.ts`
  - `npx tsc --noEmit --pretty false --skipLibCheck`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `buildKdpDocx` now accepts the canonical `TypesetPlan`, converts it into DOCX page geometry, applies trim size, inside/outside margins, gutter, body font, body size, line height, running-head header, footer page numbering, and TOC inclusion from that plan. The publish package now uses the internal KDP DOCX builder with the canonical plan instead of converting generic HTML through Pandoc, and direct DOCX workspace export also passes the canonical plan.
- Risks discovered: DOCX verification is still source-level. Package 7.3d or milestone 9 should inspect generated DOCX/PDF artifacts directly for page-size, margin, header/footer, and TOC behavior.
- Blocker or next package: None for 7.3b. Next package is 7.3c PDF print interior.

### 2026-07-13 11:52 — Package 7.3c

- Status: completed
- Objective: Generate a print-ready PDF from the canonical typeset interior without live provider calls, with page size, margins, fonts, page breaks, headers/footers, and page numbering matching the plan.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/publish-package/route.ts`
  - `src/lib/kdp-pdf-export.ts`
  - `tests/kdp-pdf-export.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/kdp-pdf-export.test.ts tests/kdp-docx-plan.test.ts tests/typeset-plan.test.ts`
  - `npx tsc --noEmit --pretty false --skipLibCheck`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added a local Playwright/Chromium PDF renderer that converts the canonical typeset interior HTML into a PDF using the normalized typeset plan page size and CSS. The publish package now includes `{filename}-print.pdf` alongside DOCX, HTML, CSS, JSON, bibliography, and manifests. Verification rendered a real local PDF and confirmed the `%PDF` signature without provider calls.
- Risks discovered: Playwright Chromium is available in this local workspace, but production packaging must ensure the browser binary is installed wherever publish-package export runs. Package 7.3d should surface this as a preflight/environment check.
- Blocker or next package: None for 7.3c. Next package is 7.3d Preflight validation.

### 2026-07-13 11:58 — Package 7.3d

- Status: completed
- Objective: Produce blocking/warning checks for missing final approvals, bibliography gaps, page-size mismatch, missing fonts, image issues, TOC readiness, blank-page/signature math, and KDP-critical layout settings.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/publish-package/route.ts`
  - `src/lib/typeset-preflight.ts`
  - `tests/typeset-preflight.test.ts`
  - `tests/typeset-plan.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/typeset-preflight.test.ts tests/kdp-pdf-export.test.ts tests/kdp-docx-plan.test.ts tests/typeset-plan.test.ts`
  - `npx tsc --noEmit --pretty false --skipLibCheck`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added a canonical typeset preflight report with pass/warn/fail checks for final chapter completeness, bibliography gaps, KDP trim profile, mirrored margins and gutter, font readiness, TOC readiness, signature/blank-page math, PDF renderer success, package file set, and image alt/DPI policy. The publish package now writes this report as the source of truth and reuses one included-file list for both package manifest and preflight.
- Risks discovered: Font availability is currently policy-based rather than OS font inspection. Milestone 9 should add binary artifact inspection or runtime font enumeration if exact embedded-font proof is required.
- Blocker or next package: None for 7.3d. Next package is 7.3e Publish package wiring.

### 2026-07-13 12:03 — Package 7.3e

- Status: completed
- Objective: Ensure DOCX, PDF, HTML, CSS, layout manifest, bibliography, and preflight report all derive from the same canonical manuscript and typeset plan.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/publish-package/route.ts`
  - `tests/publish-package-wiring.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/publish-package-wiring.test.ts tests/typeset-preflight.test.ts tests/kdp-pdf-export.test.ts tests/kdp-docx-plan.test.ts tests/typeset-plan.test.ts`
  - `npx tsc --noEmit --pretty false --skipLibCheck`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Publish package wiring now derives HTML, interior HTML, print CSS, layout manifest, cover brief, distribution manifest, Markdown, JSON, DOCX, print PDF, bibliography, bibliography report, and preflight report from the same canonical manuscript payload and normalized typeset plan. The package manifest now lists every generated KDP artifact, including `preflight-report.json`.
- Risks discovered: The package is now internally consistent, but artifact-level visual inspection is still deferred to 7.4/9.5. A future verification should open generated DOCX/PDF files and compare actual page geometry against the manifest.
- Blocker or next package: None for 7.3e. Package 7.3 KDP typesetting is complete. Next package is 7.4 Other exports.

### 2026-07-13 12:08 — Package 7.4

- Status: completed
- Objective: Generate Markdown, ebook-oriented source, production manifest, and preflight report from the same canonical manuscript.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/publish-package/route.ts`
  - `src/lib/manuscript-document.ts`
  - `tests/other-exports.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/other-exports.test.ts tests/publish-package-wiring.test.ts tests/typeset-preflight.test.ts tests/kdp-pdf-export.test.ts`
  - `npx tsc --noEmit --pretty false --skipLibCheck`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added ebook-oriented HTML source generated from canonical manuscript chapters and included it in the publish package. The package now also writes `production-manifest.json` tying canonical manuscript chapter keys, total words, typeset plan, bibliography report, preflight checks, included files, and print/ebook/data export profiles together. Markdown, manuscript JSON, ebook source, production manifest, and preflight report all derive from the same canonical manuscript payload used for DOCX/PDF.
- Risks discovered: Ebook source is HTML suitable for downstream EPUB tooling, not a packaged EPUB file. If a true `.epub` is required, add a later package with an EPUB builder dependency or verified local tool.
- Blocker or next package: None for 7.4. Next package is 7.5 Audiobook package.

### 2026-07-13 12:14 — Package 7.5

- Status: completed
- Objective: Generate narrator tone, pacing, emotional direction, pronunciation, acronym, chapter-break, quote/table, multi-voice, sensitive-passage, and production instructions.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/publish-package/route.ts`
  - `src/lib/audiobook-package.ts`
  - `tests/audiobook-package.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/audiobook-package.test.ts tests/other-exports.test.ts tests/publish-package-wiring.test.ts`
  - `npx tsc --noEmit --pretty false --skipLibCheck`
  - `npm run check`
  - `npm run build`
- Live provider spend: none
- Behavioral result: Added a deterministic audiobook production package generated from the canonical manuscript and book metadata. The package includes estimated runtime, narrator tone, pacing, emotional direction, multi-voice guidance, acronym and term pronunciation review lists, chapter-by-chapter recording notes, quote/table instructions, sensitive-passage guidance, and production instructions for an external AI audiobook agent or human narrator. Publish package now includes `audiobook-production-package.json` and `audiobook-production-package.md`, and the production manifest explicitly notes that synthesized audio is not included.
- Risks discovered: Pronunciation terms are deterministic candidates, not a human-confirmed pronunciation dictionary. A later UX/package could let the author approve pronunciations before sending to a narrator.
- Blocker or next package: None for 7.5. Milestone 7 Final production is complete. Next package is 8.1 Authoritative registry.

### 2026-07-13 11:55 — Package 8.1a

- Status: completed
- Objective: Make `workflow-registry.ts` authoritative for stage order, routes, labels, grouping, and book-type availability, generate stage tokens from it, and test registered route existence.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflow-registry.ts`
  - `src/lib/ui/stage-tokens.ts`
  - `tests/workflow-registry.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-registry.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The workflow registry now owns stage number and group metadata for nonfiction, fiction, and workbook flows. `stage-tokens.ts` is now a projection of the registry instead of a second hard-coded stage map. Registered workflow routes are covered by a route-existence test, and the stale fiction draft route now points to the actual `/books/[slug]/draft` page. Workbook Design now routes through the Book Studio SPA stage query instead of a non-existent standalone page.
- Risks discovered: This only completes the navigation/order slice. Artifact type maps, role maps, approval requirements, prerequisites, and dependency declarations still have duplicate local definitions and are intentionally deferred to 8.1b/8.1c.
- Blocker or next package: None for 8.1a. Next package is 8.1b Registry operational metadata.

### 2026-07-13 11:55 — Package 8.1b

- Status: completed
- Objective: Move roles, artifact types, approvals, prerequisites, and dependency declarations into registry-owned typed helpers so later callers can migrate off local maps safely.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflow-registry.ts`
  - `tests/workflow-registry.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-registry.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added `STAGE_OPERATIONAL_METADATA` plus typed helpers for primary artifact type, all stage artifact types, stage roles, approval mode, stale artifact types, and prerequisite stages derived from workflow order. Registry tests now verify these metadata helpers for every registered stage and check key Ghostwritr invariants such as chapter-level approvals for draft/editing, Phase 1 approval for Promise, and fiction/nonfiction prerequisite order.
- Risks discovered: Existing commit/save/dependency/routing callers still use their local maps. That duplication is now explicit and should be removed in 8.1c by replacing those call sites with the registry helpers.
- Blocker or next package: None for 8.1b. Next package is 8.1c Registry caller migration.

### 2026-07-13 11:55 — Package 8.1c

- Status: completed
- Objective: Migrate commit/save, status/label, and workflow stale-artifact callers to registry helpers instead of local stage maps.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/activity/route.ts`
  - `src/app/api/books/[slug]/agent-chat/commit/route.ts`
  - `src/app/api/books/[slug]/agent-chat/save-draft/route.ts`
  - `src/lib/workflow-dependencies.ts`
  - `tests/workflow-registry.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-registry.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The agent-chat commit and save-draft routes now resolve primary artifact type through `getPrimaryArtifactTypeForStage`. Dependency invalidation now resolves stale artifact types through `getStaleArtifactTypesForStage`. The activity endpoint now resolves stage labels through `getStageDefinitionForKey` instead of importing UI token arrays. Registry tests now guard against reintroducing the removed local maps.
- Risks discovered: Dependency affected-stage maps still live in `workflow-dependencies.ts`, and role call sites still call explicit stage roles. 8.1d/8.3 should either move those maps fully behind registry helpers or add stronger duplicate-map guardrails before deleting older paths.
- Blocker or next package: None for 8.1c. Next package is 8.1d Registry duplicate-map guardrails.

### 2026-07-13 11:55 — Package 8.1d

- Status: completed
- Objective: Add static tests that fail if the removed duplicate navigation, artifact-type, stale-artifact, or route maps are reintroduced outside the registry.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `tests/workflow-registry.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-registry.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Registry tests now explicitly reject the old hard-coded `STAGE_TOKENS`/`FICTION_STAGE_TOKENS` array pattern, local `STAGE_ARTIFACT_TYPE` maps in commit/save routes, local `STAGE_CHAPTER_ARTIFACT_TYPES` in dependency invalidation, and the stale `/fiction-draft` route. Parent Package 8.1 is now complete.
- Risks discovered: The guardrails are intentionally scoped to maps removed in 8.1. Broader simplification targets remain for 8.2 and 8.3, especially splitting monoliths and deleting redundant workflow/provider paths after call-site migration.
- Blocker or next package: None for 8.1d. Package 8.1 Authoritative registry is complete. Next package is 8.2 Split monoliths.

### 2026-07-13 11:55 — Package 8.2a

- Status: completed
- Objective: Add public entrypoint modules for Promise, Editing, Chapter Draft, and Research, then migrate app/scripts/tests imports to those entrypoints.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `scripts/autopilot-regression.ts`
  - `scripts/editing-trust-regression.ts`
  - `scripts/manuscript-length-regression.ts`
  - `scripts/promise-phase2-regression.ts`
  - `scripts/workspace-warning-regression.ts`
  - `src/app/api/books/[slug]/promise-export/route.ts`
  - `src/app/api/internal/workflow-runs/process/route.ts`
  - `src/app/books/[slug]/chapter-draft/actions.ts`
  - `src/app/books/[slug]/chapter-draft/page.tsx`
  - `src/app/books/[slug]/dashboard/fiction-dashboard.tsx`
  - `src/app/books/[slug]/dashboard/page.tsx`
  - `src/app/books/[slug]/editing/actions.ts`
  - `src/app/books/[slug]/editing/editing-detail-content.tsx`
  - `src/app/books/[slug]/fiction/actions.ts`
  - `src/app/books/[slug]/market-analysis/actions.ts`
  - `src/app/books/[slug]/promise/actions.ts`
  - `src/app/books/[slug]/promise/phase1-guided-journey-panel.tsx`
  - `src/app/books/[slug]/promise/promise-detail-content.tsx`
  - `src/app/books/[slug]/publish/actions.ts`
  - `src/app/books/[slug]/research/actions.ts`
  - `src/app/books/[slug]/research/evidence-room-content.tsx`
  - `src/lib/workflows/chapter-draft-public.ts`
  - `src/lib/workflows/editing-public.ts`
  - `src/lib/workflows/promise-public.ts`
  - `src/lib/workflows/research-public.ts`
  - `tests/workflow-public-entrypoints.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added stable public workflow entrypoints for the four monoliths and migrated app, script, and test imports away from direct monolith paths. A static test now ensures future callers import the `*-public` entrypoints so the monoliths can be split internally without broad caller churn.
- Risks discovered: This establishes stable seams but does not yet physically split the 18,715 lines across Promise, Editing, Chapter Draft, and Research. The next 8.2 subpackages should extract implementation by capability behind these entrypoints.
- Blocker or next package: None for 8.2a. Next package is 8.2b Promise capability split.

### 2026-07-13 12:04 — Package 8.2b1

- Status: completed
- Objective: Add Promise capability modules for generation, audience/personas, market analysis, report composition, and workspace orchestration, then route `promise-public.ts` through those modules.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise-public.ts`
  - `src/lib/workflows/promise/audience-personas.ts`
  - `src/lib/workflows/promise/generation.ts`
  - `src/lib/workflows/promise/market-analysis.ts`
  - `src/lib/workflows/promise/report-composition.ts`
  - `src/lib/workflows/promise/workspace.ts`
  - `tests/workflow-public-entrypoints.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Promise now has capability-level modules for generation, audience/personas, market analysis, report composition, and workspace orchestration. The stable public Promise entrypoint exports through those capability modules instead of directly re-exporting from the 9k-line monolith, giving later extraction work a reviewable seam without changing application imports.
- Risks discovered: The capability modules are currently facades over `promise.ts`; implementation movement remains for 8.2b2 through 8.2b4.
- Blocker or next package: None for 8.2b1. Next package is 8.2b2 Promise report composition extraction.

### 2026-07-13 12:04 — Package 8.2b2

- Status: blocked
- Objective: Move deterministic report parsing/composition helpers out of `promise.ts` into the report-composition module with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `sed -n '7800,8365p' src/lib/workflows/promise.ts`
  - Inspection only: `rg -n "composeBookPromiseReportFromMarkdown|BookPromiseReport|PromiseReport" ...`
- Live provider spend: none
- Behavioral result: No code movement for 8.2b2. The extraction target is entangled with private `promise.ts` schemas and helpers, including `BookPromiseReportSchema`, `fallbackBookPromiseReport`, `buildTruthPersonaContexts`, `buildBookPitchGroundingContext`, persona replacement helpers, and market normalization helpers. Moving only the exported composition function would require exporting or relocating a large private dependency chain and risks breaking Promise report persistence without a narrower preparatory package.
- Risks discovered: 8.2b2 should be split further into dependency-prep slices before implementation movement: first extract pure markdown parsing helpers, then report schema/fallback builders, then the composition function itself.
- Blocker or next package: Blocked for this heartbeat because the current 8.2b2 package is too broad to move safely without a preparatory split. Leaving 8.2b2 unchecked and routing around to independent 8.2c Research capability split.

### 2026-07-13 12:04 — Package 8.2c1

- Status: completed
- Objective: Add Research capability modules for agent pipeline, durable jobs, commits, workspace assembly, binder tabs, and idea clips, then route `research-public.ts` through those modules.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research-public.ts`
  - `src/lib/workflows/research/binder-tabs.ts`
  - `src/lib/workflows/research/commit.ts`
  - `src/lib/workflows/research/execution.ts`
  - `src/lib/workflows/research/idea-clips.ts`
  - `src/lib/workflows/research/jobs.ts`
  - `src/lib/workflows/research/workspace.ts`
  - `tests/workflow-public-entrypoints.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Research now has capability-level modules for execution, durable jobs, commits, workspace assembly, binder tabs, and idea clips. The stable public Research entrypoint exports through those capability modules instead of directly re-exporting from the monolith, giving later extraction work a stable seam without changing application imports.
- Risks discovered: The Research capability modules are currently facades over `research.ts`; implementation movement remains for 8.2c2 through 8.2c4.
- Blocker or next package: None for 8.2c1. Next independent package is 8.2c2 Research workspace extraction.

### 2026-07-13 12:04 — Package 8.2c2

- Status: blocked
- Objective: Move workspace assembly helpers behind the workspace module with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `sed -n '2520,2805p' src/lib/workflows/research.ts`
  - Inspection only: `rg -n "getResearchWorkspace|getChapterResearchWorkspace|..." src/lib/workflows/research.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2c2. `getResearchWorkspace` and `getChapterResearchWorkspace` depend on private research parsers, profilers, binder synchronization, chapter seed assembly, schema parsing, dossier status helpers, and source normalization. Moving only the exported workspace functions would require exporting or relocating a large private helper chain without focused tests around those helpers.
- Risks discovered: 8.2c2 should be split further before implementation movement: first extract pure workspace normalization helpers, then chapter seed assembly, then workspace orchestration.
- Blocker or next package: Blocked for this heartbeat because the current 8.2c2 package is too broad to move safely without preparatory helper extraction. Leaving 8.2c2 unchecked and routing around to independent 8.2d Chapter Draft capability split.

### 2026-07-13 15:53 — Package 8.2c2a

- Status: completed
- Objective: Split blocked Research workspace extraction into smaller subpackages and move pure workspace-support helpers behind the workspace module.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/workspace-support.ts`
  - `tests/research-workspace-support.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `getDossierStatus` and `normalizeWorkspaceResearchSource` now live in `research/workspace-support.ts`, with tests covering drafting thresholds and Prisma research-source normalization into chapter-source shape. The main Research workspace still calls the helpers with unchanged behavior.
- Risks discovered: The remaining 8.2c2 workspace orchestration still depends on committed outline/base-story loading, binder tab synchronization, dossier parsing, source grouping, and stage metadata progress assembly, so the parent remains unchecked until its subpackages are completed.
- Blocker or next package: Next package is 8.2c2b Research workspace chapter seed assembly.

### 2026-07-13 16:02 — Package 8.2c2b

- Status: completed
- Objective: Move Research workspace chapter seed filtering, base-story readiness guard, and committed outline/paragraph/base-story seed assembly behind the Research workspace module.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/chapter-seeds.ts`
  - `tests/research-chapter-seeds.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-workspace-support.test.ts tests/research-chapter-seeds.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `isRealChapter`, `getWorkspaceChapterSeeds`, `assertBaseStoryReadyForResearch`, and `getResearchChapterSeeds` now live in `research/chapter-seeds.ts`. The monolith imports the helpers for existing execution, commit, and workspace paths, preserving behavior while exposing a smaller testable chapter-seed seam.
- Risks discovered: `getResearchChapterSeeds` still performs repository reads, so focused behavioral tests cover the pure seed filtering and paragraph-outline precedence while TypeScript covers the moved repository-wired helper.
- Blocker or next package: Next package is 8.2c2c Research chapter workspace assembly.

### 2026-07-13 16:08 — Package 8.2c2c

- Status: completed
- Objective: Move single-chapter Research workspace assembly behind the Research workspace module while preserving artifact schema validation and committed-version handling.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/workspace.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-workspace-support.test.ts tests/research-chapter-seeds.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `getChapterResearchWorkspace` now lives in `research/workspace.ts`. The function still resolves book/stage, loads research pack versions, parses dossiers with `ChapterResearchDossierSchema`, flags invalid content, identifies committed versions, and returns verification counts. Stale monolith imports for chapter-workspace repositories were removed.
- Risks discovered: `research/workspace.ts` still temporarily re-exports broad `getResearchWorkspace` from the monolith; this remains until 8.2c2d/8.2c2e complete the full workspace orchestration move.
- Blocker or next package: Next package is 8.2c2d Research binder workspace summaries.

### 2026-07-13 16:18 — Package 8.2c2d

- Status: completed
- Objective: Move broad Research workspace orchestration, binder tab summaries, selected-tab resolution, dossier-entry assembly, warning assembly, progress calculation, and workspace profiling behind the Research workspace module.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/workspace.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-workspace-support.test.ts tests/research-chapter-seeds.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `getResearchWorkspace` now lives in `research/workspace.ts`, including binder tab synchronization/loading, selected-tab resolution, version/dossier/source grouping, dossier entry status assembly, invalid artifact warnings, tab summaries, progress metadata, and profiler logging. The Research monolith imports the workspace function only for its legacy local binder helpers.
- Risks discovered: The monolith still retains duplicate binder workflow functions that are also owned by `research/binder-tabs.ts`; removing those duplicate legacy exports belongs to later duplicate-path cleanup, not this workspace extraction.
- Blocker or next package: Next package is 8.2c2e Research workspace facade cleanup.

### 2026-07-13 16:21 — Package 8.2c2e

- Status: completed
- Objective: Remove remaining temporary Research workspace facade re-exports after the workspace implementations moved into `research/workspace.ts`.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `rg -n "export \\{ getResearchWorkspace \\} from \\\"\\.\\./research\\\"|from \\\"\\.\\./research\\\"|getChapterResearchWorkspace|getResearchWorkspace" src/lib/workflows/research/workspace.ts src/lib/workflows/research-public.ts src/lib/workflows/research.ts`
  - `npx tsx --test tests/research-workspace-support.test.ts tests/research-chapter-seeds.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/workspace.ts` now owns both `getChapterResearchWorkspace` and `getResearchWorkspace`; no temporary workspace re-export from the monolith remains. Parent package 8.2c2 is complete.
- Risks discovered: The Research parent package 8.2c remains unchecked because 8.2c4 execution extraction is still open.
- Blocker or next package: Next unchecked package is 8.2c4 Research execution extraction.

### 2026-07-13 12:04 — Package 8.2d1

- Status: completed
- Objective: Add Chapter Draft capability modules for execution, repair/expansion, durable jobs, commits, and workspace assembly, then route `chapter-draft-public.ts` through those modules.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft-public.ts`
  - `src/lib/workflows/chapter-draft/commit.ts`
  - `src/lib/workflows/chapter-draft/execution.ts`
  - `src/lib/workflows/chapter-draft/jobs.ts`
  - `src/lib/workflows/chapter-draft/repair.ts`
  - `src/lib/workflows/chapter-draft/workspace.ts`
  - `tests/workflow-public-entrypoints.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Chapter Draft now has capability-level modules for execution, repair/expansion, durable jobs, commits, and workspace assembly. The stable public Chapter Draft entrypoint exports through those capability modules instead of directly re-exporting from the monolith.
- Risks discovered: The Chapter Draft capability modules are currently facades over `chapter-draft.ts`; implementation movement remains for 8.2d2 through 8.2d4.
- Blocker or next package: None for 8.2d1. Next independent package is 8.2d2 Chapter Draft workspace/context extraction.

### 2026-07-13 12:15 — Package 8.2e1

- Status: completed
- Objective: Add Editing capability modules for manuscript assembly, assessment, revision, publishing handoff, chat/preferences, commit/loop, and workspace assembly, then route `editing-public.ts` through those modules.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing-public.ts`
  - `src/lib/workflows/editing/assembly.ts`
  - `src/lib/workflows/editing/assessment.ts`
  - `src/lib/workflows/editing/commit.ts`
  - `src/lib/workflows/editing/interaction.ts`
  - `src/lib/workflows/editing/publishing.ts`
  - `src/lib/workflows/editing/revision.ts`
  - `src/lib/workflows/editing/workspace.ts`
  - `tests/workflow-public-entrypoints.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Editing now has capability-level modules for manuscript assembly, assessment, revision, publishing handoff, chat/preferences, commit/loop, and workspace assembly. The stable public Editing entrypoint exports through those capability modules instead of directly re-exporting from the monolith.
- Risks discovered: The Editing capability modules are currently facades over `editing.ts`; implementation movement remains for 8.2e2 through 8.2e4.
- Blocker or next package: None for 8.2e1. Next independent package is 8.2e2 Editing workspace extraction.

### 2026-07-13 12:15 — Package 8.2e2

- Status: blocked
- Objective: Move workspace assembly behind the workspace module with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `sed -n '3300,3525p' src/lib/workflows/editing.ts`
  - Inspection only: `rg -n "getEditingWorkspace|parse|normalize|assemble|revision|approved|chapter|final" src/lib/workflows/editing.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2e2. `getEditingWorkspace` depends on private editing parsers, schemas, chapter-loading helpers, readiness gates, revision queue parsing, publishing sync state, final handoff state, and draft quality rollups. Moving only the exported workspace function would require exporting or relocating a large private helper chain without focused tests around those helpers.
- Risks discovered: 8.2e2 should be split further before implementation movement: first extract pure parse/summary helpers, then chapter-loading/readiness helpers, then workspace orchestration.
- Blocker or next package: Blocked because the remaining 8.2 implementation-extraction slices require preparatory helper splits before safe code movement. Stop here with checklist and ledger current.

### 2026-07-13 12:25 — Package 8.2b2a

- Status: completed
- Objective: Extract pure markdown label, section, executive-summary, and numbered-list parsing helpers from `promise.ts` with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/report-markdown.ts`
  - `tests/promise-report-markdown.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Promise report markdown parsing helpers now live in `src/lib/workflows/promise/report-markdown.ts` instead of inside the 9k-line Promise monolith. `promise.ts` imports the helpers, including the regex escaping used by persona-name replacement. Focused tests cover labeled values, literal punctuation in headings, numbered lists, executive-summary cleanup, and fallback behavior.
- Risks discovered: This only extracts the pure markdown parser layer. The report fallback builders and composition function remain in `promise.ts` until 8.2b2b/8.2b2c.
- Blocker or next package: None for 8.2b2a. Next package is 8.2b2b Promise report fallback helpers.

### 2026-07-13 12:25 — Package 8.2b2b

- Status: blocked
- Objective: Extract fallback report and audience-profile helper dependencies with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `sed -n '7600,7845p' src/lib/workflows/promise.ts`
  - Inspection only: `rg -n "function (fallbackBookPromiseReport|buildBookPitch...)" src/lib/workflows/promise.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2b2b. The fallback report builder is still entangled with private audience-profile builders, truth persona contexts, title/subtitle selection, large markdown rendering, market/recommendation normalization, and grounding context helpers. Moving it safely requires extracting those helper clusters first.
- Risks discovered: 8.2b2b needs additional prep slices before code movement: audience-profile helpers, title/subtitle helpers, and fallback markdown rendering should move separately before `fallbackBookPromiseReport` moves.
- Blocker or next package: Blocked for this heartbeat. Leaving 8.2b2b unchecked and routing around to independent 8.2c3 Research binder extraction.

### 2026-07-13 12:25 — Package 8.2c3

- Status: completed
- Objective: Move binder tab and idea clip operations behind Research binder/idea modules with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research/binder-tabs.ts`
  - `src/lib/workflows/research/idea-clips.ts`
  - `tests/workflow-public-entrypoints.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Research binder tab and idea clip workflow operations now live in their capability modules instead of re-exporting from `research.ts`. The public-entrypoint regression now guards against these modules silently falling back to the monolith facade.
- Risks discovered: Binder tab run/commit still call the Research execution and commit capability modules, so 8.2c4 remains the larger live-research execution split.
- Blocker or next package: None for 8.2c3. Next package inspected was 8.2c4 Research execution extraction.

### 2026-07-13 12:25 — Package 8.2c4

- Status: blocked
- Objective: Move research agent pipeline and durable job processing behind execution/job modules while preserving gateway attribution.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `sed -n '1980,2470p' src/lib/workflows/research.ts`
  - Inspection only: `rg -n "export async function (runChapterResearchWorkflow|runFullResearchWorkflow|enqueueAndTriggerFullResearchWorkflow|enqueueFullResearchWorkflow|getUnfinishedResearchChapterKeys|processWorkflowRun)" src/lib/workflows/research.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2c4. The extraction target is the live research execution and durable job path, including LLM/web research, provisional fallback behavior, retry/cancellation loops, stage metadata, workflow leases, and quality-agent side effects.
- Risks discovered: 8.2c4 should be split into smaller preparatory slices before movement: chapter execution wrapper, full-run orchestration, durable job enqueue/claim/complete, and unfinished-chapter discovery.
- Blocker or next package: Blocked for this heartbeat. Leaving 8.2c4 unchecked and routing around to independent 8.2d2 Chapter Draft workspace/context extraction.

### 2026-07-13 12:25 — Package 8.2d2

- Status: blocked
- Objective: Move Chapter Draft workspace and canonical context assembly behind dedicated modules with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `sed -n '1,220p' src/lib/workflows/chapter-draft/workspace.ts`
  - Inspection only: `sed -n '1180,1325p' src/lib/workflows/chapter-draft.ts`
  - Inspection only: `sed -n '3000,3238p' src/lib/workflows/chapter-draft.ts`
  - Inspection only: `rg -n "export async function getChapterDraftWorkspace|function (getCanonical|build.*Context|parse|workspace|chapter|manifest)" src/lib/workflows/chapter-draft.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2d2. `getChapterDraftWorkspace` depends on private canonical context assembly, draft-input loading, readiness validation, artifact parsing, approval state, source availability, chapter metrics, and author-facing Quill summaries.
- Risks discovered: 8.2d2 needs preparatory helper slices before movement: pure metrics/readiness summary helpers, source availability helpers, approval-state projection, then workspace orchestration.
- Blocker or next package: Blocked for this heartbeat. Remaining 8.2 implementation-extraction packages need additional prep slices before safe code movement, so stop here with checklist and ledger current.

### 2026-07-13 12:35 — Package 8.2b2b1

- Status: completed
- Objective: Extract title/subtitle, audience profile, voice summary, and markdown list helpers with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/report-presentation.ts`
  - `tests/promise-report-presentation.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Promise report presentation helpers now live in `src/lib/workflows/promise/report-presentation.ts` instead of inside the Promise monolith. The monolith imports the shared title/subtitle, audience-profile, voice summary, target-audience summary, and markdown list helpers while retaining existing report behavior.
- Risks discovered: This isolates only the presentation layer. The fallback markdown renderer and fallback report builder remain in `promise.ts` until 8.2b2b2 and 8.2b2b3.
- Blocker or next package: None for 8.2b2b1. Next package is 8.2b2b2 Promise report rendering helpers.

### 2026-07-13 12:35 — Package 8.2b2b2

- Status: blocked
- Objective: Extract fallback markdown rendering dependencies after presentation helpers are isolated.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `sed -n '6610,6905p' src/lib/workflows/promise.ts`
  - Inspection only: `sed -n '6900,7075p' src/lib/workflows/promise.ts`
  - Inspection only: `sed -n '7000,7705p' src/lib/workflows/promise.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2b2b2. The target is not a small renderer helper; it is the full Book Pitch fallback markdown template, spanning executive summary, audience/personas, transformation journey, competitive landscape, market opportunity, business model, launch strategy, financials, KPIs, recommendations, and appendices.
- Risks discovered: Moving the full template in one autonomous package would create a large review surface and couple the new module to transformation/core-truth/market/recommendation shape assumptions all at once. Split first into smaller render sections: executive/book vision, audience/personas, transformation/competitive landscape, market/business/launch, financial/KPI/recommendations.
- Blocker or next package: Blocked for this heartbeat. Leaving 8.2b2b2 unchecked and checking the next independent Promise package, 8.2b3.

### 2026-07-13 12:35 — Package 8.2b3

- Status: blocked
- Objective: Move Promise workspace assembly and commit/run orchestration behind the workspace module without changing public API behavior.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `sed -n '1,220p' src/lib/workflows/promise/workspace.ts`
  - Inspection only: `sed -n '8560,8655p' src/lib/workflows/promise.ts`
  - Inspection only: `sed -n '8728,8788p' src/lib/workflows/promise.ts`
  - Inspection only: `rg -n "export async function getPromiseWorkspace|function (getPromiseWorkspace|build.*Workspace|parse.*Approval|normalizePromisePhaseStatus|getDefaultPromisePhaseApprovals|readPromisePhaseApprovals|serializePromisePhaseApprovals)|PromisePhaseApprovals|PROMISE_TAB_ORDER" src/lib/workflows/promise.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2b3. Promise workspace extraction crosses repository loading, source documents, stage metadata approvals, artifact availability, artifact parsing, fallback generation, title/package normalization, strategic brief state, direction events, and Book Promise report normalization.
- Risks discovered: 8.2b3 needs preparatory slices before movement: phase approval helpers, artifact availability projection, parsed artifact bundle assembly, and final workspace orchestration.
- Blocker or next package: Blocked for this heartbeat. Stop here because the next remaining Promise/Research/Chapter Draft/Editing implementation-extraction packages are known broad seams that need explicit sub-slicing before safe movement.

### 2026-07-13 12:45 — Package 8.2b2b2a

- Status: completed
- Objective: Extract the executive summary and Book Vision fallback markdown section with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/report-rendering.ts`
  - `tests/promise-report-rendering.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-rendering.test.ts tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The fallback Book Pitch executive summary and Book Vision markdown renderer now lives in `src/lib/workflows/promise/report-rendering.ts`. The Promise monolith delegates the opening report section to that renderer while retaining the remaining fallback report sections in place.
- Risks discovered: The remaining fallback markdown template still contains several section clusters. They should continue moving one section group at a time to keep review size small and tests focused.
- Blocker or next package: None for 8.2b2b2a. Next package is 8.2b2b2b Promise report audience/transformation renderer.

### 2026-07-13 12:45 — Package 8.2b2b2b

- Status: completed
- Objective: Extract the Audience & Personas and Transformation Journey fallback markdown sections with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/report-rendering.ts`
  - `tests/promise-report-rendering.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-rendering.test.ts tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The fallback Book Pitch Audience & Personas and Transformation Journey markdown renderer now lives in `src/lib/workflows/promise/report-rendering.ts`. The Promise monolith delegates the first three report sections to dedicated renderers and retains later market, business, launch, financial, recommendations, and appendix sections.
- Risks discovered: The next renderer slice spans four related sections: Competitive Landscape, Market Opportunity, Business Model, and Launch Strategy. Keep it as one section group only if the extraction remains mechanical and fully covered by focused boundary tests.
- Blocker or next package: None for 8.2b2b2b. Next package is 8.2b2b2c Promise report market/business/launch renderer.

### 2026-07-13 12:45 — Package 8.2b2b2c

- Status: completed
- Objective: Extract the Competitive Landscape, Market Opportunity, Business Model, and Launch Strategy fallback markdown sections with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/report-rendering.ts`
  - `tests/promise-report-rendering.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-rendering.test.ts tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The fallback Book Pitch Competitive Landscape, Market Opportunity, Business Model, and Launch Strategy markdown renderer now lives in `src/lib/workflows/promise/report-rendering.ts`. The Promise monolith delegates sections 1 through 7 to dedicated renderers and retains only financial projections, success metrics, recommendations, and appendices in the local fallback template.
- Risks discovered: The final rendering slice should be small enough to finish the fallback markdown extraction, but it still touches recommendation and appendix wording. Keep focused boundary tests around section starts and the appendices.
- Blocker or next package: None for 8.2b2b2c. Next package is 8.2b2b2d Promise report financial/recommendations renderer.

### 2026-07-13 12:45 — Package 8.2b2b2d

- Status: completed
- Objective: Extract Financial Projections, Success Metrics, Recommendations, and Appendices fallback markdown sections with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/report-rendering.ts`
  - `tests/promise-report-rendering.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-rendering.test.ts tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The fallback Book Pitch Financial Projections, Success Metrics, Recommendations, and Appendices markdown renderer now lives in `src/lib/workflows/promise/report-rendering.ts`. The local `fallbackBookPitchMarkdown` composer in `promise.ts` now delegates every report section to dedicated renderer helpers.
- Risks discovered: The rendering helper extraction is complete. The next package, 8.2b2b3, changes function ownership by moving the fallback report builder/composer, so it should begin with a fresh inspection of exported dependencies and tests.
- Blocker or next package: None for 8.2b2b2d. Next package is 8.2b2b3 Promise fallback report builder.

### 2026-07-13 12:56 — Package 8.2b2b3

- Status: completed
- Objective: Move `fallbackBookPromiseReport` after its helper dependencies are extracted.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/report-fallback.ts`
  - `tests/promise-report-fallback.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-fallback.test.ts tests/promise-report-rendering.test.ts tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The deterministic fallback Book Promise report builder now lives in `src/lib/workflows/promise/report-fallback.ts`. The Promise monolith imports the fallback builder instead of owning the fallback report and markdown composer directly.
- Risks discovered: The first focused test run exposed an incomplete test fixture for the core-truth shape; the fixture was corrected and the full focused suite then passed. Report normalization and markdown-to-report composition still remain in `promise.ts`.
- Blocker or next package: None for 8.2b2b3. Next package is 8.2b2c Promise report composition move.

### 2026-07-13 12:56 — Package 8.2b2c1

- Status: completed
- Objective: Extract legacy markdown fallback, named-audience detection, and persona-name replacement helpers with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/report-composition-helpers.ts`
  - `tests/promise-report-composition-helpers.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-composition-helpers.test.ts tests/promise-report-fallback.test.ts tests/promise-report-rendering.test.ts tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Pure Promise report composition helpers now live in `src/lib/workflows/promise/report-composition-helpers.ts`. The Promise monolith imports legacy markdown fallback rendering, named-audience detection, and persona-name replacement helpers instead of owning them locally.
- Risks discovered: The first focused test expectation assumed empty legacy values would return `fallback.documentMarkdown`; existing behavior renders fallback fields into a legacy-style report instead. The test was corrected to preserve current behavior.
- Blocker or next package: None for 8.2b2c1. Next package is 8.2b2c2 Promise report composition grounding dependencies.

### 2026-07-13 12:56 — Package 8.2b2c2

- Status: blocked
- Objective: Extract or adapt persona context and grounding-context dependencies needed by markdown composition.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `rg -n "function (buildBookPitchGroundingContext|buildTruthPersonaContexts|build.*GroundingContext)|type TruthPersonaContext|type .*Grounding" src/lib/workflows/promise.ts`
  - Inspection only: `sed -n '5120,5225p' src/lib/workflows/promise.ts`
  - Inspection only: `sed -n '6510,6688p' src/lib/workflows/promise.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2b2c2. `composeBookPromiseReportFromMarkdown` still depends on `buildTruthPersonaContexts` and `buildBookPitchGroundingContext`; those in turn depend on shared normalization, title, audience, truth, market, recommendations, and setup grounding helper chains.
- Risks discovered: Moving the full grounding dependency chain as one package would create a large review surface and risk breaking model prompt payloads. Split further before implementation: first extract `buildTruthPersonaContexts` and `normalizeTruthVoice`, then extract a small `BookPitchGroundingMetadata` builder that returns only `previousPhases` and `audienceSignals` needed by composition, leaving full prompt payload generation for the model-generation package.
- Blocker or next package: Blocked for this heartbeat. Leaving 8.2b2c2 unchecked; the next independent packages in 8.2b3/8.2b4 and other monolith splits are already known broad seams requiring additional prep slices.

### 2026-07-13 13:09 — Package 8.2b2c2a

- Status: completed
- Objective: Extract Promise report persona-context helpers needed by report composition without moving the broader grounding prompt payload chain.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/report-persona-context.ts`
  - `tests/promise-report-persona-context.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-persona-context.test.ts tests/promise-report-composition-helpers.test.ts tests/promise-report-fallback.test.ts tests/promise-report-rendering.test.ts tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `normalizeTruthVoice` and `buildTruthPersonaContexts` now live in `src/lib/workflows/promise/report-persona-context.ts`; the Promise monolith imports them and retains current behavior for truth/persona grounding and report normalization.
- Risks discovered: No behavior drift found. The remaining 8.2b2c2 work still needs a narrower composition-only grounding metadata extraction before moving `composeBookPromiseReportFromMarkdown`.
- Blocker or next package: None for 8.2b2c2a. Next package is 8.2b2c2b Promise report composition grounding metadata.

### 2026-07-13 13:10 — Package 8.2b2c2b

- Status: completed
- Objective: Extract the composition-only grounding metadata contract used by `composeBookPromiseReportFromMarkdown`.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/report-grounding-metadata.ts`
  - `tests/promise-report-grounding-metadata.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-grounding-metadata.test.ts tests/promise-report-persona-context.test.ts tests/promise-report-composition-helpers.test.ts tests/promise-report-fallback.test.ts tests/promise-report-rendering.test.ts tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `buildBookPitchCompositionGroundingMetadata` now owns the report-composition metadata shape for `previousPhases`, `audienceSignals`, and carried-forward `kbSources`. `composeBookPromiseReportFromMarkdown` uses that helper for persisted metadata while still relying on the existing full grounding context until the handoff slice.
- Risks discovered: None in the focused tests. The next slice must remove the markdown composition function's direct dependence on the full `buildBookPitchGroundingContext` payload builder.
- Blocker or next package: None for 8.2b2c2b. Next package is 8.2b2c2c Promise report composition grounding handoff.

### 2026-07-13 13:12 — Package 8.2b2c2c

- Status: completed
- Objective: Rewire markdown composition to depend only on extracted composition-grounding helpers, leaving full model prompt payload generation in place.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/report-grounding-metadata.ts`
  - `tests/promise-report-grounding-metadata.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-grounding-metadata.test.ts tests/promise-report-persona-context.test.ts tests/promise-report-composition-helpers.test.ts tests/promise-report-fallback.test.ts tests/promise-report-rendering.test.ts tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `composeBookPromiseReportFromMarkdown` now builds its metadata through `buildBookPitchCompositionGroundingContext` and `buildBookPitchCompositionGroundingMetadata`; the full `buildBookPitchGroundingContext` prompt payload builder remains available for `maybeGenerateBookPromiseReport`.
- Risks discovered: No behavior drift found in focused grounding tests. The composition function still lives in the monolith until the 8.2b2c3 move.
- Blocker or next package: None for 8.2b2c2c. Next package is 8.2b2c3 Promise report composition function move.

### 2026-07-13 13:16 — Package 8.2b2c3

- Status: completed
- Objective: Move `composeBookPromiseReportFromMarkdown` into the Promise report-composition capability module after its helper dependencies were extracted.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation.ts`
  - `src/lib/workflows/promise-public.ts`
  - `src/lib/workflows/promise/report-composition.ts`
  - `src/lib/workflows/promise/report-schema.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-report-grounding-metadata.test.ts tests/promise-report-persona-context.test.ts tests/promise-report-composition-helpers.test.ts tests/promise-report-fallback.test.ts tests/promise-report-rendering.test.ts tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `src/lib/workflows/promise/report-composition.ts` now owns the real `composeBookPromiseReportFromMarkdown` implementation instead of re-exporting it from the monolith. Shared report validation and market-decision normalization moved into `report-schema.ts`. `maybeGenerateBookPromiseReport` remains in the monolith but is exported through the generation facade to avoid a circular report-composition import.
- Risks discovered: No focused test or TypeScript regressions found. The next Promise split package remains broad: `maybeGenerateBookPromiseReport` still depends on model generation, fallback composition, grounding, knowledge-base retrieval, and LLM routing.
- Blocker or next package: None for 8.2b2c3. Parent packages 8.2b2c and 8.2b2 are complete. Next package is 8.2b3 Promise workspace extraction.

### 2026-07-13 13:17 — Package 8.2b3a

- Status: completed
- Objective: Extract the Promise workspace artifact availability projection from `getPromiseWorkspace`.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/workspace-assembly.ts`
  - `tests/promise-workspace-assembly.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-workspace-assembly.test.ts tests/promise-report-grounding-metadata.test.ts tests/promise-report-persona-context.test.ts tests/promise-report-composition-helpers.test.ts tests/promise-report-fallback.test.ts tests/promise-report-rendering.test.ts tests/promise-report-presentation.test.ts tests/promise-report-markdown.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `buildPromiseArtifactAvailability` now lives in `src/lib/workflows/promise/workspace-assembly.ts`; `getPromiseWorkspace` delegates the artifact availability flags to it.
- Risks discovered: None in focused tests. Remaining 8.2b3 slices still include source document projection, parsed artifact bundle assembly, and moving orchestration behind the workspace facade.
- Blocker or next package: None for 8.2b3a. Next package is 8.2b3b Promise workspace source document projection.

### 2026-07-13 13:18 — Package 8.2b3b

- Status: completed
- Objective: Extract the Promise workspace source document view-model projection from `getPromiseWorkspace`.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/workspace-assembly.ts`
  - `tests/promise-workspace-assembly.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-workspace-assembly.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `mapPromiseWorkspaceSourceDocuments` now owns the source-document projection, including the default `enabled: true` behavior and string-only `note` extraction. `getPromiseWorkspace` delegates source document shaping to the workspace assembly helper.
- Risks discovered: None in focused tests. The next package, 8.2b3c, is broader because parsed artifact bundle assembly depends on fallback generation, artifact normalization, phase approval state, strategic brief metadata, and title/report normalization.
- Blocker or next package: None for 8.2b3b. Next package is 8.2b3c Promise workspace parsed artifact bundle.

### 2026-07-13 13:18 — Package 8.2b3c

- Status: blocked
- Objective: Extract parsed Promise artifacts and fallback assembly behind focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `rg -n "const (conversation|bookSetupProfile|promiseBrief|scorecard|personaPack|audienceResearch|personaContexts|coreTruths|transformationArc|marketReport|recommendations|titleSubtitleFinalization|bookPromiseReport|phaseApprovals|parsedPromiseVersions|compareVersions)|normalizePromisePhaseApprovals|normalize(BookSetupProfile|CoreTruthsArtifact|TransformationArtifact|MarketReport|RecommendationsArtifact|TitleSubtitleFinalization|BookPromiseReportArtifact)|fallback(PromiseExtraction|Scorecard|PersonaPack|Recommendations)|createFallbackMarketReport" src/lib/workflows/promise.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2b3c. The parsed workspace bundle still spans conversation parsing, setup profile normalization, Promise brief fallback, scorecard/persona fallbacks, audience research, truth/transformation normalization, market/recommendation fallback chains, title finalization, Book Promise report normalization, phase approvals, and version comparison assembly.
- Risks discovered: Moving the parsed bundle as one unit would create a large review surface and risks subtle workspace regression. Split 8.2b3c further before implementation: phase approval helpers, Promise version comparison helpers, normalized artifact bundle assembly, then final workspace return assembly.
- Blocker or next package: Blocked for this heartbeat. Leaving 8.2b3c unchecked; 8.2b3d depends on the parsed bundle, and 8.2b4 overlaps the same broad generation/normalization seams, so there is no safe later independent package to route around in this run.

### 2026-07-13 13:21 — Package 8.2b3c1

- Status: completed
- Objective: Extract Promise phase approval defaults and normalization with focused tests.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/workspace-assembly.ts`
  - `tests/promise-workspace-assembly.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-workspace-assembly.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Promise phase approval order, defaults, and metadata normalization now live in `workspace-assembly.ts`; commit gating and workspace assembly import the shared normalized tab order and helper.
- Risks discovered: None in focused tests. The app action file still has its own Promise tab order and approval normalization; this package only moves the workflow helper as scoped.
- Blocker or next package: None for 8.2b3c1. Next package is 8.2b3c2 Promise workspace version comparison helpers.

### 2026-07-13 13:22 — Package 8.2b3c2

- Status: completed
- Objective: Extract parsed Promise version projection and version comparison assembly with focused tests.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/workspace-assembly.ts`
  - `tests/promise-workspace-assembly.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-workspace-assembly.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Promise version projection and latest/previous comparison now live in `workspace-assembly.ts`; `getPromiseWorkspace` keeps caller-owned JSON parsing/fallbacks but delegates the repeatable version shape and comparison.
- Risks discovered: None in focused tests. The normalized artifact bundle remains the largest remaining 8.2b3c slice.
- Blocker or next package: None for 8.2b3c2. Next package is 8.2b3c3 Promise workspace normalized artifact bundle.

### 2026-07-13 13:23 — Package 8.2b3c3a

- Status: completed
- Objective: Extract artifact lookup and conversation-message parsing helpers with focused tests.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/workspace-assembly.ts`
  - `tests/promise-workspace-assembly.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-workspace-assembly.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Promise workspace artifact-map creation and PROMISE_CHAT conversation parsing now live in `workspace-assembly.ts`; conversation parsing accepts only valid user/assistant messages before workspace fallback generation uses them.
- Risks discovered: This is a small safety hardening over the old blind cast. Remaining b3c3 work still needs base artifact parsing and downstream normalization handoff.
- Blocker or next package: None for 8.2b3c3a. Next package is 8.2b3c3b Promise workspace base artifact parsing.

### 2026-07-13 13:24 — Package 8.2b3c3b

- Status: completed
- Objective: Extract setup, Promise, scorecard, persona, and audience parsing orchestration with focused tests.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/workspace-assembly.ts`
  - `tests/promise-workspace-assembly.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-workspace-assembly.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `buildPromiseWorkspaceBaseArtifacts` now owns the base artifact selection/order for setup, promise brief, scorecard, persona pack, and audience research. The monolith still owns the actual parser/fallback callbacks.
- Risks discovered: None in focused tests. Downstream artifact normalization still depends on persona contexts, market/recommendation fallbacks, title finalization, and Book Promise report normalization.
- Blocker or next package: None for 8.2b3c3b. Next package is 8.2b3c3c Promise workspace downstream artifact normalization.

### 2026-07-13 13:27 — Package 8.2b3c3c

- Status: completed
- Objective: Extract truth, transformation, market, recommendations, title, and Book Promise report normalization handoff.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/workspace-assembly.ts`
  - `tests/promise-workspace-assembly.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-workspace-assembly.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `buildPromiseWorkspaceDownstreamArtifacts` now owns downstream artifact dependency order for persona contexts, core truths, transformation, market, recommendations, title finalization, and Book Promise report selection. The monolith still owns actual normalization/fallback callbacks.
- Risks discovered: TypeScript caught an overly narrow phase2 persona type during extraction; corrected the helper to accept `PersonaDeepProfile[] | undefined`.
- Blocker or next package: None for 8.2b3c3c. Parent package 8.2b3c3 is complete. Next package is 8.2b3c4 Promise workspace return assembly.

### 2026-07-13 13:28 — Package 8.2b3c4

- Status: completed
- Objective: Rewire `getPromiseWorkspace` to consume extracted bundle helpers for final return assembly.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/workspace-assembly.ts`
  - `tests/promise-workspace-assembly.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-workspace-assembly.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `buildPromiseWorkspaceResult` now assembles the public Promise workspace shape from source documents, base artifacts, downstream artifacts, phase approvals, artifact availability, direction events, versions, comparison state, and Phase 1 strategic brief summary.
- Risks discovered: None in focused tests. `getPromiseWorkspace` still performs DB loading and supplies parser callbacks; the final function move remains in 8.2b3d.
- Blocker or next package: None for 8.2b3c4. Parent package 8.2b3c is complete. Next package is 8.2b3d Promise workspace orchestration move.

### 2026-07-13 13:30 — Package 8.2b3d1

- Status: completed
- Objective: Move `commitPromiseWorkflow` implementation behind the workspace module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/workspace.ts`
  - `tests/workflow-public-entrypoints.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-public-entrypoints.test.ts tests/promise-workspace-assembly.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `commitPromiseWorkflow` now lives in `src/lib/workflows/promise/workspace.ts`, uses shared Promise phase approval normalization, and is no longer re-exported from the monolith through the workspace module.
- Risks discovered: None in focused tests. `runPromiseWorkflow` remains graph-bound in the monolith and should not move with workspace commit orchestration.
- Blocker or next package: None for 8.2b3d1. Next package is 8.2b3d2 Promise outline workspace orchestration.

### 2026-07-13 13:31 — Package 8.2b3d2

- Status: completed
- Objective: Move `getOutlineWorkspace` implementation behind the workspace module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/workspace.ts`
  - `tests/workflow-public-entrypoints.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-public-entrypoints.test.ts tests/promise-workspace-assembly.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `getOutlineWorkspace` now lives in `src/lib/workflows/promise/workspace.ts`; the workspace module no longer re-exports it from the monolith.
- Risks discovered: None in focused tests. `getPromiseWorkspace` remains larger because it still depends on private parser/fallback helpers in the monolith.
- Blocker or next package: None for 8.2b3d2. Next package is 8.2b3d3 Promise workspace loader orchestration.

### 2026-07-13 13:32 — Package 8.2b3d3

- Status: blocked
- Objective: Move `getPromiseWorkspace` implementation behind the workspace module after helper extraction.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `rg -n "function (normalizeBookSetupProfile|fallbackPromiseExtraction|fallbackScorecard|fallbackPersonaPack|normalizeCoreTruthsArtifact|normalizeTransformationArtifact|normalizeMarketReport|createFallbackMarketReport|normalizeRecommendationsArtifact|fallbackRecommendations|normalizeTitleSubtitleFinalization|createFallbackTitleSubtitleFinalization|normalizeBookPromiseReportArtifact)|export async function getPromiseWorkspace" src/lib/workflows/promise.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2b3d3. `getPromiseWorkspace` still depends on private parser/fallback helpers for setup normalization, Promise fallback extraction, scorecard/persona fallbacks, core truths, transformation, market, recommendations, title finalization, and Book Promise report normalization.
- Risks discovered: Moving `getPromiseWorkspace` now would either recreate a large dependency chain in `workspace.ts` or export many private monolith helpers without focused tests. Split further before implementation: setup/promise fallback helpers, market/recommendation fallback helpers, title/report normalization helpers, then the final loader move.
- Blocker or next package: Blocked for this package. Leaving 8.2b3d3 unchecked and checking whether 8.2b3d4 can proceed independently.

### 2026-07-13 13:32 — Package 8.2b3d4

- Status: completed
- Objective: Route `runPromiseWorkflow` through the correct generation/workspace facade without circular imports.
- Files changed:
  - `tests/workflow-public-entrypoints.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-public-entrypoints.test.ts tests/promise-workspace-assembly.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Static guard now verifies `runPromiseWorkflow` remains exposed by the Promise generation module and is not pulled into the Promise workspace module, avoiding a graph/workspace circular import.
- Risks discovered: None in focused tests. Parent 8.2b3d remains open because 8.2b3d3 is blocked.
- Blocker or next package: None for 8.2b3d4. Next package is 8.2b4 Promise generation extraction, unless blocked by the same private helper chain.

### 2026-07-13 13:33 — Package 8.2b4

- Status: blocked
- Objective: Move model-generation helpers into generation/audience/market modules while preserving gateway attribution and non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `sed -n '1,80p' src/lib/workflows/promise/generation.ts && sed -n '1,80p' src/lib/workflows/promise/audience-personas.ts && sed -n '1,80p' src/lib/workflows/promise/market-analysis.ts && rg -n "export async function (...)" src/lib/workflows/promise.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2b4. The Promise generation seam still spans model factories, large prompt constants, all audience/persona/market/title/book-pitch/truth/transformation generation functions, fallback chains, knowledge-base grounding, structured-output parsing, and the LangGraph runtime.
- Risks discovered: Moving generation helpers as one package would create a high-risk review surface and likely circular imports with the remaining private fallback/normalization helpers. Split further before implementation: prompt constants, model factory helpers, audience/persona generation, market/recommendation generation, truth/transformation generation, and final graph runtime handoff.
- Blocker or next package: Blocked for this heartbeat. 8.2c2, 8.2d2, and 8.2e2 have prior recorded blockers requiring their own preparatory splits, so there is no safe later independent monolith split to route around in this run.

### 2026-07-13 13:37 — Package 8.2b4a

- Status: completed
- Objective: Extract env loading and structured/book-pitch model factories with focused static tests.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-models.ts`
  - `tests/workflow-public-entrypoints.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-public-entrypoints.test.ts tests/promise-workspace-assembly.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Promise env loading plus structured Promise, structured Audience, and Book Pitch model factories now live in `generation-models.ts`. The monolith imports those helpers; `getChatModel` uses the shared env loader while staying graph-local.
- Risks discovered: None in focused tests. Prompt constants and generation function movement remain split across later 8.2b4 packages.
- Blocker or next package: None for 8.2b4a. Next package is 8.2b4b Promise generation prompt constants.

### 2026-07-13 13:38 — Package 8.2b4b1

- Status: completed
- Objective: Move `BOOK_PITCH_SECTION_PLANS` behind the generation prompt module with focused tests.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-prompts.ts`
  - `tests/promise-generation-prompts.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-prompts.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Book Pitch section plan ordering and guidance now live in `generation-prompts.ts`; sectioned Book Pitch generation imports the shared plan.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4b1. Next package is 8.2b4b2 Book Pitch prompt constant.

### 2026-07-13 13:39 — Package 8.2b4b2

- Status: completed
- Objective: Move the Book Pitch markdown prompt behind the generation prompt module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-prompts.ts`
  - `tests/promise-generation-prompts.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-prompts.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `BOOK_PITCH_SYSTEM_PROMPT` now lives in `generation-prompts.ts`; Book Pitch generation imports the shared markdown-only prompt.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4b2. Next package is 8.2b4b3 Audience/persona prompt constants.

### 2026-07-13 13:40 — Package 8.2b4b3a

- Status: completed
- Objective: Move the audience discovery prompt behind the generation prompt module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-prompts.ts`
  - `tests/promise-generation-prompts.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-prompts.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `AUDIENCE_RESEARCH_PHASE1_SYSTEM_PROMPT` now lives in `generation-prompts.ts`; Audience Phase 1 generation imports the shared JSON-only discovery prompt.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4b3a. Next package is 8.2b4b3b Audience Phase 2 persona prompt constant.

### 2026-07-13 13:41 — Package 8.2b4b3b

- Status: completed
- Objective: Move the detailed persona prompt behind the generation prompt module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-prompts.ts`
  - `tests/promise-generation-prompts.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-prompts.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `AUDIENCE_RESEARCH_PHASE2_SYSTEM_PROMPT` now lives in `generation-prompts.ts`; Audience Phase 2 persona generation imports the shared strict JSON prompt.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4b3b. Next package is 8.2b4b3c Audience Phase 3 comparison prompt constant.

### 2026-07-13 13:42 — Package 8.2b4b3c

- Status: completed
- Objective: Move the persona comparison prompt behind the generation prompt module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-prompts.ts`
  - `tests/promise-generation-prompts.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-prompts.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `AUDIENCE_RESEARCH_PHASE3_SYSTEM_PROMPT` now lives in `generation-prompts.ts`; Audience Phase 3 comparison generation imports the shared JSON-only comparison prompt. Parent 8.2b4b3 is complete.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4b3c. Next package is 8.2b4b4 Market/recommendation/title prompt constants.

### 2026-07-13 13:43 — Package 8.2b4b4a

- Status: completed
- Objective: Move the Market Report prompt behind the generation prompt module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-prompts.ts`
  - `tests/promise-generation-prompts.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-prompts.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `MARKET_REPORT_SYSTEM_PROMPT` now lives in `generation-prompts.ts`; market report generation imports the shared Gemini JSON-only market prompt.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4b4a. Next package is 8.2b4b4b Positioning Recommendations prompt constant.

### 2026-07-13 13:44 — Package 8.2b4b4b

- Status: completed
- Objective: Move the Positioning Recommendations prompt behind the generation prompt module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-prompts.ts`
  - `tests/promise-generation-prompts.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-prompts.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT` now lives in `generation-prompts.ts`; recommendations generation imports the shared JSON-only strategy prompt.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4b4b. Next package is 8.2b4b4c Title/subtitle finalization prompt constant.

### 2026-07-13 13:45 — Package 8.2b4b4c

- Status: completed
- Objective: Move the Title/subtitle finalization prompt behind the generation prompt module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-prompts.ts`
  - `tests/promise-generation-prompts.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-prompts.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `TITLE_SUBTITLE_FINALIZATION_SYSTEM_PROMPT` now lives in `generation-prompts.ts`; title/subtitle generation imports the shared JSON-only title package prompt. Parent 8.2b4b4 is complete.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4b4c. Next package is 8.2b4b5 Truth/transformation prompt constants.

### 2026-07-13 13:46 — Package 8.2b4b5a

- Status: completed
- Objective: Move the Core Truths prompt behind the generation prompt module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-prompts.ts`
  - `tests/promise-generation-prompts.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-prompts.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `CORE_TRUTHS_SYSTEM_PROMPT` now lives in `generation-prompts.ts`; Core Truth generation imports the shared JSON-only truth prompt.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4b5a. Next package is 8.2b4b5b Transformation Arc prompt constant.

### 2026-07-13 13:47 — Package 8.2b4b5b

- Status: completed
- Objective: Move the Transformation Arc prompt behind the generation prompt module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-prompts.ts`
  - `tests/promise-generation-prompts.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-prompts.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `TRANSFORMATION_ARC_SYSTEM_PROMPT` now lives in `generation-prompts.ts`; transformation generation imports the shared JSON-only transformation prompt. Parent 8.2b4b5 and parent 8.2b4b are complete.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4b5b. Next package is 8.2b4c Promise audience/persona generation.

### 2026-07-13 13:50 — Package 8.2b4c1

- Status: completed
- Objective: Extract pure audience/persona support helpers needed by the Promise audience/persona generation functions.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/audience-personas-support.ts`
  - `tests/promise-audience-personas-support.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-audience-personas-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Audience/persona schemas, normalization, compact prompt summaries, comparison fallback/normalization, persona batching, and persona prompt-instruction helpers now live in `audience-personas-support.ts`; `promise.ts` imports them while generation functions remain in place.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4c1. Next package is 8.2b4c2 Audience Phase 1 generation function.

### 2026-07-13 13:51 — Package 8.2b4c2a

- Status: completed
- Objective: Extract shared response parsing and timeout helpers used by Promise generation functions.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-response.ts`
  - `tests/promise-generation-response.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-response.test.ts tests/promise-audience-personas-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Shared response text extraction, balanced JSON extraction, response metadata, usage metadata, stop reason, truncation detection, and timeout helpers now live in `generation-response.ts`; `promise.ts` imports them.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4c2a. Next package is 8.2b4c2b Promise generation prompt context helpers.

### 2026-07-13 13:52 — Package 8.2b4c2b

- Status: completed
- Objective: Extract shared prompt context helpers needed by moved Promise generation functions.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation-context.ts`
  - `tests/promise-generation-context.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-context.test.ts tests/promise-generation-response.test.ts tests/promise-audience-personas-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Shared book setup prompt formatting, reference-material formatting, knowledge fallback sizing, knowledge context, and knowledge grounding helpers now live in `generation-context.ts`; `promise.ts` imports them. A separate direct full-knowledge-base load remains only in `generateComprehensivePromiseStatement`.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4c2b. Next package is 8.2b4c2c Audience Phase 1 implementation move.

### 2026-07-13 13:53 — Package 8.2b4c2c

- Status: completed
- Objective: Move `maybeGenerateAudienceResearchPhase1` behind the Promise audience/personas module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/audience-personas.ts`
  - `tests/workflow-public-entrypoints.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-context.test.ts tests/promise-generation-response.test.ts tests/promise-audience-personas-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `maybeGenerateAudienceResearchPhase1` is now implemented in `promise/audience-personas.ts`; the Promise public entrypoint continues exporting it through the audience/personas facade, and the monolith no longer owns that function. Parent 8.2b4c2 is complete.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4c2c. Next package is 8.2b4c3 Persona deep profile generation function.

### 2026-07-13 13:54 — Package 8.2b4c3

- Status: completed
- Objective: Move persona deep-profile batch generation and `maybeGeneratePersonasDeepProfile` behind the Promise audience/personas module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/audience-personas.ts`
  - `tests/workflow-public-entrypoints.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-context.test.ts tests/promise-generation-response.test.ts tests/promise-audience-personas-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Persona deep-profile batch generation and `maybeGeneratePersonasDeepProfile` now live in `promise/audience-personas.ts`; the Promise public entrypoint still exports the function through the audience/personas facade, and the monolith no longer owns the deep-profile generation implementation.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4c3. Next package is 8.2b4c4 Persona comparison generation function.

### 2026-07-13 13:55 — Package 8.2b4c4

- Status: completed
- Objective: Move `maybeGeneratePersonaComparisonAnalysis` behind the Promise audience/personas module.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/audience-personas.ts`
  - `tests/workflow-public-entrypoints.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-context.test.ts tests/promise-generation-response.test.ts tests/promise-audience-personas-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `maybeGeneratePersonaComparisonAnalysis` now lives in `promise/audience-personas.ts`; the Promise public entrypoint still exports it through the audience/personas facade, and the monolith no longer owns persona comparison generation.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4c4. Next package is 8.2b4c5 Audience/persona facade cleanup.

### 2026-07-13 13:56 — Package 8.2b4c5

- Status: completed
- Objective: Remove the temporary monolith re-export from the Promise audience/personas facade.
- Files changed:
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/audience-personas.ts`
  - `tests/workflow-public-entrypoints.test.ts`
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-context.test.ts tests/promise-generation-response.test.ts tests/promise-audience-personas-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `promise/audience-personas.ts` no longer imports or re-exports from `../promise`; it owns Audience Phase 1, persona deep-profile generation, persona comparison generation, and the related public test utility export. Parent 8.2b4c is complete.
- Risks discovered: None in focused tests.
- Blocker or next package: None for 8.2b4c5. Next package is 8.2b4d Promise market/recommendation generation.

### 2026-07-13 16:08 — Package 8.2c4 split and 8.2c4a

- Status: completed
- Objective: Split the too-broad Research execution extraction package into safe subpackages, then move read-only unfinished-chapter discovery behind the jobs module with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research/jobs.ts`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/stage-controls.ts`
  - `src/lib/workflows/external-stories.ts`
  - `src/lib/workflows/chapter-draft.ts`
  - `tests/research-jobs.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: 8.2c4 is now decomposed into execution/job subpackages. `research/jobs.ts` owns `getUnfinishedResearchChapterKeys`, using canonical chapter seeds and saved research pack versions as the recovery ground truth. `research.ts` no longer owns that helper, and stage recovery imports it through `research-public`.
- Risks discovered: Durable job enqueue, processor, chapter execution, and full-run orchestration still remain behind temporary monolith facades until 8.2c4b through 8.2c4f complete.
- Blocker or next package: None for 8.2c4a. Next package is 8.2c4b Research durable job enqueue helpers.

### 2026-07-13 16:21 — Package 8.2c4b

- Status: completed
- Objective: Move queue/enqueue/trigger helpers behind the Research jobs module while preserving idempotency and non-provider behavior.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research/jobs.ts`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/stage-controls.ts`
  - `src/lib/workflows/workflow-automation.ts`
  - `tests/research-jobs.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/jobs.ts` now owns `enqueueFullResearchWorkflow` and `enqueueAndTriggerFullResearchWorkflow`. The enqueue path still reuses active queued/running jobs, updates Research stage progress metadata, creates one durable workflow run, and triggers only when the run is newly queued. Internal Research callers now route through `research-public` instead of the monolith.
- Risks discovered: None in focused verification. This package does not process the run or invoke research providers.
- Blocker or next package: None for 8.2c4b. Next package is 8.2c4c Research durable job processor wrapper.

### 2026-07-13 16:21 — Package 8.2c4c

- Status: completed
- Objective: Move claim/lease/complete/fail/heartbeat processing behind the Research jobs module while preserving quality-agent side effects.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research/jobs.ts`
  - `src/lib/workflows/research.ts`
  - `tests/research-jobs.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/jobs.ts` now owns `processWorkflowRun`. The wrapper still loads and atomically claims the run, starts/stops the lease heartbeat, parses durable input, delegates full execution, completes or fails the workflow run, and runs the quality agent on both success and failure.
- Risks discovered: `processWorkflowRun` still delegates full research execution to the execution facade; the provider-heavy orchestration remains for 8.2c4e.
- Blocker or next package: None for 8.2c4c. Next package is 8.2c4d Research chapter execution wrapper.

### 2026-07-13 16:21 — Package 8.2c4d

- Status: completed
- Objective: Move the single-chapter Research execution wrapper behind the execution module while preserving gateway attribution.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research/execution.ts`
  - `src/lib/workflows/research/execution-context.ts`
  - `src/lib/workflows/research.ts`
  - `tests/research-jobs.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/execution.ts` now owns the public `runChapterResearchWorkflow` wrapper. The provider-heavy `runChapterResearchWorkflowImpl` remains in the monolith, while shared `runWithResearchChapterAttribution` preserves ambient LLM context and per-chapter cost attribution for both the public wrapper and remaining full-run orchestration.
- Risks discovered: The single-chapter implementation body still has the live web/model research pipeline inside `research.ts`; moving it safely belongs to a later narrower package.
- Blocker or next package: None for 8.2c4d. Next package inspected was 8.2c4e Research full-run orchestration.

### 2026-07-13 16:21 — Package 8.2c4e

- Status: blocked
- Objective: Move full research run orchestration behind the execution module while preserving retry, cancellation, and provisional fallback behavior.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `sed -n '1875,2110p' src/lib/workflows/research.ts`
  - Inspection only: `rg -n "runFullResearchWorkflow|pulseResearchStage|wasWorkflowCanceled|runWithResearchChapterAttribution|failedChapters|provisionalChapters|quality" src/lib/workflows/research.ts src/lib/workflows/research/execution.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2c4e. The full-run orchestration body is still entangled with stage progress mutation, cancellation checks, retry limits, provisional dossier handling, failed-chapter recovery state, per-chapter attribution, and the remaining provider-adjacent chapter implementation.
- Risks discovered: 8.2c4e should be split before movement, likely into orchestration support helpers for progress/cancel/final-status metadata, retry/provisional result accounting, and then the full-run function move.
- Blocker or next package: Blocked for this heartbeat. Leaving 8.2c4e unchecked. 8.2c4f depends on 8.2c4e, and prior later packages 8.2d2/8.2e2 already have recorded preparatory-split blockers, so there is no safe later independent package to route around in this run.

### 2026-07-13 16:32 — Package 8.2c4e split and 8.2c4e1

- Status: completed
- Objective: Split full-run orchestration into safe subpackages, then move run activity, stage pulse, and cancellation helpers behind a support module with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/run-progress.ts`
  - `tests/research-run-progress.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-run-progress.test.ts tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/run-progress.ts` now owns `recentActivity`, `pulseResearchStage`, and `wasResearchWorkflowCanceled`. The Research monolith imports those helpers, preserving stage activity metadata updates and durable cancellation checks without invoking any provider path.
- Risks discovered: None in focused verification. The full-run loop still needed result accounting extraction before moving.
- Blocker or next package: None for 8.2c4e1. Next package is 8.2c4e2 Research run result accounting.

### 2026-07-13 16:32 — Package 8.2c4e2

- Status: completed
- Objective: Move completed/failed/provisional chapter result accounting helpers behind a support module with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/run-results.ts`
  - `tests/research-run-results.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-run-results.test.ts tests/research-run-progress.test.ts tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/run-results.ts` now owns retry detection, provisional timeout accounting, hard-failure recording, and per-chapter progress labels. Focused unit tests cover retry limit behavior, provisional timeout completion/failure dual accounting, hard failures, and progress-message selection.
- Risks discovered: None in focused verification.
- Blocker or next package: None for 8.2c4e2. Next package is 8.2c4e3 Research full-run function move.

### 2026-07-13 16:32 — Package 8.2c4e3

- Status: completed
- Objective: Move `runFullResearchWorkflow` behind the execution module once support helpers are extracted.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/execution.ts`
  - `tests/research-jobs.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-run-results.test.ts tests/research-run-progress.test.ts tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/execution.ts` now owns `runFullResearchWorkflow`. The moved orchestration still checks Base Story readiness, selects requested chapters, updates stage progress, honors durable cancellation, retries provisional/failed chapters within the configured limit, records completed/failed/provisional chapters, and leaves per-chapter provider work delegated to `runChapterResearchWorkflowImpl`.
- Risks discovered: The provider-adjacent single-chapter implementation body still remains in `research.ts`.
- Blocker or next package: None for 8.2c4e3. Parent 8.2c4e is complete. Next package is 8.2c4f Research execution facade cleanup.

### 2026-07-13 16:32 — Package 8.2c4f

- Status: completed
- Objective: Remove remaining temporary execution/job re-exports once ownership is complete.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `tests/research-jobs.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-run-results.test.ts tests/research-run-progress.test.ts tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added a guard that `research/execution.ts` and `research/jobs.ts` do not temporarily re-export from `../research`. The jobs module owns enqueue and durable processing, and the execution module owns public chapter and full-run orchestration wrappers.
- Risks discovered: `research/execution.ts` still imports `runChapterResearchWorkflowImpl` from the monolith as an explicit implementation seam, not a facade re-export.
- Blocker or next package: None for 8.2c4f. Next package is 8.2c4g Research chapter implementation extraction.

### 2026-07-13 16:32 — Package 8.2c4g

- Status: blocked
- Objective: Move the provider-adjacent single-chapter implementation body behind the execution module with focused seam tests while preserving gateway attribution and no-spend verification.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `sed -n '1560,1878p' src/lib/workflows/research.ts`
  - Inspection only: `rg -n "runChapterResearchWorkflowImpl|maybeGenerateResearchQuestions|discoverCandidateSources|fetchCandidateSource|extractItemsFromSource|verifyItemsForSource|adjudicateAmbiguousItems|createResearchPackVersion" src/lib/workflows/research.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2c4g. The remaining implementation body contains the live research pipeline: committed artifact loading, lens setup, quality feedback, question generation, web search, page fetch, source integrity verification, extraction, item verification, adjudication, provisional fallback, and artifact persistence.
- Risks discovered: This should be split before movement into at least a no-provider setup/context loader, a persistence/fallback helper, and then the live provider/web pipeline move with static seam tests. Moving it whole would be too risky and easy to break attribution or fallback behavior.
- Blocker or next package: Blocked for this heartbeat. Leaving 8.2c4g unchecked. 8.2c parent remains unchecked. Later packages 8.2d2/8.2e2 have prior recorded preparatory-split blockers, so there is no safe later independent package to route around in this run.

### 2026-07-13 16:40 — Package 8.2c4g split and 8.2c4g1

- Status: completed
- Objective: Split provider-adjacent chapter implementation extraction, then move committed artifact loading, chapter context resolution, lens setup, book subject, and quality feedback loading behind an execution setup module with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/execution-setup.ts`
  - `tests/research-execution-setup.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-execution-setup.test.ts tests/research-run-results.test.ts tests/research-run-progress.test.ts tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/execution-setup.ts` now owns chapter context resolution, Base Story chapter guidance mapping, committed setup/lens loading, book-subject derivation, and quality-feedback loading. The live research pipeline now starts from a prepared execution setup instead of owning its own committed artifact setup chain.
- Risks discovered: The remaining live pipeline still owns question generation, web search/fetch, source verification, extraction, item verification, adjudication, fallback invocation, and persistence invocation.
- Blocker or next package: None for 8.2c4g1. Next package is 8.2c4g2 Research chapter persistence/fallback support.

### 2026-07-13 16:40 — Package 8.2c4g2a

- Status: completed
- Objective: Move provisional fallback packaging behind a support module with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/fallback.ts`
  - `tests/research-fallback.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-fallback.test.ts tests/research-execution-setup.test.ts tests/research-run-results.test.ts tests/research-run-progress.test.ts tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/fallback.ts` now owns provisional fallback pack construction. Focused tests verify fallback packs remain unverified, retryable, timeout-aware research leads with paragraph mappings rather than admitted facts.
- Risks discovered: None in focused verification.
- Blocker or next package: None for 8.2c4g2a. Next package is 8.2c4g2b Research dossier persistence helper.

### 2026-07-13 16:40 — Package 8.2c4g2b

- Status: completed
- Objective: Move final dossier persistence and model-name accounting behind a support module with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/persistence.ts`
  - `tests/research-persistence.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-persistence.test.ts tests/research-fallback.test.ts tests/research-execution-setup.test.ts tests/research-run-results.test.ts tests/research-run-progress.test.ts tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/persistence.ts` now owns `persistChapterResearchDossier` and research model-name accounting. The live pipeline delegates artifact-version creation and prompt-template versioning through that helper.
- Risks discovered: None in focused verification.
- Blocker or next package: None for 8.2c4g2b. Parent 8.2c4g2 is complete. Next package is 8.2c4g3 Research chapter live pipeline move.

### 2026-07-13 16:40 — Package 8.2c4g3

- Status: blocked
- Objective: Move the remaining live question/search/fetch/extract/verify/adjudicate body behind the execution module while preserving gateway attribution.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `rg -n "maybeGenerateResearchQuestions|discoverCandidateSources|fetchCandidateSource|verifySourceIntegrity|extractItemsFromSource|verifyItemsForSource|adjudicateAmbiguousItems|buildDossier" src/lib/workflows/research.ts`
  - Inspection only: `sed -n '1540,1658p' src/lib/workflows/research.ts`
- Live provider spend: none
- Behavioral result: No code movement for 8.2c4g3. The remaining live body still calls private model/web/search/extraction/verification/adjudication helpers in `research.ts`.
- Risks discovered: Moving the live body now would require either exporting many private provider/web helpers from the monolith or moving the whole helper graph at once. It should be split again into model/web helper modules before moving the orchestration body.
- Blocker or next package: Blocked for this heartbeat. Leaving 8.2c4g3 unchecked. 8.2c4g and parent 8.2c remain unchecked. Later 8.2d2/8.2e2 packages already have recorded preparatory-split blockers, so there is no safe later independent package to route around in this run.

### 2026-07-13 16:50 — Package 8.2c4g3a

- Status: complete
- Objective: Split the oversized 8.2c4g3 live pipeline move into reviewable subpackages, then move deterministic source/dossier helpers out of `research.ts` without live provider calls.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/dossier.ts`
  - `src/lib/workflows/research/source-utils.ts`
  - `tests/research-dossier.test.ts`
  - `tests/research-source-utils.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-source-utils.test.ts tests/research-dossier.test.ts tests/research-persistence.test.ts tests/research-fallback.test.ts tests/research-execution-setup.test.ts tests/research-run-results.test.ts tests/research-run-progress.test.ts tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Source text extraction, source tier classification, source/domain summaries, and dossier assembly are now owned by focused research support modules. The live chapter pipeline still behaves through the same call sites, but `research.ts` no longer owns those deterministic helpers.
- Risks discovered: The remaining 8.2c4g3 work still includes provider/web-adjacent helpers and should continue through the new 8.2c4g3b/3c/3d subpackages rather than one large move.
- Blocker or next package: None for 8.2c4g3a. Parent 8.2c4g3 remains unchecked. Next package is 8.2c4g3b Research question/search helper extraction.

### 2026-07-13 16:58 — Package 8.2c4g3b

- Status: complete
- Objective: Move research question generation, candidate search discovery, source fetch/snapshot, and source integrity helpers behind a source-discovery support module without changing live provider/web behavior.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/source-discovery.ts`
  - `tests/research-source-discovery.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-source-discovery.test.ts tests/research-source-utils.test.ts tests/research-dossier.test.ts tests/research-persistence.test.ts tests/research-fallback.test.ts tests/research-execution-setup.test.ts tests/research-run-results.test.ts tests/research-run-progress.test.ts tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/source-discovery.ts` now owns the question prompt, fallback questions, lens-aware search query fanout, web fetch snapshot persistence, fetched-source construction, and basic fetched-source integrity verification. `research.ts` still calls the same pipeline steps, but it no longer owns those question/search/fetch helpers.
- Risks discovered: The next package, 8.2c4g3c, moves the expensive extraction/verification/adjudication model helpers and should preserve the existing context-window/passage-prefilter token controls carefully.
- Blocker or next package: None for 8.2c4g3b. Parent 8.2c4g3 remains unchecked. Next package is 8.2c4g3c Research extraction/verification/adjudication helper extraction.

### 2026-07-13 17:03 — Package 8.2c4g3c

- Status: complete
- Objective: Move research extraction, verification, passage-prefilter, focused-context, auto-promotion, and ambiguity adjudication helpers behind a support module while preserving no-spend fallback behavior and model attribution.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/extraction-verification.ts`
  - `src/lib/workflows/research/source-discovery.ts`
  - `tests/research-extraction-verification.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-extraction-verification.test.ts tests/research-source-discovery.test.ts tests/research-source-utils.test.ts tests/research-dossier.test.ts tests/research-persistence.test.ts tests/research-fallback.test.ts tests/research-execution-setup.test.ts tests/research-run-results.test.ts tests/research-run-progress.test.ts tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/extraction-verification.ts` now owns expensive extraction/verification/adjudication helper behavior, including the passage prefilter and focused source-context token controls. `research.ts` now delegates those steps and keeps orchestration/progress/persistence behavior.
- Risks discovered: One test assertion initially assumed every focused-source window would be shorter than short source text; it was corrected to use a longer source and now verifies the intended windowing behavior.
- Blocker or next package: None for 8.2c4g3c. Parent 8.2c4g3 remains unchecked. Next package is 8.2c4g3d Research live pipeline orchestration move.

### 2026-07-13 17:06 — Package 8.2c4g3d

- Status: complete
- Objective: Move the remaining single-chapter live research orchestration body out of `research.ts` and behind the Research execution module after helper ownership was complete.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/chapter-live-pipeline.ts`
  - `src/lib/workflows/research/execution.ts`
  - `tests/research-chapter-live-pipeline.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/research-chapter-live-pipeline.test.ts tests/research-extraction-verification.test.ts tests/research-source-discovery.test.ts tests/research-source-utils.test.ts tests/research-dossier.test.ts tests/research-persistence.test.ts tests/research-fallback.test.ts tests/research-execution-setup.test.ts tests/research-run-results.test.ts tests/research-run-progress.test.ts tests/research-jobs.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/chapter-live-pipeline.ts` now owns `runChapterResearchWorkflowImpl`, timeout handling, live question/search/fetch/extract/verify/adjudicate orchestration, provisional fallback routing, and final dossier persistence. `research/execution.ts` imports that implementation directly, and `research.ts` no longer owns the live chapter implementation.
- Risks discovered: None in focused verification.
- Blocker or next package: None for 8.2c4g3d. Parent packages 8.2c4g3, 8.2c4g, 8.2c4, and 8.2c are complete. Next package is 8.2d2 Chapter Draft workspace/context extraction.

### 2026-07-13 17:08 — Package 8.2d2

- Status: blocked
- Objective: Move Chapter Draft workspace and canonical context assembly behind dedicated modules with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Inspection only: `rg -n "8\\.2d2|Chapter Draft workspace|chapter-draft workspace|workspace/context" docs/GHOSTWRITR-STABILIZATION-EXECUTION.md src/lib/workflows/chapter-draft.ts src/lib/workflows/chapter-draft -g '*.ts' tests -g '*.test.ts'`
  - Inspection only: `rg -n "get.*Workspace|get.*Context|chapter.*context|workspace" src/lib/workflows/chapter-draft.ts`
- Live provider spend: none
- Behavioral result: No Chapter Draft code movement in this heartbeat. The package still matches the prior blocker: `getChapterDraftWorkspace` is entangled with canonical context assembly, draft-input loading, readiness validation, artifact parsing, approval-state projection, source availability, chapter metrics, and author-facing Quill summaries.
- Risks discovered: Moving 8.2d2 as one package would repeat the oversized-monolith problem just solved in Research. It should be split into preparatory packages: pure metrics/readiness summary helpers, source availability helpers, approval-state projection, canonical context assembly, then workspace orchestration.
- Blocker or next package: Blocked for this heartbeat. Leaving 8.2d2 unchecked. 8.2d3 and 8.2d4 depend on Chapter Draft workspace/context ownership, so there is no safe later Chapter Draft package to route around in this run.

### 2026-07-13 17:12 — Package 8.2d2a

- Status: complete
- Objective: Split 8.2d2 into reviewable subpackages, then move pure Chapter Draft workspace projection helpers behind a workspace support module.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/chapter-draft/workspace-support.ts`
  - `tests/chapter-draft-workspace-support.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `chapter-draft/workspace-support.ts` now owns pure workspace projections for draft metrics, source availability counts, approval-state display shape, author-facing Quill context summary, and workspace progress summary. `getChapterDraftWorkspace` still owns DB loading and orchestration, but delegates these deterministic projections.
- Risks discovered: Test fixtures initially used stale enum/contract shapes; corrected to current `EvidenceKind`, `ChapterApprovalStatus`, and `ChapterExternalStoryDossier` contracts.
- Blocker or next package: None for 8.2d2a. Parent 8.2d2 remains unchecked. Next package is 8.2d2b Chapter Draft source availability helpers.

### 2026-07-13 17:16 — Package 8.2d2b

- Status: complete
- Objective: Move Chapter Draft committed source/context availability assembly behind a dedicated support module with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/chapter-draft/source-availability.ts`
  - `tests/chapter-draft-source-availability.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `chapter-draft/source-availability.ts` now owns committed Research dossier loading, committed External Stories dossier loading, legacy structured-row fallback admission, base-story chapter lookup, ready personal-story lookup, compact personal-story card lookup, and combined per-chapter source-context assembly. `getChapterDraftWorkspace` now delegates per-chapter source context loading to that helper.
- Risks discovered: Test fixtures needed current Base Story and Personal Story contract shapes; corrected during verification.
- Blocker or next package: None for 8.2d2b. Parent 8.2d2 remains unchecked. Next package is 8.2d2c Chapter Draft canonical context assembly.

### 2026-07-13 17:24 — Package 8.2d2c

- Status: complete
- Objective: Move Chapter Draft canonical draft-input loading and Quill readiness/context packet assembly behind dedicated modules with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/chapter-draft/context.ts`
  - `tests/chapter-draft-context.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-context.test.ts tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `chapter-draft/context.ts` now owns Chapter Draft input loading, committed manifest chapter-guidance extraction, dominant persona framework resolution, Quill readiness packet construction, and Quill readiness validation. `chapter-draft.ts` still owns generation/orchestration, but delegates canonical context assembly and readiness checks to the capability module.
- Risks discovered: Test fixtures had stale paragraph/persona contract fields; corrected to current `ChapterParagraphPlan`, `ParagraphPlan`, and `WriterPersonaBlend` shapes during verification.
- Blocker or next package: None for 8.2d2c. Parent 8.2d2 remains unchecked. Next package is 8.2d2d Chapter Draft workspace orchestration move.

### 2026-07-13 17:24 — Package 8.2d2d

- Status: complete
- Objective: Move Chapter Draft workspace orchestration behind the workspace module after helper and canonical context ownership were complete.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/chapter-draft/workspace.ts`
  - `src/lib/workflows/chapter-draft/workspace-support.ts`
  - `tests/chapter-draft-source-availability.test.ts`
  - `tests/chapter-draft-workspace.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-workspace.test.ts tests/chapter-draft-context.test.ts tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `chapter-draft/workspace.ts` now owns `getChapterDraftWorkspace` instead of re-exporting the monolith. Pure chapter word-target calculation moved to `workspace-support.ts` so workspace assembly and execution flows can share the same deterministic target math without circular imports. `chapter-draft.ts` no longer exports the workspace assembler.
- Risks discovered: Existing source-availability ownership test expected the workspace source-context call to remain in the monolith; updated the expectation to the new workspace owner.
- Blocker or next package: None for 8.2d2d. Parent 8.2d2 is complete. Next package is 8.2d3 Chapter Draft execution extraction.

### 2026-07-13 17:32 — Package 8.2d3a

- Status: complete
- Objective: Split 8.2d3 into reviewable subpackages, then move Chapter Draft durable job enqueue/trigger/process orchestration behind the jobs module with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/chapter-draft/jobs.ts`
  - `src/lib/workflows/stage-controls.ts`
  - `src/lib/workflows/workflow-automation.ts`
  - `tests/chapter-draft-jobs.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-jobs.test.ts tests/chapter-draft-workspace.test.ts tests/chapter-draft-context.test.ts tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `chapter-draft/jobs.ts` now owns `getUnfinishedChapterDraftChapterKeys`, `enqueueChapterDraftWorkflow`, `processChapterDraftWorkflowRun`, and `enqueueAndTriggerChapterDraftWorkflow`. `stage-controls.ts` and `workflow-automation.ts` now route Chapter Draft job orchestration through `chapter-draft-public` instead of importing those job helpers from the monolith.
- Risks discovered: 8.2d3 was too broad as a single package, so it was split into durable jobs, repair/expansion wrappers, run orchestration, and provider-adjacent single-chapter implementation subpackages before code movement. Typecheck exposed remaining direct monolith imports in stage controls and workflow automation; rewired them to the public boundary.
- Blocker or next package: None for 8.2d3a. Parent 8.2d3 remains unchecked. Next package is 8.2d3b Chapter Draft repair and expansion wrappers move.

### 2026-07-13 17:35 — Package 8.2d3b

- Status: complete
- Objective: Move Chapter Draft repair and expansion workflow wrappers behind the repair module while preserving context readiness and chapter target math.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/chapter-draft/repair.ts`
  - `tests/chapter-draft-repair.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-repair.test.ts tests/chapter-draft-jobs.test.ts tests/chapter-draft-workspace.test.ts tests/chapter-draft-context.test.ts tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `chapter-draft/repair.ts` now owns `expandChapterDraftTowardTargetWorkflow`, `expandUnderTargetChapterDraftsWorkflow`, and `repairWeakChapterDraftsWorkflow`. The deeper provider-adjacent single-chapter generation and expansion helpers remain in `chapter-draft.ts` as explicit internal seams for 8.2d3d, avoiding a mixed wrapper/provider move in this package.
- Risks discovered: Moving wrappers without widening into provider-adjacent code required temporarily exporting `generateSingleChapterDraft` and `expandSingleChapterDraftTowardTarget` from the monolith. Those seams should be collapsed when 8.2d3d moves the single-chapter implementation.
- Blocker or next package: None for 8.2d3b. Parent 8.2d3 remains unchecked. Next package is 8.2d3c Chapter Draft run orchestration move.

### 2026-07-13 17:38 — Package 8.2d3c

- Status: complete
- Objective: Move Chapter Draft run orchestration behind the execution module after durable jobs and repair wrappers were independent.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `prisma/seed-reference-books.ts`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/chapter-draft/execution.ts`
  - `tests/chapter-draft-execution.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-execution.test.ts tests/chapter-draft-repair.test.ts tests/chapter-draft-jobs.test.ts tests/chapter-draft-workspace.test.ts tests/chapter-draft-context.test.ts tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `chapter-draft/execution.ts` now owns `runChapterDraftWorkflow`, including target chapter selection, stage progress metadata, and per-chapter orchestration. `chapter-draft.ts` no longer exports the run orchestration wrapper. `prisma/seed-reference-books.ts` now imports Chapter Draft workflow helpers through `chapter-draft-public`.
- Risks discovered: Typecheck exposed a lingering direct monolith import in the reference-book seed script; rewired it to the public boundary.
- Blocker or next package: None for 8.2d3c. Parent 8.2d3 remains unchecked. Next package is 8.2d3d Chapter Draft single-chapter implementation extraction.

### 2026-07-13 17:48 — Package 8.2d3d1

- Status: complete
- Objective: Split 8.2d3d into reviewable subpackages, then move single-chapter pure support helpers behind an execution support module with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/chapter-draft/execution-support.ts`
  - `tests/chapter-draft-execution-support.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-execution-support.test.ts tests/chapter-draft-execution.test.ts tests/chapter-draft-repair.test.ts tests/chapter-draft-jobs.test.ts tests/chapter-draft-workspace.test.ts tests/chapter-draft-context.test.ts tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `chapter-draft/execution-support.ts` now owns pure single-chapter support helpers for prose cleanup/meta-language detection, deterministic fallback paragraph prose, deterministic adversarial criticism, evidence cleaning/compaction, source-weave requirements, framework-slot rendering, shared book context JSON, sentence average, paragraph-anchor hits, and mandate hits. Provider calls and persistence remain in `chapter-draft.ts` for later 8.2d3d subpackages.
- Risks discovered: 8.2d3d was too large as a single move, so it was split into pure support, model helpers, orchestration/persistence, and seam cleanup subpackages. Tests captured the current sanitizer behavior, including an existing double-period edge case, without changing behavior in this package.
- Blocker or next package: None for 8.2d3d1. Parent 8.2d3d remains unchecked. Next package is 8.2d3d2 Chapter Draft single-chapter model helper extraction.

### 2026-07-13 17:53 — Package 8.2d3d2

- Status: complete
- Objective: Move Chapter Draft single-chapter draft/revise/review/tune model-call helpers behind execution modules while preserving gateway attribution and no-spend verification.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/chapter-draft/model-helpers.ts`
  - `tests/chapter-draft-model-helpers.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-model-helpers.test.ts tests/chapter-draft-execution-support.test.ts tests/chapter-draft-execution.test.ts tests/chapter-draft-repair.test.ts tests/chapter-draft-jobs.test.ts tests/chapter-draft-workspace.test.ts tests/chapter-draft-context.test.ts tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `chapter-draft/model-helpers.ts` now owns the single-chapter provider-adjacent helper chain: author/reviewer/voice-guard model acquisition, adversarial critique, deterministic fallback drafting/review, draft normalization, initial draft generation, review, revision, target tuning, and finished-prose enforcement. The monolith now imports those helpers while keeping single-chapter orchestration and artifact persistence in place for 8.2d3d3.
- Risks discovered: The move is intentionally static/local; runtime provider behavior was not exercised to avoid spend. The new regression test guards that model helper implementations do not slide back into `chapter-draft.ts` and that model acquisition remains through `getModelForRole`.
- Blocker or next package: None for 8.2d3d2. Parent 8.2d3d remains unchecked. Next package is 8.2d3d3 Chapter Draft single-chapter orchestration and persistence move.

### 2026-07-13 18:03 — Package 8.2d3d3

- Status: complete
- Objective: Move `generateSingleChapterDraft` and `expandSingleChapterDraftTowardTarget` orchestration/persistence behind execution modules.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/chapter-draft/execution.ts`
  - `src/lib/workflows/chapter-draft/repair.ts`
  - `tests/chapter-draft-execution.test.ts`
  - `tests/chapter-draft-model-helpers.test.ts`
  - `tests/chapter-draft-repair.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-model-helpers.test.ts tests/chapter-draft-execution-support.test.ts tests/chapter-draft-execution.test.ts tests/chapter-draft-repair.test.ts tests/chapter-draft-jobs.test.ts tests/chapter-draft-workspace.test.ts tests/chapter-draft-context.test.ts tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `chapter-draft/execution.ts` now owns single-chapter draft generation, quality assessment, version persistence, per-chapter LLM context attribution, and target-expansion persistence. `chapter-draft/repair.ts` now imports the single-chapter execution helpers from `./execution`. The old `chapter-draft.ts` monolith is reduced to remaining commit helpers only.
- Risks discovered: The model-helper regression test had to be updated because the expected consumer moved from the monolith to `execution.ts`; this is now captured directly. Runtime provider behavior was not exercised to avoid spend.
- Blocker or next package: None for 8.2d3d3. Parent 8.2d3d remains unchecked. Next package is 8.2d3d4 Chapter Draft execution seam cleanup.

### 2026-07-13 18:04 — Package 8.2d3d4

- Status: complete
- Objective: Collapse temporary Chapter Draft execution seams and guard that execution/repair modules no longer import provider-adjacent helpers from `chapter-draft.ts`.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `tests/chapter-draft-execution.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-model-helpers.test.ts tests/chapter-draft-execution-support.test.ts tests/chapter-draft-execution.test.ts tests/chapter-draft-repair.test.ts tests/chapter-draft-jobs.test.ts tests/chapter-draft-workspace.test.ts tests/chapter-draft-context.test.ts tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Static guardrails now verify `chapter-draft.ts` is reduced to the remaining commit surface, `execution.ts` does not import temporary helpers from the monolith, and `repair.ts` does not import single-chapter generation or target expansion from the monolith.
- Risks discovered: The first guard used a dot-all regex flag that was incompatible with the project target, and the second version was too greedy across adjacent imports. The final assertion inspects the exact monolith import block.
- Blocker or next package: None for 8.2d3d4. Parent 8.2d3 and 8.2d3d are complete. Next package is 8.2d4 Chapter Draft commit extraction.

### 2026-07-13 18:05 — Package 8.2d4

- Status: complete
- Objective: Move Chapter Draft approval/commit helpers behind the commit module with focused tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft.ts`
  - `src/lib/workflows/chapter-draft/commit.ts`
  - `src/lib/workflows/chapter-draft/repair.ts`
  - `tests/chapter-draft-commit.test.ts`
  - `tests/chapter-draft-context.test.ts`
  - `tests/chapter-draft-execution.test.ts`
  - `tests/dependency-invalidation.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-commit.test.ts tests/dependency-invalidation.test.ts tests/chapter-draft-model-helpers.test.ts tests/chapter-draft-execution-support.test.ts tests/chapter-draft-execution.test.ts tests/chapter-draft-repair.test.ts tests/chapter-draft-jobs.test.ts tests/chapter-draft-workspace.test.ts tests/chapter-draft-context.test.ts tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `chapter-draft/commit.ts` now owns `commitChapterDraftWorkflow` and `commitAllChapterDraftsWorkflow`, including exact chapter-scoped stale clearing/invalidation. `chapter-draft/repair.ts` now imports commit orchestration from `./commit`. The legacy `chapter-draft.ts` file is reduced to a temporary compatibility re-export of the commit module.
- Risks discovered: Some static tests still pointed at the old monolith path. Updated the targeted context and dependency-invalidation guards to follow the new owner modules.
- Blocker or next package: None for 8.2d4. Parent 8.2d Chapter Draft capability split is complete. Next package is 8.2e2 Editing workspace extraction.

### 2026-07-13 18:14 — Package 8.2e2a

- Status: complete
- Objective: Identify the exact helper/data dependencies of `getEditingWorkspace`, add static guardrails, and preserve public entrypoint behavior without moving runtime code.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing/workspace.ts`
  - `tests/editing-workspace.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/workspace.ts` now carries the static extraction contract for `getEditingWorkspace`: direct data loaders, artifact types, schemas, pure helpers, and metadata fields. The public `editing-public.ts` entrypoint still routes workspace access through `editing/workspace.ts`, and runtime code remains in `editing.ts` for later 8.2e2 subpackages.
- Risks discovered: `getEditingWorkspace` depends on a wide set of local parsers, zod schemas, artifact history projections, metadata fields, publish sync state, and editorial readiness gate logic. Keeping the map explicit should prevent a too-broad move during 8.2e2b/8.2e2c.
- Blocker or next package: None for 8.2e2a. Parent 8.2e2 remains unchecked. Next package is 8.2e2b Editing workspace projection helper extraction.

### 2026-07-13 18:25 — Package 8.2e2b

- Status: complete
- Objective: Move pure Editing workspace projection/parsing helpers behind `editing/workspace.ts` with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/workspace.ts`
  - `src/lib/workflows/editing/workspace-support.ts`
  - `tests/editing-workspace.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/workspace-support.ts` now owns the pure workspace helper set: JSON parsing, editor conversation normalization, editorial preference defaults, draft quality rollup projection, excerpt trimming, and editorial readiness gate projection. `editing/workspace.ts` re-exports these helpers for the workspace seam while the monolith imports them from the new owner. Focused tests cover helper ownership and deterministic projection behavior without touching provider calls.
- Risks discovered: Runtime Editing orchestration still lives in `editing.ts`. This package intentionally did not move `getEditingWorkspace`, data loaders, artifact reads, or mutation paths; those remain for 8.2e2c.
- Blocker or next package: None for 8.2e2b. Parent 8.2e2 remains unchecked. Next package is 8.2e2c Editing workspace loader move.

### 2026-07-13 18:34 — Package 8.2e2c

- Status: complete
- Objective: Move the public `getEditingWorkspace` loader behind `editing/workspace.ts` after helper extraction while keeping callers on `editing-public.ts`.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/workspace.ts`
  - `tests/editing-workspace.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/workspace.ts` now owns the public `getEditingWorkspace` implementation exported by `editing-public.ts`. The workspace module loads the book, Editing stage metadata, committed setup, assembly/package/provenance/handoff artifacts, assessment history, revision queue, draft quality rollup, readiness gate, publish package sync state, final handoff state, conversation metadata, and suggested revision target through the workspace seam. The original monolith implementation remains temporarily for monolith-internal callers until 8.2e2d collapses the seam.
- Risks discovered: `editing/workspace.ts` still imports artifact schemas and `loadEditingChapters` from `editing.ts`, so 8.2e2d must break that remaining dependency before deleting the monolith copy without creating a circular import.
- Blocker or next package: None for 8.2e2c. Parent 8.2e2 remains unchecked. Next package is 8.2e2d Editing workspace seam cleanup.

### 2026-07-13 18:36 — Package 8.2e2d

- Status: blocked
- Objective: Collapse temporary Editing workspace seams and ensure workspace callers no longer import workspace assembly from `editing.ts`.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Not rerun for 8.2e2d; 8.2e2c verification immediately before this blocker was `npx tsx --test tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts` and `npm run check`.
- Live provider spend: none
- Behavioral result: No 8.2e2d code movement. The public workspace loader is already in `editing/workspace.ts`, but it still imports schemas and `loadEditingChapters` from `editing.ts`.
- Risks discovered: Deleting the monolith `getEditingWorkspace` copy or making monolith-internal callers import `editing/workspace.ts` now would create a circular runtime dependency: `editing.ts` would import `editing/workspace.ts`, while `editing/workspace.ts` still imports schemas and loader helpers from `editing.ts`.
- Blocker or next package: Blocked for this heartbeat. Leave 8.2e2d unchecked. The next safe action is to split Editing workspace schemas/loaders into non-monolith modules first, then collapse the temporary `getEditingWorkspace` copy. Later 8.2e3/8.2e4 should not start until this workspace seam is clean, because they depend on the Editing split staying acyclic.

### 2026-07-13 18:44 — Package 8.2e2d

- Status: complete
- Objective: Collapse temporary Editing workspace seams and ensure workspace callers no longer import workspace assembly from `editing.ts`.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/chapter-loader.ts`
  - `src/lib/workflows/editing/workspace.ts`
  - `src/lib/workflows/editing/workspace-schemas.ts`
  - `tests/editing-workspace.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/workspace.ts` no longer imports `../editing`; it owns the public `getEditingWorkspace` implementation using workspace-local schemas and the new `editing/chapter-loader.ts`. `editing.ts` now imports the workspace function instead of exporting a duplicate copy, so public workspace callers no longer depend on workspace assembly from the monolith.
- Risks discovered: The schema extraction intentionally keeps `BookSetupProfileSchema` in the shared artifact schema module. Other Editing schemas still exist in `editing.ts` for monolith-local runtime paths until later revision/publishing extraction packages retire those duplicate definitions.
- Blocker or next package: None for 8.2e2d. Parent 8.2e2 Editing workspace extraction is complete. Next package is 8.2e3 Editing revision extraction.

### 2026-07-13 18:47 — Package 8.2e3

- Status: blocked
- Objective: Move assessment, revision planning, revision execution, and suggested revision helpers behind assessment/revision modules while preserving gateway attribution.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Not rerun for 8.2e3; package was stopped before code movement. 8.2e2d verification immediately before this blocker was `npx tsx --test tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts` and `npm run check`.
- Live provider spend: none
- Behavioral result: No 8.2e3 code movement. Current `editing/assessment.ts` and `editing/revision.ts` are still facades over `editing.ts`.
- Risks discovered: 8.2e3 covers seven public workflows in one package: `generateEditorialAssessmentWorkflow`, `generateManuscriptRevisionWorkflow`, `applyManuscriptRevisionWorkflow`, `rejectManuscriptRevisionWorkflow`, `generateEditorialRevisionPlanWorkflow`, `executeEditorialRevisionPlanWorkflow`, and `generateSuggestedRevisionFromConversationWorkflow`. Moving these safely requires separating pure revision-target helpers, assessment model helpers, revision model helpers, revision persistence/application, and planning/execution wrappers. Doing the whole move at once would repeat the oversized-monolith risk and could break gateway attribution or stage mutation behavior.
- Blocker or next package: Blocked for this heartbeat. Leave 8.2e3 unchecked. 8.2e4 should not start until 8.2e3 is split or completed, because publishing/commit extraction depends on stable revision ownership.

### 2026-07-13 18:54 — Package 8.2e3a

- Status: complete
- Objective: Identify the exact public workflows, helper chain, model-call seams, artifact mutations, and stage metadata fields before moving Editing revision runtime code.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing/revision.ts`
  - `tests/editing-revision.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: 8.2e3 is now split into subpackages for static mapping, pure support extraction, assessment extraction, revision generation extraction, apply/reject extraction, planning/execution extraction, and seam cleanup. `editing/revision.ts` now carries a static extraction dependency contract for the seven public workflows, pure helper chain, model seams, artifact mutations, stage metadata fields, and external state updates.
- Risks discovered: Runtime revision/assessment code still lives in `editing.ts`; current `editing/assessment.ts` and `editing/revision.ts` remain facades until later 8.2e3 subpackages move code behind the new contract.
- Blocker or next package: None for 8.2e3a. Parent 8.2e3 remains unchecked. Next package is 8.2e3b Editing revision pure support extraction.

### 2026-07-13 18:59 — Package 8.2e3b

- Status: complete
- Objective: Move pure target-selection, prompt-context, final-instruction, deterministic-plan, and assessment-finding helpers behind revision support modules with focused non-spending tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/revision-support.ts`
  - `src/lib/workflows/editing/revision.ts`
  - `tests/editing-revision.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/revision-support.ts` now owns deterministic revision support: source draft signatures, book-wide assessment finding projection, finding normalization, chapter quality directives, revision target outcomes, preservation notes, suggested revision targets, conversation-derived revision targets, target chapter resolution, prompt chapter context, final revision instructions, deterministic revision plan creation, and mode labels. `editing.ts` imports these helpers instead of defining them locally.
- Risks discovered: This was intentionally pure-helper extraction only. Model acquisition, model invocation, artifact writes, apply/reject persistence, and stage metadata updates remain in `editing.ts` for later 8.2e3 packages.
- Blocker or next package: None for 8.2e3b. Parent 8.2e3 remains unchecked. Next package is 8.2e3c Editing assessment extraction.

### 2026-07-13 19:04 — Package 8.2e3c

- Status: complete
- Objective: Move `generateEditorialAssessmentWorkflow` behind the assessment module while preserving assess-model routing, cache skip behavior, artifact attribution, and stage metadata updates.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/assessment.ts`
  - `tests/editing-revision.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/assessment.ts` now owns `generateEditorialAssessmentWorkflow`, the assessment reply schema, assess-model routing, cached assessment reuse, deterministic fallback assessment generation, `EDITORIAL_ASSESSMENT` artifact attribution, and stage metadata updates. The public editing monolith imports the workflow from the assessment module instead of defining it locally.
- Risks discovered: Provider behavior was not exercised to avoid live spend. The monolith still keeps an assess-model helper for later conversation and planning flows until 8.2e3f moves those seams.
- Blocker or next package: None for 8.2e3c. Parent 8.2e3 remains unchecked. Next package is 8.2e3d Editing revision generation extraction.

### 2026-07-13 19:12 — Package 8.2e3d

- Status: complete
- Objective: Move `generateManuscriptRevisionWorkflow` behind the revision module while preserving polish-model routing, deterministic fallback behavior, chapter attribution, and no-spend tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/revision.ts`
  - `tests/editing-revision.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/revision.ts` now owns `generateManuscriptRevisionWorkflow`, `ManuscriptRevisionReplySchema`, final-editor polish routing, fallback unchanged-text revision generation, model changed-chapter key filtering, revision artifact creation, and single-chapter artifact attribution. `editing.ts` imports the generation workflow from the revision module for the still-monolithic planning/execution flows.
- Risks discovered: Provider behavior was not exercised to avoid live spend. Apply/reject and revision planning/execution remain compatibility wrappers that dynamically import the monolith until 8.2e3e and 8.2e3f move those workflows.
- Blocker or next package: None for 8.2e3d. Parent 8.2e3 remains unchecked. Next package is 8.2e3e Editing revision apply/reject extraction.

### 2026-07-13 19:20 — Package 8.2e3e

- Status: complete
- Objective: Move apply/reject revision workflows behind the revision module while preserving assembly updates, final approval state updates, preferences, and publish-package refresh triggers.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/revision.ts`
  - `tests/editing-revision.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/revision.ts` now owns `applyManuscriptRevisionWorkflow` and `rejectManuscriptRevisionWorkflow`, including deterministic manuscript assembly updates, draft-quality flag clearing after accepted revisions, accepted/rejected preference metadata, final chapter approval marking, and the existing conditional publishing-package refresh trigger. `editing.ts` imports the apply workflow only for still-monolithic plan execution.
- Risks discovered: Publishing-package refresh still dynamically imports the monolith because publishing extraction is intentionally deferred to 8.2e4. Revision planning/execution still dynamically imports the monolith until 8.2e3f.
- Blocker or next package: None for 8.2e3e. Parent 8.2e3 remains unchecked. Next package is 8.2e3f Editing revision planning/execution extraction.

### 2026-07-13 19:29 — Package 8.2e3f

- Status: complete
- Objective: Move revision plan generation, plan execution, and suggested revision target generation behind revision modules while preserving metadata and readiness-gate behavior.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/revision.ts`
  - `tests/editing-revision.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/revision.ts` now owns `generateEditorialRevisionPlanWorkflow`, `executeEditorialRevisionPlanWorkflow`, and `generateSuggestedRevisionFromConversationWorkflow`, including plan reply schema, assess-model planning route, deterministic plan floor, plan execution metadata, auto-apply, and conversation-suggested revision targets. `editing.ts` imports the plan-generation and execution workflows only for the full editorial loop.
- Risks discovered: Provider behavior was not exercised to avoid live spend. The only remaining revision-adjacent monolith coupling is the full-loop/commit/publishing boundary, which belongs to 8.2e3g/8.2e4 cleanup rather than this package.
- Blocker or next package: None for 8.2e3f. Parent 8.2e3 remains unchecked. Next package is 8.2e3g Editing revision seam cleanup.

### 2026-07-13 19:34 — Package 8.2e3g

- Status: complete
- Objective: Collapse temporary revision/assessment re-exports and ensure public callers no longer import revision or assessment behavior from `editing.ts`.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/revision.ts`
  - `tests/editing-revision.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The revision parent package is complete. `editing-public.ts` exports assessment and revision workflows from `editing/assessment.ts` and `editing/revision.ts`; `editing.ts` no longer exports assessment, revision generation, apply/reject, plan generation, plan execution, or suggested-revision workflows. Static guards now block regression to monolith-exported revision workflows.
- Risks discovered: `editing/revision.ts` still dynamically imports `preparePublishingPackageWorkflow` from `editing.ts` after applied revisions when a publishing package or derived artifact already exists. That bridge belongs to 8.2e4, because publishing/commit extraction is intentionally separate from revision extraction.
- Blocker or next package: None for 8.2e3g. Parent 8.2e3 is complete. Next package is 8.2e4 Editing publishing/commit extraction.

### 2026-07-13 19:51 — Package 8.2e4a

- Status: complete
- Objective: Identify publishing/commit workflow ownership, move pure publishing package/provenance/handoff builders behind support modules, and add focused non-spending guardrails.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/publishing-support.ts`
  - `tests/editing-publishing.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-publishing.test.ts tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: 8.2e4 is now split into safe subpackages. `editing/publishing-support.ts` owns the static extraction contract and deterministic publishing helpers for package building, provenance reporting, and marketing handoff generation. `editing.ts` now routes publishing package/provenance/marketing handoff construction through the support module while runtime publishing and commit workflows remain in place for the next subpackages.
- Risks discovered: The old local helper copies still exist in `editing.ts` as dead legacy code until 8.2e4d cleanup. Runtime publishing and commit workflows have not moved yet; 8.2e4b should move publishing workflows first so the dynamic bridge from revision apply can target `editing/publishing.ts`.
- Blocker or next package: None for 8.2e4a. Parent 8.2e4 remains unchecked. Next package is 8.2e4b Editing publishing workflow extraction.

### 2026-07-13 20:03 — Package 8.2e4b

- Status: complete
- Objective: Move `preparePublishingPackageWorkflow` and `finalizePublishingHandoffWorkflow` behind the publishing module while preserving derived artifact refresh and final handoff metadata.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `prisma/seed-reference-books.ts`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/publishing.ts`
  - `src/lib/workflows/editing/revision.ts`
  - `tests/editing-publishing.test.ts`
  - `tests/editing-revision.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-publishing.test.ts tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/publishing.ts` now owns `preparePublishingPackageWorkflow`, `finalizePublishingHandoffWorkflow`, and `syncPublishDerivedArtifacts`, including publishing package persistence, derived provenance/marketing handoff refresh, final handoff metadata, and book metadata update. `editing/revision.ts` now imports the publishing workflow directly instead of dynamically importing `editing.ts`. The reference-book seed script now imports Editing workflows through `editing-public.ts`.
- Risks discovered: Commit and full-loop workflows still live in `editing.ts`; they still call publishing through the extracted module. Local dead helper copies remain in `editing.ts` until 8.2e4d cleanup.
- Blocker or next package: None for 8.2e4b. Parent 8.2e4 remains unchecked. Next package is 8.2e4c Editing commit and full-loop extraction.

### 2026-07-13 20:19 — Package 8.2e4c

- Status: complete
- Objective: Move `commitEditingStageWorkflow` and `runFullEditorialLoopWorkflow` behind the commit module while preserving readiness gates, stale checks, stage commit behavior, and full-loop orchestration.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/commit.ts`
  - `src/lib/workflows/workflow-automation.ts`
  - `tests/editing-publishing.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-publishing.test.ts tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/commit.ts` now owns `commitEditingStageWorkflow` and `runFullEditorialLoopWorkflow`, including manuscript readiness checks, revised-chapter stale protection, publishing-package creation, derived artifact refresh, stage commit metadata, full-loop assessment/plan/apply orchestration, and optional commit-after readiness gating. `workflow-automation.ts` now imports Editing workflows through `editing-public.ts` instead of the monolith.
- Risks discovered: Temporary monolith facades remain for `editing/assembly.ts` and `editing/interaction.ts`; `editing.ts` also still contains legacy local publishing support helper implementations that are no longer exported by the extracted publishing workflows. This is expected cleanup scope for 8.2e4d and later split work.
- Blocker or next package: None for 8.2e4c. Parent 8.2e4 remains unchecked. Next package is 8.2e4d Editing publishing/commit seam cleanup.

### 2026-07-13 20:29 — Package 8.2e4d

- Status: complete
- Objective: Collapse temporary publishing/commit seam residue and ensure public callers no longer import publishing or commit behavior from `editing.ts`.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `tests/editing-publishing.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/editing-publishing.test.ts tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Removed the dead publishing package, provenance, marketing handoff, and derived-artifact sync helper copies from `editing.ts` now that publishing and commit workflows live in dedicated modules. The static publishing test now asserts those legacy support seams stay out of the monolith. Parent package 8.2e4 is complete.
- Risks discovered: `editing/assembly.ts` and `editing/interaction.ts` remain thin facades over `editing.ts`; this is outside the publishing/commit seam and belongs to later duplicate-path or monolith-removal work.
- Blocker or next package: None for 8.2e4d. Parent 8.2e4 is complete. Next package is 8.3 Remove duplicate paths; it should be split before code changes because it spans provider utilities, orchestration, save/commit routes, facades, and navigation cleanup.

### 2026-07-13 20:43 — Package 8.2b3d3

- Status: complete
- Objective: Move `getPromiseWorkspace` implementation behind the Promise workspace module after helper extraction.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/workspace.ts`
  - `src/lib/workflows/promise/workspace-loader-support.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-workspace-assembly.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `promise/workspace.ts` now owns the full `getPromiseWorkspace` loader orchestration instead of re-exporting it from `promise.ts`. The loader uses the previously extracted workspace assembly helpers plus a new workspace-loader support module for Promise fallback and normalization helpers. Parent packages 8.2b3d and 8.2b3 are complete.
- Risks discovered: `promise/generation.ts` still imports graph-run behavior from `../promise`; this belongs to the remaining Promise generation extraction package, not the workspace loader.
- Blocker or next package: None for 8.2b3d3. Next package is the first remaining unchecked Promise generation extraction subpackage under 8.2b4.

### 2026-07-13 20:49 — Package 8.2 parent closure

- Status: complete
- Objective: Close completed parent checkboxes after verifying their child packages were already complete.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-workspace-assembly.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Parent packages 8.2b4, 8.2b, 8.2e, and 8.2 are now checked after their listed implementation subpackages were completed. The stabilization queue can now proceed to 8.3 without skipping unfinished 8.2 work.
- Risks discovered: None; documentation-only checklist closure.
- Blocker or next package: None. Next package is 8.3 Remove duplicate paths, which should be split into narrower subpackages before source edits.

### 2026-07-13 21:00 — Package 8.3a

- Status: complete
- Objective: Record remaining duplicate/facade seams and add static tests so cleanup removes known paths instead of chasing guesses.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `tests/duplicate-paths.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/duplicate-paths.test.ts tests/workflow-public-entrypoints.test.ts tests/workflow-registry.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: 8.3 is split into focused subpackages. The new duplicate-path test inventories the remaining workflow monolith facades, blocks new raw provider construction outside `src/lib/llm/providers.ts`, and records known duplicate navigation maps for targeted cleanup.
- Risks discovered: Remaining workflow monolith facades are currently `editing/assembly.ts`, `editing/interaction.ts`, `promise/generation.ts`, and `research/commit.ts`. Known navigation duplicate maps remain in `src/app/books/[slug]/cost-analysis/page.tsx`, `src/app/books/[slug]/workspace-shell.tsx`, and `src/lib/navigation.ts`.
- Blocker or next package: None for 8.3a. Next package is 8.3b Workflow facade cleanup.

### 2026-07-13 21:08 — Package 8.3b1

- Status: complete
- Objective: Move remaining Research commit facade behavior behind `research/commit.ts`.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/research.ts`
  - `src/lib/workflows/research/commit.ts`
  - `tests/duplicate-paths.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/duplicate-paths.test.ts tests/workflow-public-entrypoints.test.ts tests/research-jobs.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `research/commit.ts` now owns `commitChapterResearchWorkflow` and `commitAllResearchWorkflow` directly instead of re-exporting from `research.ts`. The duplicate-path inventory now shows three remaining workflow monolith facades.
- Risks discovered: `research.ts` still contains binder tab/idea clip operations that call the moved commit helper; those are separate from this commit facade and can be handled by later duplicate-path cleanup if needed.
- Blocker or next package: None for 8.3b1. Next package is 8.3b2 Editing assembly facade cleanup.

### 2026-07-13 23:32 — Package 8.3b2

- Status: complete
- Objective: Move manuscript assembly behavior behind `editing/assembly.ts`.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/assembly.ts`
  - `tests/duplicate-paths.test.ts`
  - `tests/editing-publishing.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/duplicate-paths.test.ts tests/workflow-public-entrypoints.test.ts tests/editing-publishing.test.ts tests/editing-workspace.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/assembly.ts` now owns deterministic full-manuscript assembly directly instead of re-exporting from `editing.ts`. The assembly module loads chapter snapshots, validates draft completeness, builds overview/concerns/full text, and writes the `MANUSCRIPT_ASSEMBLY` artifact through the editing artifact repository. The duplicate-path inventory now shows two remaining workflow monolith facades.
- Risks discovered: `editing/interaction.ts` and `promise/generation.ts` remain monolith facades. The editing publishing static ownership test was updated so it now guards the new assembly ownership boundary instead of expecting the old facade.
- Blocker or next package: None for 8.3b2. Next package is 8.3b3 Editing interaction facade cleanup.

### 2026-07-13 23:41 — Package 8.3b3

- Status: complete
- Objective: Move editing chat/preferences behavior behind `editing/interaction.ts`.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/editing.ts`
  - `src/lib/workflows/editing/interaction.ts`
  - `tests/duplicate-paths.test.ts`
  - `tests/editing-revision.test.ts`
  - `tests/editing-workspace.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/duplicate-paths.test.ts tests/workflow-public-entrypoints.test.ts tests/editing-workspace.test.ts tests/editing-revision.test.ts tests/editing-publishing.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `editing/interaction.ts` now owns `sendEditingMessageWorkflow` and `updateEditorialPreferencesWorkflow` directly instead of re-exporting from `editing.ts`. The editor conversation remains routed through `final-editor:assess` for analytical dialogue, not the Opus polish route. The remaining workflow monolith facade inventory now contains only `promise/generation.ts`.
- Risks discovered: `editing.ts` is now effectively a legacy schema-export file, while canonical editing modules already use `editing/workspace-schemas.ts`. Schema consolidation is intentionally left out of this package.
- Blocker or next package: None for 8.3b3. Next package is 8.3b4 Promise generation facade cleanup.

### 2026-07-13 23:48 — Package 8.3b4a

- Status: complete
- Objective: Record the remaining Promise generation facade exports, owner modules, and targeted no-spend verification before moving runtime code.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `tests/promise-generation-facade.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-facade.test.ts tests/duplicate-paths.test.ts tests/workflow-public-entrypoints.test.ts tests/promise-generation-runtime.test.ts tests/promise-generation-runtime-nodes.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: 8.3b4 is split into title/report generation, comprehensive statement generation, and runtime cleanup subpackages. The new Promise generation facade test pins the exact temporary monolith exports and runtime node dependencies so subsequent moves can remove known seams without broad Promise regressions.
- Risks discovered: `promise.ts` still owns the live provider-adjacent implementations for title/subtitle finalization, book promise report generation, comprehensive promise statement generation, and `runPromiseWorkflow`. These moves should be done in the listed smaller packages, not as one broad extraction.
- Blocker or next package: None for 8.3b4a. Next package is 8.3b4b Promise title/report generation extraction.

### 2026-07-13 23:55 — Package 8.3b4b1

- Status: complete
- Objective: Reuse extracted title/subtitle normalization, fallback, and token-usage helpers from Promise support modules in the generation path.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-facade.test.ts tests/promise-workspace-assembly.test.ts tests/promise-market-analysis-normalization.test.ts tests/workflow-public-entrypoints.test.ts tests/duplicate-paths.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `promise.ts` no longer carries duplicate copies of title/subtitle fallback, title/subtitle normalization, or token-usage normalization helpers. The live generation path now imports those deterministic helpers from `promise/workspace-loader-support.ts` and `promise/market-analysis-normalization.ts`, reducing helper drift before runtime movement.
- Risks discovered: The title/report runtime functions still live in `promise.ts`. The next package should move `maybeGenerateTitleSubtitleFinalization` and `maybeGenerateBookPromiseReport` behind a focused Promise generation module after extracting or importing their remaining grounding/section-generation helpers.
- Blocker or next package: None for 8.3b4b1. Next package is 8.3b4b2 Promise title/report runtime move.

### 2026-07-13 23:58 — Package 8.3b4b2

- Status: complete
- Objective: Move title/subtitle finalization and book promise report generation behind Promise generation modules while preserving grounding metadata and fallback behavior.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation.ts`
  - `src/lib/workflows/promise/title-report-generation.ts`
  - `tests/promise-generation-facade.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-facade.test.ts tests/promise-workspace-assembly.test.ts tests/promise-market-analysis-normalization.test.ts tests/promise-report-composition-helpers.test.ts tests/promise-report-presentation.test.ts tests/workflow-public-entrypoints.test.ts tests/duplicate-paths.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `promise/title-report-generation.ts` now owns `maybeGenerateTitleSubtitleFinalization` and `maybeGenerateBookPromiseReport`. The generation facade exports those functions from the focused module instead of `promise.ts`; the monolith no longer exports them and no longer carries the title/report grounding and segmented book-pitch helper copies.
- Risks discovered: `promise.ts` still owns `generateComprehensivePromiseStatement` and `runPromiseWorkflow`, so `promise/generation.ts` still has a temporary monolith export block for those two remaining symbols.
- Blocker or next package: None for 8.3b4b2. Parent 8.3b4b is complete. Next package is 8.3b4c Promise comprehensive statement extraction.

### 2026-07-14 00:00 — Package 8.3b4c

- Status: complete
- Objective: Move setup-derived comprehensive promise statement generation behind Promise generation modules while preserving knowledge-base grounding and fallback behavior.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation.ts`
  - `src/lib/workflows/promise/comprehensive-statement-generation.ts`
  - `tests/promise-generation-facade.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-facade.test.ts tests/promise-generation-context.test.ts tests/workflow-public-entrypoints.test.ts tests/duplicate-paths.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `promise/comprehensive-statement-generation.ts` now owns `generateComprehensivePromiseStatement`, including the setup context, knowledge-base grounding, fallback, and model invocation path. The Promise generation facade no longer exports that symbol from `promise.ts`.
- Risks discovered: `promise.ts` still owns `runPromiseWorkflow` and its runtime node dependencies, so `promise/generation.ts` still has one temporary monolith export.
- Blocker or next package: None for 8.3b4c. Next package is 8.3b4d Promise runtime facade cleanup.

### 2026-07-14 00:04 — Package 8.3b4d

- Status: complete
- Objective: Move or wire `runPromiseWorkflow` so `promise/generation.ts` no longer imports from the monolith, then close 8.3b.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/promise.ts`
  - `src/lib/workflows/promise/generation.ts`
  - `src/lib/workflows/promise/runtime-workflow.ts`
  - `tests/duplicate-paths.test.ts`
  - `tests/promise-generation-facade.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/promise-generation-facade.test.ts tests/promise-generation-runtime.test.ts tests/promise-generation-runtime-nodes.test.ts tests/workflow-public-entrypoints.test.ts tests/duplicate-paths.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: `promise/runtime-workflow.ts` now owns `runPromiseWorkflow` and its runtime node wiring. The Promise generation facade exports the runtime workflow from the focused module instead of `promise.ts`, and the duplicate-path guardrail now expects zero workflow monolith facade imports.
- Risks discovered: The legacy `promise.ts` file still contains private, unused Promise generation helper copies. It is no longer a public workflow facade after this package, but a later dead-code/schema consolidation package should remove or retire the file safely.
- Blocker or next package: None for 8.3b4d. Parent 8.3b4 and 8.3b are complete. Next package is 8.3c Direct provider utility cleanup.

### 2026-07-14 00:09 — Package 8.3c

- Status: complete
- Objective: Remove or explicitly quarantine remaining raw provider utilities outside the LLM gateway boundary.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/validation/simple-refinement.ts`
  - `src/lib/workflows/research/extraction-verification.ts`
  - `tests/llm-attribution-enforcement.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/llm-attribution-enforcement.test.ts tests/duplicate-paths.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The validation refinement helper no longer presents as a direct `callOpenAI` utility or logs a “Raw OpenAI response”; it now uses provider-neutral gateway naming. The Research passage prefilter dependency parameter was also renamed from `getModel` to a role-specific provider callback so the existing gateway path is not mistaken for a raw model factory.
- Risks discovered: PDF vision extraction still intentionally uses the LLM gateway for visual PDF extraction when explicitly requested. That is not a raw provider bypass, but it remains a spend-cap-sensitive path covered by the broader budget and live-spend gates.
- Blocker or next package: None for 8.3c. Next package is 8.3d Client-side model orchestration cleanup.

### 2026-07-14 00:12 — Package 8.3d

- Status: blocked
- Objective: Remove client-side or UI-triggered model orchestration paths that bypass durable jobs, budgets, or gateway attribution.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Not run; no code change was made for this blocked package.
- Live provider spend: none
- Behavioral result: No runtime behavior changed.
- Risks discovered: `src/app/books/[slug]/chapter-draft-bmad-panel.tsx` still contains a browser-driven multi-call generation loop: it builds the manifest, calls `/agent-chat` to write a chapter, calls `/agent-chat` again for validator output with `skipContext`, may call `/agent-chat` a third time for auto-revision, and also supports manual revision/regeneration from the client. Replacing that safely requires a product/runtime decision about whether to retire the legacy BMAD panel, route it through existing durable chapter-draft jobs/server actions, or preserve the panel UI while moving all orchestration server-side.
- Blocker or next package: Blocked by ambiguous product decision and non-trivial runtime migration scope. Package 8.3d remains unchecked. Checking whether 8.3e can proceed independently.

### 2026-07-14 00:15 — Package 8.3e

- Status: blocked
- Objective: Consolidate duplicate save, approve, and commit route behavior behind stage transition and artifact services.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
- Schema or migration changes: none
- Tests run:
  - Not run; no code change was made for this blocked package.
- Live provider spend: none
- Behavioral result: No runtime behavior changed.
- Risks discovered: The duplicate route surface is real, but it is tied to the same legacy agent-chat/BMAD paths as 8.3d. Examples include `/agent-chat/save-draft`, `/agent-chat/chapter-draft`, `/agent-chat/chapter-draft/approve-all`, `/agent-chat/editing`, `/agent-chat/editing/approve-all`, `/agent-chat/save-dossier`, and `/agent-chat/commit-stage`. Several already use `artifact-transaction-service` and `stage-transition-service`, so the remaining cleanup is not a mechanical import swap; it requires deciding whether to retire, alias, or preserve these legacy endpoints while moving callers to durable workflow actions.
- Blocker or next package: Blocked by the same ambiguous legacy-route/product decision as 8.3d. Package 8.3e remains unchecked. Checking whether 8.3f can proceed independently.

### 2026-07-14 00:20 — Package 8.3f

- Status: complete
- Objective: Rename, downgrade, or block fallback paths that can be mistaken for verified production output.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/lib/workflows/chapter-draft/model-helpers.ts`
  - `tests/chapter-draft-model-helpers.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/chapter-draft-model-helpers.test.ts tests/chapter-draft-execution-support.test.ts tests/chapter-draft-execution.test.ts tests/duplicate-paths.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The durable Quill author path no longer returns deterministic fallback chapter prose when the author model is unavailable or generation fails. Instead, it throws an explicit error and blocks the run so fake manuscript prose cannot be saved as a reviewable draft.
- Risks discovered: Deterministic fallback reviews/critics still exist for non-prose quality scaffolding, which is acceptable because they are diagnostic artifacts rather than manuscript text. Legacy browser-driven BMAD generation from 8.3d remains separately blocked.
- Blocker or next package: None for 8.3f. Next package is 8.3g Duplicate navigation-map cleanup.

### 2026-07-14 00:25 — Package 8.3g

- Status: complete
- Objective: Remove duplicate route/stage/navigation maps now covered by the authoritative workflow registry.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/books/[slug]/author/page.tsx`
  - `src/app/books/[slug]/chapter-draft/page.tsx`
  - `src/app/books/[slug]/cost-analysis/page.tsx`
  - `src/app/books/[slug]/dashboard/page.tsx`
  - `src/app/books/[slug]/files/page.tsx`
  - `src/app/books/[slug]/stage-spine.tsx`
  - `src/lib/navigation.ts`
  - `tests/duplicate-paths.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/duplicate-paths.test.ts tests/workflow-public-entrypoints.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Standalone stage/sidebar navigation now uses `getBookStageLinks(...)` from the workflow registry instead of the frozen nonfiction `STAGE_LINKS` constant. Cost Analysis now derives its stage order and labels from the workflow registry and keeps only cost-specific role/agent annotations. The duplicate-path guardrail now expects no workflow-stage map duplicates; only Book Studio's local utility link list remains tracked because it is not a workflow stage map.
- Risks discovered: Package 8.3 cannot close while 8.3d and 8.3e remain blocked. Those blockers both depend on deciding what to do with the legacy BMAD/agent-chat browser orchestration and route surface.
- Blocker or next package: Stop here. 8.3d and 8.3e remain unchecked and block closing parent 8.3.

### 2026-07-14 01:12 — Package 8.3d

- Status: complete
- Objective: Remove client-side or UI-triggered model orchestration paths that bypass durable jobs, budgets, or gateway attribution.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/chapter-draft/run/route.ts`
  - `src/app/books/[slug]/chapter-draft-bmad-panel.tsx`
  - `tests/client-orchestration-cleanup.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/client-orchestration-cleanup.test.ts tests/chapter-draft-jobs.test.ts tests/chapter-draft-execution.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: The Book Studio Chapter Draft panel no longer streams Quill generation, validator checks, auto-revision, or manifest generation from the browser. Its generation controls now call an authenticated durable-run API that queues full, selected-chapter, retry, and stop actions through the existing Chapter Draft workflow-run machinery. Manual text save/review/approve UI remains in place for the next route-consolidation package.
- Risks discovered: Legacy save/approve endpoints under `/agent-chat/chapter-draft` and `/agent-chat/chapter-draft/approve-all` are still used for non-generation artifact lifecycle actions. That is now isolated to Package 8.3e.
- Blocker or next package: None for 8.3d. Next package is 8.3e Redundant save/commit route cleanup.

### 2026-07-14 01:22 — Package 8.3e

- Status: complete
- Objective: Consolidate duplicate save, approve, and commit route behavior behind stage transition and artifact services.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/[slug]/chapter-draft/artifacts/route.ts`
  - `src/app/api/books/[slug]/chapter-draft/approve-all/route.ts`
  - `src/app/books/[slug]/chapter-draft-bmad-panel.tsx`
  - `tests/chapter-approval-state.test.ts`
  - `tests/client-orchestration-cleanup.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/client-orchestration-cleanup.test.ts tests/artifact-transaction-service.test.ts tests/stage-transition-service.test.ts tests/chapter-approval-state.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Book Studio Chapter Draft artifact loading, manual text save, and approve-all now use canonical `/chapter-draft/...` routes instead of primary calls to legacy `/agent-chat/chapter-draft...` URLs. The canonical routes delegate to the existing service-backed implementation, preserving compatibility while moving active UI callers off the legacy path. The approval-state static test was updated to point at the current extracted workspace owner instead of the old monolith facade.
- Risks discovered: The generic `AgentChatPanel`, Editing BMAD panel, Scout panel, and Chronicle panel still use broader `/agent-chat/...` lifecycle routes for their own stage-specific surfaces. Those routes already pass through the artifact transaction and stage transition services covered by guardrail tests, but a future polish pass can add canonical non-chat aliases for those callers too if desired.
- Blocker or next package: None for 8.3e. Parent package 8.3 is now complete. Next package is 9.1 Unit tests.

### 2026-07-14 01:38 — Package 9.1

- Status: complete
- Objective: Cover pricing, budgets, context selection, chapter identity, invalidation, citations, state transitions, editorial instructions, and preflight with non-spending unit tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `tests/dependency-invalidation.test.ts`
  - `tests/editing-bookwide-assessment.test.ts`
  - `tests/source-evidence-contract.test.ts`
  - `tests/unit-verification-coverage.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/unit-verification-coverage.test.ts tests/llm-cost-ledger.test.ts tests/llm-budget.test.ts tests/chapter-draft-context.test.ts tests/chapter-identity.test.ts tests/dependency-invalidation.test.ts tests/source-evidence-contract.test.ts tests/stage-transition-service.test.ts tests/editing-bookwide-assessment.test.ts tests/typeset-preflight.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added an explicit Milestone 9.1 coverage spine that maps each required unit-test category to the concrete local tests/modules that cover it. Repointed stale static assertions to the extracted owner modules for Research commit invalidation, Chapter Draft source availability, and Editing chapter loading/assessment/revision support, preserving the intent of the tests after the facade cleanup.
- Risks discovered: 9.1 is now covered by local unit/static tests only. Database concurrency, route behavior, and workflow-simulation coverage remain intentionally deferred to 9.2, 9.3, and 9.4.
- Blocker or next package: None for 9.1. Next package is 9.2 Database tests.

### 2026-07-13 23:32 — Package 9.2

- Status: complete
- Objective: Cover concurrent version creation, atomic commits, duplicate jobs, cancellation, lease recovery, ownership, lost updates, and stale propagation with non-spending database integrity tests.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `tests/database-integrity-contracts.test.ts`
  - `tests/workflow-durable-jobs.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/database-integrity-contracts.test.ts tests/artifact-transaction-service.test.ts tests/workflow-durable-jobs.test.ts tests/chapter-approval-state.test.ts tests/typed-operational-state.test.ts tests/chapter-draft-jobs.test.ts tests/research-jobs.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added a database integrity contract suite that verifies schema uniqueness/indexes for artifact versions, workflow jobs, and chapter approvals; transactional artifact version and commit seams; duplicate workflow-job prevention; cancellation and lease recovery semantics; ownership route coverage; unique upserted state for stale/lost-update protection; and no destructive deletes for versioned workflow integrity state. Updated durable job coverage to follow the current extracted Research and Chapter Draft jobs modules.
- Risks discovered: 9.2 remains a local/static database contract suite; it verifies code/schema guardrails without opening a live database transaction or simulating true concurrent writers. Full route behavior and fake-provider workflow simulations remain intentionally deferred to 9.3 and 9.4.
- Blocker or next package: None for 9.2. Next package is 9.3 API tests.

### 2026-07-13 23:38 — Package 9.3

- Status: complete
- Objective: Cover authentication, ownership, validation, size limits, idempotency, and rate limiting for API routes without live provider calls.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `src/app/api/books/import-archive/route.ts`
  - `src/lib/book-archive-import.ts`
  - `tests/api-route-contracts.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/api-route-contracts.test.ts tests/auth-shared.test.ts tests/request-limits.test.ts tests/llm-budget.test.ts tests/workflow-durable-jobs.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added an API route contract suite that verifies middleware API auth coverage, ownership-aware book-scoped route access, bounded JSON parsing, upload/archive/persona file limits, generation rate limiting, validation error branches, and durable run idempotency via active-run reuse. Fixed archive import so imported books are assigned to the authenticated app user instead of falling back to the default local user.
- Risks discovered: 9.3 is still a local/static API contract suite, not a live HTTP server exercise. True request/response integration and fake-provider workflow behavior remain deferred to 9.4 and 9.5.
- Blocker or next package: None for 9.3. Next package is 9.4 Workflow simulations.

### 2026-07-13 23:44 — Package 9.4

- Status: complete
- Objective: Use fake providers for success, malformed output, timeout, rate limit, partial stream, cancellation, retry, restart, rejection, outline change, and stale downstream work without live provider calls.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `tests/workflow-simulations.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/workflow-simulations.test.ts tests/promise-generation-response.test.ts tests/research-extraction-verification.test.ts tests/retry-policy.test.ts tests/request-limits.test.ts tests/workflow-durable-jobs.test.ts tests/dependency-invalidation.test.ts tests/stage-transition-service.test.ts tests/final-assembly.test.ts`
  - `npm run check`
- Live provider spend: none
- Behavioral result: Added a workflow simulation suite that exercises fake-provider success, malformed structured output fallback, verifier rejection, partial stream recovery, incomplete JSON rejection, timeout handling, rate-limit handling, durable cancellation/retry/restart contracts, outline-change invalidation, and stale downstream final-assembly blocking. The malformed-output simulation intentionally logs the local Research fallback error and asserts the result is provisional.
- Risks discovered: 9.4 uses fake providers and static durable-workflow contracts rather than a live PostgreSQL-backed end-to-end worker run. Full production-build and broader non-spending regression coverage remain deferred to 9.5.
- Blocker or next package: None for 9.4. Next package is 9.5 Final verification.

### 2026-07-13 23:52 — Package 9.5

- Status: complete
- Objective: Run final non-spending verification across typecheck, production build, regression tests, database-integrity checks, dependency audit, route-contract tests, and a documented manual acceptance review.
- Files changed:
  - `docs/GHOSTWRITR-STABILIZATION-EXECUTION.md`
  - `tests/base-story-guidance-contract.test.ts`
  - `tests/personal-story-contract.test.ts`
  - `tests/phase1-strategic-brief.test.ts`
  - `tests/quill-context-contract.test.ts`
- Schema or migration changes: none
- Tests run:
  - `npx tsx --test tests/api-route-contracts.test.ts tests/artifact-transaction-service.test.ts tests/audiobook-package.test.ts tests/auth-shared.test.ts tests/base-story-guidance-contract.test.ts tests/bibliography-generator.test.ts tests/chapter-approval-state.test.ts tests/chapter-draft-commit.test.ts tests/chapter-draft-context.test.ts tests/chapter-draft-execution-support.test.ts tests/chapter-draft-execution.test.ts tests/chapter-draft-jobs.test.ts tests/chapter-draft-model-helpers.test.ts tests/chapter-draft-repair.test.ts tests/chapter-draft-source-availability.test.ts tests/chapter-draft-workspace-support.test.ts tests/chapter-draft-workspace.test.ts tests/chapter-identity.test.ts tests/client-orchestration-cleanup.test.ts tests/database-integrity-contracts.test.ts tests/dependency-invalidation.test.ts tests/duplicate-paths.test.ts tests/editing-bookwide-assessment.test.ts tests/editing-publishing.test.ts tests/editing-revision.test.ts tests/editing-workspace.test.ts tests/final-assembly.test.ts tests/kdp-docx-plan.test.ts tests/kdp-pdf-export.test.ts`
  - `npx tsx --test tests/llm-attribution-enforcement.test.ts tests/llm-budget.test.ts tests/llm-cost-ledger.test.ts tests/llm-gateway.test.ts tests/other-exports.test.ts tests/outline-linkage.test.ts tests/personal-story-contract.test.ts tests/phase1-strategic-brief.test.ts tests/promise-audience-personas-support.test.ts tests/promise-core-truths-support.test.ts tests/promise-generation-context.test.ts tests/promise-generation-facade.test.ts tests/promise-generation-prompts.test.ts tests/promise-generation-response.test.ts tests/promise-generation-runtime-nodes.test.ts tests/promise-generation-runtime-state.test.ts tests/promise-generation-runtime.test.ts tests/promise-market-analysis-fallback.test.ts tests/promise-market-analysis-grounding.test.ts tests/promise-market-analysis-normalization.test.ts tests/promise-market-analysis-report.test.ts tests/promise-market-analysis-support.test.ts tests/promise-market-recommendations-support.test.ts`
  - `npx tsx --test tests/promise-report-composition-helpers.test.ts tests/promise-report-fallback.test.ts tests/promise-report-grounding-metadata.test.ts tests/promise-report-markdown.test.ts tests/promise-report-persona-context.test.ts tests/promise-report-presentation.test.ts tests/promise-report-rendering.test.ts tests/promise-transformation-support.test.ts tests/promise-workspace-assembly.test.ts tests/publish-package-wiring.test.ts tests/quill-context-contract.test.ts tests/request-limits.test.ts tests/research-chapter-live-pipeline.test.ts tests/research-chapter-seeds.test.ts tests/research-dossier.test.ts tests/research-execution-setup.test.ts tests/research-extraction-verification.test.ts tests/research-fallback.test.ts tests/research-jobs.test.ts tests/research-persistence.test.ts tests/research-run-progress.test.ts tests/research-run-results.test.ts tests/research-source-discovery.test.ts tests/research-source-utils.test.ts tests/research-workspace-support.test.ts tests/retry-policy.test.ts tests/source-evidence-contract.test.ts tests/stage-transition-service.test.ts tests/typed-operational-state.test.ts tests/typeset-plan.test.ts tests/typeset-preflight.test.ts tests/unit-verification-coverage.test.ts tests/workflow-durable-jobs.test.ts tests/workflow-public-entrypoints.test.ts tests/workflow-registry.test.ts tests/workflow-simulations.test.ts`
  - `npm run check`
  - `npm run build`
  - `npm audit --omit=dev`
- Live provider spend: none
- Manual acceptance review:
  - Authentication, ownership, route validation, size limits, idempotency, rate limiting, and archive import ownership are covered by route-contract and auth tests.
  - LLM spend controls are covered by attribution enforcement, central gateway, cost ledger, retry policy, and `$20` per-book confirmation gate tests.
  - Durable execution is covered by workflow-run schema, duplicate-job, claim/lease/heartbeat/recovery, cancellation, and fake-provider workflow simulation tests.
  - Artifact integrity is covered by chapter identity, transactional artifact service, approval-state, dependency-invalidation, and database-integrity contract tests.
  - Canonical book flow is covered from Phase 1 through Promise, outline linkage, Base Story guidance, evidence contracts, personal stories, Quill context/readiness, editing assessment/revision, final approval, assembly, typeset preflight, KDP DOCX/PDF, other exports, publish package, and audiobook handoff tests.
  - Production build completed successfully; the only observed build warning is the Next.js deprecation notice that `middleware` should eventually move to the `proxy` convention.
  - Legacy QA scripts were inspected but not run in this final heartbeat because the safe-looking archive and artifact-contract scripts touch the local database and the archive roundtrip script deletes imported test books. The non-spending node test suite covers their contracts without destructive real-data cleanup.
- Behavioral result: Final verification passed with 332 non-spending tests across three chunks, clean TypeScript, successful production build, and zero production dependency audit vulnerabilities. Stale final-verification static tests were repointed to the current extracted owner modules after the Milestone 8 monolith/facade cleanup, preserving their original contract intent.
- Risks discovered: Final verification remains a local/static/fake-provider confidence pass rather than a live browser/manual UI session, live PostgreSQL concurrency stress test, live worker daemon run, or visual inspection of generated DOCX/PDF output. Those would require a separate authorized acceptance run with explicit runtime/data boundaries.
- Blocker or next package: None. Package 9.5 is complete and the stabilization checklist is complete.
