import assert from "node:assert/strict";
import test from "node:test";

import { MarketReportSchema } from "../src/lib/workflows/promise/market-analysis-report";

test("MarketReportSchema accepts the canonical strict market report shape", () => {
  const parsed = MarketReportSchema.parse({
    marketCategory: "Business / leadership",
    comparisonTitles: [
      {
        title: "Comp",
        author: "Author",
        whyRelevant: "Relevant shelf.",
        differenceOpportunity: "Sharper reader promise.",
      },
    ],
    saturationAssessment: "Moderately crowded.",
    attractionDrivers: ["Urgent pain"],
    commercialRisks: ["Crowded shelf"],
    recommendations: ["Narrow the buyer"],
    executiveSummary: {
      headline: "Viable with sharp positioning.",
      overallRecommendation: "CONDITIONAL_GO",
      rationale: "The market exists but needs proof.",
      strategicPriority: "Validate the wedge.",
    },
    competitiveLandscape: {
      directCompetitors: [],
      indirectCompetitors: [],
      competitiveAdvantage: {
        differentiation: "Specific buyer.",
        unfairAdvantage: "Lived authority.",
        whoChoosesThisBook: "Operators.",
        gapFilled: "Practical bridge.",
      },
      marketPositioning: {
        academicToPractical: "Practical.",
        nicheToBroad: "Focused.",
        theoreticalToActionOriented: "Action.",
        industrySpecificToUniversal: "Role-led.",
        whiteSpace: "Plainspoken implementation.",
      },
    },
    marketSizing: {
      totalAddressableMarket: "Large professional audience.",
      serviceableAddressableMarket: "Business-book buyers.",
      serviceableObtainableMarket: "Owned and partner channels.",
      yearOneToThreeOutlook: "Validate then compound.",
      trends: "Demand for clarity.",
      tailwinds: [],
      headwinds: [],
    },
    audienceDemand: {
      personaUrgency: [],
      searchBehavior: [],
      contentConsumptionPatterns: [],
      willingnessToPay: "Book-level price plausible.",
      validationSignals: "Reader interviews.",
      openQuestions: [],
    },
    pricingStrategy: {
      comparableBookPricing: "Standard business bands.",
      costAnalysis: "Book plus ecosystem.",
      pricingTiers: [],
      pricePositioning: "Professional value.",
      launchPricing: "Short tactical promos only.",
    },
    monetizationEcosystem: {
      directBookRevenue: "Important but not sole upside.",
      ancillaryProducts: [],
      speakingAndAuthority: "Possible.",
      consultingAndCoaching: "Possible.",
      mediaAndLicensing: "Later.",
      contentAndCommunity: "Useful.",
      totalEcosystemRevenueProjection: "Directional.",
    },
    distributionAndLaunch: {
      publishingOptions: "Choose by control and distribution tradeoff.",
      distributionChannels: [],
      launchStrategy: "Prelaunch, launch, postlaunch.",
      marketingChannels: [],
      yearOneDistributionMix: "Owned plus retail.",
    },
    riskAssessment: {
      overallRiskProfile: "Medium",
      marketRisks: [],
      authorPlatformRisks: [],
      contentMessageRisks: [],
      economicTimingRisks: [],
      executionRisks: [],
      mitigationPlan: [],
      dealBreakers: [],
    },
    successMetrics: {
      yearOneGoals: [],
      keyPerformanceIndicators: [],
      successDefinition: "Validated demand.",
      milestones: [],
    },
    financialProjections: {
      yearOneRevenue: "Scenario based.",
      yearOneCosts: "Production and launch.",
      profitabilityAnalysis: "Depends on channel mix.",
      yearsTwoToThreeProjection: "Compounding authority.",
      sensitivityAnalysis: "Pressure-test downside.",
    },
    goNoGoRecommendation: {
      marketValidation: "Directional.",
      competitivePosition: "Promising.",
      businessModelViability: "Ecosystem-led.",
      personalFit: "Requires promotion.",
      overallRecommendation: "CONDITIONAL_GO",
      conditions: [],
      nextSteps: [],
    },
    metadata: null,
  });

  assert.equal(parsed.executiveSummary.overallRecommendation, "CONDITIONAL_GO");
});

test("MarketReportSchema rejects unsupported recommendation enums", () => {
  assert.throws(
    () =>
      MarketReportSchema.parse({
        marketCategory: "Business",
        comparisonTitles: [],
        saturationAssessment: "",
        executiveSummary: {
          headline: "",
          overallRecommendation: "MAYBE",
          rationale: "",
          strategicPriority: "",
        },
      }),
    /Invalid|expected/,
  );
});
