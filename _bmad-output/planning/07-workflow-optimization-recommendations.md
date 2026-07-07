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

## 8. Stage-run status is not trustworthy (found 2026-07-07, live production debugging)

While regenerating Research + External Stories for the "Dust" book under
the new biblical lens, the run-status UI (stage panel, chapter workspace
banner) repeatedly showed a state that did not match reality, and the only
way to get ground truth was direct production database queries. Three
distinct failure modes hit in one session:

- **Stuck "running" forever after cancel.** Both `runFullResearchWorkflow`
  and `runFullExternalStoriesWorkflow` returned early on cancellation
  without ever calling `updateStageForBook` — fixed in commit `39821eb`,
  but this class of bug (a code path that mutates `BookStage.status` in
  most branches but not all) is easy to reintroduce anywhere the same
  three-part pattern (start / per-chapter update / final update) is
  hand-rolled per workflow file instead of shared.
- **`BookStage.metadataJson` has no source-of-truth link to `WorkflowRun`.**
  It's a mutable blob any code path can write to — including a one-off
  diagnostic script calling `runChapterExternalStoriesWorkflow` directly
  for an A/B test, which left the shared stage row showing `IN_PROGRESS`
  with no corresponding `WorkflowRun` ever created. The UI had no way to
  detect "this looks like a run but isn't one" and neither did the author.
- **The stage panel does not auto-refresh.** It showed "Stage state:
  running / Working on: Chapter 8" with an explicit "Refresh manually to
  see the latest progress" caption — meaning the default experience is a
  stale snapshot from page load, not a live view, so "is it actually
  running right now" could not be answered without a manual reload (or,
  in practice, without me running raw SQL on production).

Net effect: the author could not distinguish running / idle / stale from
the UI alone, for either question ("is it doing anything") or ("are the
numbers I'm looking at current"), across a multi-hour real generation run.

**Implementation sketch:**

1. Make `WorkflowRun` (not `BookStage.metadataJson`) the authority for
   "is a run active." The stage panel should query for a `QUEUED`/`RUNNING`
   run row for the stage and render "no active run" when none exists,
   regardless of what `metadataJson.automationStatus` last said.
2. Auto-poll (short interval, e.g. 3–5s) or subscribe while a run is
   active; stop polling and show a static "idle" state otherwise. No
   "refresh manually" caption should ever be needed.
3. Add a staleness check: if a `RUNNING` row's stage hasn't pulsed
   (`updateStageForBook`/`pulse*Stage` call) in longer than some threshold
   (e.g. 3x the typical per-chapter duration), surface it as "possibly
   stuck" rather than a plain "running" — this is exactly the state that
   hid the orphaned run from 2026-07-06.
4. Surface live cost/tokens per run in the panel itself, pulling from
   `LLMCallLog` grouped by `workflowRunId` (requires the workflows to
   actually pass `workflowRunId` through to `logLLMCall` — currently only
   true when called via the internal API route's `runWithLLMContext`
   wrapper, not when a workflow function is invoked directly). This
   removes the need to hand-query the production database to answer "what
   has this run cost so far."
5. Consider a lightweight guard (or at least a documented convention) so
   ad-hoc diagnostic scripts calling workflow functions directly don't
   silently mutate shared `BookStage` display state without a real
   `WorkflowRun` backing them — e.g. require an explicit `runId` parameter
   with no default, or log a loud warning when one isn't provided.

This belongs under the P0 "Trust the machine" epic in
`06-delivery-backlog.md` — it's the same category of stale-state/validation
gap the epic already targets, just discovered against a real production run
rather than in the abstract.
