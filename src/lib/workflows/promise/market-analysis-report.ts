import { z } from "zod";

export const MarketReportSchema = z.object({
  marketCategory: z.string(),
  comparisonTitles: z.array(
    z.object({
      title: z.string(),
      author: z.string(),
      whyRelevant: z.string(),
      differenceOpportunity: z.string(),
    }),
  ),
  saturationAssessment: z.string(),
  attractionDrivers: z.array(z.string()).default([]),
  commercialRisks: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  executiveSummary: z.object({
    headline: z.string(),
    overallRecommendation: z.enum(["GO", "NO_GO", "CONDITIONAL_GO"]),
    rationale: z.string(),
    strategicPriority: z.string(),
  }),
  competitiveLandscape: z.object({
    directCompetitors: z.array(
      z.object({
        title: z.string(),
        author: z.string(),
        credentials: z.string(),
        positioning: z.string(),
        targetAudience: z.string(),
        strengths: z.array(z.string()).default([]),
        gaps: z.array(z.string()).default([]),
        estimatedSales: z.string(),
        pricePoint: z.string(),
        whyRelevant: z.string(),
        differenceOpportunity: z.string(),
      }),
    ).default([]),
    indirectCompetitors: z.array(
      z.object({
        category: z.string(),
        examples: z.array(z.string()).default([]),
        currentAlternative: z.string(),
        spendProfile: z.string(),
      }),
    ).default([]),
    competitiveAdvantage: z.object({
      differentiation: z.string(),
      unfairAdvantage: z.string(),
      whoChoosesThisBook: z.string(),
      gapFilled: z.string(),
    }),
    marketPositioning: z.object({
      academicToPractical: z.string(),
      nicheToBroad: z.string(),
      theoreticalToActionOriented: z.string(),
      industrySpecificToUniversal: z.string(),
      whiteSpace: z.string(),
    }),
  }),
  marketSizing: z.object({
    totalAddressableMarket: z.string(),
    serviceableAddressableMarket: z.string(),
    serviceableObtainableMarket: z.string(),
    yearOneToThreeOutlook: z.string(),
    trends: z.string(),
    tailwinds: z.array(z.string()).default([]),
    headwinds: z.array(z.string()).default([]),
  }),
  audienceDemand: z.object({
    personaUrgency: z.array(
      z.object({
        personaName: z.string(),
        urgency: z.string(),
        whyNow: z.string(),
      }),
    ).default([]),
    searchBehavior: z.array(z.string()).default([]),
    contentConsumptionPatterns: z.array(z.string()).default([]),
    willingnessToPay: z.string(),
    validationSignals: z.string(),
    openQuestions: z.array(z.string()).default([]),
  }),
  pricingStrategy: z.object({
    comparableBookPricing: z.string(),
    costAnalysis: z.string(),
    pricingTiers: z.array(
      z.object({
        format: z.string(),
        pricePoint: z.string(),
        rationale: z.string(),
      }),
    ).default([]),
    pricePositioning: z.string(),
    launchPricing: z.string(),
  }),
  monetizationEcosystem: z.object({
    directBookRevenue: z.string(),
    ancillaryProducts: z.array(
      z.object({
        channel: z.string(),
        offer: z.string(),
        pricePoint: z.string(),
        revenuePotential: z.string(),
      }),
    ).default([]),
    speakingAndAuthority: z.string(),
    consultingAndCoaching: z.string(),
    mediaAndLicensing: z.string(),
    contentAndCommunity: z.string(),
    totalEcosystemRevenueProjection: z.string(),
  }),
  distributionAndLaunch: z.object({
    publishingOptions: z.string(),
    distributionChannels: z.array(z.string()).default([]),
    launchStrategy: z.string(),
    marketingChannels: z.array(z.string()).default([]),
    yearOneDistributionMix: z.string(),
  }),
  riskAssessment: z.object({
    overallRiskProfile: z.enum(["Low", "Medium", "High"]),
    marketRisks: z.array(z.string()).default([]),
    authorPlatformRisks: z.array(z.string()).default([]),
    contentMessageRisks: z.array(z.string()).default([]),
    economicTimingRisks: z.array(z.string()).default([]),
    executionRisks: z.array(z.string()).default([]),
    mitigationPlan: z.array(z.string()).default([]),
    dealBreakers: z.array(z.string()).default([]),
  }),
  successMetrics: z.object({
    yearOneGoals: z.array(z.string()).default([]),
    keyPerformanceIndicators: z.array(z.string()).default([]),
    successDefinition: z.string(),
    milestones: z.array(z.string()).default([]),
  }),
  financialProjections: z.object({
    yearOneRevenue: z.string(),
    yearOneCosts: z.string(),
    profitabilityAnalysis: z.string(),
    yearsTwoToThreeProjection: z.string(),
    sensitivityAnalysis: z.string(),
  }),
  goNoGoRecommendation: z.object({
    marketValidation: z.string(),
    competitivePosition: z.string(),
    businessModelViability: z.string(),
    personalFit: z.string(),
    overallRecommendation: z.enum(["GO", "NO_GO", "CONDITIONAL_GO"]),
    conditions: z.array(z.string()).default([]),
    nextSteps: z.array(z.string()).default([]),
  }),
  // OpenAI strict structured-output mode requires every property in every
  // nested object schema to appear in `required` — .optional() drops a key
  // from `required` and the API rejects the schema outright ("'required' is
  // required to be supplied and to be an array including every key in
  // properties"). .nullable() keeps the key required while still letting
  // the model return null when there's nothing to report.
  metadata: z.object({
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    model: z.string().nullable(),
    grounding: z.object({
      previousPhases: z.array(z.string()).nullable(),
      kbSources: z.array(z.string()).nullable(),
      audienceSignals: z.array(z.string()).nullable(),
    }).nullable(),
    tokenUsage: z.object({
      inputTokens: z.number().nullable(),
      outputTokens: z.number().nullable(),
      totalTokens: z.number().nullable(),
      cacheReadInputTokens: z.number().nullable(),
      cacheWriteInputTokens: z.number().nullable(),
      reasoningTokens: z.number().nullable(),
    }).nullable(),
  }).nullable(),
});
