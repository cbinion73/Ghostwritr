# Research Stage Data Model

## Purpose

This document defines the storage architecture for the `Research` stage of GHOSTWRITR.

The Research stage is a chapter-by-chapter verification system, not a loose note-taking step.
Its job is to turn a committed chapter outline into a defensible research dossier full of:

- verified facts
- verified figures
- verified examples
- verified quotes
- source metadata
- source tiers
- independent verification results

Only source-backed and independently verified items should be promoted into the chapter dossier.

## Trigger

The Research stage begins only after:

- the section and chapter outline is committed
- the paragraph-level outline is committed, if paragraph-level mapping is required for the chapter

Automation should run one chapter at a time.

## Storage Strategy

Use four storage layers:

- `Postgres`
  Source of truth for chapter dossiers, sources, research items, verification results, workflow runs, and commit decisions.
- `Object storage`
  Stores fetched page snapshots, PDFs, extracted text, exported chapter dossiers, and citation snapshots.
- `pgvector`
  Semantic retrieval across chapter dossiers, source snapshots, extracted claims, and prior research.
- `Redis`
  Queueing, fetch jobs, retries, throttling, and multi-step verification workflow state.

For the Research stage, Postgres plus object storage are the most important layers.

## Core Concepts

### Chapter Research Dossier

A dossier is the main artifact for one chapter.

It should contain:

- chapter purpose
- research questions
- verified fact bank
- verified statistics
- verified examples and case studies
- verified quotes
- contradictory evidence or nuance
- open research gaps
- source register

Suggested artifact type:

- `research_pack`

This should be stored as a versioned artifact under the `research` stage.

### Source Record

A source record represents one fetched source used during chapter research.

Recommended fields:

- `id`
- `book_id`
- `stage_id`
- `chapter_key`
- `url`
- `canonical_url`
- `title`
- `publisher`
- `author`
- `published_at`
- `accessed_at`
- `content_type`
- `source_tier`
- `tier_weight`
- `is_verified`
- `verification_status`
- `verification_notes`
- `snapshot_path`
- `extracted_text_path`
- `metadata_json`
- `created_at`

Suggested `source_tier` values:

- `A`
- `B`
- `C`

Suggested `tier_weight` values:

- `1.0`
- `0.75`
- `0.5`

### Research Item

A research item is a single usable unit inside the dossier.

Examples:

- a statistic
- a factual claim
- a case study detail
- a quote
- an example
- a contradiction or caution

Recommended fields:

- `id`
- `book_id`
- `stage_id`
- `chapter_key`
- `research_pack_artifact_version_id`
- `source_record_id`
- `item_type`
- `claim_text`
- `evidence_excerpt`
- `summary`
- `source_tier`
- `tier_weight`
- `verification_status`
- `verified_by_run_id`
- `relevance_score`
- `confidence_score`
- `mapped_section_id`
- `mapped_chapter_id`
- `mapped_paragraph_id`
- `metadata_json`
- `created_at`

Suggested `item_type` values:

- `fact`
- `statistic`
- `quote`
- `example`
- `case_study`
- `counterpoint`
- `definition`

### Verification Record

Every source and every research item should have an explicit verification record.

Recommended fields:

- `id`
- `book_id`
- `stage_id`
- `chapter_key`
- `source_record_id`
- `research_item_id`
- `verifier_type`
- `status`
- `title_match`
- `content_match`
- `claim_supported`
- `tier_confirmed`
- `second_source_required`
- `second_source_confirmed`
- `notes`
- `created_at`

Suggested `status` values:

- `pending`
- `verified`
- `rejected`
- `needs_corroboration`

Suggested `verifier_type` values:

- `fetch_validator`
- `llm_verifier`
- `human_review`

## Tiering Rules

### Tier A

Use for:

- peer-reviewed research
- government databases
- official statistical agencies
- primary institutional reports
- official public filings and standards bodies

Weight:

- `1.0`

### Tier B

Use for:

- reputable journalism
- established industry reports
- respected publishers
- recognized institutions without formal peer review

Weight:

- `0.75`

### Tier C

Use for:

- Reddit
- blogs
- personal websites
- community posts
- anecdotal public narratives

Weight:

- `0.5`

### Tier Enforcement

Rules to enforce:

- no research item enters the dossier without at least one verified source
- high-impact claims should require at least one `Tier A` or strong `Tier B`
- `Tier C` should not stand alone for core factual claims
- `Tier C` can be used for color, language, anecdotal texture, and directional examples
- source tier must be confirmed by the verifier, not just by the extractor

## Research Pack Artifact Shape

### `research_pack.content_json`

Recommended shape:

```json
{
  "chapter_key": "section-2-chapter-2",
  "chapter_title": "Filtering AI Vendor Noise: Frameworks for Critical Evaluation",
  "chapter_description": "Provides practical frameworks to assess AI vendor claims and technologies critically.",
  "research_goal": "Build a credible chapter dossier with verified facts, figures, frameworks, and examples.",
  "research_questions": [
    "What evidence exists that enterprise leaders struggle to evaluate AI vendor claims?",
    "What criteria do credible sources recommend for technology evaluation?",
    "What examples show the cost of buying into hype without verification?"
  ],
  "fact_bank": [
    {
      "id": "item-1",
      "type": "fact",
      "claim_text": "Organizations often overestimate vendor claims when evaluation standards are weak.",
      "source_id": "source-1",
      "source_tier": "B",
      "tier_weight": 0.75,
      "verification_status": "verified",
      "mapped_paragraph_id": "section-2-chapter-2-p2"
    }
  ],
  "statistics": [],
  "quotes": [],
  "examples": [],
  "counterpoints": [],
  "gaps": [
    "Need stronger Tier A evidence on enterprise AI procurement failure rates."
  ],
  "source_register": [
    {
      "id": "source-1",
      "title": "Example source title",
      "url": "https://example.org/report",
      "tier": "B",
      "verified": true
    }
  ]
}
```

## Chapter-Level Automation Model

Research should run one chapter at a time.

Suggested work unit:

- `book_id`
- `chapter_key`
- `outline_version_id`
- `paragraph_outline_version_id`
- `research_run_id`

This allows:

- retries per chapter
- partial completion across large books
- independent commit and review
- selective reruns when only one chapter changes

## Commit Semantics

Committing research should mean:

- the current research pack version is frozen
- all included research items are verified
- all included sources are tiered and verified
- the chapter dossier is approved for downstream drafting

Downstream stages should consume only committed chapter research packs unless explicitly told to use draft research.

## Database Extensions

The current schema will need additional models or equivalent JSON-backed tables for:

- `ResearchSource`
- `ResearchItem`
- `ResearchVerification`

If we keep the current artifact-first schema, these can either:

- become explicit relational tables
- or be stored inside `research_pack` artifacts plus supporting source tables

Recommendation:

- use explicit source and verification tables
- keep the chapter dossier itself as the versioned artifact

That gives us both auditability and flexible rendering.
