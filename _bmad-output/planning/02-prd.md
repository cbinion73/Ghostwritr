# GHOSTWRITR — Product Requirements Document (v1)

**Status:** Plan of record (drives Epics + Stories + Dev work)
**Author:** John (Product Manager)
**Date:** 2026-04-20
**Supersedes:** `ship-plan.md`, `ship-plan-v2.md` where in conflict

---

## 1. Goal of v1

v1 is done when **Chris can run one of his own books end-to-end through all 11 stages, pass the Market Viability gate on merit, produce a typeset manuscript whose voice is demonstrably framework-shaped (Drucker or Elon), and point at the artifact as proof that the pipeline replaces the human ghostwriter for a condensed-thinker expert.** The "canonical case" is not "the pipeline runs without error." It is: *one book, shipped, whose quality Chris would sign his name to, produced with a per-book LLM cost and turnaround that a human ghostwriter cannot match.* Everything in this document serves that single proof.

---

## 2. Scope

### 2.1 In-scope

**Pipeline (all 11 stages operational, three brought to production quality):**
- Stages 1–7 (BOOK_SETUP → RESEARCH) — kept at current functional quality, hardened against regression, gated properly.
- Stages 8–9 (EXTERNAL_STORIES, PERSONAL_STORIES) — kept at current quality, voice-aware.
- **Stage 10 CHAPTER_DRAFT — production quality.** Framework-aware voice system drives per-chapter flow (ME-WE-TRUTH-YOU-WE for Drucker, etc.). Voice-guard critic from a different model family runs per chapter.
- **Stage 11 EDITING — production quality.** Editorial pass + typesetting output.

**Cross-cutting features:**
- Market Viability gate (Stage 2, 11-dim scoring, hard 3.5/5 floor, hard refusal below).
- Knowledge-base-first outlining (KB is the source of truth, not the promise/pitch).
- Voice framework system with **two** canonical personas wired end-to-end: **Drucker** and **Elon**. The other three personas remain available in the DB/registry but are not certified for v1.
- Spine view UI (see §3, Q3).
- Markdown+YAML artifact mirror on disk (DB remains primary).
- Agent-folder/manifest abstraction (internal refactor, see §3, Q4).
- `LLMCallLog` observability timeline.
- Typed `GateDecision<A>` discriminated union across all 11 stages.
- Template routing via `frameworkName` registry.

**Proof artifact:**
- One Chris-authored book, shipped end-to-end, archived as the reference exemplar.

### 2.2 Out-of-scope for v1

- **Any form of multi-user collaboration.** No sharing, no comments, no concurrent editing, no roles. Solo tool.
- **Authentication/authorization surface** beyond what local dev already provides. No SSO, no team accounts.
- **Marketing/publishing/distribution tooling.** No Amazon upload, no ISBN handling, no cover design, no landing pages.
- **Fiction support.** Not now, not in v1.1.
- **General-purpose writing assistant surface.** No "chat with the pipeline," no free-form generation outside the 11 stages.
- **Author-extensible personas or frameworks.** Closed set in v1 (see §3, Q5).
- **Author-facing model selection.** Routing policy is internal; the author does not pick models.
- **Mobile UI.** Desktop web only.
- **Non-English content.** English only.
- **Billing/subscription infrastructure.** See §3, Q1 — v1 is pre-pricing.
- **Full 11-agent manifest.** Winston's P7 is explicitly deferred past v1.
- **Vitest repository test suite breadth.** A narrow, load-bearing slice is in; comprehensive coverage is not.
- **Automated ingestion integrations** (Notion, Google Docs, Dropbox API). See §3, Q2.

### 2.3 Explicit trade-offs

