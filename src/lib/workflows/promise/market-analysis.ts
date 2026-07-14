import { HumanMessage } from "@langchain/core/messages";

import type { BookSetupProfile } from "../../book-setup-types";
import type {
  AudienceResearchArtifact,
  CoreTruthsArtifact,
  MarketReport,
  PersonaDeepProfile,
  PersonaPack,
  PositioningRecommendations,
  PromiseBrief,
  TransformationArtifact,
} from "../../promise-types";
import { getModelForRole, resolveModelSpec } from "../../llm/routing";
import {
  formatSetupContextForPrompt,
  getKnowledgeGroundingForPrompt,
} from "./generation-context";
import {
  MARKET_REPORT_SYSTEM_PROMPT,
  POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT,
} from "./generation-prompts";
import {
  JsonExtractionError,
  extractJsonText,
  extractTextFromResponse,
  getUsageMetadata,
  withTimeout,
} from "./generation-response";
import { createFallbackMarketReport } from "./market-analysis-fallback";
import { buildMarketGroundingContext } from "./market-analysis-grounding";
import { MarketReportSchema } from "./market-analysis-report";
import {
  normalizeMarketReport,
  normalizeTokenUsageMetadata,
} from "./market-analysis-normalization";
import {
  PositioningRecommendationsSchema,
  buildRecommendationsGroundingContext,
  fallbackRecommendations,
  normalizeRecommendationsArtifact,
} from "./market-recommendations-support";
import { buildTruthPersonaContexts } from "./report-persona-context";

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

    const model = await getModelForRole("market-analysis:research", {
      temperature: 0.25,
      maxOutputTokens: 8192,
      timeoutMs: 120000,
    });
    if (!model) {
      console.log("[maybeGenerateMarketReport] No market-analysis model available, using fallback");
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
          tokenUsage: null,
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

    const prompt = `${MARKET_REPORT_SYSTEM_PROMPT}

Book Voice Context:
${formatSetupContextForPrompt(bookSetupProfile)}${knowledgeContext}

INPUT JSON:
${JSON.stringify(groundingContext.promptPayload, null, 2)}`;

    const response = await withTimeout(
      model.invoke([new HumanMessage(prompt)]),
      120000,
      "Market generation timed out after 120 seconds",
    );
    const rawText = extractTextFromResponse(response);
    const usageMetadata = getUsageMetadata(response);
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
    const model = await getModelForRole("market-analysis:research", {
      temperature: 0.3,
      maxOutputTokens: 8192,
      timeoutMs: 120000,
    });
    if (!model) {
      console.log("[maybeGenerateRecommendations] No market-analysis model available, using fallback");
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
          tokenUsage: null,
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

    const systemPrompt = `${POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT}

Book Voice Context:
${formatSetupContextForPrompt(bookSetupProfile)}${knowledgeContext}`;

    const prompt = `${systemPrompt}

INPUT JSON:
${JSON.stringify(groundingContext.promptPayload, null, 2)}`;

    const response = await withTimeout(
      model.invoke([new HumanMessage(prompt)]),
      120000,
      "Recommendations generation timed out after 120 seconds",
    );

    const rawText = extractTextFromResponse(response);
    const usageMetadata = getUsageMetadata(response);
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
