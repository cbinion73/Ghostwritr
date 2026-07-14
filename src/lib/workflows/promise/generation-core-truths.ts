import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { BookSetupProfile } from "../../book-setup-types";
import type {
  AudienceResearchArtifact,
  CoreTruthsArtifact,
  PersonaDeepProfile,
  PersonaPack,
  PromiseBrief,
} from "../../promise-types";
import { getModelForRole, resolveModelSpec } from "../../llm/routing";
import { CORE_TRUTHS_SYSTEM_PROMPT } from "./generation-prompts";
import {
  formatSetupContextForPrompt,
  getKnowledgeGroundingForPrompt,
} from "./generation-context";
import {
  extractJsonText,
  extractTextFromResponse,
  getResponseMetadata,
  getStopReason,
  getUsageMetadata,
  withTimeout,
} from "./generation-response";
import { ensurePromiseEnvLoaded } from "./generation-models";
import { normalizeTokenUsageMetadata } from "./market-analysis-normalization";
import { buildTruthPersonaContexts } from "./report-persona-context";
import {
  CoreTruthsArtifactSchema,
  buildTruthGroundingContext,
  createFallbackCoreTruthArtifact,
  normalizeCoreTruthsArtifact,
} from "./generation-core-truths-support";

async function getCoreTruthsModel() {
  ensurePromiseEnvLoaded();
  return getModelForRole("promise:author", {
    temperature: 0.25,
    maxOutputTokens: 4000,
    timeoutMs: 90000,
    maxRetries: 2,
  });
}

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
    const model = await getCoreTruthsModel();
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
