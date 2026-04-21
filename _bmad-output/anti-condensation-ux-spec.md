# Anti-Condensation UX Spec

**Design principle:** GHOSTWRITR's job is to be the expansion Chris's brain won't do for him. Every screen either expands or it's dead weight.

The user (Chris) self-reports that his brain condenses and simplifies — book-length ideas collapse to 20 pages. The UI must actively fight that reflex at six specific moments in the pipeline.

---

## 1. Voice Fingerprint Studio

- **Route:** `/books/[slug]/setup/voice`
- **Core interaction:** Chris hits "Start voice capture." A chat panel opens with one agent (Marin). She asks seven questions over 8–12 minutes:
  - Three "tell me about a time..." open questions.
  - Two "which of these sentences sounds more like you?" A/B pairs of real prose across five registers (wry, warm, blunt, literary, conversational).
  - Two "read this aloud" prompts (talk-to-text; audio retained).
- **Expansion mechanism:** Recognition over recall. Chris can't shrink "pick A or B." A/B choices triangulate a voice fingerprint he could never hand-type. Open-question transcripts feed an analyzer that extracts sentence rhythm, hedge words, metaphor density.
- **Edge case:** One-word answer to an open question → Marin reflects once: *"Fine is the door closing. What was behind it?"* Maximum two reflections per question; then the question is flagged "thin" in the artifact. Mid-interview abandon saves as `voice_fingerprint.draft` with a 3/7 completion ring.
- **Key UI detail:** Live waveform pulses while he's talking. Chip top-right reads **"Marin is listening"** — never "recording," never "transcribing." *Listening.* That one word makes it an interview, not a form.

---

## 2. Market Viability Diagnosis Room

- **Route:** `/books/[slug]/viability`
- **Core interaction:** After scoring runs, Chris lands on a page that looks like a doctor's office, not a courtroom.
  - **Top:** score out of 5 as a dial, not a number ("3.2 — Treatable").
  - **Middle:** 11 dimensions as a radar chart with weak spokes glowing amber.
  - **Below:** four "neighboring books" — real comps scoring 4+ with a one-line diagnosis of what they did that his doesn't yet. Each has a "steal this angle" button.
  - **Bottom:** two buttons (primary + override).
- **Expansion mechanism:** Neighbors. Seeing four adjacent books that cleared the bar reframes rejection as a map. "Steal this angle" injects the differentiator back into the premise and re-runs scoring — expansion by contrast.
- **Edge case:** Below 3.5, the **"I know. I'm writing it anyway."** override is honored but opens a 90-second reflection modal (three questions: who's it for, what will you accept as success, what happens if it flops). Answers stored on the book record.
- **Key UI detail:** Override button is the same size and weight as the primary CTA — equal dignity, no ghost-link demotion. Label reads **"Proceed anyway — I've thought about it"** — past tense, because the modal makes it true.

---

## 3. Paragraph Topics Hunger Board

- **Route:** `/books/[slug]/chapters/[id]/paragraphs`
- **Core interaction:** Kanban-style board, one column per chapter section. Each paragraph topic is a card with a **hunger meter** (0–100) on its left edge — thin red sliver = starving, fat green bar = fed. Chris drags cards around, adds new ones, or clicks a card to see what it's "hungry for" (a stat? a scene? a counter-argument?).
- **Expansion mechanism:** The hunger meter is scored by an agent against the chapter's target word count *and* the Knowledge Base density for that topic. A thin card physically looks wrong next to a fat one — Chris's eye does the condensation-detection his brain won't. Chapters can't advance to Base Story until the board's average hunger is above 60.
- **Edge case:** One-line topic ("talk about fear") spawns red with ghost-text: *"Fear of what, specifically? A moment? A statistic? A reader's objection?"* Dismissible, but the card stays amber until fed.
- **Key UI detail:** When a card crosses amber → green, a single soft *breathe* animation — scale 1.0 → 1.03 → 1.0 over 400ms. That's the dopamine hit.

---

## 4. Personal Stories Campfire

- **Route:** `/books/[slug]/stories/interview/[topicId]`
- **Core interaction:** Full-screen, dark mode, one agent (Tova) sitting across a fire. Big mic button. She asks one sensory question at a time: *"Where were you standing? What did the room smell like? Who spoke first?"* Talk-to-text primary, typing secondary. Live word count bottom-right with a floor of 400 words per story.
- **Expansion mechanism:** Sensory hooks + word floor + Tova's silence. She waits. She doesn't fill the gap. When the transcript plateaus, she asks one of three deepening questions:
  - *"What did you not say out loud?"*
  - *"What would you tell yourself that morning if you could?"*
  - *"What does this story mean that it didn't mean then?"*
  She only says **"I have enough"** when the transcript hits density thresholds (sensory markers, dialogue, stakes, resolution) — not just word count.
- **Edge case:** Lazy answer under 40 words triggers a gentle reframe: *"Take me back before you knew how it ended."* Three reframes, then the story saves as `draft-thin` and the chapter can't close until revisited.
- **Key UI detail:** The mic button's outer ring fills clockwise as he talks — a progress halo, not a bar. When Tova says "I have enough," the fire dims by 20%. It's done. He can exhale.

---

## 5. Agent Roundtable Drawer

- **Route:** Persistent right-edge drawer on every book page.
- **Core interaction:** Only the agent relevant to the current stage is surfaced in full color. Others are greyed silhouettes with a one-line status ("Marin: voice captured ✓ / Tova: waiting for chapter 3"). Chris clicks an agent to expand their panel, see their artifact, ask a question.
- **Expansion mechanism:** Progressive disclosure. Chris can't be overwhelmed by 11 agents screaming at once — the stage dictates who has the mic. But the silhouettes are always visible, so he remembers the team is working downstream.
- **Edge case:** If an upstream artifact changes (e.g., he edits voice fingerprint after drafting chapter 2), affected agents pulse amber in the drawer with a "stale — re-run?" chip. Non-blocking but visible.
- **Key UI detail:** Each agent's silhouette has a tiny colored dot — green / amber / red / grey — matching their artifact state. Peripheral vision does the work.

---

## 6. Book Spine Map

- **Route:** `/books/[slug]` (the book home).
- **Core interaction:** A grid.
  - **Y-axis:** chapters (rows).
  - **X-axis:** the 11 pipeline stages (columns).
  - **Cells:** colored squares representing artifact state for that chapter × stage.
  Chris scans the whole book in one glance. Click any cell → jump straight into that stage for that chapter.
- **Expansion mechanism:** Spatial memory rescues the stage-6/7 "where am I" collapse. The grid is literally the book's skeleton — he sees the shape of his progress, not a list.
- **Edge case:** Chapters stalled more than 7 days get a subtle diagonal stripe overlay. Abandoned books (no activity 30+ days) fade to 60% opacity on the dashboard but never disappear.
- **Key UI detail:** Cell colors — **charcoal** (not started), **amber** (in progress), **teal** (artifact ready), **gold** (approved). **Never red.** Red means failure. Nothing here has failed; it's just unfinished.

---

## Implementation Priority

Per `ship-plan.md`, the **Book Spine Map (§6)** and **Paragraph Topics Hunger Board (§3)** ship first — they validate the "visible expansion fights condensation" thesis on the current Prisma stack before any refactor. The other four moments (Voice Studio, Viability Diagnosis, Campfire Interview, Agent Drawer) are Phase 4 — deferred until the architecture is ready and the UX thesis has proved itself.
