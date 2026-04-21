# GHOSTWRITR Ship Plan — v2

**Author:** John (PM), roundtable 2026-04-20 (second session)
**Supersedes:** `ship-plan.md` (v1)
**Status:** Plan of record. Reflects mid-session deviations + framework-flow migration shipped + canonical-personas-as-code in flight.

---

## 1. Owning the deviation — was framework-flow the right call?

Yes. And I'll defend it hard, because the alternative was worse.

v1 Phase 1 tested a UX thesis: *does a spine view + hunger indicators change how Chris feels about the product?* That's real, but soft. The round-6 voice eval surfaced something sharper: **the pipeline was silently Andy-flavored because `chapter-draft.md.template` bakes ME-WE-TRUTH-YOU-WE into the spine, while four of the five custom personas carry *different* frameworks trapped as prose inside `signaturePatternsJson`.** That isn't a UX question. That's the product lying about what it does. A customer blending Drucker and Elon and getting Andy-shaped chapters is a credibility failure, not a polish gap.

So we shipped the migration — `frameworkFlowJson`, `frameworkName`, seed, two server actions wired, client threading `personaId`. WHY was that the right call? Because voice-blending is the *actual* wedge of this product; if the roundtable can't demonstrate framework fidelity in a live preview, the spine view is decorating a broken mechanism. Fix the mechanism, *then* visualize it.

The critique I'll accept: we pre-empted Phase 3 without retiring Phase 0. The protection snapshot is still not taken. That's the one line I won't defend — we shipped schema changes to a production-bearing book without a tagged rollback point. Fix that this week.

## 2. Current landing state — inventory

**Shipped this session:**
- `WriterPersona.frameworkFlowJson` + `frameworkName` columns, seeded for all 5 custom personas
- `suggestWriterPersonas` + `generateVoiceBlendPreview` inject framework into prompts
- Client passes `personaId` so dominant-persona framework is traceable
- Soft-delete persistence fix on `ensureDefaultWriterPersonas`

**In flight right now:**
- Canonical personas as code (`src/lib/personas/*.ts`, DB becomes cache)
- Paige drafting `chapter-draft-drucker.md.template` (7 slots) and `chapter-draft-elon.md.template` (5 slots)

**Still un-started from v1:**
- Phase 0 snapshot + schema freeze
- Phase 1 spine view + hunger indicators
- Phase 2 Markdown+YAML storage migration
- Phase 4 conversational surfaces (voice interview, Campfire, Viability Diagnosis Room)

**Partially shipped from v1 Phase 3:**
- Framework-flow typing on personas exists; broader agent folders + manifest + typed `GateDecision` do not.

## 3. Ship plan v2 — five phases

### Phase 0 — Protect (this week, before anything else)
- **Goal:** A rollback point exists before we touch more schema.
- **Ships:** Git tag on current main; `prisma migrate` snapshot of current DB; README note on which book slug is the canonical protected book.
- **Deferred:** Nothing — this is the smallest thing.
- **Validation:** Can Chris, in under 5 minutes, revert schema + restore a specific book's rows? If no, not done.

### Phase 1 — Land the canonical-code refactor (next)
- **Goal:** Finish the in-flight work cleanly before stacking anything on top.
- **Ships:** `src/lib/personas/{andy,cahn,drucker,elon,jobs}.ts` as source of truth; `ensureDefaultWriterPersonas` reads from code and upserts into DB as cache; Paige's two new templates (`chapter-draft.drucker.md.template`, `chapter-draft.elon.md.template`) committed; template selection keyed on `frameworkName`.
- **Deferred:** Cahn and Jobs still ride the Andy template — we only add new templates when the framework *cannot* overlay. Cahn's Mystery→Pattern→Strategy and Jobs's Old→New can be expressed within ME-WE-TRUTH-YOU-WE slots with different prompt framing. Don't build templates speculatively.
- **Validation:** Generate a chapter with Drucker-dominant blend → resulting draft uses the 7-slot diagnostic template. Generate with Andy-dominant → uses original spine. Diff is visible in output.

### Phase 2 — Visualize the spine (the v1 Phase 1 we still owe)
- **Goal:** Test the original UX thesis now that the mechanism under it is honest.
- **Ships:** Spine view on the book detail page showing chapters as slots from the *selected framework's* template; hunger indicators (missing evidence, thin framing, no resolution) computed per-slot.
- **Deferred:** Drag-to-reorder, inline editing, cross-chapter linkage — all v3.
- **Validation:** Chris opens a book, sees at a glance which chapter has a hollow middle. If he still has to open the chapter to know, it failed.

### Phase 3 — Abstract the agent boundary
- **Goal:** The thing v1 Phase 3 was actually about — typed `GateDecision`, agent folders, manifest. Framework-flow was a *subset*; this is the rest.
- **Ships:** `.agents/<name>/manifest.json` convention; `GateDecision` as a typed return from every gate (viability, outline, research, quality); routing logic reads manifests instead of hard-coded switches.
- **Deferred:** Migrating every existing workflow at once. Pick two gates (viability + quality) and prove the pattern.
- **Validation:** Adding a sixth persona-as-code requires touching one folder, not four files.

### Phase 4 — Storage + conversational surfaces (merged, lower priority)
- **Goal:** Markdown+YAML storage migration and voice/Campfire/Viability Diagnosis interviews. Merged because both are "next book" work, not "this book" work, and sequencing them is premature.
- **Ships:** TBD — re-plan after Phase 3 lands.
- **Validation:** Chris writes a *second* book through the system and the experience is meaningfully different from the first.

## 4. The biggest risk v1 didn't account for

**Mid-stream green-lights compound.** In one session, Chris approved: a schema migration, a seed rewrite, two server-action prompt injections, a client-side threading change, a soft-delete fix, a canonical-personas refactor, and two new chapter templates. All shipped or in flight. None blocked by a written spec. The code quality held because the surface area was coherent — but the *next* mid-stream green-light that isn't coherent will ship too, because the cadence itself doesn't have a brake. v1 assumed sequential phases would discipline scope. They didn't. The real discipline has to be: *nothing ships past Phase 0 until the rollback point exists*, and *no schema change ships without a 15-minute written "WHY" from me or Mary first*. Chris — push back on this if you hate it, but the cost of one bad mid-stream decision is higher now than it was before we had a persona system with 5 live frameworks.

## 5. Monday task — updated

**No, `src/app/books/[slug]/page.tsx` is not Monday.** Monday is Phase 0: tag the snapshot, freeze the schema, write the rollback note. Tuesday is finishing canonical-personas-as-code and committing Paige's two templates. Spine view starts **Wednesday at earliest** — and by then, it's a better spine view because it can render framework-specific slots instead of hard-coded ME-WE-TRUTH-YOU-WE.

## 6. One thing to cut

**Cut Cahn and Jobs chapter templates. Indefinitely.** Mystery→Pattern→Strategy and Old→New are prompt-framing variations, not structural ones — they fit inside ME-WE-TRUTH-YOU-WE with different voice instructions. Building dedicated templates for them is the kind of symmetry-seeking that wastes two weeks and produces three files nobody reads. WHY build four templates when two do the job?
