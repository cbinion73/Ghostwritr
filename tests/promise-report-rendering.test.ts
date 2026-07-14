import test from "node:test";
import assert from "node:assert/strict";

import {
  renderBookPitchAudienceAndTransformation,
  renderBookPitchExecutiveSummaryAndBookVision,
  renderBookPitchFinancialRecommendationsAndAppendices,
  renderBookPitchMarketBusinessAndLaunch,
} from "../src/lib/workflows/promise/report-rendering";

test("renderBookPitchExecutiveSummaryAndBookVision renders only the opening report sections", () => {
  const markdown = renderBookPitchExecutiveSummaryAndBookVision({
    title: "Durable Clarity",
    subtitle: "A calmer operating system for leaders",
    conceptStatement: "A practical book for leaders under load.",
    corePromise: "Readers build a calmer operating model.",
    targetAudience: "founders and operators",
    marketOpportunity: "TAM | SAM | SOM",
    authorCredibility: "Operator credibility",
    executiveSummary: "The book helps readers trade noise for durable clarity.",
    recommendation: "CONDITIONAL_GO",
    rationale: "Strong concept with positioning work remaining.",
    nextSteps: ["Approve Phase 1", "Draft the outline"],
    audienceProfiles: [
      {
        label: "Founder",
        description: "Founder under operational load",
        roleContext: "Founder | Growth company",
        primaryPainPoint: "Too many priorities",
        whyThisBook: "It creates operating clarity.",
        keySignals: ["Reactive execution"],
        voiceBlendResonance: "Drucker",
      },
      {
        label: "Operator",
        description: "Operator cleaning up execution",
        roleContext: "COO",
        primaryPainPoint: "No durable system",
        whyThisBook: "It gives language and process.",
        keySignals: ["Execution drag"],
        voiceBlendResonance: "Andy",
      },
    ],
    promise: {
      workingTitle: "Durable Clarity",
      audiencePrimary: "leaders",
      audienceSecondary: [],
      category: "Business",
      readerProblem: "They are drowning in noise.",
      readerDesire: "Calmer execution",
      bigIdea: "Durability beats frenzy.",
      coreTruth: "Clarity compounds.",
      transformationBefore: "Reactive and scattered",
      transformationAfter: "Focused and durable",
      differentiation: "Operating clarity",
      promiseStatement: "Build a calmer operating model.",
      stakes: "Execution gets expensive.",
      tone: [],
      openQuestions: [],
    },
    coreTruths: {
      completeTruth: "Durable clarity compounds under pressure.",
      coreInsight: { coreTruth: "Clarity compounds under pressure." },
      paradox: { whatMakesThisSurprising: "Slowing down can speed execution." },
      stakes: { ifEmbraced: "Leaders recover decision quality." },
    } as never,
    transformationArc: {
      arc: {
        stage1Me: {
          personalDilemma: "The author hit a noisy operating ceiling.",
          manifestation: "Reactive leadership",
        },
        stage2We: { sharedProblem: "The audience shares the same operating drag." },
        stage3Truth: { coreTruth: "A better model beats more effort." },
        stage4You: { firstAction: "Name the real constraint." },
        stage5FinalWe: {
          collectiveVision: "A calmer way to lead.",
          identityShift: "A durable operator.",
        },
        completeTransformation: "From reactive operator to durable leader.",
      },
    } as never,
    marketReport: {
      audienceDemand: {
        personaUrgency: [{ urgency: "High" }],
        searchBehavior: ["They search for operating systems."],
      },
      commercialRisks: ["The category is noisy."],
      marketSizing: {
        totalAddressableMarket: "TAM",
        serviceableAddressableMarket: "SAM",
        serviceableObtainableMarket: "SOM",
      },
      saturationAssessment: "Crowded but open",
      competitiveLandscape: {
        competitiveAdvantage: { differentiation: "Practical operating model" },
        marketPositioning: { whiteSpace: "Durable operating clarity" },
      },
      pricingStrategy: { pricingTiers: [{ pricePoint: "$19.99" }] },
      financialProjections: { yearOneRevenue: "$50k" },
      monetizationEcosystem: { totalEcosystemRevenueProjection: "$150k" },
    } as never,
    recommendations: {
      bookStrategy: {
        coreMessagePositioning: "A calmer operating system for leaders.",
        differentiationStrategy: "Practical operating clarity.",
        voiceAndToneRecommendations: "Calm, direct, concrete.",
      },
      financialRecommendations: { profitabilityTimeline: "12 months" },
      launchAndGoToMarket: {
        publishingPathRecommendation: "KDP first",
        launchTimeline: "Q4",
        distributionChannelPriorities: ["Owned audience", "Podcasts"],
      },
      teamAndResources: {
        timelineAndMilestones: ["Outline", "Draft", "Launch"],
      },
    } as never,
    bookSetupProfile: {
      writerPersonaBlend: [{ personaName: "Peter Drucker", percentInfluence: 60 }],
    } as never,
    titleSubtitleFinalization: {
      titleRationale: "The title names the reader's desired operating state.",
    } as never,
  });

  assert.ok(markdown.startsWith("# EXECUTIVE SUMMARY"));
  assert.ok(markdown.includes("# SECTION 1: BOOK VISION"));
  assert.ok(markdown.includes("**Recommendation:** CONDITIONAL GO"));
  assert.ok(markdown.includes("**Voice & tone:** Peter Drucker: 60%"));
  assert.ok(markdown.includes("**Secondary personas/segments:** Operator"));
  assert.equal(markdown.includes("# SECTION 2: AUDIENCE & PERSONAS"), false);
});

