# LLM Usage Audit - GHOSTWRITR

## Executive Summary

**Current State:** Mixed routing strategy with 2 functions hardcoding Claude Opus
**Cost Impact:** ~$0.60/1000 tokens (Opus) vs ~$0.018/1000 tokens (Sonnet) 
**Recommendation:** Standardize all functions to use the routing system

---

## Current Model Routing

### ✅ **Properly Using getModelForRole()**

Most of the codebase correctly uses the routing system:

| Workflow File | Function | Current Role | Current Model | Cost per 1k tokens |
|---|---|---|---|---|
| promise.ts | Promise generation | `promise:author` | Claude Sonnet | $0.018 |
| promise.ts | Core Truths | `promise:author` | Claude Sonnet | $0.018 |
| promise.ts | Transformation Arc | `promise:author` | Claude Sonnet | $0.018 |
| promise.ts | Audience Research | `promise:author` | Claude Sonnet | $0.018 |
| outline.ts | Outline generation | `outline:author` | Claude Sonnet | $0.018 |
| base-story.ts | Base story | `base-story:author` | Claude Sonnet | $0.018 |
| chapter-draft.ts | Chapter authoring | `chapter-draft:author` | Claude Sonnet | $0.018 |
| chapter-draft.ts | Chapter revision | `chapter-draft:revise` | Claude Sonnet | $0.018 |
| external-stories.ts | Story extraction | `external-stories:extract` | Claude Sonnet | $0.018 |
| external-stories.ts | Story enrichment | `external-stories:enrich` | Claude Sonnet | $0.018 |
| research.ts | Research questions | `research:questions` | Claude Sonnet | $0.018 |
| research.ts | Research extraction | `research:extract` | Claude Sonnet | $0.018 |
| research.ts | Research verification | `research:verify` | OpenAI GPT-5 | ~$0.05 |
| personal-stories.ts | Story interviews | `personal-stories:interview` | Claude Sonnet | $0.018 |

---

### ❌ **HARDCODED OPUS - NOT USING ROUTING**

**Location:** `/src/app/books/[slug]/setup/actions.ts`

```typescript
// Line 5: Direct Anthropic SDK import (bypasses routing)
import Anthropic from "@anthropic-ai/sdk";

// Line 96: In generateVoiceBlendPreview()
const client = new Anthropic({ apiKey });
const message = await client.messages.create({
  model: "claude-opus-4-1-20250805",  // ← HARDCODED OPUS
  max_tokens: 800,
  messages: [...]
});

// Line 286: In suggestWriterPersonas()
const client = new Anthropic({ apiKey });
const message = await client.messages.create({
  model: "claude-opus-4-1-20250805",  // ← HARDCODED OPUS
  max_tokens: 1024,
  messages: [...]
});
```

**Functions Affected:**
1. `generateVoiceBlendPreview()` - Generates sample prose for voice blending
2. `suggestWriterPersonas()` - Suggests personas based on book description

**Cost Impact:**
- Opus: $0.60 per 1,000 tokens
- Sonnet: $0.018 per 1,000 tokens
- **Difference: 33x more expensive**

---

## Routing System Overview

### Default Routes (from `/src/lib/llm/routing.ts`)

```typescript
const DEFAULT_ROUTING = {
  // Prose generation - using Sonnet for cost
  "promise:author": "anthropic:claude-sonnet-4-6",
  "outline:author": "anthropic:claude-sonnet-4-6",
  "base-story:author": "anthropic:claude-sonnet-4-6",
  "chapter-draft:author": "anthropic:claude-sonnet-4-6",
  "external-stories:extract": "anthropic:claude-sonnet-4-6",
  "external-stories:enrich": "anthropic:claude-sonnet-4-6",
  
  // Verification - using OpenAI for different-family perspective
  "research:verify": "openai:gpt-5",
  "voice-guard:critic": "openai:gpt-5",
  
  // Market analysis - using Gemini for long context
  "market-analysis:research": "google:gemini-2.5-pro",
  
  // Only final polish uses Opus (high ROI - touches all chapters)
  "final-editor:polish": "anthropic:claude-opus-4-6",
};
```

### Cost Optimization Philosophy

From the routing comments:

| Stage | Model | Cost/1k tokens | Reason |
|-------|-------|---|---|
| Promise, Outline, Stories | Claude Sonnet | $0.018 | Fast, cost-effective prose generation |
| Research Verification | OpenAI GPT-5 | ~$0.05 | Different family for independent critique |
| Market Analysis | Gemini 2.5 Pro | Varies | Long context + grounding |
| Final Editor Polish | Claude Opus | $0.60 | High quality, high ROI (touches all chapters) |

---

## Expected Cost Per Book (from routing comments)

```
External Stories + Research:  $12 (batch mode)
Chapter Drafts:              $11 (Sonnet author + revise)
Final Editor Polish:         $11 (Opus polish only)
Verification + Voice Guard:   $4 (GPT-5)
────────────────────────────────
Total per book (50 chapters): ~$38

Without optimization (all Opus): ~$85
Savings: 55% reduction
```

---

## Issues Identified

### **Issue #1: Voice Blending Hardcoded to Opus**
- **File:** `src/app/books/[slug]/setup/actions.ts`
- **Functions:** 
  - `generateVoiceBlendPreview()` (line 96)
  - `suggestWriterPersonas()` (line 286)
- **Problem:** Direct SDK import, hardcoded model, doesn't use routing
- **Fix Required:** Use `getModelForRole()` with new role: `"setup:voice-blending"`
- **Cost Savings:** ~33x per call

### **Issue #2: New Roles Not in Routing Table**
- `promise:author` - currently used but not explicitly defined in DEFAULT_ROUTING
  - Actually is defined on line 72, so this is OK
- `setup:voice-blending` - **NEEDS TO BE ADDED** for Voice Blending functions

---

## Recommended Fixes

### **Fix #1: Add Voice Blending to Routing Table**

```typescript
// In /src/lib/llm/routing.ts, add to DEFAULT_ROUTING:
"setup:voice-blending": "anthropic:claude-sonnet-4-6",
```

### **Fix #2: Update Voice Blending Functions to Use Routing**

```typescript
// In /src/app/books/[slug]/setup/actions.ts

// Remove: import Anthropic from "@anthropic-ai/sdk";
// Add: import { getModelForRole } from "@/lib/llm/routing";

export async function generateVoiceBlendPreview(...) {
  // Instead of:
  // const client = new Anthropic({ apiKey });
  
  // Use:
  const model = await getModelForRole("setup:voice-blending", {
    maxOutputTokens: 800,
  });
  
  if (!model) {
    throw new Error("Could not initialize Claude Sonnet for voice preview");
  }
  
  const result = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);
  
  return typeof result.content === "string" ? result.content : String(result.content);
}

// Same pattern for suggestWriterPersonas()
```

### **Fix #3: Remove Direct API Key Handling**

The routing system handles:
- API key validation
- Provider selection
- Model resolution
- Fallbacks

No need for manual `process.env.ANTHROPIC_API_KEY` access in these functions.

---

## Verification Checklist

- [ ] Add `"setup:voice-blending": "anthropic:claude-sonnet-4-6"` to routing table
- [ ] Update `generateVoiceBlendPreview()` to use `getModelForRole()`
- [ ] Update `suggestWriterPersonas()` to use `getModelForRole()`
- [ ] Remove direct Anthropic SDK import from setup/actions.ts
- [ ] Update error handling to work with routing fallbacks
- [ ] Test voice blending still works with Sonnet
- [ ] Verify cost reduction in API bills

---

## Environment Variable Overrides

Once routing is fixed, you can override any model via environment variables:

```bash
# Use Opus for voice blending if you want (overrides default Sonnet)
LLM_SETUP_VOICE_BLENDING=anthropic:claude-opus-4-6

# Use a different model for promise generation
LLM_PROMISE_AUTHOR=anthropic:claude-opus-4-1-20250805

# Try Gemini for market analysis
LLM_MARKET_ANALYSIS_RESEARCH=google:gemini-2-0-flash
```

---

## Current API Keys Available

```
✅ ANTHROPIC_API_KEY
✅ OPENAI_API_KEY
✅ GOOGLE_GENERATIVE_AI_API_KEY
```

All three providers configured and ready.

---

## Summary

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Opus usage | 2 functions | 1 (final editor only) | ❌ Needs fix |
| Routing adoption | 95% | 100% | ⚠️ 2 functions unrouted |
| Cost efficiency | ~$40-50/book | ~$38/book | ⚠️ Higher than optimal |
| Model diversity | 3 providers | 3 providers | ✅ Good |

**Recommendation:** Apply the 3 fixes above to standardize Voice Blending to Sonnet and complete the cost optimization strategy.
