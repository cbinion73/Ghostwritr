# Promise Stage Data Model

## Purpose

This document defines the storage architecture for the `Promise` stage of GHOSTWRITR.

The Promise stage is not a single text field. It is a versioned editorial workspace that combines:

- conversational refinement
- structured promise extraction
- audience persona development
- market analysis
- positioning recommendations
- human decisions
- approval and commit

The system must support multiple books in flight at the same time.

## Storage Strategy

Use four storage layers:

- `Postgres`
  Source of truth for books, stages, artifacts, versions, decisions, and workflow runs.
- `Object storage`
  Stores exported `.docx`, uploaded files, generated reports, snapshots, and extracted source text.
- `pgvector`
  Semantic retrieval over research, prompts, persona notes, market findings, and prior stage outputs.
- `Redis`
  Queueing, transient job state, retries, and rate-limit buffering.

For the Promise stage, Postgres is the primary source of truth.

## Core Concepts

### Book

A top-level project container.

Important fields:

- `id`
- `slug`
- `title_working`
- `status`
- `owner_user_id`
- `created_at`
- `updated_at`

### Stage

Each book has a separate record per stage.

Important fields:

- `id`
- `book_id`
- `stage_key`
- `status`
- `active_artifact_version_id`
- `committed_artifact_version_id`
- `started_at`
- `committed_at`
- `updated_at`

Suggested `stage_key` values:

- `promise`
- `audience`
- `market_analysis`
- `outline`
- `base_story`
- `research`
- `external_stories`
- `personal_stories`
- `chapter_draft`
- `editing`

### Artifact

An artifact is a named output within a stage.

For the Promise phase, we need separate artifacts instead of one blob:

- `promise_brief`
- `promise_chat`
- `persona_pack`
- `market_report`
- `positioning_recommendations`
- `promise_scorecard`

Important fields:

- `id`
- `book_id`
- `stage_id`
- `artifact_type`
- `status`
- `current_version_id`
- `committed_version_id`
- `created_at`
- `updated_at`

### Artifact Version

Every meaningful change creates a version.

Important fields:

- `id`
- `artifact_id`
- `version_number`
- `lifecycle_state`
- `content_json`
- `content_text`
- `summary`
- `created_by_type`
- `created_by_user_id`
- `workflow_run_id`
- `based_on_version_ids`
- `prompt_template_version`
- `model_name`
- `committed_at`
- `created_at`

Suggested `lifecycle_state` values:

- `draft`
- `review_ready`
- `committed`
- `superseded`

## Promise-Specific Structured Data

### `promise_brief.content_json`

Recommended shape:

```json
{
  "working_title": "Working Title Example",
  "subtitle": null,
  "category": "leadership",
  "audience_primary": "professional leaders responsible for measurable outcomes",
  "audience_secondary": [
    "department heads",
    "operations leaders"
  ],
  "reader_problem": "leaders are overwhelmed by complexity, competing priorities, and unclear improvement paths",
  "reader_desire": "clearer thinking, better systems, stronger results",
  "big_idea": "focused clarity turns complexity into practical progress",
  "core_truth": "performance improves when leaders simplify what matters and act on it consistently",
  "transformation_before": "stretched, reactive, and uncertain about what to fix first",
  "transformation_after": "clear, disciplined, and confident about what to do next",
  "differentiation": "a practical system for translating complexity into measurable improvement in real organizations",
  "promise_statement": "This book gives leaders a practical system to simplify complexity, improve results, and lead with clarity people can follow.",
  "stakes": "wasted effort, missed outcomes, lower confidence, and stalled progress",
  "tone": [
    "clear",
    "grounded",
    "practical",
    "credible"
  ],
  "open_questions": [
    "Should the target audience be narrowed further?",
    "What single measurable outcome should the promise emphasize most clearly?"
  ]
}
```

### `promise_chat.content_json`

Recommended shape:

```json
{
  "conversation_id": "uuid",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "rough idea text",
      "created_at": "timestamp"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "refinement response",
      "created_at": "timestamp"
    }
  ],
  "latest_extracted_fields": {
    "big_idea": "clarity matters more than speed"
  }
}
```

### `persona_pack.content_json`

Recommended shape:

```json
{
  "personas": [
    {
      "id": "primary_enterprise_innovation_leader",
      "name": "Innovation Leader",
      "priority": "primary",
      "context": "responsible for evaluating emerging technologies inside a large enterprise",
      "pain_points": [
        "too many vendor pitches",
        "unclear decision criteria",
        "pressure to move fast"
      ],
      "desired_outcomes": [
        "clear prioritization",
        "confidence under uncertainty"
      ],
      "buying_motivations": [
        "practical frameworks",
        "credibility with leadership teams"
      ],
      "language_cues": [
        "decision-making",
        "clarity",
        "alignment",
        "noise"
      ]
    }
  ]
}
```

### `market_report.content_json`

Recommended shape:

