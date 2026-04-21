# GHOSTWRITR — Product Brief

**Status:** Draft v1 (foundational — drives PRD, Architecture, UX)
**Author:** Mary (Strategic Business Analyst)
**Date:** 2026-04-20

## Executive Summary

GHOSTWRITR is an 11-stage book-production pipeline that replaces the human ghostwriter for author-experts whose ideas are larger than their patience for longhand. It is built by Chris, for Chris, and for the cohort who share his cognitive signature: brains that condense and simplify until a book-sized idea collapses into a twenty-page artifact. The product's thesis is that a disciplined pipeline — with a hard market-viability gate, knowledge-base-first outlining, framework-aware voice personas, and tri-provider LLM routing with an opposite-family critic — can produce the structural rigor of a ghostwriter at one to five percent of the cost.

What makes GHOSTWRITR different from Scrivener, raw ChatGPT, and the Sudowrite/Jasper/Novelcrafter assistant tier is that it can refuse to proceed. Stage 2 scores the book across eleven dimensions and will not open the outline gate below 3.5/5. Stage 3 derives the big ideas from the author's own knowledge base rather than from the pitch. Stage 9 assembles from committed upstream artifacts rather than re-imagining the chapter each time. The commercial hypothesis: author-experts will pay meaningfully for a system that behaves like a structural partner, not an autocomplete.

## The Problem

### Who has it

Chris. Expert in his own domain, verbal thinker, pattern-seeker, book-desirer. Has wanted to write books for a long time. Starts many, finishes none — not from laziness, from a reflex: *his brain condenses and simplifies*. The best idea for a book compresses in his head to twenty pages and then refuses to re-expand. He is not short of material; he is short of the mechanism that forces a long-form artifact out of a short-form mind.

Generalizing carefully: the cohort is **the condensed-thinker expert** — operators, advisors, founders, coaches, and specialists who have the substance for a book and the authority to sell one, but whose working memory and output style collapse ideas rather than unfold them. This is not the "aspiring novelist" cohort. It is the non-fiction authority cohort.

### What they're doing today (and why it fails)

Four existing paths, each broken in a specific way:

1. **Scrivener and its peers** — organize material beautifully; decide nothing; produce nothing. The condensed thinker does not need better folders. He needs something that will not let him stop.
2. **ChatGPT or Claude directly** — will write anything about anything, including books that are confidently wrong, structurally flat, and voice-drifted. No gate, no grounding in the author's real material, no memory between sessions of what was committed versus what was draft.
3. **Human ghostwriters** — $30,000–$100,000, months of calendar time, dependency on a single collaborator's taste, and the author still has to produce the raw material through interviews.
4. **AI writing assistants (Sudowrite, Jasper, Squibler, Novelcrafter)** — tuned mostly for fiction workflows or marketing copy, positioned as "assistants." They speed up a writer who already knows what they are doing. They do not help a condensed thinker force a book out of himself.

### The underlying pain

Root cause: **the long-form idea has no natural mechanism to resist premature compression.** The author's own brain is the compression engine. Tools that lower the cost of writing do not help, because the bottleneck is not typing speed — it is the refusal to stay expanded. GHOSTWRITR must therefore be a *pipeline with gates*: a system that holds the idea in its expanded form across time, provides structural scaffolding at every stage, and produces artifacts the author cannot collapse back into a paragraph.

## The Solution

### What GHOSTWRITR is

GHOSTWRITR is a gated, stage-versioned, LLM-orchestrated book-production pipeline that takes an author from a book promise to a typeset manuscript across eleven stages, each producing committed artifacts that downstream stages consume. It is built on Next.js 16, Prisma/Postgres, and LangGraph, with tri-provider LLM routing across Anthropic, OpenAI, and Google, and a canonical voice-persona system that treats voice as structural (chapter-shape), not merely tonal.

### Core jobs-to-be-done

