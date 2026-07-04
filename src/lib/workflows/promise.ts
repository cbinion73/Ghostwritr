import { END, START, Annotation, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ArtifactType, StageKey } from "@prisma/client";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { readFileSync } from "fs";
import { resolve } from "path";

import { getModelForRole, resolveModelSpec } from "../llm/routing";
import { parseModelSpec } from "../llm/providers";
import {
  commitPromiseStageBundle,
  createPromiseArtifactVersion,
  getCommittedPromiseBrief,
  getPromiseBriefVersions,
  getPromiseArtifacts,
} from "../repositories/promise-artifacts";
import { getCommittedBookSetup } from "../repositories/book-setup-artifacts";
import { getBookBySlugOrThrow, getOrCreateBookBySlug, getStageForBook } from "../repositories/books";
import { createDirectionEvent, listDirectionEventsForStage } from "../repositories/direction-events";
import { listBookSourceDocuments } from "../repositories/source-documents";
import {
  searchKnowledgeBase,
  formatKnowledgeForPrompt,
  getBookKnowledgeBase,
} from "../services/knowledge-base";
import type {
  AudienceResearchArtifact,
  AudienceResearchPhase1,
  BookPromiseReport,
  CoreTruthsArtifact,
  MarketReport,
  PromiseArtifactAvailability,
  PersonaComparisonAnalysis,
  PersonaDeepProfile,
  PersonaPack,
  PersonaPackDeepProfile,
  PromisePhaseApprovals,
  PromiseArtifactMetadata,
  PositioningRecommendations,
  PromiseBrief,
  PromiseMessage,
  PromiseScorecard,
  PromiseTokenUsage,
  TitleSubtitleFinalization,
  TransformationArtifact,
} from "../promise-types";
import type { BookSetupProfile } from "../book-setup-types";
import { DEFAULT_BOOK_SETUP_PROFILE } from "../book-setup-types";

const PromiseBriefSchema = z.object({
  workingTitle: z.string(),
  audiencePrimary: z.string(),
  audienceSecondary: z.array(z.string()).default([]),
  category: z.string(),
  readerProblem: z.string(),
  readerDesire: z.string(),
  bigIdea: z.string(),
  coreTruth: z.string(),
  transformationBefore: z.string(),
  transformationAfter: z.string(),
  differentiation: z.string(),
  promiseStatement: z.string(),
  stakes: z.string(),
  tone: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
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

const PromiseScorecardSchema = z.object({
  scores: z.object({
    clarity: z.number(),
    audienceFit: z.number(),
    distinctiveness: z.number(),
    commercialPull: z.number(),
    credibility: z.number(),
  }),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  nextBestRevisions: z.array(z.string()).default([]),
});

const PersonaPackSchema = z.object({
  personas: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      priority: z.enum(["primary", "secondary"]),
      context: z.string(),
      painPoints: z.array(z.string()).default([]),
      desiredOutcomes: z.array(z.string()).default([]),
      buyingMotivations: z.array(z.string()).default([]),
      languageCues: z.array(z.string()).default([]),
    }),
  ),
});

const MarketReportSchema = z.object({
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

const PositioningRecommendationsSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()).default([]),
  bookStrategy: z.object({
    coreMessagePositioning: z.string(),
    audienceTargeting: z.string(),
    contentDepthAndBreadth: z.string(),
    lengthAndStructure: z.string(),
    voiceAndToneRecommendations: z.string(),
    differentiationStrategy: z.string(),
  }),
  positioningAndMarketing: z.object({
    marketPositioningStatement: z.string(),
    keyDifferentiators: z.array(z.string()).default([]),
    targetCustomerProfile: z.string(),
    positioningByChannel: z.array(z.string()).default([]),
    messagingFramework: z.array(z.string()).default([]),
    competitivePositioningQuadrant: z.string(),
  }),
  launchAndGoToMarket: z.object({
    publishingPathRecommendation: z.string(),
    launchTimeline: z.string(),
    preLaunchActivities: z.array(z.string()).default([]),
    launchActivities: z.array(z.string()).default([]),
    postLaunchActivities: z.array(z.string()).default([]),
    distributionChannelPriorities: z.array(z.string()).default([]),
    marketingBudgetAllocation: z.string(),
  }),
  personaStrategies: z.array(
    z.object({
      personaName: z.string(),
      primaryPositioning: z.string(),
      keyMessage: z.string(),
      whereToReachThem: z.array(z.string()).default([]),
      priceSensitivity: z.string(),
      contentFormatPreference: z.string(),
      trustedInfluencers: z.array(z.string()).default([]),
      launchStrategy: z.string(),
    }),
  ).default([]),
  crossPersonaMessaging: z.object({
    sharedMessaging: z.array(z.string()).default([]),
    personaSpecificMessaging: z.array(z.string()).default([]),
    avoidAlienating: z.string(),
  }),
  monetizationRecommendations: z.object({
    bookPricingRecommendation: z.string(),
    ancillaryProductRecommendations: z.array(z.string()).default([]),
    ecosystemBuildOutTimeline: z.array(z.string()).default([]),
    revenueModelRecommendation: z.string(),
    pricingStrategyByChannel: z.array(z.string()).default([]),
  }),
  teamAndResources: z.object({
    writingSupport: z.string(),
    designAndProduction: z.string(),
    marketingAndLaunchSupport: z.string(),
    platformAndTools: z.string(),
    teamCompositionRecommendation: z.string(),
    timelineAndMilestones: z.array(z.string()).default([]),
  }),
  riskMitigationRecommendations: z.array(
    z.object({
      risk: z.string(),
      mitigationStrategy: z.string(),
      whatToMonitor: z.string(),
      pivotPoint: z.string(),
    }),
  ).default([]),
  successMetricsAndKpis: z.object({
    yearOneSuccessTargets: z.array(z.string()).default([]),
    monthlyKpis: z.array(z.string()).default([]),
    dashboardMetrics: z.array(z.string()).default([]),
    successMilestones: z.array(z.string()).default([]),
    pivotingCriteria: z.array(z.string()).default([]),
  }),
  financialRecommendations: z.object({
    investmentRequired: z.string(),
    revenueProjections: z.string(),
    profitabilityTimeline: z.string(),
    pricingSummary: z.array(z.string()).default([]),
    budgetAllocationRecommendation: z.string(),
  }),
  finalRecommendation: z.object({
    overallRecommendation: z.enum(["GO", "NO_GO", "CONDITIONAL_GO"]),
    rationale: z.string(),
    strategicDirection: z.string(),
    criticalSuccessFactors: z.array(z.string()).default([]),
    immediateNextSteps: z.array(z.string()).default([]),
    goNoGoGates: z.array(z.string()).default([]),
    contingencyPlanning: z.array(z.string()).default([]),
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

const TitleSubtitleFinalizationSchema = z.object({
  finalizedTitle: z.string(),
  finalizedSubtitle: z.string(),
  positioningHook: z.string(),
  titleRationale: z.string(),
  subtitleRationale: z.string(),
  audienceFit: z.string(),
  marketFit: z.string(),
  alternatives: z.array(
    z.object({
      title: z.string(),
      subtitle: z.string(),
      whyItCouldWork: z.string(),
    }),
  ).default([]),
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

const BookPromiseReportSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  conceptStatement: z.string(),
  corePromise: z.string(),
  targetAudience: z.string(),
  marketOpportunity: z.string(),
  authorCredibility: z.string(),
  executiveSummary: z.string(),
  recommendation: z.enum(["GO", "NO_GO", "CONDITIONAL_GO"]),
  rationale: z.string(),
  nextSteps: z.array(z.string()).default([]),
  documentMarkdown: z.string(),
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

const AudienceResearchPhase1Schema = z.object({
  researchQuestions: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    }),
  ),
  identifiedUserTypes: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      details: z.array(z.string()),
    }),
  ),
});

const PersonaDeepProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.enum(["primary", "secondary"]).optional(),
  demographics: z.object({
    role: z.string(),
    companyType: z.string(),
    yearsInRole: z.number(),
    careerPath: z.string(),
    dayInTheLife: z.string(),
    reportsTo: z.string(),
    teamSize: z.number(),
  }),
  currentSituation: z.object({
    whatTheyDo: z.string(),
    whatWorks: z.array(z.string()),
    whatDoesntWork: z.array(z.string()),
    timeAllocation: z.string(),
    biggestFrustration: z.string(),
  }),
  goals: z.array(
    z.object({
      goal: z.string(),
      type: z.enum(["outcome", "feeling"]),
    }),
  ),
  painPoints: z.array(
    z.object({
      friction: z.string(),
      realCost: z.string(),
    }),
  ),
  objections: z.array(
    z.object({
      objection: z.string(),
      proofNeeded: z.string(),
    }),
  ),
  successMetrics: z.array(
    z.object({
      metric: z.string(),
      feeling: z.string().optional(),
    }),
  ),
  learningStyle: z.object({
    prefers: z.array(z.string()),
    hates: z.array(z.string()),
    bestFormat: z.string(),
  }),
  voiceBlendFit: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    tertiary: z.string().optional(),
    reasoning: z.string(),
  }),
});

const PersonaPackDeepProfileSchema = z.object({
  personas: z.array(PersonaDeepProfileSchema),
});

const PersonaComparisonAnalysisSchema = z.object({
  commonThemes: z.array(z.string()),
  differences: z.array(
    z.object({
      persona: z.string(),
      difference: z.string(),
    }),
  ),
  primaryPersona: z.object({
    name: z.string(),
    reasoning: z.string(),
  }),
  comparisonMatrix: z.array(
    z.object({
      dimension: z.string(),
      personas: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
        }),
      ),
    }),
  ),
});

const CoreTruthsArtifactSchema = z.object({
  coreInsight: z.object({
    falseBelief: z.string(),
    coreTruth: z.string(),
  }),
  paradox: z.object({
    whatMakesThisSurprising: z.string(),
    whyItFeelsBackwards: z.string(),
  }),
  stakes: z.object({
    ifEmbraced: z.string(),
    ifIgnored: z.string(),
  }),
  evidence: z.object({
    methods: z.array(
      z.enum([
        "Story/Narrative",
        "Framework/System/Model",
        "Research/Data/Studies",
        "Analogy/Metaphor",
        "Real example/Case study",
      ]),
    ),
    specificEvidence: z.string(),
  }),
  personaExperiences: z.array(
    z.object({
      personaName: z.string(),
      theirVersionOfTruth: z.string(),
      whatMakesItLand: z.string(),
      voiceBlendResonates: z.object({
        voice: z.enum(["Andy", "Drucker", "Jobs"]),
        why: z.string(),
      }),
    }),
  ).length(3),
  whyNow: z.object({
    whyUrgentNow: z.string(),
    escalatedProblem: z.string(),
  }),
  bridge: z.object({
    permissionNeeded: z.string(),
    transitionReframe: z.string(),
    whatStaysSame: z.string(),
  }),
  completeTruth: z.string(),
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
  legacyTruths: z.array(
    z.object({
      truth: z.string(),
      foundationalInsight: z.string(),
      bookRelevance: z.string(),
    }),
  ).optional(),
});

const TransformationPersonaVoiceSchema = z.object({
  voice: z.enum(["Andy", "Drucker", "Jobs"]),
  why: z.string(),
});

const TransformationArcSchema = z.object({
  stage1Me: z.object({
    personalDilemma: z.string(),
    falseBelief: z.string(),
    manifestation: z.string(),
    cost: z.string(),
    authorityToTeach: z.string(),
    vulnerability: z.string(),
    voiceBlend: z.string(),
  }),
  stage2We: z.object({
    sharedProblem: z.string(),
    universalTension: z.string(),
    personaDilemmas: z.array(
      z.object({
        personaName: z.string(),
        recognizedDilemma: z.string(),
        whatMakesItSpecific: z.string(),
      }),
    ).length(3),
    readerQuestion: z.string(),
    emotionalBridgeStories: z.string(),
  }),
  stage3Truth: z.object({
    coreTruth: z.string(),
    reframe: z.string(),
    paradox: z.string(),
    proofMechanism: z.string(),
    personaAnswers: z.array(
      z.object({
        personaName: z.string(),
        dilemmaAnswer: z.string(),
        voiceBlendResonates: TransformationPersonaVoiceSchema,
      }),
    ).length(3),
    truthForm: z.string(),
    ifEmbraced: z.string(),
    ifIgnored: z.string(),
  }),
  stage4You: z.object({
    firstAction: z.string(),
    personaApplications: z.array(
      z.object({
        personaName: z.string(),
        nextStep: z.string(),
        obstacleOrRisk: z.string(),
      }),
    ).length(3),
    instructionStyle: z.string(),
    applicationResistance: z.string(),
    successVsFailure: z.string(),
  }),
  stage5FinalWe: z.object({
    transformedSuccess: z.string(),
    personaOutcomes: z.array(
      z.object({
        personaName: z.string(),
        breakthrough: z.string(),
        whatBecomesPossible: z.string(),
      }),
    ).length(3),
    collectiveVision: z.string(),
    identityShift: z.string(),
    irreversibility: z.string(),
  }),
  stage6Patterns: z.object({
    sharedThemes: z.array(z.string()).min(3),
    storyByStage: z.object({
      me: z.string(),
      we: z.string(),
      truth: z.string(),
      you: z.string(),
      finalWe: z.string(),
    }),
    voiceBlendMoments: z.object({
      andy: z.string(),
      drucker: z.string(),
      jobs: z.string(),
    }),
    implicitLessons: z.array(z.string()).min(3),
  }),
  stage7BookMap: z.object({
    openingStory: z.string(),
    sharedDilemmaReveal: z.string(),
    truthReveal: z.string(),
    applicationStart: z.string(),
    visionCasting: z.string(),
    implicitPersonaService: z.string(),
  }),
  completeTransformation: z.string(),
});

const TransformationArtifactSchema = z.object({
  arc: TransformationArcSchema,
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

type PromiseWorkflowState = {
  bookSlug: string;
  userInput: string;
  bookId?: string;
  stageId?: string;
  bookSetupProfile?: BookSetupProfile | null;
  referenceMaterials?: Array<{
    id: string;
    title: string;
    mimeType: string;
    note: string;
  }>;
  conversationMessages: PromiseMessage[];
  assistantReply?: string;
  extractedPromise?: PromiseBrief;
  scorecard?: PromiseScorecard;
  personaPack?: PersonaPack;
  marketReport?: MarketReport;
  recommendations?: PositioningRecommendations;
};

const WorkflowState = Annotation.Root({
  bookSlug: Annotation<string>,
  userInput: Annotation<string>,
  bookId: Annotation<string | undefined>,
  stageId: Annotation<string | undefined>,
  bookSetupProfile: Annotation<BookSetupProfile | null | undefined>,
  referenceMaterials: Annotation<
    Array<{
      id: string;
      title: string;
      mimeType: string;
      note: string;
    }>
  >({
    reducer: (_, value) => value,
    default: () => [],
  }),
  conversationMessages: Annotation<PromiseMessage[]>({
    reducer: (_, value) => value,
    default: () => [],
  }),
  assistantReply: Annotation<string | undefined>,
  extractedPromise: Annotation<PromiseBrief | undefined>,
  scorecard: Annotation<PromiseScorecard | undefined>,
  personaPack: Annotation<PersonaPack | undefined>,
  marketReport: Annotation<MarketReport | undefined>,
  recommendations: Annotation<PositioningRecommendations | undefined>,
});

function hasUsableOpenAIKey() {
  return Boolean(
    process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your-key-here",
  );
}

/**
 * Ensure .env file is loaded into process.env
 * Workaround for Next.js 16 Turbopack not always loading .env in server actions
 */
function ensureEnvLoaded(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    return; // Already loaded
  }

  try {
    const envPath = resolve(process.cwd(), ".env");
    const envContent = readFileSync(envPath, "utf-8");
    const lines = envContent.split("\n");
    for (const line of lines) {
      if (line.startsWith("ANTHROPIC_API_KEY=")) {
        const value = line.slice("ANTHROPIC_API_KEY=".length).trim();
        process.env.ANTHROPIC_API_KEY = value.replace(/^["']|["']$/g, "");
      } else if (line.startsWith("OPENAI_API_KEY=")) {
        const value = line.slice("OPENAI_API_KEY=".length).trim();
        process.env.OPENAI_API_KEY = value.replace(/^["']|["']$/g, "");
      } else if (line.startsWith("GOOGLE_GENERATIVE_AI_API_KEY=")) {
        const value = line.slice("GOOGLE_GENERATIVE_AI_API_KEY=".length).trim();
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = value.replace(/^["']|["']$/g, "");
      }
    }
  } catch (err) {
    console.error("[ensureEnvLoaded] Failed to read .env file:", err);
  }
}

async function getChatModel(
  overrides: {
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    maxRetries?: number;
  } = {},
) {
  ensureEnvLoaded();
  // Routed via provider layer: Sonnet for promise generation
  return getModelForRole("promise:author", {
    temperature: overrides.temperature ?? 0.25,
    maxOutputTokens: overrides.maxOutputTokens ?? 4000,
    timeoutMs: overrides.timeoutMs ?? 90000, // Increased from 30s to 90s to handle API latency
    maxRetries: overrides.maxRetries ?? 2,
  });
}

async function getStructuredPromiseModel(
  overrides: {
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    maxRetries?: number;
    reasoningEffort?: "minimal" | "low" | "medium" | "high";
  } = {},
) {
  ensureEnvLoaded();
  return getModelForRole(
    "promise:structured",
    {
      temperature: overrides.temperature ?? 0.15,
      maxOutputTokens: overrides.maxOutputTokens ?? 4000,
      timeoutMs: overrides.timeoutMs ?? 90000,
      maxRetries: overrides.maxRetries ?? 1,
      reasoningEffort: overrides.reasoningEffort ?? "medium",
    },
    "promise:author",
  );
}

async function getStructuredAudienceModel(
  overrides: {
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    maxRetries?: number;
    reasoningEffort?: "minimal" | "low" | "medium" | "high";
  } = {},
) {
  ensureEnvLoaded();
  return getModelForRole(
    "audience:structured",
    {
      temperature: overrides.temperature ?? 0.15,
      maxOutputTokens: overrides.maxOutputTokens ?? 4000,
      timeoutMs: overrides.timeoutMs ?? 90000,
      maxRetries: overrides.maxRetries ?? 1,
      reasoningEffort: overrides.reasoningEffort ?? "medium",
    },
    "audience:author",
  );
}

function getMarketAnalysisGoogleModelId() {
  const spec = parseModelSpec(resolveModelSpec("market-analysis:research"));
  if (spec.provider !== "google") {
    throw new Error(
      `market-analysis:research must resolve to a google model, received "${spec.provider}:${spec.model}"`,
    );
  }
  return spec.model;
}

async function getBookPitchModel(
  overrides: {
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    maxRetries?: number;
  } = {},
) {
  ensureEnvLoaded();
  // Downgraded from "final-editor:polish" (Opus, $0.60/1K) to "promise:author" (Sonnet, $0.018/1K)
  // Book Pitch is synthesis + formatting of pre-synthesized work, not complex creation
  // Saves ~$9.31 per book; Opus reserved for chapter-level draft editing
  return getModelForRole("promise:author", {
    temperature: overrides.temperature ?? 0.25,
    maxOutputTokens: overrides.maxOutputTokens ?? 8000,
    timeoutMs: overrides.timeoutMs ?? 120000,
    maxRetries: overrides.maxRetries ?? 2,
  });
}

const PROMISE_CONVERSATION_SYSTEM_PROMPT = `
You are the Promise-stage strategist for a serious nonfiction book platform.

Your job is not to flatter the user or produce generic business-book copy.
Your job is to help shape a book promise that is:
- clear
- commercially attractive
- specific to a real reader
- differentiated from generic leadership advice
- emotionally resonant without hype
- practical enough to support a full book

Behave like an experienced ghostwriter, editor, and positioning strategist.

Important rules:
- Do not sound like a consultant, marketer, or LinkedIn post.
- Do not use generic phrases like "navigate today's fast-paced world" unless the user already does.
- Do not give long inspirational speeches.
- Prefer grounded language over inflated language.
- Pressure-test the idea. If it is broad, say so plainly.
- Push toward a sharper reader, sharper pain, and sharper transformation.
- Preserve the user's voice and intent.
- For secular nonfiction, think in terms of ME -> WE -> CORE TRUTH -> YOU -> WE.
- Keep responses concise: usually 2 short paragraphs plus 2-4 labeled options or refinements when useful.

When you reply:
1. Name what is strong.
2. Name what is still weak, muddy, broad, or commercially risky.
3. Offer a stronger version of the promise or angle.
4. End with a very small number of concrete refinement options, not an open-ended brainstorm.
`;

const PROMISE_EXTRACTION_SYSTEM_PROMPT = `
Extract a structured nonfiction book promise from the conversation.

Optimize for specificity, commercial usefulness, and editorial clarity.

Rules:
- Fill every field with concrete language.
- Avoid generic filler.
- The audience must be a real buyer/reader segment, not "everyone."
- The big idea should be a portable one-sentence concept.
- The core truth should express the chapter/book-level governing truth in secular nonfiction terms.
- The promise statement should sound like back-cover positioning, not vague aspiration.
- The differentiation field must explain why this book is distinct from generic books in the category.
- Open questions should capture the most important unresolved strategic decisions, not trivia.
`;

const PROMISE_SCORECARD_SYSTEM_PROMPT = `
Score this book promise like a tough but fair publishing strategist.

Score from 1 to 10 for:
- clarity
- audienceFit
- distinctiveness
- commercialPull
- credibility

Rules:
- Do not inflate scores.
- A broad or generic promise should lose points.
- A promise with weak differentiation should lose points.
- Commercial pull should reflect whether the idea feels buyable, not merely smart.
- Strengths, concerns, and next revisions should be concrete and editorially useful.
`;

const PERSONA_SYSTEM_PROMPT = `
Generate reader personas for this nonfiction book promise.

Rules:
- Focus on real buyer/reader profiles, not abstract archetypes.
- Prefer 2-4 strong personas over a long list.
- Each persona should have a believable context, pain pattern, desired outcome, buying motivation, and language cues.
- Keep the language grounded and useful for positioning and writing.
- Avoid empty corporate jargon.
`;

const MARKET_REPORT_SYSTEM_PROMPT = `
You are a publishing strategist using Google Gemini to generate a full market analysis for a secular/business nonfiction book.

This is a building process, not an isolated prompt.
You MUST use the supplied Promise, Audience, Truth, Transformation, and knowledge-base materials as binding context.
Do not drift into generic category advice that ignores the personas, the core truth, or the transformation arc already established.

Return JSON only, matching MarketReport exactly.

Required sections:
1. executiveSummary
2. competitiveLandscape
3. marketSizing
4. audienceDemand
5. pricingStrategy
6. monetizationEcosystem
7. distributionAndLaunch
8. riskAssessment
9. successMetrics
10. financialProjections
11. goNoGoRecommendation

Rules:
- Treat all market size, sales, pricing, and revenue figures as qualified estimates. Prefer ranges or clearly qualified estimates over fake precision.
- Make direct competitors believable and commercially relevant.
- Show how this book differs from both direct book competitors and indirect alternatives like courses, coaching, frameworks, software, consultants, and internal programs.
- Market positioning must explicitly address these spectra:
  academicToPractical
  nicheToBroad
  theoreticalToActionOriented
  industrySpecificToUniversal
  whiteSpace
- Audience demand must be grounded in the supplied personas and their pain patterns.
- Pricing, launch, monetization, and risk sections should reflect the actual book promise and likely buyer behavior, not abstract publishing theory.
- comparisonTitles should be a concise summary version of the strongest direct competitors.
- attractionDrivers, commercialRisks, and recommendations should be crisp summary fields that align with the deeper sections.
- goNoGoRecommendation.overallRecommendation and executiveSummary.overallRecommendation must be one of: "GO", "NO_GO", "CONDITIONAL_GO".
`;

const POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT = `
You are the recommendations strategist for a secular/business nonfiction book platform.

This phase synthesizes Promise, Audience, TRUTH, Transformation, Market, and knowledge-base materials into an action blueprint.
Do not produce generic encouragement. Produce a practical strategic recommendation set that tells the user what to do next and why.

Return JSON only, matching PositioningRecommendations exactly.

Required sections:
1. summary
2. recommendations
3. bookStrategy
4. positioningAndMarketing
5. launchAndGoToMarket
6. personaStrategies
7. crossPersonaMessaging
8. monetizationRecommendations
9. teamAndResources
10. riskMitigationRecommendations
11. successMetricsAndKpis
12. financialRecommendations
13. finalRecommendation

Rules:
- Use prior phases as binding context, not loose inspiration.
- Recommendations must flow from the actual personas, the core truth, the transformation journey, and the market analysis already created.
- Keep the advice commercially specific and operationally useful.
- summary should be 2-4 sentences that explain the overall strategic direction.
- recommendations should be a concise flat list of the highest-priority recommendations.
- personaStrategies should cover the first 3 available personas.
- finalRecommendation.overallRecommendation must be one of: "GO", "NO_GO", "CONDITIONAL_GO".
- When giving pricing, budgeting, or revenue advice, use qualified estimates or ranges rather than fake precision.
- The immediate next steps must be concrete enough to execute before Outline.
`;

const TITLE_SUBTITLE_FINALIZATION_SYSTEM_PROMPT = `
You are the title and subtitle strategist for a serious secular/business nonfiction book.

This is not brainstorming for its own sake. Your job is to use the approved Promise, Audience, Truth, Transformation, Market, Recommendations, and knowledge-base context to lock a commercially strong, audience-legible title package before the Book Pitch is compiled.

Return JSON only, matching TitleSubtitleFinalization exactly.

Rules:
- Treat prior phases as binding context.
- Optimize for clarity, market signal, specificity, and memorability.
- The title should be short, distinct, and commercially legible.
- The subtitle should do the heavy lifting on audience, promise, and mechanism.
- Use audience segment language, role context, and real buyer pain from the research. Do not use fictitious persona names as the primary framing.
- If the current title is already strong, you may keep it, but explain why.
- alternatives should contain 2-4 viable fallback packages that are clearly different, not tiny wording tweaks.
- Avoid generic business-book cliches unless the underlying data strongly supports them.
`;

const BOOK_PITCH_SYSTEM_PROMPT = `
You are the final pitch-package strategist for a serious secular/business nonfiction book.

Your job is to synthesize the complete Promise workflow into a polished Book Pitch package that can align the internal team, support partner conversations, and act as the north-star document before Outline.

Return MARKDOWN ONLY.
Do not wrap the markdown in code fences.
Do not return JSON.

The package must follow this structure in order:
1. EXECUTIVE SUMMARY
2. SECTION 1: BOOK VISION
3. SECTION 2: AUDIENCE & PERSONAS
4. SECTION 3: TRANSFORMATION JOURNEY
5. SECTION 4: COMPETITIVE LANDSCAPE
6. SECTION 5: MARKET OPPORTUNITY
7. SECTION 6: BUSINESS MODEL
8. SECTION 7: LAUNCH & MARKETING STRATEGY
9. SECTION 8: FINANCIAL PROJECTIONS
10. SECTION 9: SUCCESS METRICS & KPIS
11. SECTION 10: RECOMMENDATIONS & NEXT STEPS
12. APPENDICES

Rules:
- Treat prior phases as binding context, not inspiration.
- Use the user's title only if it is still the best title; otherwise present a stronger title recommendation and make that explicit.
- Keep claims commercially credible and operationally useful.
- Use estimates from the market work; avoid fake precision.
- Make the package feel investor-ready, publisher-ready, and internal-team-ready at the same time.
- The tone should be confident, strategic, practical, and concise.
- The pitch must clearly state a GO, NO_GO, or CONDITIONAL recommendation and why.
- In the audience section, describe recognizable audience segments, roles, and buying contexts from the Audience analysis. Do not rely on fictitious first-and-last-name personas as the main framing.
- The finished package should read like a single editable proposal document, not a stack of internal notes.
- The document must explicitly integrate:
  - Promise
  - Audience/personas
  - Core truth
  - Transformation journey
  - Market analysis
  - Recommendations
  - Knowledge-base signals when relevant
- If the evidence is directional rather than exact, say estimated or qualified rather than inventing certainty.
- The package should read like a final professional deliverable, not notes.
`;

const BOOK_PITCH_SECTION_PLANS = [
  {
    key: "foundation",
    headings: [
      "EXECUTIVE SUMMARY",
      "SECTION 1: BOOK VISION",
      "SECTION 2: AUDIENCE & PERSONAS",
      "SECTION 3: TRANSFORMATION JOURNEY",
    ],
    guidance:
      "Make this cluster especially strong on concept clarity, audience specificity, and transformation logic. Write enough detail that it can guide editorial and positioning decisions without needing the other sections open.",
  },
  {
    key: "market",
    headings: [
      "SECTION 4: COMPETITIVE LANDSCAPE",
      "SECTION 5: MARKET OPPORTUNITY",
      "SECTION 6: BUSINESS MODEL",
      "SECTION 7: LAUNCH & MARKETING STRATEGY",
    ],
    guidance:
      "Make this cluster commercially credible and specific. Use qualified estimates, explain differentiation clearly, and connect go-to-market choices back to the personas and book promise.",
  },
  {
    key: "execution",
    headings: [
      "SECTION 8: FINANCIAL PROJECTIONS",
      "SECTION 9: SUCCESS METRICS & KPIS",
      "SECTION 10: RECOMMENDATIONS & NEXT STEPS",
      "APPENDICES",
    ],
    guidance:
      "Make this cluster execution-oriented. Show how the project will be measured, what must happen next, and what supporting reference material matters most.",
  },
] as const;

const AUDIENCE_RESEARCH_PHASE1_SYSTEM_PROMPT = `
You are a market research strategist conducting audience discovery for a nonfiction book.

Your task: Generate 5-7 deeply probing research questions AND ANSWER each one based on the book promise. Also identify 3-4 broad user types (role-based market segments) that would benefit from this book.

Rules for research questions:
- Questions should probe WHO specifically needs this book (not "everyone")
- Questions should probe their CURRENT SITUATION and what's keeping them stuck
- Questions should probe their GOALS and what winning looks like
- Questions should probe their OBJECTIONS and what proof would change their mind
- Questions should probe WHERE they get information and HOW they decide to buy
- Be specific and actionable, not generic
- For EACH question, provide a substantive answer that gives concrete insights about the target audience based on the book promise

Rules for answers:
- Draw from the book promise, stated pain, desired transformation, and positioning
- Provide specific, grounded answers (not generic)
- Answer should be 1-3 sentences of strategic insight
- Show understanding of WHO this book serves and WHY

Rules for identified user types:
- Each user type should be a real role-based group (e.g., "Mid-level manager scaling first team")
- Include 1-2 sentence description of who they are
- Include 3-4 bullet-point details about their situation, pain, or motivation
- Make them distinct from each other

Return JSON only. Do not use markdown fences. Do not add commentary before or after the JSON.
Return an object with exactly these top-level keys:
- researchQuestions: array of {question, answer}
- identifiedUserTypes: array of {name, description, details}
`;

const AUDIENCE_RESEARCH_PHASE2_SYSTEM_PROMPT = `You are creating detailed reader personas for a nonfiction book.

Return JSON only. Do not use markdown fences. Do not add commentary before or after the JSON.

Hard requirements:
- Match the requested JSON keys exactly.
- Generate exactly the number of personas requested.
- Keep each persona distinct in role, context, and pain pattern.
- Keep prose concise but specific: 1-2 sentences for long text fields.
- Use 3-4 items for list fields unless the caller asks for fewer.
- \`yearsInRole\` and \`teamSize\` must be JSON numbers, not strings.
- Use \`dayInTheLife\`, not \`dayToDay\`.
- Include \`reportsTo\`.
- Use only \`outcome\` or \`feeling\` for goal types.

Return an object shaped exactly like this:
{
  "personas": [
    {
      "id": "persona_slug",
      "name": "Name",
      "priority": "primary",
      "demographics": {
        "role": "Role",
        "companyType": "Company type",
        "yearsInRole": 5,
        "careerPath": "Career path",
        "dayInTheLife": "One short summary of a typical day",
        "reportsTo": "Manager title",
        "teamSize": 5
      },
      "currentSituation": {
        "whatTheyDo": "What they do",
        "whatWorks": ["..."],
        "whatDoesntWork": ["..."],
        "timeAllocation": "How time is split",
        "biggestFrustration": "Main frustration"
      },
      "goals": [
        { "goal": "Specific goal", "type": "outcome" }
      ],
      "painPoints": [
        { "friction": "Specific friction", "realCost": "Concrete cost" }
      ],
      "objections": [
        { "objection": "Reason for doubt", "proofNeeded": "What would change their mind" }
      ],
      "successMetrics": [
        { "metric": "How they measure success", "feeling": "Optional feeling" }
      ],
      "learningStyle": {
        "prefers": ["..."],
        "hates": ["..."],
        "bestFormat": "Preferred learning format"
      },
      "voiceBlendFit": {
        "primary": "Most resonant voice",
        "secondary": "Optional secondary voice",
        "tertiary": "Optional tertiary voice",
        "reasoning": "Why this voice blend fits"
      }
    }
  ]
}`;


const AUDIENCE_RESEARCH_PHASE3_SYSTEM_PROMPT = `You are a strategic analyst comparing reader personas to identify patterns and the primary audience.

Return JSON only. Do not use markdown fences. Do not add commentary before or after the JSON.

Hard requirements:
- Match the requested JSON keys exactly.
- Use the exact persona names provided in the input.
- Keep every field concise and specific.
- Include 3-5 common themes.
- Include exactly one difference entry per persona.
- Include 5-6 comparison matrix dimensions.
- Every comparison matrix row must include a value for every persona.

Return an object shaped exactly like this:
{
  "commonThemes": [
    "Shared theme"
  ],
  "differences": [
    {
      "persona": "Persona Name",
      "difference": "What makes this persona strategically distinct"
    }
  ],
  "primaryPersona": {
    "name": "Persona Name",
    "reasoning": "Why this is the primary persona based on urgency, market size, and reachability"
  },
  "comparisonMatrix": [
    {
      "dimension": "Primary Pain",
      "personas": [
        {
          "name": "Persona Name",
          "value": "Short comparison value"
        }
      ]
    }
  ]
}`;

const CORE_TRUTHS_SYSTEM_PROMPT = `
You are a strategic nonfiction book architect generating the TRUTH section for a promise workflow.

Your task is to synthesize ONE governing truth for the book using this exact framework:

1. Core Insight (The Reframe)
- falseBelief: what the reader currently believes
- coreTruth: the single sentence that flips their understanding

2. The Paradox or Counter-Intuitive Element
- whatMakesThisSurprising: why the truth feels challenging or surprising
- whyItFeelsBackwards: what assumption it contradicts

3. Why This Truth Matters (The Stakes)
- ifEmbraced: what becomes possible if they accept the truth
- ifIgnored: what is lost if they cling to the false belief

4. Evidence or Proof
- methods: choose one or more exact values from:
  "Story/Narrative"
  "Framework/System/Model"
  "Research/Data/Studies"
  "Analogy/Metaphor"
  "Real example/Case study"
- specificEvidence: what concrete proof the book should use

5. Persona Experiences
- Return exactly 3 persona experiences
- Tailor each one to the specific dilemma, context, and buying motivation of that persona
- voiceBlendResonates.voice must be one of: "Andy", "Drucker", "Jobs"
- voiceBlendResonates.why explains why that voice lands for them

6. Why Now
- whyUrgentNow: why this truth matters now more than five years ago
- escalatedProblem: what has worsened or broken

7. Bridge From Old to New
- permissionNeeded: what fear or identity concern must be released
- transitionReframe: how to help them let go of the old belief
- whatStaysSame: what remains valid from the old worldview

8. Complete Truth
- completeTruth: a 2-3 sentence synthesis of the full TRUTH section

Rules:
- This is for a secular nonfiction book
- Be specific, sharp, and commercially relevant
- The truth should feel like a genuine reframe, not a platitude
- Make the paradox emotionally legible and strategically useful
- Make the persona sections feel individualized, not copy-swapped
- Use the supplied Promise and Audience research as prior-phase constraints, not loose inspiration
- Pull language, tensions, and proof cues from the provided knowledge-base materials when they are relevant
- Return JSON only, matching CoreTruthsArtifact exactly
`;

const TRANSFORMATION_ARC_SYSTEM_PROMPT = `
You are designing the Transformation Journey Framework for a secular/business nonfiction book.

Build the transformation using the ME-WE-TRUTH-YOU-WE structure.

Stage 1: ME
- Answer the author's personal dilemma.
- Include: a real challenge, the false belief, how it showed up, the cost, why the author is qualified, what vulnerability humanizes them, and how the voice blend comes through.

Stage 2: WE
- Surface the shared dilemma across the first 3 reader personas.
- Include: the shared problem, universal tension, one individualized dilemma for each persona, the question that should emerge in the reader's mind, and the stories/emotional framing that make the problem felt.

Stage 3: TRUTH
- Reframe the problem with the one core truth.
- Include: the core truth, the reframe, the paradox, how readers encounter it, how it answers each persona's dilemma, which voice blend lands best for each persona, what form the truth takes, and the stakes if embraced or ignored.

Stage 4: YOU
- Translate the truth into action.
- Include: the first action, what each persona does next, what feels difficult or risky for them, how detailed the instruction should be, what resistance emerges, and what separates success from failure.

Stage 5: Final WE
- Cast the vision of what becomes possible.
- Include: what success looks like, what changes for each persona, the larger collective vision, the belief shift, and why the transformation becomes identity-level and hard to reverse.

Stage 6: Implicit Patterns & Themes
- Include: themes shared across all personas, what kind of story best illustrates each stage, where Andy's clarity matters most, where Drucker's strategy matters most, where Jobs's inspiration matters most, and the implicit lessons each stage teaches.

Stage 7: Book Map Framework
- Include: the opening story, where the shared dilemma appears, where the core truth is revealed, where practical application begins, where vision casting happens, and how all personas are served without naming them in the book.

Rules:
- This is for a secular/business book, not spiritual language.
- Use the first three personas available from the prompt; personalize each stage for them.
- Be specific, emotionally legible, and commercially useful.
- Return JSON only, matching TransformationArtifact exactly.
`;

function parseArtifactJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

/**
 * Committed BOOK_SETUP_PROFILE artifacts come in two shapes: the structured
 * profile (settings form / seeded default) and a markdown {text} blob
 * (Blueprint chat commits). Blind-casting the blob crashed every downstream
 * field access — shallow-merging over defaults gives all consumers the full
 * profile shape either way, and also backfills fields added after older
 * profiles were saved.
 */
function normalizeBookSetupProfile(value: unknown): BookSetupProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return { ...DEFAULT_BOOK_SETUP_PROFILE, ...(value as Partial<BookSetupProfile>) };
}

function formatSetupContextForPrompt(profile?: BookSetupProfile | null) {
  if (!profile) {
    return "No committed book setup profile is available yet.";
  }

  const setupLines = [
    `Working title: ${profile.workingTitle || "Untitled Book"}`,
    `Writer persona: ${profile.writerPersona}`,
  ];

  // Add blended voice guidance if a blend exists
  if (profile.writerPersonaBlend && profile.writerPersonaBlend.length > 0) {
    // Format blend details for system prompt
    const blendDetails = profile.writerPersonaBlend
      .filter((p) => p.percentInfluence > 0)
      .map((p) => {
        const traitsStr = p.traits.length > 0 ? `traits: ${p.traits.join(", ")}` : "";
        const patternsStr =
          p.signaturePatterns.length > 0 ? `patterns: ${p.signaturePatterns.join(" | ")}` : "";
        const details = [traitsStr, patternsStr].filter(Boolean).join("; ");
        return `  - ${p.personaName} (${p.percentInfluence}%): ${details}`;
      })
      .join("\n");

    setupLines.push(`Voice Blend Composition:\n${blendDetails}`);
    setupLines.push(
      `Blending Instructions: Weight each persona's influence by their percentage. The combined voice should balance all perspectives while maintaining coherent narrative identity.`,
    );
  }

  setupLines.push(
    `Writer persona guidance: ${profile.writerPersonaGuidance?.join(" | ") || "None provided"}`,
  );
  setupLines.push(`Target word count: ${profile.targetWordCount}`);
  setupLines.push(`Word-count tolerance: +/- ${profile.wordCountTolerance}`);
  setupLines.push(`Trim size: ${profile.trimSize}`);
  setupLines.push(`Output formats: ${profile.outputFormats.join(", ")}`);
  setupLines.push(`Voice references: ${profile.voiceReferenceNotes.join(" | ") || "None provided"}`);
  setupLines.push(`System notes: ${profile.notesToSystem.join(" | ") || "None provided"}`);

  return setupLines.join("\n");
}

function formatReferenceMaterialsForPrompt(
  materials?: Array<{
    id: string;
    title: string;
    mimeType: string;
    note: string;
  }>,
) {
  if (!materials || materials.length === 0) {
    return "No uploaded reference materials are available for the Promise stage.";
  }

  return materials
    .map(
      (material, index) =>
        `${index + 1}. ${material.title} (${material.mimeType})${material.note ? ` - ${material.note}` : ""}`,
    )
    .join("\n");
}

/**
 * Get knowledge base context for a given query and book
 * Used across all generation functions to ground AI outputs in actual book materials
 */
async function getKnowledgeContextForPrompt(
  bookId: string,
  query?: string,
  maxResults?: number
): Promise<string> {
  const grounding = await getKnowledgeGroundingForPrompt(bookId, query, maxResults);
  return grounding.text;
}

function deriveKnowledgeFallbackCharLimit(query?: string, maxResults?: number): number {
  if (query && query.trim().length > 0) {
    const requestedResults = Math.max(1, Math.min(maxResults ?? 4, 8));
    return Math.min(16000, Math.max(6000, requestedResults * 2500));
  }

  return 30000;
}

async function getKnowledgeGroundingForPrompt(
  bookId: string,
  query?: string,
  maxResults?: number,
): Promise<{ text: string; sourceTitles: string[] }> {
  try {
    if (query && query.trim().length > 0) {
      const results = await searchKnowledgeBase({
        bookId,
        query,
        limit: maxResults ?? 4,
      });

      if (results.length > 0) {
        const formatted = formatKnowledgeForPrompt(results);
        console.log(
          `[getKnowledgeContextForPrompt] Loaded ${results.length} relevant search hits, ${formatted.length} characters`
        );
        return {
          text: `\n\n=== RELEVANT BOOK MATERIALS ===\n${formatted}`,
          sourceTitles: results.map((result) => result.sourceTitle).filter(Boolean),
        };
      }
    }

    const fallbackCharLimit = deriveKnowledgeFallbackCharLimit(query, maxResults);
    const knowledge = await getBookKnowledgeBase(bookId, fallbackCharLimit);

    if (knowledge.content && knowledge.sourceCount > 0) {
      console.log(
        `[getKnowledgeContextForPrompt] Loaded ${knowledge.sourceCount} fallback sources, ${knowledge.content.length} characters (limit ${fallbackCharLimit})`
      );
      const sourceTitles = knowledge.content
        .split("\n")
        .filter((line) => line.startsWith("Source: "))
        .map((line) => line.replace(/^Source:\s*/, "").trim())
        .filter(Boolean);

      return {
        text: `\n\n=== GROUNDED IN ACTUAL BOOK MATERIALS ===\n${knowledge.content}`,
        sourceTitles,
      };
    }
  } catch (error) {
    console.warn(
      "[getKnowledgeContextForPrompt] Knowledge base load failed:",
      error
    );
  }

  return {
    text: "",
    sourceTitles: [],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function coerceString(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (match) {
      const parsed = Number.parseFloat(match[0]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceString(item, ""))
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function normalizeAudienceResearchQuestion(value: unknown): { question: string; answer: string } {
  const raw = asRecord(value);

  return {
    question: coerceString(raw.question, "Who specifically needs this book?"),
    answer: coerceString(raw.answer, "This book serves readers whose current situation maps to the core promise."),
  };
}

function normalizeAudienceResearchUserType(
  value: unknown,
  index: number,
): AudienceResearchPhase1["identifiedUserTypes"][number] {
  const raw = asRecord(value);
  const fallbackName = `Audience Segment ${index + 1}`;

  return {
    name: coerceString(raw.name, fallbackName),
    description: coerceString(
      raw.description,
      "A reader segment whose role and pain align with the promise of the book.",
    ),
    details: coerceStringArray(raw.details ?? raw.bullets ?? raw.situation ?? raw.painPoints).slice(0, 5),
  };
}

function normalizeAudienceResearchPhase1(value: unknown): AudienceResearchPhase1 {
  const raw = asRecord(value);
  const normalized = {
    researchQuestions: Array.isArray(raw.researchQuestions)
      ? raw.researchQuestions.map((entry) => normalizeAudienceResearchQuestion(entry))
      : [],
    identifiedUserTypes: Array.isArray(raw.identifiedUserTypes)
      ? raw.identifiedUserTypes.map((entry, index) => normalizeAudienceResearchUserType(entry, index))
      : [],
  };

  return AudienceResearchPhase1Schema.parse(normalized);
}

function toPersonaId(value: unknown, fallbackName: string, index: number): string {
  const source = coerceString(value, fallbackName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return source.length > 0 ? source : `persona-${index + 1}`;
}

function normalizeGoal(value: unknown): { goal: string; type: "outcome" | "feeling" } {
  if (typeof value === "string") {
    return { goal: value.trim(), type: "outcome" };
  }

  const raw = asRecord(value);
  const type = raw.type === "feeling" ? "feeling" : "outcome";

  return {
    goal: coerceString(raw.goal, "Reach a meaningful improvement"),
    type,
  };
}

function normalizePainPoint(value: unknown): { friction: string; realCost: string } {
  const raw = asRecord(value);

  return {
    friction: coerceString(raw.friction, "Current workflow friction"),
    realCost: coerceString(raw.realCost, "Lost time and momentum"),
  };
}

function normalizeObjection(value: unknown): { objection: string; proofNeeded: string } {
  const raw = asRecord(value);

  return {
    objection: coerceString(raw.objection, "Unsure this advice will fit their context"),
    proofNeeded: coerceString(raw.proofNeeded, "Examples from someone in a similar role"),
  };
}

function normalizeSuccessMetric(value: unknown): { metric: string; feeling?: string } {
  const raw = asRecord(value);
  const feeling = coerceString(raw.feeling, "");

  return {
    metric: coerceString(raw.metric, "Visible progress toward the desired outcome"),
    ...(feeling ? { feeling } : {}),
  };
}

function normalizePersonaDeepProfile(value: unknown, index: number): PersonaDeepProfile {
  const raw = asRecord(value);
  const demographics = asRecord(raw.demographics);
  const currentSituation = asRecord(raw.currentSituation);
  const learningStyle = asRecord(raw.learningStyle);
  const voiceBlendFit = asRecord(raw.voiceBlendFit);
  const fallbackName = `Persona ${index + 1}`;

  return {
    id: toPersonaId(raw.id, coerceString(raw.name, fallbackName), index),
    name: coerceString(raw.name, fallbackName),
    priority: raw.priority === "primary" || raw.priority === "secondary" ? raw.priority : undefined,
    demographics: {
      role: coerceString(demographics.role, "Professional reader"),
      companyType: coerceString(demographics.companyType, "Mixed organizations"),
      yearsInRole: coerceNumber(demographics.yearsInRole, 5),
      careerPath: coerceString(demographics.careerPath, "Progressed into this role over time"),
      dayInTheLife: coerceString(
        demographics.dayInTheLife ?? demographics.dayToDay ?? demographics.daySummary,
        "Spends most of the day balancing urgent work with people and delivery demands.",
      ),
      reportsTo: coerceString(demographics.reportsTo, "Senior leader"),
      teamSize: coerceNumber(demographics.teamSize, 0),
    },
    currentSituation: {
      whatTheyDo: coerceString(currentSituation.whatTheyDo, "Owns meaningful work tied to the book promise."),
      whatWorks: coerceStringArray(currentSituation.whatWorks),
      whatDoesntWork: coerceStringArray(
        currentSituation.whatDoesntWork ?? currentSituation.whatDoesntWorkWell,
      ),
      timeAllocation: coerceString(
        currentSituation.timeAllocation ?? currentSituation.timeUse,
        "Time is split across execution, communication, and firefighting.",
      ),
      biggestFrustration: coerceString(
        currentSituation.biggestFrustration,
        "Their current approach is not producing consistent results.",
      ),
    },
    goals: Array.isArray(raw.goals) ? raw.goals.map(normalizeGoal) : [],
    painPoints: Array.isArray(raw.painPoints) ? raw.painPoints.map(normalizePainPoint) : [],
    objections: Array.isArray(raw.objections) ? raw.objections.map(normalizeObjection) : [],
    successMetrics: Array.isArray(raw.successMetrics)
      ? raw.successMetrics.map(normalizeSuccessMetric)
      : [],
    learningStyle: {
      prefers: coerceStringArray(learningStyle.prefers),
      hates: coerceStringArray(learningStyle.hates),
      bestFormat: coerceString(
        learningStyle.bestFormat,
        "Concrete examples paired with practical frameworks",
      ),
    },
    voiceBlendFit: {
      primary: coerceString(voiceBlendFit.primary, "Practical and direct"),
      ...(typeof voiceBlendFit.secondary === "string" && voiceBlendFit.secondary.trim().length > 0
        ? { secondary: voiceBlendFit.secondary.trim() }
        : {}),
      ...(typeof voiceBlendFit.tertiary === "string" && voiceBlendFit.tertiary.trim().length > 0
        ? { tertiary: voiceBlendFit.tertiary.trim() }
        : {}),
      reasoning: coerceString(
        voiceBlendFit.reasoning ?? voiceBlendFit.why,
        "This blend matches how the persona wants to learn and act.",
      ),
    },
  };
}

function extractTextFromResponse(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }

  const raw = asRecord(response);
  const content = raw.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        const record = asRecord(part);
        return typeof record.text === "string" ? record.text : "";
      })
      .join("\n");
  }

  return JSON.stringify(response);
}

class JsonExtractionError extends Error {
  code: "missing_json" | "incomplete_json";
  details: {
    candidateLength: number;
    startIndex: number;
    openBraceDepth: number;
    endedInString: boolean;
  };

  constructor(
    code: "missing_json" | "incomplete_json",
    message: string,
    details: {
      candidateLength: number;
      startIndex: number;
      openBraceDepth: number;
      endedInString: boolean;
    },
  ) {
    super(message);
    this.name = "JsonExtractionError";
    this.code = code;
    this.details = details;
  }
}

function extractBalancedJsonObject(candidate: string): {
  jsonText: string | null;
  startIndex: number;
  openBraceDepth: number;
  endedInString: boolean;
} {
  const start = candidate.indexOf("{");

  if (start === -1) {
    return {
      jsonText: null,
      startIndex: -1,
      openBraceDepth: 0,
      endedInString: false,
    };
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return {
          jsonText: candidate.slice(start, index + 1),
          startIndex: start,
          openBraceDepth: 0,
          endedInString: false,
        };
      }
    }
  }

  return {
    jsonText: null,
    startIndex: start,
    openBraceDepth: depth,
    endedInString: inString,
  };
}

function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (codeBlockMatch?.[1] ?? trimmed).trim();

  const balanced = extractBalancedJsonObject(candidate);

  if (balanced.jsonText) {
    return balanced.jsonText.trim();
  }

  if (!candidate.includes("{")) {
    throw new JsonExtractionError("missing_json", "No JSON object found in LLM response", {
      candidateLength: candidate.length,
      startIndex: balanced.startIndex,
      openBraceDepth: balanced.openBraceDepth,
      endedInString: balanced.endedInString,
    });
  }

  throw new JsonExtractionError(
    "incomplete_json",
    "LLM response ended before the JSON object was complete",
    {
      candidateLength: candidate.length,
      startIndex: balanced.startIndex,
      openBraceDepth: balanced.openBraceDepth,
      endedInString: balanced.endedInString,
    },
  );
}

function getResponseMetadata(response: unknown): Record<string, unknown> {
  const raw = asRecord(response);
  return asRecord(raw.response_metadata);
}

function getUsageMetadata(response: unknown): Record<string, unknown> {
  const raw = asRecord(response);
  return asRecord(raw.usage_metadata);
}

function asOptionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeTokenUsageMetadata(raw: unknown): PromiseTokenUsage | undefined {
  const record = asRecord(raw);
  const tokenUsage: PromiseTokenUsage = {
    inputTokens: asOptionalFiniteNumber(
      record.input_tokens ?? record.inputTokens ?? record.promptTokenCount,
    ),
    outputTokens: asOptionalFiniteNumber(
      record.output_tokens ?? record.outputTokens ?? record.candidatesTokenCount,
    ),
    totalTokens: asOptionalFiniteNumber(
      record.total_tokens ?? record.totalTokens ?? record.totalTokenCount,
    ),
    cacheReadInputTokens: asOptionalFiniteNumber(
      record.cache_read_input_tokens ?? record.cacheReadInputTokens,
    ),
    cacheWriteInputTokens: asOptionalFiniteNumber(
      record.cache_creation_input_tokens ?? record.cacheWriteInputTokens,
    ),
    reasoningTokens: asOptionalFiniteNumber(
      record.reasoning_tokens ?? record.reasoningTokens ?? record.thoughtsTokenCount,
    ),
  };

  if (Object.values(tokenUsage).every((value) => value == null)) {
    return undefined;
  }

  return tokenUsage;
}

function mergeArtifactMetadata(
  metadata: PromiseArtifactMetadata | undefined,
  updates: PromiseArtifactMetadata,
): PromiseArtifactMetadata {
  return {
    ...(metadata ?? {}),
    ...(updates ?? {}),
    grounding: {
      ...(metadata?.grounding ?? {}),
      ...(updates?.grounding ?? {}),
    },
    tokenUsage: updates?.tokenUsage ?? metadata?.tokenUsage,
  };
}

function getStopReason(response: unknown): string | undefined {
  const metadata = getResponseMetadata(response);
  const stopReason = metadata.stop_reason ?? metadata.stopReason;
  return typeof stopReason === "string" ? stopReason : undefined;
}

function isLikelyTruncatedJson(
  jsonText: string,
  error: unknown,
  stopReason?: string,
): boolean {
  if (stopReason === "max_tokens") {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  if (error instanceof JsonExtractionError) {
    return error.code === "incomplete_json";
  }

  if (jsonText.trim().endsWith("}")) {
    return false;
  }

  return /Unexpected end|Unterminated|string at position|Expected ',' or '\]' after array element|ended before the JSON object was complete/i.test(
    error.message,
  );
}

function summarizePersonasForPrompt(personas: PersonaDeepProfile[]) {
  return personas.map((persona) => ({
    id: persona.id,
    name: persona.name,
    role: persona.demographics.role,
    companyType: persona.demographics.companyType,
    biggestFrustration: persona.currentSituation.biggestFrustration,
  }));
}

function buildPersonaGenerationInstruction(requestedCount: number) {
  const countInstruction =
    requestedCount === 1
      ? "Generate exactly 1 reader persona that is materially distinct from any existing personas."
      : `Generate exactly ${requestedCount} reader personas that are materially distinct from any existing personas.`;

  return [
    countInstruction,
    "Match the schema exactly.",
    "Return a top-level object with a `personas` array only.",
    "For every persona include demographics.role, demographics.companyType, demographics.yearsInRole, demographics.careerPath, demographics.dayInTheLife, demographics.reportsTo, demographics.teamSize.",
    "Use `dayInTheLife` exactly. Do not use `dayToDay`, `daySummary`, or alternate keys.",
    "Use JSON numbers for `yearsInRole` and `teamSize`.",
    "Always include `reportsTo` as a concrete manager or executive title.",
    "Use only `outcome` or `feeling` for goal types.",
    "Keep each long-form field to 1-2 sentences so the full JSON fits in one response.",
  ].join(" ");
}

function getPersonaDeepProfileBatchSize(_requestedPersonaCount: number): number {
  // Default to pairs for the happy path, then rely on truncation-aware retry
  // logic to split a batch down to a single persona only when needed.
  return _requestedPersonaCount <= 1 ? 1 : 2;
}

function getPersonaDeepProfilePhaseBudgetMs(requestedPersonaCount: number): number {
  const boundedPersonaCount = Math.max(1, Math.min(requestedPersonaCount, 10));
  const estimatedBatches = Math.ceil(
    boundedPersonaCount / getPersonaDeepProfileBatchSize(boundedPersonaCount),
  );

  return Math.min(240000, Math.max(120000, estimatedBatches * 60000));
}

function summarizePersonasForComparison(personas: PersonaDeepProfile[]) {
  return personas.map((persona) => ({
    name: persona.name,
    priority: persona.priority ?? "secondary",
    demographics: {
      role: persona.demographics.role,
      companyType: persona.demographics.companyType,
      yearsInRole: persona.demographics.yearsInRole,
      teamSize: persona.demographics.teamSize,
      reportsTo: persona.demographics.reportsTo,
    },
    currentSituation: {
      whatTheyDo: persona.currentSituation.whatTheyDo,
      biggestFrustration: persona.currentSituation.biggestFrustration,
      whatWorks: persona.currentSituation.whatWorks.slice(0, 3),
      whatDoesntWork: persona.currentSituation.whatDoesntWork.slice(0, 3),
    },
    goals: persona.goals.slice(0, 4),
    painPoints: persona.painPoints.slice(0, 4),
    successMetrics: persona.successMetrics.slice(0, 3),
    learningStyle: persona.learningStyle,
    voiceBlendFit: persona.voiceBlendFit,
  }));
}

function buildFallbackPersonaComparisonAnalysis(
  personas: PersonaDeepProfile[],
): PersonaComparisonAnalysis {
  const primaryPersona =
    personas.find((persona) => persona.priority === "primary") ?? personas[0];

  return {
    commonThemes: [
      "All personas want a practical framework they can apply immediately instead of abstract leadership theory.",
      "Each persona is dealing with execution friction that creates drag across people, priorities, and accountability.",
      "They need language and structure that make difficult organizational problems easier to diagnose and discuss.",
    ],
    differences: personas.map((persona) => ({
      persona: persona.name,
      difference: `${persona.name} is a ${persona.demographics.role} in ${persona.demographics.companyType} and feels the problem most sharply as ${persona.currentSituation.biggestFrustration}`,
    })),
    primaryPersona: {
      name: primaryPersona?.name || "Primary Persona",
      reasoning: primaryPersona
        ? `${primaryPersona.name} appears to be the strongest primary persona because the pain is urgent, the role carries buying influence, and the problem is central to day-to-day execution.`
        : "This persona appears to combine the clearest pain, strongest business urgency, and most direct path to action.",
    },
    comparisonMatrix: [
      {
        dimension: "Role",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: persona.demographics.role,
        })),
      },
      {
        dimension: "Company Context",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: persona.demographics.companyType,
        })),
      },
      {
        dimension: "Team Size",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: String(persona.demographics.teamSize),
        })),
      },
      {
        dimension: "Primary Pain",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: persona.currentSituation.biggestFrustration,
        })),
      },
      {
        dimension: "Best Format",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: persona.learningStyle.bestFormat,
        })),
      },
      {
        dimension: "Voice Blend Match",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: persona.voiceBlendFit.primary,
        })),
      },
    ],
  };
}

