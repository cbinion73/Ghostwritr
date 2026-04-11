# Research Stage Verification Workflow

## Purpose

This document defines how the `Research` stage should run after the outline is committed.

The standard is intentionally strict:

- every included item must have a source
- every source must be tiered
- every included item must be independently verified by a second AI
- every fetched source should be checked against its page title and contents

This stage should aim to be defensible, transparent, and auditable.

## Why This Is A Separate Workflow

Research quality determines whether later stages can be trusted.

The system should not allow:

- unverified browsing output to flow directly into drafting
- unsupported claims to enter the dossier
- weak source material to masquerade as hard evidence

Research is a production pipeline, not a summarization pass.

## Inputs

The chapter research workflow should consume:

- committed section-and-chapter outline
- committed paragraph-level outline
- committed promise bundle
- committed audience and market artifacts when relevant
- project reference library

The atomic unit is:

- one chapter at a time

## State Shape

Recommended graph state:

```ts
type ChapterResearchState = {
  bookId: string;
  stageId: string;
  chapterKey: string;
  chapterTitle: string;
  chapterDescription: string;
  chapterParagraphs: Array<{
    paragraphId: string;
    topicSentence: string;
    purpose: string;
  }>;
  researchQuestions: string[];
  candidateSources: Array<{
    url: string;
    title: string | null;
    sourceTier: "A" | "B" | "C" | null;
  }>;
  fetchedSources: Array<{
    sourceId: string;
    url: string;
    title: string;
    sourceTier: "A" | "B" | "C";
    tierWeight: number;
    snapshotPath: string;
  }>;
  extractedItems: Array<{
    itemId: string;
    sourceId: string;
    claimText: string;
    itemType: string;
  }>;
  verifiedItems: Array<{
    itemId: string;
    status: "verified" | "rejected" | "needs_corroboration";
  }>;
  dossierReady: boolean;
  commitRequested: boolean;
  runId: string;
};
```

## Node Responsibilities

### 1. `load_chapter_context`

Load the chapter research context.

Reads:

- committed outline
- committed paragraph outline
- any existing chapter research dossier
- prior research runs for the chapter

Outputs:

- chapter metadata
- paragraph topics
- prior dossier state

### 2. `build_research_questions`

Generate focused research questions from the chapter outline.

Questions should target:

- core factual support
- statistics and figures
- examples and case studies
- counterarguments or nuance
- definitions and framing

### 3. `discover_candidate_sources`

Use the web research service to gather candidate sources.

Rules:

- prefer primary and high-credibility sources first
- search broadly enough to find corroboration
- gather more candidates than will be used in the final dossier

### 4. `fetch_and_snapshot_sources`

For each candidate source:

- fetch the actual destination URL
- capture canonical URL
- capture page title
- extract text
- save a snapshot

Reject:

- broken pages
- title mismatches suggesting bad search results
- thin pages
- spam pages
- pages whose content does not match the query intent

### 5. `tier_sources`

Assign source tier and weight.

Rules:

- `Tier A` -> `1.0`
- `Tier B` -> `0.75`
- `Tier C` -> `0.5`

This node should produce a preliminary tier classification.

### 6. `extract_research_items`

First AI pass.

For each fetched source:

- extract candidate facts
- extract figures and data points
- extract quotes
- extract examples and case details
- extract contradictions or limitations

Every extracted item must preserve:

- exact source record
- evidence excerpt
- preliminary mapping to chapter or paragraph

### 7. `verify_source_integrity`

Deterministic and AI-assisted checks.

Checks:

- page title matches source metadata
- URL and publisher are coherent
- fetched page is real and usable
- tier assignment is plausible

This step verifies the source itself before we trust extracted claims.

### 8. `verify_extracted_items`

Second AI pass.

The verifier AI should independently review each extracted item against the fetched source snapshot.

Checks:

- is the claim actually present?
- is the summary faithful?
- is the quote accurate?
- is the statistic represented correctly?
- is the source tier appropriate?
- does this item need corroboration from a second source?

