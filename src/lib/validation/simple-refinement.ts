import { invokeValidationText } from "./validation-llm";

async function invokeSimpleValidationText(prompt: string): Promise<string> {
  return invokeValidationText({
    modelSpec: "openai:gpt-4o-mini",
    stageRole: "promise:structured",
    operation: "validation-simple-refinement",
    prompt,
    options: {
      temperature: 0.7,
      maxOutputTokens: 2000,
    },
  });
}

export async function refinePromiseSimple(
  currentPromise: string,
  gaps: string[]
): Promise<string> {
  try {
    console.log("[refinePromiseSimple] Starting refinement");

    const gapsText = gaps
      .map((gap) => gap.replace(/^[✓✗⚠]\s*/, "").trim())
      .filter((g) => g.length > 0)
      .slice(0, 5)
      .join("\n- ");

    const prompt = `You are a book publisher. Improve this promise:

PROMISE:
${currentPromise}

IMPROVE FOR:
- ${gapsText}

Rewrite to be stronger. Same length, better positioning. ONLY return the improved promise.`;

    const improved = await invokeSimpleValidationText(prompt);
    console.log("[refinePromiseSimple] Success");
    return improved.trim();
  } catch (error) {
    console.error("[refinePromiseSimple] Error:", error);
    return currentPromise; // Fallback
  }
}

export async function generatePersonasSimple(
  promiseStatement: string
): Promise<any> {
  try {
    console.log("[generatePersonasSimple] Starting generation");

    const prompt = `From this promise, create 2-3 reader personas as JSON. IMPORTANT: Each persona MUST have ALL of these fields: id, name, priority, context, painPoints, desiredOutcomes, buyingMotivations, languageCues.

PROMISE:
${promiseStatement}

JSON format (EXACT):
{
  "personas": [
    {
      "id": "unique_id_here",
      "name": "Persona Name",
      "context": "Who they are and their background",
      "priority": "primary",
      "painPoints": ["pain point 1", "pain point 2", "pain point 3"],
      "desiredOutcomes": ["desired outcome 1", "desired outcome 2"],
      "buyingMotivations": ["motivation 1", "motivation 2"],
      "languageCues": ["language cue 1", "language cue 2"]
    }
  ]
}

Create 2-3 distinct personas. ONLY return valid JSON. No other text.`;

    const response = await invokeSimpleValidationText(prompt);
    console.log("[generatePersonasSimple] Raw gateway response:", response.substring(0, 500));

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("[generatePersonasSimple] Parsed personas:", JSON.stringify(parsed, null, 2).substring(0, 1000));
      console.log("[generatePersonasSimple] Success");
      return parsed;
    }
    throw new Error("No JSON in response");
  } catch (error) {
    console.error("[generatePersonasSimple] Error:", error);
    throw error;
  }
}

export async function optimizeMarketSimple(
  promiseStatement: string,
  audience: string
): Promise<any> {
  try {
    console.log("[optimizeMarketSimple] Starting optimization");

    const prompt = `Analyze market for this book promise:

PROMISE:
${promiseStatement}

AUDIENCE:
${audience}

Return JSON with:
{
  "marketCategory": "category",
  "comparisonTitles": [{"title": "Book", "author": "Author", "whyRelevant": "why", "differenceOpportunity": "how"}],
  "saturationAssessment": "assessment",
  "attractionDrivers": ["driver1", "driver2"],
  "commercialRisks": ["risk1"],
  "recommendations": ["rec1", "rec2"]
}

ONLY return valid JSON.`;

    const response = await invokeSimpleValidationText(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("[optimizeMarketSimple] Success");
      return parsed;
    }
    throw new Error("No JSON in response");
  } catch (error) {
    console.error("[optimizeMarketSimple] Error:", error);
    throw error;
  }
}