test("renderBookPitchAudienceAndTransformation renders audience and transformation sections only", () => {
  const markdown = renderBookPitchAudienceAndTransformation({
    targetAudience: "founders and operators",
    audienceProfiles: [
      {
        label: "Founder",
        description: "Founder under operational load",
        roleContext: "Founder | Growth company",
        primaryPainPoint: "Too many priorities",
        whyThisBook: "It creates operating clarity.",
        keySignals: ["Reactive execution"],
        voiceBlendResonance: "Drucker",
      },
    ],
    audienceResearch: {
      phase3: {
        commonThemes: ["They need clearer operating language."],
        differences: [{ persona: "Founder", difference: "They feel the cost first." }],
      },
    } as never,
    promise: {
      workingTitle: "Durable Clarity",
      audiencePrimary: "leaders",
      audienceSecondary: [],
      category: "Business",
      readerProblem: "They are drowning in noise.",
      readerDesire: "Calmer execution",
      bigIdea: "Durability beats frenzy.",
      coreTruth: "Clarity compounds.",
      transformationBefore: "Reactive and scattered",
      transformationAfter: "Focused and durable",
      differentiation: "Operating clarity",
      promiseStatement: "Build a calmer operating model.",
      stakes: "Execution gets expensive.",
      tone: [],
      openQuestions: [],
    },
    coreTruths: { completeTruth: "Durable clarity compounds." } as never,
    transformationArc: {
      arc: {
        stage1Me: { falseBelief: "More effort will solve it." },
        stage2We: {
          sharedProblem: "Execution drag is common.",
          readerQuestion: "Why does this keep happening?",
        },
        stage3Truth: {
          reframe: "The model is the constraint.",
          proofMechanism: "Diagnostic clarity.",
        },
        stage4You: {
          applicationResistance: "It feels slower at first.",
          firstAction: "Name the real constraint.",
        },
        stage5FinalWe: {
          transformedSuccess: "Leaders decide calmly.",
          identityShift: "Durable operator.",
        },
        stage6Patterns: { implicitLessons: ["Calm diagnosis beats reactive motion."] },
        stage7BookMap: {
          implicitPersonaService: "Each reader sees their own pressure.",
          sharedDilemmaReveal: "The opening dilemma.",
          truthReveal: "The central reframe.",
        },
      },
    } as never,
    marketReport: {
      marketSizing: {
        totalAddressableMarket: "TAM",
        serviceableAddressableMarket: "SAM",
      },
      audienceDemand: {
        personaUrgency: [{ personaName: "Founder", urgency: "High" }],
      },
    } as never,
    recommendations: {
      personaStrategies: [
        {
          priceSensitivity: "They fear generic advice.",
          launchStrategy: "Use the framework this week.",
        },
      ],
    } as never,
  });

  assert.ok(markdown.startsWith("# SECTION 2: AUDIENCE & PERSONAS"));
  assert.ok(markdown.includes("# SECTION 3: TRANSFORMATION JOURNEY"));
  assert.ok(markdown.includes("They need clearer operating language."));
  assert.ok(markdown.includes("**STAGE 5: ENCOUNTERING THE NEW TRUTH**"));
  assert.equal(markdown.includes("# SECTION 4: COMPETITIVE LANDSCAPE"), false);
});

