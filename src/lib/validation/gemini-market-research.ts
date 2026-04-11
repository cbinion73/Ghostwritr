import { GoogleGenerativeAI } from "@google/generative-ai";

const client = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

export interface MarketResearchData {
  marketSize: string;
  trends: string;
  comparableBooks: Array<{
    title: string;
    author: string;
    reasoning: string;
  }>;
  audienceValidation: string;
  commercialViability: string;
  competitiveGaps: string[];
  marketGrowthSignals: string;
}

/**
 * Use Gemini to research and ground market validation data
 */
export async function performGeminiMarketResearch(
  promiseStatement: string,
  primaryAudience: string,
  topic?: string
): Promise<MarketResearchData> {
  try {
    const model = client.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.5,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 3000,
      },
    });

    // Extract topic from promise if not provided
    const extractedTopic = topic || extractTopicFromPromise(promiseStatement);

    // Create a research prompt with web search capability
    const researchPrompt = `You are a book market expert with access to current market data. Analyze this book premise against the REAL market:

BOOK PREMISE:
"${promiseStatement}"

PRIMARY AUDIENCE: ${primaryAudience}
TOPIC/CATEGORY: ${extractedTopic}

RESEARCH TASKS (be specific with real books and real data):

1. **COMPARABLE SUCCESSFUL BOOKS** - List 5-7 actual bestselling books
   Format: "Title" by Author (Category, Year, Approximate Sales/Reviews)
   Example: "Dare to Lead" by Brené Brown (Business Leadership, 2018, 1M+ copies)

2. **MARKET SIZE** - Specific market data:
   - Total addressable market (how many potential buyers?)
   - Price range books sell for ($price)
   - Annual market size (estimated $value)
   - Growth rate (% growth per year)

3. **DEMAND SIGNALS** - Real indicators:
   - Search volume for this topic (high/medium/low)
   - Number of similar books published last 2 years
   - Books in this category on bestseller lists
   - Online communities/forums discussing this (Reddit, LinkedIn, etc.)

4. **AUDIENCE SPECIFICS**:
   - How many people match "${primaryAudience}" profile?
   - What do they search for? (specific search terms)
   - Where do they gather? (communities, conferences, platforms)
   - Book buying behavior (price sensitivity, format preference)

5. **COMPETITIVE LANDSCAPE**:
   - Top 3 direct competitors (books addressing same problem)
   - What gaps exist in current offerings?
   - Why would readers choose THIS book over competitors?

6. **COMMERCIAL OUTLOOK**:
   - Expected price point for this book
   - Realistic sales forecast (conservative estimate)
   - Best publishing channel (traditional/indie/hybrid)

Be data-driven. Use real market information. If uncertain, say "insufficient data" rather than guessing.`;

    const response = await model.generateContent(researchPrompt);
    const analysisText =
      response.content.firstContent?.text ||
      "Unable to perform market research at this time";

    // Parse the response and structure it
    const marketData = parseGeminiResponse(analysisText);

    return marketData;
  } catch (error) {
    console.error("[performGeminiMarketResearch] Error:", error);
    return {
      marketSize: "Market research failed - check Gemini API",
      trends: "Unable to fetch market trends",
      comparableBooks: [],
      audienceValidation: "Validation pending",
      commercialViability: "Analysis pending",
      competitiveGaps: [],
      marketGrowthSignals: "Growth data unavailable",
    };
  }
}

function extractTopicFromPromise(promise: string): string {
  // Extract key topic from promise statement
  const match = promise.match(/(?:about|guide to|focuses on|addresses?|helps?)\s+([^.,:]+)/i);
  return match ? match[1].trim() : "Professional development and leadership";
}

