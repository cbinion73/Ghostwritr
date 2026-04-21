# Voice Framework Evaluation

**Date:** 2026-04-20
**Authors:** Sally (UX), Mary (Analyst), Paige (Tech Writer), orchestrated roundtable
**Scope:** Re-evaluate five `WriterPersona` voices through a *framework* lens, not a *tone* lens. Corrects Round 5.

---

## The frames each voice actually ships

Each persona ships an explicit **Typical Flow** — a chapter-shaping framework, not just a tone.

| Voice | Framework | Shape |
|---|---|---|
| **AndyGPT** | **ME-WE-TRUTH-YOU-WE** | Personal tension → shared pattern → principle → application → resolution |
| **CahnGPT** | **Mystery → Pattern → Strategy** | What if? → you've seen this → not random → the pattern → what it means → what you do |
| **DruckerGPT** | **Diagnose → Prioritize → Execute** | Result? → problem? → priorities? → trade-offs? → action? → owner? → deadline? |
| **ElonGPT** | **First-Principles Demolition** | Why? → wrong assumptions? → real constraints? → best version? → build/test |
| **JobsGPT** | **Old → New narrative arc** | Simple problem → why it matters → what's wrong → better way → what it means → reinforce → close |

**Critical observation (Paige, self-correcting Round 5):** `chapter-draft.md.template` was built around a five-slot `me / we / truth / you / we_close` structure. That structure IS AndyGPT's ME-WE-TRUTH-YOU-WE framework. The pipeline's chapter spine is already Andy-flavored. Every other voice is measured as distance from Andy.

---

## 1. Sally — Reading Rhythm as Lived Experience of the Framework

**AndyGPT (ME-WE-TRUTH-YOU-WE).** The reader exhales on page one. Rhythm: *inhale-together, pause, act, exhale-together* — roughly four beats per chapter. Over 250 pages, a breathing pattern the body can entrain to. Reading becomes rocking. Risk: "You ever..." becomes a tic.

**CahnGPT (Mystery → Pattern → Strategy).** The reader leans forward. "What if?" is a hand on their forearm. Espresso cadence. Chapters want to be short (8–14 pages). Over 250 pages the reader either becomes addicted or exhausted.

**DruckerGPT (Diagnose → Prioritize → Execute).** The reader sits up straighter. Rhythm of a good doctor's appointment. No exhale built in. Chapters end on action, not resonance. Informed but unmoved.

**ElonGPT (First-Principles Demolition).** The reader's jaw tightens. Demolition precedes reassurance. Combat-fatigued after 150 pages. Essay-length framework, not book-length.

**JobsGPT (Old → New).** The reader settles in like it's a TED talk. A chapter of this is exhilarating. Twelve chapters is a sermon. Structure becomes visible; magic leaks.

### Framework durability

| Framework | Natural chapter length | Book-length durability | Where it breaks |
|---|---|---|---|
| ME-WE-TRUTH-YOU-WE | 12–20 pages | **High** | Opener tic |
| Mystery → Pattern → Strategy | 8–14 pages | Medium | Nervous-system fatigue |
| Diagnose → Prioritize → Execute | 6–12 pages | Medium-low (teaching) | No emotional exhale |
| First-Principles Demolition | 15–25 pages | Low | Combat fatigue |
| Old → New arc | 10–18 pages | Medium | Performance exhaustion |

### Blend compatibility vs. Andy spine

- **CahnGPT:** Overlays cleanly at 30%. Rides the spine.
- **DruckerGPT:** Overlays at 30% only inside YOU-WE. Partial rider.
- **ElonGPT:** Clashes at any overlay. Must replace the spine.
- **JobsGPT:** Rides awkwardly — workable if Old/New beats live inside TRUTH.

**Sally's re-pick:** In Round 5 she picked Jobs on tone. **Under the framework lens: AndyGPT.** Jobs performs; Andy paces. A 250-page read is a walk, not a stage. Andy's framework ends each chapter on shared resolution, not reveal/action/demolition.

