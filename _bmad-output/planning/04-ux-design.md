# GHOSTWRITR — UX Design Specification (v1)

**Status:** Plan of record (drives component architecture + dev stories)
**Author:** Sally (UX Designer)
**Date:** 2026-04-20

## 1. Design Principles (The Non-Negotiables)

### 1.1 The condensation-resistance principle
The condensed thinker's reflex is to collapse the book back to its seed at every prompt. The UI must reward expansion, not summary. Every stage screen shows the *full* artifact by default — the expanded thing, not the elevator pitch. If we show a summary at all, it sits in a secondary column, smaller, greyer, labeled "recap" not "the idea." Word counts, paragraph counts, story counts, evidence counts — all go *up* and to the *right*. The user should feel pages accruing like pounds of muscle, not pages being carved away like marble.

### 1.2 Gates as diagnoses, not judgments
The Market Viability Gate can refuse a book. It must never feel like a bouncer. It feels like a cardiologist reading an EKG: *here is what your book's heart is doing, here are the three dimensions where the rhythm is off, here is what a stronger waveform would look like, here is the override button if you believe the machine is wrong.* Refusal is a first-class outcome with its own dignified UI. The override exists, is logged, is never hidden.

### 1.3 Artifact visibility as progress
The dashboard does not display percent-complete or time-elapsed. It displays *the artifact itself, getting bigger*. Stage 1 shows a seed sentence; Stage 2 shows the voice fingerprint; Stage 5 shows the outline tree unfurling; Stage 8 shows paragraph topics stacking like firewood. The spine view is a literal visual accumulation — you can *see* the book thickening. Progress is material, not numeric.

