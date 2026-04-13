# Research Integration Instruction Set
## Research Dossier Generation - Operational

---

## PHASE OVERVIEW

After Base Story is locked with chapter IDs established, Research Integration stage generates paragraph-level research dossiers for each chapter.

Author provides research inputs per chapter. System generates research packets using the Research Framework.

---

## TRIGGER

Base Story phase locked as v1.0 FINAL (with chapter IDs established).

Author begins Research Integration stage by selecting a chapter and providing research inputs.

---

## WORKFLOW

### Step 1: Author Selects Chapter

Author clicks chapter ID (e.g., S1-C1, S2-C3) to begin research integration for that chapter.

### Step 2: System Displays Chapter Context

System shows:
- Chapter ID and title
- Base Story for this chapter
- Paragraph IDs and topic sentences (from TOC)
- Paragraph intents (from TOC)
- Word count allocation per paragraph

### Step 3: Author Provides Research Inputs

For the chapter, author provides:
- Raw research materials (notes, links, documents, data)
- Sources (books, articles, studies, datasets)
- Specific facts/statistics they want included
- Domain expertise and constraints
- Any questions or gaps they want researched
- Optional: preliminary research packets if already compiled

**System can accept:**
- Pasted text/notes
- File uploads (PDFs, Word docs, spreadsheets)
- URLs to sources
- Dataset references
- Direct statements of fact with sources

### Step 4: System Generates Research Dossier

For each paragraph in the chapter, system creates:

**1) Research Questions for This Paragraph**
- 6-12 precise questions the research must answer
- Includes: definitions, mechanisms, boundary conditions, counterarguments, implications

**2) Source Map (Weighted)**
- What sources were used and why
- Priority order: Tier A → Tier B → Tier C

**3) Key Definitions and Concept Clarifications**
- 5-12 definitions relevant to paragraph
- Term, definition, why it matters, APA citation

**4) Verifiable Fact Bank (Atomic Facts)**
- 25-60 atomic facts per paragraph
- Each with: Fact ID, statement, claim type, evidence tier, strength rating, scope notes, verification pointer, APA citation

**5) Evidence Summaries**
- 10-15 most important sources summarized
- Full APA reference, what it studied, method, key findings, limitations, how to use in writing

**6) Counterpoints and Tensions**
- 5-10 credible counterarguments
- Evidence supporting each
- Honest wording suggestions

**7) Writer's Toolkit**
- 6-10 trust anchors (facts that can ground the paragraph)
- 6-10 softeners (phrases for mixed evidence)
- 3-6 do-not-say warnings (common overclaims)

**8) APA Bibliography**
- Complete bibliography for all sources
- Alphabetized with DOI or stable URL

**9) Traceability Matrix**
- Fact ID → Primary source(s) → Evidence tier → Verification pointer

### Step 5: System Quality Check

Before presenting research dossier, verify:
- [ ] All factual claims are human-verifiable
- [ ] No invented citations or fake DOIs
- [ ] Tier A sources prioritized
- [ ] Counterpoints included
- [ ] Traceability complete (can verify each fact)
- [ ] APA bibliography complete and accurate
- [ ] Sources actually support the claims
- [ ] Scope notes clear (population, geography, timeframe)
- [ ] Strength ratings justified

If any fail: Flag issues before presenting.

### Step 6: Author Reviews Research Dossier

Author can:

**1) Accept the dossier**
- Marks chapter research as approved
- Dossier stored with chapter ID

**2) Edit the dossier**
- Modify facts, sources, or findings
- Add/remove sources
- Adjust strength ratings
- Edit definitions or counterpoints
- Changes tracked

**3) Request additional research**
- Specify gaps or missing topics
- System regenerates or expands dossier
- Author reviews again

**4) Reject and regenerate**
- If dossier is off-target
- Provide clarification on what's needed
- System regenerates

### Step 7: Lock Research Dossier

Once author approves, research dossier for chapter is locked.

Stored with chapter ID:
- All 9 sections of research dossier
- Author approvals and edits
- Version and date locked

---

## RESEARCH DOSSIER OUTPUT

### Per-Chapter Organization