1. **Refuse unworkable books early** — score market viability across 13 phases and 11 dimensions, hard-gate at 3.5/5, before any outline work begins.
2. **Force long-form out of a short-form brain** — hold the book in its expanded state through paragraph-topic assignment, base-story threading, and chapter-level assembly that the author cannot mentally collapse.
3. **Ground every chapter in the author's real material** — knowledge-base-first outlining, AI-interviewed personal stories, verified deep research with citations, and curated external anecdotes.
4. **Preserve a chosen voice as a chapter-shaping framework** — not "write like Drucker" as a tone filter, but apply the Drucker chapter shape (hypothesis). Five personas live as canonical code constants.
5. **Produce a finished book object** — editorial pass and typesetting stages that yield a manuscript, not a folder of drafts.

### Non-goals

- Not a fiction workflow. Narrative novels are out of scope.
- Not a collaboration platform. One author, one book at a time, one operator seat.
- Not a marketing or publishing tool. No Amazon/KDP integration, no launch automation, no reader-facing surfaces.
- Not a general-purpose writing assistant. GHOSTWRITR does not help you write blog posts, emails, or proposals.
- Not a raw LLM wrapper. If the gates do not fire, the product has failed.

## Target Users

### Primary user: Chris (the builder / canonical case)

- **Role:** Domain expert and operator who has accumulated a body of frameworks, stories, and opinions worth a book.
- **Context:** Works alone on the book. Has attempted long-form before. Has a knowledge base (notes, talks, prior writing) but not a manuscript.
- **Motivations:** Publish an authoritative non-fiction book; externalize expertise; build category authority.
- **Blockers:** The condensation reflex; the blank-page problem at every stage; the cost and calendar of a human ghostwriter; the shallowness of raw LLM output; the hallucination risk of ungrounded AI books.
- **Success state:** A typeset, editorially passed manuscript that reads as *his* book — structurally rigorous, in a chosen voice-framework, grounded in his own material and verified research.

### Secondary user cohort

The **condensed-thinker expert** — a narrow cohort, deliberately: consultants and advisors with a signature methodology; operator-founders with a hard-won playbook; domain specialists (clinicians, engineers, financiers) with a teachable frame; coaches and executive educators. They share three traits: (a) they have the authority to sell a non-fiction book in their domain, (b) they have the raw material in scattered form, (c) their thinking style compresses rather than expands. Hypothesis: this cohort is measured in tens of thousands globally, not millions — TAM discipline is more important than TAM size.

### Explicit anti-persona

- **The aspiring novelist.** Fiction is not this pipeline.
- **The content marketer.** GHOSTWRITR is not for blog posts, lead magnets, or SEO books.
- **The AI-book spammer.** The market-viability gate and knowledge-base-first outlining are hostile to this use case by design.
- **The team-based publishing house.** No multi-seat collaboration in v1.
- **The "I want to write but have no material" user.** GHOSTWRITR grounds in what the author already has. It will not manufacture expertise.

## Strategic Positioning

### Category

Output books land on multiple BISAC shelves — Business, Self-Help, Professional, Reference — depending on the author. **The tool itself sits in the Authoring Software category, specifically the "AI-native authoring pipeline" sub-category it is helping define.** It is adjacent to Scrivener on the shelf-of-tools but non-overlapping: Scrivener ends where GHOSTWRITR begins (organization → decision + production).

### Three axes of differentiation

1. **Market viability gate (Stage 2).** 13-phase framework, 11-dimension scoring, hard 3.5/5 floor. No competing tool in the category refuses to let the user proceed. This is the most commercially defensible feature in the product.
2. **Knowledge-base-first outlining (Stage 3).** The outline is derived from the author's actual material, not from the pitch. This directly fights the dominant failure mode of AI-authored non-fiction — hallucinated authority.
3. **Framework-aware voice system.** Five canonical personas (AndyGPT, CahnGPT, DruckerGPT, ElonGPT, JobsGPT), each paired with an explicit chapter-shaping framework. Voice is structural, not a stylistic skin. Combined with tri-provider LLM routing and an opposite-family voice critic, this is an epistemic hedge against single-model sycophancy.