- We are shipping **depth on three stages** (10, 11, and the Viability gate at 2) rather than parity polish across all eleven. WHY: the ghostwriter-replacement claim lives or dies on draft + editorial quality. Stages 1–9 being "functional" is enough if 10–11 are production-grade.
- We are shipping **two certified personas**, not five. WHY: certifying a persona end-to-end (prompt wiring + framework flow + voice-guard critic calibration + reference output) is expensive. Two is enough to prove the framework-as-structure claim; five is theater.
- We are deferring **the full agent manifest (Winston P7)**. WHY: the three highest-value workflows (draft, editorial, voice-guard) get the `Agent<I,O>` treatment in P3; the remaining eight can live in the old shape until post-v1 without blocking the ship.
- We are accepting **schema drift debt** through P1 and cleaning it once — not incrementally. WHY: a single baseline migration is cheaper than eight surgical ones.
- We are deferring **pricing and billing** entirely. WHY: v1's job is to prove the artifact, not monetize it. Monetization without a reference book is a founder's fiction.

---

## 3. Decisions on Mary's Open Questions

**Q1 — Pricing model: per-book, subscription, or usage-metered?**
**Decision: no pricing in v1. Post-v1, per-book flat pricing with a metered LLM-cost pass-through ceiling.** WHY: v1 has one user (Chris) and zero paying customers. Building billing ahead of the reference book is premature optimization. When pricing does land (v1.1+), per-book matches the JTBD ("I have *a* book to ship") and maps cleanly to the unit economics of the LLM spend per book. Subscription fails because condensed-thinker experts don't ship continuously; they ship an artifact.

**Q2 — Knowledge-base ingestion surface: upload, integrations, paste, or AI interview?**
**Decision: paste + file upload (Markdown, PDF, plain text, DOCX). No integrations, no AI interview in v1.** WHY: Chris's own KB is already in scattered file form — that's the canonical case. Integrations (Notion/GDocs) are three weeks of OAuth dances per provider that don't make the reference book better. AI interview is a different product (a coach for people who *don't* have a KB yet) — our thesis is that condensed-thinker experts already have one. Paste + upload covers 100% of the reference case.

**Q3 — Spine view UI: what is it, which stages does it touch?**
**Decision: Spine is the single-page, always-on navigation and state surface for a book — a vertical column showing all 11 stages, each with current state (locked / active / complete / revision), gate verdict badge where applicable, and artifact-count indicator. Clicking a stage deep-links to that stage's editor. Spine is the home surface post-BOOK_SETUP.** Stages it touches: all 11 (read-only state display). Stages it owns interaction for: 0 (it's a nav surface, not an editor). WHY: the pipeline has too many stages and artifacts to navigate via breadcrumbs or separate pages. The spine is the author's map — and crucially it makes the Market Viability gate's verdict unignorable, which the brief identifies as load-bearing.

**Q4 — Agent-folder/manifest abstraction: internal refactor or external extensibility?**
**Decision: internal refactor in v1. Not an extensibility surface.** WHY: Winston's `Agent<I,O>` pattern is how we pay down the "workflows speak directly to ChatAnthropic" debt and make voice-guard critic swappability real. That's an internal architecture win. Turning it into an extensibility surface (third-party agents, user-authored agents) is a platform play, and we don't ship platform plays before we ship one reference artifact. Revisit post-v1.

**Q5 — Persona expansion policy: closed, author-extensible, or author-authored?**
**Decision: closed set of 5 in the registry, 2 certified (Drucker, Elon) for v1. No user-authored personas.** WHY: a persona isn't a tone — it's a chapter-shaping framework flow, a voice-guard critic calibration, and a prompt-injection contract. Letting users author one in v1 means shipping a persona-authoring IDE, which is more work than the pipeline itself. Closed set forces us to make the framework-as-structure claim defensible; extensibility dilutes it. Revisit once three books have shipped through the two certified personas.

---

## 4. User Journeys

### 4.1 The Canonical User Journey (Chris, v1-happy-path)

**Stage 1 — BOOK_SETUP.** Chris creates a new book. Supplies working title, one-paragraph premise, target length. System creates the Book record and provisions the spine. **Artifact:** `book.yaml`. **Gate:** premise non-empty, length in valid band. **UI:** simple form → redirect to spine.

**Stage 2 — PROMISE.** Chris articulates the reader-facing promise ("by reading this book, you will…"). System stores and surfaces it for later stages to reference. **Artifact:** `promise.md`. **Gate:** promise specific, non-generic (LLM-scored for specificity). **UI:** spine → Promise stage editor.

