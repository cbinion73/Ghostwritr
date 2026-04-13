# Research Quality Agent - Three-Agent Verification Pipeline
## Automated Fact-Checking with Source Extraction

---

## PHASE OVERVIEW

After research generation completes per chapter, a **three-agent pipeline** independently verifies all facts, links, and information by actually retrieving and comparing source material.

**Pipeline:**
1. **Agent 1 (Researcher):** GPT-5.4 generates claims + citations (with web search)
2. **Agent 2 (Extractor):** Lightweight model opens URLs and pulls relevant passages  
3. **Agent 3 (Verifier):** Haiku compares actual claim against actual excerpt from source

This prevents **citation hallucination** by requiring Agent 2 to actually retrieve the source material, which Agent 3 then fact-checks against.

---

## WORKFLOW

### Step 1: Researcher Agent Generates (GPT-5.4 + web_search)

**Input:** Chapter topic, outline, base story
**Output:** Research dossier with claims + citations

Agent 1 creates:
- Atomic facts with citations
- Source URLs
- APA bibliography  
- Traceability matrix
- Strength ratings

**Key:** Claims include specific URLs pointing to evidence

---

### Step 2: Extractor Agent Retrieves (Lightweight model)

**Input:** Claims with URLs from Agent 1
**Output:** Actual passages extracted from sources

Agent 2 for each claim:
1. Opens the cited URL
2. Finds relevant passage in source
3. Extracts exact quote/context
4. Returns passage to Agent 3

**Key:** Agent 2 **actually retrieves** source material (prevents citation hallucination)

---

### Step 3: Verifier Agent Compares (Haiku)

**Input:** Claim from Agent 1 + Actual excerpt from Agent 2
**Output:** Verdict (PASS/NEEDS_FIX) with explanation

Agent 3 independently verifies:

**Verification Checks (Haiku compares claim vs actual excerpt):**

✅ **Claim-to-Source Match**
- Does the excerpt actually support the claim?
- Is the claim accurately represented?
- Or is it misquoted/out of context?

✅ **Scope Validity**
- Does excerpt apply to the population described?
- Are limitations honored (geography, timeframe, conditions)?
- Or is the claim overgeneralized?

✅ **Citation Accuracy**
- Is the URL correct?
- Did Agent 2 actually find the passage?
- Or does passage not exist at that URL?

✅ **Quote Integrity**
- If quoted, is quote exact?
- Taken in proper context?
- Or distorted?

✅ **Verdict Options:**

- **PASS** → Claim matches excerpt, properly cited, in scope
- **NEEDS_FIX: Misquoted** → Excerpt says something different
- **NEEDS_FIX: Out of context** → Excerpt is valid but claim overstates it
- **NEEDS_FIX: Not found** → URL doesn't contain claimed passage
- **NEEDS_FIX: Wrong scope** → Excerpt applies to different population/geography/time

### Step 3: Quality Agent Issues Report

Quality Agent generates **Issues Report** with:

```
CHAPTER [ID]: [Title]

ISSUES FOUND: [X]

LINK VALIDATION ISSUES (X found)
├─ URL: [URL] → Status: [404/403/timeout/redirect]
├─ URL: [URL] → Correct domain? No (redirects to X)
└─ URL: [URL] → Status: [403 Forbidden]

CITATION ACCURACY ISSUES (X found)
├─ Fact ID: [F-123] → Quote mismatch
│  ├─ Cited: "[quoted text]"
│  ├─ Actual: "[actual quote from source]"
│  └─ Issue: Out of context / misquoted
├─ Fact ID: [F-145] → Source doesn't support claim
│  ├─ Claim: [claim made]
│  ├─ Source: [source title]
│  └─ Issue: Source discusses X, not Y
└─ Fact ID: [F-167] → Unsupported assertion
   └─ Issue: No source found supporting this claim

FACT VERIFICATION ISSUES (X found)
├─ Statistic: [stat] → Outdated
│  ├─ Source says: [old stat] (year: X)
│  ├─ Current data: [new stat] (year: Y)
│  └─ Fix: Update to current figure
├─ Definition: [term] → Doesn't match authoritative source
│  └─ Fix: Use [authoritative source] definition instead
└─ Name/Date: [fact] → Accuracy unclear
   └─ Issue: Needs verification/clarification

SOURCE TIER ISSUES (X found)
├─ [Source title] → Marked Tier A but is secondary source
├─ [Source title] → Tier B source lacks credibility
│  └─ Issue: Self-published, not peer-reviewed
└─ [Source title] → Tier C with limited scope

STRENGTH RATING ISSUES (X found)
├─ Fact ID: [F-123] → Claims "Definitive" with weak evidence
│  ├─ Evidence: [evidence description]
│  └─ Fix: Downgrade to "Provisional" or add stronger evidence
└─ Fact ID: [F-145] → Claims "Provisional" despite strong evidence
   └─ Fix: Upgrade to "Definitive" or clarify evidence limitations

SCOPE NOTE ISSUES (X found)
├─ Fact: [fact] → Scope too broad
│  ├─ Scope says: [overly broad scope]
│  └─ Fix: Limit to [actual population/geography/timeframe]
└─ Fact: [fact] → Scope incomplete
   ├─ Source applies to: [specific population]
   └─ Fix: Add population/geography/timeframe clarity

SUMMARY
├─ Total issues: X
├─ Critical (breaking errors): X
├─ Important (needs fixing): X
└─ Minor (clarification needed): X

RECOMMENDATION: [PASS / NEEDS FIXES]
```

