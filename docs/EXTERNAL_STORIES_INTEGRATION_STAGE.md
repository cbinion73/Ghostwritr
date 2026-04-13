# External Stories Integration Stage
## Story Sourcing and Chapter Mapping - Operational

---

## PHASE OVERVIEW

After Research Integration stage is complete (all chapter research dossiers locked), External Stories Integration stage discovers, collects, and maps external stories and case studies to chapters.

Author provides story sources—interviews, case studies, published examples, success stories. System maps stories to chapters using Base Story and research dossiers as semantic anchors.

---

## TRIGGER

All chapter research dossiers are locked (Research Integration stage COMPLETE).

Author begins Stories Integration stage by selecting stories and providing sources per chapter.

---

## WORKFLOW

### Step 1: Author Selects Chapter and Story Source

Author navigates to chapter (e.g., S1-C1) and provides story source:
- Interview transcript or notes
- Published case study or success story
- Client success narrative
- Research participant story
- Real-world application example
- Author's personal experience or client example

**Formats accepted:**
- Pasted text or transcripts
- File uploads (PDFs, Word, transcripts)
- URLs to published stories
- Author notes with key details

### Step 2: System Extracts Story Elements

For each story source, system identifies and extracts:

**1) Story Core**
- Protagonist and context
- Starting point (before the transformation)
- Challenge or friction encountered
- Key turning point or insight
- Outcome or transformation achieved
- Relevance to the chapter's big idea

**2) Thematic Alignment**
- Which chapter's big idea does this story illuminate?
- Which paragraph(s) could this story support?
- What specific claim or framework does the story prove?
- How does the story move the reader through the 5-phase journey?

**3) Narrative Elements**
- Stakes: what was at risk for the protagonist
- Specific details that make the story vivid
- Emotional turning points
- Tangible outcomes or metrics
- Credibility signals (credentials, context, verification)

**4) Usage Recommendations**
- Best placement in chapter (opening, middle, proof point, closing)
- How to use in drafting (as example, proof, permission point, transition)
- What framework/claim it proves
- Word count allocation for this story
- Potential edits or privacy considerations

**5) Story Tier Assessment**
- **Tier A:** Published, verified, with credibility signals (named person, organization, metrics)
- **Tier B:** Semi-public (client approval given, professional context), credible but less verified
- **Tier C:** Author-provided or paraphrased, credible context but requires author verification

### Step 3: System Maps Story to Chapter

Based on Base Story narrative structure and research dossier content:

**Semantic Mapping:**
- Match story protagonist journey to reader 5-phase journey in chapter
- Identify which big idea this story proves
- Find which paragraph(s) need proof points
- Assess story's role: permission point, proof point, permission + proof, or illustrative example

**Placement Logic:**
- Stories that establish problem (Current Reality) → early in chapter
- Stories that create disruption or tension → middle of chapter
- Stories that reveal the revelation → middle-to-climax
- Stories that show application/transformation → closing of chapter

**Integration Plan:**
- Suggest integration strategy: "Use as opening hook," "Proof point for X claim," "Permission point before X advice," etc.
- Note any framework/claim alignment
- Flag any sensitivity considerations (anonymization, privacy, approval needed)

### Step 4: System Quality Checks

Before presenting story mapping, verify:
- [ ] Story is authentic and credible (source clear, details verifiable if needed)
- [ ] Story tier assignment is honest (A/B/C accurate, not overstated)
- [ ] Thematic alignment is clear (story proves a specific claim)
- [ ] Protagonist journey mirrors reader 5-phase journey appropriately
- [ ] Story placement aligns with chapter structure
- [ ] No major privacy or sensitivity issues (or mitigation identified)
- [ ] Story is vivid and specific (not generic)
- [ ] Emotional arc is clear
- [ ] Outcomes are concrete, not vague

If any fail: Flag issues before presenting to author.

### Step 5: Author Reviews Story Mapping

Author can:

**1) Accept the story**
- Story mapped to chapter
- Confirms tier assignment
- Story saved to chapter story collection

**2) Edit the story mapping**
- Adjust chapter placement
- Change story tier (if author believes it's mis-assessed)
- Edit narrative elements or usage recommendation
- Add context or sensitivity notes
- Mark for anonymization or privacy adjustment

**3) Request additional context**
- Ask system to find related stories for same theme
- Request variant mapping (how else could this story fit?)
- Ask for similar stories on different topics

**4) Reject and replace**
- If story doesn't fit chapter well
- Provide reason/context
- Mark for removal or future consideration
- Request different story recommendation

### Step 6: Collect Stories Across Chapters

Repeat Steps 1-5 for all chapters until each chapter has:
- Primary story (proof or permission point)
- 1-2 supporting stories (optional, based on chapter structure)

**Target:** 1-3 stories per chapter, balanced across tiers

### Step 7: Build Story Integration Plan

Once all stories collected and mapped:

System creates Story Integration Summary showing:
- Chapter-by-chapter story assignments
- How stories prove big ideas
- How stories move reader through 5-phase journey
- Tier distribution (aim for mostly A + B, with C for author stories)
- Any gaps or chapters needing additional stories
- Sensitivity/privacy considerations across all stories

### Step 8: Lock Stories for Chapter

Once author approves chapter story assignments:

Story collection locked with chapter ID.

Stored with chapter:
- Primary story (full text, context, tier, usage notes)
- Supporting stories (same format)
- Thematic alignment notes
- Integration plan
- Author approvals/edits
- Version and date locked

---

## STORY DOSSIER OUTPUT

### Per-Chapter Organization

