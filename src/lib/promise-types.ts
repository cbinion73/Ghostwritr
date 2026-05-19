export type PromiseMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PromiseTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
  reasoningTokens?: number;
};

export type WorkflowGroundingMetadata = {
  previousPhases?: string[];
  kbSources?: string[];
  audienceSignals?: string[];
};

export type PromiseArtifactMetadata = {
  createdAt?: string;
  updatedAt?: string;
  model?: string;
  grounding?: WorkflowGroundingMetadata;
  tokenUsage?: PromiseTokenUsage;
};

export type PromiseBrief = {
  workingTitle: string;
  audiencePrimary: string;
  audienceSecondary: string[];
  category: string;
  readerProblem: string;
  readerDesire: string;
  bigIdea: string;
  coreTruth: string;
  transformationBefore: string;
  transformationAfter: string;
  differentiation: string;
  promiseStatement: string;
  stakes: string;
  tone: string[];
  openQuestions: string[];
  metadata?: PromiseArtifactMetadata;
};

export type PromiseScorecard = {
  scores: {
    clarity: number;
    audienceFit: number;
    distinctiveness: number;
    commercialPull: number;
    credibility: number;
  };
  strengths: string[];
  concerns: string[];
  nextBestRevisions: string[];
};

export type PersonaPack = {
  personas: Array<{
    id: string;
    name: string;
    priority: "primary" | "secondary";
    context: string;
    painPoints: string[];
    desiredOutcomes: string[];
    buyingMotivations: string[];
    languageCues: string[];
  }>;
};

export type MarketReport = {
  marketCategory: string;
  comparisonTitles: Array<{
    title: string;
    author: string;
    whyRelevant: string;
    differenceOpportunity: string;
  }>;
  saturationAssessment: string;
  attractionDrivers: string[];
  commercialRisks: string[];
  recommendations: string[];
  executiveSummary: {
    headline: string;
    overallRecommendation: "GO" | "NO_GO" | "CONDITIONAL_GO";
    rationale: string;
    strategicPriority: string;
  };
  competitiveLandscape: {
    directCompetitors: Array<{
      title: string;
      author: string;
      credentials: string;
      positioning: string;
      targetAudience: string;
      strengths: string[];
      gaps: string[];
      estimatedSales: string;
      pricePoint: string;
      whyRelevant: string;
      differenceOpportunity: string;
    }>;
    indirectCompetitors: Array<{
      category: string;
      examples: string[];
      currentAlternative: string;
      spendProfile: string;
    }>;
    competitiveAdvantage: {
      differentiation: string;
      unfairAdvantage: string;
      whoChoosesThisBook: string;
      gapFilled: string;
    };
    marketPositioning: {
      academicToPractical: string;
      nicheToBroad: string;
      theoreticalToActionOriented: string;
      industrySpecificToUniversal: string;
      whiteSpace: string;
    };
  };
  marketSizing: {
    totalAddressableMarket: string;
    serviceableAddressableMarket: string;
    serviceableObtainableMarket: string;
    yearOneToThreeOutlook: string;
    trends: string;
    tailwinds: string[];
    headwinds: string[];
  };
  audienceDemand: {
    personaUrgency: Array<{
      personaName: string;
      urgency: string;
      whyNow: string;
    }>;
    searchBehavior: string[];
    contentConsumptionPatterns: string[];
    willingnessToPay: string;
    validationSignals: string;
    openQuestions: string[];
  };
  pricingStrategy: {
    comparableBookPricing: string;
    costAnalysis: string;
    pricingTiers: Array<{
      format: string;
      pricePoint: string;
      rationale: string;
    }>;
    pricePositioning: string;
    launchPricing: string;
  };
  monetizationEcosystem: {
    directBookRevenue: string;
    ancillaryProducts: Array<{
      channel: string;
      offer: string;
      pricePoint: string;
      revenuePotential: string;
    }>;
    speakingAndAuthority: string;
    consultingAndCoaching: string;
    mediaAndLicensing: string;
    contentAndCommunity: string;
    totalEcosystemRevenueProjection: string;
  };
  distributionAndLaunch: {
    publishingOptions: string;
    distributionChannels: string[];
    launchStrategy: string;
    marketingChannels: string[];
    yearOneDistributionMix: string;
  };
  riskAssessment: {
    overallRiskProfile: "Low" | "Medium" | "High";
    marketRisks: string[];
    authorPlatformRisks: string[];
    contentMessageRisks: string[];
    economicTimingRisks: string[];
    executionRisks: string[];
    mitigationPlan: string[];
    dealBreakers: string[];
  };
  successMetrics: {
    yearOneGoals: string[];
    keyPerformanceIndicators: string[];
    successDefinition: string;
    milestones: string[];
  };
  financialProjections: {
    yearOneRevenue: string;
    yearOneCosts: string;
    profitabilityAnalysis: string;
    yearsTwoToThreeProjection: string;
    sensitivityAnalysis: string;
  };
  goNoGoRecommendation: {
    marketValidation: string;
    competitivePosition: string;
    businessModelViability: string;
    personalFit: string;
    overallRecommendation: "GO" | "NO_GO" | "CONDITIONAL_GO";
    conditions: string[];
    nextSteps: string[];
  };
  metadata?: PromiseArtifactMetadata;
};