```json
{
  "market_category": "leadership / innovation / decision-making",
  "comparison_titles": [
    {
      "title": "Example Comparable",
      "author": "Author Name",
      "why_relevant": "occupies adjacent territory",
      "difference_opportunity": "stronger practical clarity positioning"
    }
  ],
  "saturation_assessment": "moderate",
  "attraction_drivers": [
    "clear pain",
    "timely topic",
    "executive relevance"
  ],
  "commercial_risks": [
    "can sound broad if audience is not narrowed",
    "can blend into generic leadership positioning"
  ],
  "recommendations": [
    "tighten audience definition",
    "preserve emotional relief language"
  ]
}
```

### `promise_scorecard.content_json`

Recommended shape:

```json
{
  "scores": {
    "clarity": 8.6,
    "audience_fit": 8.2,
    "distinctiveness": 7.1,
    "commercial_pull": 7.4,
    "credibility": 8.0
  },
  "strengths": [
    "strong central idea",
    "clear emotional payoff"
  ],
  "concerns": [
    "audience may still be too broad"
  ],
  "next_best_revisions": [
    "increase specificity around reader segment"
  ]
}
```

## Decision and Commit Model

The Promise stage needs explicit human decisions.

### Decision Record

Use a `decisions` table.

Important fields:

- `id`
- `book_id`
- `stage_id`
- `artifact_id`
- `decision_type`
- `decision_value`
- `notes`
- `created_by_user_id`
- `created_at`

Examples:

- accept current audience framing
- reject current subtitle direction
- commit current promise
- request narrower persona set

### Commit Event

Committing the Promise stage should:

1. mark the selected artifact versions as `committed`
2. set `stage.committed_artifact_version_id` for the primary promise artifact
3. snapshot downstream dependency references
4. record a `decision` with type `commit`
5. unlock downstream stages such as `audience`, `market_analysis`, and `outline`

The commit must be reversible through a later superseding commit, not destructive overwrite.

## Suggested Postgres Tables

### `books`

```sql
id uuid primary key
slug text unique not null
title_working text
status text not null
owner_user_id uuid
created_at timestamptz not null
updated_at timestamptz not null
```

### `book_stages`

```sql
id uuid primary key
book_id uuid not null references books(id)
stage_key text not null
status text not null
active_artifact_version_id uuid null
committed_artifact_version_id uuid null
started_at timestamptz null
committed_at timestamptz null
updated_at timestamptz not null
unique(book_id, stage_key)
```

### `artifacts`

```sql
id uuid primary key
book_id uuid not null references books(id)
stage_id uuid not null references book_stages(id)
artifact_type text not null
status text not null
current_version_id uuid null
committed_version_id uuid null
created_at timestamptz not null
updated_at timestamptz not null
```

### `artifact_versions`

```sql
id uuid primary key
artifact_id uuid not null references artifacts(id)
version_number integer not null
lifecycle_state text not null
content_json jsonb not null default '{}'::jsonb
content_text text null
summary text null
created_by_type text not null
created_by_user_id uuid null
workflow_run_id uuid null
based_on_version_ids jsonb not null default '[]'::jsonb
prompt_template_version text null
model_name text null
committed_at timestamptz null
created_at timestamptz not null
unique(artifact_id, version_number)
```

### `decisions`

```sql
id uuid primary key
book_id uuid not null references books(id)
stage_id uuid not null references book_stages(id)
artifact_id uuid null references artifacts(id)
decision_type text not null
decision_value text not null
notes text null
created_by_user_id uuid not null
created_at timestamptz not null
```

### `workflow_runs`

```sql
id uuid primary key
book_id uuid not null references books(id)
stage_id uuid not null references book_stages(id)
run_type text not null
status text not null
input_json jsonb not null default '{}'::jsonb
output_json jsonb not null default '{}'::jsonb
started_at timestamptz not null
finished_at timestamptz null
```

### `source_documents`

```sql
id uuid primary key
book_id uuid null references books(id)
category text not null
title text not null
storage_path text not null
mime_type text not null
source_url text null
metadata_json jsonb not null default '{}'::jsonb
created_at timestamptz not null
```

## Multiple Books in Parallel

This schema supports multiple active books by design.

Isolation happens through:

- `book_id` on all core records
- stage uniqueness per book
- artifact version history scoped to a book and stage
- workflow runs scoped to a book and stage

This means:

- Book A can refine a promise while Book B is in editing
- each book keeps its own committed reference chain
- shared reference documents can remain global when needed

## Retrieval and Reference Use

The Promise stage should be able to retrieve:

- prompt archive references
- communication framework references
- prior promise versions
- saved persona packs
- market analysis outputs
- uploaded user notes

Store embeddings for:

- artifact version summaries
- extracted source text
- market report findings
- persona descriptions

## What Gets Passed Downstream

Once committed, the Promise stage should expose a downstream reference bundle:

- committed promise brief
- latest approved persona pack
- latest approved market report
- latest approved positioning recommendations
- promise scorecard summary

The Outline stage should consume this bundle as read-only input unless the Promise stage is reopened and recommitted.
