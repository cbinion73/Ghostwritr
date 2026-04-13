# Research Quality Agent - Adversarial Verification
## Automated Fact-Checking & Link Validation Loop

---

## PHASE OVERVIEW

After research generation completes per chapter, an adversarial Quality Agent independently verifies all facts, links, and information.

The Quality Agent acts as a **skeptical critic**, catching errors that might slip through generation. If issues are found, it flags them and sends the chapter back to the Research Agent for correction.

This creates a **closed-loop verification cycle**: Research Agent → Quality Agent → [pass/flag back] → repeat until verified.

---

## WORKFLOW

### Step 1: Research Agent Generates

Agent 1 creates research dossier per chapter with:
- Facts, citations, sources
- APA bibliography
- Traceability matrix
- Strength ratings

### Step 2: Quality Agent Verification (Adversarial)

Quality Agent independently checks **every fact** in the research dossier:

**1) Link Validation**
- Verify each URL in bibliography is:
  - Valid URL format (https://, http://)
  - Accessible (HTTP 200 response, not 404/403/410)
  - Not redirecting to wrong domain
  - Not timing out or blocking crawlers
- Flag broken, inaccessible, or redirected links

**2) Citation Accuracy**
- Match cited fact to actual source content
- Verify quote is accurate (not misquoted or out of context)
- Verify scope: does source actually support this claim?
- Check if interpretation is faithful to source
- Flag: misquotes, out-of-context claims, unsupported assertions

**3) Fact Verification**
- Cross-reference atomic facts against sources
- Verify statistics are current/accurate
- Check dates, names, numbers for accuracy
- Verify definitions match authoritative sources
- Flag: outdated info, factual errors, unsupported claims

**4) APA Bibliography Validation**
- Check each citation has:
  - Author name(s)
  - Publication year
  - Title
  - DOI or stable URL
  - Format matches APA 7th edition
- Flag: incomplete citations, formatting errors, missing info

**5) Counterargument Validation**
- Verify counterarguments are real (not strawman versions)
- Check evidence supporting each counterpoint
- Ensure counterpoints are credible/well-sourced
- Flag: fake counterarguments, misrepresented opposing views

**6) Source Tier Verification**
- Verify Tier A sources are actually primary/authoritative
- Verify Tier B sources are credible secondary sources
- Flag: sources assigned wrong tier, questionable sources in any tier

**7) Strength Rating Justification**
- Verify strength ratings match evidence quality
- "Definitive" claims require strong evidence
- "Provisional" claims properly flagged
- Flag: overstated claims, unjustified confidence levels

**8) Scope Notes Accuracy**
- Verify scope notes accurately describe:
  - Population (who/what was studied)
  - Geography (where findings apply)
  - Timeframe (when this is true)
  - Conditions (under what circumstances)
- Flag: misleading scope claims, overgeneralized findings

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
