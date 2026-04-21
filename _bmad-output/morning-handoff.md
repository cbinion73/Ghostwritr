# Morning Handoff

**Session:** 2026-04-20 evening → 2026-04-21 early morning
**Bottom line:** full BMAD planning pipeline ran end-to-end; spine view shipped; repo tagged as `checkpoint/morning-handoff`.

---

## ☕ Read these first (in order)

1. **This file.**
2. `_bmad-output/planning/01-product-brief.md` — Mary's Product Brief
3. `_bmad-output/planning/02-prd.md` — John's PRD v1 (the plan of record)
4. `_bmad-output/planning/03-architecture.md` — Winston's architecture
5. `_bmad-output/planning/04-ux-design.md` — Sally's UX spec
6. `_bmad-output/planning/05-epics-and-stories.md` — John's dev-ready backlog

Then open http://localhost:3000/books/4-pillars (start dev with `npm run dev`) to see the spine view.

---

## 📦 What shipped overnight

### 1. Full BMAD planning pipeline (5 documents, ~10,000 words of artifacts)

Five BMAD agents produced the canonical v1 planning suite:

| Agent | Artifact | Key output |
|---|---|---|
| 📊 Mary | Product Brief | Target user = condensed-thinker expert; 3 axes of differentiation; $40-book claim as commercial hypothesis |
| 📋 John (PRD) | PRD v1 | 5 release phases R0–R5; decisions on Mary's 5 open questions; 12 anti-patterns; $40/book cost ceiling as product claim |
| 🏗️ Winston | Architecture | Current-state + target-state; `Agent<I,O>` abstraction; typed `GateDecision<A>`; 7-phase migration (P1–P7) |
| 🎨 Sally | UX Design | Spine view as hero screen (always-visible, grouped); gate verdicts as shape+color+word; Diagnosis Room for refused books; full design system |
| 📋 John (round 2) | Epics + Stories | 7 epics, ~20 stories; critical path; First Sprint (5 shovel-ready stories) |

Planning supersedes `ship-plan.md` and `ship-plan-v2.md`. Decisions they made on your behalf:

- **Pricing in v1:** none. Per-book flat pricing post-v1.
- **KB ingestion surface:** paste + file upload. No integrations, no AI interview.
- **Spine view:** vertical list of all 11 stages, always visible, grouped by color gutter. No accordion collapse.
- **Persona expansion:** closed set of 5 in registry; 2 certified (Drucker, Elon) for v1.
- **Agent-folder abstraction:** internal refactor in v1, not an extensibility surface.
- **Typeset output:** both PDF and EPUB; PDF is the default download.
- **Gate verdict encoding:** shape (diamond/circle/triangle) + color + literal word — never color alone.

### 2. The Book Spine view — live at `/books/[slug]`

The v1 hero screen, implemented per Sally's UX spec. Four files:

```
src/lib/ui/stage-tokens.ts             → 11-stage registry + state display tokens
src/lib/repositories/book-spine.ts     → single-round-trip data loader
src/app/books/[slug]/page.tsx          → server component (the page)
src/app/books/[slug]/spine-row.tsx     → individual row
```

Renders against the real schema (Book + BookStage + Artifact counts). Visually groups the 11 stages into Setup (1–4) / Material (5–9) / Production (10–11) with coloured left-edge gutters. Each row shows shape + colour + word state badge (LOCKED / IN PROGRESS / REVIEW READY / COMMITTED / BLOCKED) and deep-links to the existing per-stage editor.

**Validated against `4-pillars`:** HTTP 200, 11 state badges rendering correctly (4 COMMITTED + 1 IN PROGRESS + 5 LOCKED + 1 REVIEW READY), `npm run check` passes clean.

### 3. Git history

```
f33558a feat(spine): book spine view at /books/[slug]
12eb1fd docs(bmad): complete BMAD planning pipeline for GHOSTWRITR v1
92446c9 docs(bmad): add roundtable artifacts and rollback guide
4195977 feat(personas): ship voice framework integration and canonical-personas-as-code
```

Tags:
- `checkpoint/post-voice-framework` — state before overnight session (rollback point for voice-framework work)
- `checkpoint/morning-handoff` — state at session end (rollback point for everything that shipped overnight)

---

## 📋 Monday morning: John's First Sprint

