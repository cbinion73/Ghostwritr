import type { BookSetupProfile } from "../../book-setup-types";
import type {
  AudienceResearchArtifact,
  BookPromiseReport,
  CoreTruthsArtifact,
  MarketReport,
  PersonaPack,
  PositioningRecommendations,
  PromiseBrief,
  TitleSubtitleFinalization,
  TransformationArtifact,
} from "../../promise-types";
import {
  extractExecutiveSummaryFromMarkdown,
  extractMarkdownLabeledValue,
  extractMarkdownNumberedList,
} from "./report-markdown";
import {
  buildBookPitchCompositionGroundingContext,
  buildBookPitchCompositionGroundingMetadata,
} from "./report-grounding-metadata";
import { fallbackBookPromiseReport } from "./report-fallback";
import {
  containsNamedAudienceReference,
} from "./report-composition-helpers";
import { buildTruthPersonaContexts } from "./report-persona-context";
import { BookPromiseReportSchema, normalizeMarketDecision } from "./report-schema";

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
  const groundingContext = buildBookPitchCompositionGroundingContext({
    audienceResearch,
    coreTruths,
    transformationArc,
    marketReport,
    recommendations,
    personaContexts,
  });
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
      tokenUsage: existingReport?.metadata?.tokenUsage ?? null,
      grounding: buildBookPitchCompositionGroundingMetadata(
        groundingContext,
        existingReport?.metadata?.grounding,
      ),
    },
  });
}