**Stage 3 — AUDIENCE.** Chris specifies the target reader — condensed-thinker expert cohort, role, pain. System drafts an audience profile; Chris edits. **Artifact:** `audience.md`. **Gate:** audience specific enough to score viability against. **UI:** editor + AI-drafted suggestion.

**Stage 4 — MARKET_ANALYSIS (the Viability gate).** System runs the 11-dimension scoring across the Promise + Audience + supplied KB signals. Produces a verdict: viable (≥3.5), borderline (3.0–3.5, revision required), or refused (<3.0). **Artifact:** `market-analysis.yaml` with per-dimension scores and rationale. **Gate:** **hard floor at 3.5.** Below floor, pipeline refuses to advance. **UI:** dimension-by-dimension score display on the spine; verdict badge visible from every subsequent stage.

**Stage 5 — OUTLINE.** System reads the KB (paste + uploaded docs from BOOK_SETUP), extracts big ideas from actual content — **not from the promise** — and proposes a chapter structure. Chris selects framework (Drucker or Elon). Outline is regenerated with framework-aware chapter shape (ME-WE-TRUTH-YOU-WE for Drucker). **Artifact:** `outline.yaml`. **Gate:** outline has ≥ minimum chapters, each chapter has an anchor idea traceable to a KB source, framework selected. **UI:** chapter list editor with framework picker; KB-sourced provenance indicator per chapter.

**Stage 6 — BASE_STORY.** System generates the book's spine narrative — the through-line connecting chapters. **Artifact:** `base-story.md`. **Gate:** through-line coherent, references outline. **UI:** spine view gains a "through-line" expandable panel.

**Stage 7 — RESEARCH.** Per-chapter research pass using the three-agent LLM routing (GPT-5.4 researcher → 5.4-mini extractor → Haiku verifier) already in place. **Artifact:** `research/ch-NN.yaml` with verified claims, sources, and confidence scores. **Gate:** per-chapter coverage threshold + verification pass rate. **UI:** research progress bar (already shipped), artifact inspector.

**Stage 8 — EXTERNAL_STORIES.** System surfaces external case studies / examples / anecdotes mapped to chapter anchor ideas, voice-aware (Drucker-era framing vs. Elon-era framing differ). **Artifact:** `external-stories/ch-NN.yaml`. **Gate:** each chapter has ≥ 1 external story. **UI:** story cards per chapter, approve/reject.

**Stage 9 — PERSONAL_STORIES.** Chris supplies or dictates personal stories per chapter; system prompts for them based on outline gaps. **Artifact:** `personal-stories/ch-NN.yaml`. **Gate:** each chapter that the framework flow requires a personal moment for has one. **UI:** chapter-by-chapter story input, optionally seeded by AI-drafted prompts from the KB.

**Stage 10 — CHAPTER_DRAFT.** Quill drafts each chapter using the framework flow, the KB-anchored outline entry, the verified research, the external stories, and the personal stories. Voice-guard critic (different model family) runs on each draft. If critic fails, draft is regenerated with critic feedback; Chris sees both verdicts. **Artifact:** `drafts/ch-NN.md`. **Gate:** voice-guard critic passes at chapter level + Chris approves. **UI:** chapter editor with voice-guard verdict badge, regenerate control, diff view against prior draft.

**Stage 11 — EDITING.** Editorial pass (line edits, consistency, continuity across chapters) then typesetting (Markdown → print-ready artifact). **Artifact:** `edited/ch-NN.md` and `typeset/book.{pdf|epub}` (format TBD by Sally). **Gate:** all chapters editorially approved; typeset output renders without errors. **UI:** book-level editor, approve-to-typeset action, downloadable final artifact.

### 4.2 The Rejection Journey (book fails viability gate)

The user arrives at Stage 4. The system returns a verdict below 3.5. **This is not an error state. It is a first-class product outcome.**