function normalizePersonaComparisonAnalysis(
  value: unknown,
  personas: PersonaDeepProfile[],
): PersonaComparisonAnalysis {
  const fallback = buildFallbackPersonaComparisonAnalysis(personas);
  const raw = asRecord(value);
  const personaNames = new Set(personas.map((persona) => persona.name));

  const commonThemes =
    Array.isArray(raw.commonThemes) && raw.commonThemes.length > 0
      ? raw.commonThemes
          .map((theme) => coerceString(theme, ""))
          .filter((theme) => theme.length > 0)
      : fallback.commonThemes;

  const differences =
    Array.isArray(raw.differences) && raw.differences.length > 0
      ? raw.differences
          .map((entry, index) => {
            if (typeof entry === "string") {
              return {
                persona: personas[index]?.name || `Persona ${index + 1}`,
                difference: entry,
              };
            }

            const differenceRecord = asRecord(entry);
            const personaName = coerceString(
              differenceRecord.persona,
              personas[index]?.name || `Persona ${index + 1}`,
            );

            return {
              persona: personaNames.has(personaName)
                ? personaName
                : personas[index]?.name || personaName,
              difference: coerceString(
                differenceRecord.difference,
                fallback.differences[index]?.difference || "Distinct context and buying motivation.",
              ),
            };
          })
          .filter((entry) => entry.difference.length > 0)
      : fallback.differences;

  const primaryPersonaRecord = asRecord(raw.primaryPersona);
  const requestedPrimaryName = coerceString(primaryPersonaRecord.name, fallback.primaryPersona.name);
  const resolvedPrimaryName =
    personas.find((persona) => persona.name === requestedPrimaryName)?.name ||
    fallback.primaryPersona.name;

  const comparisonMatrix =
    Array.isArray(raw.comparisonMatrix) && raw.comparisonMatrix.length > 0
      ? raw.comparisonMatrix
          .map((row, rowIndex) => {
            const rowRecord = asRecord(row);
            const rowValuesRaw = Array.isArray(rowRecord.personas) ? rowRecord.personas : [];
            const rowValues = personas.map((persona, personaIndex) => {
              const valueRecord = asRecord(rowValuesRaw[personaIndex]);
              const name = coerceString(valueRecord.name, persona.name);
              const matchedPersonaName =
                personas.find((candidate) => candidate.name === name)?.name || persona.name;

              return {
                name: matchedPersonaName,
                value: coerceString(
                  valueRecord.value,
                  fallback.comparisonMatrix[rowIndex]?.personas[personaIndex]?.value || "N/A",
                ),
              };
            });

            return {
              dimension: coerceString(
                rowRecord.dimension,
                fallback.comparisonMatrix[rowIndex]?.dimension || `Dimension ${rowIndex + 1}`,
              ),
              personas: rowValues,
            };
          })
          .filter((row) => row.dimension.length > 0)
      : fallback.comparisonMatrix;

  return PersonaComparisonAnalysisSchema.parse({
    commonThemes,
    differences,
    primaryPersona: {
      name: resolvedPrimaryName,
      reasoning: coerceString(
        primaryPersonaRecord.reasoning,
        fallback.primaryPersona.reasoning,
      ),
    },
    comparisonMatrix,
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function fallbackAssistantReply(messages: PromiseMessage[], bookSetupProfile?: BookSetupProfile | null): string {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const personaLead = bookSetupProfile?.writerPersona
    ? `Write toward the ${bookSetupProfile.writerPersona} persona while keeping the promise commercially sharp. `
    : "";

  return `${personaLead}The idea is promising. The next refinement should sharpen three things: who the primary reader is, what specific pain they feel every day, and what transformation they can expect by the end. Keep the promise practical, concrete, and commercially sharp rather than abstract or inflated. Based on your latest note, preserve the strongest user language and tighten it into a more portable statement: ${latestUserMessage}`;
}

function slugToTitle(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fallbackPromiseExtraction(
  bookSlug: string,
  messages: PromiseMessage[],
  assistantReply: string,
  bookSetupProfile?: BookSetupProfile | null,
): PromiseBrief {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ");

  return {
    workingTitle: bookSetupProfile?.workingTitle || slugToTitle(bookSlug),
    audiencePrimary: "professional leaders responsible for measurable outcomes",
    audienceSecondary: ["department heads", "operations leaders"],
    category: "professional nonfiction",
    readerProblem:
      "leaders are overwhelmed by complexity, competing priorities, and unclear improvement paths",
    readerDesire:
      "clearer thinking, better systems, and more confident leadership under pressure",
    bigIdea: "focused clarity turns complexity into practical progress",
    coreTruth: "performance improves when leaders simplify what matters and act on it consistently",
    transformationBefore: "stretched, reactive, and uncertain about what to fix first",
    transformationAfter: "clear, disciplined, and confident about what to do next",
    differentiation:
      "a practical system for translating complexity into measurable improvement in real organizations",
    promiseStatement:
      "This book gives leaders a practical system to simplify complexity, improve results, and lead with clarity people can follow.",
    stakes:
      "without clarity, teams waste effort, miss outcomes, and lose confidence in the work",
    tone:
      bookSetupProfile?.voiceReferenceNotes?.length
        ? ["clear", "grounded", "practical", ...bookSetupProfile.voiceReferenceNotes.slice(0, 2)]
        : ["clear", "grounded", "practical", "credible"],
    openQuestions: [
      "Should the audience be narrowed further to a more specific operational role?",
      "What single measurable outcome should the promise emphasize most clearly?",
      `Latest refinement signal: ${assistantReply.slice(0, 120)}`,
      `User language to preserve: ${userText.slice(0, 120)}`,
    ],
  };
}

function fallbackScorecard(promise: PromiseBrief): PromiseScorecard {
  const audiencePrimary = promise.audiencePrimary || "";
  const promiseStatement = promise.promiseStatement || "";

  const mentionsLeadership = audiencePrimary.toLowerCase().includes("leader");
  const mentionsPractical = promiseStatement.toLowerCase().includes("practical");

  return {
    scores: {
      clarity: 8.6,
      audienceFit: mentionsLeadership ? 8.3 : 7.6,
      distinctiveness: 7.2,
      commercialPull: mentionsPractical ? 7.8 : 7.1,
      credibility: 8.0,
    },
    strengths: [
      "Clear emotional payoff around calm and clarity",
      "Strong relevance to current leadership pressure",
    ],
    concerns: [
      "The audience could still feel broad without tighter positioning",
      "The concept risks blending into general leadership advice unless the operating context stays specific",
    ],
    nextBestRevisions: [
      "Name the primary reader more explicitly",
      "Keep the promise tied to decision-making under uncertainty",
    ],
  };
}

function fallbackPersonaPack(promise: PromiseBrief): PersonaPack {
  return {
    personas: [
      {
        id: "enterprise_innovation_leader",
        name: "Innovation Leader",
        priority: "primary",
        context: "Owns emerging technology exploration inside a large enterprise",
        painPoints: [
          "too many vendor pitches",
          "unclear criteria for decision-making",
          "pressure to move faster than the organization can absorb change",
        ],
        desiredOutcomes: [
          "clear prioritization",
          "better executive alignment",
          "confidence under uncertainty",
        ],
        buyingMotivations: [
          "practical frameworks",
          "language for explaining decisions to stakeholders",
        ],
        languageCues: ["clarity", "signal", "alignment", "decision-making"],
      },
      {
        id: "digital_transformation_exec",
        name: "Digital Transformation Executive",
        priority: "secondary",
        context: "Needs to translate technical noise into strategic direction",
        painPoints: ["initiative overload", "organizational swirl", "hype fatigue"],
        desiredOutcomes: ["focus", "cross-functional alignment"],
        buyingMotivations: ["credible frameworks", "team confidence"],
        languageCues: ["focus", "calm", "execution", "discipline"],
      },
    ],
  };
}

function normalizeMarketDecision(
  value: unknown,
  fallback: "GO" | "NO_GO" | "CONDITIONAL_GO",
): "GO" | "NO_GO" | "CONDITIONAL_GO" {
  if (value === "GO" || value === "NO_GO" || value === "CONDITIONAL_GO") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (
      normalized === "GO" ||
      normalized === "NO_GO" ||
      normalized === "CONDITIONAL_GO"
    ) {
      return normalized;
    }
  }

  return fallback;
}

function normalizeRiskProfile(
  value: unknown,
  fallback: "Low" | "Medium" | "High",
): "Low" | "Medium" | "High" {
  if (value === "Low" || value === "Medium" || value === "High") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "low") return "Low";
    if (normalized === "medium") return "Medium";
    if (normalized === "high") return "High";
  }

  return fallback;
}

function normalizeComparableSummary(
  value: unknown,
  index: number,
): MarketReport["comparisonTitles"][number] {
  const raw = asRecord(value);
  return {
    title: coerceString(raw.title, `Comparable Title ${index + 1}`),
    author: coerceString(raw.author, "Unknown Author"),
    whyRelevant: coerceString(raw.whyRelevant, "Addresses an adjacent reader problem in the same commercial space."),
    differenceOpportunity: coerceString(
      raw.differenceOpportunity,
      "Clarify the book's sharper promise, audience, and applied transformation.",
    ),
  };
}

function normalizeMarketDirectCompetitor(
  value: unknown,
  index: number,
): MarketReport["competitiveLandscape"]["directCompetitors"][number] {
  const raw = asRecord(value);
  const summary = normalizeComparableSummary(value, index);

  return {
    ...summary,
    credentials: coerceString(raw.credentials, "Recognized voice in the category"),
    positioning: coerceString(
      raw.positioning,
      "Established business nonfiction positioning with a broad commercial appeal.",
    ),
    targetAudience: coerceString(
      raw.targetAudience,
      "Professionals actively looking for better performance, leadership, or decision frameworks.",
    ),
    strengths: coerceStringArray(raw.strengths),
    gaps: coerceStringArray(raw.gaps),
    estimatedSales: coerceString(raw.estimatedSales, "Commercially credible category comp; exact public sales data unavailable."),
    pricePoint: coerceString(raw.pricePoint, "Typical business nonfiction pricing across hardcover, paperback, ebook, and audio."),
  };
}

function normalizeMarketIndirectCompetitor(
  value: unknown,
  index: number,
): MarketReport["competitiveLandscape"]["indirectCompetitors"][number] {
  const raw = asRecord(value);
  return {
    category: coerceString(raw.category, `Indirect Alternative ${index + 1}`),
    examples: coerceStringArray(raw.examples),
    currentAlternative: coerceString(
      raw.currentAlternative,
      "Readers currently solve this through internal playbooks, consultants, podcasts, or training.",
    ),
    spendProfile: coerceString(
      raw.spendProfile,
      "Spending is spread across time, attention, and selective budget on training or tools.",
    ),
  };
}

function normalizeMarketPersonaUrgency(
  value: unknown,
  index: number,
  fallbackName: string,
): MarketReport["audienceDemand"]["personaUrgency"][number] {
  const raw = asRecord(value);
  return {
    personaName: coerceString(raw.personaName, fallbackName || `Persona ${index + 1}`),
    urgency: coerceString(
      raw.urgency,
      "The problem is meaningful enough to justify active learning, but the book must show immediate practical value.",
    ),
    whyNow: coerceString(
      raw.whyNow,
      "Pressure, complexity, and visible consequences make the existing approach feel less sustainable now.",
    ),
  };
}

function normalizePricingTier(
  value: unknown,
  index: number,
): MarketReport["pricingStrategy"]["pricingTiers"][number] {
  const raw = asRecord(value);
  const formats = ["Hardcover", "Paperback", "Ebook", "Audiobook"];
  return {
    format: coerceString(raw.format, formats[index] ?? `Format ${index + 1}`),
    pricePoint: coerceString(raw.pricePoint, "Use a competitive business-book price band."),
    rationale: coerceString(
      raw.rationale,
      "Match category norms while signaling enough authority and practical value.",
    ),
  };
}

function normalizeAncillaryProduct(
  value: unknown,
  index: number,
): MarketReport["monetizationEcosystem"]["ancillaryProducts"][number] {
  const raw = asRecord(value);
  return {
    channel: coerceString(raw.channel, `Offer ${index + 1}`),
    offer: coerceString(raw.offer, "An adjacent offer that deepens the book's framework."),
    pricePoint: coerceString(raw.pricePoint, "Price to reflect the value and delivery depth."),
    revenuePotential: coerceString(
      raw.revenuePotential,
      "Modest at launch; stronger once the book validates demand and authority.",
    ),
  };
}

function createFallbackMarketReport(
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
): MarketReport {
  const category = promise.category || "Business";
  const comparisonTitles: MarketReport["comparisonTitles"] = [
    {
      title: "The Advantage",
      author: "Patrick Lencioni",
      whyRelevant: "Strong organizational clarity and team-health positioning in the business category.",
      differenceOpportunity:
        "Lead more explicitly with the reader's modern pressure pattern and a sharper applied transformation.",
    },
    {
      title: "Thinking, Fast and Slow",
      author: "Daniel Kahneman",
      whyRelevant: "Credible anchor for decision-making and cognition in high-stakes environments.",
      differenceOpportunity:
        "Translate insight into a more immediately actionable operating model for the target reader.",
    },
    {
      title: "Competing in the Age of AI",
      author: "Marco Iansiti and Karim R. Lakhani",
      whyRelevant: "Touches adjacent enterprise strategy and AI-driven change themes.",
      differenceOpportunity:
        "Offer a more human, practical, and role-specific path through the same underlying turbulence.",
    },
  ];

  const directCompetitors = comparisonTitles.map((item) => ({
    ...item,
    credentials: "Established author with recognizable credibility in leadership, management, or strategy.",
    positioning: "Broad business nonfiction with strong credibility and category fit.",
    targetAudience: "Managers, leaders, and professionals looking for better decisions and execution.",
    strengths: [
      "Recognizable category authority",
      "Clear existing shelf placement",
    ],
    gaps: [
      "May not personalize the problem to this exact reader context",
      "Can leave room for a sharper mechanism or more current framing",
    ],
    estimatedSales: "Meaningful commercial precedent; exact public sales data should be treated as an estimate.",
    pricePoint: "Standard business-book pricing across hardcover, paperback, ebook, and audio.",
  }));

  const personaUrgency =
    personaContexts.length > 0
      ? personaContexts.map((persona) => ({
          personaName: persona.name,
          urgency: `${persona.name} feels active pressure because ${persona.dilemma.toLowerCase()}`,
          whyNow:
            "The current way of working is producing visible friction, so the reader is more likely to seek a practical answer now.",
        }))
      : [
          {
            personaName: promise.audiencePrimary || "Primary Reader",
            urgency:
              "The problem is painful enough to justify investment when the book shows a clear, practical payoff.",
            whyNow:
              "Current pressure and visible stakes make the old approach feel less sustainable.",
          },
        ];

  const coreTruth =
    coreTruths?.coreInsight.coreTruth ||
    promise.coreTruth ||
    "The reader needs a better operating model, not more generic pressure or motivation.";
  const transformedOutcome =
    transformationArc?.arc.completeTransformation ||
    promise.transformationAfter ||
    "A more effective, repeatable way to act and decide.";

  return {
    marketCategory: `${category} / practical transformation / ${promise.audiencePrimary || "professional readership"}`,
    comparisonTitles,
    saturationAssessment:
      "Moderately crowded category with room for differentiation if the book names a specific buyer, a sharper mechanism, and a more current problem pattern.",
    attractionDrivers: [
      "Clear reader pain and desire for practical progress",
      "Commercially familiar business-book category with proven buyer behavior",
      "A truth-and-transformation angle that can separate the book from generic advice",
    ],
    commercialRisks: [
      "The promise may still read as broad if the primary buyer and situation are not named tightly.",
      "A strong category requires a clearly defended wedge, not just better writing.",
      "Market estimates are only directional unless stronger external validation is collected.",
    ],
    recommendations: [
      "Keep the primary reader explicit and role-specific.",
      "Translate the truth into a distinct commercial mechanism readers can remember.",
      "Show how the book solves a more current or better-defined version of the problem than adjacent comps.",
    ],
    executiveSummary: {
      headline: `This book can compete in ${category.toLowerCase()} if it stays tightly anchored to a specific reader pain pattern and a differentiated practical mechanism.`,
      overallRecommendation: promise.differentiation ? "GO" : "CONDITIONAL_GO",
      rationale:
        "The category is viable, but the commercial outcome depends on how crisply the book names its buyer, wedge, and why-now relevance.",
      strategicPriority:
        "Sharpen the positioning around the clearest persona, strongest truth, and most defensible transformation.",
    },
    competitiveLandscape: {
      directCompetitors,
      indirectCompetitors: [
        {
          category: "Courses and cohort programs",
          examples: ["Leadership course", "Executive workshop", "Cohort-based accelerator"],
          currentAlternative:
            "Readers may choose structured programs when they want implementation help beyond a book.",
          spendProfile:
            "Higher cash spend than a book, but chosen when stakes are high and urgency is explicit.",
        },
        {
          category: "Coaching, consulting, and internal enablement",
          examples: ["Executive coach", "Consultant", "Internal playbook or training program"],
          currentAlternative:
            "Organizations often solve the problem through outside expertise or internal operating systems instead of reading.",
          spendProfile:
            "Can absorb larger budgets, which means the book should also serve as an entry point to premium offers.",
        },
      ],
      competitiveAdvantage: {
        differentiation:
          promise.differentiation ||
          coreTruth,
        unfairAdvantage:
          "The strongest advantage will come from combining a sharp reframe with applied credibility, voice, and persona specificity.",
        whoChoosesThisBook:
          "Readers who want a practical, credible, and more emotionally legible guide than generic category books or abstract strategy texts.",
        gapFilled:
          "A bridge between insight and action for readers who feel the problem acutely but do not want theory without implementation.",
      },
      marketPositioning: {
        academicToPractical: "Closer to practical than academic, with enough evidence to feel credible.",
        nicheToBroad: "Best positioned as focused enough to feel specific, broad enough to travel across adjacent professionals.",
        theoreticalToActionOriented: "Strongly action-oriented, using frameworks and examples rather than pure abstraction.",
        industrySpecificToUniversal:
          "Most effective when it starts with a concrete domain or role signal, then translates to adjacent readers.",
        whiteSpace:
          "The white space is a commercially sharp book that connects a fresh truth to a recognizable reader problem and immediate implementation path.",
      },
    },
    marketSizing: {
      totalAddressableMarket:
        "Broad professional development and business-reading audience globally, narrowed by the personas most likely to feel this problem intensely.",
      serviceableAddressableMarket:
        "A subset of that audience who actively buys business books, courses, and practical learning content.",
      serviceableObtainableMarket:
        "Year-one reach is most realistic through a mix of Amazon, direct audience, speaking, and selective partnerships rather than mass breakout assumptions.",
      yearOneToThreeOutlook:
        "Year 1 is about validating positioning and channel fit; Years 2-3 depend on compounding authority, speaking, bulk sales, and ecosystem offers.",
      trends:
        "Demand is strongest when the book speaks to current complexity, pressure, and the need for practical, confidence-building frameworks.",
      tailwinds: [
        "Ongoing appetite for practical business and leadership books",
        "Growing demand for frameworks that help people act amid uncertainty and overload",
        "A stronger monetization ecosystem around books than book-only revenue alone",
      ],
      headwinds: [
        "Crowded category with many adjacent claims",
        "Reader attention competition from faster and cheaper alternatives",
        "Breakout success depends heavily on platform and distribution, not just manuscript quality",
      ],
    },
    audienceDemand: {
      personaUrgency,
      searchBehavior: [
        "Searches that frame the pain as a live work problem, not just a learning topic",
        "Questions about how to lead, decide, prioritize, or operate better under pressure",
        "Comparisons between books, courses, frameworks, and expert guidance",
      ],
      contentConsumptionPatterns: [
        "Business books for synthesis and authority",
        "Podcasts, newsletters, and LinkedIn-style thought leadership for discovery",
        "Courses, communities, and workshops when implementation urgency increases",
      ],
      willingnessToPay:
        "Low-friction willingness to buy a book is plausible when the promise is specific; higher-ticket conversion depends on visible business value.",
      validationSignals:
        "The market signal is strongest when real readers confirm the problem, urgency, and willingness to try this exact framing.",
      openQuestions: [
        "Which persona is most likely to buy first without extensive education?",
        "Which comp titles are most often mentioned by actual target readers?",
        "What phrasing makes the book feel immediately relevant instead of broadly interesting?",
      ],
    },
    pricingStrategy: {
      comparableBookPricing:
        "Use standard business-book pricing bands and position the format mix to match category expectations.",
      costAnalysis:
        "The economic model should assume modest per-book margins and treat the book as both revenue stream and demand-generation asset.",
      pricingTiers: [
        {
          format: "Hardcover",
          pricePoint: "Premium business-book tier",
          rationale: "Best for leadership, gifting, and signal value at launch.",
        },
        {
          format: "Paperback",
          pricePoint: "Standard mass-market business-book tier",
          rationale: "Supports broader accessibility and longer-tail retail conversion.",
        },
        {
          format: "Ebook",
          pricePoint: "Lower-friction impulse tier",
          rationale: "Useful for discovery, portability, and promotional moments.",
        },
        {
          format: "Audiobook",
          pricePoint: "Premium convenience tier",
          rationale: "Important for professionals who consume learning content while commuting or multitasking.",
        },
      ],
      pricePositioning:
        "Price to signal professional value without making the book feel niche or inaccessible.",
      launchPricing:
        "A launch strategy can use short-term tactical pricing, but the core signal should still communicate authority and utility.",
    },
    monetizationEcosystem: {
      directBookRevenue:
        "Direct book sales are important, but the real upside often comes from how the book compounds trust and opens adjacent offers.",
      ancillaryProducts: [
        {
          channel: "Workbook",
          offer: "Templates, exercises, and guided implementation tools tied to the framework.",
          pricePoint: "Accessible add-on tier",
          revenuePotential: "Moderate; strongest when paired with book-driven implementation demand.",
        },
        {
          channel: "Course",
          offer: "Self-paced or cohort-based deepening of the book's mechanism and implementation path.",
          pricePoint: "Mid- to premium-tier offer",
          revenuePotential: "Higher than the book when authority and demand are validated.",
        },
        {
          channel: "Corporate training or licensing",
          offer: "Bulk books, workshops, and facilitated adoption inside teams or organizations.",
          pricePoint: "Premium organizational spend",
          revenuePotential: "Potentially high when the framework maps cleanly to team or enterprise outcomes.",
        },
      ],
      speakingAndAuthority:
        "A strong book can expand speaking invitations, keynote fees, and workshop demand if the topic ties to visible business outcomes.",
      consultingAndCoaching:
        "The book can function as trust-building top-of-funnel for coaching, advisory, or consulting engagements.",
      mediaAndLicensing:
        "Audio, foreign rights, and corporate licensing become more realistic after traction and proof of resonance.",
      contentAndCommunity:
        "Newsletter, podcast, and community layers increase reach and create recurring audience touchpoints beyond launch week.",
      totalEcosystemRevenueProjection:
        "The healthiest model treats the book as the anchor of a broader authority and offer ecosystem, not as a standalone revenue bet.",
    },
    distributionAndLaunch: {
      publishingOptions:
        "Choose between traditional, hybrid, or self-publishing based on the desired tradeoff between control, speed, distribution, and platform support.",
      distributionChannels: [
        "Amazon and core online retail",
        "Direct sales through website, email list, and speaking events",
        "Bulk and organizational channels for teams, associations, and corporate programs",
      ],
      launchStrategy:
        "Use a pre-launch audience build, a concentrated launch window, and a sustained post-launch rhythm tied to content, partnerships, and speaking.",
      marketingChannels: [
        "Owned channels such as email, website, and social content",
        "Earned channels such as podcasts, press, and partner appearances",
        "Strategic partnerships with aligned creators, organizations, and communities",
      ],
      yearOneDistributionMix:
        "Expect the most controllable early sales to come from direct audience and partner-driven channels, with retail compounding over time.",
    },
    riskAssessment: {
      overallRiskProfile: promise.differentiation ? "Medium" : "High",
      marketRisks: [
        "Category crowding can flatten the message if the wedge is not explicit.",
        "Trend-driven positioning can age poorly if it is too dependent on a passing narrative.",
      ],
      authorPlatformRisks: [
        "Limited existing audience makes launch distribution harder.",
        "Promotional consistency matters as much as book quality in early traction.",
      ],
      contentMessageRisks: [
        "The truth may feel too abstract if not anchored in concrete reader pain and proof.",
        "Competitors can sound similar unless the mechanism and audience are unmistakable.",
      ],
      economicTimingRisks: [
        "Budget pressure can reduce ancillary conversions even if book demand remains.",
        "Attention competition increases when buyers delay optional learning purchases.",
      ],
      executionRisks: [
        "Finishing the manuscript and executing launch well are separate risks.",
        "The ecosystem upside disappears if the book is never translated into offers and channels.",
      ],
      mitigationPlan: [
        "Validate messaging with real readers before locking the outline.",
        "Use the outline and launch plan to reinforce the same commercial wedge repeatedly.",
        "Treat the book as the start of a system, not the entire business model.",
      ],
      dealBreakers: [
        "If no persona feels urgent ownership of the problem, the book will struggle.",
        "If the promise cannot be differentiated from obvious comps, the go/no-go should be revisited.",
      ],
    },
    successMetrics: {
      yearOneGoals: [
        "A clear book sales target tied to the launch plan",
        "Audience growth across email and owned channels",
        "Early proof that the book creates speaking, consulting, or course demand",
      ],
      keyPerformanceIndicators: [
        "Units sold by channel",
        "Revenue by offer type",
        "Audience growth and engagement",
        "Review quality, endorsements, and speaking invitations",
      ],
      successDefinition:
        `A successful book proves ${coreTruth.toLowerCase()} in the market and creates repeatable demand for ${transformedOutcome.toLowerCase()}`,
      milestones: [
        "Pre-launch positioning validation and audience build",
        "Launch-window sales and visibility targets",
        "Post-launch channel, offer, and demand-compounding targets",
      ],
    },
    financialProjections: {
      yearOneRevenue:
        "Model a conservative, realistic, and optimistic case separately instead of relying on one blended assumption.",
      yearOneCosts:
        "Include writing, editing, design, production, launch, advertising, tooling, and distribution assumptions.",
      profitabilityAnalysis:
        "Profitability depends on channel mix and ancillary conversion, not just unit sales.",
      yearsTwoToThreeProjection:
        "Longer-tail growth is most likely when the book feeds speaking, training, consulting, and repeatable content channels.",
      sensitivityAnalysis:
        "Pressure-test the model against weaker sales, higher marketing spend, and slower ecosystem conversion.",
    },
    goNoGoRecommendation: {
      marketValidation:
        "The market is viable if target readers clearly recognize the problem and the promise sounds meaningfully different from the shelf.",
      competitivePosition:
        "The book can compete if it keeps the reader, wedge, and mechanism more explicit than adjacent comps.",
      businessModelViability:
        "The economics work best when the book is treated as a lead asset for a wider ecosystem.",
      personalFit:
        "Proceed only if the author can support both manuscript quality and sustained promotion.",
      overallRecommendation: promise.differentiation ? "GO" : "CONDITIONAL_GO",
      conditions: [
        "Tighten the primary persona and why-now framing.",
        "Carry the truth and transformation explicitly into the commercial positioning.",
        "Collect stronger real-world validation before overcommitting to optimistic assumptions.",
      ],
      nextSteps: [
        "Pressure-test the title, promise, and outline against the strongest comps.",
        "Interview or validate with real readers in the primary persona cluster.",
        "Draft a launch and channel plan before assuming large sales projections.",
      ],
    },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: "fallback",
      grounding: {
        previousPhases: ["Promise Statement"],
        audienceSignals: personaUrgency.map((item) => `${item.personaName}: ${item.urgency}`),
        kbSources: [],
      },
    },
  };
}