Only items marked `verified` should proceed.

### 9. `cross_source_corroboration`

For high-impact claims:

- compare corroborating sources
- detect contradiction
- note where a claim is only weakly supported

Rules:

- major claims should not rely on `Tier C`
- high-stakes numbers should ideally have `Tier A`
- if corroboration is weak, mark the item as such inside the dossier

### 10. `assemble_chapter_dossier`

Build the structured chapter research dossier.

Sections should include:

- chapter goal
- research questions
- verified fact bank
- verified figures and statistics
- verified examples and case studies
- verified quotes
- contradiction and nuance section
- gaps and unanswered questions
- source register

### 11. `compute_dossier_readiness`

Deterministic validation node.

Checks:

- every included item has a source
- every source has a tier
- every included item has verification status `verified`
- no forbidden unverified items remain
- required corroboration is satisfied

Sets:

- `dossierReady = true | false`

### 12. `human_review`

This is where the user can:

- inspect the dossier
- reject weak items
- request more research
- commit the chapter dossier

### 13. `commit_research_pack`

Commits the chapter dossier for downstream use.

Writes:

- committed research artifact version
- commit decision
- downstream-ready research bundle

## Graph Flow

Recommended high-level flow:

```text
load_chapter_context
  -> build_research_questions
  -> discover_candidate_sources
  -> fetch_and_snapshot_sources
  -> tier_sources
  -> extract_research_items
  -> verify_source_integrity
  -> verify_extracted_items
  -> cross_source_corroboration
  -> assemble_chapter_dossier
  -> compute_dossier_readiness
  -> human_review
      -> discover_candidate_sources   (if more research needed)
      -> extract_research_items       (if refinement needed)
      -> commit_research_pack         (if approved)
```

## Tier and Verification Policy

### Tier A Policy

Examples:

- peer-reviewed papers
- government databases
- official census or labor data
- formal public institutional reporting

Usage:

- preferred for major claims
- preferred for statistics
- preferred for definitional or empirical support

### Tier B Policy

Examples:

- major journalism outlets
- established publishers
- respected industry research groups
- major nonprofit or think-tank reporting

Usage:

- strong supporting evidence
- useful for analysis, examples, and framing
- acceptable for many claims, but still ideally corroborated

### Tier C Policy

Examples:

- Reddit
- blogs
- community forums
- personal websites

Usage:

- anecdotal perspective
- language signals
- lived-experience texture

Restrictions:

- not enough by itself for core factual claims
- should be clearly labeled as lower-confidence support

## Web Verification Rules

The system should explicitly:

- click the result
- fetch the actual destination page
- compare search result title to page title
- detect redirects and canonical URL changes
- store the fetched content snapshot
- reject sources whose fetched content does not support the extracted claim

This should be done by the product's web research service, not left implicit inside the LLM.

## Dossier Admission Rule

Nothing should enter the final chapter dossier unless:

- a source record exists
- the source has a confirmed tier
- the source was fetched and snapshotted
- the extracted item was independently verified by a second AI
- the item passed any required corroboration checks

## Human Review Expectations

The user should be able to review:

- source list
- source tier
- verification result
- evidence excerpt
- mapped paragraph relevance
- weakly supported items
- items excluded by the verifier

This stage should make it easy to see not just what the system found, but why it trusted or rejected each item.

## Recommended V1 Build Order

1. `Research dossier artifact and chapter queue`
2. `Source fetch and snapshot service`
3. `Source tiering and metadata extraction`
4. `First-pass extraction`
5. `Second-pass verification`
6. `Chapter dossier UI`
7. `Commit flow and downstream handoff`

## Downstream Contract

The committed chapter research dossier should become direct input for:

- base story enrichment
- external story selection
- chapter drafting
- editorial fact validation

Drafting should consume only:

- committed dossier items
- their source metadata
- their tier and verification flags

That keeps the writing stage grounded in auditable evidence.
