import type { BookSetupProfile } from "../../book-setup-types";
import type {
  AudienceResearchArtifact,
  BookPromiseReport,
  CoreTruthsArtifact,
  MarketReport,
  PositioningRecommendations,
  PromiseBrief,
  TitleSubtitleFinalization,
  TransformationArtifact,
} from "../../promise-types";
import {
  buildBookPitchAudienceProfiles,
  getSelectedTitleSubtitle,
  summarizeBookPitchTargetAudience,
  type PitchAudienceProfile,
  type TruthPersonaContext,
} from "./report-presentation";
import {
  renderBookPitchAudienceAndTransformation,
  renderBookPitchExecutiveSummaryAndBookVision,
  renderBookPitchFinancialRecommendationsAndAppendices,
  renderBookPitchMarketBusinessAndLaunch,
} from "./report-rendering";

type FallbackBookPitchMarkdownParams = {
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
};

function fallbackBookPitchMarkdown(params: FallbackBookPitchMarkdownParams): string {
  const executiveAndBookVision = renderBookPitchExecutiveSummaryAndBookVision(params);
  const audienceAndTransformation = renderBookPitchAudienceAndTransformation(params);
  const marketBusinessAndLaunch = renderBookPitchMarketBusinessAndLaunch(params);
  const financialRecommendationsAndAppendices =
    renderBookPitchFinancialRecommendationsAndAppendices(params);

  return `${executiveAndBookVision}

${audienceAndTransformation}

${marketBusinessAndLaunch}

${financialRecommendationsAndAppendices}`;
}

export function fallbackBookPromiseReport(
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