### 1.4 Progressive agent disclosure
Eleven stages means at least eleven possible agents, plus critics, plus the market viability panel, plus voice-guard. Showing all of them at once turns the screen into a cockpit and the user into a passenger. At any moment, exactly **one** agent is foregrounded (the current stage's primary). Others are accessible via the Agent Roundtable drawer — a right-edge panel, collapsed by default, that opens on demand. The user is the author; agents are the writing room.

### 1.5 Accessibility floor (minimum viable, not WCAG-certified)
v1 is a single-user tool for Chris, but we respect universal design as craft. Minimum floor:
- No information is encoded by color alone. Every colored signal pairs with a shape and a word.
- Contrast ratio ≥ 4.5:1 for all text; ≥ 3:1 for large text and interactive elements.
- All interactive elements reachable by keyboard; focus ring is 2px solid with a 1px offset, never removed.
- Motion respects `prefers-reduced-motion`.

We do not pursue WCAG certification in v1. We pursue the habits of it.

---

## 2. Information Architecture

### 2.1 Top-level routes (sitemap)
```
/                         → Book list (one book in v1; becomes dashboard later)
/books/[slug]             → Spine view (the home surface)
/books/[slug]/stage/[n]   → Stage editor (n = 1..11)
/books/[slug]/artifacts   → Artifact mirror browser (read-only view of disk artifacts)
/books/[slug]/timeline    → Observability timeline (workflow runs, costs, LLM calls)
/books/[slug]/override    → Override log (all gate and voice-guard overrides with rationale)
/settings/personas        → Voice persona registry (Drucker, Elon in v1)
```

### 2.2 The spine view as the home surface (John's Q1 answered)
**Decision: Vertical list of 11 stages, with visual grouping that groups 1–4, 5–9, 10–11, but never collapses them.**

The condensed thinker does not want hidden drawers. He wants the whole arc visible — the full eleven-vertebra spine, end to end, from the first moment he opens the book. Collapsing stages behind accordion headers is a condensation move. We refuse it.

But we do *group* them visually with a thin left-edge gutter color: cool grey for **Setup** (1–4), warm ochre for **Material** (5–9), deep indigo for **Production** (10–11). The stages remain always visible; the gutter tells you where you are in the arc.

This matches the condensed-thinker mental model because he already thinks in *full arcs*, not phases. Showing the arc is showing the respect. Hiding stages until you "earn" them is gamification, and this user hates being gamified.

### 2.3 Stage editor patterns (shared shell vs. per-stage)
**Shared shell, per-stage body.** Every stage editor has:
- A common header (stage number, stage name, lifecycle pill — DRAFT / REVIEW_READY / COMMITTED, cost-so-far, back-to-spine link)
- A common right-edge Agent Roundtable drawer (collapsed by default)
- A common footer action bar (Save Draft / Mark Review Ready / Commit / Regenerate)
- A unique body per stage (the artifact surface — this is where each stage earns its personality)

This gives the user the security of a familiar chassis with the honesty of a genuinely different interior per stage.

### 2.4 Navigation model
The spine *is* the nav. No global tab chrome. No breadcrumbs (stage editors show their position in the header and in the left-edge gutter). Back-to-spine is always one click from anywhere in a stage editor. The user's mental model is: I am in the spine, or I am inside a vertebra. There is no third place.

---

## 3. The Spine View (v1 Hero Screen)

### 3.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  GHOSTWRITR      Book: "The Grief of the Unchosen Life"      │
│                  Cost so far: $12.40 / $40 ceiling    ▓▓▓░░░ │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ▌1  Seed Capture          ◆ COMMITTED     1 artifact  [>]   │
│ ▌2  Voice Fingerprint     ◆ COMMITTED     3 artifacts [>]   │
│ ▌3  KB Ingestion          ◆ COMMITTED    47 artifacts [>]   │
│ ▌4  Market Viability      ● REVIEW READY  1 verdict   [>]   │
│ ░                                                            │
│ ▌5  Big-Ideas Discovery   ◑ IN PROGRESS   6 artifacts [>]   │
│ ▌6  Outline               ○ ACTIVE        — artifacts [>]   │
│ ▌7  Personal Stories      — LOCKED                          │
│ ▌8  Paragraph Topics      — LOCKED                          │
│ ▌9  Evidence & Grounding  — LOCKED                          │
│ ░                                                            │
│ ▌10 Chapter Draft         — LOCKED                          │
│ ▌11 Typeset               — LOCKED                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Stages 1–4 have the cool-grey left gutter, 5–9 the ochre, 10–11 the indigo. The faint `░` rows between groups are breathing room, not dividers.

### 3.2 Visual states per stage
Six states, each with a distinct shape + color + word. No state uses color alone.

| State | Shape | Color | Word |
|---|---|---|---|
| Locked | em-dash `—` | neutral 400 | "LOCKED" |
| Active | hollow circle `○` | indigo 500 | "ACTIVE" |
| In-progress | half-filled circle `◑` | amber 500 | "IN PROGRESS" |
| Review ready | filled circle `●` | blue 600 | "REVIEW READY" |
| Committed | filled diamond `◆` | green 700 | "COMMITTED" |
| Refused | filled triangle `▲` | magenta 600 | "REFUSED — SEE DIAGNOSIS" |

Magenta (not red) for refusal because red reads as failure; magenta reads as *attention, not shame*.

### 3.3 Gate verdict display (John's Q2 answered)
**Decision: Shape + color + icon triad, never color alone.**

The three gate verdicts:
- **Viable** → filled diamond `◆`, green 700, check-glyph
- **Borderline** → filled circle `●`, amber 500, half-glyph
- **Refused** → filled triangle `▲`, magenta 600, stethoscope-glyph

The triangle is deliberate. In every culture tested, a point-up triangle reads as "look here" more strongly than it reads as "bad." The stethoscope glyph continues the diagnostic-not-punitive metaphor established in the Diagnosis Room.

Every verdict pill also carries its literal word — "Viable," "Borderline," "Refused — see diagnosis" — so a screen reader or a color-blind user gets the same signal through three redundant channels: shape, color, text.

### 3.4 Artifact count indicator per stage
Right-aligned, in the stage row, stated in human units: "47 snippets," "6 big ideas," "1 verdict," "— artifacts" for locked stages. The count grows as the stage fills. This is the user seeing muscle accrue.

### 3.5 Deep-link interaction
- Click a committed stage → opens it read-only, with a "Reopen" affordance (requires confirmation; creates a new workflow run)
- Click the active stage → opens the editor in draft mode
- Click a locked stage → shakes the row gently and surfaces a caption: *"Unlocks when Stage N commits."* No scolding. Just the rule.
- Click a refused stage → opens the Diagnosis Room directly, not the editor

### 3.6 Cost rollup placement
Top-right of the header, always visible: `$12.40 / $40 ceiling` plus a thin progress bar. Color progression: neutral → amber at 75% → magenta at 95%. Clicking the rollup opens the observability timeline filtered to cost. The $40 claim is a product promise; we treat it like one.

---

## 4. Per-Stage UX Specifications

### Stage 1 — Seed Capture
**Route:** `/books/[slug]/stage/1` · **Pattern:** single large textarea with live character count that reads *up*, not down. **Condensation-resistance move:** the textarea has a *minimum* not a maximum — below 400 characters the Commit button is disabled, with caption *"Say more. The seed needs room."* The field auto-grows; there is no scrollbar.

### Stage 2 — Voice Fingerprint Studio
**Route:** `/stage/2` · **Pattern:** 3-column layout (cadence samples · lexical quirks · forbidden moves). **Condensation-resistance:** forbidden-moves column is the *largest* — the user lists what this book must NEVER sound like, and that list is treated as canonical. Framework-aware voice (Drucker/Elon) is selected here; selection preview shows a diff between "your voice" and "your voice + persona lens."

### Stage 3 — KB Ingestion
**Route:** `/stage/3` · **Pattern:** drop-zone above a scrolling list of ingested snippets. **Condensation-resistance:** snippets render *full-length*, never truncated with "…". The user sees the raw thickness of their knowledge. A snippet-count grows in real time during ingestion — the page literally gets taller as you upload.

### Stage 4 — Market Viability Gate
**Route:** `/stage/4` · **Pattern:** the Diagnosis Room (see §5.3). **Condensation-resistance:** the verdict arrives with its full 11-dimension breakdown, never as a single score. If the user tries to skip to the number, the radar chart draws itself *first* and the number arrives last.

### Stage 5 — Big-Ideas Discovery
**Route:** `/stage/5` · **Pattern:** a vertical stack of candidate big ideas, each a card with provenance back to KB snippets. **Condensation-resistance:** the user cannot promote fewer than three big ideas. Three is the floor; the button doesn't light until three are selected. Scarcity fights scarcity.

### Stage 6 — Outline (KB-first)
**Route:** `/stage/6` · **Pattern:** tree view, chapters → sections, each node tagged with ME-WE-TRUTH-YOU-WE beats. **Condensation-resistance:** each chapter must cite ≥ 2 KB snippets before it can commit (see §7). The tree starts wider than it needs to be; pruning is an explicit action, never a default.

### Stage 7 — Personal Stories Campfire
**Route:** `/stage/7` · **Pattern:** card grid with a "story needed here" slot attached to each chapter beat. **Condensation-resistance:** empty slots glow faintly amber — they are *hungry*. The user is pulled toward telling more stories, not fewer.

### Stage 8 — Paragraph Topics Hunger Board
**Route:** `/stage/8` · **Pattern:** kanban-style board, one column per chapter, cards are paragraph topics. **Condensation-resistance:** columns have a *minimum* card count (≥ 8 per chapter) with a hunger-bar per column filling toward the minimum. Below minimum, the column gently pulses.

### Stage 9 — Evidence & Grounding
**Route:** `/stage/9` · **Pattern:** per-chapter evidence tray; citations, quotes, references attached to paragraph topics. **Condensation-resistance:** topics without evidence show a dotted outline until grounded. The undotted state is the celebration.

### Stage 10 — Chapter Draft (Voice-guarded)
**Route:** `/stage/10` · **Pattern:** chapter editor with inline voice-guard verdict badges (see §6). **Condensation-resistance:** the editor does not show a word-count-down toward a target; it shows *scene count* and *paragraph depth* — units that reward expansion.

### Stage 11 — Typeset
**Route:** `/stage/11` · **Pattern:** preview pane + format selector + download. **Condensation-resistance:** the preview renders at true page size. You can see your eighty thousand words as two hundred printed pages. This is the final anti-condensation gesture: the artifact has mass.

---

## 5. The Three Gate Journeys (UI)

### 5.1 Viable — green-light flow, minimal ceremony
Verdict arrives as a modest diamond badge at the top of the gate screen. Single sentence: *"Viable. 4.1/5 across dimensions. Proceed to Stage 5 when ready."* A "Commit and advance" CTA sits below. The radar chart is present but collapsed by default — the user can expand it to see dimension detail, but we don't make them. Quiet victory. No confetti. Condensed thinkers hate confetti.

### 5.2 Borderline — the diagnostic moment
Verdict arrives with the radar chart *open by default*. The user sees which dimensions are strong (3.5+) and which are weak. Below the chart, a "Three moves that would lift this to Viable" panel, each move actionable (e.g., *"Sharpen the audience definition in your seed — currently scoring 2.8 on audience specificity"*). Two CTAs of equal visual weight: "Revise the seed" and "Proceed anyway (logged)." Neither is styled as the hero; the user chooses.

### 5.3 Refused — the Diagnosis Room
This is the moment that most defines GHOSTWRITR's soul. The screen:
- A calm header: *"This book's current framing did not clear the viability floor. Here is the diagnosis."*
- A dial showing the composite score with the 3.5 floor marked in indigo
- A radar chart showing all 11 dimensions
- A "Neighboring books" panel: three published books that *would* clear this gate on the same topic — not as competitors, as evidence that the topic is viable if reframed
- A "Three reframes" panel with specific, actionable rewrites of the seed
- At the bottom, a dignified **"Proceed anyway — I know something the machine doesn't"** button, same visual weight as "Revise the seed"

The override button is never a hidden dev-tool. It is equal-dignity. It logs to the override ledger (§2.1) with a required rationale textarea ≥ 100 characters.

---

## 6. Voice-Guard Verdict UX (Stage 10)

### 6.1 Badge placement (John's Q3 answered)
**Decision: Inline with the draft, at paragraph granularity, with a chapter-level summary banner at the top.**

The sidebar is where context goes to die. A banner alone treats the whole chapter as one thing when voice drift is paragraph-scale. Inline badges at the right margin of each paragraph (a thin 24px gutter) let the user see voice drift *locally* — the paragraph where Drucker started sounding like a LinkedIn post. The chapter-level summary banner at the top gives the global read: *"3 paragraphs soft-fail, 1 hard-fail, 14 pass."* Both. Not either.

### 6.2 Three verdict states
- **Pass** → small green check in the right gutter, no banner weight. Invisible unless you look for it.
- **Soft-fail** → amber half-circle, hover reveals the critic's note. *"This paragraph drifts from Drucker's cadence — sentences are too uniform in length."*
- **Hard-fail** → magenta triangle, *always* expanded inline below the paragraph with the critic's note and the "Regenerate with these notes" CTA.

### 6.3 Regenerate-with-critic-notes CTA
Below any hard-fail (and available on-click for soft-fails), a primary button: **"Regenerate this paragraph with critic notes."** Clicking shows the exact prompt delta that will be sent to the author agent — *"The critic flagged X and Y; regenerate addressing these while keeping Z intact."* Transparency is the feature; the user sees the instruction the machine is about to receive. One-click regenerate; new version renders with a diff toggle.

### 6.4 Override path
Every verdict can be overridden. Next to "Regenerate," a quieter secondary action: **"Accept as-is (override logged)."** Clicking requires a one-line rationale. Overrides appear in the override ledger and show a small dot in the paragraph gutter forever, so the author can find their overrides later when re-reading. Overrides are not hidden; they are *remembered*.

---

## 7. KB-Source Provenance (John's Q4 answered)

### 7.1 Where it appears
**Decision: Inline chip for primary citations, expandable panel for full snippet context.**

Tooltips are invisible on touch, inaccessible to screen readers without extra work, and — most importantly — *optional*. Provenance for a KB-first outlining system cannot be optional. Inline chips right beside each outline node, stated in the flow of the page: `[KB: "Grief is..." + 2 more]`. Clicking a chip expands an in-place panel showing the full snippet(s), with file name and line reference, so the author can verify the link back to their own voice.

### 7.2 Interaction weight
The chip is not decorative. It is a *first-class control*: tab-focusable, keyboard-openable, ARIA-labeled *"KB sources, 3, expandable."* The author is the editor of their own provenance; they can unlink a snippet from an outline node if the AI misattributed.

### 7.3 Failure state — no KB source attributed
An outline chapter with zero KB citations shows a dotted magenta outline and the caption *"This chapter is not yet grounded in your knowledge base. It will not commit until ≥ 2 sources attach."* Grounding is a hard-fail at commit time, not at draft time. The author can write speculatively, but cannot ship speculatively.

---

## 8. Typesetting Output (John's Q5 answered)

### 8.1 Format choice with defense
**Decision: Both PDF and EPUB. PDF is the default download. EPUB is one click away.**

PDF because the condensed thinker needs to *feel the mass* of the thing — to print it, to hand it to someone, to see two hundred pages on a desk. This is the final anti-condensation gesture. A book you cannot hold is a book you can still compress.

EPUB because v1's reference book is meant to ship, and shipping means reflowable text for real readers. Omitting EPUB cripples the product claim.

PDF is default because the primary user — Chris — is shipping for review, not retail, in v1.

### 8.2 Download flow
Stage 11 shows a preview pane (§8.3) with a format selector: **PDF** (pre-selected) / **EPUB**. Below, a single action: *"Generate and download."* Generation takes time; a progress strip shows stage (typesetting → rendering → packaging). The finished artifact writes to the disk mirror and triggers a browser download simultaneously.

### 8.3 Preview before download
The preview is a scrollable, true-page-size render of the first chapter. Not the whole book (too slow). Enough to verify typography, spacing, and cover. A "preview full book" link generates a low-res draft for verification; the final download is high-res.

---

## 9. Component Inventory (v1)

### Spine components
- **SpineStageRow** — one vertebra in the spine. *States:* locked, active, in-progress, review-ready, committed, refused, blocked.
- **SpineGroupGutter** — the cool-grey / ochre / indigo left edge. *States:* current-group highlighted, others muted.
- **SpineHeader** — book title, cost rollup, ceiling bar.
- **CostRollupPill** — `$x.xx / $40` with progress bar and color progression.

### Stage-editor components
- **StageShellHeader** — stage number, name, lifecycle pill, cost-so-far, back-to-spine.
- **LifecyclePill** — DRAFT / REVIEW_READY / COMMITTED. *States:* the three literal values.
- **StageFooterActionBar** — Save / Mark Review Ready / Commit / Regenerate.
- **ArtifactMirrorLink** — deep link from any artifact into its disk path.

### Gate/verdict components
- **GateVerdictBadge** — shape + color + word triad.
- **DiagnosisRoomDial** — composite score with 3.5 floor.
- **DiagnosisRadarChart** — 11-dimension breakdown.
- **NeighborBookCard** — similar viable book with reason.
- **ReframePanelItem** — one actionable rewrite suggestion.
- **OverrideButton** — equal-dignity refusal-override with rationale modal.
- **VoiceVerdictInline** — pass / soft-fail / hard-fail per paragraph.
- **VoiceVerdictBanner** — chapter-level roll-up.
- **RegenerateWithNotesCTA** — shows prompt delta; one-click execute.

### Artifact-inspector components
- **KBProvenanceChip** — inline citation chip, expandable.
- **KBSnippetPanel** — expanded snippet with file reference.
- **ArtifactCountBadge** — the "47 snippets" style counter.
- **ArtifactDiffViewer** — for regenerations.

### Cost/observability components
- **TimelineEvent** — one workflow-run event with agent, cost, duration.
- **CostBreakdownChart** — per-stage cost over time.
- **OverrideLedgerRow** — one logged override with rationale.
- **AgentRoundtableDrawer** — right-edge collapsible panel listing all agents active in current context.

---

## 10. Design System Primitives

### 10.1 Color palette
Semantic only; no decorative color.

| Role | Token | Hex | Use |
|---|---|---|---|
| Ink | `ink-900` | `#0F1724` | body text |
| Paper | `paper-50` | `#FAFAF7` | canvas |
| Neutral | `neutral-400` / `700` | `#94A3B8` / `#334155` | locked states, muted UI |
| Setup gutter | `setup-500` | `#64748B` | stages 1–4 |
| Material gutter | `material-500` | `#B8793A` | stages 5–9 |
| Production gutter | `production-500` | `#3730A3` | stages 10–11 |
| Success | `green-700` | `#15803D` | committed / pass / viable |
| Attention | `amber-500` | `#F59E0B` | in-progress / soft-fail / borderline |
| Advance | `blue-600` | `#2563EB` | review-ready |
| Diagnostic | `magenta-600` | `#C026D3` | refused / hard-fail / override-dot |

All text-on-color combinations verified ≥ 4.5:1. Magenta replaces red; red is reserved for true destructive actions (delete book) only.

### 10.2 Typography scale
- **Display** — Inter 700, 32/40 — book title only
- **H1** — Inter 600, 24/32 — stage names
- **H2** — Inter 600, 18/28 — section titles inside a stage
- **Body** — Inter 400, 15/24 — UI copy
- **Prose** — Source Serif 4, 17/28 — chapter drafts (the book's own text renders in serif to signal "this is the artifact")
- **Mono** — JetBrains Mono 400, 13/20 — artifact paths, model IDs, cost figures

Serif for prose is not decorative. It's a signal: *this region of the screen is the book.*

### 10.3 Spacing and rhythm
4px base unit. Compositions use 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Stage rows are 64px tall. The spine view breathes — `paper-50` field with 48px horizontal padding.

### 10.4 Iconography philosophy
**Shape-first, color-second.** Gate verdicts use: diamond (committed), circle (review), half-circle (in-progress), triangle (refused), dash (locked). Every icon is distinguishable in monochrome. Glyph library is a small custom set of ~20 icons — stethoscope (diagnosis), campfire (stories), tree (outline), scales (market), fingerprint (voice). Not Material, not Feather — custom because the metaphors are specific.

### 10.5 Motion
Five transitions, and that is all:
- **Spine-row state change** — 200ms ease-out color + shape crossfade
- **Gate verdict arrival** — 400ms reveal with radar chart drawing itself first
- **Locked-row shake** — 180ms 3-cycle micro-shake on click-to-locked
- **Stage artifact accrual** — number counting up, 300ms
- **Drawer open/close** — 220ms ease-in-out slide

All honor `prefers-reduced-motion`: replaced with instant state change.

---

## 11. Explicit Anti-patterns (UX edition)

- **No percent-complete bars on the book.** A book is not a download. We show artifact mass instead.
- **No celebration confetti on commits.** Condensed thinkers find celebration patronizing. A calm state change is the reward.
- **No "simplify" or "summarize" buttons anywhere.** Ever. Not in the editor, not in the outline, not in the draft.
- **No word-count targets that count down.** We count up, toward mass, toward thickness.
- **No red/green color-only signaling.** Shape + color + word, always.
- **No accordion-collapsed stages in the spine.** Full arc always visible.
- **No hidden override buttons.** Overrides are equal-dignity and logged.
- **No toast notifications for verdicts.** Verdicts live in the surface, not in ephemeral corners.
- **No modal dialogs for anything except destructive actions.** In-place expansion is the default.
- **No avatars or personas styled as characters.** Agents are tools with voices, not mascots. (The Agent Roundtable drawer lists roles, not cartoon faces.)
- **No dark mode in v1.** One canvas. One rhythm. Dark mode is a v2 investment.

---

## 12. Open Questions for Amelia (Dev)

1. **Spine real-time updates** — when a workflow run in Stage N advances, should the SpineStageRow state update via server-sent events, WebSocket, or poll? I want the spine to feel *alive*; you pick the mechanism.
2. **Artifact mirror binding** — each artifact card needs a stable deep link to disk. Is the disk path the canonical ID, or do we route through a DB ID that resolves to path? Affects `ArtifactMirrorLink` component contract.
3. **Voice-guard paragraph granularity** — critic operates at paragraph or sentence level? Inline badges are designed for paragraph; if critic is sentence-level, we need to re-spec the gutter density.
4. **Override ledger storage** — is the override log a DB table, a disk-mirrored artifact, or both? Affects `OverrideLedgerRow` data contract and whether overrides survive a KB re-ingest.
5. **PDF vs EPUB generation cost** — does generating both count twice against the $40 ceiling, or is typesetting flat-cost? Affects cost-rollup accuracy and whether Stage 11 should warn before EPUB generation.
