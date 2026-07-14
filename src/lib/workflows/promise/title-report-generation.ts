import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { BookSetupProfile } from "../../book-setup-types";
import type {
  AudienceResearchArtifact,
  BookPromiseReport,
  CoreTruthsArtifact,
  MarketReport,
  PersonaDeepProfile,
  PersonaPack,
  PositioningRecommendations,
  PromiseBrief,
  PromiseTokenUsage,
  TitleSubtitleFinalization,
  TransformationArtifact,
} from "../../promise-types";
import { getBookKnowledgeBase } from "../../services/knowledge-base";
import { resolveModelSpec } from "../../llm/routing";
import {
  BOOK_PITCH_SECTION_PLANS,
  BOOK_PITCH_SYSTEM_PROMPT,
  TITLE_SUBTITLE_FINALIZATION_SYSTEM_PROMPT,
} from "./generation-prompts";
import {
  formatSetupContextForPrompt,
  getKnowledgeGroundingForPrompt,
} from "./generation-context";
import {
  JsonExtractionError,
  extractJsonText,
  extractTextFromResponse,
  getUsageMetadata,
  withTimeout,
} from "./generation-response";
import {
  ensurePromiseEnvLoaded,
  getBookPitchModel,
} from "./generation-models";
import { normalizeTokenUsageMetadata } from "./market-analysis-normalization";
import { buildRecommendationsGroundingContext } from "./market-recommendations-support";
import { composeBookPromiseReportFromMarkdown } from "./report-composition";
import { replaceBookPitchPersonaNames } from "./report-composition-helpers";
import { fallbackBookPromiseReport } from "./report-fallback";
import { buildTruthPersonaContexts } from "./report-persona-context";
import {
  buildBookPitchAudienceProfiles,
  getSelectedTitleSubtitle,
  summarizeBookPitchTargetAudience,
  summarizeVoiceBlendForPitch,
  type TruthPersonaContext,
} from "./report-presentation";
import {
  createFallbackTitleSubtitleFinalization,
  normalizeTitleSubtitleFinalization,
} from "./workspace-loader-support";
import { getModelForRole } from "../../llm/routing";

async function getChatModel(
  overrides: {
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    maxRetries?: number;
  } = {},
) {
  ensurePromiseEnvLoaded();
  return getModelForRole("promise:author", {
    temperature: overrides.temperature ?? 0.25,
    maxOutputTokens: overrides.maxOutputTokens ?? 4000,
    timeoutMs: overrides.timeoutMs ?? 90000,
    maxRetries: overrides.maxRetries ?? 2,
  });
}

async function generateBookPitchMarkdownInSections(params: {
  model: NonNullable<Awaited<ReturnType<typeof getBookPitchModel>>>;
  systemPrompt: string;
  promptPayload: Record<string, unknown>;
}): Promise<{ markdown: string; tokenUsage: PromiseTokenUsage | null }> {
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
    tokenUsage: combinedUsage ?? null,
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
          tokenUsage: fallback.metadata?.tokenUsage ?? null,
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
        tokenUsage: tokenUsage ?? null,
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
          tokenUsage: fallback.metadata?.tokenUsage ?? null,
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
