# Promise Validation Framework Implementation

## Overview
The promise validation system uses **Gemini for market grounding** to validate book promises across three dimensions with 8/10 minimum scores required for commitment.

## Architecture

### Three Validation Dimensions

#### 1. **Persona Match** (80/100 minimum)
- End user validation: Are these real practitioners?
- Pain point specificity: 3+ specific, validated pain points
- Promise alignment: Does promise address their pain points?
- Buying power: Can they actually purchase books?

#### 2. **Market Viability** (80/100 minimum)  
- Market size & demand: Growing market with clear audience
- Comparable titles: 5+ successful books in space
- Differentiation: Clear gap this promise fills
- Audience reachability: Multiple channels to reach buyers

#### 3. **Promise Quality** (80/100 minimum)
- Specificity: Clear outcome + mechanism
- Differentiation: Ownable, unique positioning
- Credibility: Realistic and achievable
- Problem priority: Addresses high-priority market problem

## Files Created

### Validation Core
- **`src/lib/validation/promise-validator.ts`**
  - Scoring algorithms for all three dimensions
  - Triangulation validation logic
  - Score aggregation and readiness determination

- **`src/lib/validation/gemini-market-research.ts`**
  - `performGeminiMarketResearch()` - Uses Gemini to research comparable books, market size, trends
  - `validatePromiseStrengthWithGemini()` - Gets Gemini's expert assessment of promise
  - Parses Gemini responses into structured data

### UI Components
- **`src/app/books/[slug]/promise/validation-dashboard.tsx`**
  - Displays all three validation scores with visual progress bars
  - Shows breakdown of each dimension
  - Displays Gemini market research findings
  - Triangulation status and improvement suggestions

- **`src/app/books/[slug]/promise/promise-tabs.tsx`** (Updated)
  - Added "Validate Promise" button to Promise tab
  - Shows ValidationDashboard when scores available
  - Integration with validation workflow

### Server Actions
- **`src/app/books/[slug]/promise/actions.ts`** (Updated)
  - `validatePromise(slug)` - Main validation orchestrator
  - Calls Gemini market research
  - Transforms data for scoring
  - Returns full ValidationScores object

## How It Works

### User Flow
1. **Generate/Edit Promise** → "Generate Template" or manually edit
2. **Click "Validate Promise"** → Triggers validation
3. **Gemini Analyzes** → Searches comparable books, market size, trends
4. **Scores Calculate** → All three dimensions scored 0-100
5. **Dashboard Shows** → Visual breakdown + improvement suggestions
6. **Iterate** → Refine promise based on feedback, validate again
7. **Commit** → Once all three are 8/10+, ready to proceed

### Gemini's Role (Grounding)
Gemini is used for **market grounding** because it:
- Researches and validates real comparable books
- Provides market size and trend analysis
- Identifies commercial viability signals
- Gives expert assessment of promise strength
- Finds audience validation (communities, demand signals)

Results are structured and fed into validation scoring.

## Setup Requirements

### Environment Variables
```env
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
```

### Dependencies
Added to `package.json`:
```json
"@google/generative-ai": "^0.12.0"
```

Install with:
```bash
npm install
```

## Validation Scores Structure

```typescript
ValidationScores {
  personaMatch: {
    score: 0-100
    breakdown: { endUserValidation, painPointSpecificity, promiseAlignment, buyingPower }
    feedback: string[]
  }
  marketViability: {
    score: 0-100
    breakdown: { marketSize, comparableTitles, differentiation, reachability }
    feedback: string[]
    marketResearch: { // From Gemini
      marketSize: string
      trends: string
      comparableBooks: string[]
    }
  }
  promiseQuality: {
    score: 0-100
    breakdown: { specificity, differentiation, credibility, problemPriority }
    feedback: string[]
  }
  triangulation: {
    isAligned: boolean
    gaps: string[]
    suggestions: string[]
  }
  isReady: boolean  // true when all three >= 80
  lastValidated: Date
}
```

## Workflow Integration

The validation fits into your broader workflow:
1. **Promise Stage** ← You are here (can now validate)
2. Validation determines readiness
3. Market Analysis tab shows validation results
4. User can iterate on promise or commit
5. Commitment locks promise and progresses to next stage

## Future Enhancements

- [ ] Store validation history (track iteration)
- [ ] A/B test different promise variations
- [ ] Integration with actual Amazon/BookDepository APIs for real-time sales data
- [ ] Personas integration (validate personas separately)
- [ ] Persona-promise alignment scoring
- [ ] Export validation report as PDF

## Testing

To test the validation:
1. Generate a promise using "Generate Template"
2. Click "Validate Promise"
3. Gemini researches the market for "Lab Leadership" books
4. Scores appear with breakdown
5. Try refining the promise and validating again
6. Watch scores change based on improvements

## Notes

- Validation is **non-blocking** (user can save before validating)
- Scores are **recalculated on demand** (not stored, re-run each validation)
- Gemini research **includes web search** for current market data
- All feedback is **actionable** and specific to the promise
