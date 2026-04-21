# GHOSTWRITR Ship Plan

**Author:** John (PM), roundtable 2026-04-20
**Status:** Plan of record for the BMAD-style refactor
**Rule:** Ship small. Validate. Then earn the next phase.

---

## 1. The honest version of "proceed with all"

"Proceed with all" = roughly **14 distinct pieces of work** across three surfaces:

- **Winston's architecture (4):** agent folder refactor, `ghostwritr.manifest.yaml`, typed `GateDecision` contract, LangGraph runtime adapter.
- **Paige's storage (3):** Prisma→Markdown+YAML migration, book-scoped templates, chapter-scoped templates.
- **Sally's UX (6):** voice interview, viability-as-diagnosis, hunger indicators, stage-8 conversational interview, progressive-disclosure personas, book-level spine view.
- **Plus one invisible piece:** the migration backstop so the current in-flight book doesn't become collateral damage.

Heaviest pieces **by blast radius**, not clock time:

1. **Prisma → Markdown migration** — touches every repository, every stage writer, every reader. Highest risk of breaking the live pipeline.
2. **Agent folder refactor + manifest** — architectural surgery. Breaks resumability if done mid-book.
3. **Voice interview (stage 0)** — net-new surface area, new LLM routing, new storage shape. Scope creep magnet.

Everything else is additive or cosmetic by comparison.

---

## 2. Sequenced Phases

### Phase 0 — Protect the current book (Week 1)

**Goal:** Make it safe to refactor without losing the book you're writing right now.

- Tag current `main` as `pre-refactor-snapshot`.
- Finish the current book's **current stage** on the existing system. Do NOT start a new stage during refactor.
- Freeze schema changes to `ResearchArtifact` and related tables until Phase 2.
- Write a one-page "what book is mid-flight and what stage is it at" note.

**Deferred:** everything else.

**Validation:** you can point at a commit SHA and say "if this refactor fails, I roll back to here and my book still builds."

---

### Phase 1 — Ship the spine view and hunger indicators (Week 1–2)

**Goal:** Prove the UX thesis ("visible expansion fights condensation") on the current stack before refactoring anything underneath.

- Sally's **book-level spine view** (§6 of anti-condensation-ux-spec.md) — read-only, reads existing Prisma data.
- Sally's **paragraph-topic hunger indicators** (§3) — visual only; sparse vs. dense cells.
- **No storage changes. No agent folders. Just UI that reads what's already there.**

**Deferred:** voice interview, viability diagnosis redesign, stage-8 conversational interview, personas.

**Validation:** Chris opens the spine view for a book he knows well. Does he *see the book* or does he see a dashboard? If it's still a dashboard, Sally's thesis is wrong and we stop before investing in the rest of her list.

**Why this order:** the spine view is the cheapest possible test of the most expensive assumption on the table. If the thesis is wrong, we just saved weeks.

---

### Phase 2 — Storage migration on the NEXT book only (Week 2–4)

**Goal:** Paige's Markdown+YAML artifacts — but *only* for books created after a feature flag flips.

- New `Book.storageVersion` field: `"v1-prisma" | "v2-markdown"`.
- New book created → v2 path. Existing in-flight book → v1 path, untouched.
- Ship **book-scoped** templates (market viability, outline, base story). Chapter-scoped templates come in Phase 3.
- Repositories gain a dispatcher: read v1 or v2 based on book's flag.

**Deferred:** backfilling old books. They live and die on v1. That's fine.

**Validation:** create a throwaway test book. Stages 1–3 write Markdown files you can `cat` and read in a text editor without a database. If you can't, storage didn't actually change.

---

### Phase 3 — Agent folders + manifest + GateDecision (Week 4–6)

**Goal:** Winston's architecture, again *only* for v2 books.

- `/agents/<stage>/` folders with colocated prompts, schemas, runner.
- `ghostwritr.manifest.yaml` at repo root declares the 11 stages, their agents, models, gates.
- Typed `GateDecision` replaces ad-hoc pass/fail booleans.
- LangGraph remains the runtime — the manifest compiles *to* LangGraph nodes.
- Chapter-scoped templates from Paige (including `chapter-draft.md.template`) land here.

**Validation:** a v2 book runs end-to-end through stages 1–5 using the manifest-driven graph. Delete one stage folder — the system tells you the manifest is broken, not a runtime null-pointer 40 minutes into a run.

---

### Phase 4 — Conversational surfaces (Week 6+, if earlier phases held)

**Goal:** Sally's remaining anti-condensation moments, now that there's somewhere clean to put them.

- Voice interview at stage 0 (feeds Book Setup).
- Stage-8 conversational personal-story interview (Campfire).
- Viability gate as Diagnosis Room (not pass/fail screen).
- Progressive-disclosure Agent Roundtable Drawer.

**Validation:** Chris writes a book through v2 without once feeling like his brain got compressed into a form field.

---

## 3. What to cut or defer indefinitely

- **Progressive-disclosure personas.** Nice-to-have masquerading as must-have. Chris is the only user. He already knows his personas. This is a feature for a future multi-tenant SaaS version of GHOSTWRITR. Cut from v1.
- **Voice interview at stage 0.** Genuinely useful, but it's a *new input modality* on top of everything else. Defer until Phase 4 and only build it if the text-based Book Setup still feels like it's condensing the user. Don't build voice infra before proving the conversation shape works in text.

---

## 4. The one risk that will kill this refactor

**Dual-writing.** The moment you try to make v1 and v2 storage stay in sync for the same book, you're dead. Debugging divergence will eat a month and you'll ship nothing.

**Mitigation:** one book, one storage version, forever. `Book.storageVersion` is set at creation and never changes. Old books stay on Prisma. New books go Markdown. No migration tool. No sync layer. If an old book ever *needs* v2, you export it, create a new book, and import — as a deliberate, manual act.

---

## 5. First week's concrete next move

Monday morning, Chris opens **one file**:

```
/Users/chris/Desktop/GHOSTWRITR/src/app/books/[slug]/page.tsx
```

(Or wherever the book overview page lives — if it doesn't exist, create it here.)

**First keystrokes:** build the read-only spine view that renders the current book's 11 stages as a vertical column of cards. Each card shows stage name, status, and — for stages with paragraph topics — a density indicator. Reads existing Prisma data. **No new schema. No agent folders. No Markdown.**

That's Phase 1. Ship it by Friday. Then we talk about whether Sally's thesis held before touching a single line of Winston's or Paige's work.
