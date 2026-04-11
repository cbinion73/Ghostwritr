# Phase 2 Platform Roadmap

## New Stage Flow

1. `Library`
2. `Book Setup`
3. `Promise`
4. `Audience`
5. `Market Analysis`
6. `Outline`
7. `Base Story`
8. `Research`
9. `External Stories`
10. `Personal Stories`
11. `Chapter Draft`
12. `Book Assembly`
13. `Length Adjustment`
14. `Final Editor`
15. `Typesetting & Publishing`
16. `Preview`
17. `Marketing Handoff`

## Phase 2 Foundations

### Book Setup

This stage sits between `Library` and `Promise`.

It owns:
- writer persona selection
- target word count
- page-count target
- trim size
- output formats
- AI-authorship guard toggle
- provenance tracking toggle
- marketing handoff toggle

This profile should become a shared upstream input for:
- Promise
- Outline
- Chapter Draft
- Length Adjustment
- Final Editor
- Typesetting & Publishing

### Human Direction Ledger

The platform should capture:
- setup selections
- user prompts
- revision comments
- approvals and commits
- uploads
- manual edits
- editorial override decisions

The goal is a future `Provenance Report` that can show:
- human direction
- source traceability
- workflow provenance

### AI Voice Guard

The platform should use an `AI-authorship risk` loop rather than a fake certainty detector.

Checks should include:
- cliche density
- abstraction overload
- synthetic transitions
- repetitive rhythm
- consultant tone
- punctuation tells such as em dashes

The loop:
1. author agent drafts
2. voice-risk agent reviews
3. feedback returns to author
4. repeat until within threshold or escalated to human review

### Book Assembly

After chapters are approved, the system should:
- assemble the full manuscript
- preserve chapter boundaries
- preserve source-usage maps
- prepare the manuscript for length adjustment and final review

Artifacts:
- `MANUSCRIPT_ASSEMBLY`

### Length Adjustment

This stage should:
- compare current manuscript length to target
- resize toward target within tolerance
- preserve meaning, structure, and voice
- support uploaded manuscripts as a separate entry path later

Artifacts:
- `LENGTH_ADJUSTMENT`

### Final Editor

This stage enforces the full spec.

Checks:
- setup compliance
- outline compliance
- word count
- voice consistency
- AI-risk threshold
- source sufficiency
- formatting readiness

If out of spec:
1. generate revision feedback
2. send back to upstream stage
3. rerun until compliant

### Typesetting and Publishing

This stage should support:
- standard print trim sizes
- margin templates
- page numbering
- front matter / back matter
- embedded font handling
- ebook packaging
- print-ready package generation

Artifacts:
- `PUBLISHING_PACKAGE`

### Marketing Handoff

The system should be ready to hand structured payloads to a future marketing platform.

Exportable payloads should include:
- book metadata
- audience personas
- positioning
- approved chapter summaries
- quote banks
- unused external stories
- content hooks
- reusable snippets

Artifacts:
- `MARKETING_HANDOFF_PACKAGE`

## Implementation Order

1. Stabilize web access
2. Stabilize Research and External Stories
3. Stabilize Chapter Draft
4. Expand Book Setup
5. Add Book Assembly
6. Add AI Voice Guard loop
7. Add Final Editor
8. Add Length Adjustment
9. Add Typesetting & Publishing
10. Add Preview
11. Add Marketing Handoff exports