**Blend she'd ship: 70% AndyGPT / 20% JobsGPT / 10% CahnGPT.** Andy holds the spine. Jobs sharpens the TRUTH beat. Cahn lives in chapter openers (one in three begins with "what if" instead of "you ever").

---

## 2. Mary — Framework → Market Category → Commercial Outcome

| Framework | Sub-shelf | Exemplar comp | Reader structural expectation | Ceiling |
|---|---|---|---|---|
| ME-WE-TRUTH-YOU-WE | Christian Living / Practical | *Better Decisions, Fewer Regrets* (Stanley) | Story → shared pattern → principle → Monday action → communal close | Breakout-possible |
| Mystery → Pattern → Strategy | Religion / Prophecy | *The Harbinger* (Cahn) | Hidden pattern revealed, cipher decoded, reader equipped | Breakout, category-locked |
| Diagnose → Prioritize → Execute | Business / Management | *The Effective Executive* (Drucker) | Result named, trade-off forced, owner + deadline | Mid-list reliable; breakout w/ credentials |
| First-Principles Demolition | Business / Entrepreneurship | *Zero to One* (Thiel) | Assumption destroyed, rebuilt, tested | Breakout w/ founder credentials |
| Old → New arc | Business / Leadership / Vision | *Start With Why* (Sinek) | Status quo broken, elegant reframe, aesthetic "oh" | Breakout-possible |

### The pipeline-template market trap

If Chris ships a Drucker or Jobs author voice on Andy's ME-WE-TRUTH-YOU-WE chapter spine, **the book drifts toward Christian Living regardless of voice**. Category placement is driven by structural promise, not prose. Amazon's also-boughts pull a Drucker-voice / Andy-spine book toward Christian-leadership (Maxwell territory), not Drucker territory. **Swap the template or accept the shelf the spine implies.**

### Blend coherence ranking

**Top 3 (commercially coherent):**
1. **Drucker + Jobs** — Vision-leadership. Same Business/Leadership shelf; Jobs's arc gives Drucker's diagnostics emotional payoff.
2. **Jobs + Elon** — Innovation/Vision. Same shelf neighborhood; Old→New absorbs first-principles demolition as its middle beat.
3. **Andy + Jobs** — Inspirational-leadership. Christian Leadership shelf (Maxwell, Groeschel).

**Bottom 3 (incoherent):**
- **Andy + Elon** — Pastoral vs. contrarian; no shelf holds both.
- **Andy + Cahn** — Practical Christian vs. prophetic Christian are adjacent shelves that actively repel each other's buyers.
- **Cahn + Drucker** — Hidden-pattern revelation on a management spine; no shelf claims the result.

### Mary's updated verdict

**Drucker holds, but the pick is now Drucker + Jobs, not Drucker solo.** Jobs's Old→New arc lifts the ceiling into breakout territory while keeping the book on Business/Leadership. **Pipeline template must be swapped** — Diagnose→Prioritize→Execute as the spine, Old→New reveal as the chapter-opener beat.

**ElonGPT legal flag — re-affirmed and sharpened:** First-Principles Demolition is structurally tied to a living founder's biography, so the spine itself evokes Musk even if prose is scrubbed. Keep Elon as a middle-chapter accent at most, never as the book's framework.

---

## 3. Paige — Pipeline Integration, with Code Implications

### Framework-template fit

- **AndyGPT — native fit.** Zero translation cost.
- **CahnGPT — clean overlay, six-to-five compression.** "What if?" → `me`, "you've seen this" → `we`, pattern reveal → `truth`, "what it means" → `you`, action → `we_close`.
- **DruckerGPT — breaks the spine.** No personal-tension opener, no resolution beat. Forcing `me` makes him fake-confessional. **Needs his own template.**
- **ElonGPT — structurally incompatible at the close.** Terminates at build/test. No `we_close` resolution. **Needs his own template.**
- **JobsGPT — compresses beautifully.** Problem + why = `me`+`we`, what's-wrong inside `we`, better-way = `truth`, what-it-means = `you`, reinforce+close = `we_close`. Pure overlay.

