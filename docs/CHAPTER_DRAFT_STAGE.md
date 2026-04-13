# Chapter Draft Stage
## Manuscript Generation and Authoring - Operational

---

## PHASE OVERVIEW

After Personal Stories Integration stage is complete (all personal story collections locked), Chapter Draft stage generates complete chapter manuscripts.

System creates full chapter prose—Introduction through Closing—using Base Story narrative, research dossier facts, external and personal stories, and Writing Constitution as inputs.

Author reviews and refines generated drafts, requesting changes until chapter is ready for final editing.

---

## TRIGGER

Personal Stories Integration stage complete (all personal story collection locked).

Author begins Chapter Draft stage by initiating draft generation for a chapter, or starting full manuscript generation for all chapters.

---

## WORKFLOW

### Step 1: Author Initiates Chapter Draft Generation

Author can:

**Option A: Generate Single Chapter**
- Navigate to specific chapter (e.g., S1-C1)
- Click "Generate Draft" or "Write Chapter"
- System begins draft generation

**Option B: Generate All Chapters**
- Navigate to manuscript overview
- Click "Generate Full Manuscript" or "Write All Chapters"
- System generates all chapters in sequence or batch

**Option C: Regenerate Chapter**
- For existing draft that needs revision
- Request regeneration with specific guidance
- System uses updated guidance for next generation

### Step 2: System Generates Chapter Draft

For each chapter, system creates complete prose using:

**Input Data:**
- Base Story (narrative structure and voice movement)
- Outline Expansion (paragraph IDs, purposes, word count targets)
- Research Dossier (facts, statistics, sources, counterarguments)
- External Story Collection (proof points, examples)
- Personal Story Collection (author authority, lived wisdom)
- Writing Constitution (voice blend, tone, quality standards)

**Generation Process:**

1. **Opening Hook (100-150 words)**
   - Establish reader's current reality
   - Create curiosity or recognition
   - Introduce chapter's big idea or tension
   - Connect to reader's transformation journey
   - Sound consistent with author voice

2. **Chapter Navigation (50-100 words, optional)**
   - Set expectations for what reader will learn
   - Show how this chapter connects to larger journey
   - Outline the path through chapter
   - Use appropriate marker/framework language

3. **Paragraph Content (iterate per paragraph)**
   For each paragraph in chapter outline:
   
   **a) Establish Purpose**
   - Begin with topic sentence (from outline)
   - Ground in reader's current reality or need
   - Connect to chapter's big idea
   
   **b) Develop Core Content**
   - Deliver the core claim or teaching
   - Use 1-2 research facts per paragraph
   - Provide specificity and credibility
   - Match tone to author's voice blend
   - Approximately [paragraph's word count allocation]
   
   **c) Prove/Illustrate**
   - Integrate 1 proof story (external or personal)
   - Show practical application
   - Use specific example or case study
   - Connect to reader's potential outcome
   
   **d) Advance Reader Journey**
   - Move reader through 5-phase journey (Current Reality → Disruption → Revelation → Application → Transformation)
   - Deliver permission or proof as needed for phase
   - Create appropriate tension or relief
   - Build toward chapter resolution
   
   **e) Transition to Next Paragraph**
   - Bridge to next topic naturally
   - Maintain narrative momentum
   - Prepare for next idea or story

4. **Chapter Closing (150-200 words)**
   - Summarize chapter's big idea
   - Show what reader has learned or shifted
   - Point toward application or next step
   - Create appropriate emotional resolution
   - Hint at next chapter's journey
   - Sound like author's voice, not summary

5. **Chapter Word Count Management**
   - Total chapter matches allocated word count (or within 10%)
   - Each paragraph uses its allocated word count
   - Pacing feels appropriate for content
   - Dense sections balanced with lighter moments

**Output: Complete chapter draft with:**
- All paragraphs written to specification
- Stories integrated at appropriate points
- Research facts woven naturally (with implicit citations)
- Author voice consistent throughout
- Reader journey advanced toward transformation
- Transitions smooth and narrative flowing

### Step 3: System Fact-Check Integration

Before presenting draft, system validates:
- [ ] All facts from research dossier used accurately
- [ ] Stories placed at strategic points
- [ ] Author stories present and positioned appropriately
- [ ] Research sources available for verification if needed
- [ ] No invented claims or unsupported assertions
- [ ] Proper context for any counterarguments
- [ ] Word count within allocated range
- [ ] Voice and tone consistent with author intent

If issues found: Flag for author attention before presentation.

### Step 4: Author Reviews Draft

Author receives complete chapter draft and can:

**1) Accept the draft**
- Chapter looks good
- Ready to move to next phase (Final Editor)
- Can still request polish/refinement

**2) Edit the draft directly**
- Author can edit prose in the interface
- Can modify stories, facts, phrasing
- Can adjust structure or emphasis
- Changes tracked and noted

**3) Request revisions**
- Specify what needs to change
- "Make the opening more personal"
- "Simplify the explanation of X concept"
- "Use the other story here instead"
- "Add more of author's voice"
- "Tone is too academic, make more conversational"

**4) Request regeneration**
- If draft misses the mark entirely
- Provide specific guidance for next attempt
- System regenerates with new input
- Author reviews again

**5) Compare versions**
- If regenerating, see side-by-side comparison
- Choose preferred sections from each version
- Mix and match best elements

### Step 5: Iterate Until Satisfied

Author and system iterate:
- System makes requested revisions or regenerates
- Author reviews and provides feedback
- Cycle continues until chapter feels complete
- Author approves final draft

**Conversation Record:**
- All author feedback saved with draft
- Regeneration reasons documented
- Final approval version tracked

### Step 6: Lock Chapter Draft

Once author approves chapter draft:

Chapter draft locked with chapter ID.