test("renderBookPitchMarketBusinessAndLaunch renders market, business, and launch sections only", () => {
  const markdown = renderBookPitchMarketBusinessAndLaunch({
    authorCredibility: "Operator credibility",
    nextSteps: ["Approve Phase 1"],
    audienceProfiles: [],
    promise: {} as never,
    coreTruths: undefined,
    transformationArc: undefined,
    marketReport: {
      marketCategory: "Business leadership",
      saturationAssessment: "Crowded but open",
      marketSizing: {
        trends: "Demand for calmer operating systems is rising.",
        totalAddressableMarket: "TAM",
        serviceableAddressableMarket: "SAM",
        serviceableObtainableMarket: "SOM",
        yearOneToThreeOutlook: "$250k",
        tailwinds: ["Leaders need practical clarity."],
        headwinds: ["The market is noisy."],
      },
      competitiveLandscape: {
        directCompetitors: [
          {
            title: "Competing Book",
            author: "Author",
            positioning: "Generic leadership",
            targetAudience: "Executives",
            strengths: ["Known category"],
            gaps: ["Not operational enough"],
            pricePoint: "$19.99",
            differenceOpportunity: "More practical.",
          },
        ],
        competitiveAdvantage: {
          differentiation: "Operating clarity",
          gapFilled: "Practical diagnosis",
          unfairAdvantage: "Lived operator experience",
          whoChoosesThisBook: "Readers who need usable systems.",
        },
        marketPositioning: { whiteSpace: "Durable clarity" },
      },
      audienceDemand: {
        validationSignals: "Readers are already searching.",
        willingnessToPay: "Moderate",
        personaUrgency: [{ personaName: "Founder", whyNow: "Pressure is rising." }],
      },
      executiveSummary: { strategicPriority: "Launch into owned audience first." },
      pricingStrategy: {
        pricingTiers: [{ format: "Paperback", pricePoint: "$19.99", rationale: "Market fit" }],
      },
      financialProjections: {
        sensitivityAnalysis: "$25k",
        yearOneRevenue: "$50k",
        yearsTwoToThreeProjection: "$150k",
        yearOneCosts: "$20k",
        profitabilityAnalysis: "$30k net",
      },
      monetizationEcosystem: {
        directBookRevenue: "$50k",
        totalEcosystemRevenueProjection: "$150k",
        ancillaryProducts: [
          {
            channel: "Workshop",
            offer: "Leadership operating session",
            pricePoint: "$2,500",
            revenuePotential: "$50k",
          },
        ],
        consultingAndCoaching: "Selective advisory work",
      },
      distributionAndLaunch: {
        yearOneDistributionMix: "Owned audience first",
        launchStrategy: "Podcast and email launch",
        marketingChannels: ["Email", "Podcast", "Partner"],
      },
    } as never,
    recommendations: {
      bookStrategy: { differentiationStrategy: "Practical operating clarity" },
      positioningAndMarketing: {
        marketPositioningStatement: "The practical clarity book.",
        messagingFramework: ["Less noise", "Better model"],
        positioningByChannel: ["Email", "Podcast"],
      },
      monetizationRecommendations: {
        bookPricingRecommendation: "$19.99 paperback",
      },
      launchAndGoToMarket: {
        publishingPathRecommendation: "KDP first",
        launchTimeline: "Q4",
        distributionChannelPriorities: ["Email", "Podcast", "Partners"],
        postLaunchActivities: ["Podcast follow-up"],
        launchActivities: ["Email sequence", "Podcast tour"],
        preLaunchActivities: ["Positioning test", "Cover prep", "Launch list"],
        marketingBudgetAllocation: "$2,000",
      },
      personaStrategies: [
        {
          personaName: "Founder",
          keyMessage: "Trade noise for clarity.",
          whereToReachThem: ["Email", "Podcast"],
        },
      ],
    } as never,
  });

  assert.ok(markdown.startsWith("# SECTION 4: COMPETITIVE LANDSCAPE"));
  assert.ok(markdown.includes("# SECTION 5: MARKET OPPORTUNITY"));
  assert.ok(markdown.includes("# SECTION 6: BUSINESS MODEL"));
  assert.ok(markdown.includes("# SECTION 7: LAUNCH & MARKETING STRATEGY"));
  assert.ok(markdown.includes("### Primary Competitor 1: Competing Book by Author"));
  assert.equal(markdown.includes("# SECTION 8: FINANCIAL PROJECTIONS"), false);
});

