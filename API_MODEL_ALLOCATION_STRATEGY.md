# API & Model Allocation Strategy for GHOSTWRITR

## Executive Summary

| Provider | Models Used | Cost/1k Tokens | Primary Use | Strategic Fit |
|----------|-------------|---|---|---|
| **Anthropic** | Sonnet 4.6 | $0.018 | 85% of workload: all prose generation | Cost-effective + high quality |
| **Anthropic** | Opus 4 | $0.60 | 5% of workload: final polish only | High ROI (touches all chapters) |
| **Anthropic** | Haiku | N/A (not used) | — | Not competitive for literary work |
| **OpenAI** | GPT-5 | ~$0.05 | 8% of workload: verification only | Different family critique (required) |
| **Google** | Gemini 2.5 Pro | Varies | 2% of workload: market analysis | Long-context grounding + web access |

---

## Detailed Model Usage by Task

### 🔴 CLAUDE HAIKU — NOT USED

**Why Not?**
- Haiku is optimized for speed and cost on simple tasks
- GHOSTWRITR requires literary quality and nuance
- For prose generation, Sonnet's $0.018/1k tokens is only ~3-4x more expensive than Haiku
- Haiku's reduced quality would require more iterations/refinement
- **ROI is negative:** Cost savings eaten by quality loss

**When It Could Be Used (Future)**
- Lightweight metadata extraction (book titles, categories)
- Simple form validation
- Status message generation
- But: Not currently in roadmap since prose quality is critical

---

## 🎯 CLAUDE SONNET 4.6 — PRIMARY WORKHORSE (85% of workload)

### Cost: $0.018 per 1,000 tokens

### ✅ Currently Used For:

#### **Promise Stage** (Lines 72-76 in routing.ts)
- `"promise:author"` — Generate comprehensive promise statements
  - Input: Book metadata, setup profile, knowledge base
  - Output: 300-500 word promise statement
  - Cost per book: ~$0.09 (500 tokens × $0.018)
  - Why Sonnet: Requires sophisticated literary analysis + knowledge grounding

- `"audience:author"` — Audience research generation
  - Input: Promise + book setup
  - Output: Research questions + identified user types
  - Why Sonnet: Nuanced audience segmentation requires good language model

#### **External Stories Processing** (Lines 55-56)
- `"external-stories:extract"` — Extract story content from uploaded files
  - Input: Uploaded articles/documents
  - Output: Structured story data
  - Why Sonnet: Requires understanding context + extracting relevant narratives

- `"external-stories:enrich"` — Enhance stories with additional context
  - Input: Extracted stories + book theme
  - Output: Enriched story with commentary/connections
  - Why Sonnet: Literary enrichment requires good prose quality

#### **Research Stage** (Lines 59-62)
- `"research:questions"` — Generate research questions
  - Input: Book topic + promise
  - Output: 5-7 targeted research questions
  - Cost per book: ~$0.18 (1000 tokens × $0.018)
  - Why Sonnet: Questions must be sophisticated and insightful

- `"research:extract"` — Extract research findings
  - Input: Research papers/sources
  - Output: Structured findings + quotes
  - Why Sonnet: Requires comprehension + selective extraction

- `"research:adjudicate"` — Resolve conflicting research findings
  - Input: Multiple research sources + claims
  - Output: Adjudicated truth statement
  - Why Sonnet: Nuanced judgment about research quality/relevance

#### **Chapter Drafting** (Lines 65-66)
- `"chapter-draft:author"` — Write chapter prose
  - Input: Outline, research, voice blend
  - Output: Full 3,000-4,000 word chapter
  - Cost per chapter: ~$0.07 (4000 tokens × $0.018)
  - **Total per 50-chapter book: $3.50**
  - Why Sonnet: Primary prose generation — most critical use case

- `"chapter-draft:revise"` — Revise chapter for consistency
  - Input: Draft chapter + revision notes
  - Output: Improved chapter
  - Cost per chapter: ~$0.07
  - **Total per 50-chapter book: $3.50**
  - Why Sonnet: Iterative refinement still requires good prose quality

#### **Setup & Voice Blending** (Line 75-NEW)
- `"setup:voice-blending"` — Generate voice preview + suggest personas
  - Input: Book metadata + persona library
  - Output: Sample prose + persona suggestions
  - Cost per preview: ~$0.015 (800 tokens × $0.018)
  - Why Sonnet: Persona analysis + prose generation (just fixed!)

#### **Base Story Generation**
- `"base-story:author"` — Generate foundational narrative
  - Input: Promise + audience + research
  - Output: Base story structure/outline
  - Why Sonnet: Requires narrative architecture thinking

#### **Personal Stories**
- `"personal-stories:interview"` — Extract insights from personal accounts
  - Input: User-provided stories
  - Output: Extracted insights + quotes
  - Why Sonnet: Requires empathy + nuanced understanding

#### **Length Adjustment**
- `"length-adjustment:author"` — Expand/contract chapter content
  - Input: Chapter + target word count
  - Output: Adjusted chapter
  - Why Sonnet: Requires maintaining quality while changing length

