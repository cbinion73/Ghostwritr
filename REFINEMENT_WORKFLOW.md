# Promise Refinement Workflow with AI Optimization

## What's Fixed & Improved

### 1. Enhanced Gemini Market Research ✅
**Before:** "Unable to determine market size" / "Growth analysis pending"

**Now:** 
- Extracts actual topic from your promise
- Prompts Gemini with specific market research questions
- Asks for real book titles, sales data, market size estimates
- Better parsing of comparable books
- Returns specific demand signals and audience validation

### 2. New "Refine with AI" Button ✅
**The Loop:**
1. Click "Validate Promise" → See Persona/Market/Quality scores + gaps
2. Click "Refine with AI" → Claude improves the promise based on feedback
3. Updated promise appears in textarea
4. Click "Save Promise" → Auto-validates with new version
5. See if scores improved
6. Repeat until all three ≥ 8/10

### 3. AI-Powered Refinement ✅
Uses **Claude Opus** (best reasoning) to:
- Extract validation gaps from your scores
- Rewrite promise addressing weak areas
- Keep structure and essence
- Make it stronger at persona alignment + market positioning + specificity
- Maintain credibility while improving differentiation

## Workflow

```
[Validate Promise]
    ↓
See Scores + Gaps (Persona: 0, Market: 10, Quality: 23)
    ↓
[Refine with AI] ← NEW
    ↓ (Claude analyzes gaps)
Improved promise appears in textarea
    ↓
[Save Promise] ← Auto-validates
    ↓
Updated Scores (Persona: 25?, Market: 35?, Quality: 55?)
    ↓
Better! Keep refining...
    ↓
[Refine with AI] again
    ↓
Iterate until all ≥ 80
    ↓
✓ Ready to Commit
```

## How It Works

### Validation Step
- Gemini researches actual market (comparable books, market size, trends)
- Local scoring evaluates persona fit, market viability, promise quality
- Dashboard shows gaps in red (✗) and successes in green (✓)

### Refinement Step
1. You click "Refine with AI"
2. System extracts all gaps from validation scores
3. Sends to Claude Opus with current promise
4. Claude rewrites it to address gaps:
   - Better audience persona alignment
   - Stronger market differentiation
   - More specific outcomes
   - Increased credibility
5. Updated promise loads into textarea
6. You review changes
7. Click "Save Promise" → Auto-validates with new version

### Auto-Validation
- After saving refined promise, validation runs automatically
- Shows whether refinement improved scores
- If scores went up → Right direction
- If scores unchanged → May need different approach
- Keep refining until all three ≥ 80

## The Optimization (Multi-Model Strategy)

| Task | Model | Why |
|------|-------|-----|
| Generate Template | Claude | Prose generation |
| Market Research | Gemini | Web search, grounding |
| Validate Scores | Local | Fast, free heuristics |
| **Refine Promise** | **Claude Opus** | **Complex reasoning, promise rewriting** |

Using Claude Opus for refinement because:
- Better at understanding nuanced feedback
- Stronger at maintaining voice while improving
- Excellent at trade-offs (specificity vs. credibility)
- Good for creative problem-solving

## Example Flow

**Start:**
- Persona Match: 0/100 (⚠ No personas defined yet)
- Market Viability: 10/100 (✗ No comparable books found)
- Promise Quality: 23/100 (⚠ Promise needs enhancement)

↓ Click "Refine with AI"

**Claude Improves:**
```
Original: "This book teaches lab professionals leadership skills"

Refined: "This book gives lab leaders the practical frameworks to move 
from managing by expertise to building high-trust teams that independently 
solve complex problems, measured by reduced turnover and improved team velocity."
```

↓ Click "Save Promise" (auto-validates)

**After Refinement:**
- Persona Match: 15/100 (Improved! Addresses specific audience role)
- Market Viability: 25/100 (Gemini found 3 comparable titles)
- Promise Quality: 45/100 (More specific, better differentiated)

↓ Repeat until ready to commit

## Status

✅ Validation with Gemini market grounding
✅ AI-powered promise refinement with Claude
✅ Auto-validation on save to track improvements
✅ Clear feedback loop for iterative improvement
✅ Ready for production use

## Next: Refine & Commit

1. Click **Validate Promise** → See gaps
2. Click **Refine with AI** → Claude improves
3. Click **Save Promise** → Auto-validates
4. Repeat until all 3 scores ≥ 80
5. Click **Commit** → Lock promise, move to next stage