export type PositioningRecommendations = {
  summary: string;
  recommendations: string[];
  bookStrategy: {
    coreMessagePositioning: string;
    audienceTargeting: string;
    contentDepthAndBreadth: string;
    lengthAndStructure: string;
    voiceAndToneRecommendations: string;
    differentiationStrategy: string;
  };
  positioningAndMarketing: {
    marketPositioningStatement: string;
    keyDifferentiators: string[];
    targetCustomerProfile: string;
    positioningByChannel: string[];
    messagingFramework: string[];
    competitivePositioningQuadrant: string;
  };
  launchAndGoToMarket: {
    publishingPathRecommendation: string;
    launchTimeline: string;
    preLaunchActivities: string[];
    launchActivities: string[];
    postLaunchActivities: string[];
    distributionChannelPriorities: string[];
    marketingBudgetAllocation: string;
  };
  personaStrategies: Array<{
    personaName: string;
    primaryPositioning: string;
    keyMessage: string;
    whereToReachThem: string[];
    priceSensitivity: string;
    contentFormatPreference: string;
    trustedInfluencers: string[];
    launchStrategy: string;
  }>;
  crossPersonaMessaging: {
    sharedMessaging: string[];
    personaSpecificMessaging: string[];
    avoidAlienating: string;
  };
  monetizationRecommendations: {
    bookPricingRecommendation: string;
    ancillaryProductRecommendations: string[];
    ecosystemBuildOutTimeline: string[];
    revenueModelRecommendation: string;
    pricingStrategyByChannel: string[];
  };
  teamAndResources: {
    writingSupport: string;
    designAndProduction: string;
    marketingAndLaunchSupport: string;
    platformAndTools: string;
    teamCompositionRecommendation: string;
    timelineAndMilestones: string[];
  };
  riskMitigationRecommendations: Array<{
    risk: string;
    mitigationStrategy: string;
    whatToMonitor: string;
    pivotPoint: string;
  }>;
  successMetricsAndKpis: {
    yearOneSuccessTargets: string[];
    monthlyKpis: string[];
    dashboardMetrics: string[];
    successMilestones: string[];
    pivotingCriteria: string[];
  };
  financialRecommendations: {
    investmentRequired: string;
    revenueProjections: string;
    profitabilityTimeline: string;
    pricingSummary: string[];
    budgetAllocationRecommendation: string;
  };
  finalRecommendation: {
    overallRecommendation: "GO" | "NO_GO" | "CONDITIONAL_GO";
    rationale: string;
    strategicDirection: string;
    criticalSuccessFactors: string[];
    immediateNextSteps: string[];
    goNoGoGates: string[];
    contingencyPlanning: string[];
  };
  metadata?: PromiseArtifactMetadata;
};

