import type {
  CoreTruthsArtifact,
  MarketReport,
  PromiseBrief,
  PromiseTokenUsage,
  TransformationArtifact,
} from "../../promise-types";
import { normalizeMarketDecision } from "./report-schema";
import type { TruthPersonaContext } from "./report-presentation";
import { MarketReportSchema } from "./market-analysis-report";
import { createFallbackMarketReport } from "./market-analysis-fallback";
import {
  asRecord,
  coerceString,
  coerceStringArray,
  normalizeAncillaryProduct,
  normalizeComparableSummary,
  normalizeMarketDirectCompetitor,
  normalizeMarketIndirectCompetitor,
  normalizeMarketPersonaUrgency,
  normalizePricingTier,
  normalizeRiskProfile,
} from "./market-analysis-support";

function asOptionalFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function normalizeTokenUsageMetadata(raw: unknown): PromiseTokenUsage | null {
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
    return null;
  }

  return tokenUsage;
}

export function normalizeMarketReport(
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
        fallback.metadata?.tokenUsage ??
        null,
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