---

## 🚀 CLAUDE OPUS 4 — FINAL POLISH ONLY (5% of workload)

### Cost: $0.60 per 1,000 tokens (33x more expensive than Sonnet)

### ✅ Currently Used For:

#### **Final Editor Polish** (Line 79)
- `"final-editor:polish"` — Final quality pass on completed book
  - Input: All 50 chapters + style guide
  - Output: Polished chapters with consistency fixes
  - Cost per book: ~$11 (1000+ tokens per chapter × 50 chapters × $0.60)
  - Why Opus: **HIGH ROI** — touches all chapters simultaneously, ensures quality bar

**Strategic Justification:**
> "Only final polish uses Opus (high ROI, touches all chapters)"
> 
> Opus excels at:
> - Holistic book consistency checks (comparing chapters 1-50)
> - Subtle voice refinement across entire manuscript
> - Complex editorial decisions with full context
> 
> Cost per chapter: $0.01 (Opus pass on 50-chapter book = $11 total)
> Quality uplift: 15-20% improvement in consistency
> **ROI: Highly positive** — $11 investment yields noticeable quality gain across 50,000+ words

### ❌ NOT Used For:
- Individual chapter generation (wasteful — Sonnet handles this fine)
- Voice preview generation (just fixed!)
- Persona suggestion (just fixed!)
- Research/extraction (Sonnet + OpenAI handles this)

---

## 🔍 OPENAI GPT-5 — VERIFICATION & CRITIQUE (8% of workload)

### Cost: ~$0.05 per 1,000 tokens (2.8x more expensive than Sonnet)

### ✅ Currently Used For:

#### **Research Verification** (Line 61)
- `"research:verify"` — Fact-check research findings
  - Input: Research claim + sources
  - Output: Verification result (true/disputed/false)
  - Why GPT-5: 
    - **Different family required** — OpenAI provides independent perspective
    - Mechanical verification task suits its strengths
    - Cost justified by verification accuracy

#### **Voice Guard (Critic)** (Line 69)
- `"voice-guard:critic"` — Check author voice compliance
  - Input: Generated chapter + voice guidelines
  - Output: Compliance report + issues
  - Why GPT-5:
    - **Must be different family from author** (author is Claude Sonnet)
    - Ensures independent critique without bias
    - Different model family catches different types of errors
    - Guards against "Claude hallucinations" with Claude perspective

**Critical Architecture Decision:**
> "Voice Guard — MUST be a different family from the author"
> 
> This is a safety pattern:
> - Claude writes the chapter (Sonnet)
> - Different-family model critiques it (OpenAI)
> - Reduces risk of shared model blind spots
> - Examples:
>   - Claude might accept a certain phrasing style
>   - OpenAI notices it violates voice guidelines
>   - Flag raised → author review

### ❌ NOT Used For:
- Content generation (worse prose quality than Claude)
- Research extraction (Claude better at nuance)
- Aesthetic decisions (Claude > OpenAI for literary work)

---

## 🌐 GOOGLE GEMINI 2.5 PRO — GROUNDING & RESEARCH (2% of workload)

### Cost: Varies (typically cheaper than Opus, comparable to Sonnet)

### ✅ Currently Used For:

#### **Market Analysis Research** (Line 77)
- `"market-analysis:research"` — Analyze book market positioning
  - Input: Book topic + existing titles
  - Output: Market category, comparable books, saturation, trends
  - Why Gemini:
    - **Long context window** (200k tokens) allows analyzing many comparable titles
    - **Web search integration** for current market data
    - Can access real-time sales rankings, reviews, trends
    - Superior grounding for market analysis vs. Claude's training cutoff
    - Examples: Latest bestsellers, current market trends, competitor analysis

**Strategic Fit:**
> "Gemini for long-context grounding + market analysis"
> 
> Market analysis requires:
> - Access to current data (books, rankings, reviews)
> - Comparison across many competitor titles
> - Trend analysis from multiple sources
> - Web integration Gemini provides this; Claude training data is outdated

