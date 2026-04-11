import type { PersonaPack, MarketReport } from "@/lib/promise-types";

/**
 * Auto-generate personas from a book promise using Claude
 */
export async function autoGeneratePersonas(promiseStatement: string): Promise<PersonaPack> {
  try {
    console.log("[autoGeneratePersonas] Starting persona generation");

    const { ChatOpenAI } = await import("@langchain/openai");
    const { HumanMessage } = await import("@langchain/core/messages");

    console.log("[autoGeneratePersonas] Imports successful");

    const model = new ChatOpenAI({
      modelName: "gpt-4-turbo",
      temperature: 0.7,
      maxTokens: 2000,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `Based on this book promise, create 2-3 detailed reader personas. These should be REAL end-users who would buy this book.

PROMISE:
${promiseStatement}

Create personas in this format:
{
  "personas": [
    {
      "id": "persona-1",
      "name": "Role/Title",
      "context": "1-2 sentence description of who they are",
      "priority": "primary" or "secondary",
      "painPoints": ["specific pain 1", "specific pain 2", "specific pain 3"],
      "desiredOutcomes": ["outcome 1", "outcome 2", "outcome 3"],
      "languageCues": ["word1", "word2", "word3"]
    }
  ]
}

Make personas:
- Specific and realistic (not generic)
- Directly related to the book promise
- With pain points that the book solves
- With outcomes the reader wants
- With language they actually use

Return ONLY valid JSON, no explanation.`;

    const response = await model.invoke([new HumanMessage(prompt)]);
    const content = typeof response.content === "string" ? response.content : String(response.content);

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    }

    throw new Error("Could not parse personas response");
  } catch (error) {
    console.error("[autoGeneratePersonas] Error:", error);
    throw error;
  }
}

/**
 * Auto-optimize market analysis from promise and Gemini research
 */
export async function autoOptimizeMarketAnalysis(
  promiseStatement: string,
  primaryAudience: string
): Promise<MarketReport> {
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const client = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Research phase
    const researchPrompt = `Research the market for this book and provide specific data:

PROMISE: ${promiseStatement}
AUDIENCE: ${primaryAudience}

Provide:
1. 5-7 comparable successful books (title, author, why relevant)
2. Market size estimate (number of potential readers)
3. 3 market drivers/trends
4. 3 commercial risks or challenges

Be specific with real books and data.`;

    const researchResponse = await model.generateContent(researchPrompt);
    const researchText =
      researchResponse.response.text() || "Research unavailable";

    // Parse research into market report
    const marketReport: MarketReport = {
      marketCategory: extractCategory(promiseStatement),
      comparisonTitles: extractComparableBooks(researchText),
      attractionDrivers: extractMarketDrivers(researchText),
      commercialRisks: extractCommercialRisks(researchText),
    };

    return marketReport;
  } catch (error) {
    console.error("[autoOptimizeMarketAnalysis] Error:", error);
    throw error;
  }
}

/**
 * Auto-improve promise quality using Claude
 */
export async function autoImprovePromise(
  currentPromise: string,
  primaryAudience: string,
  coreTruth: string
): Promise<string> {
  try {
    console.log("[autoImprovePromise] Starting promise improvement");

    const { ChatOpenAI } = await import("@langchain/openai");
    const { HumanMessage } = await import("@langchain/core/messages");

    console.log("[autoImprovePromise] Imports successful");

    const model = new ChatOpenAI({
      modelName: "gpt-4-turbo",
      temperature: 0.7,
      maxTokens: 1500,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `You are a book publishing strategist. Optimize this promise to be stronger and more marketable.

CURRENT PROMISE:
${currentPromise}

AUDIENCE: ${primaryAudience}
CORE TRUTH: ${coreTruth}

OPTIMIZATION GOALS:
1. More specific outcomes (what will readers actually be able to do?)
2. Stronger differentiation (what's unique about this approach?)
3. Better audience alignment (speaks to their specific situation)
4. Higher credibility (realistic and achievable)

OPTIMIZATION RULES:
- Keep approximately same length
- Maintain core message
- Use concrete, specific language
- Address real pain points
- Show clear value proposition
- Make it more compelling

Return ONLY the optimized promise statement, nothing else.`;

    const response = await model.invoke([new HumanMessage(prompt)]);
    const improvedPromise =
      typeof response.content === "string"
        ? response.content
        : String(response.content);

    return improvedPromise.trim();
  } catch (error) {
    console.error("[autoImprovePromise] Error:", error);
    throw error;
  }
}

// Helper functions to parse research
function extractCategory(promise: string): string {
  const match = promise.match(/(?:about|guide to|focuses on)\s+([^.]+)/i);
  return match ? match[1].trim() : "Professional Development";
}

function extractComparableBooks(
  text: string
): Array<{
  title: string;
  author: string;
  whyRelevant: string;
  differenceOpportunity: string;
}> {
  const books = [];
  const bookMatches = text.match(/(?:^|\n)(?:\d+\.|\*|-)\s*([^:]+):\s*([^(\n]+)(?:\([^)]*\))?/gm);

  if (bookMatches) {
    bookMatches.forEach((match) => {
      const parts = match.match(/([^:]+):\s*(.+)/);
      if (parts) {
        books.push({
          title: parts[1].replace(/^[\d.\-*]\s+/, "").trim(),
          author: "See market research",
          whyRelevant: parts[2].trim(),
          differenceOpportunity: "Clear differentiation opportunity",
        });
      }
    });
  }

  return books.slice(0, 7);
}

function extractMarketDrivers(text: string): string[] {
  const drivers = [];
  const driverMatches = text.match(/(?:driver|trend|signal|demand)[^.]*\./gi);

  if (driverMatches) {
    driverMatches.forEach((match) => {
      drivers.push(match.replace(/^.*?driver[:]?\s*/i, "").trim());
    });
  }

  return drivers.length > 0
    ? drivers.slice(0, 3)
    : ["Growing market demand", "Increasing professional development interest", "Emerging need for practical frameworks"];
}

function extractCommercialRisks(text: string): string[] {
  const risks = [];
  const riskMatches = text.match(
    /(?:risk|challenge|competition|barrier)[^.]*\./gi
  );

  if (riskMatches) {
    riskMatches.forEach((match) => {
      risks.push(match.replace(/^.*?(?:risk|challenge)[:]?\s*/i, "").trim());
    });
  }

  return risks.length > 0
    ? risks.slice(0, 3)
    : [
        "Competitive market with existing solutions",
        "Need to demonstrate clear differentiation",
        "Requires strong marketing to reach audience",
      ];
}