function fallbackMarketReport(promise: PromiseBrief): MarketReport {
  return createFallbackMarketReport(
    promise,
    buildTruthPersonaContexts(promise, undefined, undefined),
  );
}

function fallbackRecommendations(
  promise: PromiseBrief,
  marketReport: MarketReport,
  personaContexts: TruthPersonaContext[] = buildTruthPersonaContexts(promise, undefined, undefined),
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
): PositioningRecommendations {
  const marketDecision = marketReport.goNoGoRecommendation?.overallRecommendation ?? "CONDITIONAL_GO";
  const primaryPersona =
    personaContexts[0]?.name ?? promise.audiencePrimary ?? "Primary Reader";
  const coreTruth =
    coreTruths?.coreInsight.coreTruth ||
    promise.coreTruth ||
    "The reader needs a more useful operating model, not more generic advice.";
  const transformationOutcome =
    transformationArc?.arc.completeTransformation ||
    promise.transformationAfter ||
    "A clearer and more repeatable way to create results.";
  const summary = `The strongest path is to position ${promise.workingTitle} for ${primaryPersona} around the truth that ${coreTruth.toLowerCase()}. Commercially, the book should lead with a narrow buyer, a defendable practical mechanism, and a launch plan that treats the book as the anchor for broader authority and ecosystem growth.`;
  const recommendations = [
    "Write to the most urgent primary persona first and let secondary personas follow through adjacent relevance.",
    "Carry the TRUTH and transformation language directly into positioning, launch messaging, and the outline.",
    "Use the market wedge to guide not only messaging but also book structure, ancillary offers, and channel priorities.",
    ...(Array.isArray(marketReport.recommendations) ? marketReport.recommendations : []),
  ];

  return {
    summary,
    recommendations,
    bookStrategy: {
      coreMessagePositioning: `Position the book around one governing reframe: ${coreTruth}. That message should be phrased in the language the primary persona already uses to describe the problem, not in abstract author language.`,
      audienceTargeting: `Make ${primaryPersona} the primary audience because the book gets stronger when written for a specific live pain. Secondary personas should still see themselves in the framing through adjacent examples, channel messaging, and supporting stories.`,
      contentDepthAndBreadth: `Go deep enough on the core framework that the book feels complete for the primary persona, but reserve highly customized implementation layers for workbook, course, or consulting extensions. Every chapter should reinforce the same wedge instead of widening into generic adjacent topics.`,
      lengthAndStructure: `Aim for a practical business-book length aligned with comparable titles and reader attention. Structure the book so the promise, TRUTH, transformation, and application ladder cleanly from diagnosis to action to future-state vision.`,
      voiceAndToneRecommendations: `Lead with a voice blend that keeps practical credibility primary, emotional clarity present, and inspiration used selectively. The tone should feel professional and direct rather than academic or hype-driven.`,
      differentiationStrategy: `Differentiate through the specific buyer, the truth reframe, the practical mechanism, and the author's lived authority. The book should sound like the only one that solves this exact problem in this exact way.`,
    },
    positioningAndMarketing: {
      marketPositioningStatement: `For ${primaryPersona}, ${promise.workingTitle} is a practical business book that helps them ${(promise.readerDesire ?? "").toLowerCase() || "create better outcomes"} by teaching ${(coreTruth ?? "").toLowerCase()}, unlike broader competitors that diagnose the category without giving this reader a tailored operating model.`,
      keyDifferentiators: [
        "Sharper primary buyer definition than generic category books",
        "A core truth tied directly to day-to-day pressure and decision friction",
        "A transformation arc that makes the framework feel lived, not merely conceptual",
        "Commercial positioning that can travel across book, speaking, training, and ecosystem offers",
      ],
      targetCustomerProfile: `${primaryPersona} is the ideal buyer: someone with meaningful stakes, active learning behavior, and willingness to pay for practical clarity that can improve visible outcomes. They are most likely to discover the book through trusted professional channels, peers, or adjacent authority signals rather than random browsing alone.`,
      positioningByChannel: [
        "Retail/Amazon: lead with problem-solution clarity, specific buyer relevance, and concrete transformation.",
        "Speaking/events: lead with authority, proof, and the distinct practical framework.",
        "Owned channels: lead with the longer transformation story and why this worldview shift matters now.",
        "Corporate/bulk: lead with team impact, repeatability, and business outcomes.",
        "Social/LinkedIn: lead with short diagnostic insights that dramatize the false belief and reframe.",
      ],
      messagingFramework: [
        `Core promise: ${promise.promiseStatement}`,
        `Unique approach: ${coreTruth}`,
        `Who it's for: ${primaryPersona} and adjacent professionals who feel the same operating tension`,
      ],
      competitivePositioningQuadrant: marketReport.competitiveLandscape?.marketPositioning?.whiteSpace ?? "",
    },
    launchAndGoToMarket: {
      publishingPathRecommendation: `The recommended path should reflect your goals for control, speed, authority, and distribution. If platform leverage is strong, hybrid or self-directed models can compound faster; if borrowed distribution and trade credibility matter more, traditional may be worth the tradeoffs.`,
      launchTimeline: `Use a pre-launch runway, a concentrated launch window, and a longer post-launch compounding plan. The timing should align with when the primary persona is most reachable and most likely to act on the problem.`,
      preLaunchActivities: [
        "Validate title, promise, and chapter framing with real target readers.",
        "Build owned audience assets and repeatable content around the core truth.",
        "Secure endorsements, podcast targets, partnerships, and speaking opportunities before launch week.",
        "Prepare the website, lead magnets, launch assets, and messaging variants by persona and channel.",
      ],
      launchActivities: [
        "Coordinate an email launch sequence tied to the strongest buyer pain and transformation promise.",
        "Run a focused visibility push across social, podcasts, partners, and speaking moments.",
        "Collect reviews, testimonials, and early proof that the framework resonates in practice.",
      ],
      postLaunchActivities: [
        "Sustain content around the framework instead of disappearing after launch week.",
        "Use post-launch data to improve channel messaging, ancillary offers, and conversion paths.",
        "Translate traction into workshops, speaking, community, or training extensions.",
      ],
      distributionChannelPriorities: [
        "Owned audience and direct channels for control and higher-value conversion",
        "Retail discovery for category legitimacy and ongoing long-tail sales",
        "Speaking, partner, and organizational channels for leverage and bulk conversion",
      ],
      marketingBudgetAllocation: `Allocate budget toward the channels most likely to reach ${primaryPersona} efficiently, with enough reserve to support content, launch assets, and follow-through after the initial window.`,
    },
    personaStrategies: personaContexts.slice(0, 3).map((persona) => ({
      personaName: persona.name,
      primaryPositioning: `${promise.workingTitle} should be framed for ${persona.name} as a practical answer to ${persona.dilemma.toLowerCase()}`,
      keyMessage: `${coreTruth} is the message most likely to land when translated into ${persona.name}'s role context.`,
      whereToReachThem: [
        "Trusted professional communities",
        "Role-specific content channels",
        "Peer recommendations, podcasts, and speaking environments",
      ],
      priceSensitivity: "Book-level pricing is accessible; premium conversion depends on clear business value.",
      contentFormatPreference: "Practical frameworks, examples, and implementation guidance over abstract theory.",
      trustedInfluencers: ["Recognized domain experts", "Respected practitioners", "Peers with visible operating credibility"],
      launchStrategy: `Reach ${persona.name} with a message that names their specific friction, then show how the book reduces it through a practical, credible mechanism.`,
    })),
    crossPersonaMessaging: {
      sharedMessaging: [
        "The old explanation of the problem is no longer enough.",
        "A better operating model creates clearer, more repeatable progress.",
        "This book turns a felt problem into a practical path forward.",
      ],
      personaSpecificMessaging: [
        "Tailor the examples, stakes, and implementation scenes to each primary persona context.",
        "Adjust the channel emphasis based on where each persona already looks for insight and proof.",
      ],
      avoidAlienating: "Anchor the book in one primary buyer while using adjacent examples that let secondary personas recognize themselves without feeling like the book is trying to serve everyone equally.",
    },
    monetizationRecommendations: {
      bookPricingRecommendation: `Use pricing that matches the professional/business category while signaling enough authority and utility to support the book's positioning.`,
      ancillaryProductRecommendations: [
        "Launch or plan a workbook that extends the framework into templates, checklists, and guided exercises.",
        "Prepare a course or workshop version of the mechanism for buyers who want implementation help.",
        "Use the book to open higher-value speaking, training, or consulting conversations when fit exists.",
      ],
      ecosystemBuildOutTimeline: [
        "Launch: book plus basic lead capture and content sequence",
        "0-3 months: workbook, workshop, or speaking package",
        "3-9 months: course, community, or team implementation offer",
        "9+ months: broader training, licensing, or advisory extensions",
      ],
      revenueModelRecommendation: `Treat the book as the anchor asset rather than the only revenue source. The healthiest model combines book reach with selected higher-margin follow-on offers.`,
      pricingStrategyByChannel: [
        "Direct: price to reflect proximity, trust, and added value.",
        "Retail: stay inside category norms while signaling professional value.",
        "Corporate/bulk: use structured discounts tied to team or program outcomes.",
        "Courses/ecosystem: price according to implementation depth and transformation value.",
      ],
    },
    teamAndResources: {
      writingSupport: "Use the right editorial support for argument clarity, narrative flow, and market sharpness before draft volume becomes the bottleneck.",
      designAndProduction: "Budget for cover, layout, formatting, and optional audio in a way that matches the intended commercial signal of the book.",
      marketingAndLaunchSupport: "Add launch support if the author cannot both write and consistently run promotion, outreach, and follow-up.",
      platformAndTools: "Use a lean stack for email, website, audience capture, analytics, and any course or webinar layer needed for the ecosystem.",
      teamCompositionRecommendation: "Minimum viable team is author plus editor plus designer, with launch and marketing support added as execution complexity rises.",
      timelineAndMilestones: [
        "Define scope, positioning, and team before full drafting.",
        "Draft against the approved transformation and market wedge, not against a vague topic.",
        "Use editorial, production, and launch prep milestones that preserve time for validation and iteration.",
      ],
    },
    riskMitigationRecommendations: [
      {
        risk: "Market saturation or weak differentiation",
        mitigationStrategy: "Pressure-test the title, promise, and wedge against top competitors before the outline is finalized.",
        whatToMonitor: "Reader confusion, comp overlap, and channel response to the positioning.",
        pivotPoint: "If target readers cannot immediately explain why this book is different, tighten the positioning before moving deeper into production.",
      },
      {
        risk: "Platform or reach risk",
        mitigationStrategy: "Build owned audience and partner channels early so launch does not depend on last-minute discovery.",
        whatToMonitor: "Audience growth, engagement, partner pipeline, and early pre-launch interest.",
        pivotPoint: "If reach remains weak, shift more effort into partnerships, speaking, and direct audience building before launch.",
      },
      {
        risk: "Execution risk",
        mitigationStrategy: "Use clear milestones, editorial checkpoints, and launch owners so the book does not stall between concept and delivery.",
        whatToMonitor: "Draft progress, production readiness, and launch-asset completion.",
        pivotPoint: "If key milestones slip repeatedly, reduce scope or extend timeline before quality degrades.",
      },
    ],
    successMetricsAndKpis: {
      yearOneSuccessTargets: [
        "A realistic sales target by channel",
        "Visible audience growth in owned channels",
        "Proof that the book creates downstream opportunity for speaking, training, or ecosystem offers",
      ],
      monthlyKpis: [
        "Units sold and revenue by channel",
        "Audience growth and engagement",
        "Lead capture and offer conversion",
        "Reviews, endorsements, and authority signals",
      ],
      dashboardMetrics: [
        "Sales",
        "Audience growth",
        "Engagement",
        "Offer conversion",
        "Speaking/authority opportunities",
      ],
      successMilestones: [
        "3 months: confirm traction and message resonance",
        "6 months: convert traction into a stronger ecosystem path",
        "12 months: validate whether the book is compounding authority and revenue",
      ],
      pivotingCriteria: [
        "If positioning fails to convert interest into sales, tighten the buyer and message.",
        "If a competitor crowds the space, emphasize the book's distinct truth and mechanism more aggressively.",
        "If channel performance diverges, reallocate effort toward the highest-leverage distribution paths.",
      ],
    },
    financialRecommendations: {
      investmentRequired: "Set an upfront investment range that covers editorial, design, launch, tooling, and a contingency buffer.",
      revenueProjections: `Use conservative, realistic, and optimistic scenarios tied to the ${marketDecision.toLowerCase()} market recommendation and the actual distribution plan.`,
      profitabilityTimeline: "Plan for break-even based on channel mix and ecosystem conversion, not book-unit optimism alone.",
      pricingSummary: [
        "Hardcover: premium signal within category norms",
        "Paperback: standard accessible tier",
        "Ebook: lower-friction entry tier",
        "Higher-value offers: price to the implementation outcome, not the book benchmark",
      ],
      budgetAllocationRecommendation: "Prioritize spending on product quality, launch readiness, and the channels most likely to reach the primary persona efficiently.",
    },
    finalRecommendation: {
      overallRecommendation: marketDecision,
      rationale: `The recommendation is ${marketDecision.replace(/_/g, " ")} because the project looks strongest when it keeps a narrow buyer, a clear truth reframe, a differentiated market wedge, and a realistic ecosystem model.`,
      strategicDirection: `Proceed by treating the book as the lead asset for ${transformationOutcome.toLowerCase()} rather than as a standalone manuscript disconnected from launch and monetization strategy.`,
      criticalSuccessFactors: [
        "Sharper primary-buyer positioning",
        "Consistent translation of truth into market messaging",
        "Launch execution that matches the intended commercial path",
      ],
      immediateNextSteps: [
        "Lock the primary persona and one-sentence market positioning statement.",
        "Pressure-test the outline direction against the strongest competitors and the approved truth.",
        "Draft a launch and ecosystem plan before assuming book-only success.",
        "Validate messaging with real readers or partners in the primary audience.",
        "Confirm timeline, ownership, and budget before moving fully into Outline.",
      ],
      goNoGoGates: [
        "Market analysis complete and validated",
        "Promise statement locked",
        "Personas research complete",
        "Transformation journey mapped",
        "Financial model acceptable",
        "Team/resources secured",
        "Timeline confirmed",
      ],
      contingencyPlanning: [
        "If market response is weak, tighten the buyer and wedge before expanding scope.",
        "If the book struggles to stand apart, amplify the mechanism, proof, and persona-specific pain.",
        "If launch reach is too low, shift into a partnership- and speaking-led distribution plan.",
      ],
    },
  };
}

async function maybeGenerateAssistantReply(messages: PromiseMessage[]) {
  return maybeGenerateAssistantReplyWithSetup(messages, null);
}

async function maybeGenerateAssistantReplyWithSetup(
  messages: PromiseMessage[],
  bookSetupProfile?: BookSetupProfile | null,
  referenceMaterials?: Array<{
    id: string;
    title: string;
    mimeType: string;
    note: string;
  }>,
) {
  const model = await getChatModel();

  if (!model) {
    console.log("[promise] No model available, using fallback");
    return fallbackAssistantReply(messages, bookSetupProfile);
  }


  const response = await model.invoke([
    new SystemMessage(
      `${PROMISE_CONVERSATION_SYSTEM_PROMPT}\n\nCommitted Book Setup Context:\n${formatSetupContextForPrompt(
        bookSetupProfile,
      )}\n\nUploaded Reference Materials:\n${formatReferenceMaterialsForPrompt(referenceMaterials)}`,
    ),
    ...messages.map((message) =>
      message.role === "user"
        ? new HumanMessage(message.content)
        : new AIMessage(message.content),
    ),
  ]);

  return typeof response.content === "string"
    ? response.content
    : response.content.map((part) => ("text" in part ? part.text : "")).join("\n");
}

async function maybeExtractPromise(
  bookSlug: string,
  messages: PromiseMessage[],
  assistantReply: string,
  bookSetupProfile?: BookSetupProfile | null,
  referenceMaterials?: Array<{
    id: string;
    title: string;
    mimeType: string;
    note: string;
  }>,
) {
  const model = await getStructuredPromiseModel({
    maxOutputTokens: 4000,
    timeoutMs: 90000,
  });

  if (!model) {
    return fallbackPromiseExtraction(bookSlug, messages, assistantReply, bookSetupProfile);
  }

  const structuredModel = model.withStructuredOutput(PromiseBriefSchema);

  // Only use user messages for extraction, not the full conversation history
  const userMessages = messages.filter((message) => message.role === "user");

  return structuredModel.invoke([
    new SystemMessage(
      `${PROMISE_EXTRACTION_SYSTEM_PROMPT}\n\nCommitted Book Setup Context:\n${formatSetupContextForPrompt(
        bookSetupProfile,
      )}\n\nUploaded Reference Materials:\n${formatReferenceMaterialsForPrompt(referenceMaterials)}`,
    ),
    ...userMessages.map((message) => new HumanMessage(message.content)),
    new HumanMessage(`Latest assistant guidance:\n\n${assistantReply}`),
  ]);
}

async function maybeScorePromise(promise: PromiseBrief) {
  const model = await getStructuredPromiseModel({
    maxOutputTokens: 3000,
    timeoutMs: 60000,
  });

  if (!model) {
    return fallbackScorecard(promise);
  }

  const structuredModel = model.withStructuredOutput(PromiseScorecardSchema);

  return structuredModel.invoke([
    new SystemMessage(PROMISE_SCORECARD_SYSTEM_PROMPT),
    new HumanMessage(JSON.stringify(promise)),
  ]);
}

async function maybeGeneratePersonas(promise: PromiseBrief) {
  const model = await getStructuredAudienceModel({
    maxOutputTokens: 5000,
    timeoutMs: 90000,
  });

  if (!model) {
    return fallbackPersonaPack(promise);
  }

  const structuredModel = model.withStructuredOutput(PersonaPackSchema);

  return structuredModel.invoke([
    new SystemMessage(PERSONA_SYSTEM_PROMPT),
    new HumanMessage(JSON.stringify(promise)),
  ]);
}

export async function maybeGenerateMarketReport(
  promise: PromiseBrief,
  audienceResearch?: AudienceResearchArtifact,
  deepProfiles?: PersonaDeepProfile[],
  simplePersonas?: PersonaPack["personas"],
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
  bookSetupProfile?: BookSetupProfile | null,
  bookId?: string,
): Promise<MarketReport> {
  try {
    console.log("[maybeGenerateMarketReport] Starting...");
    const personaContexts = buildTruthPersonaContexts(
      promise,
      deepProfiles,
      simplePersonas,
    );
    const groundingContext = buildMarketGroundingContext(
      promise,
      audienceResearch,
      deepProfiles,
      simplePersonas,
      coreTruths,
      transformationArc,
      personaContexts,
    );

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.log("[maybeGenerateMarketReport] No Gemini API key, using fallback");
      return {
        ...createFallbackMarketReport(
          promise,
          personaContexts,
          coreTruths,
          transformationArc,
        ),
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          model: "fallback",
          tokenUsage: undefined,
          grounding: {
            previousPhases: groundingContext.previousPhases,
            audienceSignals: groundingContext.audienceSignals,
            kbSources: [],
          },
        },
      };
    }

    let knowledgeContext = "";
    let kbSources: string[] = [];
    if (bookId) {
      const knowledgeGrounding = await getKnowledgeGroundingForPrompt(
        bookId,
        [
          promise.category,
          promise.audiencePrimary,
          promise.coreTruth,
          promise.differentiation,
          "market competitors pricing demand distribution launch",
        ]
          .filter(Boolean)
          .join(" "),
        8,
      );
      knowledgeContext = knowledgeGrounding.text;
      kbSources = knowledgeGrounding.sourceTitles;
    }

    const client = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    const model = client.getGenerativeModel({
      model: getMarketAnalysisGoogleModelId(),
      generationConfig: {
        temperature: 0.25,
        topP: 0.9,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      } as {
        temperature: number;
        topP: number;
        maxOutputTokens: number;
        responseMimeType: string;
      },
    });

    const prompt = `${MARKET_REPORT_SYSTEM_PROMPT}

Book Voice Context:
${formatSetupContextForPrompt(bookSetupProfile)}${knowledgeContext}

INPUT JSON:
${JSON.stringify(groundingContext.promptPayload, null, 2)}`;

    const response = await withTimeout(
      model.generateContent(prompt),
      120000,
      "Market generation timed out after 120 seconds",
    );
    const rawText = response.response.text();
    const usageMetadata = asRecord(asRecord(response).response).usageMetadata;
    console.log("[maybeGenerateMarketReport] Usage metadata:", usageMetadata);
    console.log(`[maybeGenerateMarketReport] Raw text length: ${rawText.length}`);

    const jsonText = extractJsonText(rawText);
    console.log(`[maybeGenerateMarketReport] Extracted JSON length: ${jsonText.length}`);

    const parsed = JSON.parse(jsonText) as unknown;
    const normalized = normalizeMarketReport(
      parsed,
      promise,
      personaContexts,
      coreTruths,
      transformationArc,
    );

    return MarketReportSchema.parse({
      ...normalized,
      metadata: {
        ...(normalized.metadata ?? {}),
        createdAt:
          typeof normalized.metadata?.createdAt === "string"
            ? normalized.metadata.createdAt
            : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        model: resolveModelSpec("market-analysis:research"),
        tokenUsage: normalizeTokenUsageMetadata(usageMetadata),
        grounding: {
          previousPhases: groundingContext.previousPhases,
          audienceSignals: groundingContext.audienceSignals,
          kbSources,
        },
      },
    });
  } catch (error) {
    console.error("[maybeGenerateMarketReport] Error:", error);
    if (error instanceof JsonExtractionError) {
      console.error("[maybeGenerateMarketReport] JSON extraction details:", error.details);
    }
    throw error;
  }
}

export async function maybeGenerateRecommendations(
  promise: PromiseBrief,
  marketReport: MarketReport,
  personas: PersonaPack,
  audienceResearch?: AudienceResearchArtifact,
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
  bookSetupProfile?: BookSetupProfile | null,
  bookId?: string,
): Promise<PositioningRecommendations> {
  try {
    console.log("[maybeGenerateRecommendations] Starting...");
    const personaContexts = buildTruthPersonaContexts(
      promise,
      audienceResearch?.phase2?.personas,
      personas.personas,
    );
    const groundingContext = buildRecommendationsGroundingContext(
      promise,
      audienceResearch,
      audienceResearch?.phase2?.personas,
      personas.personas,
      coreTruths,
      transformationArc,
      marketReport,
      personaContexts,
    );

    // Use the shared market-analysis routing role for market-grounded recommendations.
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.log("[maybeGenerateRecommendations] No Gemini API key, using fallback");
      return {
        ...fallbackRecommendations(
          promise,
          marketReport,
          personaContexts,
          coreTruths,
          transformationArc,
        ),
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          model: "fallback",
          tokenUsage: undefined,
          grounding: {
            previousPhases: groundingContext.previousPhases,
            audienceSignals: groundingContext.audienceSignals,
            kbSources: [],
          },
        },
      };
    }

    let knowledgeContext = "";
    let kbSources: string[] = [];
    if (bookId) {
      const knowledgeGrounding = await getKnowledgeGroundingForPrompt(
        bookId,
        [
          promise.category,
          promise.audiencePrimary,
          promise.coreTruth,
          promise.differentiation,
          "recommendations positioning launch monetization outline go to market",
        ]
          .filter(Boolean)
          .join(" "),
        8,
      );
      knowledgeContext = knowledgeGrounding.text;
      kbSources = knowledgeGrounding.sourceTitles;
    }

    const client = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    const model = client.getGenerativeModel({
      model: getMarketAnalysisGoogleModelId(),
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      } as {
        temperature: number;
        topP: number;
        maxOutputTokens: number;
        responseMimeType: string;
      },
    });

    const systemPrompt = `${POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT}

Book Voice Context:
${formatSetupContextForPrompt(bookSetupProfile)}${knowledgeContext}`;

    const prompt = `${systemPrompt}

INPUT JSON:
${JSON.stringify(groundingContext.promptPayload, null, 2)}`;

    const response = await withTimeout(
      model.generateContent(prompt),
      120000,
      "Recommendations generation timed out after 120 seconds",
    );

    const rawText = response.response.text();
    const usageMetadata = asRecord(asRecord(response).response).usageMetadata;
    console.log("[maybeGenerateRecommendations] Usage metadata:", usageMetadata);
    console.log(`[maybeGenerateRecommendations] Raw text length: ${rawText.length}`);

    const jsonText = extractJsonText(rawText);
    console.log(`[maybeGenerateRecommendations] Extracted JSON length: ${jsonText.length}`);

    const parsed = JSON.parse(jsonText) as unknown;
    const normalized = normalizeRecommendationsArtifact(
      parsed,
      promise,
      marketReport,
      personaContexts,
      coreTruths,
      transformationArc,
    );

    return PositioningRecommendationsSchema.parse({
      ...normalized,
      metadata: {
        ...(normalized.metadata ?? {}),
        createdAt:
          typeof normalized.metadata?.createdAt === "string"
            ? normalized.metadata.createdAt
            : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        model: resolveModelSpec("market-analysis:research"),
        tokenUsage: normalizeTokenUsageMetadata(usageMetadata),
        grounding: {
          previousPhases: groundingContext.previousPhases,
          audienceSignals: groundingContext.audienceSignals,
          kbSources,
        },
      },
    });
  } catch (error) {
    console.error("[maybeGenerateRecommendations] Error:", error);
    if (error instanceof JsonExtractionError) {
      console.error("[maybeGenerateRecommendations] JSON extraction details:", error.details);
    }
    throw error;
  }
}

export async function maybeGenerateTitleSubtitleFinalization(
  promise: PromiseBrief,
  marketReport: MarketReport,
  recommendations: PositioningRecommendations,
  personas: PersonaPack,
  audienceResearch?: AudienceResearchArtifact,
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
  bookSetupProfile?: BookSetupProfile | null,
  bookId?: string,
): Promise<TitleSubtitleFinalization> {
  let fallback: TitleSubtitleFinalization | undefined;
  let groundingContext:
    | ReturnType<typeof buildTitleSubtitleGroundingContext>
    | undefined;
  let kbSources: string[] = [];

  try {
    const personaContexts = buildTruthPersonaContexts(
      promise,
      audienceResearch?.phase2?.personas,
      personas.personas,
    );
    groundingContext = buildTitleSubtitleGroundingContext(
      promise,
      audienceResearch,
      audienceResearch?.phase2?.personas,
      personas.personas,
      coreTruths,
      transformationArc,
      marketReport,
      recommendations,
      personaContexts,
      bookSetupProfile,
    );
    fallback = createFallbackTitleSubtitleFinalization(
      promise,
      marketReport,
      recommendations,
      personaContexts,
      audienceResearch,
      coreTruths,
      transformationArc,
      bookSetupProfile,
    );

    const model = await getChatModel({
      maxOutputTokens: 2800,
      timeoutMs: 120000,
    });

    if (!model) {
      return {
        ...fallback,
        metadata: {
          ...(fallback.metadata ?? {}),
          updatedAt: new Date().toISOString(),
          model: "fallback",
          grounding: {
            previousPhases: groundingContext.previousPhases,
            audienceSignals: groundingContext.audienceSignals,
            kbSources: [],
          },
        },
      };
    }

    let knowledgeContext = "";
    if (bookId) {
      const knowledgeGrounding = await getKnowledgeGroundingForPrompt(
        bookId,
        [
          promise.category,
          promise.audiencePrimary,
          promise.coreTruth,
          promise.differentiation,
          "title subtitle positioning book hook book title market language audience resonance",
        ]
          .filter(Boolean)
          .join(" "),
        6,
      );
      knowledgeContext = knowledgeGrounding.text;
      kbSources = knowledgeGrounding.sourceTitles;
    }

    const systemPrompt = `${TITLE_SUBTITLE_FINALIZATION_SYSTEM_PROMPT}

Book Voice Context:
${formatSetupContextForPrompt(bookSetupProfile)}${knowledgeContext}`;

    const rawResponse = await withTimeout(
      model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(groundingContext.promptPayload)),
      ]),
      120000,
      "Title and subtitle generation timed out after 120 seconds",
    );

    const rawText = extractTextFromResponse(rawResponse).trim();
    const usageMetadata = getUsageMetadata(rawResponse);
    if (!rawText) {
      throw new Error("Title and subtitle generation returned empty content");
    }

    const jsonText = extractJsonText(rawText);
    const parsed = JSON.parse(jsonText);
    const normalized = normalizeTitleSubtitleFinalization(parsed, fallback);

    return {
      ...normalized,
      metadata: {
        createdAt: normalized.metadata?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        model: resolveModelSpec("promise:author"),
        tokenUsage: normalizeTokenUsageMetadata(usageMetadata),
        grounding: {
          previousPhases: groundingContext.previousPhases,
          audienceSignals: groundingContext.audienceSignals,
          kbSources,
        },
      },
    };
  } catch (error) {
    console.error("[maybeGenerateTitleSubtitleFinalization] Error:", error);
    if (error instanceof JsonExtractionError) {
      console.error(
        "[maybeGenerateTitleSubtitleFinalization] JSON extraction details:",
        error.details,
      );
    }

    if (
      fallback &&
      error instanceof Error &&
      /timed out|empty content|overloaded/i.test(error.message)
    ) {
      return {
        ...fallback,
        metadata: {
          ...(fallback.metadata ?? {}),
          updatedAt: new Date().toISOString(),
          model: "fallback-timeout",
          tokenUsage: fallback.metadata?.tokenUsage,
          grounding: {
            previousPhases: groundingContext?.previousPhases ?? [],
            audienceSignals: groundingContext?.audienceSignals ?? [],
            kbSources,
          },
        },
      };
    }

    throw error;
  }
}