The spine shows a red "Viability: refused" badge with the per-dimension breakdown. The spine **does not permit advancing to Stage 5** — the chapter is locked. The user sees: the three lowest-scoring dimensions, the rationale for each, and a short list of revision directions ("your promise is too generic for the audience you specified — narrow one or the other"). They can go back to Stages 2 or 3, revise, and re-run the gate. They can also abandon the book — that's a valid outcome and the system records it as such (this is signal, not failure).

WHY this is a journey, not an edge case: the gate refusing a book is the **single most defensible product claim we make.** If we treat refusal as an error, we undermine the claim. Refusal is the feature.

### 4.3 The Revision Journey (chapter fails voice-guard critic)

Stage 10. Quill produces a draft. The voice-guard critic (a different model family from the drafter — if Quill is Claude, critic is GPT; if Quill is GPT, critic is Gemini) reads the draft against the framework flow and produces a verdict: pass, soft-fail (specific fixable issues), or hard-fail (wrong framework shape, wrong voice entirely).

On **pass**: Chris reviews, approves, moves on.
On **soft-fail**: the critic's notes appear inline. Chris can (a) regenerate with critic notes automatically injected, (b) hand-edit and re-run the critic, or (c) override the critic (logged as an override event for future calibration review).
On **hard-fail**: system will not auto-advance. The regenerate path is the default; override is possible but warned.

WHY: the voice-guard is the mechanism that makes "framework-aware voice" real rather than aspirational. Giving the user a visible intervention point makes the claim auditable. The override being logged means we can later see whether the critic is well-calibrated or noisy.

---

## 5. Functional Requirements

**Stage 1 — BOOK_SETUP**
- **Inputs:** user form (title, premise, length band).
- **Outputs:** `book.yaml` with book metadata; Book DB record.
- **Gate:** premise ≥ 1 sentence; length in allowed enum.
- **Touchpoints:** create-book form; redirect to spine.
- **Non-functional:** <500ms user-visible latency.

**Stage 2 — PROMISE**
- **Inputs:** BOOK_SETUP artifact + user prose.
- **Outputs:** `promise.md`.
- **Gate:** promise passes specificity check (LLM-scored binary).
- **Touchpoints:** spine → promise editor; AI-drafted suggestion button.
- **Non-functional:** LLM draft <15s.

**Stage 3 — AUDIENCE**
- **Inputs:** PROMISE artifact.
- **Outputs:** `audience.md`.
- **Gate:** audience specificity check.
- **Touchpoints:** editor + AI draft.
- **Non-functional:** LLM draft <15s.

**Stage 4 — MARKET_ANALYSIS**
- **Inputs:** PROMISE + AUDIENCE + uploaded KB excerpts.
- **Outputs:** `market-analysis.yaml` (11 dimensions, each with score 1–5 + rationale), verdict enum.
- **Gate:** **hard floor 3.5.** Below → stage marked `REFUSED`, downstream stages remain `LOCKED`.
- **Touchpoints:** viability scoring page; dimension detail modals; verdict badge on spine (always visible post-verdict).
- **Non-functional:** full scoring pass <60s, resumable if interrupted.

**Stage 5 — OUTLINE**
- **Inputs:** KB content, MARKET_ANALYSIS verdict (must be `VIABLE`), framework selection.
- **Outputs:** `outline.yaml` with chapter list, each chapter anchor-tied to KB source, framework tag.
- **Gate:** ≥ N chapters (N from framework); every chapter has a KB-source pointer; framework selected.
- **Touchpoints:** outline editor, chapter reorder, framework picker, KB-source provenance tooltip.
- **Non-functional:** outline generation <90s; fallback scaffold saves on token-limit failure (already implemented).

**Stage 6 — BASE_STORY**
- **Inputs:** OUTLINE.
- **Outputs:** `base-story.md`.
- **Gate:** through-line references ≥ 80% of chapters.
- **Touchpoints:** through-line panel on spine.
- **Non-functional:** <30s.