```
[CHAPTER ID]: [Chapter Title]

Base Story: [Chapter narrative]

PARAGRAPH 1 RESEARCH DOSSIER
├─ Research Questions
├─ Source Map
├─ Key Definitions
├─ Fact Bank
├─ Evidence Summaries
├─ Counterpoints
├─ Writer's Toolkit
├─ APA Bibliography
└─ Traceability Matrix

PARAGRAPH 2 RESEARCH DOSSIER
[Repeat structure]

[Continue for all paragraphs in chapter]

CHAPTER RESEARCH SUMMARY
├─ Total sources cited
├─ Tier A / Tier B / Tier C breakdown
├─ Gaps or limitations noted
└─ Quality assessment
```

### Display Format in App

**Chapter Research Page:**
```
[S1-C1] CHAPTER 1: [Title]

Research Status: [Approved / In Progress / Needs Review]

Paragraphs with Research Dossiers:
├─ Para 1: [Topic sentence] ✓ [Approved / Pending]
├─ Para 2: [Topic sentence] ✓ [Approved / Pending]
├─ Para 3: [Topic sentence] ✓ [Approved / Pending]
└─ Para N: [Topic sentence] ✓ [Approved / Pending]

[Select paragraph to view full research dossier]
```

**Individual Dossier View:**
```
PARAGRAPH RESEARCH DOSSIER
[Chapter ID] - [Paragraph ID]: [Topic Sentence]

1) Research Questions
[List of 6-12 questions]

2) Source Map
[Source tier breakdown]

3) Key Definitions
[5-12 definitions with citations]

4) Fact Bank
[25-60 atomic facts with all details]

5) Evidence Summaries
[10-15 source summaries]

6) Counterpoints and Tensions
[5-10 counterarguments]

7) Writer's Toolkit
[Trust anchors, softeners, warnings]

8) APA Bibliography
[Complete bibliography]

9) Traceability Matrix
[Fact → Source mapping table]
```

---

## USER ACTIONS

**Per chapter research workflow:**

1. **Select Chapter**
   - Author selects chapter ID to begin research

2. **Provide Research Inputs**
   - Author uploads/pastes research materials
   - Provides sources, facts, notes, constraints

3. **System Generates Dossier**
   - Creates complete research packet for chapter
   - Paragraph-level research organized

4. **Review & Edit**
   - Author reviews research dossier
   - Can edit, add, remove sources/facts
   - Can request additional research

5. **Approve & Lock**
   - Author approves chapter research
   - Dossier locked with chapter ID
   - Ready for drafting stage

6. **Move to Next Chapter**
   - Repeat process for each chapter
   - All chapter research eventually locked

---

## COMPLETION CRITERIA

Research Integration stage complete when:

- [ ] All chapters have research inputs provided
- [ ] All chapter research dossiers generated
- [ ] Each paragraph has research dossier (9 sections)
- [ ] All factual claims verifiable
- [ ] Traceability matrices complete
- [ ] APA bibliographies complete
- [ ] Counterpoints included
- [ ] Author reviewed all research dossiers
- [ ] Author approved and locked all chapter research
- [ ] All chapter research status: LOCKED ✓

---

## CHAPTER RESEARCH STATUS TRACKING

Each chapter has status:
- **Not Started:** No research inputs provided
- **In Progress:** Research inputs provided, dossier generating
- **Pending Review:** Dossier generated, awaiting author review
- **Approved (Edits):** Author editing, not yet locked
- **Locked:** Chapter research approved and finalized

Progress shown:
```
RESEARCH PROGRESS

S1-C1: Locked ✓
S1-C2: Locked ✓
S1-C3: Locked ✓
S2-C1: Pending Review
S2-C2: In Progress
S2-C3: Not Started
S3-C1: Locked ✓
...

Progress: 5 of 14 chapters locked (36%)
```

---

## KNOWLEDGE BASE ORGANIZATION

Research dossiers stored per chapter ID:
```
Knowledge Base:

[S1-C1]
├─ Base Story
├─ TOC (structure)
├─ Research Dossier v1.0 LOCKED
│  ├─ Para 1 Research
│  ├─ Para 2 Research
│  └─ Para 3 Research
└─ Sources Index

[S1-C2]
[Repeat structure]

[All chapters...]
```

Searchable by:
- Chapter ID (S1-C1)
- Paragraph ID (if needed)
- Source title/author
- Fact ID
- Topic/keyword

---

## NEXT STEP

Once all chapter research is locked, Stories Integration stage begins.

Author provides stories and case studies per chapter.

System maps stories to chapters using Base Story and research dossiers.

---