export async function maybeGenerateBookPromiseReport(
  promise: PromiseBrief,
  marketReport: MarketReport,
  recommendations: PositioningRecommendations,
  personas: PersonaPack,
  audienceResearch?: AudienceResearchArtifact,
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
  bookSetupProfile?: BookSetupProfile | null,
  titleSubtitleFinalization?: TitleSubtitleFinalization,
  bookId?: string,
): Promise<BookPromiseReport> {
  let fallback: BookPromiseReport | undefined;
  let groundingContext:
    | ReturnType<typeof buildBookPitchGroundingContext>
    | undefined;
  let kbSources: string[] = [];

  try {
    console.log("[maybeGenerateBookPromiseReport] Starting...");
    const personaContexts = buildTruthPersonaContexts(
      promise,
      audienceResearch?.phase2?.personas,
      personas.personas,
    );
    groundingContext = buildBookPitchGroundingContext(
      promise,
      audienceResearch,
      audienceResearch?.phase2?.personas,
      personas.personas,
      coreTruths,
      transformationArc,
      marketReport,
      recommendations,
      personaContexts,
      bookSetupProfile,
      titleSubtitleFinalization,
    );

    fallback = fallbackBookPromiseReport(
      promise,
      personaContexts,
      marketReport,
      recommendations,
      audienceResearch,
      coreTruths,
      transformationArc,
      bookSetupProfile,
      titleSubtitleFinalization,
    );

    const model = await getBookPitchModel({
      maxOutputTokens: 16000,
      timeoutMs: 300000,
    });

    if (!model) {
      console.log("[maybeGenerateBookPromiseReport] No Opus model available, using fallback");
      return {
        ...fallback,
        metadata: {
          ...(fallback.metadata ?? {}),
          updatedAt: new Date().toISOString(),
          model: "fallback",
          grounding: {
            previousPhases: groundingContext.previousPhases,
            audienceSignals: groundingContext.audienceSignals,
            kbSources: [],
          },
        },
      };
    }

    let knowledgeContext = "";
    if (bookId) {
      const knowledgeGrounding = await getKnowledgeGroundingForPrompt(
        bookId,
        [
          promise.category,
          promise.audiencePrimary,
          promise.coreTruth,
          promise.differentiation,
          "book pitch launch strategy positioning financial projections publisher partner package",
        ]
          .filter(Boolean)
          .join(" "),
        8,
      );
      knowledgeContext = knowledgeGrounding.text;
      kbSources = knowledgeGrounding.sourceTitles;
    }

    const systemPrompt = `${BOOK_PITCH_SYSTEM_PROMPT}

Book Voice Context:
${formatSetupContextForPrompt(bookSetupProfile)}${knowledgeContext}`;

    const { markdown: rawText, tokenUsage } = await generateBookPitchMarkdownInSections({
      model,
      systemPrompt,
      promptPayload: groundingContext.promptPayload as Record<string, unknown>,
    });
    console.log(`[maybeGenerateBookPromiseReport] Raw text length: ${rawText.length}`);

    if (!rawText) {
      throw new Error("Book pitch generation returned empty content");
    }

    const normalizedMarkdown = replaceBookPitchPersonaNames(
      rawText,
      audienceResearch?.phase2?.personas,
      buildBookPitchAudienceProfiles(
        audienceResearch,
        audienceResearch?.phase2?.personas,
        personaContexts,
        recommendations,
      ),
    );

    const composed = composeBookPromiseReportFromMarkdown(
      normalizedMarkdown,
      promise,
      marketReport,
      recommendations,
      personas,
      audienceResearch,
      coreTruths,
      transformationArc,
      bookSetupProfile,
      titleSubtitleFinalization,
      fallback,
    );

    return {
      ...composed,
      metadata: {
        createdAt: composed.metadata?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        model: resolveModelSpec("promise:author"),
        tokenUsage,
        grounding: {
          previousPhases: groundingContext.previousPhases,
          audienceSignals: groundingContext.audienceSignals,
          kbSources,
        },
      },
    };
  } catch (error) {
    console.error("[maybeGenerateBookPromiseReport] Error:", error);
    if (
      fallback &&
      error instanceof Error &&
      /timed out|empty content|overloaded/i.test(error.message)
    ) {
      return {
        ...fallback,
        metadata: {
          ...(fallback.metadata ?? {}),
          updatedAt: new Date().toISOString(),
          model: "fallback-timeout",
          tokenUsage: fallback.metadata?.tokenUsage,
          grounding: {
            previousPhases: groundingContext?.previousPhases ?? [],
            audienceSignals: groundingContext?.audienceSignals ?? [],
            kbSources,
          },
        },
      };
    }
    throw error;
  }
}

// Audience Research Phase 1: Generate research questions and identified user types
export async function maybeGenerateAudienceResearchPhase1(
  promise: PromiseBrief,
  bookSetupProfile?: BookSetupProfile | null,
  bookId?: string,
): Promise<AudienceResearchPhase1> {
  try {
    console.log(`[maybeGenerateAudienceResearchPhase1] Starting...`);
    const model = await getStructuredAudienceModel({
      maxOutputTokens: 5000,
      timeoutMs: 90000,
    });
    console.log(`[maybeGenerateAudienceResearchPhase1] Model obtained:`, model ? "yes" : "no");

    if (!model) {
      console.log(`[maybeGenerateAudienceResearchPhase1] No model, using fallback`);
      // Fallback: generate basic questions with answers and user types
      return {
        researchQuestions: [
          {
            question: "Who specifically needs this book? (role, industry, seniority)",
            answer: "Professionals in the target industry facing the pain point described in the promise, typically mid to senior level with decision-making authority and budget responsibility.",
          },
          {
            question: "What's their current situation and what's keeping them stuck?",
            answer: "They are experiencing the core pain described in the promise, using outdated or ineffective approaches, and feeling frustrated by results that don't match their efforts.",
          },
          {
            question: "What does winning look like for them?",
            answer: "Achieving the transformation described in the promise—moving from current frustration to desired state with measurable improvement in the key outcome area.",
          },
          {
            question: "What would make them skeptical a book could help?",
            answer: "Past experiences with similar books that didn't deliver practical solutions, or belief that their situation is too unique to benefit from a generalized framework.",
          },
          {
            question: "Where do they get information and how do they decide to buy?",
            answer: "They research through professional networks, peer recommendations, and industry publications; they buy based on credible proof from others like them and clear examples of application.",
          },
        ],
        identifiedUserTypes: [
          {
            name: "Primary Decision Maker",
            description: "The core buyer persona most aligned with the promise",
            details: ["Feels the pain described in the promise", "Has authority to invest", "Seeks practical solutions", "Values actionable frameworks"],
          },
        ],
      };
    }

    // Get knowledge base context
    let knowledgeContext = "";
    if (bookId) {
      knowledgeContext = await getKnowledgeContextForPrompt(
        bookId,
        "audience target readers customers users personas",
        5
      );
    }

    const systemPrompt = `${AUDIENCE_RESEARCH_PHASE1_SYSTEM_PROMPT}\n\nBook Voice Context:\n${formatSetupContextForPrompt(bookSetupProfile)}${knowledgeContext}`;
    console.log(`[maybeGenerateAudienceResearchPhase1] System prompt prepared`);
    const rawResponse = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(JSON.stringify(promise)),
    ]);
    console.log(`[maybeGenerateAudienceResearchPhase1] Raw response obtained`);

    const rawText = extractTextFromResponse(rawResponse).trim();
    console.log(`[maybeGenerateAudienceResearchPhase1] Raw text length:`, rawText.length);

    const jsonText = extractJsonText(rawText);
    console.log(`[maybeGenerateAudienceResearchPhase1] Extracted JSON length:`, jsonText.length);

    const parsed = JSON.parse(jsonText) as unknown;
    const normalized = normalizeAudienceResearchPhase1(parsed);
    console.log(`[maybeGenerateAudienceResearchPhase1] Result normalized`);
    return normalized;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[maybeGenerateAudienceResearchPhase1] Error:`, errorMsg);
    if (error instanceof Error) {
      console.error(`[maybeGenerateAudienceResearchPhase1] Stack:`, error.stack);
    }
    throw error;
  }
}

// Audience Research Phase 2: Generate deep persona profiles
async function generatePersonaDeepProfileBatch(params: {
  model: NonNullable<Awaited<ReturnType<typeof getChatModel>>>;
  systemPrompt: string;
  promise: PromiseBrief;
  audienceResearch: AudienceResearchPhase1;
  requestedCount: number;
  existingPersonas: PersonaDeepProfile[];
  seedUserTypes: AudienceResearchPhase1["identifiedUserTypes"];
  batchLabel: string;
  log: (...parts: unknown[]) => void;
}): Promise<PersonaDeepProfile[]> {
  const messages = [
    new SystemMessage(params.systemPrompt),
    new HumanMessage(
      JSON.stringify({
        promise: params.promise,
        audienceResearch: {
          researchQuestions: params.audienceResearch.researchQuestions.slice(0, 5),
          identifiedUserTypes: params.audienceResearch.identifiedUserTypes,
        },
        requestedPersonaCount: params.requestedCount,
        seedUserTypes: params.seedUserTypes,
        existingPersonas: summarizePersonasForPrompt(params.existingPersonas),
        instruction: buildPersonaGenerationInstruction(params.requestedCount),
      }),
    ),
  ];

  params.log(
    `[maybeGeneratePersonasDeepProfile] Invoking batch ${params.batchLabel} for ${params.requestedCount} persona(s)...`,
  );

  let rawLLMText = "";
  let jsonText = "";
  let stopReason: string | undefined;

  try {
    const rawResponse = await params.model.invoke(messages);
    stopReason = getStopReason(rawResponse);

    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} response metadata:`,
      getResponseMetadata(rawResponse),
    );
    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} usage metadata:`,
      getUsageMetadata(rawResponse),
    );

    rawLLMText = extractTextFromResponse(rawResponse);
    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} raw text length:`,
      rawLLMText.length,
    );

    jsonText = extractJsonText(rawLLMText);
    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} extracted JSON length:`,
      jsonText.length,
    );

    const parsed = JSON.parse(jsonText) as unknown;
    const parsedRecord = asRecord(parsed);
    const personasRaw = Array.isArray(parsedRecord.personas) ? parsedRecord.personas : [parsed];
    const normalized = personasRaw.map((persona, index) =>
      normalizePersonaDeepProfile(persona, params.existingPersonas.length + index),
    );
    const result = PersonaPackDeepProfileSchema.parse({
      personas: normalized.slice(0, params.requestedCount),
    });

    if (result.personas.length < params.requestedCount) {
      throw new Error(
        `Expected ${params.requestedCount} personas but only received ${result.personas.length}`,
      );
    }

    return result.personas;
  } catch (error) {
    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} error:`,
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof JsonExtractionError) {
      params.log(
        `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} JSON extraction details:`,
        error.details,
      );
    }
    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} raw preview:`,
      rawLLMText ? rawLLMText.substring(0, 1200) : "NO TEXT",
    );

    const shouldSplit =
      params.requestedCount > 1 &&
      (isLikelyTruncatedJson(jsonText || rawLLMText, error, stopReason) ||
        (error instanceof Error && /Expected \d+ personas but only received \d+/i.test(error.message)));

    if (shouldSplit) {
      params.log(
        `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} looks truncated or incomplete. Retrying as single-persona calls...`,
      );

      const personas: PersonaDeepProfile[] = [];
      for (let index = 0; index < params.requestedCount; index++) {
        const singleSeed =
          params.seedUserTypes[index] !== undefined ? [params.seedUserTypes[index]] : [];
        const generated = await generatePersonaDeepProfileBatch({
          ...params,
          requestedCount: 1,
          existingPersonas: [...params.existingPersonas, ...personas],
          seedUserTypes: singleSeed,
          batchLabel: `${params.batchLabel}.${index + 1}`,
        });
        personas.push(generated[0]);
      }

      return personas;
    }

    throw error;
  }
}

export async function maybeGeneratePersonasDeepProfile(
  promise: PromiseBrief,
  audienceResearch: AudienceResearchPhase1,
  bookSetupProfile?: BookSetupProfile | null,
  bookId?: string,
  numPersonas: number = 5,
): Promise<PersonaPackDeepProfile> {
  const { writeFileSync } = await import("fs");
  const logPath = "/tmp/deep-personas-gen.log";
  const log = (...parts: unknown[]) => {
    const msg = parts
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          typeof part === "number" ||
          typeof part === "boolean" ||
          part === null ||
          part === undefined
        ) {
          return String(part);
        }
        try {
          return JSON.stringify(part);
        } catch {
          return String(part);
        }
      })
      .join(" ");

    console.log(msg);
    try {
      writeFileSync(logPath, msg + "\n", { flag: "a" });
    } catch (e) {
      // Silently fail file logging
    }
  };

  try {
    log("[maybeGeneratePersonasDeepProfile] Starting Phase 2 generation...");

    // Get knowledge base context
    log("[maybeGeneratePersonasDeepProfile] Loading knowledge base context...");
    let knowledgeContext = "";
    if (bookId) {
      try {
        knowledgeContext = await getKnowledgeContextForPrompt(
          bookId,
          "audience buyer customer profile segment demographics",
          5
        );
        log("[maybeGeneratePersonasDeepProfile] Knowledge context loaded, length:" + knowledgeContext.length);
      } catch (kbError) {
        log("[maybeGeneratePersonasDeepProfile] Knowledge base error:" + (kbError instanceof Error ? kbError.message : String(kbError)));
        // Continue without knowledge context
        knowledgeContext = "";
      }
    }

    log("[maybeGeneratePersonasDeepProfile] Building system prompt...");
    const setupContext = formatSetupContextForPrompt(bookSetupProfile);
    log("[maybeGeneratePersonasDeepProfile] Setup context length:" + setupContext.length);

    const systemPrompt = `${AUDIENCE_RESEARCH_PHASE2_SYSTEM_PROMPT}\n\nBook Voice Context:\n${setupContext}${knowledgeContext}`;
    log("[maybeGeneratePersonasDeepProfile] System prompt length:" + systemPrompt.length);

    const requestedPersonaCount = Math.max(1, Math.min(numPersonas, 10));
    const personas: PersonaDeepProfile[] = [];
    const batchSize = getPersonaDeepProfileBatchSize(requestedPersonaCount);
    const phaseBudgetMs = getPersonaDeepProfilePhaseBudgetMs(requestedPersonaCount);
    const phaseStartedAt = Date.now();

    log("[maybeGeneratePersonasDeepProfile] Batch size:" + batchSize);
    log("[maybeGeneratePersonasDeepProfile] Phase budget ms:" + phaseBudgetMs);

    for (let batchStart = 0; batchStart < requestedPersonaCount; batchStart += batchSize) {
      const elapsedMs = Date.now() - phaseStartedAt;
      const remainingBudgetMs = phaseBudgetMs - elapsedMs;

      if (remainingBudgetMs < 15000) {
        throw new Error(
          `Persona deep profile generation exceeded the overall phase budget after ${elapsedMs}ms. Reduce persona count or retry.`,
        );
      }

      log("[maybeGeneratePersonasDeepProfile] Initializing LLM model...");
      const model = await getStructuredAudienceModel({
        maxOutputTokens: 6500,
        timeoutMs: Math.min(120000, remainingBudgetMs),
        reasoningEffort: "high",
      });
      log("[maybeGeneratePersonasDeepProfile] Model initialized:", model ? "yes" : "no");

      if (!model) {
        log("[maybeGeneratePersonasDeepProfile] No model available, returning fallback");
        // Fallback: generate basic personas
        return {
          personas: [
            {
              id: "persona_1",
              name: "Primary Persona",
              demographics: {
                role: "Professional in relevant field",
                companyType: "Various",
                yearsInRole: 5,
                careerPath: "Progression within their field",
                dayInTheLife: "Busy with operational demands",
                reportsTo: "Senior leader",
                teamSize: 5,
              },
              currentSituation: {
                whatTheyDo: "Work described in the book promise",
                whatWorks: ["Some existing approaches", "Current systems"],
                whatDoesntWork: ["Pain points from promise"],
                timeAllocation: "50% on pain area, 50% other",
                biggestFrustration: "Core pain from promise",
              },
              goals: [
                { goal: "Achieve outcome from promise", type: "outcome" },
                { goal: "Feel confident and capable", type: "feeling" },
              ],
              painPoints: [
                { friction: "Current challenge", realCost: "Time and opportunity lost" },
              ],
              objections: [
                { objection: "Don't have time to read", proofNeeded: "Practical, quick application" },
              ],
              successMetrics: [{ metric: "Measurable improvement", feeling: "Greater confidence" }],
              learningStyle: {
                prefers: ["Practical examples", "Clear frameworks"],
                hates: ["Theory without application"],
                bestFormat: "Short, actionable chapters",
              },
              voiceBlendFit: {
                primary: "Practical and clear",
                reasoning: "Resonates with need for actionable solutions",
              },
            },
          ],
        };
      }

      const batchCount = Math.min(batchSize, requestedPersonaCount - batchStart);
      const seedUserTypes = audienceResearch.identifiedUserTypes.slice(
        batchStart,
        batchStart + batchCount,
      );
      const batchPersonas = await generatePersonaDeepProfileBatch({
        model,
        systemPrompt,
        promise,
        audienceResearch,
        requestedCount: batchCount,
        existingPersonas: personas,
        seedUserTypes,
        batchLabel: `${batchStart + 1}-${batchStart + batchCount}`,
        log,
      });

      personas.push(...batchPersonas);
    }

    const result = PersonaPackDeepProfileSchema.parse({ personas });

    log("[maybeGeneratePersonasDeepProfile] LLM invocation successful, personas generated:" + result.personas?.length);
    return result;
  } catch (error) {
    log("[maybeGeneratePersonasDeepProfile] CRITICAL ERROR:" + (error instanceof Error ? error.message : String(error)));
    if (error instanceof Error) {
      log("[maybeGeneratePersonasDeepProfile] Stack trace:" + error.stack);
    }
    throw error;
  }
}

export const __promiseTestUtils = {
  buildPersonaGenerationInstruction,
  deriveKnowledgeFallbackCharLimit,
  extractJsonText,
  getPersonaDeepProfilePhaseBudgetMs,
  getPersonaDeepProfileBatchSize,
  normalizePersonaDeepProfile,
};

// Audience Research Phase 3: Generate persona comparison analysis
export async function maybeGeneratePersonaComparisonAnalysis(
  personas: PersonaDeepProfile[],
  bookSetupProfile?: BookSetupProfile | null,
): Promise<PersonaComparisonAnalysis> {
  const { writeFileSync } = await import("fs");
  const logPath = "/tmp/persona-comparison-gen.log";
  const log = (...parts: unknown[]) => {
    const msg = parts
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          typeof part === "number" ||
          typeof part === "boolean" ||
          part === null ||
          part === undefined
        ) {
          return String(part);
        }

        try {
          return JSON.stringify(part);
        } catch {
          return String(part);
        }
      })
      .join(" ");

    console.log(msg);
    try {
      writeFileSync(logPath, msg + "\n", { flag: "a" });
    } catch {
      // Ignore log file write failures
    }
  };

  const fallback = buildFallbackPersonaComparisonAnalysis(personas);

  try {
    log("[maybeGeneratePersonaComparisonAnalysis] Starting Phase 3 generation...");
    const model = await getStructuredAudienceModel({
      maxOutputTokens: 2500,
      timeoutMs: 90000,
    });
    log("[maybeGeneratePersonaComparisonAnalysis] Model initialized:", model ? "yes" : "no");

    if (!model) {
      log("[maybeGeneratePersonaComparisonAnalysis] No model available, returning fallback analysis");
      return fallback;
    }

    const systemPrompt = `${AUDIENCE_RESEARCH_PHASE3_SYSTEM_PROMPT}\n\nBook Voice Context:\n${formatSetupContextForPrompt(bookSetupProfile)}`;
    log("[maybeGeneratePersonaComparisonAnalysis] System prompt length:", systemPrompt.length);

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(
        JSON.stringify({
          personas: summarizePersonasForComparison(personas),
          instruction:
            "Compare these personas and return concise strategic analysis with exact JSON keys only.",
        }),
      ),
    ];

    const rawResponse = await withTimeout(
      model.invoke(messages),
      90000,
      "Persona comparison generation timed out after 90 seconds",
    );
    const stopReason = getStopReason(rawResponse);
    log("[maybeGeneratePersonaComparisonAnalysis] Stop reason:", stopReason ?? "unknown");
    log(
      "[maybeGeneratePersonaComparisonAnalysis] Response metadata:",
      getResponseMetadata(rawResponse),
    );
    log(
      "[maybeGeneratePersonaComparisonAnalysis] Usage metadata:",
      getUsageMetadata(rawResponse),
    );

    const rawLLMText = extractTextFromResponse(rawResponse);
    log("[maybeGeneratePersonaComparisonAnalysis] Raw text length:", rawLLMText.length);

    const jsonText = extractJsonText(rawLLMText);
    log("[maybeGeneratePersonaComparisonAnalysis] Extracted JSON length:", jsonText.length);

    const parsed = JSON.parse(jsonText) as unknown;
    const normalized = normalizePersonaComparisonAnalysis(parsed, personas);
    log(
      "[maybeGeneratePersonaComparisonAnalysis] Generation successful, common themes:",
      normalized.commonThemes.length,
    );

    return normalized;
  } catch (error) {
    log(
      "[maybeGeneratePersonaComparisonAnalysis] ERROR:",
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof JsonExtractionError) {
      log(
        "[maybeGeneratePersonaComparisonAnalysis] JSON extraction details:",
        error.details,
      );
    }
    if (error instanceof Error && error.stack) {
      log("[maybeGeneratePersonaComparisonAnalysis] Stack:", error.stack);
    }
    log("[maybeGeneratePersonaComparisonAnalysis] Returning fallback analysis");
    return fallback;
  }
}

// Comprehensive Promise Statement Generation (from setup)
export async function generateComprehensivePromiseStatement(
  bookSetupProfile: BookSetupProfile | null,
  bookId?: string,
): Promise<string> {
  try {
    console.log(`[generateComprehensivePromiseStatement] Starting...`);
    const model = await getChatModel();

    if (!model) {
      console.log(`[generateComprehensivePromiseStatement] No model, using fallback`);
      return "This book provides readers with actionable insights and practical frameworks to achieve their goals.";
    }

    const setupContext = bookSetupProfile ? formatSetupContextForPrompt(bookSetupProfile) : "";

    // Include ALL extracted knowledge base content - let the AI determine what's relevant
    let knowledgeContext = "";
    if (bookId) {
      try {
        console.log("[generateComprehensivePromiseStatement] Loading full knowledge base...");
        const knowledgeBase = await getBookKnowledgeBase(bookId, 200000); // 200KB limit

        if (knowledgeBase.content && knowledgeBase.sourceCount > 0) {
          knowledgeContext =
            "\n\n=== BOOK REFERENCE MATERIALS ===\n" +
            `(${knowledgeBase.sourceCount} source documents)\n\n` +
            knowledgeBase.content;
          console.log(
            `[generateComprehensivePromiseStatement] Loaded ${knowledgeBase.sourceCount} documents, ${knowledgeBase.content.length} characters`
          );
        } else {
          console.log("[generateComprehensivePromiseStatement] No knowledge base content found");
        }
      } catch (err) {
        console.warn(
          "[generateComprehensivePromiseStatement] Failed to load knowledge base:",
          err
        );
        // Continue without knowledge context if loading fails
      }
    } else {
      console.log("[generateComprehensivePromiseStatement] No bookId provided, skipping knowledge base");
    }

    const systemPrompt = `You are an expert book strategist creating a comprehensive, multi-dimensional promise statement.

CRITICAL INSTRUCTIONS:
- You MUST include ALL 7 sections listed below
- Each section should be substantial (3-5 sentences minimum for most sections)
- Do NOT summarize or condense
- Do NOT skip any sections
- Include clear headers for each section

Generate a DETAILED promise statement with these REQUIRED 7 sections:

1. **The Promise (Short Form)**: What the book fundamentally promises to deliver. Be specific about what readers will gain, not generic claims. (2-3 sentences)

2. **The Transformation**: Describe the complete before/after journey. Detail what the reader's situation, challenges, and mindset are BEFORE reading. Then describe how they will be different AFTER reading the book.

3. **The Mechanism**: What system, framework, or approach enables this transformation? Name it specifically. Explain the core principles and how they work to create change.

4. **The Practical Outcomes**: List 5-7 specific, measurable, actionable results the reader will achieve. Be concrete. Examples: skills gained, problems solved, capabilities developed.

5. **The Emotional Outcome**: How will the reader FEEL differently after reading? What emotional transformation occurs? What confidence, clarity, or peace of mind do they gain?

6. **What This Book IS NOT**: Clarify what the book explicitly does NOT promise or cover. What misunderstandings should be corrected? What is out of scope?

7. **The Closing Statement**: A final, powerful 2-3 sentence summary that ties everything together and inspires action.

FORMATTING: Use the exact section headers above. Make this comprehensive and substantial—aim for 800-1200 words total.

Book Voice Context:
${setupContext}${knowledgeContext}

NOW GENERATE THE FULL COMPREHENSIVE PROMISE STATEMENT:`;

    const result = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage("Generate the comprehensive promise statement now."),
    ]);

    const promiseText = typeof result.content === "string" ? result.content : String(result.content);
    console.log(`[generateComprehensivePromiseStatement] Result obtained, length: ${promiseText.length}`);
    return promiseText;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[generateComprehensivePromiseStatement] Error:`, errorMsg);
    throw error;
  }
}

type TruthPersonaContext = {
  name: string;
  context: string;
  dilemma: string;
  voiceHint: "Andy" | "Drucker" | "Jobs";
};

const PROMISE_TAB_ORDER = [
  "promise-statement",
  "audience",
  "truth",
  "transformation",
  "market",
  "recommendations",
  "book-promise",
] as const;

function getDefaultPromisePhaseApprovals(): PromisePhaseApprovals {
  return Object.fromEntries(
    PROMISE_TAB_ORDER.map((tab) => [tab, { status: "pending" as const }]),
  ) as PromisePhaseApprovals;
}

function normalizePromisePhaseStatus(
  value: unknown,
): "pending" | "approved" | "rejected" {
  if (value === "approved" || value === "rejected") {
    return value;
  }

  return "pending";
}

function normalizePromisePhaseApprovals(value: unknown): PromisePhaseApprovals {
  const defaults = getDefaultPromisePhaseApprovals();
  const metadata = asRecord(value);
  const phaseApprovals = asRecord(metadata.phaseApprovals);

  return PROMISE_TAB_ORDER.reduce<PromisePhaseApprovals>((accumulator, tab) => {
    const rawEntry = asRecord(phaseApprovals[tab]);
    accumulator[tab] = {
      status: normalizePromisePhaseStatus(rawEntry.status),
      ...(typeof rawEntry.feedback === "string" && rawEntry.feedback.trim().length > 0
        ? { feedback: rawEntry.feedback.trim() }
        : {}),
      ...(typeof rawEntry.approvedAt === "string" ? { approvedAt: rawEntry.approvedAt } : {}),
      ...(typeof rawEntry.rejectedAt === "string" ? { rejectedAt: rawEntry.rejectedAt } : {}),
    };
    return accumulator;
  }, { ...defaults });
}

function createFallbackTransformationArtifact(
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
): TransformationArtifact {
  const sharedProblem =
    promise.readerProblem ||
    "They are operating inside a problem they can feel but do not yet know how to name correctly.";
  const coreTruth =
    promise.coreTruth ||
    `${promise.audiencePrimary || "The reader"} needs a new operating model, not more pressure.`;
  const firstAction =
    promise.bigIdea ||
    "Pause long enough to diagnose the real pattern before choosing the next action.";

  return {
    arc: {
      stage1Me: {
        personalDilemma:
          "The author hit a point where effort, expertise, and responsibility were no longer enough to solve the recurring problem.",
        falseBelief:
          "If I worked harder and stayed closer to every decision, I could force a better outcome.",
        manifestation:
          "That belief showed up as overfunctioning, reactive decision-making, and carrying too much of the burden personally.",
        cost:
          "The cost was slower progress, repeated frustration, and a system that depended too heavily on the author's own effort.",
        authorityToTeach:
          "The author has lived through the operating problem firsthand and built practical language and frameworks from solving it in the real world.",
        vulnerability:
          "Trust comes from admitting that competence alone did not fix the problem, and that the old identity was part of the trap.",
        voiceBlend:
          "The voice blends clarity, strategic diagnosis, and practical encouragement so the dilemma feels honest rather than theatrical.",
      },
      stage2We: {
        sharedProblem,
        universalTension:
          "All three personas are trying to get better outcomes while still leaning on a false belief that keeps recreating the problem.",
        personaDilemmas: personaContexts.map((persona) => ({
          personaName: persona.name,
          recognizedDilemma: `${persona.name} recognizes the problem in the tension between ${persona.context.toLowerCase()} and ${persona.dilemma.toLowerCase()}`,
          whatMakesItSpecific:
            "Their version of the dilemma is shaped by the pressure, role expectations, and constraints built into their day-to-day work.",
        })),
        readerQuestion:
          "What if the thing I think proves I am responsible or capable is actually the thing keeping me stuck?",
        emotionalBridgeStories:
          "Use stories that make the reader feel the exhaustion, the internal pressure, and the moment they realize the current approach is not sustainable.",
      },
      stage3Truth: {
        coreTruth,
        reframe:
          "The problem is not a lack of effort or care. The problem is the model they are using to interpret what is happening.",
        paradox:
          "Progress often starts when the reader stops doubling down on the instinct that used to make them feel competent.",
        proofMechanism:
          "Introduce the truth through a lived story, a practical framework, and a recognizable real-world example.",
        personaAnswers: personaContexts.map((persona) => ({
          personaName: persona.name,
          dilemmaAnswer: `${persona.name} sees that the truth addresses ${persona.dilemma.toLowerCase()} by giving them a more useful lens for deciding what to do next.`,
          voiceBlendResonates: {
            voice: persona.voiceHint,
            why: `${persona.voiceHint} resonates because this persona needs the truth delivered with practical credibility and emotional precision.`,
          },
        })),
        truthForm: "A principle supported by framework and paradox",
        ifEmbraced:
          promise.readerDesire ||
          "Readers gain a calmer, more repeatable way to act, decide, and lead.",
        ifIgnored:
          "They keep solving the visible symptom while the deeper pattern quietly reproduces the same pain.",
      },
      stage4You: {
        firstAction,
        personaApplications: personaContexts.map((persona) => ({
          personaName: persona.name,
          nextStep: `${persona.name} runs a first experiment that applies the truth to a live challenge in their own context.`,
          obstacleOrRisk:
            "The main difficulty is that the new approach initially feels slower, less familiar, or riskier than falling back to the old reflex.",
        })),
        instructionStyle:
          "Practical, sequential, and concrete enough that readers know exactly what to try next.",
        applicationResistance:
          "Resistance shows up as impatience, identity friction, and the temptation to return to what used to feel productive.",
        successVsFailure:
          "Success comes from applying the truth consistently in real situations; failure comes from treating it as an interesting idea without changing behavior.",
      },
      stage5FinalWe: {
        transformedSuccess:
          "Success looks like a reader who now interprets the problem differently, acts with more clarity, and gets better results without the old drag.",
        personaOutcomes: personaContexts.map((persona) => ({
          personaName: persona.name,
          breakthrough: `${persona.name} experiences a breakthrough when the new approach works under real pressure, not just in theory.`,
          whatBecomesPossible:
            "They can create better outcomes with less friction, more confidence, and more durable trust in the process.",
        })),
        collectiveVision:
          "If enough people embrace the truth, teams and organizations become calmer, sharper, and more capable of making meaningful progress.",
        identityShift:
          "Readers stop seeing themselves as people who survive by force of effort alone and start seeing themselves as people who can diagnose and lead with intention.",
        irreversibility:
          "Once the reader sees the old pattern clearly and feels the difference of the new one working, it becomes difficult to go back to the old belief without noticing the cost.",
      },
      stage6Patterns: {
        sharedThemes: [
          "Old competence can become the barrier to new growth.",
          "Clear diagnosis matters more than frantic activity.",
          "Practical change requires both emotional permission and structured action.",
        ],
        storyByStage: {
          me: "A personal story where the old belief clearly fails.",
          we: "A set of recognizable scenes that make the reader feel seen.",
          truth: "A turning-point story or framework reveal that changes interpretation.",
          you: "A practical implementation story with friction and correction.",
          finalWe: "A success story that shows what becomes possible when the truth takes root.",
        },
        voiceBlendMoments: {
          andy: "Andy matters most when the reader needs emotional clarity and direct, human explanation.",
          drucker: "Drucker matters most when the book names the strategic pattern and operational discipline required.",
          jobs: "Jobs matters most when the reader needs to feel the bigger future made possible by embracing the truth.",
        },
        implicitLessons: [
          "The book teaches readers how to reinterpret the problem before acting.",
          "The book teaches that behavior changes only when identity and structure shift together.",
          "The book teaches that practical transformation must be felt, understood, and tested in real situations.",
        ],
      },
      stage7BookMap: {
        openingStory:
          "Open with a concrete personal dilemma that captures the false belief in action and its hidden cost.",
        sharedDilemmaReveal:
          "Early chapters widen the frame so readers realize the author's dilemma is also their own.",
        truthReveal:
          "Reveal the core truth after the shared pain is fully felt, so the reframe lands with force.",
        applicationStart:
          "Application begins immediately after the truth is established, using experiments, frameworks, and concrete next steps.",
        visionCasting:
          "Vision casting happens after readers have seen the truth work in practice and can imagine the broader future it enables.",
        implicitPersonaService:
          "Serve all personas by using varied stories, examples, and stakes without explicitly labeling them in the manuscript.",
      },
      completeTransformation:
        `${coreTruth} The book moves from a personal dilemma, to shared recognition, to a core reframe, to practical application, and finally to a larger vision of what becomes possible when readers live by the new truth.`,
    },
  };
}