export type TitleSubtitleFinalization = {
  finalizedTitle: string;
  finalizedSubtitle: string;
  positioningHook: string;
  titleRationale: string;
  subtitleRationale: string;
  audienceFit: string;
  marketFit: string;
  alternatives: Array<{
    title: string;
    subtitle: string;
    whyItCouldWork: string;
  }>;
  metadata?: PromiseArtifactMetadata;
};

export type PromiseTabName =
  | "promise-statement"
  | "audience"
  | "truth"
  | "transformation"
  | "market"
  | "recommendations"
  | "book-promise";

export type PromisePhaseApprovalStatus = "pending" | "approved" | "rejected";

export type PromisePhaseApprovalRecord = {
  status: PromisePhaseApprovalStatus;
  feedback?: string;
  approvedAt?: string;
  rejectedAt?: string;
};

export type PromisePhaseApprovals = Partial<
  Record<PromiseTabName, PromisePhaseApprovalRecord>
>;

export type PromiseArtifactAvailability = {
  promiseBrief: boolean;
  audienceResearch: boolean;
  coreTruths: boolean;
  transformationArc: boolean;
  market: boolean;
  recommendations: boolean;
  bookPromiseReport: boolean;
};

// ============================================
// AUDIENCE RESEARCH TYPES (Phase 1, 2, 3)
// ============================================

// Phase 1: Audience Discovery
export type AudienceResearchPhase1 = {
  researchQuestions: Array<{
    question: string;
    answer: string;
  }>;
  identifiedUserTypes: {
    id?: string;
    name: string;
    description: string;
    details: string[];
  }[];
};

// Phase 2: Deep Persona Research
export type PersonaDeepProfile = {
  id: string;
  name: string;
  priority?: "primary" | "secondary";
  demographics: {
    role: string;
    companyType: string;
    yearsInRole: number;
    careerPath: string;
    dayInTheLife: string;
    reportsTo: string;
    teamSize: number;
  };
  currentSituation: {
    whatTheyDo: string;
    whatWorks: string[];
    whatDoesntWork: string[];
    timeAllocation: string;
    biggestFrustration: string;
  };
  goals: Array<{
    goal: string;
    type: "outcome" | "feeling";
  }>;
  painPoints: Array<{
    friction: string;
    realCost: string;
  }>;
  objections: Array<{
    objection: string;
    proofNeeded: string;
  }>;
  successMetrics: Array<{
    metric: string;
    feeling?: string;
  }>;
  learningStyle: {
    prefers: string[];
    hates: string[];
    bestFormat: string;
  };
  voiceBlendFit: {
    primary: string;
    secondary?: string;
    tertiary?: string;
    reasoning: string;
  };
};

export type PersonaPackDeepProfile = {
  personas: PersonaDeepProfile[];
};

// Phase 3: Persona Comparison Analysis
export type PersonaComparisonAnalysis = {
  commonThemes: string[];
  differences: Array<{
    persona: string;
    difference: string;
  }>;
  primaryPersona: {
    name: string;
    reasoning: string;
  };
  comparisonMatrix: Array<{
    dimension: string;
    personas: Array<{
      name: string;
      value: string;
    }>;
  }>;
};

// Overall Audience Research Container
export type AudienceResearchArtifact = {
  phase: 1 | 2 | 3;
  phase1: AudienceResearchPhase1;
  phase2?: PersonaPackDeepProfile;
  phase3?: PersonaComparisonAnalysis;
  metadata?: PromiseArtifactMetadata & {
    authorNotes?: string;
  };
};

// ============================================
// CORE TRUTHS (Step 3)
// ============================================

