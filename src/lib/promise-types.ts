export type PromiseMessage = {
  role: "user" | "assistant";
  content: string;
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
};

export type PositioningRecommendations = {
  summary: string;
  recommendations: string[];
};