**Stage 7 — RESEARCH**
- **Inputs:** OUTLINE chapter list.
- **Outputs:** `research/ch-NN.yaml` per chapter (claims, sources, verifier confidence).
- **Gate:** per-chapter coverage threshold + verifier pass rate ≥ threshold.
- **Touchpoints:** research page (progress bar shipped), per-chapter artifact inspector.
- **Non-functional:** per-chapter research <5min, resumable, per-agent timeouts enforced.

**Stage 8 — EXTERNAL_STORIES**
- **Inputs:** OUTLINE + RESEARCH.
- **Outputs:** `external-stories/ch-NN.yaml`.
- **Gate:** ≥ 1 external story per chapter.
- **Touchpoints:** story cards, approve/reject.
- **Non-functional:** per-chapter generation <60s.

**Stage 9 — PERSONAL_STORIES**
- **Inputs:** OUTLINE + framework-flow requirements.
- **Outputs:** `personal-stories/ch-NN.yaml`.
- **Gate:** framework-required personal-moment slots filled.
- **Touchpoints:** per-chapter story input; AI-drafted prompts.
- **Non-functional:** n/a (user input dominates).

**Stage 10 — CHAPTER_DRAFT**
- **Inputs:** OUTLINE entry + RESEARCH + EXTERNAL_STORIES + PERSONAL_STORIES + framework flow + persona prompt injection.
- **Outputs:** `drafts/ch-NN.md` + voice-guard verdict.
- **Gate:** voice-guard critic passes + Chris approves.
- **Touchpoints:** chapter editor, voice-guard badge, regenerate, diff view, override action.
- **Non-functional:** per-chapter draft <4min; critic <90s; full book (12 chapters) end-to-end <1hr.

**Stage 11 — EDITING**
- **Inputs:** all approved chapter drafts.
- **Outputs:** `edited/ch-NN.md` + `typeset/book.{pdf|epub}`.
- **Gate:** all chapters editorially passed + typesetting renders without error.
- **Touchpoints:** book-level editor, approve-to-typeset, download.
- **Non-functional:** editorial pass <8min for a 12-chapter book; typesetting <60s.

---

## 6. Non-Functional Requirements

### 6.1 Performance
Per-stage envelopes stated in §5. **Total pipeline wall-clock for a 12-chapter book: target <2 hours of compute (excluding user think-time).** Winston's architecture supports this via LangGraph resumability and per-agent timeouts.

### 6.2 Cost
**Per-book LLM budget ceiling: $40.** Breakdown target: Viability gate $2, outline $3, research $15, drafts $12, editing+critic $6, slack $2. Circuit breaker: if projected cost exceeds ceiling mid-pipeline, system pauses and surfaces a cost-warning modal. WHY: the ghostwriter-replacement claim is not just about time — a human ghostwriter is $15k–$50k. A $40 book is the claim. A $400 book is not.

### 6.3 Reliability
All long-running workflows resumable from last checkpoint (LangGraph state persisted). Gate decisions are idempotent — re-running the viability gate with identical inputs must produce the same verdict (seeded, logged). Every stage's `GateDecision<A>` union is persisted so the spine can recover state after any crash.

### 6.4 Security
Local-dev posture today — solo tool. No auth, no secrets-in-DB, API keys in `.env`. **What changes when shared (post-v1):** per-user isolation, KB-content at-rest encryption, API-key rotation. Not v1's problem.

### 6.5 Observability
**`LLMCallLog` table is v1-required, not nice-to-have.** Every LLM call logs: provider, model, stage, agent, prompt-token-count, completion-token-count, latency, cost-estimate, verdict (if applicable). Spine shows a per-book cost rollup. Without this, the $40-book claim is unverifiable and the voice-guard calibration question is unanswerable.

### 6.6 Accessibility
Minimal v1 commitment: semantic HTML, keyboard navigation on the spine, readable contrast ratios. No screen-reader certification, no full WCAG pass. Solo-prototype scope. Revisit when there are users.

---

## 7. Release Phases

This supersedes `ship-plan.md` and `ship-plan-v2.md`. Phases align with Winston's P1–P7, renamed to user-facing themes.