Stored with chapter:
- Complete chapter prose (final version)
- Word count and structure metadata
- All research facts used (implicit citations)
- Story integrations noted
- Author voice assessment
- Revision history/iterations
- Final approval and date

---

## CHAPTER DRAFT OUTPUT

### Per-Chapter Structure

```
[CHAPTER ID]: [Chapter Title]

CHAPTER DRAFT v1.0 FINAL

[Opening Hook — #words]
[Establish current reality, create curiosity]

[Navigation (if included) — #words]
[Set expectations]

PARAGRAPH 1: [Topic Sentence]
[Content — # words]
[Story integration point]

PARAGRAPH 2: [Topic Sentence]
[Content — # words]
[Story integration point]

[Continue for all paragraphs...]

[Chapter Closing — #words]
[Summary, emotional resolution, hint at next chapter]

METADATA
├─ Total Word Count: [#]
├─ Reader Phase Progress: [Current Reality → Disruption → Revelation → Application → Transformation]
├─ Voice Blend Assessment: [Expert/Mentor/Friend mix assessment]
├─ Story Integration: [# external, # personal, # research facts]
├─ Revision Iterations: [#]
└─ Final Approval: [Date/time approved]
```

### Display Format in App

**Chapter Draft View:**
```
[S1-C1] CHAPTER 1: [Title]

Draft Status: [Approved / In Progress / Needs Revision]

Word Count: [#] / [target]

[Full chapter text with read/edit interface]

Author Comments:
├─ Story at para 3: "This example works great"
├─ Para 2 revision: "Made it more conversational"
└─ Overall: "Good foundation, feels like my voice"

[Request Revisions / Send to Final Editor / Preview / Publish]
```

**Manuscript Dashboard:**
```
CHAPTER DRAFTS PROGRESS

COMPLETED & APPROVED:
✓ S1-C1: Introduction chapter (2,400 words)
✓ S1-C2: Reader's current reality (2,800 words)
✓ S1-C3: The problem or gap (2,600 words)

IN PROGRESS:
⟳ S2-C1: Writer working on draft (est. 2 days)
⟳ S2-C2: Awaiting author review
⟳ S2-C3: Author requested revisions

NOT STARTED:
⏳ S3-C1: Queued for generation
⏳ S3-C2: Queued
...

MANUSCRIPT STATS
├─ Total words (approved): 45,600 / 60,000 target
├─ Completion: 6 of 14 chapters (43%)
├─ Estimated completion: [date based on generation speed]
└─ Average words per chapter: [#]
```

---

## USER ACTIONS

**Per-chapter draft workflow:**

1. **Initiate Draft Generation**
   - Author selects chapter or initiates full manuscript generation
   - System begins draft generation

2. **System Generates Complete Draft**
   - Uses all locked materials (base story, research, stories)
   - Writes full chapter prose
   - Integrates stories at strategic points
   - Matches word count targets
   - Maintains author voice

3. **Author Reviews**
   - Reads complete chapter draft
   - Assesses voice, structure, flow
   - Identifies what needs revision

4. **Request Changes or Accept**
   - Provide revision guidance for specific fixes, OR
   - Accept and approve if draft is solid

5. **Iterate if Needed**
   - System revises or regenerates based on feedback
   - Author reviews revised draft
   - Repeat until satisfied

6. **Approve & Lock**
   - Author approves final draft
   - Chapter locked and ready for Final Editor
   - Moves to next chapter or final editing phase

7. **Complete Manuscript Draft**
   - All chapters approved and locked
   - Status: Chapter Draft COMPLETE
   - Ready for Final Editor refinement

---

## COMPLETION CRITERIA

Chapter Draft stage complete when:

- [ ] All chapters have complete, approved drafts
- [ ] Each draft includes all research facts appropriately
- [ ] Each draft integrates stories strategically
- [ ] Each draft matches word count targets (within 10%)
- [ ] Author voice consistent across chapters
- [ ] Reader transformation journey clear and supported
- [ ] Pacing and structure appropriate for each chapter
- [ ] No orphaned research facts or unused stories
- [ ] All author revisions/iterations complete
- [ ] Author approved all chapter drafts
- [ ] All chapter draft status: LOCKED ✓

---

## DRAFT QUALITY STANDARDS

Each chapter draft should:

**Voice & Tone:**
- Sound like the author (not like an AI, but like author would write)
- Match intended voice blend (Expert/Mentor/Friend balance)
- Consistent tone throughout manuscript
- Conversational and engaging (not academic or stilted)

**Content & Structure:**
- Opens with hook that engages reader
- Develops big idea clearly and compellingly
- Supports all claims with research facts or stories
- Transitions flow naturally
- Closes with resolution and connection to transformation

**Reader Journey:**
- Moves reader through 5-phase journey appropriately
- Creates and resolves appropriate tension
- Provides both permission and proof points
- Leads toward reader transformation
- Feels like dialogue with reader, not lecture

**Stories & Examples:**
- Stories integrated naturally (not inserted awkwardly)
- Both external and personal stories included
- Stories support specific claims
- Stories feel vivid and specific
- Author stories demonstrate credibility and wisdom

**Pacing & Length:**
- Word counts approximately match allocations
- Dense sections balanced with lighter moments
- Paragraphs flow without forcing connections
- Chapter feels complete without being padded
- Momentum carries reader through section

---

## NEXT STEP

Once all chapter drafts are approved and locked, Voice Guard stage begins.

Voice Guard agent (different LLM family from author) provides independent critique:
- Challenges weak arguments
- Identifies voice inconsistencies
- Questions unsupported claims
- Suggests stronger framings
- Ensures author authority maintained
- Flags missing proof or permission points

Then Final Editor polish phase refines manuscript for publication.

---