function normalizeTransformationArtifact(
  raw: unknown,
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
): TransformationArtifact {
  const fallback = createFallbackTransformationArtifact(promise, personaContexts);
  const record = asRecord(raw);
  const arc = asRecord(record.arc && typeof record.arc === "object" ? record.arc : record);

  const mapByPersona = <T,>(
    values: unknown,
    mapper: (entry: Record<string, unknown>, persona: TruthPersonaContext, index: number) => T,
    fallbackMapper: (persona: TruthPersonaContext, index: number) => T,
  ): T[] => {
    const entries = Array.isArray(values) ? values : [];
    return personaContexts.map((persona, index) => {
      const entry = asRecord(entries[index]);
      return Object.keys(entry).length > 0
        ? mapper(entry, persona, index)
        : fallbackMapper(persona, index);
    });
  };

  return TransformationArtifactSchema.parse({
    arc: {
      stage1Me: {
        personalDilemma: coerceString(
          asRecord(arc.stage1Me).personalDilemma,
          fallback.arc.stage1Me.personalDilemma,
        ),
        falseBelief: coerceString(
          asRecord(arc.stage1Me).falseBelief,
          fallback.arc.stage1Me.falseBelief,
        ),
        manifestation: coerceString(
          asRecord(arc.stage1Me).manifestation,
          fallback.arc.stage1Me.manifestation,
        ),
        cost: coerceString(asRecord(arc.stage1Me).cost, fallback.arc.stage1Me.cost),
        authorityToTeach: coerceString(
          asRecord(arc.stage1Me).authorityToTeach,
          fallback.arc.stage1Me.authorityToTeach,
        ),
        vulnerability: coerceString(
          asRecord(arc.stage1Me).vulnerability,
          fallback.arc.stage1Me.vulnerability,
        ),
        voiceBlend: coerceString(
          asRecord(arc.stage1Me).voiceBlend,
          fallback.arc.stage1Me.voiceBlend,
        ),
      },
      stage2We: {
        sharedProblem: coerceString(
          asRecord(arc.stage2We).sharedProblem,
          fallback.arc.stage2We.sharedProblem,
        ),
        universalTension: coerceString(
          asRecord(arc.stage2We).universalTension,
          fallback.arc.stage2We.universalTension,
        ),
        personaDilemmas: mapByPersona(
          asRecord(arc.stage2We).personaDilemmas,
          (entry, persona, index) => ({
            personaName: coerceString(entry.personaName, persona.name),
            recognizedDilemma: coerceString(
              entry.recognizedDilemma,
              fallback.arc.stage2We.personaDilemmas[index]?.recognizedDilemma ||
                fallback.arc.stage2We.sharedProblem,
            ),
            whatMakesItSpecific: coerceString(
              entry.whatMakesItSpecific,
              fallback.arc.stage2We.personaDilemmas[index]?.whatMakesItSpecific ||
                persona.context,
            ),
          }),
          (_persona, index) => fallback.arc.stage2We.personaDilemmas[index],
        ),
        readerQuestion: coerceString(
          asRecord(arc.stage2We).readerQuestion,
          fallback.arc.stage2We.readerQuestion,
        ),
        emotionalBridgeStories: coerceString(
          asRecord(arc.stage2We).emotionalBridgeStories,
          fallback.arc.stage2We.emotionalBridgeStories,
        ),
      },
      stage3Truth: {
        coreTruth: coerceString(
          asRecord(arc.stage3Truth).coreTruth,
          fallback.arc.stage3Truth.coreTruth,
        ),
        reframe: coerceString(
          asRecord(arc.stage3Truth).reframe,
          fallback.arc.stage3Truth.reframe,
        ),
        paradox: coerceString(
          asRecord(arc.stage3Truth).paradox,
          fallback.arc.stage3Truth.paradox,
        ),
        proofMechanism: coerceString(
          asRecord(arc.stage3Truth).proofMechanism,
          fallback.arc.stage3Truth.proofMechanism,
        ),
        personaAnswers: mapByPersona(
          asRecord(arc.stage3Truth).personaAnswers,
          (entry, persona, index) => ({
            personaName: coerceString(entry.personaName, persona.name),
            dilemmaAnswer: coerceString(
              entry.dilemmaAnswer,
              fallback.arc.stage3Truth.personaAnswers[index]?.dilemmaAnswer ||
                fallback.arc.stage3Truth.coreTruth,
            ),
            voiceBlendResonates: {
              voice: normalizeTruthVoice(asRecord(entry.voiceBlendResonates).voice ?? persona.voiceHint),
              why: coerceString(
                asRecord(entry.voiceBlendResonates).why,
                fallback.arc.stage3Truth.personaAnswers[index]?.voiceBlendResonates.why ||
                  `${persona.voiceHint} is the best fit for this persona.`,
              ),
            },
          }),
          (_persona, index) => fallback.arc.stage3Truth.personaAnswers[index],
        ),
        truthForm: coerceString(
          asRecord(arc.stage3Truth).truthForm,
          fallback.arc.stage3Truth.truthForm,
        ),
        ifEmbraced: coerceString(
          asRecord(arc.stage3Truth).ifEmbraced,
          fallback.arc.stage3Truth.ifEmbraced,
        ),
        ifIgnored: coerceString(
          asRecord(arc.stage3Truth).ifIgnored,
          fallback.arc.stage3Truth.ifIgnored,
        ),
      },
      stage4You: {
        firstAction: coerceString(
          asRecord(arc.stage4You).firstAction,
          fallback.arc.stage4You.firstAction,
        ),
        personaApplications: mapByPersona(
          asRecord(arc.stage4You).personaApplications,
          (entry, persona, index) => ({
            personaName: coerceString(entry.personaName, persona.name),
            nextStep: coerceString(
              entry.nextStep,
              fallback.arc.stage4You.personaApplications[index]?.nextStep ||
                fallback.arc.stage4You.firstAction,
            ),
            obstacleOrRisk: coerceString(
              entry.obstacleOrRisk,
              fallback.arc.stage4You.personaApplications[index]?.obstacleOrRisk ||
                fallback.arc.stage4You.applicationResistance,
            ),
          }),
          (_persona, index) => fallback.arc.stage4You.personaApplications[index],
        ),
        instructionStyle: coerceString(
          asRecord(arc.stage4You).instructionStyle,
          fallback.arc.stage4You.instructionStyle,
        ),
        applicationResistance: coerceString(
          asRecord(arc.stage4You).applicationResistance,
          fallback.arc.stage4You.applicationResistance,
        ),
        successVsFailure: coerceString(
          asRecord(arc.stage4You).successVsFailure,
          fallback.arc.stage4You.successVsFailure,
        ),
      },
      stage5FinalWe: {
        transformedSuccess: coerceString(
          asRecord(arc.stage5FinalWe).transformedSuccess,
          fallback.arc.stage5FinalWe.transformedSuccess,
        ),
        personaOutcomes: mapByPersona(
          asRecord(arc.stage5FinalWe).personaOutcomes,
          (entry, persona, index) => ({
            personaName: coerceString(entry.personaName, persona.name),
            breakthrough: coerceString(
              entry.breakthrough,
              fallback.arc.stage5FinalWe.personaOutcomes[index]?.breakthrough ||
                fallback.arc.stage5FinalWe.transformedSuccess,
            ),
            whatBecomesPossible: coerceString(
              entry.whatBecomesPossible,
              fallback.arc.stage5FinalWe.personaOutcomes[index]?.whatBecomesPossible ||
                fallback.arc.stage5FinalWe.collectiveVision,
            ),
          }),
          (_persona, index) => fallback.arc.stage5FinalWe.personaOutcomes[index],
        ),
        collectiveVision: coerceString(
          asRecord(arc.stage5FinalWe).collectiveVision,
          fallback.arc.stage5FinalWe.collectiveVision,
        ),
        identityShift: coerceString(
          asRecord(arc.stage5FinalWe).identityShift,
          fallback.arc.stage5FinalWe.identityShift,
        ),
        irreversibility: coerceString(
          asRecord(arc.stage5FinalWe).irreversibility,
          fallback.arc.stage5FinalWe.irreversibility,
        ),
      },
      stage6Patterns: {
        sharedThemes:
          coerceStringArray(asRecord(arc.stage6Patterns).sharedThemes).slice(0, 6).filter(Boolean)
            .length > 0
            ? coerceStringArray(asRecord(arc.stage6Patterns).sharedThemes).slice(0, 6).filter(Boolean)
            : fallback.arc.stage6Patterns.sharedThemes,
        storyByStage: {
          me: coerceString(
            asRecord(asRecord(arc.stage6Patterns).storyByStage).me,
            fallback.arc.stage6Patterns.storyByStage.me,
          ),
          we: coerceString(
            asRecord(asRecord(arc.stage6Patterns).storyByStage).we,
            fallback.arc.stage6Patterns.storyByStage.we,
          ),
          truth: coerceString(
            asRecord(asRecord(arc.stage6Patterns).storyByStage).truth,
            fallback.arc.stage6Patterns.storyByStage.truth,
          ),
          you: coerceString(
            asRecord(asRecord(arc.stage6Patterns).storyByStage).you,
            fallback.arc.stage6Patterns.storyByStage.you,
          ),
          finalWe: coerceString(
            asRecord(asRecord(arc.stage6Patterns).storyByStage).finalWe,
            fallback.arc.stage6Patterns.storyByStage.finalWe,
          ),
        },
        voiceBlendMoments: {
          andy: coerceString(
            asRecord(asRecord(arc.stage6Patterns).voiceBlendMoments).andy,
            fallback.arc.stage6Patterns.voiceBlendMoments.andy,
          ),
          drucker: coerceString(
            asRecord(asRecord(arc.stage6Patterns).voiceBlendMoments).drucker,
            fallback.arc.stage6Patterns.voiceBlendMoments.drucker,
          ),
          jobs: coerceString(
            asRecord(asRecord(arc.stage6Patterns).voiceBlendMoments).jobs,
            fallback.arc.stage6Patterns.voiceBlendMoments.jobs,
          ),
        },
        implicitLessons:
          coerceStringArray(asRecord(arc.stage6Patterns).implicitLessons).slice(0, 6).filter(Boolean)
            .length > 0
            ? coerceStringArray(asRecord(arc.stage6Patterns).implicitLessons).slice(0, 6).filter(Boolean)
            : fallback.arc.stage6Patterns.implicitLessons,
      },
      stage7BookMap: {
        openingStory: coerceString(
          asRecord(arc.stage7BookMap).openingStory,
          fallback.arc.stage7BookMap.openingStory,
        ),
        sharedDilemmaReveal: coerceString(
          asRecord(arc.stage7BookMap).sharedDilemmaReveal,
          fallback.arc.stage7BookMap.sharedDilemmaReveal,
        ),
        truthReveal: coerceString(
          asRecord(arc.stage7BookMap).truthReveal,
          fallback.arc.stage7BookMap.truthReveal,
        ),
        applicationStart: coerceString(
          asRecord(arc.stage7BookMap).applicationStart,
          fallback.arc.stage7BookMap.applicationStart,
        ),
        visionCasting: coerceString(
          asRecord(arc.stage7BookMap).visionCasting,
          fallback.arc.stage7BookMap.visionCasting,
        ),
        implicitPersonaService: coerceString(
          asRecord(arc.stage7BookMap).implicitPersonaService,
          fallback.arc.stage7BookMap.implicitPersonaService,
        ),
      },
      completeTransformation: coerceString(
        arc.completeTransformation,
        fallback.arc.completeTransformation,
      ),
    },
    metadata: asRecord(record.metadata),
  });
}

function normalizeTruthVoice(value: unknown): "Andy" | "Drucker" | "Jobs" {
  const normalized = coerceString(value, "Drucker").toLowerCase();
  if (normalized.includes("andy")) {
    return "Andy";
  }
  if (normalized.includes("job")) {
    return "Jobs";
  }
  return "Drucker";
}

function buildTruthPersonaContexts(
  promise: PromiseBrief,
  deepProfiles?: PersonaDeepProfile[],
  simplePersonas?: PersonaPack["personas"],
): TruthPersonaContext[] {
  const prioritizedDeepProfiles = [...(deepProfiles ?? [])].sort((left, right) => {
    const leftPriority = left.priority === "primary" ? 0 : 1;
    const rightPriority = right.priority === "primary" ? 0 : 1;
    return leftPriority - rightPriority;
  });

  const contextsFromDeepProfiles = prioritizedDeepProfiles.map((persona) => ({
    name: persona.name,
    context: `${persona.demographics.role} in ${persona.demographics.companyType}`,
    dilemma: `${persona.currentSituation.biggestFrustration} ${persona.painPoints
      .slice(0, 2)
      .map((point) => point.friction)
      .join(" ")}`.trim(),
    voiceHint: normalizeTruthVoice(persona.voiceBlendFit.primary),
  }));

  const contextsFromSimplePersonas = (simplePersonas ?? []).map((persona) => ({
    name: persona.name,
    context: persona.context,
    dilemma: `${persona.painPoints.slice(0, 2).join(" ")} ${persona.desiredOutcomes
      .slice(0, 1)
      .join(" ")}`.trim(),
    voiceHint: "Drucker" as const,
  }));

  const fallbacks = [
    {
      name: promise.audiencePrimary || "Primary Reader",
      context: `Reader seeking ${promise.readerDesire || "better results"}`,
      dilemma: promise.readerProblem || "They are stuck using a broken mental model.",
      voiceHint: "Drucker" as const,
    },
    ...(promise.audienceSecondary ?? []).slice(0, 2).map((audience, index) => ({
      name: audience,
      context: `Secondary audience ${index + 1}`,
      dilemma: promise.readerProblem || "They need a clearer path forward.",
      voiceHint: index % 2 === 0 ? ("Andy" as const) : ("Jobs" as const),
    })),
  ];

  const uniqueContexts: TruthPersonaContext[] = [];
  for (const candidate of [
    ...contextsFromDeepProfiles,
    ...contextsFromSimplePersonas,
    ...fallbacks,
  ]) {
    if (!candidate.name || uniqueContexts.some((existing) => existing.name === candidate.name)) {
      continue;
    }
    uniqueContexts.push(candidate);
    if (uniqueContexts.length === 3) {
      break;
    }
  }

  while (uniqueContexts.length < 3) {
    uniqueContexts.push({
      name: `Reader ${uniqueContexts.length + 1}`,
      context: `Reader drawn to ${promise.promiseStatement || promise.bigIdea || "the book promise"}`,
      dilemma: promise.readerProblem || "They need a better way to understand the problem.",
      voiceHint: "Drucker",
    });
  }

  return uniqueContexts;
}

function buildTruthGroundingContext(
  promise: PromiseBrief,
  audienceResearch: AudienceResearchArtifact | undefined,
  deepProfiles: PersonaDeepProfile[] | undefined,
  simplePersonas: PersonaPack["personas"] | undefined,
  personaContexts: TruthPersonaContext[],
) {
  const phase1Questions =
    audienceResearch?.phase1?.researchQuestions.slice(0, 4).map((entry) => ({
      question: entry.question,
      answer: entry.answer,
    })) ?? [];

  const identifiedUserTypes =
    audienceResearch?.phase1?.identifiedUserTypes.slice(0, 4).map((entry) => ({
      name: entry.name,
      description: entry.description,
      details: entry.details.slice(0, 2),
    })) ?? [];

  const deepPersonaSummaries =
    deepProfiles?.slice(0, 3).map((persona) => ({
      name: persona.name,
      role: persona.demographics.role,
      companyType: persona.demographics.companyType,
      biggestFrustration: persona.currentSituation.biggestFrustration,
      topPainPoints: persona.painPoints.slice(0, 2).map((point) => point.friction),
      topGoals: persona.goals.slice(0, 2).map((goal) => goal.goal),
      buyingObjections: persona.objections.slice(0, 2).map((item) => item.objection),
    })) ?? [];

  const simplePersonaSummaries =
    simplePersonas?.slice(0, 3).map((persona) => ({
      name: persona.name,
      context: persona.context,
      painPoints: persona.painPoints.slice(0, 2),
      desiredOutcomes: persona.desiredOutcomes.slice(0, 2),
    })) ?? [];

  const comparisonSummary = audienceResearch?.phase3
    ? {
        commonThemes: audienceResearch.phase3.commonThemes.slice(0, 5),
        primaryPersona: audienceResearch.phase3.primaryPersona,
        differences: audienceResearch.phase3.differences.slice(0, 3),
      }
    : undefined;

  const previousPhases = [
    "Promise Statement",
    audienceResearch?.phase1 ? "Audience Research Phase 1" : null,
    audienceResearch?.phase2 ? "Audience Research Phase 2" : null,
    audienceResearch?.phase3 ? "Audience Research Phase 3" : null,
  ].filter((value): value is string => Boolean(value));

  const audienceSignals = [
    ...phase1Questions.map((entry) => entry.answer),
    ...identifiedUserTypes.map((entry) => `${entry.name}: ${entry.description}`),
    ...(comparisonSummary?.commonThemes ?? []),
    ...personaContexts.map((persona) => `${persona.name}: ${persona.dilemma}`),
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 8);

  return {
    previousPhases,
    audienceSignals,
    promptPayload: {
      promiseSummary: {
        promiseStatement: promise.promiseStatement,
        readerProblem: promise.readerProblem,
        readerDesire: promise.readerDesire,
        bigIdea: promise.bigIdea,
        coreTruth: promise.coreTruth,
        stakes: promise.stakes,
      },
      audienceResearch: {
        identifiedUserTypes,
        phase1Questions,
        phase2Personas:
          deepPersonaSummaries.length > 0
            ? deepPersonaSummaries
            : simplePersonaSummaries,
        phase3Analysis: comparisonSummary,
      },
      selectedPersonas: personaContexts,
      instruction:
        "Use the prior-phase research as binding context. The TRUTH must clearly emerge from the promise, persona pain patterns, audience questions, and common themes already generated.",
    },
  };
}

function buildMarketGroundingContext(
  promise: PromiseBrief,
  audienceResearch: AudienceResearchArtifact | undefined,
  deepProfiles: PersonaDeepProfile[] | undefined,
  simplePersonas: PersonaPack["personas"] | undefined,
  coreTruths: CoreTruthsArtifact | undefined,
  transformationArc: TransformationArtifact | undefined,
  personaContexts: TruthPersonaContext[],
) {
  const phase1Questions =
    audienceResearch?.phase1?.researchQuestions.slice(0, 5).map((entry) => ({
      question: entry.question,
      answer: entry.answer,
    })) ?? [];

  const identifiedUserTypes =
    audienceResearch?.phase1?.identifiedUserTypes.slice(0, 4).map((entry) => ({
      name: entry.name,
      description: entry.description,
      details: entry.details.slice(0, 3),
    })) ?? [];

  const deepPersonaSummaries =
    deepProfiles?.slice(0, 3).map((persona) => ({
      name: persona.name,
      role: persona.demographics.role,
      companyType: persona.demographics.companyType,
      biggestFrustration: persona.currentSituation.biggestFrustration,
      topPainPoints: persona.painPoints.slice(0, 2).map((point) => point.friction),
      topGoals: persona.goals.slice(0, 2).map((goal) => goal.goal),
      objections: persona.objections.slice(0, 2).map((item) => item.objection),
      voiceBlendFit: persona.voiceBlendFit.primary,
    })) ?? [];

  const simplePersonaSummaries =
    simplePersonas?.slice(0, 3).map((persona) => ({
      name: persona.name,
      context: persona.context,
      painPoints: persona.painPoints.slice(0, 2),
      desiredOutcomes: persona.desiredOutcomes.slice(0, 2),
      buyingMotivations: persona.buyingMotivations.slice(0, 2),
    })) ?? [];

  const phase3Comparison = audienceResearch?.phase3
    ? {
        commonThemes: audienceResearch.phase3.commonThemes.slice(0, 5),
        primaryPersona: audienceResearch.phase3.primaryPersona,
        differences: audienceResearch.phase3.differences.slice(0, 4),
      }
    : undefined;

  const truthSummary = coreTruths
    ? {
        falseBelief: coreTruths.coreInsight.falseBelief,
        coreTruth: coreTruths.coreInsight.coreTruth,
        whyNow: coreTruths.whyNow.whyUrgentNow,
        completeTruth: coreTruths.completeTruth,
        personaExperiences: coreTruths.personaExperiences.slice(0, 3).map((persona) => ({
          personaName: persona.personaName,
          theirVersionOfTruth: persona.theirVersionOfTruth,
          whatMakesItLand: persona.whatMakesItLand,
          voice: persona.voiceBlendResonates.voice,
        })),
      }
    : undefined;

  const transformationSummary = transformationArc?.arc
    ? {
        stage1Me: {
          personalDilemma: transformationArc.arc.stage1Me.personalDilemma,
          falseBelief: transformationArc.arc.stage1Me.falseBelief,
        },
        stage2We: {
          sharedProblem: transformationArc.arc.stage2We.sharedProblem,
          universalTension: transformationArc.arc.stage2We.universalTension,
        },
        stage3Truth: {
          coreTruth: transformationArc.arc.stage3Truth.coreTruth,
          paradox: transformationArc.arc.stage3Truth.paradox,
        },
        stage4You: {
          firstAction: transformationArc.arc.stage4You.firstAction,
          resistance: transformationArc.arc.stage4You.applicationResistance,
        },
        stage5FinalWe: {
          transformedSuccess: transformationArc.arc.stage5FinalWe.transformedSuccess,
          collectiveVision: transformationArc.arc.stage5FinalWe.collectiveVision,
        },
        completeTransformation: transformationArc.arc.completeTransformation,
      }
    : undefined;

  const previousPhases = [
    "Promise Statement",
    audienceResearch?.phase1 ? "Audience Research Phase 1" : null,
    audienceResearch?.phase2 ? "Audience Research Phase 2" : null,
    audienceResearch?.phase3 ? "Audience Research Phase 3" : null,
    coreTruths ? "Truth" : null,
    transformationArc ? "Transformation" : null,
  ].filter((value): value is string => Boolean(value));

  const audienceSignals = [
    ...phase1Questions.map((entry) => entry.answer),
    ...identifiedUserTypes.map((entry) => `${entry.name}: ${entry.description}`),
    ...(phase3Comparison?.commonThemes ?? []),
    ...personaContexts.map((persona) => `${persona.name}: ${persona.dilemma}`),
    truthSummary?.coreTruth ?? "",
    transformationSummary?.stage2We.sharedProblem ?? "",
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 10);

  return {
    previousPhases,
    audienceSignals,
    promptPayload: {
      promiseSummary: {
        workingTitle: promise.workingTitle,
        promiseStatement: promise.promiseStatement,
        audiencePrimary: promise.audiencePrimary,
        category: promise.category,
        readerProblem: promise.readerProblem,
        readerDesire: promise.readerDesire,
        bigIdea: promise.bigIdea,
        coreTruth: promise.coreTruth,
        differentiation: promise.differentiation,
        stakes: promise.stakes,
      },
      audienceResearch: {
        identifiedUserTypes,
        phase1Questions,
        phase2Personas:
          deepPersonaSummaries.length > 0
            ? deepPersonaSummaries
            : simplePersonaSummaries,
        phase3Analysis: phase3Comparison,
      },
      truthSummary,
      transformationSummary,
      selectedPersonas: personaContexts,
      instruction:
        "Use the previous phases as hard constraints. Market analysis must explain how the already-defined reader, truth, and transformation compete in the market, not invent a disconnected thesis.",
    },
  };
}

function normalizeMarketReport(
  raw: unknown,
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
): MarketReport {
  const fallback = createFallbackMarketReport(
    promise,
    personaContexts,
    coreTruths,
    transformationArc,
  );
  const record = asRecord(raw);
  const executiveSummary = asRecord(record.executiveSummary);
  const competitiveLandscape = asRecord(record.competitiveLandscape);
  const competitiveAdvantage = asRecord(competitiveLandscape.competitiveAdvantage);
  const marketPositioning = asRecord(competitiveLandscape.marketPositioning);
  const marketSizing = asRecord(record.marketSizing);
  const audienceDemand = asRecord(record.audienceDemand);
  const pricingStrategy = asRecord(record.pricingStrategy);
  const monetizationEcosystem = asRecord(record.monetizationEcosystem);
  const distributionAndLaunch = asRecord(record.distributionAndLaunch);
  const riskAssessment = asRecord(record.riskAssessment);
  const successMetrics = asRecord(record.successMetrics);
  const financialProjections = asRecord(record.financialProjections);
  const goNoGoRecommendation = asRecord(record.goNoGoRecommendation);
  const metadata = asRecord(record.metadata);

  const rawComparisonTitles = Array.isArray(record.comparisonTitles)
    ? record.comparisonTitles
    : [];
  const rawDirectCompetitors =
    Array.isArray(competitiveLandscape.directCompetitors) &&
    competitiveLandscape.directCompetitors.length > 0
      ? competitiveLandscape.directCompetitors
      : rawComparisonTitles;

  const comparisonTitles =
    rawComparisonTitles.length > 0
      ? rawComparisonTitles.map(normalizeComparableSummary)
      : fallback.comparisonTitles;
  const directCompetitors =
    rawDirectCompetitors.length > 0
      ? rawDirectCompetitors.map(normalizeMarketDirectCompetitor)
      : fallback.competitiveLandscape.directCompetitors;
  const personaUrgency =
    Array.isArray(audienceDemand.personaUrgency) && audienceDemand.personaUrgency.length > 0
      ? audienceDemand.personaUrgency.map((item, index) =>
          normalizeMarketPersonaUrgency(
            item,
            index,
            personaContexts[index]?.name ?? fallback.audienceDemand.personaUrgency[index]?.personaName ?? `Persona ${index + 1}`,
          ),
        )
      : fallback.audienceDemand.personaUrgency;

  const normalized: MarketReport = {
    marketCategory: coerceString(record.marketCategory, fallback.marketCategory),
    comparisonTitles,
    saturationAssessment: coerceString(
      record.saturationAssessment,
      fallback.saturationAssessment,
    ),
    attractionDrivers:
      coerceStringArray(record.attractionDrivers).length > 0
        ? coerceStringArray(record.attractionDrivers)
        : fallback.attractionDrivers,
    commercialRisks:
      coerceStringArray(record.commercialRisks).length > 0
        ? coerceStringArray(record.commercialRisks)
        : fallback.commercialRisks,
    recommendations:
      coerceStringArray(record.recommendations).length > 0
        ? coerceStringArray(record.recommendations)
        : fallback.recommendations,
    executiveSummary: {
      headline: coerceString(executiveSummary.headline, fallback.executiveSummary.headline),
      overallRecommendation: normalizeMarketDecision(
        executiveSummary.overallRecommendation,
        fallback.executiveSummary.overallRecommendation,
      ),
      rationale: coerceString(executiveSummary.rationale, fallback.executiveSummary.rationale),
      strategicPriority: coerceString(
        executiveSummary.strategicPriority,
        fallback.executiveSummary.strategicPriority,
      ),
    },
    competitiveLandscape: {
      directCompetitors,
      indirectCompetitors:
        Array.isArray(competitiveLandscape.indirectCompetitors) &&
        competitiveLandscape.indirectCompetitors.length > 0
          ? competitiveLandscape.indirectCompetitors.map(normalizeMarketIndirectCompetitor)
          : fallback.competitiveLandscape.indirectCompetitors,
      competitiveAdvantage: {
        differentiation: coerceString(
          competitiveAdvantage.differentiation,
          fallback.competitiveLandscape.competitiveAdvantage.differentiation,
        ),
        unfairAdvantage: coerceString(
          competitiveAdvantage.unfairAdvantage,
          fallback.competitiveLandscape.competitiveAdvantage.unfairAdvantage,
        ),
        whoChoosesThisBook: coerceString(
          competitiveAdvantage.whoChoosesThisBook,
          fallback.competitiveLandscape.competitiveAdvantage.whoChoosesThisBook,
        ),
        gapFilled: coerceString(
          competitiveAdvantage.gapFilled,
          fallback.competitiveLandscape.competitiveAdvantage.gapFilled,
        ),
      },
      marketPositioning: {
        academicToPractical: coerceString(
          marketPositioning.academicToPractical,
          fallback.competitiveLandscape.marketPositioning.academicToPractical,
        ),
        nicheToBroad: coerceString(
          marketPositioning.nicheToBroad,
          fallback.competitiveLandscape.marketPositioning.nicheToBroad,
        ),
        theoreticalToActionOriented: coerceString(
          marketPositioning.theoreticalToActionOriented,
          fallback.competitiveLandscape.marketPositioning.theoreticalToActionOriented,
        ),
        industrySpecificToUniversal: coerceString(
          marketPositioning.industrySpecificToUniversal,
          fallback.competitiveLandscape.marketPositioning.industrySpecificToUniversal,
        ),
        whiteSpace: coerceString(
          marketPositioning.whiteSpace,
          fallback.competitiveLandscape.marketPositioning.whiteSpace,
        ),
      },
    },
    marketSizing: {
      totalAddressableMarket: coerceString(
        marketSizing.totalAddressableMarket,
        fallback.marketSizing.totalAddressableMarket,
      ),
      serviceableAddressableMarket: coerceString(
        marketSizing.serviceableAddressableMarket,
        fallback.marketSizing.serviceableAddressableMarket,
      ),
      serviceableObtainableMarket: coerceString(
        marketSizing.serviceableObtainableMarket,
        fallback.marketSizing.serviceableObtainableMarket,
      ),
      yearOneToThreeOutlook: coerceString(
        marketSizing.yearOneToThreeOutlook,
        fallback.marketSizing.yearOneToThreeOutlook,
      ),
      trends: coerceString(marketSizing.trends, fallback.marketSizing.trends),
      tailwinds:
        coerceStringArray(marketSizing.tailwinds).length > 0
          ? coerceStringArray(marketSizing.tailwinds)
          : fallback.marketSizing.tailwinds,
      headwinds:
        coerceStringArray(marketSizing.headwinds).length > 0
          ? coerceStringArray(marketSizing.headwinds)
          : fallback.marketSizing.headwinds,
    },
    audienceDemand: {
      personaUrgency,
      searchBehavior:
        coerceStringArray(audienceDemand.searchBehavior).length > 0
          ? coerceStringArray(audienceDemand.searchBehavior)
          : fallback.audienceDemand.searchBehavior,
      contentConsumptionPatterns:
        coerceStringArray(audienceDemand.contentConsumptionPatterns).length > 0
          ? coerceStringArray(audienceDemand.contentConsumptionPatterns)
          : fallback.audienceDemand.contentConsumptionPatterns,
      willingnessToPay: coerceString(
        audienceDemand.willingnessToPay,
        fallback.audienceDemand.willingnessToPay,
      ),
      validationSignals: coerceString(
        audienceDemand.validationSignals,
        fallback.audienceDemand.validationSignals,
      ),
      openQuestions:
        coerceStringArray(audienceDemand.openQuestions).length > 0
          ? coerceStringArray(audienceDemand.openQuestions)
          : fallback.audienceDemand.openQuestions,
    },
    pricingStrategy: {
      comparableBookPricing: coerceString(
        pricingStrategy.comparableBookPricing,
        fallback.pricingStrategy.comparableBookPricing,
      ),
      costAnalysis: coerceString(
        pricingStrategy.costAnalysis,
        fallback.pricingStrategy.costAnalysis,
      ),
      pricingTiers:
        Array.isArray(pricingStrategy.pricingTiers) && pricingStrategy.pricingTiers.length > 0
          ? pricingStrategy.pricingTiers.map(normalizePricingTier)
          : fallback.pricingStrategy.pricingTiers,
      pricePositioning: coerceString(
        pricingStrategy.pricePositioning,
        fallback.pricingStrategy.pricePositioning,
      ),
      launchPricing: coerceString(
        pricingStrategy.launchPricing,
        fallback.pricingStrategy.launchPricing,
      ),
    },
    monetizationEcosystem: {
      directBookRevenue: coerceString(
        monetizationEcosystem.directBookRevenue,
        fallback.monetizationEcosystem.directBookRevenue,
      ),
      ancillaryProducts:
        Array.isArray(monetizationEcosystem.ancillaryProducts) &&
        monetizationEcosystem.ancillaryProducts.length > 0
          ? monetizationEcosystem.ancillaryProducts.map(normalizeAncillaryProduct)
          : fallback.monetizationEcosystem.ancillaryProducts,
      speakingAndAuthority: coerceString(
        monetizationEcosystem.speakingAndAuthority,
        fallback.monetizationEcosystem.speakingAndAuthority,
      ),
      consultingAndCoaching: coerceString(
        monetizationEcosystem.consultingAndCoaching,
        fallback.monetizationEcosystem.consultingAndCoaching,
      ),
      mediaAndLicensing: coerceString(
        monetizationEcosystem.mediaAndLicensing,
        fallback.monetizationEcosystem.mediaAndLicensing,
      ),
      contentAndCommunity: coerceString(
        monetizationEcosystem.contentAndCommunity,
        fallback.monetizationEcosystem.contentAndCommunity,
      ),
      totalEcosystemRevenueProjection: coerceString(
        monetizationEcosystem.totalEcosystemRevenueProjection,
        fallback.monetizationEcosystem.totalEcosystemRevenueProjection,
      ),
    },
    distributionAndLaunch: {
      publishingOptions: coerceString(
        distributionAndLaunch.publishingOptions,
        fallback.distributionAndLaunch.publishingOptions,
      ),
      distributionChannels:
        coerceStringArray(distributionAndLaunch.distributionChannels).length > 0
          ? coerceStringArray(distributionAndLaunch.distributionChannels)
          : fallback.distributionAndLaunch.distributionChannels,
      launchStrategy: coerceString(
        distributionAndLaunch.launchStrategy,
        fallback.distributionAndLaunch.launchStrategy,
      ),
      marketingChannels:
        coerceStringArray(distributionAndLaunch.marketingChannels).length > 0
          ? coerceStringArray(distributionAndLaunch.marketingChannels)
          : fallback.distributionAndLaunch.marketingChannels,
      yearOneDistributionMix: coerceString(
        distributionAndLaunch.yearOneDistributionMix,
        fallback.distributionAndLaunch.yearOneDistributionMix,
      ),
    },
    riskAssessment: {
      overallRiskProfile: normalizeRiskProfile(
        riskAssessment.overallRiskProfile,
        fallback.riskAssessment.overallRiskProfile,
      ),
      marketRisks:
        coerceStringArray(riskAssessment.marketRisks).length > 0
          ? coerceStringArray(riskAssessment.marketRisks)
          : fallback.riskAssessment.marketRisks,
      authorPlatformRisks:
        coerceStringArray(riskAssessment.authorPlatformRisks).length > 0
          ? coerceStringArray(riskAssessment.authorPlatformRisks)
          : fallback.riskAssessment.authorPlatformRisks,
      contentMessageRisks:
        coerceStringArray(riskAssessment.contentMessageRisks).length > 0
          ? coerceStringArray(riskAssessment.contentMessageRisks)
          : fallback.riskAssessment.contentMessageRisks,
      economicTimingRisks:
        coerceStringArray(riskAssessment.economicTimingRisks).length > 0
          ? coerceStringArray(riskAssessment.economicTimingRisks)
          : fallback.riskAssessment.economicTimingRisks,
      executionRisks:
        coerceStringArray(riskAssessment.executionRisks).length > 0
          ? coerceStringArray(riskAssessment.executionRisks)
          : fallback.riskAssessment.executionRisks,
      mitigationPlan:
        coerceStringArray(riskAssessment.mitigationPlan).length > 0
          ? coerceStringArray(riskAssessment.mitigationPlan)
          : fallback.riskAssessment.mitigationPlan,
      dealBreakers:
        coerceStringArray(riskAssessment.dealBreakers).length > 0
          ? coerceStringArray(riskAssessment.dealBreakers)
          : fallback.riskAssessment.dealBreakers,
    },
    successMetrics: {
      yearOneGoals:
        coerceStringArray(successMetrics.yearOneGoals).length > 0
          ? coerceStringArray(successMetrics.yearOneGoals)
          : fallback.successMetrics.yearOneGoals,
      keyPerformanceIndicators:
        coerceStringArray(successMetrics.keyPerformanceIndicators).length > 0
          ? coerceStringArray(successMetrics.keyPerformanceIndicators)
          : fallback.successMetrics.keyPerformanceIndicators,
      successDefinition: coerceString(
        successMetrics.successDefinition,
        fallback.successMetrics.successDefinition,
      ),
      milestones:
        coerceStringArray(successMetrics.milestones).length > 0
          ? coerceStringArray(successMetrics.milestones)
          : fallback.successMetrics.milestones,
    },
    financialProjections: {
      yearOneRevenue: coerceString(
        financialProjections.yearOneRevenue,
        fallback.financialProjections.yearOneRevenue,
      ),
      yearOneCosts: coerceString(
        financialProjections.yearOneCosts,
        fallback.financialProjections.yearOneCosts,
      ),
      profitabilityAnalysis: coerceString(
        financialProjections.profitabilityAnalysis,
        fallback.financialProjections.profitabilityAnalysis,
      ),
      yearsTwoToThreeProjection: coerceString(
        financialProjections.yearsTwoToThreeProjection,
        fallback.financialProjections.yearsTwoToThreeProjection,
      ),
      sensitivityAnalysis: coerceString(
        financialProjections.sensitivityAnalysis,
        fallback.financialProjections.sensitivityAnalysis,
      ),
    },
    goNoGoRecommendation: {
      marketValidation: coerceString(
        goNoGoRecommendation.marketValidation,
        fallback.goNoGoRecommendation.marketValidation,
      ),
      competitivePosition: coerceString(
        goNoGoRecommendation.competitivePosition,
        fallback.goNoGoRecommendation.competitivePosition,
      ),
      businessModelViability: coerceString(
        goNoGoRecommendation.businessModelViability,
        fallback.goNoGoRecommendation.businessModelViability,
      ),
      personalFit: coerceString(
        goNoGoRecommendation.personalFit,
        fallback.goNoGoRecommendation.personalFit,
      ),
      overallRecommendation: normalizeMarketDecision(
        goNoGoRecommendation.overallRecommendation,
        fallback.goNoGoRecommendation.overallRecommendation,
      ),
      conditions:
        coerceStringArray(goNoGoRecommendation.conditions).length > 0
          ? coerceStringArray(goNoGoRecommendation.conditions)
          : fallback.goNoGoRecommendation.conditions,
      nextSteps:
        coerceStringArray(goNoGoRecommendation.nextSteps).length > 0
          ? coerceStringArray(goNoGoRecommendation.nextSteps)
          : fallback.goNoGoRecommendation.nextSteps,
    },
    metadata: {
      createdAt: coerceString(metadata.createdAt, fallback.metadata?.createdAt ?? new Date().toISOString()),
      updatedAt: coerceString(metadata.updatedAt, fallback.metadata?.updatedAt ?? new Date().toISOString()),
      model: coerceString(metadata.model, fallback.metadata?.model ?? "legacy"),
      tokenUsage:
        normalizeTokenUsageMetadata(metadata.tokenUsage) ??
        fallback.metadata?.tokenUsage,
      grounding: {
        previousPhases:
          coerceStringArray(asRecord(metadata.grounding).previousPhases).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).previousPhases)
            : fallback.metadata?.grounding?.previousPhases ?? [],
        kbSources:
          coerceStringArray(asRecord(metadata.grounding).kbSources).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).kbSources)
            : fallback.metadata?.grounding?.kbSources ?? [],
        audienceSignals:
          coerceStringArray(asRecord(metadata.grounding).audienceSignals).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).audienceSignals)
            : fallback.metadata?.grounding?.audienceSignals ?? [],
      },
    },
  };

  return MarketReportSchema.parse(normalized);
}

function buildRecommendationsGroundingContext(
  promise: PromiseBrief,
  audienceResearch: AudienceResearchArtifact | undefined,
  deepProfiles: PersonaDeepProfile[] | undefined,
  simplePersonas: PersonaPack["personas"] | undefined,
  coreTruths: CoreTruthsArtifact | undefined,
  transformationArc: TransformationArtifact | undefined,
  marketReport: MarketReport,
  personaContexts: TruthPersonaContext[],
) {
  const base = buildMarketGroundingContext(
    promise,
    audienceResearch,
    deepProfiles,
    simplePersonas,
    coreTruths,
    transformationArc,
    personaContexts,
  );

  return {
    previousPhases: [...base.previousPhases, "Market"],
    audienceSignals: [
      ...base.audienceSignals,
      marketReport.executiveSummary.headline,
      marketReport.executiveSummary.rationale,
      ...marketReport.recommendations.slice(0, 3),
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, 12),
    promptPayload: {
      ...base.promptPayload,
      marketSummary: {
        headline: marketReport.executiveSummary.headline,
        overallRecommendation: marketReport.executiveSummary.overallRecommendation,
        rationale: marketReport.executiveSummary.rationale,
        strategicPriority: marketReport.executiveSummary.strategicPriority,
        category: marketReport.marketCategory,
        whiteSpace: marketReport.competitiveLandscape.marketPositioning.whiteSpace,
        attractionDrivers: marketReport.attractionDrivers,
        commercialRisks: marketReport.commercialRisks,
        competitiveAdvantage: marketReport.competitiveLandscape.competitiveAdvantage,
        goNoGoRecommendation: marketReport.goNoGoRecommendation,
        distributionAndLaunch: marketReport.distributionAndLaunch,
        monetizationEcosystem: marketReport.monetizationEcosystem,
      },
      instruction:
        "Synthesize the research into a recommendations blueprint. Every recommendation should map back to the approved Promise, Audience, Truth, Transformation, and Market work.",
    },
  };
}

function normalizeRecommendationsPersonaStrategy(
  value: unknown,
  index: number,
  fallbackName: string,
): PositioningRecommendations["personaStrategies"][number] {
  const raw = asRecord(value);
  return {
    personaName: coerceString(raw.personaName, fallbackName || `Persona ${index + 1}`),
    primaryPositioning: coerceString(
      raw.primaryPositioning,
      "Position the book around the persona's most urgent live problem.",
    ),
    keyMessage: coerceString(raw.keyMessage, "Lead with the clearest problem-solution reframe."),
    whereToReachThem: coerceStringArray(raw.whereToReachThem),
    priceSensitivity: coerceString(
      raw.priceSensitivity,
      "Responsive to clear value at book-level pricing; higher-value offers require visible ROI.",
    ),
    contentFormatPreference: coerceString(
      raw.contentFormatPreference,
      "Practical frameworks, examples, and implementation guidance.",
    ),
    trustedInfluencers: coerceStringArray(raw.trustedInfluencers),
    launchStrategy: coerceString(
      raw.launchStrategy,
      "Reach them where they already look for role-relevant insight and proof.",
    ),
  };
}