### Chapter-template recommendation

**Ship one Andy-shaped template with overlays for Cahn/Jobs, AND two per-framework templates for Drucker/Elon.** Three templates total. Respects the 3/5 voices that fit Andy's spine; honors the 2/5 that don't. Dominant persona's `frameworkName` picks the template at blend time.

### Prisma schema change

```prisma
model WriterPersona {
  // ... existing fields ...
  frameworkFlowJson  Json     @default("[]")
  frameworkName      String?
}
```

Migration SQL:

```sql
ALTER TABLE "WriterPersona"
  ADD COLUMN "frameworkFlowJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "frameworkName" TEXT;
```

`frameworkFlowJson` stores an ordered array of `{slot: string, prompt: string}` objects. `frameworkName` is the human label for UI + template routing.

### Backfill strategy

**One-time manual seed, not regex.** Five personas × ~10 minutes of manual seeding = 50 minutes of work that's 100% correct. Write `prisma/seed-framework-flows.ts` with the five flows hardcoded.

### Prompt updates

- **`suggestWriterPersonas`** — inject framework into persona catalog block. Add: *"When recommending personas, weight framework-fit against the book's intended chapter arc, not only tone."*
- **`generateVoiceBlendPreview`** — inject dominant persona's framework flow. Add: *"The preview must structurally trace the dominant persona's framework, not just echo its vocabulary."*

### Updated Role → Voice map

| Role | Round 5 | Round 6 | Rationale |
|---|---|---|---|
| Author Voice (Quill) | AndyGPT | **AndyGPT** | Native spine fit; no change. |
| Voice-Guard Critic | JobsGPT | **JobsGPT** | Best compressive arc-checker. |
| Atlas critic | DruckerGPT | **DruckerGPT** | Diagnostic framework is the right lens for research. |
| **Skeleton critic** | ElonGPT | **DruckerGPT** | Elon's no-resolution spine fails outlines; Drucker's priorities/tradeoffs fit. |
| Mary's 2nd opinion | CahnGPT | **CahnGPT** | Mystery→Pattern→Strategy complements viability framing. |
| **Reed's 2nd opinion** | JobsGPT | **ElonGPT** | Reed evaluates ship decisions; Elon's build/test terminus IS that second opinion. |

### Paige's one recommendation

**Add `frameworkFlowJson` + seed manually this week, before touching templates or prompts.** Everything else depends on the framework being first-class data.

---

## Orchestrator Synthesis

**Three convergences:**
1. AndyGPT is the pipeline's native spine (all three agents; Paige owned this blind spot).
2. The code gap is the next move — `frameworkFlowJson` as first-class data + prompt updates. ~50-minute seed task.
3. Drucker + Jobs is the strongest non-Andy blend (Mary commercial, Paige structural). Sally gives Andy + Jobs + Cahn as the Andy-spine pick.

**The sharp disagreement:**
- Sally: don't swap the Andy spine. Reader's breathing pattern needs it. Every other voice is an overlay at 30% max.
- Mary: swap the spine if content demands a different shelf. Drucker-voice on Andy-spine = shelf drift to Christian Leadership.
- Paige: compromise — **three templates, hybrid**. Andy-spine serves Andy/Cahn/Jobs; dedicated templates for Drucker and Elon.

**Paige's hybrid reconciles the disagreement.** Andy spine survives for voices that fit it; dedicated templates exist for voices that don't. Mary's shelf-drift risk is addressed. Sally's "don't break the breathing pattern" concern is honored for the Andy/Cahn/Jobs subset.

**Recommended sequencing:**
1. Ship `frameworkFlowJson` field + manual seed (Paige's standalone recommendation).
2. Inject framework into both `setup/actions.ts` server actions (`suggestWriterPersonas`, `generateVoiceBlendPreview`).
3. Add `frameworkName`-driven template routing; ship Drucker and Elon templates.
4. Revise the voice-blending suggestion UI to surface the framework name to the user when picking personas.