### Competitive comparison table

| Capability | Scrivener | ChatGPT/Claude direct | Sudowrite / Jasper / Novelcrafter | Human ghostwriter ($30k–$100k) | **GHOSTWRITR** |
|---|---|---|---|---|---|
| Organizes research and drafts | Yes | No | Partial | Yes (human) | Yes (versioned artifacts per stage) |
| Refuses unworkable books | No | No | No | Sometimes (taste-based) | **Yes — hard gate at 3.5/5** |
| Grounds output in author's real material | No | No | No | Yes (via interviews) | **Yes — knowledge-base-first + AI interview stage** |
| Enforces structural voice (chapter shape) | No | No | No | Partial (ghostwriter's craft) | **Yes — 5 canonical persona frameworks** |
| Multi-provider LLM + critic hedge | N/A | No | No | N/A | **Yes — Anthropic + OpenAI + Google, opposite-family critic** |
| Produces typeset manuscript | No | No | No | Yes | Yes (thin today) |
| Cost for one completed book | Software license | Subscription | Subscription | $30k–$100k | Target: 1–5% of human cost |
| Calendar time | Author-bound | Author-bound | Author-bound | 6–18 months | Target: weeks, not months (hypothesis) |

## Success Metrics (Leading)

### Activation

A first-session user is activated when they complete **Book Setup + Market Viability scoring** and either (a) pass the gate and generate their first outline, or (b) fail the gate and receive a reasoned verdict. Both outcomes are activation events — the gate firing *is* the product working. A user who drops before a verdict has not experienced the core value.

### Retention

Retention is not session count — it is **stage progression**. The leading indicators are: days-to-committed-outline, days-to-committed-base-story, percentage of paragraph topics committed, and the ratio of DRAFT → REVIEW_READY → COMMITTED transitions per stage. A retained user is one who is moving artifacts forward through the lifecycle. A user stuck in DRAFT across stages is a churn risk regardless of login frequency.

### Outcome

The only outcome metric that matters: **completed, typeset manuscripts shipped per author per year.** Secondary craft KPIs: editorial-pass change density (low = clean draft), citation density in research-grounded chapters, voice-critic pass rate on the first attempt, and market-viability score at gate versus reader-quality proxies post-production. Commercial KPI: willingness to pay as a function of completed-book outcomes, not feature count.

## Known Constraints & Assumptions

### Technical constraints

- **Tri-provider LLM cost discipline is load-bearing.** The Sonnet-drafts + Opus-polish + batch-API strategy yields ~55% savings; the economics of the pipeline depend on it holding. Any feature that forces Opus across all stages breaks the cost model.
- **`pg_dump` is unavailable in the current environment.** Schema work must flow through Prisma migrations; ad-hoc snapshots are not an option. Downstream architectural choices (artifact storage, backup strategy) must accommodate this.
- **Schema drift between Prisma models and runtime artifacts is a known hazard.** Stage outputs are versioned, but the migration to Markdown+YAML artifact storage is still pending — today's state mixes DB-native and document-native storage.
- **LangGraph is the orchestration substrate.** State machines per workflow are the unit of composition. Agent-folder/manifest abstraction (BMAD-style) is not yet implemented — this is a known architectural gap.
- **Outline Phase 1 (Sonnet) hits token-limit errors and falls back to scaffold.** The fallback is graceful but the full generation path is not reliable — an architectural item, not a bug.

### Commercial assumptions

- **TAM hypothesis:** tens of thousands of condensed-thinker experts globally, not millions. The product is a specialist tool, not a consumer app.
- **One-author-one-book is the v1 unit.** Whether the same author returns for a second book is an open question — answer drives LTV model.
- **B2C (individual author) is the v1 motion.** B2B (consultancies, publishing houses, executive-education firms licensing the pipeline) is a plausible v2 motion — do not design v1 around it.
- **Willingness to pay is anchored to the ghostwriter alternative, not the SaaS-tool alternative.** Pricing should be read against $30k–$100k, not against a $20/month Scrivener license.

### Open questions for PRD

1. **Pricing model** — per-book flat fee, subscription, or usage-metered on LLM spend? Each implies a different onboarding and a different retention metric.
2. **Knowledge-base ingestion surface** — how does the author get their raw material into the system? Upload, integrations, paste-box, AI interview only? This is the activation bottleneck.
3. **Spine view UI** — referenced as missing. What exactly is a "spine view" in the author's workflow, and which stages does it touch?
4. **Agent-folder / manifest abstraction** — is this an internal refactor or an externally visible extensibility surface (user-defined agents)?
5. **Persona expansion policy** — five canonical personas today. Is the set closed, author-extensible, or author-authored?

## Risks & Mitigations

### Technical

- **LLM provider outage or pricing shock.** Mitigation: tri-provider routing is already architectural; ensure every stage has a documented fallback provider and a cost-ceiling circuit-breaker.
- **Schema drift and artifact-storage bifurcation.** Mitigation: prioritize the Markdown+YAML artifact migration on the architecture roadmap; treat it as a foundational item, not a nice-to-have.
- **Outline Phase 1 token-limit unreliability.** Mitigation: the fallback path is working; the real fix is chunked generation with framework-aware prompts — assign to Architect.
- **LangGraph runtime as a single point of orchestration failure.** Mitigation: ensure workflow-run records are resumable and that stage artifacts are independently valid outside the runtime.

### Commercial

- **The cohort is narrow.** Mitigation: do not pretend otherwise in GTM. Price to the ghostwriter alternative, not the SaaS alternative. Depth beats breadth.
- **AI-book backlash / platform policies against AI-authored non-fiction.** Mitigation: the knowledge-base-first architecture and citation-grounded research are the defense — lean into them publicly as quality differentiation.
- **Single-author LTV uncertainty.** Mitigation: instrument for second-book return explicitly; do not assume it.

### UX — the condensation reflex

This is the central UX risk and deserves its own heading. **Chris's brain — and the cohort's brain — will try to collapse the book back into a paragraph at every stage.** The UX must actively resist this. Implications:

- Every stage must present the *expanded* artifact as the default view; summaries are secondary.
- The DRAFT → REVIEW_READY → COMMITTED lifecycle must be visible and frictional enough that the author feels the weight of committing — collapsing back requires an explicit uncommit.
- The spine view (once defined) must make the full book shape legible without inviting compression.
- Dashboard-level "progress" metrics must reward stage progression, not word count — word-count gamification would reinforce the wrong reflex.

## 90-Day Strategic Horizon

Success at day 90 means: **Chris has taken one book end-to-end through all eleven stages, passed the market-viability gate honestly, produced a typeset manuscript in a chosen persona-framework, and the pipeline's cost-per-book has been measured against the ghostwriter benchmark.** That is the canonical-case proof.

Concretely, v1-done requires:

1. Chapter Draft, Editorial Pass, and Typesetting stages brought from "functional but thin" to production-quality — parity with the upstream stages.
2. The spine view UI shipped — the author's single-pane view of the expanded book.
3. Drucker and Elon chapter templates wired through the full pipeline, matching the Andy/Cahn/Jobs depth.
4. Markdown+YAML artifact storage migration completed — schema drift closed.
5. Agent-folder/manifest abstraction (BMAD-style) landed — the extensibility foundation for later persona and stage expansion.
6. One full Chris-authored book shipped through the pipeline as the canonical case study — the artifact that validates the thesis.

At day 90, the question is not "does the product have more features?" It is: **did the condensed-thinker produce a book he would not otherwise have written?** If yes, the thesis holds and v2 is a distribution problem. If no, the gates or the assembly are wrong, and we return to Stage 9 and Stage 10 first.
