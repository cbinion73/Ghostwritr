import type {
  AudienceResearchArtifact,
  CoreTruthsArtifact,
  MarketReport,
  PositioningRecommendations,
  TransformationArtifact,
  WorkflowGroundingMetadata,
} from "../../promise-types";
import type { TruthPersonaContext } from "./report-presentation";

export type BookPitchCompositionGroundingInput = {
  previousPhases?: readonly string[] | null;
  audienceSignals?: readonly string[] | null;
};

export type BookPitchCompositionGroundingSources = {
  audienceResearch?: AudienceResearchArtifact;
  coreTruths?: CoreTruthsArtifact;
  transformationArc?: TransformationArtifact;
  marketReport: MarketReport;
  recommendations: PositioningRecommendations;
  personaContexts: TruthPersonaContext[];
};

function normalizeStringList(values: readonly string[] | null | undefined): string[] {
  return [...(values ?? [])].map((value) => value.trim()).filter((value) => value.length > 0);
}

export function buildBookPitchCompositionGroundingMetadata(
  groundingContext: BookPitchCompositionGroundingInput,
  existingGrounding?: WorkflowGroundingMetadata | null,
): WorkflowGroundingMetadata {
  return {
    previousPhases: normalizeStringList(groundingContext.previousPhases),
    audienceSignals: normalizeStringList(groundingContext.audienceSignals),
    kbSources: normalizeStringList(existingGrounding?.kbSources ?? []),
  };
}

export function buildBookPitchCompositionGroundingContext({
  audienceResearch,
  coreTruths,
  transformationArc,
  marketReport,
  recommendations,
  personaContexts,
}: BookPitchCompositionGroundingSources): BookPitchCompositionGroundingInput {
  const phase1Questions =
    audienceResearch?.phase1?.researchQuestions.slice(0, 5).map((entry) => entry.answer) ?? [];
  const identifiedUserTypes =
    audienceResearch?.phase1?.identifiedUserTypes
      .slice(0, 4)
      .map((entry) => `${entry.name}: ${entry.description}`) ?? [];
  const commonThemes = audienceResearch?.phase3?.commonThemes.slice(0, 5) ?? [];
  const truthSignal = coreTruths?.coreInsight.coreTruth ?? "";
  const transformationSignal = transformationArc?.arc.stage2We.sharedProblem ?? "";

  const marketSignals = [
    ...phase1Questions,
    ...identifiedUserTypes,
    ...commonThemes,
    ...personaContexts.map((persona) => `${persona.name}: ${persona.dilemma}`),
    truthSignal,
    transformationSignal,
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 10);

  const recommendationSignals = [
    ...marketSignals,
    marketReport.executiveSummary.headline,
    marketReport.executiveSummary.rationale,
    ...marketReport.recommendations.slice(0, 3),
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 12);

  return {
    previousPhases: [
      "Promise Statement",
      audienceResearch?.phase1 ? "Audience Research Phase 1" : null,
      audienceResearch?.phase2 ? "Audience Research Phase 2" : null,
      audienceResearch?.phase3 ? "Audience Research Phase 3" : null,
      coreTruths ? "Truth" : null,
      transformationArc ? "Transformation" : null,
      "Market",
      "Recommendations",
    ].filter((value): value is string => Boolean(value)),
    audienceSignals: [
      ...recommendationSignals,
      recommendations.summary,
      recommendations.bookStrategy.audienceTargeting,
      recommendations.positioningAndMarketing.marketPositioningStatement,
      recommendations.finalRecommendation.rationale,
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, 14),
  };
}