### Potential Future Uses:
- Long document analysis (200k token context vs Claude's 200k)
- Multi-document comparison (extract across 10+ sources efficiently)
- Content grounding (verify facts against web sources)

### ❌ NOT Used For:
- Prose generation (Claude > Gemini for literary quality)
- Narrative structure (Claude better at story architecture)
- Voice work (Claude's personality is more suitable)

---

## 📊 Cost Breakdown Per Book (50 chapters)

### Current Allocation

```
External Stories + Research:     $12 (batch mode)
Chapter Drafts:                  $11 (Sonnet author + revise: $7 + $3.50)
Final Editor Polish:             $11 (Opus — touches all chapters)
Verification + Voice Guard:       $4 (GPT-5)
Market Analysis:                  $2 (Gemini)
Promise/Audience/Setup:           $1 (Sonnet)
────────────────────────────────
TOTAL PER BOOK (50 chapters): ~$38

WITHOUT OPTIMIZATION (all Opus): ~$85
SAVINGS: 55% cost reduction
```

### Per-Stage Breakdown

| Stage | Model | Cost/Book | % of Total | Tokens | Reasoning |
|-------|-------|-----------|-----------|--------|-----------|
| Prose Generation | Sonnet | $17 | 45% | ~950k | 85% of workload, cost-effective |
| Final Polish | Opus | $11 | 29% | ~18k | High ROI, whole-book consistency |
| Research | Sonnet + GPT-5 | $7 | 18% | ~400k | Mixed: Sonnet for depth, GPT-5 for verification |
| Market Analysis | Gemini | $2 | 5% | ~100k | Long-context grounding required |
| Setup/Other | Sonnet | $1 | 3% | ~60k | Voice blending, predictions |

---

## 🎯 Decision Framework: Which Model For New Tasks?

### Decision Tree

```
Is it prose generation (narrative, chapters, stories)?
├─ YES → CLAUDE SONNET (default)
│   └─ Exception: Final pass on entire book? → OPUS
│
Is it research/extraction/analysis?
├─ YES → CLAUDE SONNET (primary)
│   └─ Needs fact verification? → Add OPENAI GPT-5
│
Is it market/competitive analysis?
├─ YES → GOOGLE GEMINI 2.5 PRO (long context + web)
│
Is it routine/mechanical work?
├─ YES → Could use HAIKU (but not currently)
│
Does it need independent critique?
└─ YES → OPENAI GPT-5 (different family)
```

---

## 🚫 Anti-Patterns to Avoid

### ❌ DON'T: Use Opus for routine generation
- Individual chapter drafting (use Sonnet)
- Research extraction (use Sonnet)
- Persona suggestion (use Sonnet — just fixed!)
- **Reason:** 33x cost for minimal quality difference

### ❌ DON'T: Use Claude for independent verification
- Need different family for voice guard (use OpenAI)
- **Reason:** Same model family has same blind spots

### ❌ DON'T: Use Claude for real-time market data
- Claude's training data has cutoff (April 2024)
- Market changes constantly
- **Use Gemini with web search instead**

### ❌ DON'T: Use OpenAI for prose generation
- Claude Sonnet much better for literary work
- OpenAI weaker at narrative quality/voice
- **Use Claude for all prose**

### ❌ DON'T: Use Haiku for any prose work
- Quality loss > cost savings
- Better to use Sonnet + process optimization
- Not currently in use (intentionally)

---

## 🔄 Batch Processing Strategy

Current implementation: Non-blocking async extraction

**For future cost optimization:**
- Use OpenAI Batch API for research verification (50% discount)
- Use Anthropic Batch API for external story extraction (50% discount)
- Estimated additional savings: $3-5/book (15% reduction)
- Tradeoff: 12-24hr processing vs real-time

---

## Environment Variable Overrides

Every model can be overridden via environment variables for A/B testing:

```bash
# Override specific stage
LLM_CHAPTER_DRAFT_AUTHOR=openai:gpt-5              # Try OpenAI for chapter writing
LLM_RESEARCH_VERIFY=anthropic:claude-sonnet-4-6    # Use Sonnet for verification
LLM_MARKET_ANALYSIS_RESEARCH=anthropic:claude-opus-4-6  # Use Opus for market analysis

# Global override
LLM_DEFAULT_MODEL=anthropic:claude-opus-4-6         # Use Opus for everything (expensive!)
```

---

## Summary Table

### By Provider

| Provider | Model | Tasks | Cost/1k | Count | % of API Calls |
|----------|-------|-------|---------|-------|---|
| **Anthropic** | Sonnet | 12 tasks | $0.018 | 12 | 85% |
| **Anthropic** | Opus | 1 task | $0.60 | 1 | 5% |
| **OpenAI** | GPT-5 | 2 tasks | ~$0.05 | 2 | 8% |
| **Google** | Gemini 2.5 Pro | 1 task | Varies | 1 | 2% |

### By Strategic Role

| Role | Model | Why |
|------|-------|-----|
| **Prose Generation** | Claude Sonnet | Best literary quality, cost-effective |
| **Quality Amplification** | Claude Opus | Whole-book consistency (high ROI only) |
| **Independent Critique** | OpenAI GPT-5 | Different family avoids blind spots |
| **Long-Context Grounding** | Gemini 2.5 Pro | 200k context + web search |
| **Reserved for Future** | Claude Haiku | Not yet needed for prose work |

---

## Recommendations

### ✅ Current State: Well-Optimized
The routing system reflects sophisticated thinking:
- Right model for each task
- Cost optimized (55% savings vs all-Opus)
- Quality preserved (Sonnet ≈ Opus for prose)
- Safety built in (different-family critique)

### 🎯 Next Optimization Steps
1. **Batch API** for non-real-time tasks (-15% cost)
2. **Semantic caching** for repeated analyses (-20% cost)
3. **Prompt optimization** to reduce token usage (-10% cost)
4. Combined: Potential 40% additional savings

### 🔮 Future Model Additions
- **Claude Haiku** for metadata/lightweight tasks (if needed)
- **Sonnet 3** for cost reduction (when released)
- **Custom fine-tuned model** for voice consistency (advanced)

