import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { BookSetupProfile } from "../../book-setup-types";
import type {
  PersonaDeepProfile,
  PersonaPack,
  PromiseArtifactMetadata,
  PromiseBrief,
  TransformationArtifact,
} from "../../promise-types";
import { resolveModelSpec } from "../../llm/routing";
import { TRANSFORMATION_ARC_SYSTEM_PROMPT } from "./generation-prompts";
import {
  formatSetupContextForPrompt,
  getKnowledgeContextForPrompt,
} from "./generation-context";
import {
  JsonExtractionError,
  extractJsonText,
  extractTextFromResponse,
  getResponseMetadata,
  getStopReason,
  getUsageMetadata,
} from "./generation-response";
import { getBookPitchModel } from "./generation-models";
import { normalizeTokenUsageMetadata } from "./market-analysis-normalization";
import { buildTruthPersonaContexts } from "./report-persona-context";
import {
  TransformationArtifactSchema,
  createFallbackTransformationArtifact,
  normalizeTransformationArtifact,
} from "./generation-transformation-support";

function mergeArtifactMetadata(
  metadata: PromiseArtifactMetadata | undefined,
  updates: PromiseArtifactMetadata,
): PromiseArtifactMetadata {
  const base = metadata ?? {};
  const patch = updates ?? {};
  return {
    ...base,
    ...patch,
    grounding: patch.grounding ?? base.grounding ?? null,
    tokenUsage: patch.tokenUsage ?? base.tokenUsage ?? null,
  };
}

export async function maybeGenerateTransformationArc(
  promise: PromiseBrief,
  deepProfiles?: PersonaDeepProfile[],
  simplePersonas?: PersonaPack["personas"],
  bookSetupProfile?: BookSetupProfile | null,
  bookId?: string,
): Promise<TransformationArtifact> {
  try {
    console.log(`[maybeGenerateTransformationArc] Starting...`);
    // TransformationArcSchema is 7 stages x up to 3 personas each with several
    // prose fields — the default 4000-token cap truncates it mid-object
    // before the JSON closes (confirmed in production: two consecutive
    // max_tokens stops at candidateLength ~17.9k chars). The longer
    // generation also needs more than the default 90s timeout, or it gets
    // killed as "Request timed out" before the larger response finishes
    // streaming (also confirmed in production, immediately after raising
    // maxOutputTokens alone).
    const model = await getBookPitchModel({ maxOutputTokens: 8000, timeoutMs: 180000 });
    const personaContexts = buildTruthPersonaContexts(
      promise,
      deepProfiles,
      simplePersonas,
    );

    if (!model) {
      console.log(`[maybeGenerateTransformationArc] No model, using fallback`);
      const fallback = createFallbackTransformationArtifact(promise, personaContexts);
      return {
        ...fallback,
        metadata: {
          ...(fallback.metadata ?? {}),
          updatedAt: new Date().toISOString(),
          model: "fallback",
        },
      };
    }

    let knowledgeContext = "";
    if (bookId) {
      knowledgeContext = await getKnowledgeContextForPrompt(
        bookId,
        "transformation before after change journey process",
        5,
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