function normalizeRecommendationsRisk(
  value: unknown,
  index: number,
): PositioningRecommendations["riskMitigationRecommendations"][number] {
  const raw = asRecord(value);
  return {
    risk: coerceString(raw.risk, `Risk ${index + 1}`),
    mitigationStrategy: coerceString(
      raw.mitigationStrategy,
      "Create a concrete mitigation plan tied to positioning, audience, and execution.",
    ),
    whatToMonitor: coerceString(
      raw.whatToMonitor,
      "Monitor the leading indicators that show whether the strategy is working.",
    ),
    pivotPoint: coerceString(
      raw.pivotPoint,
      "Define a clear threshold at which the strategy should be adjusted.",
    ),
  };
}

function normalizeRecommendationsArtifact(
  raw: unknown,
  promise: PromiseBrief,
  marketReport: MarketReport,
  personaContexts: TruthPersonaContext[],
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
): PositioningRecommendations {
  const fallback = fallbackRecommendations(
    promise,
    marketReport,
    personaContexts,
    coreTruths,
    transformationArc,
  );
  const record = asRecord(raw);
  const bookStrategy = asRecord(record.bookStrategy);
  const positioningAndMarketing = asRecord(record.positioningAndMarketing);
  const launchAndGoToMarket = asRecord(record.launchAndGoToMarket);
  const crossPersonaMessaging = asRecord(record.crossPersonaMessaging);
  const monetizationRecommendations = asRecord(record.monetizationRecommendations);
  const teamAndResources = asRecord(record.teamAndResources);
  const successMetricsAndKpis = asRecord(record.successMetricsAndKpis);
  const financialRecommendations = asRecord(record.financialRecommendations);
  const finalRecommendation = asRecord(record.finalRecommendation);
  const metadata = asRecord(record.metadata);
  const rawPersonaStrategies = Array.isArray(record.personaStrategies)
    ? record.personaStrategies
    : [];
  const rawRiskMitigation = Array.isArray(record.riskMitigationRecommendations)
    ? record.riskMitigationRecommendations
    : [];

  return PositioningRecommendationsSchema.parse({
    summary: coerceString(record.summary, fallback.summary),
    recommendations:
      coerceStringArray(record.recommendations).length > 0
        ? coerceStringArray(record.recommendations)
        : fallback.recommendations,
    bookStrategy: {
      coreMessagePositioning: coerceString(
        bookStrategy.coreMessagePositioning,
        fallback.bookStrategy.coreMessagePositioning,
      ),
      audienceTargeting: coerceString(
        bookStrategy.audienceTargeting,
        fallback.bookStrategy.audienceTargeting,
      ),
      contentDepthAndBreadth: coerceString(
        bookStrategy.contentDepthAndBreadth,
        fallback.bookStrategy.contentDepthAndBreadth,
      ),
      lengthAndStructure: coerceString(
        bookStrategy.lengthAndStructure,
        fallback.bookStrategy.lengthAndStructure,
      ),
      voiceAndToneRecommendations: coerceString(
        bookStrategy.voiceAndToneRecommendations,
        fallback.bookStrategy.voiceAndToneRecommendations,
      ),
      differentiationStrategy: coerceString(
        bookStrategy.differentiationStrategy,
        fallback.bookStrategy.differentiationStrategy,
      ),
    },
    positioningAndMarketing: {
      marketPositioningStatement: coerceString(
        positioningAndMarketing.marketPositioningStatement,
        fallback.positioningAndMarketing.marketPositioningStatement,
      ),
      keyDifferentiators:
        coerceStringArray(positioningAndMarketing.keyDifferentiators).length > 0
          ? coerceStringArray(positioningAndMarketing.keyDifferentiators)
          : fallback.positioningAndMarketing.keyDifferentiators,
      targetCustomerProfile: coerceString(
        positioningAndMarketing.targetCustomerProfile,
        fallback.positioningAndMarketing.targetCustomerProfile,
      ),
      positioningByChannel:
        coerceStringArray(positioningAndMarketing.positioningByChannel).length > 0
          ? coerceStringArray(positioningAndMarketing.positioningByChannel)
          : fallback.positioningAndMarketing.positioningByChannel,
      messagingFramework:
        coerceStringArray(positioningAndMarketing.messagingFramework).length > 0
          ? coerceStringArray(positioningAndMarketing.messagingFramework)
          : fallback.positioningAndMarketing.messagingFramework,
      competitivePositioningQuadrant: coerceString(
        positioningAndMarketing.competitivePositioningQuadrant,
        fallback.positioningAndMarketing.competitivePositioningQuadrant,
      ),
    },
    launchAndGoToMarket: {
      publishingPathRecommendation: coerceString(
        launchAndGoToMarket.publishingPathRecommendation,
        fallback.launchAndGoToMarket.publishingPathRecommendation,
      ),
      launchTimeline: coerceString(
        launchAndGoToMarket.launchTimeline,
        fallback.launchAndGoToMarket.launchTimeline,
      ),
      preLaunchActivities:
        coerceStringArray(launchAndGoToMarket.preLaunchActivities).length > 0
          ? coerceStringArray(launchAndGoToMarket.preLaunchActivities)
          : fallback.launchAndGoToMarket.preLaunchActivities,
      launchActivities:
        coerceStringArray(launchAndGoToMarket.launchActivities).length > 0
          ? coerceStringArray(launchAndGoToMarket.launchActivities)
          : fallback.launchAndGoToMarket.launchActivities,
      postLaunchActivities:
        coerceStringArray(launchAndGoToMarket.postLaunchActivities).length > 0
          ? coerceStringArray(launchAndGoToMarket.postLaunchActivities)
          : fallback.launchAndGoToMarket.postLaunchActivities,
      distributionChannelPriorities:
        coerceStringArray(launchAndGoToMarket.distributionChannelPriorities).length > 0
          ? coerceStringArray(launchAndGoToMarket.distributionChannelPriorities)
          : fallback.launchAndGoToMarket.distributionChannelPriorities,
      marketingBudgetAllocation: coerceString(
        launchAndGoToMarket.marketingBudgetAllocation,
        fallback.launchAndGoToMarket.marketingBudgetAllocation,
      ),
    },
    personaStrategies:
      rawPersonaStrategies.length > 0
        ? rawPersonaStrategies.map((item, index) =>
            normalizeRecommendationsPersonaStrategy(
              item,
              index,
              personaContexts[index]?.name ?? `Persona ${index + 1}`,
            ),
          )
        : fallback.personaStrategies,
    crossPersonaMessaging: {
      sharedMessaging:
        coerceStringArray(crossPersonaMessaging.sharedMessaging).length > 0
          ? coerceStringArray(crossPersonaMessaging.sharedMessaging)
          : fallback.crossPersonaMessaging.sharedMessaging,
      personaSpecificMessaging:
        coerceStringArray(crossPersonaMessaging.personaSpecificMessaging).length > 0
          ? coerceStringArray(crossPersonaMessaging.personaSpecificMessaging)
          : fallback.crossPersonaMessaging.personaSpecificMessaging,
      avoidAlienating: coerceString(
        crossPersonaMessaging.avoidAlienating,
        fallback.crossPersonaMessaging.avoidAlienating,
      ),
    },
    monetizationRecommendations: {
      bookPricingRecommendation: coerceString(
        monetizationRecommendations.bookPricingRecommendation,
        fallback.monetizationRecommendations.bookPricingRecommendation,
      ),
      ancillaryProductRecommendations:
        coerceStringArray(monetizationRecommendations.ancillaryProductRecommendations).length > 0
          ? coerceStringArray(monetizationRecommendations.ancillaryProductRecommendations)
          : fallback.monetizationRecommendations.ancillaryProductRecommendations,
      ecosystemBuildOutTimeline:
        coerceStringArray(monetizationRecommendations.ecosystemBuildOutTimeline).length > 0
          ? coerceStringArray(monetizationRecommendations.ecosystemBuildOutTimeline)
          : fallback.monetizationRecommendations.ecosystemBuildOutTimeline,
      revenueModelRecommendation: coerceString(
        monetizationRecommendations.revenueModelRecommendation,
        fallback.monetizationRecommendations.revenueModelRecommendation,
      ),
      pricingStrategyByChannel:
        coerceStringArray(monetizationRecommendations.pricingStrategyByChannel).length > 0
          ? coerceStringArray(monetizationRecommendations.pricingStrategyByChannel)
          : fallback.monetizationRecommendations.pricingStrategyByChannel,
    },
    teamAndResources: {
      writingSupport: coerceString(
        teamAndResources.writingSupport,
        fallback.teamAndResources.writingSupport,
      ),
      designAndProduction: coerceString(
        teamAndResources.designAndProduction,
        fallback.teamAndResources.designAndProduction,
      ),
      marketingAndLaunchSupport: coerceString(
        teamAndResources.marketingAndLaunchSupport,
        fallback.teamAndResources.marketingAndLaunchSupport,
      ),
      platformAndTools: coerceString(
        teamAndResources.platformAndTools,
        fallback.teamAndResources.platformAndTools,
      ),
      teamCompositionRecommendation: coerceString(
        teamAndResources.teamCompositionRecommendation,
        fallback.teamAndResources.teamCompositionRecommendation,
      ),
      timelineAndMilestones:
        coerceStringArray(teamAndResources.timelineAndMilestones).length > 0
          ? coerceStringArray(teamAndResources.timelineAndMilestones)
          : fallback.teamAndResources.timelineAndMilestones,
    },
    riskMitigationRecommendations:
      rawRiskMitigation.length > 0
        ? rawRiskMitigation.map(normalizeRecommendationsRisk)
        : fallback.riskMitigationRecommendations,
    successMetricsAndKpis: {
      yearOneSuccessTargets:
        coerceStringArray(successMetricsAndKpis.yearOneSuccessTargets).length > 0
          ? coerceStringArray(successMetricsAndKpis.yearOneSuccessTargets)
          : fallback.successMetricsAndKpis.yearOneSuccessTargets,
      monthlyKpis:
        coerceStringArray(successMetricsAndKpis.monthlyKpis).length > 0
          ? coerceStringArray(successMetricsAndKpis.monthlyKpis)
          : fallback.successMetricsAndKpis.monthlyKpis,
      dashboardMetrics:
        coerceStringArray(successMetricsAndKpis.dashboardMetrics).length > 0
          ? coerceStringArray(successMetricsAndKpis.dashboardMetrics)
          : fallback.successMetricsAndKpis.dashboardMetrics,
      successMilestones:
        coerceStringArray(successMetricsAndKpis.successMilestones).length > 0
          ? coerceStringArray(successMetricsAndKpis.successMilestones)
          : fallback.successMetricsAndKpis.successMilestones,
      pivotingCriteria:
        coerceStringArray(successMetricsAndKpis.pivotingCriteria).length > 0
          ? coerceStringArray(successMetricsAndKpis.pivotingCriteria)
          : fallback.successMetricsAndKpis.pivotingCriteria,
    },
    financialRecommendations: {
      investmentRequired: coerceString(
        financialRecommendations.investmentRequired,
        fallback.financialRecommendations.investmentRequired,
      ),
      revenueProjections: coerceString(
        financialRecommendations.revenueProjections,
        fallback.financialRecommendations.revenueProjections,
      ),
      profitabilityTimeline: coerceString(
        financialRecommendations.profitabilityTimeline,
        fallback.financialRecommendations.profitabilityTimeline,
      ),
      pricingSummary:
        coerceStringArray(financialRecommendations.pricingSummary).length > 0
          ? coerceStringArray(financialRecommendations.pricingSummary)
          : fallback.financialRecommendations.pricingSummary,
      budgetAllocationRecommendation: coerceString(
        financialRecommendations.budgetAllocationRecommendation,
        fallback.financialRecommendations.budgetAllocationRecommendation,
      ),
    },
    finalRecommendation: {
      overallRecommendation: normalizeMarketDecision(
        finalRecommendation.overallRecommendation,
        fallback.finalRecommendation.overallRecommendation,
      ),
      rationale: coerceString(
        finalRecommendation.rationale,
        fallback.finalRecommendation.rationale,
      ),
      strategicDirection: coerceString(
        finalRecommendation.strategicDirection,
        fallback.finalRecommendation.strategicDirection,
      ),
      criticalSuccessFactors:
        coerceStringArray(finalRecommendation.criticalSuccessFactors).length > 0
          ? coerceStringArray(finalRecommendation.criticalSuccessFactors)
          : fallback.finalRecommendation.criticalSuccessFactors,
      immediateNextSteps:
        coerceStringArray(finalRecommendation.immediateNextSteps).length > 0
          ? coerceStringArray(finalRecommendation.immediateNextSteps)
          : fallback.finalRecommendation.immediateNextSteps,
      goNoGoGates:
        coerceStringArray(finalRecommendation.goNoGoGates).length > 0
          ? coerceStringArray(finalRecommendation.goNoGoGates)
          : fallback.finalRecommendation.goNoGoGates,
      contingencyPlanning:
        coerceStringArray(finalRecommendation.contingencyPlanning).length > 0
          ? coerceStringArray(finalRecommendation.contingencyPlanning)
          : fallback.finalRecommendation.contingencyPlanning,
    },
    metadata: {
      createdAt: coerceString(metadata.createdAt, fallback.metadata?.createdAt ?? new Date().toISOString()),
      updatedAt: coerceString(metadata.updatedAt, fallback.metadata?.updatedAt ?? new Date().toISOString()),
      model: coerceString(metadata.model, fallback.metadata?.model ?? "legacy"),
      tokenUsage:
        normalizeTokenUsageMetadata(metadata.tokenUsage) ??
        fallback.metadata?.tokenUsage,
      grounding: {
        previousPhases:
          coerceStringArray(asRecord(metadata.grounding).previousPhases).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).previousPhases)
            : fallback.metadata?.grounding?.previousPhases ?? [],
        kbSources:
          coerceStringArray(asRecord(metadata.grounding).kbSources).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).kbSources)
            : fallback.metadata?.grounding?.kbSources ?? [],
        audienceSignals:
          coerceStringArray(asRecord(metadata.grounding).audienceSignals).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).audienceSignals)
            : fallback.metadata?.grounding?.audienceSignals ?? [],
      },
    },
  });
}

function toTitlePhrase(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9\s:&/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return fallback;
  }

  const words = cleaned
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .map((word) =>
      word.length <= 3 && word === word.toLowerCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    );

  return words.length >= 2 ? words.join(" ") : fallback;
}

function getSelectedTitleSubtitle(
  promise: PromiseBrief,
  bookSetupProfile?: BookSetupProfile | null,
  titleSubtitleFinalization?: TitleSubtitleFinalization,
) {
  const title =
    titleSubtitleFinalization?.finalizedTitle?.trim() ||
    bookSetupProfile?.workingTitle ||
    promise.workingTitle ||
    "Untitled Book";
  const subtitle =
    titleSubtitleFinalization?.finalizedSubtitle?.trim() ||
    bookSetupProfile?.subtitle ||
    `${promise.readerDesire || "A practical framework for better results"} for ${promise.audiencePrimary || "serious readers"}`;

  return {
    title,
    subtitle,
  };
}

function createFallbackTitleSubtitleFinalization(
  promise: PromiseBrief,
  marketReport: MarketReport,
  recommendations: PositioningRecommendations,
  personaContexts: TruthPersonaContext[],
  audienceResearch?: AudienceResearchArtifact,
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
  bookSetupProfile?: BookSetupProfile | null,
): TitleSubtitleFinalization {
  const audienceProfiles = buildBookPitchAudienceProfiles(
    audienceResearch,
    audienceResearch?.phase2?.personas,
    personaContexts,
    recommendations,
  );
  const primaryAudienceLabel =
    audienceProfiles[0]?.label || promise.audiencePrimary || "the primary reader";
  const coreMechanism =
    coreTruths?.coreInsight.coreTruth ||
    transformationArc?.arc.stage3Truth.coreTruth ||
    promise.coreTruth ||
    promise.bigIdea ||
    "a better operating model";
  const { title: selectedTitle } = getSelectedTitleSubtitle(
    promise,
    bookSetupProfile,
    undefined,
  );
  const derivedSubtitle =
    bookSetupProfile?.subtitle?.trim() ||
    `A Practical Framework for ${primaryAudienceLabel} to ${(
      promise.readerDesire ||
      transformationArc?.arc.stage4You.firstAction ||
      "create better outcomes"
    )
      .replace(/\.$/, "")
      .trim()}`;

  const alternativeCoreTruthTitle = toTitlePhrase(coreMechanism, selectedTitle);
  const alternativeOutcomeTitle = toTitlePhrase(
    promise.transformationAfter || promise.readerDesire || selectedTitle,
    selectedTitle,
  );

  return TitleSubtitleFinalizationSchema.parse({
    finalizedTitle: selectedTitle,
    finalizedSubtitle: derivedSubtitle,
    positioningHook:
      recommendations.positioningAndMarketing.marketPositioningStatement ||
      recommendations.bookStrategy.coreMessagePositioning,
    titleRationale:
      selectedTitle === (bookSetupProfile?.workingTitle || promise.workingTitle)
        ? `Keep "${selectedTitle}" because it already carries recognition inside the project and can still work commercially when paired with a sharper subtitle and positioning hook.`
        : `Use "${selectedTitle}" because it is shorter, clearer, and better aligned with the book's central reframe around ${coreMechanism.toLowerCase()}.`,
    subtitleRationale: `Use the subtitle to name the audience (${primaryAudienceLabel}), the promise (${promise.readerDesire || promise.transformationAfter}), and the practical mechanism (${coreMechanism}).`,
    audienceFit: `The package should signal relevance to ${primaryAudienceLabel} while still leaving room for adjacent audiences identified in the Audience work.`,
    marketFit: `This direction fits the market white space around ${marketReport.competitiveLandscape.marketPositioning.whiteSpace.toLowerCase()} and supports the positioning recommendation to ${recommendations.bookStrategy.differentiationStrategy.toLowerCase()}.`,
    alternatives: [
      {
        title: selectedTitle,
        subtitle: derivedSubtitle,
        whyItCouldWork: "Keeps continuity with the current concept while making the commercial promise clearer.",
      },
      {
        title: alternativeCoreTruthTitle,
        subtitle: `Why ${primaryAudienceLabel} Need ${coreMechanism.replace(/\.$/, "")}`,
        whyItCouldWork: "Leans more heavily into the core reframe and may feel stronger if the market responds to the paradox itself.",
      },
      {
        title: alternativeOutcomeTitle,
        subtitle: `How ${primaryAudienceLabel} Can ${(
          promise.readerDesire ||
          promise.transformationAfter ||
          "produce better outcomes"
        ).replace(/\.$/, "")}`,
        whyItCouldWork: "Leads with the result, which can improve clarity if outcome-driven positioning proves more compelling than concept-led positioning.",
      },
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: "fallback",
    },
  });
}

function normalizeTitleSubtitleFinalization(
  raw: unknown,
  fallback: TitleSubtitleFinalization,
): TitleSubtitleFinalization {
  const record = asRecord(raw);
  const metadata = asRecord(record.metadata);
  const alternativesRaw = Array.isArray(record.alternatives) ? record.alternatives : [];

  return TitleSubtitleFinalizationSchema.parse({
    finalizedTitle: coerceString(record.finalizedTitle, fallback.finalizedTitle),
    finalizedSubtitle: coerceString(record.finalizedSubtitle, fallback.finalizedSubtitle),
    positioningHook: coerceString(record.positioningHook, fallback.positioningHook),
    titleRationale: coerceString(record.titleRationale, fallback.titleRationale),
    subtitleRationale: coerceString(record.subtitleRationale, fallback.subtitleRationale),
    audienceFit: coerceString(record.audienceFit, fallback.audienceFit),
    marketFit: coerceString(record.marketFit, fallback.marketFit),
    alternatives:
      alternativesRaw.length > 0
        ? alternativesRaw.map((item, index) => {
            const alternative = asRecord(item);
            return {
              title: coerceString(
                alternative.title,
                fallback.alternatives[index]?.title || fallback.finalizedTitle,
              ),
              subtitle: coerceString(
                alternative.subtitle,
                fallback.alternatives[index]?.subtitle || fallback.finalizedSubtitle,
              ),
              whyItCouldWork: coerceString(
                alternative.whyItCouldWork,
                fallback.alternatives[index]?.whyItCouldWork ||
                  "Provides a viable alternative positioning package.",
              ),
            };
          })
        : fallback.alternatives,
    metadata: {
      createdAt: coerceString(
        metadata.createdAt,
        fallback.metadata?.createdAt ?? new Date().toISOString(),
      ),
      updatedAt: coerceString(
        metadata.updatedAt,
        fallback.metadata?.updatedAt ?? new Date().toISOString(),
      ),
      model: coerceString(metadata.model, fallback.metadata?.model ?? "legacy"),
      grounding: {
        previousPhases:
          coerceStringArray(asRecord(metadata.grounding).previousPhases).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).previousPhases)
            : fallback.metadata?.grounding?.previousPhases ?? [],
        kbSources:
          coerceStringArray(asRecord(metadata.grounding).kbSources).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).kbSources)
            : fallback.metadata?.grounding?.kbSources ?? [],
        audienceSignals:
          coerceStringArray(asRecord(metadata.grounding).audienceSignals).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).audienceSignals)
            : fallback.metadata?.grounding?.audienceSignals ?? [],
      },
    },
  });
}

function summarizeVoiceBlendForPitch(bookSetupProfile?: BookSetupProfile | null): string {
  const blend = bookSetupProfile?.writerPersonaBlend ?? [];
  if (blend.length > 0) {
    return blend
      .slice(0, 3)
      .map((persona) => `${persona.personaName}: ${persona.percentInfluence}%`)
      .join(" | ");
  }

  if (bookSetupProfile?.writerPersona) {
    return bookSetupProfile.writerPersona;
  }

  return "Practical, strategic, and credible nonfiction voice";
}

type PitchAudienceProfile = {
  label: string;
  description: string;
  roleContext: string;
  primaryPainPoint: string;
  whyThisBook: string;
  keySignals: string[];
  voiceBlendResonance: string;
};

function createRoleBasedAudienceLabel(
  persona: PersonaDeepProfile,
  fallbackIndex: number,
): string {
  const role = persona.demographics.role?.trim();
  const companyType = persona.demographics.companyType?.trim();

  if (role && companyType) {
    return `${role} in ${companyType}`;
  }

  if (role) {
    return role;
  }

  if (companyType) {
    return `Leader in ${companyType}`;
  }

  return `Audience Segment ${fallbackIndex + 1}`;
}

function buildBookPitchAudienceProfiles(
  audienceResearch: AudienceResearchArtifact | undefined,
  deepProfiles: PersonaDeepProfile[] | undefined,
  personaContexts: TruthPersonaContext[],
  recommendations: PositioningRecommendations,
): PitchAudienceProfile[] {
  const userTypes = audienceResearch?.phase1.identifiedUserTypes ?? [];

  if ((deepProfiles ?? []).length > 0) {
    return (deepProfiles ?? []).slice(0, 3).map((persona, index) => ({
      label:
        userTypes[index]?.name?.trim() ||
        createRoleBasedAudienceLabel(persona, index),
      description:
        userTypes[index]?.description?.trim() ||
        `${persona.demographics.role} navigating ${persona.currentSituation.biggestFrustration.toLowerCase()}`,
      roleContext: [
        persona.demographics.role,
        persona.demographics.companyType,
        `${persona.demographics.yearsInRole} years in role`,
      ]
        .filter(Boolean)
        .join(" | "),
      primaryPainPoint:
        persona.currentSituation.biggestFrustration ||
        personaContexts[index]?.dilemma ||
        "They are facing a costly recurring leadership and execution problem.",
      whyThisBook:
        recommendations.personaStrategies[index]?.primaryPositioning ||
        personaContexts[index]?.dilemma ||
        "The book gives them a clearer operating model and a practical path forward.",
      keySignals: [
        ...(userTypes[index]?.details ?? []).slice(0, 2),
        ...persona.goals.slice(0, 2).map((goal) => goal.goal),
      ]
        .filter(Boolean)
        .slice(0, 4),
      voiceBlendResonance: [
        persona.voiceBlendFit.primary,
        persona.voiceBlendFit.secondary,
        persona.voiceBlendFit.reasoning,
      ]
        .filter(Boolean)
        .join(" | "),
    }));
  }

  if (userTypes.length > 0) {
    return userTypes.slice(0, 3).map((type, index) => ({
      label: type.name.trim() || `Audience Segment ${index + 1}`,
      description: type.description.trim(),
      roleContext: type.details.slice(0, 3).join(" | "),
      primaryPainPoint:
        type.details[0] ||
        personaContexts[index]?.dilemma ||
        "They know something is not working, but they do not yet have a better model.",
      whyThisBook:
        recommendations.personaStrategies[index]?.primaryPositioning ||
        personaContexts[index]?.dilemma ||
        "The book helps them diagnose the problem correctly and act with more confidence.",
      keySignals: type.details.slice(0, 4),
      voiceBlendResonance:
        recommendations.personaStrategies[index]?.keyMessage ||
        personaContexts[index]?.voiceHint ||
        "Practical and strategic guidance",
    }));
  }

  return personaContexts.slice(0, 3).map((persona, index) => ({
    label: promiseCaseLabel(persona.context, index),
    description: persona.context,
    roleContext: persona.context,
    primaryPainPoint: persona.dilemma,
    whyThisBook:
      recommendations.personaStrategies[index]?.primaryPositioning ||
      persona.dilemma,
    keySignals: [persona.dilemma],
    voiceBlendResonance: persona.voiceHint,
  }));
}

function promiseCaseLabel(context: string, index: number): string {
  const clean = context
    .split(/[.;|]/)[0]
    ?.trim()
    .replace(/\s+/g, " ");

  return clean && clean.length > 0 ? clean : `Audience Segment ${index + 1}`;
}

function summarizeBookPitchTargetAudience(
  audienceProfiles: PitchAudienceProfile[],
  promise: PromiseBrief,
): string {
  if (audienceProfiles.length === 0) {
    return promise.audiencePrimary || "Primary reader in progress";
  }

  const primary = audienceProfiles[0];
  const secondary = audienceProfiles.slice(1, 3).map((profile) => profile.label);

  if (secondary.length === 0) {
    return `${primary.label}: ${primary.description}`;
  }

  return `${primary.label}: ${primary.description}. Secondary audiences include ${secondary.join(" and ")}.`;
}

function renderMarkdownBulletList(items: string[], fallback: string): string {
  const usable = items
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (usable.length === 0) {
    return `- ${fallback}`;
  }

  return usable.map((item) => `- ${item}`).join("\n");
}