test("renderBookPitchFinancialRecommendationsAndAppendices renders closing sections", () => {
  const markdown = renderBookPitchFinancialRecommendationsAndAppendices({
    recommendation: "GO",
    rationale: "The package is commercially focused.",
    nextSteps: ["Approve the book promise", "Generate the outline"],
    audienceProfiles: [
      {
        label: "Founder",
        description: "Founder under load",
        roleContext: "Founder",
        primaryPainPoint: "Noise",
        whyThisBook: "Clarity",
        keySignals: ["Execution drag"],
        voiceBlendResonance: "Drucker",
      },
    ],
    promise: {
      workingTitle: "Durable Clarity",
      audiencePrimary: "leaders",
      audienceSecondary: [],
      category: "Business",
      readerProblem: "Noise",
      readerDesire: "Calm execution",
      bigIdea: "Durability beats frenzy.",
      coreTruth: "Clarity compounds.",
      transformationBefore: "Reactive",
      transformationAfter: "Durable",
      differentiation: "Practical clarity",
      promiseStatement: "Build a calmer model.",
      stakes: "Execution gets expensive.",
      tone: [],
      openQuestions: [],
    },
    coreTruths: { completeTruth: "Clarity compounds under pressure." } as never,
    transformationArc: {
      arc: { stage7BookMap: { openingStory: "Open with a pressure-tested story." } },
    } as never,
    marketReport: {
      financialProjections: {
        yearOneRevenue: "$50k",
        yearsTwoToThreeProjection: "$150k",
        yearOneCosts: "$20k",
        profitabilityAnalysis: "$30k net",
        sensitivityAnalysis: "$25k",
      },
      marketSizing: { yearOneToThreeOutlook: "$250k" },
      successMetrics: {
        keyPerformanceIndicators: ["Sales", "Reviews"],
        successDefinition: "Readers use the operating model.",
        yearOneGoals: ["500 copies", "20 reviews"],
      },
      goNoGoRecommendation: { overallRecommendation: "GO" },
    } as never,
    recommendations: {
      summary: "Strong practical positioning.",
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
      finalRecommendation: {
        criticalSuccessFactors: ["Clear positioning"],
        strategicDirection: "Own practical operating clarity.",
        contingencyPlanning: ["Narrow the audience if response is weak."],
      },
      teamAndResources: {
        timelineAndMilestones: ["Outline", "Draft", "Launch"],
        teamCompositionRecommendation: "Author plus editor",
      },
      launchAndGoToMarket: { launchTimeline: "Q4" },
    } as never,
    bookSetupProfile: {
      writerPersonaBlend: [{ personaName: "Peter Drucker", percentInfluence: 60 }],
    } as never,
  });

  assert.ok(markdown.startsWith("# SECTION 8: FINANCIAL PROJECTIONS"));
  assert.ok(markdown.includes("# SECTION 9: SUCCESS METRICS & KPIS"));
  assert.ok(markdown.includes("# SECTION 10: RECOMMENDATIONS & NEXT STEPS"));
  assert.ok(markdown.includes("# APPENDICES"));
  assert.ok(markdown.includes("- Voice blend: Peter Drucker: 60%"));
});
