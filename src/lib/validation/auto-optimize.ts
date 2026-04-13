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
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY not configured");
    }

    const client = new GoogleGenerativeAI(apiKey);

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
    const marketCategory = extractCategory(promiseStatement);
    const comparisonTitles = extractComparableBooks(researchText);
    const saturationAssessment = extractSaturationAssessment(researchText);
    const attractionDrivers = extractMarketDrivers(researchText);
    const commercialRisks = extractCommercialRisks(researchText);
    const recommendations = extractRecommendations(researchText);

    const marketReport: MarketReport = {
      marketCategory,
      comparisonTitles,
      saturationAssessment,
      attractionDrivers,
      commercialRisks,
      recommendations,
      executiveSummary: {
        headline: `Commercially viable if the promise stays specific inside ${marketCategory.toLowerCase()}.`,
        overallRecommendation: "CONDITIONAL_GO",
        rationale: "The lightweight optimization path can identify signal, but it should not replace deeper market validation.",
        strategicPriority: "Use the strongest comp and clearest reader pain to sharpen positioning.",
      },
      competitiveLandscape: {
        directCompetitors: comparisonTitles.map((item) => ({
          ...item,
          credentials: "Established category author",
          positioning: "Business nonfiction comparable",
          targetAudience: primaryAudience || "Professionals seeking practical improvement",
          strengths: ["Existing audience fit", "Recognizable market slot"],
          gaps: ["Room for sharper differentiation"],
          estimatedSales: "Estimated from category precedent",
          pricePoint: "Standard business-book pricing",
        })),
        indirectCompetitors: [
          {
            category: "Courses and coaching",
            examples: ["Online course", "Workshop", "Coaching program"],
            currentAlternative: "Readers may buy guided implementation instead of a book.",
            spendProfile: "Higher spend than a book when urgency is high.",
          },
        ],
        competitiveAdvantage: {
          differentiation: promiseStatement,
          unfairAdvantage: "Sharper framing and application can separate the book from adjacent advice.",
          whoChoosesThisBook: primaryAudience || "Readers who want a practical, lower-friction entry point",
          gapFilled: "A clearer bridge from problem recognition to concrete action.",
        },
        marketPositioning: {
          academicToPractical: "Practical",
          nicheToBroad: "Focused but commercially reachable",
          theoreticalToActionOriented: "Action-oriented",
          industrySpecificToUniversal: "Can expand from specific buyers into adjacent readers",
          whiteSpace: "Practical specificity in a crowded category.",
        },
      },
      marketSizing: {
        totalAddressableMarket: "Broad professional-learning market with category-specific buyer subsets.",
        serviceableAddressableMarket: "Readers who actively buy business and professional development books.",
        serviceableObtainableMarket: "Dependent on distribution, platform, and launch execution.",
        yearOneToThreeOutlook: "Year 1 validates demand; Years 2-3 depend on ecosystem growth.",
        trends: "Demand favors practical frameworks and applied expertise.",
        tailwinds: attractionDrivers,
        headwinds: commercialRisks,
      },
      audienceDemand: {
        personaUrgency: [
          {
            personaName: primaryAudience || "Primary Reader",
            urgency: "Problem is relevant when it affects performance, leadership, or visible progress.",
            whyNow: "Current pressure makes readers more likely to look for pragmatic help.",
          },
        ],
        searchBehavior: ["Problem-aware searches", "Book and framework comparisons", "How-to queries"],
        contentConsumptionPatterns: ["Business books", "Podcasts", "Courses and newsletters"],
        willingnessToPay: "Book-level willingness is reasonable if the value is concrete.",
        validationSignals: "Use this as directional signal, not final validation.",
        openQuestions: ["Which message angle converts best?", "Which persona buys first?"],
      },
      pricingStrategy: {
        comparableBookPricing: "Use category-standard business-book pricing.",
        costAnalysis: "Margins are modest on books alone; economics improve with ecosystem offers.",
        pricingTiers: [
          { format: "Hardcover", pricePoint: "Premium tier", rationale: "Signals authority." },
          { format: "Paperback", pricePoint: "Standard tier", rationale: "Supports broader reach." },
          { format: "Ebook", pricePoint: "Impulse tier", rationale: "Lower-friction conversion." },
        ],
        pricePositioning: "Price to signal value without restricting discovery.",
        launchPricing: "Use short launch promotions tactically, not as the whole strategy.",
      },
      monetizationEcosystem: {
        directBookRevenue: "Useful, but rarely the entire economic case.",
        ancillaryProducts: [
          {
            channel: "Workbook",
            offer: "Practical templates and exercises",
            pricePoint: "Accessible add-on",
            revenuePotential: "Moderate",
          },
          {
            channel: "Course",
            offer: "Deeper implementation program",
            pricePoint: "Mid-tier",
            revenuePotential: "Higher after the book validates demand",
          },
        ],
        speakingAndAuthority: "A good book can increase keynote and workshop demand.",
        consultingAndCoaching: "The book can serve as trust-building top-of-funnel.",
        mediaAndLicensing: "Possible after traction and proof of resonance.",
        contentAndCommunity: "Owned audience compounds the value of the book.",
        totalEcosystemRevenueProjection: "Best treated as a book-plus-ecosystem model.",
      },
      distributionAndLaunch: {
        publishingOptions: "Choose based on speed, control, distribution, and support.",
        distributionChannels: ["Amazon", "Direct sales", "Speaking and partner channels"],
        launchStrategy: "Build audience early, compress launch, then sustain visibility.",
        marketingChannels: ["Email", "Content", "Podcasts", "Partnerships"],
        yearOneDistributionMix: "Likely a mix of retail and direct audience channels.",
      },
      riskAssessment: {
        overallRiskProfile: "Medium",
        marketRisks: commercialRisks,
        authorPlatformRisks: ["Limited existing audience reduces launch leverage."],
        contentMessageRisks: ["Weak differentiation can flatten the promise."],
        economicTimingRisks: ["Attention and learning budgets can tighten."],
        executionRisks: ["Strong manuscript alone does not guarantee reach."],
        mitigationPlan: recommendations,
        dealBreakers: ["No clear persona urgency", "No defendable wedge versus comps"],
      },
      successMetrics: {
        yearOneGoals: ["Book sales target", "Audience growth", "Offer validation"],
        keyPerformanceIndicators: ["Units sold", "Revenue by channel", "Audience growth", "Engagement"],
        successDefinition: "The book proves demand and opens downstream authority or revenue channels.",
        milestones: ["Pre-launch validation", "Launch-week traction", "Post-launch compounding"],
      },
      financialProjections: {
        yearOneRevenue: "Model conservative, realistic, and optimistic revenue cases.",
        yearOneCosts: "Include production, launch, advertising, and support costs.",
        profitabilityAnalysis: "Books alone can be thin-margin; ecosystem leverage improves returns.",
        yearsTwoToThreeProjection: "Upside comes from compounding authority and adjacent offers.",
        sensitivityAnalysis: "Test weaker sales and higher spend before committing.",
      },
      goNoGoRecommendation: {
        marketValidation: "Directional GO if readers clearly recognize the pain.",
        competitivePosition: "Conditional on sharper differentiation.",
        businessModelViability: "Best when the book anchors broader monetization.",
        personalFit: "Proceed if the author can support both writing and promotion.",
        overallRecommendation: "CONDITIONAL_GO",
        conditions: [
          "Tighten the primary buyer",
          "Clarify the competitive wedge",
          "Validate with real readers",
        ],
        nextSteps: recommendations,
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        model: "gemini-2.0-flash",
        grounding: {
          previousPhases: ["Promise Statement"],
          audienceSignals: [primaryAudience],
          kbSources: [],
        },
      },
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
  const books: Array<{
    title: string;
    author: string;
    whyRelevant: string;
    differenceOpportunity: string;
  }> = [];
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
  const drivers: string[] = [];
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
  const risks: string[] = [];
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

function extractSaturationAssessment(text: string): string {
  const match = text.match(/(?:market size|competition|competitive landscape|saturation)[:\s-]*([^\n.]+[.]?)/i);
  return match?.[1]?.trim() || "Moderately competitive category with room for sharper differentiation.";
}

function extractRecommendations(text: string): string[] {
  const recommendationMatches = text.match(
    /(?:recommendation|positioning|opportunity)[:\s-]*([^\n.]+[.]?)/gi
  );

  if (recommendationMatches && recommendationMatches.length > 0) {
    return recommendationMatches
      .map((match) => match.replace(/^(?:recommendation|positioning|opportunity)[:\s-]*/i, "").trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  return [
    "Lead with a concrete problem the book solves for a clearly defined reader.",
    "Differentiate the framework from broad, generic leadership advice.",
    "Support the promise with specific proof, examples, and implementation steps.",
  ];
}