function renderMarkdownNumberedList(items: string[], fallback: string): string {
  const usable = items
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (usable.length === 0) {
    return `1. ${fallback}`;
  }

  return usable.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

async function generateBookPitchMarkdownInSections(params: {
  model: NonNullable<Awaited<ReturnType<typeof getBookPitchModel>>>;
  systemPrompt: string;
  promptPayload: Record<string, unknown>;
}): Promise<{ markdown: string; tokenUsage?: PromiseTokenUsage }> {
  const sections: string[] = [];
  const usageItems: PromiseTokenUsage[] = [];

  for (const plan of BOOK_PITCH_SECTION_PLANS) {
    const response = await withTimeout(
      params.model.invoke([
        new SystemMessage(`${params.systemPrompt}

Generate ONLY these sections, in this exact order:
${plan.headings.map((heading, index) => `${index + 1}. ${heading}`).join("\n")}

Additional guidance:
- ${plan.guidance}
- Use the supplied template labels and subsection structure wherever relevant inside these sections.
- Write a full proposal-quality draft, not a terse summary.
- Do not include sections outside this list.
- Start with the first heading in this cluster and stop after the last heading in this cluster.`),
        new HumanMessage(
          JSON.stringify({
            ...params.promptPayload,
            sectionCluster: {
              key: plan.key,
              headings: plan.headings,
              guidance: plan.guidance,
            },
          }),
        ),
      ]),
      180000,
      `Book pitch ${plan.key} generation timed out after 180 seconds`,
    );

    const text = extractTextFromResponse(response).trim();
    const tokenUsage = normalizeTokenUsageMetadata(getUsageMetadata(response));
    if (!text) {
      throw new Error(`Book pitch ${plan.key} generation returned empty content`);
    }

    if (tokenUsage) {
      usageItems.push(tokenUsage);
    }
    sections.push(text);
  }

  const combinedUsage = usageItems.length
    ? usageItems.reduce<PromiseTokenUsage>(
        (accumulator, usage) => ({
          inputTokens: (accumulator.inputTokens ?? 0) + (usage.inputTokens ?? 0),
          outputTokens: (accumulator.outputTokens ?? 0) + (usage.outputTokens ?? 0),
          totalTokens: (accumulator.totalTokens ?? 0) + (usage.totalTokens ?? 0),
          cacheReadInputTokens:
            (accumulator.cacheReadInputTokens ?? 0) + (usage.cacheReadInputTokens ?? 0),
          cacheWriteInputTokens:
            (accumulator.cacheWriteInputTokens ?? 0) + (usage.cacheWriteInputTokens ?? 0),
          reasoningTokens: (accumulator.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0),
        }),
        {},
      )
    : undefined;

  return {
    markdown: sections.join("\n\n"),
    tokenUsage: combinedUsage,
  };
}

function buildTitleSubtitleGroundingContext(
  promise: PromiseBrief,
  audienceResearch: AudienceResearchArtifact | undefined,
  deepProfiles: PersonaDeepProfile[] | undefined,
  simplePersonas: PersonaPack["personas"] | undefined,
  coreTruths: CoreTruthsArtifact | undefined,
  transformationArc: TransformationArtifact | undefined,
  marketReport: MarketReport,
  recommendations: PositioningRecommendations,
  personaContexts: TruthPersonaContext[],
  bookSetupProfile?: BookSetupProfile | null,
) {
  const audienceProfiles = buildBookPitchAudienceProfiles(
    audienceResearch,
    deepProfiles,
    personaContexts,
    recommendations,
  );
  const existing = getSelectedTitleSubtitle(promise, bookSetupProfile, undefined);
  const base = buildRecommendationsGroundingContext(
    promise,
    audienceResearch,
    deepProfiles,
    simplePersonas,
    coreTruths,
    transformationArc,
    marketReport,
    personaContexts,
  );

  return {
    previousPhases: [...base.previousPhases, "Recommendations"],
    audienceSignals: [
      ...base.audienceSignals,
      ...audienceProfiles.slice(0, 3).map((profile) => profile.label),
      recommendations.positioningAndMarketing.marketPositioningStatement,
      marketReport.competitiveLandscape.marketPositioning.whiteSpace,
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, 14),
    promptPayload: {
      existingTitle: existing.title,
      existingSubtitle: existing.subtitle,
      promise: {
        workingTitle: promise.workingTitle,
        promiseStatement: promise.promiseStatement,
        bigIdea: promise.bigIdea,
        coreTruth: promise.coreTruth,
        readerProblem: promise.readerProblem,
        readerDesire: promise.readerDesire,
        differentiation: promise.differentiation,
      },
      audience: {
        primaryAudience: summarizeBookPitchTargetAudience(audienceProfiles, promise),
        segments: audienceProfiles.slice(0, 3).map((profile) => ({
          label: profile.label,
          description: profile.description,
          roleContext: profile.roleContext,
          primaryPainPoint: profile.primaryPainPoint,
          whyThisBook: profile.whyThisBook,
        })),
      },
      truth: coreTruths
        ? {
            coreTruth: coreTruths.coreInsight.coreTruth,
            paradox: coreTruths.paradox.whatMakesThisSurprising,
            completeTruth: coreTruths.completeTruth,
          }
        : undefined,
      transformation: transformationArc
        ? {
            sharedProblem: transformationArc.arc.stage2We.sharedProblem,
            coreTruth: transformationArc.arc.stage3Truth.coreTruth,
            transformedSuccess: transformationArc.arc.stage5FinalWe.transformedSuccess,
          }
        : undefined,
      market: {
        whiteSpace: marketReport.competitiveLandscape.marketPositioning.whiteSpace,
        directCompetitors: marketReport.competitiveLandscape.directCompetitors
          .slice(0, 3)
          .map((competitor) => ({
            title: competitor.title,
            positioning: competitor.positioning,
            targetAudience: competitor.targetAudience,
            differenceOpportunity: competitor.differenceOpportunity,
          })),
      },
      recommendations: {
        coreMessagePositioning: recommendations.bookStrategy.coreMessagePositioning,
        audienceTargeting: recommendations.bookStrategy.audienceTargeting,
        differentiationStrategy: recommendations.bookStrategy.differentiationStrategy,
        marketPositioningStatement:
          recommendations.positioningAndMarketing.marketPositioningStatement,
        keyDifferentiators:
          recommendations.positioningAndMarketing.keyDifferentiators.slice(0, 5),
        messagingFramework:
          recommendations.positioningAndMarketing.messagingFramework.slice(0, 5),
      },
      instruction:
        "Finalize the strongest title/subtitle package now so the downstream Book Pitch inherits a clear, market-aware direction.",
    },
  };
}

function buildBookPitchGroundingContext(
  promise: PromiseBrief,
  audienceResearch: AudienceResearchArtifact | undefined,
  deepProfiles: PersonaDeepProfile[] | undefined,
  simplePersonas: PersonaPack["personas"] | undefined,
  coreTruths: CoreTruthsArtifact | undefined,
  transformationArc: TransformationArtifact | undefined,
  marketReport: MarketReport,
  recommendations: PositioningRecommendations,
  personaContexts: TruthPersonaContext[],
  bookSetupProfile?: BookSetupProfile | null,
  titleSubtitleFinalization?: TitleSubtitleFinalization,
) {
  const audienceProfiles = buildBookPitchAudienceProfiles(
    audienceResearch,
    deepProfiles,
    personaContexts,
    recommendations,
  );
  const targetAudience = summarizeBookPitchTargetAudience(audienceProfiles, promise);
  const selectedTitlePackage = getSelectedTitleSubtitle(
    promise,
    bookSetupProfile,
    titleSubtitleFinalization,
  );
  const base = buildRecommendationsGroundingContext(
    promise,
    audienceResearch,
    deepProfiles,
    simplePersonas,
    coreTruths,
    transformationArc,
    marketReport,
    personaContexts,
  );

  return {
    previousPhases: [...base.previousPhases, "Recommendations"],
    audienceSignals: [
      ...base.audienceSignals,
      recommendations.summary,
      recommendations.bookStrategy.audienceTargeting,
      recommendations.positioningAndMarketing.marketPositioningStatement,
      recommendations.finalRecommendation.rationale,
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, 14),
    promptPayload: {
      promise: {
        workingTitle: promise.workingTitle,
        audiencePrimary: promise.audiencePrimary,
        audienceSecondary: promise.audienceSecondary,
        category: promise.category,
        readerProblem: promise.readerProblem,
        readerDesire: promise.readerDesire,
        bigIdea: promise.bigIdea,
        coreTruth: promise.coreTruth,
        promiseStatement: promise.promiseStatement,
        differentiation: promise.differentiation,
        stakes: promise.stakes,
        transformationBefore: promise.transformationBefore,
        transformationAfter: promise.transformationAfter,
      },
      bookSetup: {
        workingTitle: selectedTitlePackage.title,
        subtitle: selectedTitlePackage.subtitle,
        targetWordCount: bookSetupProfile?.targetWordCount ?? null,
        trimSize: bookSetupProfile?.trimSize ?? null,
        outputFormats: bookSetupProfile?.outputFormats ?? [],
        voiceBlend: summarizeVoiceBlendForPitch(bookSetupProfile),
        notesToSystem: (bookSetupProfile?.notesToSystem ?? []).slice(0, 5),
      },
      titleFinalization: titleSubtitleFinalization
        ? {
            finalizedTitle: titleSubtitleFinalization.finalizedTitle,
            finalizedSubtitle: titleSubtitleFinalization.finalizedSubtitle,
            positioningHook: titleSubtitleFinalization.positioningHook,
            titleRationale: titleSubtitleFinalization.titleRationale,
            subtitleRationale: titleSubtitleFinalization.subtitleRationale,
            audienceFit: titleSubtitleFinalization.audienceFit,
            marketFit: titleSubtitleFinalization.marketFit,
          }
        : undefined,
      audience: {
        targetAudience,
        segments: audienceProfiles.map((profile) => ({
          label: profile.label,
          description: profile.description,
          roleContext: profile.roleContext,
          primaryPainPoint: profile.primaryPainPoint,
          whyThisBook: profile.whyThisBook,
          keySignals: profile.keySignals.slice(0, 4),
          voiceBlendResonance: profile.voiceBlendResonance,
        })),
        comparison: audienceResearch?.phase3
          ? {
              commonThemes: audienceResearch.phase3.commonThemes.slice(0, 5),
              primaryPersonaReasoning: audienceResearch.phase3.primaryPersona.reasoning,
            }
          : undefined,
      },
      truth: coreTruths
        ? {
            coreInsight: coreTruths.coreInsight,
            paradox: coreTruths.paradox,
            stakes: coreTruths.stakes,
            completeTruth: coreTruths.completeTruth,
          }
        : undefined,
      transformation: transformationArc
        ? {
            stage1Me: transformationArc.arc.stage1Me,
            stage2We: {
              sharedProblem: transformationArc.arc.stage2We.sharedProblem,
              universalTension: transformationArc.arc.stage2We.universalTension,
              readerQuestion: transformationArc.arc.stage2We.readerQuestion,
            },
            stage3Truth: {
              coreTruth: transformationArc.arc.stage3Truth.coreTruth,
              reframe: transformationArc.arc.stage3Truth.reframe,
              paradox: transformationArc.arc.stage3Truth.paradox,
            },
            stage4You: {
              firstAction: transformationArc.arc.stage4You.firstAction,
              instructionStyle: transformationArc.arc.stage4You.instructionStyle,
            },
            stage5FinalWe: {
              transformedSuccess: transformationArc.arc.stage5FinalWe.transformedSuccess,
              collectiveVision: transformationArc.arc.stage5FinalWe.collectiveVision,
              identityShift: transformationArc.arc.stage5FinalWe.identityShift,
            },
            completeTransformation: transformationArc.arc.completeTransformation,
          }
        : undefined,
      market: {
        executiveSummary: marketReport.executiveSummary,
        category: marketReport.marketCategory,
        directCompetitors: marketReport.competitiveLandscape.directCompetitors
          .slice(0, 3)
          .map((competitor) => ({
            title: competitor.title,
            author: competitor.author,
            positioning: competitor.positioning,
            strengths: competitor.strengths.slice(0, 2),
            gaps: competitor.gaps.slice(0, 2),
            pricePoint: competitor.pricePoint,
            differenceOpportunity: competitor.differenceOpportunity,
          })),
        whiteSpace: marketReport.competitiveLandscape.marketPositioning.whiteSpace,
        marketSizing: {
          totalAddressableMarket: marketReport.marketSizing.totalAddressableMarket,
          serviceableAddressableMarket: marketReport.marketSizing.serviceableAddressableMarket,
          serviceableObtainableMarket: marketReport.marketSizing.serviceableObtainableMarket,
          yearOneToThreeOutlook: marketReport.marketSizing.yearOneToThreeOutlook,
          trends: marketReport.marketSizing.trends,
        },
        audienceDemand: {
          personaUrgency: marketReport.audienceDemand.personaUrgency,
          searchBehavior: marketReport.audienceDemand.searchBehavior.slice(0, 5),
          validationSignals: marketReport.audienceDemand.validationSignals,
          willingnessToPay: marketReport.audienceDemand.willingnessToPay,
        },
        pricingStrategy: {
          comparableBookPricing: marketReport.pricingStrategy.comparableBookPricing,
          pricingTiers: marketReport.pricingStrategy.pricingTiers.slice(0, 4),
          pricePositioning: marketReport.pricingStrategy.pricePositioning,
          launchPricing: marketReport.pricingStrategy.launchPricing,
        },
        monetizationEcosystem: {
          directBookRevenue: marketReport.monetizationEcosystem.directBookRevenue,
          ancillaryProducts: marketReport.monetizationEcosystem.ancillaryProducts.slice(0, 4),
          totalEcosystemRevenueProjection:
            marketReport.monetizationEcosystem.totalEcosystemRevenueProjection,
        },
        distributionAndLaunch: {
          publishingOptions: marketReport.distributionAndLaunch.publishingOptions,
          distributionChannels: marketReport.distributionAndLaunch.distributionChannels.slice(0, 5),
          launchStrategy: marketReport.distributionAndLaunch.launchStrategy,
          marketingChannels: marketReport.distributionAndLaunch.marketingChannels.slice(0, 5),
          yearOneDistributionMix: marketReport.distributionAndLaunch.yearOneDistributionMix,
        },
        riskAssessment: {
          overallRiskProfile: marketReport.riskAssessment.overallRiskProfile,
          marketRisks: marketReport.riskAssessment.marketRisks.slice(0, 4),
          authorPlatformRisks: marketReport.riskAssessment.authorPlatformRisks.slice(0, 3),
          executionRisks: marketReport.riskAssessment.executionRisks.slice(0, 3),
          mitigationPlan: marketReport.riskAssessment.mitigationPlan.slice(0, 5),
        },
        financialProjections: {
          yearOneRevenue: marketReport.financialProjections.yearOneRevenue,
          yearOneCosts: marketReport.financialProjections.yearOneCosts,
          profitabilityAnalysis: marketReport.financialProjections.profitabilityAnalysis,
          yearsTwoToThreeProjection: marketReport.financialProjections.yearsTwoToThreeProjection,
        },
        goNoGoRecommendation: marketReport.goNoGoRecommendation,
      },
      recommendations: {
        summary: recommendations.summary,
        recommendations: recommendations.recommendations.slice(0, 6),
        bookStrategy: {
          coreMessagePositioning: recommendations.bookStrategy.coreMessagePositioning,
          audienceTargeting: recommendations.bookStrategy.audienceTargeting,
          contentDepthAndBreadth: recommendations.bookStrategy.contentDepthAndBreadth,
          lengthAndStructure: recommendations.bookStrategy.lengthAndStructure,
          voiceAndToneRecommendations: recommendations.bookStrategy.voiceAndToneRecommendations,
          differentiationStrategy: recommendations.bookStrategy.differentiationStrategy,
        },
        positioningAndMarketing: {
          marketPositioningStatement:
            recommendations.positioningAndMarketing.marketPositioningStatement,
          keyDifferentiators:
            recommendations.positioningAndMarketing.keyDifferentiators.slice(0, 5),
          targetCustomerProfile:
            recommendations.positioningAndMarketing.targetCustomerProfile,
          positioningByChannel:
            recommendations.positioningAndMarketing.positioningByChannel.slice(0, 5),
          messagingFramework:
            recommendations.positioningAndMarketing.messagingFramework.slice(0, 5),
          competitivePositioningQuadrant:
            recommendations.positioningAndMarketing.competitivePositioningQuadrant,
        },
        launchAndGoToMarket: {
          publishingPathRecommendation:
            recommendations.launchAndGoToMarket.publishingPathRecommendation,
          launchTimeline: recommendations.launchAndGoToMarket.launchTimeline,
          preLaunchActivities:
            recommendations.launchAndGoToMarket.preLaunchActivities.slice(0, 5),
          launchActivities:
            recommendations.launchAndGoToMarket.launchActivities.slice(0, 5),
          postLaunchActivities:
            recommendations.launchAndGoToMarket.postLaunchActivities.slice(0, 4),
          distributionChannelPriorities:
            recommendations.launchAndGoToMarket.distributionChannelPriorities.slice(0, 5),
          marketingBudgetAllocation:
            recommendations.launchAndGoToMarket.marketingBudgetAllocation,
        },
        personaStrategies: recommendations.personaStrategies.slice(0, 3).map((strategy) => ({
          personaName: strategy.personaName,
          primaryPositioning: strategy.primaryPositioning,
          keyMessage: strategy.keyMessage,
          whereToReachThem: strategy.whereToReachThem.slice(0, 4),
          launchStrategy: strategy.launchStrategy,
        })),
        monetizationRecommendations: {
          bookPricingRecommendation:
            recommendations.monetizationRecommendations.bookPricingRecommendation,
          ancillaryProductRecommendations:
            recommendations.monetizationRecommendations.ancillaryProductRecommendations.slice(0, 4),
          ecosystemBuildOutTimeline:
            recommendations.monetizationRecommendations.ecosystemBuildOutTimeline.slice(0, 4),
          revenueModelRecommendation:
            recommendations.monetizationRecommendations.revenueModelRecommendation,
        },
        teamAndResources: {
          writingSupport: recommendations.teamAndResources.writingSupport,
          designAndProduction: recommendations.teamAndResources.designAndProduction,
          marketingAndLaunchSupport:
            recommendations.teamAndResources.marketingAndLaunchSupport,
          timelineAndMilestones: recommendations.teamAndResources.timelineAndMilestones.slice(0, 5),
        },
        successMetricsAndKpis: {
          yearOneSuccessTargets:
            recommendations.successMetricsAndKpis.yearOneSuccessTargets.slice(0, 6),
          monthlyKpis: recommendations.successMetricsAndKpis.monthlyKpis.slice(0, 6),
          successMilestones: recommendations.successMetricsAndKpis.successMilestones.slice(0, 5),
        },
        financialRecommendations: {
          investmentRequired: recommendations.financialRecommendations.investmentRequired,
          revenueProjections: recommendations.financialRecommendations.revenueProjections,
          profitabilityTimeline: recommendations.financialRecommendations.profitabilityTimeline,
          pricingSummary: recommendations.financialRecommendations.pricingSummary.slice(0, 5),
        },
        finalRecommendation: recommendations.finalRecommendation,
      },
      instruction:
        titleSubtitleFinalization
          ? "Create the final Book Pitch package using the supplied template. Treat the previous phases as already-approved source material. Use the validated title/subtitle package as the default package in the document, and use recognizable audience segments and role descriptions from the Audience analysis, not fictitious personal names."
          : "Create the final Book Pitch package using the supplied template. Treat the previous phases as already-approved source material. Use recognizable audience segments and role descriptions from the Audience analysis, not fictitious personal names.",
    },
  };
}

function fallbackBookPitchMarkdown(params: {
  title: string;
  subtitle: string;
  conceptStatement: string;
  corePromise: string;
  targetAudience: string;
  marketOpportunity: string;
  authorCredibility: string;
  executiveSummary: string;
  recommendation: "GO" | "NO_GO" | "CONDITIONAL_GO";
  rationale: string;
  nextSteps: string[];
  audienceProfiles: PitchAudienceProfile[];
  audienceResearch?: AudienceResearchArtifact;
  promise: PromiseBrief;
  coreTruths?: CoreTruthsArtifact;
  transformationArc?: TransformationArtifact;
  marketReport: MarketReport;
  recommendations: PositioningRecommendations;
  bookSetupProfile?: BookSetupProfile | null;
  titleSubtitleFinalization?: TitleSubtitleFinalization;
}): string {
  const audienceProfiles = params.audienceProfiles.slice(0, 3);
  const audienceComparison = params.audienceResearch?.phase3;
  const competitorLines = params.marketReport.competitiveLandscape.directCompetitors
    .slice(0, 3)
    .map(
      (competitor, index) =>
        `### Primary Competitor ${index + 1}: ${competitor.title} by ${competitor.author}

**Positioning:** ${competitor.positioning}

**Target audience:** ${competitor.targetAudience}

**Strengths:** ${competitor.strengths.join("; ")}

**Weaknesses:** ${competitor.gaps.join("; ")}

**Price point:** ${competitor.pricePoint}

**Your advantage vs. this competitor:** ${competitor.differenceOpportunity}`,
    )
    .join("\n\n");
  const pricingTierLines = params.marketReport.pricingStrategy.pricingTiers
    .map(
      (tier) =>
        `**${tier.format}:** ${tier.pricePoint} — ${tier.rationale}`,
    )
    .join("\n\n");
  const ancillaryLines = params.marketReport.monetizationEcosystem.ancillaryProducts
    .map(
      (product) =>
        `**${product.channel}:** ${product.offer} | ${product.pricePoint} | ${product.revenuePotential}`,
    )
    .join("\n\n");
  const personaStrategies = params.recommendations.personaStrategies.slice(0, 3);
  const audienceOverview = renderMarkdownBulletList(
    audienceProfiles.map(
      (profile) =>
        `${profile.label}: ${profile.description} | ${profile.roleContext}`,
    ),
    params.targetAudience,
  );
  const sharedThemes = renderMarkdownBulletList(
    audienceComparison?.commonThemes ?? [],
    "The audience segments share a need for a clearer operating model, stronger execution, and proof that the framework works in the real world.",
  );
  const crossPersonaDifferences = renderMarkdownBulletList(
    (audienceComparison?.differences ?? []).map(
      (difference) => `${difference.persona}: ${difference.difference}`,
    ),
    "Each audience segment experiences the problem at a different altitude, which means the book must show multiple entry points into the same truth.",
  );
  const objectionLines = audienceProfiles
    .map(
      (profile, index) => `**Objection ${index + 1}:** ${profile.label} may worry that the book is too abstract for the urgency of their situation.
- **Response:** ${profile.whyThisBook}`,
    )
    .join("\n\n");
  const stage1Me = params.transformationArc?.arc.stage1Me;
  const stage2We = params.transformationArc?.arc.stage2We;
  const stage3Truth = params.transformationArc?.arc.stage3Truth;
  const stage4You = params.transformationArc?.arc.stage4You;
  const stage5FinalWe = params.transformationArc?.arc.stage5FinalWe;
  const stage6Patterns = params.transformationArc?.arc.stage6Patterns;
  const stage7BookMap = params.transformationArc?.arc.stage7BookMap;

  return `# EXECUTIVE SUMMARY

### Concept Statement

**Title:** ${params.title}

**Subtitle:** ${params.subtitle}

**One-sentence concept:** ${params.conceptStatement}

**Core promise:** ${params.corePromise}

**Target audience:** ${params.targetAudience}

**Market opportunity:** ${params.marketOpportunity}

**Author credibility:** ${params.authorCredibility}

### The Problem

**Problem statement:** ${params.promise.readerProblem || stage2We?.sharedProblem || "The reader is accountable for results, but lacks a reliable operating model for diagnosing what is actually breaking down."}

**Urgency level:** ${params.marketReport.audienceDemand.personaUrgency[0]?.urgency || "High"}

**Why unsolved:** ${params.marketReport.commercialRisks[0] || "Most competing solutions treat symptoms or assume a reader context that does not match this audience."}

**Current approach:** ${params.marketReport.audienceDemand.searchBehavior[0] || "Readers are piecing together tactics, frameworks, and advice without a unifying model."}

### The Solution

**Core truth/framework:** ${params.coreTruths?.completeTruth || params.promise.coreTruth || params.promise.bigIdea}

**How it's different:** ${params.recommendations.bookStrategy.differentiationStrategy}

**Author advantage:** ${params.authorCredibility}

### Target Audience

**Primary persona/segment:** ${audienceProfiles[0]?.label || params.targetAudience}

**Secondary personas/segments:** ${(audienceProfiles.slice(1).map((profile) => profile.label).join("; ") || "Secondary audience still being refined.")}

**Market sizing:** TAM: ${params.marketReport.marketSizing.totalAddressableMarket} | SAM: ${params.marketReport.marketSizing.serviceableAddressableMarket} | SOM Year 1: ${params.marketReport.marketSizing.serviceableObtainableMarket}

### Market Position

**Competitive landscape:** ${params.marketReport.saturationAssessment}

**Your differentiation:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.differentiation}

**White space:** ${params.marketReport.competitiveLandscape.marketPositioning.whiteSpace}

### Business Case

**Book price:** ${params.marketReport.pricingStrategy.pricingTiers[0]?.pricePoint || "To be finalized"}

**Year 1 projection:** ${params.marketReport.marketSizing.serviceableObtainableMarket}

**Year 1 revenue:** ${params.marketReport.financialProjections.yearOneRevenue}

**Ecosystem potential:** ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection}

**Break-even:** ${params.recommendations.financialRecommendations.profitabilityTimeline}

### Launch Plan

**Publishing path:** ${params.recommendations.launchAndGoToMarket.publishingPathRecommendation}

**Launch date:** ${params.recommendations.launchAndGoToMarket.launchTimeline}

**Marketing strategy:** ${params.recommendations.launchAndGoToMarket.distributionChannelPriorities.join("; ")}

**Key milestones:** ${params.recommendations.teamAndResources.timelineAndMilestones.join("; ")}

### Final Recommendation

**Recommendation:** ${params.recommendation.replace(/_/g, " ")}

**Rationale:** ${params.rationale}

**Next steps:** ${params.nextSteps.join("; ")}

### Executive Summary Narrative

${params.executiveSummary}

# SECTION 1: BOOK VISION

**Title:** ${params.title}

**Subtitle:** ${params.subtitle}

**Rationale:** ${params.titleSubtitleFinalization?.titleRationale || params.recommendations.bookStrategy.coreMessagePositioning}

### Core Concept

**One sentence:** ${params.conceptStatement}

**One paragraph:** ${params.executiveSummary}

### Core Promise

**What reader gets:** ${params.corePromise}

**How they'll feel:** ${params.promise.readerDesire || stage5FinalWe?.identityShift || "More confident, less reactive, and more in control of the real problem."}

**What becomes possible:** ${stage5FinalWe?.collectiveVision || params.promise.transformationAfter}

### Core Truth / Framework

**Core concept:** ${params.promise.bigIdea || params.conceptStatement}

**Central insight:** ${params.coreTruths?.coreInsight.coreTruth || params.promise.coreTruth || params.promise.bigIdea}

**The paradox:** ${params.coreTruths?.paradox.whatMakesThisSurprising || stage3Truth?.paradox || "The fix is not more intensity; it is better diagnosis and more consistent execution."}

**Why it matters:** ${params.coreTruths?.stakes.ifEmbraced || stage3Truth?.ifEmbraced || params.promise.stakes}

### Narrative Structure (ME-WE-TRUTH-YOU-WE)

**ME - Personal Dilemma:** ${stage1Me?.personalDilemma || "Open with the author's real collision with the problem and the cost of solving it the wrong way."}

**WE - Common Ground:** ${stage2We?.sharedProblem || params.promise.readerProblem}

**TRUTH - Core Insight:** ${stage3Truth?.coreTruth || params.coreTruths?.completeTruth || params.promise.coreTruth}

**YOU - Application:** ${stage4You?.firstAction || params.promise.bigIdea}

**WE - Vision:** ${stage5FinalWe?.collectiveVision || params.promise.transformationAfter}

### Voice & Tone

**Voice & tone:** ${summarizeVoiceBlendForPitch(params.bookSetupProfile)}

**What makes it distinctive:** ${params.recommendations.bookStrategy.voiceAndToneRecommendations}

### Reader Journey

**Starting point:** ${params.promise.transformationBefore || stage1Me?.manifestation || "Readers begin overextended, under-language-equipped, and overly dependent on their own effort."}

**Transformation:** ${params.transformationArc?.arc.completeTransformation || params.promise.transformationAfter}

**Ending point:** ${params.promise.transformationAfter || stage5FinalWe?.identityShift || "Readers end with a more portable model, clearer decisions, and greater authority under pressure."}

# SECTION 2: AUDIENCE & PERSONAS

**Primary market:** ${params.targetAudience}

**Secondary markets:** ${(audienceProfiles.slice(1).map((profile) => profile.label).join("; ") || "Secondary markets still being refined")}

**Market size:** TAM: ${params.marketReport.marketSizing.totalAddressableMarket} | SAM: ${params.marketReport.marketSizing.serviceableAddressableMarket}

**Problem urgency:** ${params.marketReport.audienceDemand.personaUrgency.map((item) => `${item.personaName || "Audience"}: ${item.urgency}`).join("; ")}

### Target Audience Overview

${audienceOverview}

${audienceProfiles
  .map(
    (profile, index) => `### Persona ${index + 1}: ${profile.label}

**Role/Title:** ${profile.label}

**Demographics / Context:** ${profile.roleContext}

**Primary pain point:** ${profile.primaryPainPoint}

**Goals:**
${renderMarkdownBulletList(profile.keySignals, "Clarify priorities, improve decisions, and create durable progress.")}

**Objections:** ${params.recommendations.personaStrategies[index]?.priceSensitivity || "They may worry the book is too conceptual, too generic, or not built for their operating context."}

**Success metric:** ${params.recommendations.personaStrategies[index]?.launchStrategy || "They can use the framework in real conditions and see better results quickly."}

**Why this book:** ${profile.whyThisBook}

**Voice blend resonance:** ${profile.voiceBlendResonance}`,
  )
  .join("\n\n")}

### Persona Comparison

**What's universal:** 
${sharedThemes}

**What's different:** 
${crossPersonaDifferences}

**How book serves all:** ${stage7BookMap?.implicitPersonaService || "The book serves all segments by telling stories and offering frameworks that different readers can map onto their own roles without being explicitly named in the manuscript."}

### Reader Objections & Responses

${objectionLines}

# SECTION 3: TRANSFORMATION JOURNEY

### The Universal Arc (8 Stages)

**STAGE 1: FALSE BELIEF / CURRENT STATE**

${stage1Me?.falseBelief || params.promise.transformationBefore || "Readers start by assuming more effort inside the same mental model will solve the problem."}

**STAGE 2: FRICTION / AWAKENING**

${stage2We?.sharedProblem || params.promise.readerProblem || "The current approach keeps producing friction, rework, and unclear ownership."}

**STAGE 3: RECOGNITION / ADMISSION**

${stage2We?.readerQuestion || "Readers admit that the problem is deeper than the surface symptoms they have been reacting to."}

**STAGE 4: RESISTANCE / DOUBT**

${stage4You?.applicationResistance || "The new approach initially feels slower or riskier than the old habit, even if the old habit is failing."}

**STAGE 5: ENCOUNTERING THE NEW TRUTH**

${stage3Truth?.reframe || params.coreTruths?.completeTruth || params.promise.coreTruth}

**STAGE 6: EXPERIMENTATION / APPLICATION**

${stage4You?.firstAction || params.promise.bigIdea || "Readers test the truth through a concrete first move in their own operating environment."}

**STAGE 7: BREAKTHROUGH / EVIDENCE**

${stage5FinalWe?.transformedSuccess || "Readers see evidence that the new model changes behavior, clarity, and results under pressure."}

**STAGE 8: INTEGRATION / NEW NORMAL**

${stage5FinalWe?.identityShift || params.promise.transformationAfter || "The truth becomes part of how they lead, decide, and interpret friction going forward."}

### How Each Persona Experiences the Arc

${audienceProfiles
  .map(
    (profile) => `**${profile.label}:** ${profile.primaryPainPoint} -> ${profile.whyThisBook}`,
  )
  .join("\n\n")}

### Key Turning Points in Book

**Where does awakening happen?** ${stage7BookMap?.sharedDilemmaReveal || "Early in the book, when readers see that the author's struggle is structurally the same as their own."}

**Where does resistance get addressed?** ${stage4You?.applicationResistance || "In the application chapters, where the reader feels the temptation to fall back to the old model."}

**Where does the truth reveal?** ${stage7BookMap?.truthReveal || "After the shared problem is fully named and the reader is emotionally ready for a reframe."}

**Where does breakthrough occur?** ${stage5FinalWe?.transformedSuccess || "When readers see the framework produce better outcomes in a real-world scenario."}

### Implicit vs. Explicit

**What's explicitly taught:** ${stage3Truth?.proofMechanism || "The framework, the diagnostic logic, and the practical application steps."}

**What's implicitly woven in:**
${renderMarkdownBulletList(stage6Patterns?.implicitLessons ?? [], "The stories, emotional permission, and examples teach readers how to think differently while they absorb the framework.")}

**How personas recognize themselves:** ${stage7BookMap?.implicitPersonaService || "Each segment sees its own tension, pressures, and aspirations reflected in the examples and strategic language."}

# SECTION 4: COMPETITIVE LANDSCAPE

**Category:** ${params.marketReport.marketCategory}

**Competitive intensity:** ${params.marketReport.saturationAssessment}

**Market trend:** ${params.marketReport.marketSizing.trends}

**White space:** ${params.marketReport.competitiveLandscape.marketPositioning.whiteSpace}

${competitorLines}

### Your Competitive Advantages

**Advantage 1:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.differentiation}
- **Evidence/proof:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.gapFilled}

**Advantage 2:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.unfairAdvantage}
- **Evidence/proof:** ${params.authorCredibility}

**Advantage 3:** ${params.recommendations.bookStrategy.differentiationStrategy}
- **Evidence/proof:** ${params.recommendations.positioningAndMarketing.marketPositioningStatement}

### Positioning Statement

${params.recommendations.positioningAndMarketing.marketPositioningStatement}

### Differentiation Summary

**What only your book has:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.unfairAdvantage}

**Why it matters to readers:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.whoChoosesThisBook}

**How you'll communicate this:** ${params.recommendations.positioningAndMarketing.messagingFramework.join("; ")}

# SECTION 5: MARKET OPPORTUNITY

**TAM:** ${params.marketReport.marketSizing.totalAddressableMarket}

**SAM:** ${params.marketReport.marketSizing.serviceableAddressableMarket}

**SOM Year 1:** ${params.marketReport.marketSizing.serviceableObtainableMarket}

**Demand validation:** ${params.marketReport.audienceDemand.validationSignals}

### Demand Validation

**Is the problem real?** ${params.marketReport.audienceDemand.validationSignals}

**Are personas willing to pay?** ${params.marketReport.audienceDemand.willingnessToPay}

**Is demand growing?** ${params.marketReport.marketSizing.trends}

**How urgent is the need?** ${params.marketReport.audienceDemand.personaUrgency.map((item) => `${item.personaName || "Audience"}: ${item.whyNow}`).join("; ")}

### Market Trends

**Tailwinds:** 
${renderMarkdownBulletList(params.marketReport.marketSizing.tailwinds, "Leaders need practical, portable frameworks that help them navigate complexity and execution pressure.")}

**Headwinds:** 
${renderMarkdownBulletList(params.marketReport.marketSizing.headwinds, "This market is noisy, and generic leadership content competes for attention.")}

**Timing:** ${params.marketReport.executiveSummary.strategicPriority}

### Sales Projections

**Year 1**
- Conservative: ${params.marketReport.financialProjections.sensitivityAnalysis}
- Realistic: ${params.marketReport.financialProjections.yearOneRevenue}
- Optimistic: ${params.marketReport.marketSizing.yearOneToThreeOutlook}

**Year 2:** ${params.marketReport.financialProjections.yearsTwoToThreeProjection}

**Year 3:** ${params.marketReport.marketSizing.yearOneToThreeOutlook}

# SECTION 6: BUSINESS MODEL

**Primary revenue:** ${params.marketReport.monetizationEcosystem.directBookRevenue}

**Ecosystem revenue:** ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection}

**Pricing strategy:** ${params.recommendations.monetizationRecommendations.bookPricingRecommendation}

### Primary Revenue (Book Sales)

${pricingTierLines}

**Total Year 1 Book Revenue:** ${params.marketReport.financialProjections.yearOneRevenue}

### Ecosystem Revenue (Optional)

${ancillaryLines || "**Ecosystem products:** Still being finalized."}

**Services / Other:** ${params.marketReport.monetizationEcosystem.consultingAndCoaching}

**Total Year 1 Ecosystem Revenue:** ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection}

### Total Revenue & Profitability

**Year 1 Book Revenue:** ${params.marketReport.financialProjections.yearOneRevenue}

**Year 1 Ecosystem Revenue:** ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection}

**Year 1 Total Costs:** ${params.marketReport.financialProjections.yearOneCosts}

**Year 1 Net Profit:** ${params.marketReport.financialProjections.profitabilityAnalysis}

### Revenue Model by Year

| Category | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Book Revenue | ${params.marketReport.financialProjections.yearOneRevenue} | ${params.marketReport.financialProjections.yearsTwoToThreeProjection} | ${params.marketReport.financialProjections.yearsTwoToThreeProjection} |
| Ecosystem Revenue | ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection} | ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection} | ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection} |
| Costs | ${params.marketReport.financialProjections.yearOneCosts} | To be refined | To be refined |
| Profitability | ${params.marketReport.financialProjections.profitabilityAnalysis} | Scales if channel mix improves | Scales if ecosystem converts |

# SECTION 7: LAUNCH & MARKETING STRATEGY

**Publishing path:** ${params.recommendations.launchAndGoToMarket.publishingPathRecommendation}

**Launch timeline:** ${params.recommendations.launchAndGoToMarket.launchTimeline}

**Key channels:** ${params.recommendations.launchAndGoToMarket.distributionChannelPriorities.join("; ")}

### Distribution Channels

**Primary Channel:** ${params.recommendations.launchAndGoToMarket.distributionChannelPriorities[0] || "Primary channel still being finalized"}
- **Target:** ${params.marketReport.distributionAndLaunch.yearOneDistributionMix}
- **Strategy:** ${params.marketReport.distributionAndLaunch.launchStrategy}

**Secondary Channel:** ${params.recommendations.launchAndGoToMarket.distributionChannelPriorities[1] || "Secondary channel still being finalized"}
- **Target:** Supported by audience segment reach and pricing fit
- **Strategy:** ${params.recommendations.positioningAndMarketing.positioningByChannel[1] || params.marketReport.distributionAndLaunch.marketingChannels[1] || "Build credibility and demand in a channel the primary audience already trusts."}

**Tertiary Channel:** ${params.recommendations.launchAndGoToMarket.distributionChannelPriorities[2] || "Tertiary channel still being finalized"}
- **Target:** Opportunistic and partnership-led
- **Strategy:** ${params.marketReport.distributionAndLaunch.marketingChannels[2] || "Use partnerships and authority channels to extend reach."}

### Marketing Channels

**Owned**
${renderMarkdownBulletList(params.marketReport.distributionAndLaunch.marketingChannels.slice(0, 2), "Email, website, and organic content remain the foundation.")}

**Earned**
${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.postLaunchActivities.slice(0, 2), "Speaking, podcast appearances, and partner amplification build credibility and reach.")}

**Paid**
${renderMarkdownBulletList(
  params.recommendations.launchAndGoToMarket.launchActivities.filter((item) =>
    /ads|paid|sponsored/i.test(item),
  ),
  "Use paid only where the audience is reachable and the economics support it.",
)}

**Total Marketing Budget:** ${params.recommendations.launchAndGoToMarket.marketingBudgetAllocation}

### Pre-Launch Activities

**Months -12 to -6**
${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.preLaunchActivities.slice(0, 3), "Clarify positioning, build platform assets, and test messaging with the primary audience.")}

**Months -6 to -3**
${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.preLaunchActivities.slice(3, 6), "Finalize package, line up partners, and build launch assets.")}

### Launch Window

**Months -3 to 0**
${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.launchActivities.slice(0, 4), "Concentrate attention, proof, and distribution in a tight pre-launch window.")}

**Months +1 to +3**
${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.launchActivities.slice(4), "Sustain momentum with reviews, follow-on appearances, and targeted channel support.")}

### Post-Launch Activities

${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.postLaunchActivities, "Continue authority building, community development, and ecosystem expansion.")}

### Positioning by Persona

${personaStrategies
  .map(
    (strategy) =>
      `**${strategy.personaName}:** ${strategy.keyMessage} | ${strategy.whereToReachThem.join("; ")}`,
  )
  .join("\n\n")}

# SECTION 8: FINANCIAL PROJECTIONS

**Investment required:** ${params.recommendations.financialRecommendations.investmentRequired}

**Revenue projections:** ${params.recommendations.financialRecommendations.revenueProjections}

**Profitability timeline:** ${params.recommendations.financialRecommendations.profitabilityTimeline}

### Investment Required

${renderMarkdownBulletList(params.recommendations.financialRecommendations.pricingSummary, "Investment assumptions still need final pricing and production alignment.")}

### Revenue Projections Summary

| Metric | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Total Revenue | ${params.marketReport.financialProjections.yearOneRevenue} | ${params.marketReport.financialProjections.yearsTwoToThreeProjection} | ${params.marketReport.financialProjections.yearsTwoToThreeProjection} |
| Total Costs | ${params.marketReport.financialProjections.yearOneCosts} | To be refined | To be refined |
| Net Profit | ${params.marketReport.financialProjections.profitabilityAnalysis} | Expected to improve with leverage | Expected to improve with ecosystem expansion |
| Cumulative Profit | Establish in Year 1 model | Grows if channel mix holds | Matures with ecosystem uptake |

### Break-Even Analysis

**Break-even point:** ${params.recommendations.financialRecommendations.profitabilityTimeline}

**ROI:** ${params.marketReport.financialProjections.profitabilityAnalysis}

### Sensitivity Analysis

**Conservative (50% of projection):** ${params.marketReport.financialProjections.sensitivityAnalysis}

**Optimistic (150% of projection):** ${params.marketReport.marketSizing.yearOneToThreeOutlook}

**Key variables to monitor:** ${params.marketReport.successMetrics.keyPerformanceIndicators.join("; ")}

# SECTION 9: SUCCESS METRICS & KPIS

${params.recommendations.successMetricsAndKpis.yearOneSuccessTargets
  .map((item) => `- ${item}`)
  .join("\n")}

### Key Performance Indicators (Track Monthly)

${renderMarkdownBulletList(params.recommendations.successMetricsAndKpis.monthlyKpis, "Track sales, audience growth, and authority signals every month.")}

### Success Milestones

${renderMarkdownBulletList(params.recommendations.successMetricsAndKpis.successMilestones, "Set milestone checkpoints for pre-launch, launch, and post-launch momentum.")}

### Definition of Success

**What success means:** ${params.marketReport.successMetrics.successDefinition}

**How you'll measure it:** ${params.marketReport.successMetrics.yearOneGoals.join("; ")}

# SECTION 10: RECOMMENDATIONS & NEXT STEPS

### Overall Recommendation

**RECOMMENDATION:** ${params.recommendation.replace(/_/g, " ")}

**Rationale:** ${params.rationale}

### Critical Success Factors

${renderMarkdownBulletList(params.recommendations.finalRecommendation.criticalSuccessFactors, "Clarity of audience, sharp positioning, and disciplined execution are the critical success factors.")}

### Immediate Next Steps (Before Outline)

${renderMarkdownNumberedList(params.nextSteps, "Lock audience, positioning, and structural direction before moving into Outline.")}

### Timeline to Launch

${renderMarkdownBulletList(params.recommendations.teamAndResources.timelineAndMilestones, "Translate the strategy into a realistic writing, production, and launch timeline.")}

### Resource Requirements

**Team members needed:** ${params.recommendations.teamAndResources.teamCompositionRecommendation}

**Budget required:** ${params.recommendations.financialRecommendations.investmentRequired}

**Timeline:** ${params.recommendations.launchAndGoToMarket.launchTimeline}

**Success depends on:** ${params.recommendations.finalRecommendation.strategicDirection}

### Contingency Planning

${renderMarkdownBulletList(params.recommendations.finalRecommendation.contingencyPlanning, "If the market response is weak, tighten the audience, rework the positioning, or reduce scope before scaling the launch plan.")}

# APPENDICES

- Voice blend: ${summarizeVoiceBlendForPitch(params.bookSetupProfile)}
- Market recommendation: ${params.marketReport.goNoGoRecommendation.overallRecommendation}
- Recommendation blueprint summary: ${params.recommendations.summary}
- Audience segments: ${audienceProfiles.map((profile) => profile.label).join("; ")}
- Core truth: ${params.coreTruths?.completeTruth || params.promise.coreTruth || params.promise.bigIdea}
- Book map: ${stage7BookMap?.openingStory || "Opening story and section architecture still being refined."}`;
}

function fallbackBookPromiseReport(
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
  marketReport: MarketReport,
  recommendations: PositioningRecommendations,
  audienceResearch?: AudienceResearchArtifact,
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
  bookSetupProfile?: BookSetupProfile | null,
  titleSubtitleFinalization?: TitleSubtitleFinalization,
): BookPromiseReport {
  const { title, subtitle } = getSelectedTitleSubtitle(
    promise,
    bookSetupProfile,
    titleSubtitleFinalization,
  );
  const recommendation =
    recommendations.finalRecommendation.overallRecommendation ||
    marketReport.goNoGoRecommendation.overallRecommendation;
  const nextSteps =
    recommendations.finalRecommendation.immediateNextSteps.length > 0
      ? recommendations.finalRecommendation.immediateNextSteps
      : marketReport.goNoGoRecommendation.nextSteps;
  const conceptStatement =
    promise.bigIdea ||
    promise.coreTruth ||
    "A practical nonfiction book with a clear transformation and market wedge.";
  const corePromise =
    promise.promiseStatement ||
    promise.readerDesire ||
    "Readers will gain a clearer operating model and a more actionable path forward.";
  const audienceProfiles = buildBookPitchAudienceProfiles(
    audienceResearch,
    audienceResearch?.phase2?.personas,
    personaContexts,
    recommendations,
  );
  const targetAudience = summarizeBookPitchTargetAudience(audienceProfiles, promise);
  const marketOpportunity = [
    marketReport.marketSizing.totalAddressableMarket,
    marketReport.marketSizing.serviceableAddressableMarket,
    marketReport.marketSizing.serviceableObtainableMarket,
  ]
    .filter(Boolean)
    .join(" | ");
  const authorCredibility =
    bookSetupProfile?.writerPersonaGuidance?.[0] ||
    bookSetupProfile?.writerPersona ||
    "Author credibility should be anchored in lived experience, operating clarity, and practical authority.";
  const executiveSummary = [
    `${title} is a practical nonfiction book built for ${targetAudience}.`,
    `Its core promise is ${corePromise.toLowerCase()}, grounded in the central truth that ${(
      coreTruths?.completeTruth ||
      promise.coreTruth ||
      promise.bigIdea ||
      "better outcomes require a better operating model"
    ).replace(/\.$/, "")}.`,
    `The market work currently lands at ${recommendation.replace(/_/g, " ")} with the strongest opportunity in ${marketReport.competitiveLandscape.marketPositioning.whiteSpace.toLowerCase()}.`,
    recommendations.summary,
  ].join(" ");

  const report: BookPromiseReport = {
    title,
    subtitle,
    conceptStatement,
    corePromise,
    targetAudience,
    marketOpportunity,
    authorCredibility,
    executiveSummary,
    recommendation,
    rationale: recommendations.finalRecommendation.rationale,
    nextSteps,
    documentMarkdown: "",
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: "fallback",
    },
  };

  report.documentMarkdown = fallbackBookPitchMarkdown({
    title,
    subtitle,
    conceptStatement,
    corePromise,
    targetAudience,
    marketOpportunity,
    authorCredibility,
    executiveSummary,
    recommendation,
    rationale: report.rationale,
    nextSteps,
    audienceProfiles,
    audienceResearch,
    promise,
    coreTruths,
    transformationArc,
    marketReport,
    recommendations,
    bookSetupProfile,
    titleSubtitleFinalization,
  });

  return report;
}

function buildLegacyBookPitchMarkdown(
  legacy: Record<string, unknown>,
  fallback: BookPromiseReport,
): string {
  const finalPromise = coerceString(legacy.finalPromise, fallback.corePromise);
  const targetAudience = coerceString(legacy.targetAudience, fallback.targetAudience);
  const transformationNarrative = coerceString(
    legacy.transformationNarrative,
    fallback.executiveSummary,
  );
  const positioningStrategy = coerceStringArray(legacy.positioningStrategy);

  if (!finalPromise && !targetAudience && positioningStrategy.length === 0) {
    return fallback.documentMarkdown;
  }

  return `# EXECUTIVE SUMMARY

${coerceString(legacy.promiseStatement, fallback.corePromise)}

## Target Audience

${targetAudience}

## Transformation Narrative

${transformationNarrative}

## Positioning Strategy

${(positioningStrategy.length > 0 ? positioningStrategy : fallback.nextSteps)
  .map((item) => `- ${item}`)
  .join("\n")}

## Final Package Direction

${fallback.executiveSummary}`;
}