export type CoreTruth = {
  truth: string;              // The core truth statement
  foundationalInsight: string;  // Why this matters
  bookRelevance: string;      // How it applies to this book
};

export type TruthEvidenceMethod =
  | "Story/Narrative"
  | "Framework/System/Model"
  | "Research/Data/Studies"
  | "Analogy/Metaphor"
  | "Real example/Case study";

export type TruthPersonaExperience = {
  personaName: string;
  theirVersionOfTruth: string;
  whatMakesItLand: string;
  voiceBlendResonates: {
    voice: "Andy" | "Drucker" | "Jobs";
    why: string;
  };
};

export type CoreTruthsArtifact = {
  coreInsight: {
    falseBelief: string;
    coreTruth: string;
  };
  paradox: {
    whatMakesThisSurprising: string;
    whyItFeelsBackwards: string;
  };
  stakes: {
    ifEmbraced: string;
    ifIgnored: string;
  };
  evidence: {
    methods: TruthEvidenceMethod[];
    specificEvidence: string;
  };
  personaExperiences: TruthPersonaExperience[];
  whyNow: {
    whyUrgentNow: string;
    escalatedProblem: string;
  };
  bridge: {
    permissionNeeded: string;
    transitionReframe: string;
    whatStaysSame: string;
  };
  completeTruth: string;
  metadata?: PromiseArtifactMetadata;
  legacyTruths?: CoreTruth[];
};

// ============================================
// TRANSFORMATION ARC (Step 4)
// ============================================

export type TransformationArc = {
  stage1Me: {
    personalDilemma: string;
    falseBelief: string;
    manifestation: string;
    cost: string;
    authorityToTeach: string;
    vulnerability: string;
    voiceBlend: string;
  };
  stage2We: {
    sharedProblem: string;
    universalTension: string;
    personaDilemmas: Array<{
      personaName: string;
      recognizedDilemma: string;
      whatMakesItSpecific: string;
    }>;
    readerQuestion: string;
    emotionalBridgeStories: string;
  };
  stage3Truth: {
    coreTruth: string;
    reframe: string;
    paradox: string;
    proofMechanism: string;
    personaAnswers: Array<{
      personaName: string;
      dilemmaAnswer: string;
      voiceBlendResonates: {
        voice: "Andy" | "Drucker" | "Jobs";
        why: string;
      };
    }>;
    truthForm: string;
    ifEmbraced: string;
    ifIgnored: string;
  };
  stage4You: {
    firstAction: string;
    personaApplications: Array<{
      personaName: string;
      nextStep: string;
      obstacleOrRisk: string;
    }>;
    instructionStyle: string;
    applicationResistance: string;
    successVsFailure: string;
  };
  stage5FinalWe: {
    transformedSuccess: string;
    personaOutcomes: Array<{
      personaName: string;
      breakthrough: string;
      whatBecomesPossible: string;
    }>;
    collectiveVision: string;
    identityShift: string;
    irreversibility: string;
  };
  stage6Patterns: {
    sharedThemes: string[];
    storyByStage: {
      me: string;
      we: string;
      truth: string;
      you: string;
      finalWe: string;
    };
    voiceBlendMoments: {
      andy: string;
      drucker: string;
      jobs: string;
    };
    implicitLessons: string[];
  };
  stage7BookMap: {
    openingStory: string;
    sharedDilemmaReveal: string;
    truthReveal: string;
    applicationStart: string;
    visionCasting: string;
    implicitPersonaService: string;
  };
  completeTransformation: string;
};

export type TransformationArtifact = {
  arc: TransformationArc;
  metadata?: PromiseArtifactMetadata;
};

// ============================================
// BOOK PROMISE FINAL REPORT (Step 7)
// ============================================

export type BookPromiseReport = {
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
  documentMarkdown: string;
  metadata?: PromiseArtifactMetadata;
};
