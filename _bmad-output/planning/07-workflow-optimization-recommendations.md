# Workflow Optimization Recommendations (deferred — not yet implemented)

Recorded 2026-07-03, alongside the cost/logging + publishing-house UX pass.
These change pipeline *semantics* and were deliberately deferred; each is
low-effort but should be done as its own reviewed change.

## 1. Parallelize independent material stages

Per `src/lib/workflow-dependencies.ts`, RESEARCH, EXTERNAL_STORIES, and
PERSONAL_STORIES are mutually independent — none appears in another's
downstream set. Autopilot (`continueWorkflowAutomationIfEnabled`) currently
runs them sequentially. Running all three concurrently after BASE_STORY
commits would cut per-book wall-clock substantially with no quality impact.

(Update 2026-07-03: the standalone AUDIENCE stage was removed — it was a
redundant display layer over Promise's own internal audience phase. This
item now applies only to RESEARCH/EXTERNAL_STORIES/PERSONAL_STORIES.)

Implementation sketch: in `workflow-automation.ts`, when advancing past
BASE_STORY, enqueue all three material stages (createWorkflowRun ×3 +
triggerWorkflowRunInBackground ×3) instead of the next-in-order stage only.
The stage-status model already tolerates concurrent RUNNING stages.

## 2. Anthropic Batch API for background stages

`getAnthropicBatchClient()` exists in `src/lib/llm/providers.ts` and is
unused. Research verification and external-story extraction run in
background workers where nobody is waiting — Batch API pricing is 50% off.
Revisit after measuring the prompt-caching savings from this pass (the two
optimizations overlap; caching may make batch marginal for some roles).
Gate it behind an env flag (e.g. `LLM_USE_BATCH=1`) so it can be disabled
without a deploy.

## 3. Cheaper retry tiers on gate-fail loops

Gate retries (gateRetry in `src/lib/workflows/types.ts` consumers) re-run at
the same model tier as the first attempt. Consider dropping intermediate
retries to the next tier down and only using the full-price model for the
final accepted pass. Needs quality measurement before adopting.

## 4. QA regression fixtures

`qa:artifact-contracts` and `qa:stale-dependencies` currently fail on any
database that lacks the seeded fixture books (e.g. `fiction-smoke`). Add a
seed script (or make the suites create-and-clean their own fixtures) so the
suites are runnable on a fresh clone. Also consider routing QA-suite LLM
calls to Haiku via the `LLM_*` env overrides to cut CI cost.

## 5. Promise stage should create WorkflowRun rows

The Promise stage runs inline via server actions with only an in-memory
running flag (`src/lib/workflow-status.ts`, 5-min TTL). Migrating it to the
WorkflowRun model would give it durable status, cost attribution per run
(LLMCallLog.workflowRunId), and full activity-ticker visibility without the
in-memory bridge added in this pass.

## 6. Research/External-Story granular tables are dead code (found 2026-07-03)

While building the digital-brain linked-notes view (`src/lib/repositories/
chapter-linked-notes.ts`), live inspection found that `ResearchItem`,
`ResearchSource`, `ExternalStoryItem`, and `ExternalStorySource` are 100%
empty across the database — all 79 `RESEARCH_PACK` and all 54
`EXTERNAL_STORY_PACK` artifacts store their dossier as a single free-text
blob (`contentJson: {text}`), not the structured per-fact rows the schema
and types (`ChapterResearchDossier`, `ChapterExternalStoryDossier`) imply.
The write path (`createResearchPackVersion`'s source/item inserts) exists
and works, but nothing in `src/lib/workflows/research.ts` or
`external-stories.ts` actually calls it with populated `sources`/`items`.

Two directions, not both:
- **Wire up the structured writes** — have the research/external-stories
  workflows actually populate `sources`/`items` when a chapter's dossier is
  generated. This unlocks per-fact tier/verification badges and precise
  backlinks in the linked-notes view (currently falls back to one coarse
  dossier-text note per chapter, which works but isn't granular).
- **Or formally retire the structured tables** if the free-text dossier is
  the intended format going forward — remove the unused models and the
  dead write path, rather than carrying schema nobody populates.

## 7. Citation-trace for chapter drafts

`ChapterDraftBundle.sourceUsage` records which research/stories a chapter
*cites* as plain strings (claim text, story titles), not item IDs — so it's
currently impossible to distinguish "available to this chapter" from
"actually used in the finished prose." Fixing this needs a small change to
the structured-output `DraftSchema` (in `src/lib/artifact-schemas.ts`) plus
a prompt tweak so the model returns IDs instead of text. This would let the
digital-brain view (once item #6 above is resolved) show which specific
facts and stories made it into the manuscript versus were left on the
table.