### Phase R0 — Done (already shipped this session and prior)
- Voice framework system (5 personas as TS code, framework flows seeded).
- Prompt injection in suggest/preview/chapter-draft actions.
- Three-agent research verification pipeline.
- Research progress bar + DB query optimization.
- Outline fallback scaffold on token-limit failure.
- Market viability gate (functional, pending typed GateDecision wrapping).
- Cost-optimization routing (Sonnet drafting + Opus polish, batch API).

### Phase R1 — "Observable Pipeline" (Winston P1 + P2)
- **Goal:** every stage's state, cost, and gate decision is measurable and typed.
- **Ships:** baseline Prisma migration (resolve schema drift); `LLMCallLog` table and write-path; router contract test; typed `GateDecision<A>` discriminated union across all 11 stages; spine view reads from typed gate state.
- **Gate to R2:** a book can be run through Stages 1–4 with every LLM call logged and the viability verdict persisted as a typed `GateDecision.Refused | Borderline | Viable`.

### Phase R2 — "Production Draft + Critic" (Winston P3 + P4, narrowed)
- **Goal:** Stage 10 is production quality for Drucker and Elon.
- **Ships:** `Agent<I,O>` refactor of the three highest-value workflows (chapter-draft agent, voice-guard critic agent, editorial agent); framework routing via `frameworkName` registry; voice-guard critic runs on a different model family than the drafter; critic verdict persisted and surfaced in UI; regenerate-with-critic-notes flow.
- **Gate to R3:** a full chapter can be drafted in Drucker voice, voice-guard-approved, and displayed in the chapter editor with verdict badge + regenerate control.

### Phase R3 — "Spine UI + Artifact Mirror" (Winston P6 + UX build-out)
- **Goal:** the author has a single, coherent surface for the whole book; artifacts are inspectable on disk.
- **Ships:** Spine view UI (all 11 stages, state, gate badges, artifact counts, deep-links); Markdown+YAML artifact mirror on commit (DB stays primary); artifact inspector per stage; typesetting renderer.
- **Gate to R4:** the full canonical journey from §4.1 is navigable via the spine, and every stage writes a disk-visible artifact.

### Phase R4 — "Canonical Book Ship"
- **Goal:** one Chris-authored book completed end-to-end through the pipeline.
- **Ships:** the book itself. Any remaining blockers surfaced during the run are fixed in-flight. Editorial + typesetting stages stress-tested. Cost ceiling verified against real run.
- **Gate to R5:** the reference artifact exists, is archived, and Chris endorses it.

### Phase R5 — "Stabilize + Document" (Winston P5, narrow)
- **Goal:** load-bearing code paths have regression protection; the pipeline is documented enough for a second author to onboard.
- **Ships:** Vitest suite covering repositories, gate decisions, and the three `Agent<I,O>` workflows; a short operator doc for running a book; retrospective on the canonical run.
- **Gate to v1.1:** v1 is called done. Winston's P7 (remaining 8 agents) and Mary's deferred open questions (pricing, integrations, persona authoring) move to v1.1 planning.

---

## 8. Open Questions for Downstream Agents

**For Sally (UX):**
1. Spine view: vertical list of 11 stages, or a collapsed/expanded hybrid that groups Stages 1–4 (setup), 5–9 (material), 10–11 (production)? Which matches the condensed-thinker mental model?
2. How do we visually distinguish the three gate verdicts (Viable / Borderline / Refused) without overloading color — users with any red-green deficiency must still read it correctly?
3. Voice-guard verdict badge in the chapter editor: inline with the draft, in a sidebar, or as a dismissible banner? Where does the regenerate-with-critic-notes CTA sit?
4. KB-source provenance indicator on outline chapters: tooltip, inline citation, or expandable panel? The outline is already dense.
5. Typeset output format: PDF only (simplest), EPUB only (truest to the ebook-first thesis), or both? If both, which is the default download?

