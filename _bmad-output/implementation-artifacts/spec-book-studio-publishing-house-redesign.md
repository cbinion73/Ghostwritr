---
title: 'Book Studio Publishing House Redesign'
type: 'feature'
created: '2026-07-14'
status: 'done'
baseline_commit: '3b416eb'
context:
  - CLAUDE.md
  - _bmad-output/project-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ghostwritr's Library now communicates the romance and value of a real book collection, but the Book Studio still feels like a dense internal tool: crowded utility navigation, weak visual hierarchy, inconsistent stage rooms, and operational language competing with the author's manuscript.

**Approach:** Recast the authoring experience as a premium digital publishing house. Establish a cinematic shared Book Studio shell, a tactile book-and-stage navigator, a focused room header with one obvious next action, and a coherent editorial surface that makes writing, review, evidence, and production feel like parts of one crafted journey.

## Boundaries & Constraints

**Always:** Preserve all existing forms, links, stage gates, server actions, spending confirmation, polling, artifact state, approvals, and export behavior. Keep production data untouched. Preserve unrelated dirty-tree work. Maintain keyboard access, responsive behavior, reduced-motion support, and legible status indicators that do not rely on color alone.

**Ask First:** Destructive data operations, live LLM/API spending, production migrations, deployment, or removal of an existing user capability. The user has explicitly pre-approved visual and interaction decisions within these boundaries.

**Never:** Rewrite the workflow engine, auto-approve content, hide source/citation warnings, fabricate book state, replace server-side orchestration, or turn the experience into a generic SaaS dashboard.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Active book | Completed or in-progress book with cover and artifacts | Studio opens to a visually distinct book identity, selected room, progress, and next action | Missing optional metadata falls back to an elegant studio binding |
| Locked stage | Prerequisite incomplete | Stage remains visible but clearly unavailable | Explain the dependency in accessible text and retain disabled semantics |
| Review ready | Chapter or stage awaits author | Review state becomes the strongest non-destructive callout | Existing approve/reject controls remain unchanged |
| Narrow viewport | Tablet or compact desktop | Navigation and controls remain usable without clipping core work | Secondary utility controls collapse or scroll; manuscript remains primary |

</frozen-after-approval>

## Code Map

- `src/app/books/[slug]/workspace-shell.tsx` -- shared Book Studio composition, navigation, stage routing, and utility actions.
- `src/app/books/[slug]/workspace-shell.module.css` -- new publishing-house shell, responsive layout, motion, surfaces, and room framing.
- `src/app/books/[slug]/stage-nav.tsx` -- book identity, journey groups, stage states, and compact progress navigation.
- `src/app/books/[slug]/stage-nav.module.css` -- tactile spine/navigation styling.
- `src/lib/repositories/book-spine.ts` -- supplies cover identity to the shell without changing ownership behavior.
- `src/app/books/[slug]/editing/editing-detail-content.tsx` -- chapter-by-chapter editorial room presentation.
- `src/app/books/[slug]/typeset/typeset-detail-content.tsx` -- production readiness and export-room presentation.
- `src/app/globals.css` -- shared inner-room design tokens and safe legacy-class harmonization.

## Tasks & Acceptance

**Execution:**
- [x] Build the new shell and responsive design system around existing stage content.
- [x] Reframe the top bar as book identity, room context, progress, and restrained utilities.
- [x] Replace the sidebar's flat list with a tactile book journey that prioritizes current and review-ready work.
- [x] Harmonize shared cards, typography, forms, tables, chat panels, and status treatments.
- [x] Elevate Editing and Typeset as deliberate editorial and production rooms without changing their actions.
- [x] Verify Dust, Lean Lab, locked-stage behavior, narrow viewport behavior, checks, tests, and production build without provider calls.

**Acceptance Criteria:**
- Given any accessible book, when its Book Studio opens, then the book identity, current room, progress, stage journey, and primary action are immediately understandable.
- Given a completed real book, when navigating Setup, Draft, Editing, and Typeset, then every room feels visually related while preserving its specialist tools and state.
- Given an author reviewing work, when a stage is review-ready, then its state and required decision are more prominent than secondary utilities.
- Given a compact viewport or reduced-motion preference, when using the Studio, then no primary action or manuscript content becomes inaccessible.

## Spec Change Log

## Design Notes

The visual metaphor is a contemporary private press: oxblood leather, bottle green, parchment, warm brass, editorial blue pencil, and generous typographic rhythm. Ornament is concentrated around book identity and transitions; working surfaces remain quiet and readable. The system should feel authored rather than themed.

## Verification

**Commands:**
- `npm run check` -- expected: clean TypeScript.
- `node --test --test-concurrency=1 tests/*.test.ts` -- expected: non-spending regression suite passes.
- `npm run build` -- expected: production build completes.

**Manual checks:**
- Inspect Dust and The Lean Lab at desktop and compact widths; navigate Setup, Chapter Draft, Editing, and Typeset; confirm no actions or warnings disappeared.

## Suggested Review Order

**Publishing-house shell**

- Start with the shared Studio composition, room context, utilities, and preserved stage routing.
  [`workspace-shell.tsx:206`](../../src/app/books/%5Bslug%5D/workspace-shell.tsx#L206)

- See how real cover identity becomes the tactile book journey.
  [`stage-nav.tsx:68`](../../src/app/books/%5Bslug%5D/stage-nav.tsx#L68)

**Author workspaces**

- Chapter folios and paper reading preserve every durable drafting control.
  [`chapter-draft-bmad-panel.tsx:377`](../../src/app/books/%5Bslug%5D/chapter-draft-bmad-panel.tsx#L377)

- Editorial sequencing makes human review the dominant action.
  [`editing-detail-content.tsx:73`](../../src/app/books/%5Bslug%5D/editing/editing-detail-content.tsx#L73)

- Production preflight makes export readiness legible before publishing.
  [`typeset-detail-content.tsx:44`](../../src/app/books/%5Bslug%5D/typeset/typeset-detail-content.tsx#L44)

**Conversation and responsive behavior**

- Agent conversations now share the quiet, manuscript-first visual language.
  [`agent-chat-panel.tsx:540`](../../src/app/books/%5Bslug%5D/agent-chat-panel.tsx#L540)

- Compact screens collapse companion agents while keeping them one tap away.
  [`collapsible-side-panel.tsx:26`](../../src/app/components/collapsible-side-panel.tsx#L26)