The 5 shovel-ready stories from `05-epics-and-stories.md` §First Sprint:

| # | Story | Effort | Why this one |
|---|---|---|---|
| 1 | **E1.S1** Baseline Prisma migration | M | Unblocks every DB-touching story. Schema drift exists. |
| 2 | **E1.S2** LLMCallLog + instrumentation | M | Required to prove the $40/book claim. |
| 3 | **E1.S3** Typed `GateDecision<A>` | S | Independent; can parallelize with S1/S2. |
| 4 | **E1.S4** Router contract test | S | Defensive; catches cross-family voice-critic misrouting in CI. |
| 5 | **E2.S1** chapter-draft as `Agent<I,O>` | M | Template for the other two workflow refactors. |

Each story in `05-epics-and-stories.md` has complete AC, dependencies, and touched files. No clarifying questions needed to start.

---

## 🚧 Flagged open questions (not blocking Monday)

**From John's PRD (for Winston):**
1. `LLMCallLog` write path — sync blocking vs. async vs. batched?
2. Artifact mirror conflict resolution — DB wins; confirm.
3. Voice-guard critic model-family enforcement — hard rule or config?
4. Cost circuit breaker enforcement layer.

**From John's PRD (for Amelia):**
5. Baseline migration — destructive reset risk + backup path.
6. Three `Agent<I,O>` refactors — atomic merge or feature-flagged?
7. Spine view replaces existing per-stage pages or lives alongside? (**Answered overnight: lives alongside. `/books/[slug]` is the new spine; all per-stage routes unchanged.**)
8. Artifact mirror direction — DB → disk only in v1 (Sally confirms; bidirectional is v1.1).

**From Sally's UX (for Amelia):**
9. Spine real-time updates — SSE / WebSocket / poll? (Overnight: static server-rendered; live refresh deferred.)
10. Artifact mirror binding — disk path vs. DB ID as canonical.
11. Voice-guard paragraph vs. sentence granularity.

**From John's Stories (DRAFT status):**
- E4.S3 (mirror reader/drift check) — needs Winston's decision.
- E5.S3 (PDF export) — needs PDF tooling decision (pandoc? puppeteer?).

None block Monday. All are "after sprint 1" decisions.

---

## ⚠️ What I chose not to do overnight (and why)

Risks I wouldn't take while you're asleep:

- **Did not start E1.S1 baseline Prisma migration.** A destructive reset is possible; any data loss on the in-flight `4-pillars` book is unacceptable without your eyes on it.
- **Did not add `LLMCallLog` table.** Schema change. Should bundle with the baseline migration; wrong to do piecemeal.
- **Did not refactor any existing workflow to `Agent<I,O>`.** Would touch live production paths (chapter-draft especially) that we just shipped improvements to this session.
- **Did not add Vitest.** Framework addition is a setup decision you should weigh in on.
- **Did not delete stale `.md.template` files** — the Drucker and Elon templates were just written this session and are likely still reference material.
- **Did not implement Voice-guard critic, Editorial agent, Typesetter.** Each requires model-family routing decisions (per your LLM routing philosophy — the critic MUST be a different family from the author) and cost-ceiling decisions that belong to you.
- **Did not touch `/` root page or navigation** — those changes would be visible on every book, and I don't know your preferences for the library surface.

All of the above are explicitly in John's First Sprint or later. They're waiting for you.

---

## 🔁 Rollback

If anything in the overnight commits breaks:

```bash
# Check out the pre-overnight state (voice framework + canonical personas only)
git checkout checkpoint/post-voice-framework -- .
npx prisma db push
npm run db:generate
```

Or to roll back to just before this session's final handoff:

```bash
git checkout checkpoint/morning-handoff -- .
```

See `ROLLBACK.md` for the full procedure.

---

## ✅ Quick self-check

- `npm run check` passes: ✓
- Book spine renders at `/books/4-pillars`: ✓
- 5 planning docs in `_bmad-output/planning/` readable and internally consistent: ✓
- All commits authored and signed: ✓ (`GHOSTWRITR Dev`)
- Tag `checkpoint/morning-handoff` marks session end: ✓

Sleep well. When you wake up, start with `02-prd.md` and then pick any of the 5 First Sprint stories. See you in the morning.