### Step 4: Routing Decision

**If PASS:**
- All checks successful
- No broken links
- No factual errors
- All citations accurate
- Chapter research locked

**If NEEDS FIXES:**
- Issues report sent to Research Agent
- Research Agent fixes identified issues
- Returns corrected dossier to Quality Agent
- Quality Agent re-verifies
- Cycle repeats until PASS

### Step 5: Auto-Retry Logic

**For each chapter:**
- Quality Agent verifies → Issues found → Send to Research Agent
- Research Agent fixes and regenerates
- Quality Agent re-verifies
- Max retries: 2 (prevents infinite loops)

**If max retries reached without PASS:**
- Flag chapter as NEEDS_AUTHOR_REVIEW
- Author manually addresses issues
- Can force-approve with author signature

---

## QUALITY AGENT SPECIFICATIONS

### Model & Configuration

- **Model:** `openai:gpt-5` (different family from Research Agent for adversarial perspective)
- **Temperature:** 0.2 (precision over creativity)
- **Role:** Skeptical critic, assumes facts need proof
- **Bias:** Toward being strict, not lenient

### What Quality Agent Does

✅ Validates links (HTTP checks)
✅ Fact-checks against sources  
✅ Verifies citations are accurate
✅ Checks APA formatting
✅ Validates strength ratings
✅ Verifies scope accuracy
✅ Validates counterarguments
✅ Flags unsupported claims

### What Quality Agent Does NOT Do

❌ Generate new research
❌ Suggest new sources
❌ Rewrite content
❌ Approve "good enough" work
❌ Let things slide

---

## AUTOMATION RULES

**Automatic Cycle:**
1. Research Agent completes chapter
2. Quality Agent checks immediately (no wait)
3. If PASS → Auto-lock chapter
4. If NEEDS FIXES → Auto-trigger Research Agent for fixes
5. Repeat until PASS or max retries

**No Manual Bottleneck:**
- Happens between agent layers
- Author doesn't review one-by-one
- Author only sees final locked research or NEEDS_AUTHOR_REVIEW flagged chapters

**Progress Display:**
```
RESEARCH VERIFICATION PROGRESS

S1-C1: ✓ LOCKED (verified)
S1-C2: ✓ LOCKED (verified)
S1-C3: ⟳ CYCLE 2/2 (Quality checking...)
S2-C1: ⚠ NEEDS_AUTHOR_REVIEW (2 retry cycles failed)
S2-C2: ⟳ CYCLE 1/2 (Research regenerating after QA feedback)
S2-C3: ⏳ QUEUED (waiting for Research Agent)
S3-C1: ✓ LOCKED (verified)

Progress: 2 locked, 1 in author review, 3 in agent cycle, 1 queued
```

---

## COMPLETION CRITERIA

Research with Quality verification complete when:

- [ ] All chapters generated by Research Agent
- [ ] All chapters verified by Quality Agent
- [ ] All links valid and accessible
- [ ] All facts verified against sources
- [ ] All citations accurate and complete
- [ ] All strength ratings justified
- [ ] All scope notes accurate
- [ ] All counterarguments credible
- [ ] Chapters either LOCKED or NEEDS_AUTHOR_REVIEW
- [ ] Max retry cycles respected
- [ ] No chapters in infinite retry loop

---

## NEXT STEP

Once all chapter research locked with verification complete, External Stories Integration begins.

---