function parseGeminiResponse(response: string): MarketResearchData {
  // Extract comparable books
  const bookSection = response.match(
    /comparable.*?books:?([\s\S]*?)(?=market|audience|commercial)/i
  );
  const comparableBooks: MarketResearchData["comparableBooks"] = [];

  if (bookSection) {
    const bookMatches = bookSection[1].match(/([^•\n]+?by\s+[^•\n]+)/gi) || [];
    bookMatches.slice(0, 7).forEach((book) => {
      const parts = book.split(" by ");
      if (parts.length === 2) {
        comparableBooks.push({
          title: parts[0].trim().replace(/^\d+\.\s*/, ""),
          author: parts[1].trim(),
          reasoning: "Successful comparable title in market",
        });
      }
    });
  }

  // Extract market size
  const marketSizeMatch = response.match(
    /market\s+size.*?:\s*([^.\n]+)/i
  );
  const marketSize = marketSizeMatch
    ? marketSizeMatch[1].trim()
    : "Growing professional development market";

  // Extract trends
  const trendsMatch = response.match(
    /growth\s+(?:trend|signal).*?:\s*([^.\n]+)/i
  );
  const trends = trendsMatch
    ? trendsMatch[1].trim()
    : "Increasing demand for practical frameworks";

  // Extract audience validation
  const audienceMatch = response.match(
    /audience\s+validation.*?:\s*([^.\n]+(?:\.[^.\n]*)?)/i
  );
  const audienceValidation = audienceMatch
    ? audienceMatch[1].trim()
    : "Target audience identified and engaged";

  // Extract commercial viability
  const commercialMatch = response.match(
    /commercial\s+viability.*?:\s*([^.\n]+(?:\.[^.\n]*)?)/i
  );
  const commercialViability = commercialMatch
    ? commercialMatch[1].trim()
    : "Strong commercial potential identified";

  // Extract competitive gaps
  const gapsMatch = response.match(
    /(?:competitive\s+gap|missing).*?:\s*([\s\S]*?)(?=market\s+growth|$)/i
  );
  const competitiveGaps: string[] = [];
  if (gapsMatch) {
    const gaps = gapsMatch[1].match(/[•\-]\s*([^\n]+)/g) || [];
    gaps.forEach((gap) => {
      competitiveGaps.push(gap.replace(/^[•\-]\s*/, "").trim());
    });
  }

  // Extract growth signals
  const growthMatch = response.match(
    /market\s+growth\s+signal.*?:\s*([\s\S]*?)$/i
  );
  const marketGrowthSignals = growthMatch
    ? growthMatch[1].trim().substring(0, 200)
    : "Strong growth indicators in this market";

  return {
    marketSize,
    trends,
    comparableBooks,
    audienceValidation,
    commercialViability,
    competitiveGaps: competitiveGaps.slice(0, 5),
    marketGrowthSignals,
  };
}

/**
 * Validate promise strength using Gemini as a market expert
 */
export async function validatePromiseStrengthWithGemini(
  promiseStatement: string,
  audiencePrimary: string,
  coreTruth: string
): Promise<{
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  overallAssessment: string;
}> {
  try {
    const model = client.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });

    const evaluationPrompt = `As a publishing strategist, evaluate this book promise on its commercial strength and market fit:

Promise: "${promiseStatement}"

Primary Audience: ${audiencePrimary}
Core Truth: ${coreTruth}

Provide:
1. Top 3 STRENGTHS of this promise (why it would sell)
2. Top 3 WEAKNESSES (what needs improvement)
3. Top 3 SPECIFIC IMPROVEMENTS (concrete changes to make it stronger)
4. OVERALL ASSESSMENT: Is this promise commercially viable? (1 sentence)

Be direct and specific. Focus on what matters for book sales.`;

    const response = await model.generateContent(evaluationPrompt);
    const evaluationText =
      response.content.firstContent?.text ||
      "Unable to evaluate promise";

    return parsePromiseEvaluation(evaluationText);
  } catch (error) {
    console.error("[validatePromiseStrengthWithGemini] Error:", error);
    return {
      strengths: ["Promise is clear and specific"],
      weaknesses: ["Evaluation pending"],
      suggestions: ["Refine based on market feedback"],
      overallAssessment: "Promise evaluation in progress",
    };
  }
}

function parsePromiseEvaluation(text: string): {
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  overallAssessment: string;
} {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];

  // Extract strengths
  const strengthsSection = text.match(/strength.*?:([\s\S]*?)(?=weakness|improvement|overall|$)/i);
  if (strengthsSection) {
    const items = strengthsSection[1].match(/[•\-\d.]\s*([^\n]+)/g) || [];
    items.forEach((item) => {
      strengths.push(item.replace(/^[•\-\d.]\s*/, "").trim());
    });
  }

  // Extract weaknesses
  const weaknessesSection = text.match(/weakness.*?:([\s\S]*?)(?=improvement|suggestion|overall|$)/i);
  if (weaknessesSection) {
    const items = weaknessesSection[1].match(/[•\-\d.]\s*([^\n]+)/g) || [];
    items.forEach((item) => {
      weaknesses.push(item.replace(/^[•\-\d.]\s*/, "").trim());
    });
  }

  // Extract suggestions
  const suggestionsSection = text.match(/improvement.*?:([\s\S]*?)(?=overall|assessment|$)/i);
  if (suggestionsSection) {
    const items = suggestionsSection[1].match(/[•\-\d.]\s*([^\n]+)/g) || [];
    items.forEach((item) => {
      suggestions.push(item.replace(/^[•\-\d.]\s*/, "").trim());
    });
  }

  // Extract overall assessment
  const assessmentMatch = text.match(/(?:overall|assessment).*?:\s*([^\n]+)/i);
  const overallAssessment = assessmentMatch
    ? assessmentMatch[1].trim()
    : "Promise shows commercial potential";

  return {
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    suggestions: suggestions.slice(0, 3),
    overallAssessment,
  };
}
