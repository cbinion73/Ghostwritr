import test from "node:test";
import assert from "node:assert/strict";

import type { PromiseBrief } from "../src/lib/promise-types";
import { fallbackBookPromiseReport } from "../src/lib/workflows/promise/report-fallback";
import type { TruthPersonaContext } from "../src/lib/workflows/promise/report-presentation";

const promise: PromiseBrief = {
  workingTitle: "Durable Clarity",
  audiencePrimary: "founders",
  audienceSecondary: [],
  category: "Business",
  readerProblem: "They are drowning in operational noise.",
  readerDesire: "Calmer execution",
  bigIdea: "Durability beats frenzy.",
  coreTruth: "Clarity compounds under pressure.",
  transformationBefore: "Reactive and scattered",
  transformationAfter: "Focused and durable",
  differentiation: "Practical operating clarity",
  promiseStatement: "Build a calmer operating model.",
  stakes: "Execution gets expensive.",
  tone: [],
  openQuestions: [],
};

const personaContexts: TruthPersonaContext[] = [
  {
    name: "Founder",
    context: "Founder under operational load.",
    dilemma: "They have too many priorities and no durable system.",
    voiceHint: "Drucker",
  },
];

test("fallbackBookPromiseReport builds a complete deterministic report without provider calls", () => {
  const report = fallbackBookPromiseReport(
    promise,
    personaContexts,
    {
      marketSizing: {
        totalAddressableMarket: "TAM",
        serviceableAddressableMarket: "SAM",
        serviceableObtainableMarket: "SOM",
        yearOneToThreeOutlook: "$250k",
        trends: "Demand for practical operating clarity is rising.",
        tailwinds: ["Leaders need clearer systems."],
        headwinds: ["The category is noisy."],
      },
      goNoGoRecommendation: {
        overallRecommendation: "CONDITIONAL_GO",
        nextSteps: ["Sharpen the audience", "Validate positioning"],
      },
      competitiveLandscape: {
        directCompetitors: [],
        marketPositioning: { whiteSpace: "Durable operating clarity" },
        competitiveAdvantage: {
          differentiation: "Practical operating model",
          gapFilled: "Turns vague pressure into diagnosis.",
          unfairAdvantage: "Lived operating experience",
          whoChoosesThisBook: "Founders under pressure",
        },
      },
      audienceDemand: {
        personaUrgency: [{ personaName: "Founder", urgency: "High", whyNow: "Pressure is rising." }],
        searchBehavior: ["They search for operating systems."],
        validationSignals: "Readers are already searching.",
        willingnessToPay: "Moderate",
      },
      commercialRisks: ["The category is crowded."],
      saturationAssessment: "Crowded but open",
      marketCategory: "Business leadership",
      pricingStrategy: {
        pricingTiers: [{ format: "Paperback", pricePoint: "$19.99", rationale: "Market fit" }],
      },
      financialProjections: {
        yearOneRevenue: "$50k",
        yearsTwoToThreeProjection: "$150k",
        yearOneCosts: "$20k",
        profitabilityAnalysis: "$30k net",
        sensitivityAnalysis: "$25k",
      },
      monetizationEcosystem: {
        directBookRevenue: "$50k",
        totalEcosystemRevenueProjection: "$150k",
        ancillaryProducts: [],
        consultingAndCoaching: "Selective advisory work",
      },
      distributionAndLaunch: {
        yearOneDistributionMix: "Owned audience first",
        launchStrategy: "Email and podcast launch",
        marketingChannels: ["Email"],
      },
      executiveSummary: { strategicPriority: "Launch to owned audience first." },
      successMetrics: {
        keyPerformanceIndicators: ["Sales", "Reviews"],
        successDefinition: "Readers use the operating model.",
        yearOneGoals: ["500 copies", "20 reviews"],
      },
    } as never,
    {
      summary: "Strong practical positioning.",
      personaStrategies: [
        {
          primaryPositioning: "A practical operating system for overwhelmed founders.",
          keyMessage: "Trade noise for durable clarity.",
          whereToReachThem: ["Email"],
        },
      ],
      finalRecommendation: {
        overallRecommendation: "GO",
        rationale: "The book has a clear audience and practical wedge.",
        immediateNextSteps: ["Approve Phase 1"],
        criticalSuccessFactors: ["Clear positioning"],
        strategicDirection: "Own practical operating clarity.",
        contingencyPlanning: ["Narrow the audience if response is weak."],
      },
      bookStrategy: {
        coreMessagePositioning: "A calmer operating system for founders.",
        differentiationStrategy: "Practical operating clarity.",
        voiceAndToneRecommendations: "Calm, direct, concrete.",
      },
      positioningAndMarketing: {
        marketPositioningStatement: "The practical clarity book.",
        messagingFramework: ["Less noise", "Better model"],
        positioningByChannel: ["Email"],
      },
      monetizationRecommendations: { bookPricingRecommendation: "$19.99 paperback" },
      launchAndGoToMarket: {
        publishingPathRecommendation: "KDP first",
        launchTimeline: "Q4",
        distributionChannelPriorities: ["Email"],
        postLaunchActivities: ["Podcast follow-up"],
        launchActivities: ["Email sequence"],
        preLaunchActivities: ["Positioning test"],
        marketingBudgetAllocation: "$2,000",
      },
      financialRecommendations: {
        investmentRequired: "$5k",
        revenueProjections: "$50k year one",
        profitabilityTimeline: "12 months",
        pricingSummary: ["Paperback at $19.99"],
      },
      successMetricsAndKpis: {
        yearOneSuccessTargets: ["500 copies"],
        monthlyKpis: ["Sales"],
        successMilestones: ["Launch list ready"],
      },
      teamAndResources: {
        timelineAndMilestones: ["Outline", "Draft", "Launch"],
        teamCompositionRecommendation: "Author plus editor",
      },
    } as never,
    undefined,
    {
      completeTruth: "Durable clarity compounds under pressure.",
      coreInsight: { coreTruth: "Durable clarity compounds." },
      paradox: { whatMakesThisSurprising: "Slowing down can speed execution." },
      stakes: { ifEmbraced: "Leaders recover decision quality." },
    } as never,
    undefined,
    {
      writerPersona: "Operator voice",
      writerPersonaGuidance: ["Credible lived operating experience."],
    } as never,
  );

  assert.equal(report.title, "Durable Clarity");
  assert.equal(report.recommendation, "GO");
  assert.equal(report.nextSteps[0], "Approve Phase 1");
  assert.ok(report.executiveSummary.includes("Durable Clarity is a practical nonfiction book"));
  assert.ok(report.documentMarkdown.includes("# EXECUTIVE SUMMARY"));
  assert.ok(report.documentMarkdown.includes("# APPENDICES"));
  assert.equal(report.metadata?.model, "fallback");
});