```
[CHAPTER ID]: [Chapter Title]

Base Story: [Chapter narrative]

STORY COLLECTION — [# stories]

PRIMARY STORY: [Story Title]
├─ Source Tier: [A/B/C]
├─ Protagonist: [Name/Role]
├─ Story Arc: [Current Reality → Disruption → Revelation → Application → Transformation]
├─ Big Idea Proven: [Which big idea from research/base story]
├─ Placement: [Where in chapter - opening/middle/proof/closing]
├─ Usage: [How to integrate - permission point, proof point, example, etc.]
├─ Word Count: [Target allocation]
├─ Integration Notes: [Any sensitivity, anonymization, or context needed]
└─ Full Text: [Story transcript/narrative]

SUPPORTING STORY 1: [Story Title]
[Repeat structure]

SUPPORTING STORY 2: [Story Title]
[Repeat structure]

CHAPTER STORY SUMMARY
├─ Total stories: [#]
├─ Tier distribution: [A: #, B: #, C: #]
├─ Big ideas covered: [List of which big ideas have proof stories]
├─ Gaps: [Which big ideas lack story proof]
└─ Reader journey alignment: [How stories move reader through 5 phases]
```

### Display Format in App

**Chapter Stories Page:**
```
[S1-C1] CHAPTER 1: [Title]

Story Status: [Approved / In Progress / Needs Review]

Stories for This Chapter:
├─ PRIMARY: [Story Title] — Tier [A/B/C] — [Proof/Permission/Both]
├─ SUPPORTING: [Story Title] — Tier [A/B/C] — [Proof/Permission/Both]
└─ [Additional supporting stories...]

[Select story to view full text and integration notes]
```

**Individual Story View:**
```
STORY: [Story Title]
[Chapter ID] - [Protagonist]: [Context]

Story Tier: [A/B/C] [Rationale]

Story Arc:
Current Reality: [Where protagonist started]
Disruption: [What challenged them]
Revelation: [What they realized]
Application: [What they tried]
Transformation: [Where they are now]

Big Idea Proven: [Which claim/framework this supports]

Placement in Chapter: [Where in narrative structure]

Usage Recommendation: [How to use in drafting]

Word Count Allocation: [Suggested length]

Integration Notes: [Privacy, sensitivity, context]

Full Story Text:
[Complete narrative]
```

---

## USER ACTIONS

**Per-chapter story workflow:**

1. **Select Chapter and Provide Source**
   - Author selects chapter ID
   - Provides story source (text, upload, URL)

2. **System Extracts and Maps**
   - System identifies story elements
   - Maps to chapter via Base Story + research dossier
   - Assesses tier and usage

3. **Review & Edit**
   - Author reviews story mapping
   - Can adjust placement, tier, usage notes
   - Can request alternative mappings

4. **Approve & Lock**
   - Author approves chapter stories
   - Stories locked with chapter ID
   - Ready for chapter draft

5. **Collect Across Book**
   - Repeat for all chapters
   - Build story integration plan

6. **Complete Stories Phase**
   - All chapters have story collections
   - All stories approved and locked
   - Status: Stories Integration COMPLETE

---

## COMPLETION CRITERIA

Stories Integration stage complete when:

- [ ] All chapters have at least one primary story
- [ ] All stories source documented (tier assignment)
- [ ] All stories mapped to chapter big ideas
- [ ] Thematic alignment clear for each story
- [ ] Story placement decided per chapter
- [ ] Tier distribution reasonable (mostly A + B)
- [ ] No chapters with major story gaps
- [ ] Sensitivity/privacy issues identified and addressed
- [ ] Author reviewed all story mappings
- [ ] Author approved and locked all chapter stories
- [ ] All chapter story status: LOCKED ✓

---

## CHAPTER STORY STATUS TRACKING

Each chapter has story status:
- **Not Started:** No stories provided
- **In Progress:** Stories provided, mapping in progress
- **Pending Review:** Stories mapped, awaiting author review
- **Approved (Edits):** Author editing mappings, not yet locked
- **Locked:** Stories approved and finalized

Progress shown:
```
STORIES PROGRESS

S1-C1: Locked ✓ (3 stories)
S1-C2: Locked ✓ (2 stories)
S1-C3: Locked ✓ (1 story)
S2-C1: Pending Review (2 stories)
S2-C2: In Progress (1 story provided)
S2-C3: Not Started
S3-C1: Locked ✓ (2 stories)
...

Progress: 5 of 14 chapters with stories locked (36%)
Tier distribution: 8 Tier A, 5 Tier B, 2 Tier C
```

---

## KNOWLEDGE BASE ORGANIZATION

Story collections stored per chapter ID:
```
Knowledge Base:

[S1-C1]
├─ Base Story
├─ Research Dossier v1.0 LOCKED
└─ Story Collection v1.0 LOCKED
   ├─ Primary Story (full text + tier + placement)
   ├─ Supporting Story 1 (full text + tier + placement)
   ├─ Supporting Story 2 (full text + tier + placement)
   └─ Integration Plan

[S1-C2]
[Repeat structure]

[All chapters...]
```

Searchable by:
- Chapter ID (S1-C1)
- Story title or protagonist
- Story tier
- Big idea/framework it proves
- Story type (permission, proof, illustrative, etc.)

---

## INTEGRATION WITH CHAPTER DRAFTING

Once stories are locked, chapter draft workflow will:
- Use story collection as proof points and examples
- Place stories according to integration plan
- Include author voice/styling adaptations
- Maintain thematic alignment with chapter big idea
- Support reader transformation through 5-phase journey

---

## NEXT STEP

Once all chapter stories are locked, Chapter Draft stage begins.

Author manuscript generation using:
- Base Story (narrative skeleton)
- Research Dossier (facts, claims, sources)
- Story Collection (proof points, examples, permission points)
- Writing Constitution (voice, style, quality standards)

---
