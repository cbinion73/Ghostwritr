---
title: 'Post-stabilization consolidation'
type: 'refactor'
created: '2026-07-14'
status: 'done'
baseline_commit: '17d3a8fd5509dc31b72d90324643e2ad765fc9bc'
context:
  - '{project-root}/docs/GHOSTWRITR-STABILIZATION-EXECUTION.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stabilization left several compatibility routes, oversized UI/workflow files, duplicated schemas, and repeated client request patterns that increase maintenance risk without improving book quality.

**Approach:** Consolidate ownership behind stable interfaces, preserve public behavior and legacy compatibility where still required, and verify each independently shippable package before continuing.

## Boundaries & Constraints

**Always:** Preserve generated-book quality, prompts, model routing, artifact history, approval gates, durable-job behavior, authentication, and existing API response contracts. Keep old routes only as thin, documented aliases while callers migrate. Use no live LLM calls or provider spend in verification.

**Ask First:** Any database migration, public response-contract change, removal of a route still used by an active caller, prompt/model change, destructive data operation, or product-flow decision.

**Never:** Merge distinct Research, External Story, and Personal Story pipelines; collapse Quill and Reed/Opus responsibilities; remove deterministic fallbacks without replacement coverage; commit, push, deploy, or run production migrations without explicit authorization.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Canonical caller | Active Book Studio action | Calls canonical route/shared service with unchanged payload and result | Existing status/error contract remains intact |
| Legacy caller | Old `/agent-chat/...` endpoint | Thin alias reaches the same shared handler | No duplicated lifecycle logic |
| Existing book | Legacy artifacts/schema shapes | Workflows normalize/read them as before | Compatibility seam remains documented and tested |
| Client request failure | Non-2xx or invalid JSON | Shared request helper returns consistent typed error | UI retains current user-visible failure state |

</frozen-after-approval>

## Code Map

- `src/app/api/books/[slug]/agent-chat/**` -- legacy route surface and shared chat endpoint.
- `src/app/api/books/[slug]/chapter-draft/**` -- canonical durable Chapter Draft surface.
- `src/app/books/[slug]/agent-chat-panel.tsx` -- mixed chat state, SSE transport, artifact actions, and presentation.
- `src/lib/workflows/{outline,external-stories,personal-stories}.ts` -- remaining workflow monoliths.
- `src/lib/workflows/{promise,editing}.ts` -- legacy private generation code and schema-only facade.
- `src/lib/ui/` -- shared typed client request/status utilities and compatibility map.
- `tests/` -- route, workflow ownership, compatibility, and behavior guardrails.

## Tasks & Acceptance

**Execution:**
- [x] Add an explicit compatibility/deprecation map with owners, canonical paths, legacy aliases, and retirement conditions.
- [x] Move Chapter Draft and remaining active lifecycle implementations behind canonical shared handlers; leave legacy routes as thin aliases only where required.
- [x] Split `agent-chat-panel.tsx` into focused typed hooks/components while preserving UI behavior.
- [x] Extract cohesive orchestration, workspace, persistence, and helper modules from the Outline, External Stories, and Personal Stories monoliths; retain narrow public entrypoints.
- [x] Remove unused Promise generation copies and make Editing schemas import from one canonical schema module.
- [x] Introduce a typed client JSON request/error helper and adopt it for repeated cost/status/lifecycle request patterns.
- [x] Update static and behavioral tests after each package.

**Acceptance Criteria:**
- Given active UI callers, when lifecycle actions run, then no active caller depends on a legacy route where a canonical route exists.
- Given legacy routes retained for compatibility, when inspected, then they contain no business logic and delegate to an identified canonical owner.
- Given extracted modules, when tests and type checking run, then prompts, payloads, ordering, transitions, and artifact lifecycle behavior are unchanged.
- Given the final tree, when ownership tests run, then monolith/facade regressions and undocumented compatibility seams fail clearly.

## Spec Change Log

## Design Notes

Compatibility is a temporary adapter layer, not a second implementation. Extract along existing cohesive seams and preserve stable imports with narrow re-exports only when external callers still need them.

## Verification

**Commands:**
- `npx tsx --test tests/*.test.ts` -- expected: all non-spending unit, database-contract, API, and workflow simulations pass.
- `npm run check` -- expected: strict TypeScript check passes.
- `npm run build` -- expected: production build succeeds without live provider calls.
- `npm audit --omit=dev` -- expected: no production vulnerabilities.

## Suggested Review Order

**Canonical lifecycle ownership**

- Start with the explicit inventory governing every retained compatibility seam.
  [`deprecation-map.ts:16`](../../src/lib/compatibility/deprecation-map.ts#L16)

- Canonical stage-artifact commits now own the lifecycle implementation.
  [`route.ts:53`](../../src/app/api/books/[slug]/stage-artifacts/commit/route.ts#L53)

- Chapter Draft reads, saves, and revisions now live on its canonical surface.
  [`route.ts:36`](../../src/app/api/books/[slug]/chapter-draft/artifacts/route.ts#L36)

**Book Studio client consolidation**

- Agent Chat composes focused hooks and calls canonical lifecycle endpoints.
  [`agent-chat-panel.tsx:40`](../../src/app/books/[slug]/agent-chat-panel.tsx#L40)

- Chat history persistence has one typed state owner.
  [`use-agent-chat-history.ts:7`](../../src/app/books/[slug]/agent-chat/use-agent-chat-history.ts#L7)

- Dossier progress polling is isolated from the presentation shell.
  [`use-dossier-progress.ts:7`](../../src/app/books/[slug]/agent-chat/use-dossier-progress.ts#L7)

- Shared request errors preserve status, codes, and structured server context.
  [`client-request.ts:31`](../../src/lib/ui/client-request.ts#L31)

**Workflow ownership**

- Outline exposes a narrow public capability entrypoint.
  [`outline-public.ts:1`](../../src/lib/workflows/outline-public.ts#L1)

- Outline workspace projection moved out of generation orchestration.
  [`workspace.ts:17`](../../src/lib/workflows/outline/workspace.ts#L17)

- External Stories exposes orchestration, binder, and workspace capabilities explicitly.
  [`external-stories-public.ts:1`](../../src/lib/workflows/external-stories-public.ts#L1)

- External Stories workspace assembly is independently owned.
  [`workspace.ts:22`](../../src/lib/workflows/external-stories/workspace.ts#L22)

- Personal Stories commit persistence and workspace projection are separated.
  [`commit.ts:19`](../../src/lib/workflows/personal-stories/commit.ts#L19)

- Personal Stories workspace reads normalize legacy data behind one boundary.
  [`workspace.ts:21`](../../src/lib/workflows/personal-stories/workspace.ts#L21)

**Regression guardrails**

- Compatibility tests reject undocumented or business-logic-heavy aliases.
  [`compatibility-deprecation-map.test.ts:41`](../../tests/compatibility-deprecation-map.test.ts#L41)

- Consolidation tests enforce hooks, facades, workspace owners, and request reuse.
  [`post-stabilization-consolidation.test.ts:7`](../../tests/post-stabilization-consolidation.test.ts#L7)

- Pre-existing Chapter Draft hardening opportunities remain explicitly deferred.
  [`deferred-work.md:3`](deferred-work.md#L3)
