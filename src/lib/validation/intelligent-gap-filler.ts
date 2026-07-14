import type { PromiseBrief, PersonaPack, MarketReport } from "@/lib/promise-types";
import type { ValidationScores } from "./promise-validator";
import { invokeValidationText } from "./validation-llm";

/**
 * INTELLIGENT GAP-FILLING AGENT SYSTEM (OPTIMIZED)
 *
 * This system understands the validation rubric deeply and fills gaps intelligently:
 * 1. Analyzes validation scores to identify what's failing
 * 2. Generates targeted improvements in SINGLE PARALLEL PASS
 * 3. Returns improved artifacts ready to save
 *
 * KEY OPTIMIZATION: Only 3 Gemini calls in parallel (one per dimension)
 */

export interface FilledGaps {
  personas?: PersonaPack;
  promise?: Partial<PromiseBrief>;
  market?: Partial<MarketReport>;
  improvementSummary: {
    personaGaps: string[];
    promiseGaps: string[];
    marketGaps: string[];
  };
}

/**
 * Intelligently fill gaps based on validation scores
 * Makes 3 parallel Gemini calls (one per dimension) for efficiency
 */
export async function fillGapsIntelligently(
  promise: PromiseBrief,
  personas: PersonaPack,
  market: MarketReport,
  validationScores: ValidationScores
): Promise<FilledGaps> {
  // CRITICAL SCORES TO ADDRESS
  const personaScore = validationScores.personaMatch.score;
  const promiseScore = validationScores.promiseQuality.score;
  const marketScore = validationScores.marketViability.score;

  console.log(
    `[fillGapsIntelligently] Current scores - Persona: ${personaScore}, Promise: ${promiseScore}, Market: ${marketScore}`
  );

  // Build individual prompts that are focused and quick
  const fillPersonasPrompt = `You are a user research expert. Based on validation scores, improve the personas.

CURRENT PERSONAS (${personas.personas?.length || 0} personas):
${personas.personas
  ?.slice(0, 2)
  .map((p) => `- ${p.name}: ${p.painPoints?.slice(0, 2).join(", ")}`)
  .join("\n")}

VALIDATION SCORE: ${personaScore}/100
BREAKDOWN: End Users: ${validationScores.personaMatch.breakdown.endUserValidation}, Pain Points: ${validationScores.personaMatch.breakdown.painPointSpecificity}, Alignment: ${validationScores.personaMatch.breakdown.promiseAlignment}, Buying Power: ${validationScores.personaMatch.breakdown.buyingPower}

SCORING RULES TO MATCH:
1. END USER VALIDATION (25 pts if ALL are end users, not managers):
   - Use job titles that show hands-on work (technician, engineer, scientist, specialist)
   - NOT: manager, director, executive (unless also doing hands-on work)
   - Example: "Senior Lab Technician" or "Systems Engineer" (good), "Lab Manager" (bad for this score)

2. PAIN POINT SPECIFICITY (25 pts if 3+ specific per persona):
   - Each persona MUST have 4+ pain points
   - Pain points must be SPECIFIC and MEASURABLE
   - Examples: "Spends 6+ hours weekly on operational coordination", "Loses 4 hours/week to context switching"
   - NOT: "communication challenges", "team issues" (too vague)

3. PROMISE ALIGNMENT (25 pts if promise addresses 3+ pain points):
   - Pain points should directly relate to operational clarity, execution, delegation, team alignment
   - Make pain points that the promise/LabFlow framework can solve
   - Example: "Struggles delegating technical decisions", "Team lacks clear decision authority"

4. BUYING POWER (25 pts if includes decision-maker):
   - At least one persona should have budget authority or influence
   - Example: "VP Engineering controls $100k training budget" or "Has input on tool/resource decisions"

TASK: Generate 3 personas with:
1. Specific name and exact job title (e.g., "Dr. Sarah Chen, Lead Scientist" or "Marcus Rodriguez, Principal Engineer")
2. Context: 1-2 sentences on their role and environment
3. Pain Points: 4 SPECIFIC, MEASURABLE pain points per persona (with numbers/time estimates)
4. At least one persona with clear buying/influence power
5. Ensure pain points align with operational clarity/execution/team leadership themes

Output as JSON array ONLY, no other text. Example format:
[
  {
    "name": "First Last",
    "title": "Exact Job Title",
    "context": "Description of role",
    "painPoints": ["Specific pain 1 with numbers", "Specific pain 2 with numbers", "Specific pain 3", "Specific pain 4"],
    "buyingPower": "Why they can/influence purchase decision"
  }
]`;

  const fillPromisePrompt = `You are a book positioning expert. Based on validation scores, improve the promise statement.

CURRENT PROMISE: "${promise.promiseStatement || "Not yet defined"}"
CURRENT CORE TRUTH: "${promise.coreTruth || "Not yet defined"}"

VALIDATION SCORE: ${promiseScore}/100
BREAKDOWN: Specificity: ${validationScores.promiseQuality.breakdown.specificity}, Differentiation: ${validationScores.promiseQuality.breakdown.differentiation}, Credibility: ${validationScores.promiseQuality.breakdown.credibility}, Problem Priority: ${validationScores.promiseQuality.breakdown.problemPriority}

SCORING RULES TO MATCH:
1. SPECIFICITY (must have ALL three):
   - Include explicit "will" or "enables" or "delivers" (outcome language)
   - Name a specific framework/system/method
   - Use 200+ characters with clear ending (period after complete thought)

2. DIFFERENTIATION (must have):
   - Include "unlike", "instead of", or "not" (comparison language)
   - Explain what makes it different
   - 300+ total characters

3. CREDIBILITY (must have):
   - Include word "practical"
   - Avoid hype: no "guarantee", "instantly", "without effort"
   - Acknowledge this requires implementation effort

4. PROBLEM PRIORITY (must have):
   - Start by stating the problem/challenge/pain clearly
   - Include words: "problem", "challenge", "pain", or "struggle"
   - Show this is HIGH-PRIORITY (not optional)

STRUCTURE TEMPLATE:
"The problem: [state high-priority problem clearly]. This book will [specific outcome using framework/system]. Unlike [comparable approach], this [unique angle]. Through the [FrameworkName], you will [concrete benefit]. This requires practical implementation effort, but [realistic timeline/result]."

TASK: Generate a promise statement that:
- MUST include explicit "will" statement in first sentence
- MUST name the specific framework/system upfront
- MUST include "unlike" or "instead of" for differentiation
- MUST include word "practical"
- MUST start with problem statement
- Keep it 350-450 characters
- Make it compelling and specific

Output ONLY the new promise statement (no quotes, no other text).`;

  const fillMarketPrompt = `You are a market researcher. Based on validation scores, improve the market analysis.

CURRENT MARKET DATA:
- Category: ${market.marketCategory}
- Channels: ${market.attractionDrivers?.length || 0} channels identified
- Comparable: ${market.comparisonTitles?.length || 0} titles

VALIDATION SCORE: ${marketScore}/100
BREAKDOWN: Market Size: ${validationScores.marketViability.breakdown.marketSize}, Comparable Titles: ${validationScores.marketViability.breakdown.comparableTitles}, Differentiation: ${validationScores.marketViability.breakdown.differentiation}, Reachability: ${validationScores.marketViability.breakdown.reachability}

SCORING RULES TO MATCH:
1. MARKET SIZE & GROWTH (30 pts if research shows "grow" keyword):
   - Market research MUST explicitly mention "grow", "growing", "growth", or "expanding"
   - Include specific statistics: market size in billions, growth percentage, TAM numbers
   - Example: "Professional development market ($2.5B TAM) growing 12% annually"
   - The word "grow" or similar MUST appear in marketGrowthSignals

2. COMPARABLE TITLES (25 pts if 5+ with data):
   - Need 5+ actual bestselling books with author names
   - Include approximate sales data or reviews if available
   - Examples: "The Advantage" by Patrick Lencioni (250K+ copies), "Dare to Lead" by Brené Brown (1M+ copies)
   - Validator checks for 5+ comparable books

3. DIFFERENTIATION (25 pts if differenceOpportunity has 20+ chars):
   - Each comparable book MUST have a "differenceOpportunity" field
   - Must explain what's DIFFERENT from that title
   - Must be 20+ characters
   - Example: "Unlike Manager's Path (focuses on career progression), this focuses on operational systems"

4. REACHABILITY (20 pts if 2+ channels):
   - Need 2+ specific audience channels
   - Be specific: "Engineering leaders on LinkedIn" not just "LinkedIn"
   - Examples: "Product managers on Indie Hackers", "CTO community on Twitter", "Engineering managers on Product School"

TASK: Research and provide market data as JSON:
{
  "marketGrowthSignals": "Include word 'grow' or 'growth'. Specific statistics: market size, TAM, growth %. Example: 'Professional development market ($2.5B TAM) growing 12% annually with demand for leadership frameworks increasing 150%+'",
  "comparableBooks": [
    {
      "title": "Actual Book Title",
      "author": "Author Name",
      "reasoning": "Why comparable + approximate sales/reviews (e.g., 500K+ copies, 4.8★)"
    },
    ... (need 5+ total)
  ],
  "competitiveGaps": [
    "Gap vs comparable 1 (20+ characters minimum)",
    "Gap vs comparable 2",
    "Gap vs comparable 3"
  ],
  "audienceChannels": [
    "Specific platform/community name (e.g., 'Engineering leaders on LinkedIn')",
    "Another specific channel"
  ]
}

Output ONLY the JSON object, no other text.`;

  try {
    // Make all three improvements in PARALLEL
    const [personasResponse, promiseResponse, marketResponse] = await Promise.all([
      personaScore < 80 ? invokeValidationText({
        modelSpec: "google:gemini-2.5-flash",
        stageRole: "audience:structured",
        operation: "fill-gap-personas",
        prompt: fillPersonasPrompt,
        options: { temperature: 0.7, maxOutputTokens: 2000 },
      }) : null,
      promiseScore < 80 ? invokeValidationText({
        modelSpec: "google:gemini-2.5-flash",
        stageRole: "promise:structured",
        operation: "fill-gap-promise",
        prompt: fillPromisePrompt,
        options: { temperature: 0.7, maxOutputTokens: 2000 },
      }) : null,
      marketScore < 80 ? invokeValidationText({
        modelSpec: "google:gemini-2.5-flash",
        stageRole: "market-analysis:research",
        operation: "fill-gap-market",
        prompt: fillMarketPrompt,
        options: { temperature: 0.7, maxOutputTokens: 2000 },
      }) : null,
    ]);

    // Parse responses
    const newPersonas = personasResponse
      ? parsePersonasResponse(personasResponse, personas)
      : undefined;

    const newPromise = promiseResponse
      ? parsePromiseResponse(promiseResponse, promise)
      : undefined;

    const newMarket = marketResponse
      ? parseMarketResponse(marketResponse, market)
      : undefined;

    return {
      personas: newPersonas,
      promise: newPromise,
      market: newMarket,
      improvementSummary: {
        personaGaps: personaScore < 80
          ? ["Refined personas with specific pain points and buying power"]
          : [],
        promiseGaps: promiseScore < 80
          ? ["Strengthened promise with specificity, differentiation, and credibility"]
          : [],
        marketGaps: marketScore < 80
          ? ["Improved market analysis with growth signals and comparable titles"]
          : [],
      },
    };
  } catch (error) {
    console.error("[fillGapsIntelligently] Error:", error);
    return {
      improvementSummary: {
        personaGaps: [],
        promiseGaps: [],
        marketGaps: [],
      },
    };
  }
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

function parsePersonasResponse(text: string, currentPersonas: PersonaPack): PersonaPack {
  try {
    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          ...currentPersonas,
          personas: parsed,
        };
      }
    }
  } catch (error) {
    console.error("[parsePersonasResponse] Error:", error);
  }

  return currentPersonas;
}

function parsePromiseResponse(text: string, currentPromise: PromiseBrief): Partial<PromiseBrief> {
  const trimmed = text.trim().replace(/^["']|["']$/g, "");

  if (trimmed && trimmed.length > 100) {
    return {
      promiseStatement: trimmed,
    };
  }

  return currentPromise;
}

function parseMarketResponse(text: string, currentMarket: MarketReport): Partial<MarketReport> {
  try {
    // Extract JSON object from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ...currentMarket,
        ...(parsed.marketGrowthSignals && {
          summary: parsed.marketGrowthSignals,
        }),
        comparisonTitles: parsed.comparableBooks?.map((book: any) => ({
          title: book.title || "",
          author: book.author || "",
          differenceOpportunity: book.reasoning || `Compared to ${book.title}`,
        })) || currentMarket.comparisonTitles,
        attractionDrivers: parsed.audienceChannels || currentMarket.attractionDrivers,
      };
    }
  } catch (error) {
    console.error("[parseMarketResponse] Error:", error);
  }

  return currentMarket;
}