**For Winston (Architecture):**
1. `LLMCallLog` write-path: synchronous blocking on every call (simple, adds latency), async fire-and-forget (complex, risks data loss), or batched writes on workflow checkpoint? PRD wants observability to be reliable — which trade-off do you take?
2. When a `GateDecision` is `Refused`, must downstream stage records exist in `LOCKED` state, or should they not exist until the gate flips to `Viable`? Matters for spine rendering and for what a resume-from-crash recovers.
3. Artifact mirror conflict resolution: if disk and DB disagree (user edits `promise.md` on disk while workflow also writes), who wins? PRD default: DB wins, disk is read-only mirror; confirm.
4. Voice-guard critic model-family enforcement: hard rule in code (if drafter provider = X, critic provider must be Y ∪ Z), or soft convention in config? Hard rule is more defensible but brittle to provider changes.
5. Cost circuit breaker at $40: is this enforceable at the LangGraph-workflow level, or does it need to intercept at the provider-client level?

**For Amelia (Dev):**
1. Baseline Prisma migration in R1 — will this require a destructive reset of the local dev DB, and if so what's the backup/restore path for in-flight book data?
2. The three `Agent<I,O>` refactors in R2 — can they land incrementally behind a feature flag, or must all three ship in one merge to avoid a half-refactored state?
3. Spine view in R3 — is this one route (`/books/[slug]`) replacing existing per-stage pages, or a new overview route alongside them? Migration strategy matters for bookmarks and in-flight work.
4. Artifact mirror — which direction does the initial write go, and what happens to existing books that predate the mirror?
5. Vitest suite in R5 — what's the minimum viable set of repository tests that covers the gate-decision and cost-ceiling paths, given we're not aiming for comprehensive coverage?

---

## 9. Success Criteria — v1 Done

In priority order (highest first):

1. **One Chris-authored book shipped end-to-end through all 11 stages**, archived as the reference artifact.
2. **Stage 10 (Chapter Draft) is production quality** for Drucker and Elon personas, with voice-guard critic running on a different model family and verdicts surfaced in UI.
3. **Stage 11 (Editing + Typesetting) is production quality**, producing a downloadable final artifact.
4. **Spine view UI shipped** as the author's home surface.
5. **Markdown+YAML artifact mirror** operational; disk reflects DB.
6. **`Agent<I,O>` abstraction landed** for the three highest-value workflows (draft, voice-guard critic, editorial). Full manifest deferred.

Explicitly removed from Mary's original list: none. Explicitly added: the cost-ceiling claim ($40/book verified against the canonical run) and the `LLMCallLog` observability requirement, because neither is optional once you commit to the ghostwriter-replacement positioning.

---

## 10. Anti-patterns We Will Refuse

- **"Let's add a seventh persona before certifying the first two."** — Breadth theater. Refused.
- **"Let's make personas user-authorable."** — That's a persona-authoring IDE, a different product. Refused in v1.
- **"Let's add a Notion integration."** — Three weeks of OAuth that doesn't make the reference book better. Refused.
- **"Let's make the viability gate advisory, not blocking."** — Destroys the single most defensible claim in the brief. Refused.
- **"Let's ship stages 1–11 at equal quality."** — Parity polish ≠ production quality. Depth on 10/11 beats even-ness. Refused.
- **"Let's add a chat-with-the-pipeline surface."** — Reduces us to a raw LLM wrapper, which Mary's non-goals explicitly forbid. Refused.
- **"Let's let users pick models."** — Routing is a product decision, not a user-facing knob. Refused.
- **"Let's build mobile now so it's ready when we launch."** — No one is launching. Refused.
- **"Let's add collaboration so co-authors can work together."** — Non-goal in the brief. Refused.
- **"Let's sell it before a reference book exists."** — Monetization without proof is vanity. Refused.
- **"Let's refactor all 11 agents to `Agent<I,O>` in v1."** — Winston's P7, explicitly deferred. Refused in v1; landed in v1.1.
- **"Let's add comprehensive test coverage before shipping the canonical book."** — Tests after the reference artifact, not before. Refused.

The rule: if a feature is not on the path to *Chris ships one book end-to-end*, it is not in v1. If someone proposes one, the answer is "WHY? And does it block the canonical book? No? Then after."

---

**End of PRD v1.**