function normalizeBookPromiseReportArtifact(
  raw: unknown,
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
  marketReport: MarketReport,
  recommendations: PositioningRecommendations,
  audienceResearch?: AudienceResearchArtifact,
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
  bookSetupProfile?: BookSetupProfile | null,
  titleSubtitleFinalization?: TitleSubtitleFinalization,
): BookPromiseReport {
  const fallback = fallbackBookPromiseReport(
    promise,
    personaContexts,
    marketReport,
    recommendations,
    audienceResearch,
    coreTruths,
    transformationArc,
    bookSetupProfile,
    titleSubtitleFinalization,
  );
  const record = asRecord(raw);
  const metadata = asRecord(record.metadata);
  const modelName = coerceString(metadata.model, "");
  const audienceProfiles = buildBookPitchAudienceProfiles(
    audienceResearch,
    audienceResearch?.phase2?.personas,
    personaContexts,
    recommendations,
  );
  const targetAudienceCandidate = coerceString(record.targetAudience, fallback.targetAudience);
  const targetAudience = containsNamedAudienceReference(
    targetAudienceCandidate,
    audienceResearch?.phase2?.personas,
  )
    ? fallback.targetAudience
    : targetAudienceCandidate;
  const documentMarkdown = replaceBookPitchPersonaNames(
    modelName.startsWith("fallback")
      ? fallback.documentMarkdown
      : coerceString(record.documentMarkdown, buildLegacyBookPitchMarkdown(record, fallback)),
    audienceResearch?.phase2?.personas,
    audienceProfiles,
  );

  return BookPromiseReportSchema.parse({
    title: coerceString(record.title, fallback.title),
    subtitle: coerceString(record.subtitle, fallback.subtitle),
    conceptStatement: coerceString(
      record.conceptStatement ?? record.promiseStatement,
      fallback.conceptStatement,
    ),
    corePromise: coerceString(
      record.corePromise ?? record.finalPromise ?? record.promiseStatement,
      fallback.corePromise,
    ),
    targetAudience,
    marketOpportunity: coerceString(
      record.marketOpportunity ?? record.marketPosition,
      fallback.marketOpportunity,
    ),
    authorCredibility: coerceString(record.authorCredibility, fallback.authorCredibility),
    executiveSummary: modelName.startsWith("fallback")
      ? fallback.executiveSummary
      : coerceString(
          record.executiveSummary ?? record.audienceInsights ?? record.transformationNarrative,
          fallback.executiveSummary,
        ),
    recommendation: normalizeMarketDecision(
      record.recommendation,
      fallback.recommendation,
    ),
    rationale: coerceString(record.rationale, fallback.rationale),
    nextSteps:
      coerceStringArray(record.nextSteps).length > 0
        ? coerceStringArray(record.nextSteps)
        : fallback.nextSteps,
    documentMarkdown,
    metadata: {
      createdAt: coerceString(
        metadata.createdAt ?? record.compiledAt,
        fallback.metadata?.createdAt ?? new Date().toISOString(),
      ),
      updatedAt: coerceString(
        metadata.updatedAt ?? record.compiledAt,
        fallback.metadata?.updatedAt ?? new Date().toISOString(),
      ),
      model: coerceString(metadata.model, fallback.metadata?.model ?? "legacy"),
      tokenUsage:
        normalizeTokenUsageMetadata(metadata.tokenUsage) ??
        fallback.metadata?.tokenUsage,
      grounding: {
        previousPhases:
          coerceStringArray(asRecord(metadata.grounding).previousPhases).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).previousPhases)
            : fallback.metadata?.grounding?.previousPhases ?? [],
        kbSources:
          coerceStringArray(asRecord(metadata.grounding).kbSources).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).kbSources)
            : fallback.metadata?.grounding?.kbSources ?? [],
        audienceSignals:
          coerceStringArray(asRecord(metadata.grounding).audienceSignals).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).audienceSignals)
            : fallback.metadata?.grounding?.audienceSignals ?? [],
      },
    },
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMarkdownLabeledValue(markdown: string, label: string): string | undefined {
  const pattern = new RegExp(`\\*\\*${escapeRegExp(label)}:\\*\\*\\s*([^\\n]+)`, "i");
  const match = markdown.match(pattern);
  return match?.[1]?.trim();
}

function extractExecutiveSummaryFromMarkdown(markdown: string, fallback: string): string {
  const match = markdown.match(
    /#\s*EXECUTIVE SUMMARY\s+([\s\S]*?)(?:\n#\s*SECTION 1:|\n##\s*SECTION 1:|$)/i,
  );

  if (!match?.[1]) {
    return fallback;
  }

  const cleaned = match[1]
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length > 0 ? cleaned.slice(0, 1800) : fallback;
}

function extractMarkdownSection(markdown: string, heading: string): string | undefined {
  const pattern = new RegExp(
    `(?:^|\\n)(?:#|##|###)\\s*${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=\\n(?:#|##|###)\\s+|$)`,
    "i",
  );
  const match = markdown.match(pattern);
  return match?.[1]?.trim();
}

function extractMarkdownNumberedList(markdown: string, heading: string): string[] {
  const section = extractMarkdownSection(markdown, heading);
  if (!section) {
    return [];
  }

  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, "").trim())
    .filter((line) => line.length > 0);
}

function containsNamedAudienceReference(
  value: string,
  deepProfiles: PersonaDeepProfile[] | undefined,
): boolean {
  const normalized = value.toLowerCase();
  return (deepProfiles ?? []).some((persona) => {
    const name = persona.name?.trim();
    if (!name || !name.includes(" ")) {
      return false;
    }

    return normalized.includes(name.toLowerCase());
  });
}

function replaceBookPitchPersonaNames(
  markdown: string,
  deepProfiles: PersonaDeepProfile[] | undefined,
  audienceProfiles: PitchAudienceProfile[],
): string {
  let next = markdown;

  (deepProfiles ?? []).slice(0, audienceProfiles.length).forEach((persona, index) => {
    const name = persona.name?.trim();
    const replacement = audienceProfiles[index]?.label?.trim();

    if (!name || !replacement || !name.includes(" ")) {
      return;
    }

    next = next.replace(new RegExp(escapeRegExp(name), "g"), replacement);
  });

  return next;
}

export function composeBookPromiseReportFromMarkdown(
  markdown: string,
  promise: PromiseBrief,
  marketReport: MarketReport,
  recommendations: PositioningRecommendations,
  personas: PersonaPack,
  audienceResearch?: AudienceResearchArtifact,
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
  bookSetupProfile?: BookSetupProfile | null,
  titleSubtitleFinalization?: TitleSubtitleFinalization,
  existingReport?: BookPromiseReport | null,
): BookPromiseReport {
  const personaContexts = buildTruthPersonaContexts(
    promise,
    audienceResearch?.phase2?.personas,
    personas.personas,
  );
  const groundingContext = buildBookPitchGroundingContext(
    promise,
    audienceResearch,
    audienceResearch?.phase2?.personas,
    personas.personas,
    coreTruths,
    transformationArc,
    marketReport,
    recommendations,
    personaContexts,
    bookSetupProfile,
    titleSubtitleFinalization,
  );
  const fallback = fallbackBookPromiseReport(
    promise,
    personaContexts,
    marketReport,
    recommendations,
    audienceResearch,
    coreTruths,
    transformationArc,
    bookSetupProfile,
    titleSubtitleFinalization,
  );

  const rawTargetAudience =
    extractMarkdownLabeledValue(markdown, "Target audience") ||
    existingReport?.targetAudience ||
    fallback.targetAudience;
  const targetAudience = containsNamedAudienceReference(
    rawTargetAudience,
    audienceResearch?.phase2?.personas,
  )
    ? fallback.targetAudience
    : rawTargetAudience;
  const nextSteps =
    extractMarkdownNumberedList(markdown, "Immediate Next Steps").length > 0
      ? extractMarkdownNumberedList(markdown, "Immediate Next Steps")
      : extractMarkdownNumberedList(markdown, "Next steps");

  return BookPromiseReportSchema.parse({
    title:
      extractMarkdownLabeledValue(markdown, "Title") ||
      existingReport?.title ||
      fallback.title,
    subtitle:
      extractMarkdownLabeledValue(markdown, "Subtitle") ||
      existingReport?.subtitle ||
      fallback.subtitle,
    conceptStatement:
      extractMarkdownLabeledValue(markdown, "One-sentence concept") ||
      existingReport?.conceptStatement ||
      fallback.conceptStatement,
    corePromise:
      extractMarkdownLabeledValue(markdown, "Core promise") ||
      existingReport?.corePromise ||
      fallback.corePromise,
    targetAudience,
    marketOpportunity:
      extractMarkdownLabeledValue(markdown, "Market opportunity") ||
      existingReport?.marketOpportunity ||
      fallback.marketOpportunity,
    authorCredibility:
      extractMarkdownLabeledValue(markdown, "Author credibility") ||
      existingReport?.authorCredibility ||
      fallback.authorCredibility,
    executiveSummary: extractExecutiveSummaryFromMarkdown(
      markdown,
      existingReport?.executiveSummary || fallback.executiveSummary,
    ),
    recommendation: normalizeMarketDecision(
      extractMarkdownLabeledValue(markdown, "Recommendation"),
      existingReport?.recommendation || fallback.recommendation,
    ),
    rationale:
      extractMarkdownLabeledValue(markdown, "Rationale") ||
      existingReport?.rationale ||
      fallback.rationale,
    nextSteps:
      nextSteps.length > 0
        ? nextSteps
        : existingReport?.nextSteps?.length
          ? existingReport.nextSteps
          : fallback.nextSteps,
    documentMarkdown: markdown.trim(),
    metadata: {
      createdAt:
        existingReport?.metadata?.createdAt ||
        fallback.metadata?.createdAt ||
        new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: existingReport?.metadata?.model || "manual-edit",
      tokenUsage: existingReport?.metadata?.tokenUsage,
      grounding: {
        previousPhases: groundingContext.previousPhases,
        audienceSignals: groundingContext.audienceSignals,
        kbSources: existingReport?.metadata?.grounding?.kbSources ?? [],
      },
    },
  });
}

function createFallbackCoreTruthArtifact(
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
): CoreTruthsArtifact {
  const coreTruth =
    promise.coreTruth ||
    `${promise.audiencePrimary || "The reader"} needs a better operating model, not more generic advice.`;

  return {
    coreInsight: {
      falseBelief:
        promise.readerProblem ||
        "Working harder inside the current mental model will eventually fix the problem.",
      coreTruth,
    },
    paradox: {
      whatMakesThisSurprising:
        "The answer is not usually more effort, pressure, or urgency. It is a better way to see what is actually happening.",
      whyItFeelsBackwards:
        "Most readers assume progress comes from pushing harder, when the deeper issue is often misdiagnosis.",
    },
    stakes: {
      ifEmbraced:
        promise.readerDesire ||
        "Readers gain clarity, better decisions, and a practical path to durable improvement.",
      ifIgnored:
        "They keep repeating the same pattern, misreading the root problem, and burning time on fixes that never hold.",
    },
    evidence: {
      methods: ["Framework/System/Model", "Real example/Case study"],
      specificEvidence:
        "Use a practical framework, a recognizable story, and real operating examples that show why the old mental model keeps failing.",
    },
    personaExperiences: personaContexts.map((persona) => ({
      personaName: persona.name,
      theirVersionOfTruth: `${persona.name} needs this truth because ${persona.dilemma.toLowerCase()}`,
      whatMakesItLand: `${persona.context}. The truth lands because it explains the real pattern beneath the pressure they already feel.`,
      voiceBlendResonates: {
        voice: persona.voiceHint,
        why: `${persona.voiceHint} fits because this persona needs the truth delivered with clear strategic judgment and practical credibility.`,
      },
    })),
    whyNow: {
      whyUrgentNow:
        "The old way is failing faster because complexity, speed, and constant noise now punish misdiagnosis immediately.",
      escalatedProblem:
        "Readers are under more pressure to produce clarity and outcomes in less time, with less margin for trial-and-error.",
    },
    bridge: {
      permissionNeeded:
        "They need permission to stop treating the old belief as a badge of discipline or competence.",
      transitionReframe:
        "The shift is not abandoning what made them successful. It is upgrading how they interpret the problem so their effort finally compounds.",
      whatStaysSame:
        "Discipline, ambition, and responsibility still matter; the truth changes the lens, not the reader's commitment.",
    },
    completeTruth:
      `${coreTruth} The book teaches readers to replace an outdated explanation of the problem with a sharper one, so they can act with more clarity, better proof, and more durable results.`,
  };
}

function normalizeCoreTruthsArtifact(
  raw: unknown,
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
): CoreTruthsArtifact {
  const fallback = createFallbackCoreTruthArtifact(promise, personaContexts);
  const record = asRecord(raw);

  const personaExperiencesRaw = Array.isArray(record.personaExperiences)
    ? record.personaExperiences
    : [];

  if (record.coreInsight && record.paradox && record.stakes) {
    const normalized: CoreTruthsArtifact = {
      coreInsight: {
        falseBelief: coerceString(asRecord(record.coreInsight).falseBelief, fallback.coreInsight.falseBelief),
        coreTruth: coerceString(asRecord(record.coreInsight).coreTruth, fallback.coreInsight.coreTruth),
      },
      paradox: {
        whatMakesThisSurprising: coerceString(
          asRecord(record.paradox).whatMakesThisSurprising,
          fallback.paradox.whatMakesThisSurprising,
        ),
        whyItFeelsBackwards: coerceString(
          asRecord(record.paradox).whyItFeelsBackwards,
          fallback.paradox.whyItFeelsBackwards,
        ),
      },
      stakes: {
        ifEmbraced: coerceString(asRecord(record.stakes).ifEmbraced, fallback.stakes.ifEmbraced),
        ifIgnored: coerceString(asRecord(record.stakes).ifIgnored, fallback.stakes.ifIgnored),
      },
      evidence: {
        methods: coerceStringArray(asRecord(record.evidence).methods).filter((method): method is CoreTruthsArtifact["evidence"]["methods"][number] =>
          [
            "Story/Narrative",
            "Framework/System/Model",
            "Research/Data/Studies",
            "Analogy/Metaphor",
            "Real example/Case study",
          ].includes(method),
        ),
        specificEvidence: coerceString(
          asRecord(record.evidence).specificEvidence,
          fallback.evidence.specificEvidence,
        ),
      },
      personaExperiences: personaContexts.map((persona, index) => {
        const entry = asRecord(personaExperiencesRaw[index]);
        const voiceRecord = asRecord(entry.voiceBlendResonates);
        return {
          personaName: coerceString(entry.personaName, persona.name),
          theirVersionOfTruth: coerceString(
            entry.theirVersionOfTruth,
            fallback.personaExperiences[index]?.theirVersionOfTruth || fallback.completeTruth,
          ),
          whatMakesItLand: coerceString(
            entry.whatMakesItLand,
            fallback.personaExperiences[index]?.whatMakesItLand || fallback.completeTruth,
          ),
          voiceBlendResonates: {
            voice: normalizeTruthVoice(voiceRecord.voice ?? persona.voiceHint),
            why: coerceString(
              voiceRecord.why,
              fallback.personaExperiences[index]?.voiceBlendResonates.why ||
                `${persona.voiceHint} is the best fit for this persona.`,
            ),
          },
        };
      }),
      whyNow: {
        whyUrgentNow: coerceString(asRecord(record.whyNow).whyUrgentNow, fallback.whyNow.whyUrgentNow),
        escalatedProblem: coerceString(
          asRecord(record.whyNow).escalatedProblem,
          fallback.whyNow.escalatedProblem,
        ),
      },
      bridge: {
        permissionNeeded: coerceString(
          asRecord(record.bridge).permissionNeeded,
          fallback.bridge.permissionNeeded,
        ),
        transitionReframe: coerceString(
          asRecord(record.bridge).transitionReframe,
          fallback.bridge.transitionReframe,
        ),
        whatStaysSame: coerceString(
          asRecord(record.bridge).whatStaysSame,
          fallback.bridge.whatStaysSame,
        ),
      },
      completeTruth: coerceString(record.completeTruth, fallback.completeTruth),
      metadata: asRecord(record.metadata),
    };

    return CoreTruthsArtifactSchema.parse({
      ...normalized,
      evidence: {
        ...normalized.evidence,
        methods:
          normalized.evidence.methods.length > 0
            ? normalized.evidence.methods
            : fallback.evidence.methods,
      },
    });
  }

  const legacyTruthsRaw = Array.isArray(record.truths) ? record.truths : [];
  if (legacyTruthsRaw.length > 0) {
    const legacyTruths = legacyTruthsRaw.map((truth) => {
      const truthRecord = asRecord(truth);
      return {
        truth: coerceString(truthRecord.truth, fallback.coreInsight.coreTruth),
        foundationalInsight: coerceString(
          truthRecord.foundationalInsight,
          fallback.paradox.whatMakesThisSurprising,
        ),
        bookRelevance: coerceString(truthRecord.bookRelevance, fallback.stakes.ifEmbraced),
      };
    });

    return {
      ...fallback,
      coreInsight: {
        falseBelief: fallback.coreInsight.falseBelief,
        coreTruth: legacyTruths[0].truth,
      },
      paradox: {
        whatMakesThisSurprising: legacyTruths[0].foundationalInsight,
        whyItFeelsBackwards: fallback.paradox.whyItFeelsBackwards,
      },
      stakes: {
        ifEmbraced: legacyTruths[0].bookRelevance,
        ifIgnored: fallback.stakes.ifIgnored,
      },
      legacyTruths,
      metadata: asRecord(record.metadata),
    };
  }

  return fallback;
}

// Core Truths Generation
export async function maybeGenerateCoreTruths(
  promise: PromiseBrief,
  audienceResearch?: AudienceResearchArtifact,
  deepProfiles?: PersonaDeepProfile[],
  simplePersonas?: PersonaPack["personas"],
  bookSetupProfile?: BookSetupProfile | null,
  bookId?: string,
): Promise<CoreTruthsArtifact> {
  try {
    console.log(`[maybeGenerateCoreTruths] Starting...`);
    const model = await getChatModel();
    const personaContexts = buildTruthPersonaContexts(promise, deepProfiles, simplePersonas);
    const groundingContext = buildTruthGroundingContext(
      promise,
      audienceResearch,
      deepProfiles,
      simplePersonas,
      personaContexts,
    );

    if (!model) {
      console.log(`[maybeGenerateCoreTruths] No model, using fallback`);
      return {
        ...createFallbackCoreTruthArtifact(promise, personaContexts),
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          model: "fallback",
          grounding: {
            previousPhases: groundingContext.previousPhases,
            audienceSignals: groundingContext.audienceSignals,
            kbSources: [],
          },
        },
      };
    }

    // Get knowledge base context
    let knowledgeContext = "";
    let kbSources: string[] = [];
    if (bookId) {
      const knowledgeGrounding = await getKnowledgeGroundingForPrompt(
        bookId,
        "core truths foundational beliefs principles",
        5,
      );
      knowledgeContext = knowledgeGrounding.text;
      kbSources = knowledgeGrounding.sourceTitles;
    }

    const systemPrompt = `${CORE_TRUTHS_SYSTEM_PROMPT}\n\nBook Voice Context:\n${formatSetupContextForPrompt(bookSetupProfile)}${knowledgeContext}`;
    const rawResponse = await withTimeout(
      model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(
          JSON.stringify({
            ...groundingContext.promptPayload,
          }),
        ),
      ]),
      90000,
      "Truth generation timed out after 90 seconds",
    );
    const stopReason = getStopReason(rawResponse);
    const usageMetadata = getUsageMetadata(rawResponse);
    console.log(`[maybeGenerateCoreTruths] Stop reason: ${stopReason ?? "unknown"}`);
    console.log("[maybeGenerateCoreTruths] Response metadata:", getResponseMetadata(rawResponse));
    console.log("[maybeGenerateCoreTruths] Usage metadata:", usageMetadata);

    const rawLLMText = extractTextFromResponse(rawResponse);
    console.log(`[maybeGenerateCoreTruths] Raw text length: ${rawLLMText.length}`);
    const jsonText = extractJsonText(rawLLMText);
    console.log(`[maybeGenerateCoreTruths] Extracted JSON length: ${jsonText.length}`);

    const parsed = JSON.parse(jsonText) as unknown;
    const normalized = normalizeCoreTruthsArtifact(parsed, promise, personaContexts);
    const result = CoreTruthsArtifactSchema.parse({
      ...normalized,
      metadata: {
        ...(normalized.metadata ?? {}),
        createdAt:
          typeof normalized.metadata?.createdAt === "string"
            ? normalized.metadata.createdAt
            : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        model: resolveModelSpec("promise:author"),
        tokenUsage: normalizeTokenUsageMetadata(usageMetadata),
        grounding: {
          previousPhases: groundingContext.previousPhases,
          audienceSignals: groundingContext.audienceSignals,
          kbSources,
        },
      },
    });
    console.log(`[maybeGenerateCoreTruths] Result obtained`);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[maybeGenerateCoreTruths] Error:`, errorMsg);
    throw error;
  }
}

// Transformation Arc Generation
export async function maybeGenerateTransformationArc(
  promise: PromiseBrief,
  deepProfiles?: PersonaDeepProfile[],
  simplePersonas?: PersonaPack["personas"],
  bookSetupProfile?: BookSetupProfile | null,
  bookId?: string,
): Promise<TransformationArtifact> {
  try {
    console.log(`[maybeGenerateTransformationArc] Starting...`);
    const model = await getChatModel();
    const personaContexts = buildTruthPersonaContexts(
      promise,
      deepProfiles,
      simplePersonas,
    );

    if (!model) {
      console.log(`[maybeGenerateTransformationArc] No model, using fallback`);
      return {
        ...createFallbackTransformationArtifact(promise, personaContexts),
        metadata: {
          ...(createFallbackTransformationArtifact(promise, personaContexts).metadata ?? {}),
          updatedAt: new Date().toISOString(),
          model: "fallback",
        },
      };
    }

    // Get knowledge base context
    let knowledgeContext = "";
    if (bookId) {
      knowledgeContext = await getKnowledgeContextForPrompt(
        bookId,
        "transformation before after change journey process",
        5
      );
    }

    const systemPrompt = `${TRANSFORMATION_ARC_SYSTEM_PROMPT}\n\nBook Voice Context:\n${formatSetupContextForPrompt(bookSetupProfile)}${knowledgeContext}`;
    const rawResponse = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(
        JSON.stringify({
          promise,
          personas: personaContexts,
        }),
      ),
    ]);

    const stopReason = getStopReason(rawResponse);
    const usageMetadata = getUsageMetadata(rawResponse);
    console.log(`[maybeGenerateTransformationArc] Stop reason: ${stopReason ?? "unknown"}`);
    console.log("[maybeGenerateTransformationArc] Response metadata:", getResponseMetadata(rawResponse));
    console.log("[maybeGenerateTransformationArc] Usage metadata:", usageMetadata);

    const rawText = extractTextFromResponse(rawResponse);
    console.log(`[maybeGenerateTransformationArc] Raw text length: ${rawText.length}`);
    const jsonText = extractJsonText(rawText);
    console.log(`[maybeGenerateTransformationArc] Extracted JSON length: ${jsonText.length}`);

    const parsed = JSON.parse(jsonText);
    const normalized = normalizeTransformationArtifact(parsed, promise, personaContexts);
    const result = TransformationArtifactSchema.parse({
      ...normalized,
      metadata: mergeArtifactMetadata(normalized.metadata, {
        createdAt:
          typeof normalized.metadata?.createdAt === "string"
            ? normalized.metadata.createdAt
            : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        model: resolveModelSpec("promise:author"),
        tokenUsage: normalizeTokenUsageMetadata(usageMetadata),
      }),
    });
    console.log(`[maybeGenerateTransformationArc] Result obtained`);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[maybeGenerateTransformationArc] Error:`, errorMsg);
    if (error instanceof JsonExtractionError) {
      console.error("[maybeGenerateTransformationArc] JSON extraction details:", error.details);
    }
    throw error;
  }
}

async function loadContextNode(state: PromiseWorkflowState) {
  const book = await getOrCreateBookBySlug(state.bookSlug);
  const stage = await getStageForBook(book.id, StageKey.PROMISE);
  const committedBookSetup = await getCommittedBookSetup(book.id);
  const referenceDocuments = await listBookSourceDocuments({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    enabledOnly: true,
  });
  const artifacts = await getPromiseArtifacts(book.id);
  const promiseBriefVersions = await getPromiseBriefVersions(book.id);
  const chatArtifact = artifacts.find(
    (artifact) => artifact.artifactType === ArtifactType.PROMISE_CHAT,
  );
  const latestChatVersion = chatArtifact?.versions[0];
  const conversation = parseArtifactJson<{ messages?: PromiseMessage[] }>(
    latestChatVersion?.contentJson,
    { messages: [] },
  );

  return {
    bookId: book.id,
    stageId: stage?.id,
    bookSetupProfile: normalizeBookSetupProfile(committedBookSetup?.contentJson),
    referenceMaterials: referenceDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      mimeType: document.mimeType,
      note:
        document.metadataJson &&
        typeof document.metadataJson === "object" &&
        "note" in document.metadataJson &&
        typeof document.metadataJson.note === "string"
          ? document.metadataJson.note
          : "",
    })),
    conversationMessages: conversation.messages ?? [],
  };
}

async function appendUserMessageNode(state: PromiseWorkflowState) {
  return {
    conversationMessages: [
      ...state.conversationMessages,
      {
        role: "user" as const,
        content: state.userInput,
      },
    ],
  };
}

async function generatePromiseReplyNode(state: PromiseWorkflowState) {
  const assistantReply = await maybeGenerateAssistantReplyWithSetup(
    state.conversationMessages,
    state.bookSetupProfile,
    state.referenceMaterials,
  );

  return {
    assistantReply,
    conversationMessages: [
      ...state.conversationMessages,
      {
        role: "assistant" as const,
        content: assistantReply,
      },
    ],
  };
}

async function extractPromiseNode(state: PromiseWorkflowState) {
  return {
    extractedPromise: await maybeExtractPromise(
      state.bookSlug,
      state.conversationMessages,
      state.assistantReply ?? "",
      state.bookSetupProfile,
      state.referenceMaterials,
    ),
  };
}

async function scorePromiseNode(state: PromiseWorkflowState) {
  if (!state.extractedPromise) {
    return {};
  }

  return {
    scorecard: await maybeScorePromise(state.extractedPromise),
  };
}

async function personaNode(state: PromiseWorkflowState) {
  if (!state.extractedPromise) {
    return {};
  }

  return {
    personaPack: await maybeGeneratePersonas(state.extractedPromise),
  };
}

async function marketNode(state: PromiseWorkflowState) {
  if (!state.extractedPromise) {
    return {};
  }

  return {
    marketReport: await maybeGenerateMarketReport(state.extractedPromise),
  };
}

async function recommendationsNode(state: PromiseWorkflowState) {
  if (!state.extractedPromise || !state.marketReport || !state.personaPack) {
    return {};
  }

  return {
    recommendations: await maybeGenerateRecommendations(
      state.extractedPromise,
      state.marketReport,
      state.personaPack,
    ),
  };
}

async function persistNode(state: PromiseWorkflowState) {
  if (!state.bookId) {
    return {};
  }

  await createPromiseArtifactVersion({
    bookId: state.bookId,
    artifactType: ArtifactType.PROMISE_CHAT,
    title: "Promise Conversation",
    summary: "Conversation history for iterative promise refinement.",
    contentJson: {
      messages: state.conversationMessages,
    },
    contentText: state.conversationMessages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n\n"),
  });

  if (state.extractedPromise) {
    await createPromiseArtifactVersion({
      bookId: state.bookId,
      artifactType: ArtifactType.PROMISE_BRIEF,
      title: "Promise Brief",
      summary: state.extractedPromise.promiseStatement,
      contentJson: state.extractedPromise,
      contentText: state.extractedPromise.promiseStatement,
    });
  }

  if (state.scorecard) {
    await createPromiseArtifactVersion({
      bookId: state.bookId,
      artifactType: ArtifactType.PROMISE_SCORECARD,
      title: "Promise Scorecard",
      summary: "Scoring and revision guidance for the promise stage.",
      contentJson: state.scorecard,
    });
  }

  if (state.personaPack) {
    await createPromiseArtifactVersion({
      bookId: state.bookId,
      artifactType: ArtifactType.PERSONA_PACK,
      title: "Persona Pack",
      summary: "Reader personas inferred from the current promise direction.",
      contentJson: state.personaPack,
    });
  }

  if (state.marketReport) {
    await createPromiseArtifactVersion({
      bookId: state.bookId,
      artifactType: ArtifactType.MARKET_REPORT,
      title: "Market Report",
      summary: "Comparable books, risks, and opportunities for positioning.",
      contentJson: state.marketReport,
    });
  }

  if (state.recommendations) {
    await createPromiseArtifactVersion({
      bookId: state.bookId,
      artifactType: ArtifactType.POSITIONING_RECOMMENDATIONS,
      title: "Positioning Recommendations",
      summary: state.recommendations.summary,
      contentJson: state.recommendations,
      contentText: state.recommendations.summary,
    });
  }

  await createDirectionEvent({
    bookId: state.bookId,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_WORKFLOW_RAN",
    title: "Promise workflow generated a new pass",
    content: state.userInput,
    metadataJson: {
      hasCommittedSetup: Boolean(state.bookSetupProfile),
      referenceMaterialCount: state.referenceMaterials?.length ?? 0,
      conversationTurns: state.conversationMessages.length,
      generatedArtifacts: [
        state.extractedPromise ? "PROMISE_BRIEF" : null,
        state.scorecard ? "PROMISE_SCORECARD" : null,
        state.personaPack ? "PERSONA_PACK" : null,
        state.marketReport ? "MARKET_REPORT" : null,
        state.recommendations ? "POSITIONING_RECOMMENDATIONS" : null,
      ].filter(Boolean),
    },
  });

  return {};
}

const promiseGraph = new StateGraph(WorkflowState)
  .addNode("loadContext", loadContextNode)
  .addNode("appendUserMessage", appendUserMessageNode)
  .addNode("generatePromiseReply", generatePromiseReplyNode)
  .addNode("extractPromise", extractPromiseNode)
  .addNode("persistArtifacts", persistNode)
  .addEdge(START, "loadContext")
  .addEdge("loadContext", "appendUserMessage")
  .addEdge("appendUserMessage", "generatePromiseReply")
  .addEdge("generatePromiseReply", "extractPromise")
  .addEdge("extractPromise", "persistArtifacts")
  .addEdge("persistArtifacts", END)
  .compile();

export async function runPromiseWorkflow(bookSlug: string, userInput: string) {
  return promiseGraph.invoke({
    bookSlug,
    userInput,
    bookSetupProfile: null,
    referenceMaterials: [],
    conversationMessages: [],
  });
}

export async function commitPromiseWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.PROMISE);
  const phaseApprovals = normalizePromisePhaseApprovals(stage?.metadataJson);
  const allPromiseSectionsApproved = PROMISE_TAB_ORDER.every(
    (tab) => phaseApprovals[tab]?.status === "approved",
  );

  if (!allPromiseSectionsApproved) {
    throw new Error("All Promise sections must be approved before committing the Promise stage.");
  }

  await commitPromiseStageBundle(book.id);
  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_COMMITTED",
    title: "Committed promise stage",
    content: "The current promise bundle was approved for downstream stages.",
  });
}

export async function getPromiseWorkspace(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const bookSetupVersion = await getCommittedBookSetup(book.id);
  const sourceDocuments = await listBookSourceDocuments({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
  });
  const stage = await getStageForBook(book.id, StageKey.PROMISE);
  const artifacts = await getPromiseArtifacts(book.id);
  const promiseBriefVersions = await getPromiseBriefVersions(book.id);
  const directionEvents = await listDirectionEventsForStage({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
  });

  const artifactMap = new Map(artifacts.map((artifact) => [artifact.artifactType, artifact]));
  const artifactAvailability: PromiseArtifactAvailability = {
    promiseBrief: artifactMap.has(ArtifactType.PROMISE_BRIEF),
    audienceResearch: artifactMap.has(ArtifactType.AUDIENCE_RESEARCH),
    coreTruths: artifactMap.has(ArtifactType.CORE_TRUTHS),
    transformationArc: artifactMap.has(ArtifactType.TRANSFORMATION_ARC),
    market: artifactMap.has(ArtifactType.MARKET_REPORT),
    recommendations: artifactMap.has(ArtifactType.POSITIONING_RECOMMENDATIONS),
    bookPromiseReport: artifactMap.has(ArtifactType.BOOK_PROMISE_REPORT),
  };

  const conversation = parseArtifactJson<{ messages?: PromiseMessage[] }>(
    artifactMap.get(ArtifactType.PROMISE_CHAT)?.versions[0]?.contentJson,
    { messages: [] },
  );
  const bookSetupProfile = normalizeBookSetupProfile(bookSetupVersion?.contentJson);
  const promiseBrief = parseArtifactJson<PromiseBrief>(
    artifactMap.get(ArtifactType.PROMISE_BRIEF)?.versions[0]?.contentJson,
    fallbackPromiseExtraction(
      book.slug,
      conversation.messages ?? [],
      "",
      bookSetupProfile,
    ),
  );
  const scorecard = parseArtifactJson<PromiseScorecard>(
    artifactMap.get(ArtifactType.PROMISE_SCORECARD)?.versions[0]?.contentJson,
    fallbackScorecard(promiseBrief),
  );
  const personaPack = parseArtifactJson<PersonaPack>(
    artifactMap.get(ArtifactType.PERSONA_PACK)?.versions[0]?.contentJson,
    fallbackPersonaPack(promiseBrief),
  );
  const audienceResearch = parseArtifactJson<AudienceResearchArtifact | undefined>(
    artifactMap.get(ArtifactType.AUDIENCE_RESEARCH)?.versions[0]?.contentJson,
    undefined,
  );
  const personaContexts = buildTruthPersonaContexts(
    promiseBrief,
    audienceResearch?.phase2?.personas,
    personaPack.personas,
  );
  const coreTruthArtifactRaw = artifactMap.get(ArtifactType.CORE_TRUTHS)?.versions[0]?.contentJson;
  const coreTruths =
    coreTruthArtifactRaw && typeof coreTruthArtifactRaw === "object"
      ? normalizeCoreTruthsArtifact(
          coreTruthArtifactRaw,
          promiseBrief,
          personaContexts,
        )
      : undefined;
  const transformationArtifactRaw = artifactMap.get(ArtifactType.TRANSFORMATION_ARC)?.versions[0]?.contentJson;
  const transformationArc =
    transformationArtifactRaw && typeof transformationArtifactRaw === "object"
      ? normalizeTransformationArtifact(
          transformationArtifactRaw,
          promiseBrief,
          personaContexts,
        )
      : undefined;
  const marketArtifactRaw = artifactMap.get(ArtifactType.MARKET_REPORT)?.versions[0]?.contentJson;
  const marketReport =
    marketArtifactRaw && typeof marketArtifactRaw === "object"
      ? normalizeMarketReport(
          marketArtifactRaw,
          promiseBrief,
          personaContexts,
          coreTruths,
          transformationArc,
        )
      : createFallbackMarketReport(
          promiseBrief,
          personaContexts,
          coreTruths,
          transformationArc,
        );
  const recommendationsArtifactRaw =
    artifactMap.get(ArtifactType.POSITIONING_RECOMMENDATIONS)?.versions[0]?.contentJson;
  const recommendations =
    recommendationsArtifactRaw && typeof recommendationsArtifactRaw === "object"
      ? normalizeRecommendationsArtifact(
          recommendationsArtifactRaw,
          promiseBrief,
          marketReport,
          personaContexts,
          coreTruths,
          transformationArc,
        )
      : fallbackRecommendations(
          promiseBrief,
          marketReport,
          personaContexts,
          coreTruths,
          transformationArc,
        );
  const stageMetadata = asRecord(stage?.metadataJson);
  const titleSubtitleFinalizationRaw = stageMetadata.titleSubtitleFinalization;
  const titleSubtitleFinalization =
    titleSubtitleFinalizationRaw && typeof titleSubtitleFinalizationRaw === "object"
      ? normalizeTitleSubtitleFinalization(
          titleSubtitleFinalizationRaw,
          createFallbackTitleSubtitleFinalization(
            promiseBrief,
            marketReport,
            recommendations,
            personaContexts,
            audienceResearch,
            coreTruths,
            transformationArc,
            bookSetupProfile,
          ),
        )
      : undefined;
  const bookPromiseArtifactRaw =
    artifactMap.get(ArtifactType.BOOK_PROMISE_REPORT)?.versions[0]?.contentJson;
  const bookPromiseReport =
    bookPromiseArtifactRaw && typeof bookPromiseArtifactRaw === "object"
      ? normalizeBookPromiseReportArtifact(
          bookPromiseArtifactRaw,
          promiseBrief,
          personaContexts,
          marketReport,
          recommendations,
          audienceResearch,
          coreTruths,
          transformationArc,
          bookSetupProfile,
          titleSubtitleFinalization,
        )
      : undefined;
  const phaseApprovals = normalizePromisePhaseApprovals(stage?.metadataJson);
  const parsedPromiseVersions = promiseBriefVersions.map((version) => ({
    id: version.id,
    versionNumber: version.versionNumber,
    lifecycleState: version.lifecycleState,
    createdAt: version.createdAt,
      promiseBrief: parseArtifactJson<PromiseBrief>(
        version.contentJson,
        fallbackPromiseExtraction(
          book.slug,
          conversation.messages ?? [],
          "",
          bookSetupProfile,
        ),
      ),
  }));
  const compareVersions =
    parsedPromiseVersions.length >= 2
      ? {
          latest: parsedPromiseVersions[0],
          previous: parsedPromiseVersions[1],
        }
      : null;

  return {
    book,
    stage,
    bookSetupProfile,
    sourceDocuments: sourceDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      mimeType: document.mimeType,
      storagePath: document.storagePath,
      createdAt: document.createdAt,
      enabled:
        document.metadataJson &&
        typeof document.metadataJson === "object" &&
        "enabled" in document.metadataJson &&
        typeof document.metadataJson.enabled === "boolean"
          ? document.metadataJson.enabled
          : true,
      note:
        document.metadataJson &&
        typeof document.metadataJson === "object" &&
        "note" in document.metadataJson &&
        typeof document.metadataJson.note === "string"
          ? document.metadataJson.note
          : "",
    })),
    conversationMessages: conversation.messages ?? [],
    promiseBrief,
    scorecard,
    personas: personaPack,
    market: marketReport,
    recommendations,
    audienceResearch,
    coreTruths,
    transformationArc,
    titleSubtitleFinalization,
    bookPromiseReport,
    phaseApprovals,
    artifactAvailability,
    directionEvents,
    promiseVersions: parsedPromiseVersions,
    compareVersions,
  };
}

export async function getOutlineWorkspace(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const promiseStage = await getStageForBook(book.id, StageKey.PROMISE);
  const outlineStage = await getStageForBook(book.id, StageKey.OUTLINE);
  const committedPromiseVersion = await getCommittedPromiseBrief(book.id);

  const committedPromise = parseArtifactJson<PromiseBrief | null>(
    committedPromiseVersion?.contentJson,
    null,
  );

  return {
    book,
    promiseStage,
    outlineStage,
    committedPromise,
    outlineReadiness: committedPromise
      ? {
          status: "ready",
          nextMoves: [
            "Generate chapter-level big ideas from the committed promise",
            "Define the chapter progression and transformation arc",
            "Map each chapter to a ME -> WE -> CORE TRUTH -> YOU -> WE flow",
          ],
        }
      : {
          status: "blocked",
          nextMoves: [
            "Commit the Promise stage first",
            "Confirm the primary reader and core truth",
            "Lock the commercial positioning before outlining",
          ],
        },
  };
}
