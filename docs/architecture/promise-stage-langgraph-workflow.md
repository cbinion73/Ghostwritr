# Promise Stage LangGraph Workflow

## Purpose

This document defines how LangGraph should orchestrate the `Promise` stage for GHOSTWRITR.

The Promise stage is a collaborative workflow, not a one-shot generation.
It combines conversation, extraction, analysis, recommendation, and human approval.

## Why LangGraph Fits

Use LangGraph because the Promise stage needs:

- stateful multi-step execution
- resumability across user edits and approvals
- deterministic steps mixed with LLM steps
- branching and retries
- human-in-the-loop checkpoints

LangChain should be used inside nodes for:

- OpenAI model invocation
- structured outputs
- retrieval from stored references
- tool wrappers for web research

## State Shape

Recommended graph state:

```ts
type PromiseStageState = {
  bookId: string;
  stageId: string;
  activeConversationId: string | null;
  userInput: string | null;
  conversationMessages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  extractedPromise: {
    workingTitle?: string;
    audiencePrimary?: string;
    bigIdea?: string;
    coreTruth?: string;
    transformation?: string;
    promiseStatement?: string;
    differentiation?: string;
  } | null;
  personaPackId: string | null;
  marketReportId: string | null;
  scorecardId: string | null;
  recommendationsId: string | null;
  unresolvedQuestions: string[];
  analysisFlags: string[];
  commitReady: boolean;
  commitRequested: boolean;
  runId: string;
};
```

## Node Responsibilities

### 1. `load_context`

Load the current Promise-stage context from Postgres and retrieval.

Reads:

- current book data
- prior promise versions
- prompt archive references
- communication framework notes
- existing persona and market artifacts

Outputs:

- hydrated graph state

### 2. `append_user_message`

Adds the latest user refinement to the conversation artifact.

Writes:

- new message record or updated conversation version

### 3. `generate_promise_reply`

Uses OpenAI to continue the collaborative promise conversation.

Goals:

- respond naturally in chat form
- sharpen the idea
- identify ambiguity
- preserve user intent
- suggest stronger positioning where needed

Expected output:

- assistant conversational reply

### 4. `extract_promise_fields`

Runs structured extraction after each meaningful turn.

Expected schema:

- working title
- audience
- reader problem
- big idea
- core truth
- transformation
- differentiation
- promise statement
- unresolved questions

This node should write a new `promise_brief` draft version when extraction changes materially.

### 5. `score_promise`

Uses the extracted promise to score:

- clarity
- audience fit
- distinctiveness
- commercial pull
- credibility

This step should produce a structured scorecard artifact.

### 6. `needs_market_refresh`

Deterministic router.

If audience, category, or differentiation changed materially, route to market refresh.
Otherwise skip.

### 7. `run_persona_analysis`

Uses OpenAI plus retrieval and optional web research to produce or refresh personas.

Outputs:

- persona pack artifact

### 8. `run_market_analysis`

Uses web research plus LLM synthesis to assess:

- category and positioning landscape
- comparable titles
- reader demand signals
- differentiation opportunities
- commercial risks

Outputs:

- market report artifact

### 9. `generate_recommendations`

Combines promise extraction, personas, and market analysis into concrete recommendations.

Examples:

- narrow audience
- reframe promise
- strengthen emotional outcome
- clarify title direction

Outputs:

- positioning recommendations artifact

### 10. `compute_commit_readiness`

Deterministic validation node.

Checks that:

- promise statement exists
- audience exists
- transformation is explicit
- core truth exists
- scorecard exists
- market and persona analyses are present when required

Sets:

- `commitReady = true | false`

### 11. `human_review`

This is the checkpoint where the user:

- keeps refining
- accepts parts of the current direction
- requests market re-run
- commits the stage

The graph should pause here and resume on user input.

### 12. `commit_stage`

Commits selected Promise-stage artifacts.

Writes:

- mark artifact versions as committed
- update `book_stages`
- create commit decision
- publish downstream reference bundle

## Graph Flow

Recommended high-level flow:

```text
load_context
  -> append_user_message
  -> generate_promise_reply
  -> extract_promise_fields
  -> score_promise
  -> needs_market_refresh
      -> run_persona_analysis
      -> run_market_analysis
      -> generate_recommendations
  -> compute_commit_readiness
  -> human_review
      -> append_user_message     (if refining)
      -> run_market_analysis     (if user requests refresh)
      -> commit_stage            (if approved)
```

## Human-in-the-Loop Behavior

The Promise stage should pause at review boundaries.

Important rule:

- LangGraph handles orchestration
- the user stays in control of commitment

This is critical because promise quality affects every downstream stage.

## Prompting Strategy

Separate prompt layers:

- `conversation system prompt`
  Shapes the back-and-forth refinement behavior.
- `structured extraction prompt`
  Produces normalized promise fields.
- `scorecard prompt`
  Produces evaluation scores and rationale.
- `persona prompt`
  Produces audience profiles.
- `market prompt`
  Produces market and positioning analysis.

These prompts should be versioned and stored, not embedded invisibly in code.

## OpenAI Role

OpenAI should be the primary model provider for:

- promise conversation
- extraction
- scoring
- persona synthesis
- market synthesis
- positioning recommendations

Guideline:

- use structured outputs wherever possible
- avoid parsing free-form prose when fields can be schema-validated

## Web Research Role

The market analysis node should use a bounded web-research toolchain.

Required outputs per source:

- url
- title
- author or publisher
- publication date when available
- retrieval date
- short relevance note
- extracted evidence snippets

Web-derived findings should be stored as source-backed artifacts, not ephemeral chat context.

## Failure and Retry Rules

If a node fails:

- retry transient provider errors automatically
- preserve partial artifacts
- mark the workflow run as `failed` only after retries are exhausted
- return the user to the stage with visible failure context

If web research is incomplete:

- surface the limitation in the market report
- do not pretend analysis is stronger than the evidence

## Commit Semantics

When the user clicks `Commit Promise`, the system should commit a bundle, not just one field.

Commit bundle:

- promise brief
- scorecard
- latest accepted persona pack
- latest accepted market report
- latest accepted recommendations

The bundle becomes the downstream reference set for:

- Outline
- Base Story
- Research planning
- Positioning-sensitive editorial checks

## UI Build Target for Step 1

After the data model and workflow are in place, the first real UI implementation should include:

- left rail for stages
- central promise chat
- structured promise card
- persona and market side panels
- scorecard
- commit action
- manuscript-style approved promise preview

The prototype at `/Users/chris/Desktop/GHOSTWRITR/prototypes/promise-stage.html` should be treated as the visual direction, not the final implementation.

## Implementation Order

Recommended order:

1. create Postgres schema and persistence layer
2. create artifact/version services
3. create Promise-stage LangGraph graph
4. create OpenAI gateway and structured schemas
5. create web research service for market analysis
6. implement the Promise-stage UI
7. wire commit and downstream artifact publishing

## Non-Negotiable Product Rules

- The user can refine the promise conversationally before anything is committed.
- The promise stage stores both chat history and normalized artifact fields.
- Market and persona outputs are separate artifacts, not hidden model thoughts.
- Commit is explicit and versioned.
- Downstream stages only consume committed upstream promise artifacts by default.
