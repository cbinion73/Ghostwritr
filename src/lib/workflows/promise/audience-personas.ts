import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { BookSetupProfile } from "../../book-setup-types";
import type {
  AudienceResearchPhase1,
  PersonaComparisonAnalysis,
  PersonaDeepProfile,
  PersonaPackDeepProfile,
  PromiseBrief,
} from "../../promise-types";
import {
  deriveKnowledgeFallbackCharLimit,
  formatSetupContextForPrompt,
  getKnowledgeContextForPrompt,
} from "./generation-context";
import { getStructuredAudienceModel } from "./generation-models";
import {
  AUDIENCE_RESEARCH_PHASE1_SYSTEM_PROMPT,
  AUDIENCE_RESEARCH_PHASE2_SYSTEM_PROMPT,
  AUDIENCE_RESEARCH_PHASE3_SYSTEM_PROMPT,
} from "./generation-prompts";
import {
  JsonExtractionError,
  extractJsonText,
  extractTextFromResponse,
  getResponseMetadata,
  getStopReason,
  getUsageMetadata,
  isLikelyTruncatedJson,
  withTimeout,
} from "./generation-response";
import {
  PersonaPackDeepProfileSchema,
  buildFallbackPersonaComparisonAnalysis,
  buildPersonaGenerationInstruction,
  getPersonaDeepProfileBatchSize,
  getPersonaDeepProfilePhaseBudgetMs,
  normalizeAudienceResearchPhase1,
  normalizePersonaComparisonAnalysis,
  normalizePersonaDeepProfile,
  summarizePersonasForComparison,
  summarizePersonasForPrompt,
} from "./audience-personas-support";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export const __promiseTestUtils = {
  buildPersonaGenerationInstruction,
  deriveKnowledgeFallbackCharLimit,
  extractJsonText,
  getPersonaDeepProfilePhaseBudgetMs,
  getPersonaDeepProfileBatchSize,
  normalizePersonaDeepProfile,
};

export async function maybeGenerateAudienceResearchPhase1(
  promise: PromiseBrief,
  bookSetupProfile?: BookSetupProfile | null,
  bookId?: string,
): Promise<AudienceResearchPhase1> {
  try {
    console.log(`[maybeGenerateAudienceResearchPhase1] Starting...`);
    const model = await getStructuredAudienceModel({
      maxOutputTokens: 5000,
      timeoutMs: 90000,
    });
    console.log(`[maybeGenerateAudienceResearchPhase1] Model obtained:`, model ? "yes" : "no");

    if (!model) {
      console.log(`[maybeGenerateAudienceResearchPhase1] No model, using fallback`);
      return {
        researchQuestions: [
          {
            question: "Who specifically needs this book? (role, industry, seniority)",
            answer: "Professionals in the target industry facing the pain point described in the promise, typically mid to senior level with decision-making authority and budget responsibility.",
          },
          {
            question: "What's their current situation and what's keeping them stuck?",
            answer: "They are experiencing the core pain described in the promise, using outdated or ineffective approaches, and feeling frustrated by results that don't match their efforts.",
          },
          {
            question: "What does winning look like for them?",
            answer: "Achieving the transformation described in the promise—moving from current frustration to desired state with measurable improvement in the key outcome area.",
          },
          {
            question: "What would make them skeptical a book could help?",
            answer: "Past experiences with similar books that didn't deliver practical solutions, or belief that their situation is too unique to benefit from a generalized framework.",
          },
          {
            question: "Where do they get information and how do they decide to buy?",
            answer: "They research through professional networks, peer recommendations, and industry publications; they buy based on credible proof from others like them and clear examples of application.",
          },
        ],
        identifiedUserTypes: [
          {
            name: "Primary Decision Maker",
            description: "The core buyer persona most aligned with the promise",
            details: ["Feels the pain described in the promise", "Has authority to invest", "Seeks practical solutions", "Values actionable frameworks"],
          },
        ],
      };
    }

    let knowledgeContext = "";
    if (bookId) {
      knowledgeContext = await getKnowledgeContextForPrompt(
        bookId,
        "audience target readers customers users personas",
        5,
      );
    }

    const systemPrompt = `${AUDIENCE_RESEARCH_PHASE1_SYSTEM_PROMPT}\n\nBook Voice Context:\n${formatSetupContextForPrompt(bookSetupProfile)}${knowledgeContext}`;
    console.log(`[maybeGenerateAudienceResearchPhase1] System prompt prepared`);
    const rawResponse = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(JSON.stringify(promise)),
    ]);
    console.log(`[maybeGenerateAudienceResearchPhase1] Raw response obtained`);

    const rawText = extractTextFromResponse(rawResponse).trim();
    console.log(`[maybeGenerateAudienceResearchPhase1] Raw text length:`, rawText.length);

    const jsonText = extractJsonText(rawText);
    console.log(`[maybeGenerateAudienceResearchPhase1] Extracted JSON length:`, jsonText.length);

    const parsed = JSON.parse(jsonText) as unknown;
    const normalized = normalizeAudienceResearchPhase1(parsed);
    console.log(`[maybeGenerateAudienceResearchPhase1] Result normalized`);
    return normalized;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[maybeGenerateAudienceResearchPhase1] Error:`, errorMsg);
    if (error instanceof Error) {
      console.error(`[maybeGenerateAudienceResearchPhase1] Stack:`, error.stack);
    }
    throw error;
  }
}

async function generatePersonaDeepProfileBatch(params: {
  model: NonNullable<Awaited<ReturnType<typeof getStructuredAudienceModel>>>;
  systemPrompt: string;
  promise: PromiseBrief;
  audienceResearch: AudienceResearchPhase1;
  requestedCount: number;
  existingPersonas: PersonaDeepProfile[];
  seedUserTypes: AudienceResearchPhase1["identifiedUserTypes"];
  batchLabel: string;
  log: (...parts: unknown[]) => void;
}): Promise<PersonaDeepProfile[]> {
  const messages = [
    new SystemMessage(params.systemPrompt),
    new HumanMessage(
      JSON.stringify({
        promise: params.promise,
        audienceResearch: {
          researchQuestions: params.audienceResearch.researchQuestions.slice(0, 5),
          identifiedUserTypes: params.audienceResearch.identifiedUserTypes,
        },
        requestedPersonaCount: params.requestedCount,
        seedUserTypes: params.seedUserTypes,
        existingPersonas: summarizePersonasForPrompt(params.existingPersonas),
        instruction: buildPersonaGenerationInstruction(params.requestedCount),
      }),
    ),
  ];

  params.log(
    `[maybeGeneratePersonasDeepProfile] Invoking batch ${params.batchLabel} for ${params.requestedCount} persona(s)...`,
  );

  let rawLLMText = "";
  let jsonText = "";
  let stopReason: string | undefined;

  try {
    const rawResponse = await params.model.invoke(messages);
    stopReason = getStopReason(rawResponse);

    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} response metadata:`,
      getResponseMetadata(rawResponse),
    );
    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} usage metadata:`,
      getUsageMetadata(rawResponse),
    );

    rawLLMText = extractTextFromResponse(rawResponse);
    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} raw text length:`,
      rawLLMText.length,
    );

    jsonText = extractJsonText(rawLLMText);
    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} extracted JSON length:`,
      jsonText.length,
    );

    const parsed = JSON.parse(jsonText) as unknown;
    const parsedRecord = asRecord(parsed);
    const personasRaw = Array.isArray(parsedRecord.personas) ? parsedRecord.personas : [parsed];
    const normalized = personasRaw.map((persona, index) =>
      normalizePersonaDeepProfile(persona, params.existingPersonas.length + index),
    );
    const result = PersonaPackDeepProfileSchema.parse({
      personas: normalized.slice(0, params.requestedCount),
    });

    if (result.personas.length < params.requestedCount) {
      throw new Error(
        `Expected ${params.requestedCount} personas but only received ${result.personas.length}`,
      );
    }

    return result.personas;
  } catch (error) {
    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} error:`,
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof JsonExtractionError) {
      params.log(
        `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} JSON extraction details:`,
        error.details,
      );
    }
    params.log(
      `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} raw preview:`,
      rawLLMText ? rawLLMText.substring(0, 1200) : "NO TEXT",
    );

    const shouldSplit =
      params.requestedCount > 1 &&
      (isLikelyTruncatedJson(jsonText || rawLLMText, error, stopReason) ||
        (error instanceof Error && /Expected \d+ personas but only received \d+/i.test(error.message)));

    if (shouldSplit) {
      params.log(
        `[maybeGeneratePersonasDeepProfile] Batch ${params.batchLabel} looks truncated or incomplete. Retrying as single-persona calls...`,
      );

      const personas: PersonaDeepProfile[] = [];
      for (let index = 0; index < params.requestedCount; index++) {
        const singleSeed =
          params.seedUserTypes[index] !== undefined ? [params.seedUserTypes[index]] : [];
        const generated = await generatePersonaDeepProfileBatch({
          ...params,
          requestedCount: 1,
          existingPersonas: [...params.existingPersonas, ...personas],
          seedUserTypes: singleSeed,
          batchLabel: `${params.batchLabel}.${index + 1}`,
        });
        personas.push(generated[0]);
      }

      return personas;
    }

    throw error;
  }
}

export async function maybeGeneratePersonasDeepProfile(
  promise: PromiseBrief,
  audienceResearch: AudienceResearchPhase1,
  bookSetupProfile?: BookSetupProfile | null,
  bookId?: string,
  numPersonas: number = 5,
): Promise<PersonaPackDeepProfile> {
  const { writeFileSync } = await import("fs");
  const logPath = "/tmp/deep-personas-gen.log";
  const log = (...parts: unknown[]) => {
    const msg = parts
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          typeof part === "number" ||
          typeof part === "boolean" ||
          part === null ||
          part === undefined
        ) {
          return String(part);
        }
        try {
          return JSON.stringify(part);
        } catch {
          return String(part);
        }
      })
      .join(" ");

    console.log(msg);
    try {
      writeFileSync(logPath, msg + "\n", { flag: "a" });
    } catch {
      // Silently fail file logging
    }
  };

  try {
    log("[maybeGeneratePersonasDeepProfile] Starting Phase 2 generation...");

    log("[maybeGeneratePersonasDeepProfile] Loading knowledge base context...");
    let knowledgeContext = "";
    if (bookId) {
      try {
        knowledgeContext = await getKnowledgeContextForPrompt(
          bookId,
          "audience buyer customer profile segment demographics",
          5,
        );
        log("[maybeGeneratePersonasDeepProfile] Knowledge context loaded, length:" + knowledgeContext.length);
      } catch (kbError) {
        log("[maybeGeneratePersonasDeepProfile] Knowledge base error:" + (kbError instanceof Error ? kbError.message : String(kbError)));
        knowledgeContext = "";
      }
    }

    log("[maybeGeneratePersonasDeepProfile] Building system prompt...");
    const setupContext = formatSetupContextForPrompt(bookSetupProfile);
    log("[maybeGeneratePersonasDeepProfile] Setup context length:" + setupContext.length);

    const systemPrompt = `${AUDIENCE_RESEARCH_PHASE2_SYSTEM_PROMPT}\n\nBook Voice Context:\n${setupContext}${knowledgeContext}`;
    log("[maybeGeneratePersonasDeepProfile] System prompt length:" + systemPrompt.length);

    const requestedPersonaCount = Math.max(1, Math.min(numPersonas, 10));
    const personas: PersonaDeepProfile[] = [];
    const batchSize = getPersonaDeepProfileBatchSize(requestedPersonaCount);
    const phaseBudgetMs = getPersonaDeepProfilePhaseBudgetMs(requestedPersonaCount);
    const phaseStartedAt = Date.now();

    log("[maybeGeneratePersonasDeepProfile] Batch size:" + batchSize);
    log("[maybeGeneratePersonasDeepProfile] Phase budget ms:" + phaseBudgetMs);

    for (let batchStart = 0; batchStart < requestedPersonaCount; batchStart += batchSize) {
      const elapsedMs = Date.now() - phaseStartedAt;
      const remainingBudgetMs = phaseBudgetMs - elapsedMs;

      if (remainingBudgetMs < 15000) {
        throw new Error(
          `Persona deep profile generation exceeded the overall phase budget after ${elapsedMs}ms. Reduce persona count or retry.`,
        );
      }

      log("[maybeGeneratePersonasDeepProfile] Initializing LLM model...");
      const model = await getStructuredAudienceModel({
        maxOutputTokens: 6500,
        timeoutMs: Math.min(120000, remainingBudgetMs),
        reasoningEffort: "high",
      });
      log("[maybeGeneratePersonasDeepProfile] Model initialized:", model ? "yes" : "no");

      if (!model) {
        log("[maybeGeneratePersonasDeepProfile] No model available, returning fallback");
        return {
          personas: [
            {
              id: "persona_1",
              name: "Primary Persona",
              demographics: {
                role: "Professional in relevant field",
                companyType: "Various",
                yearsInRole: 5,
                careerPath: "Progression within their field",
                dayInTheLife: "Busy with operational demands",
                reportsTo: "Senior leader",
                teamSize: 5,
              },
              currentSituation: {
                whatTheyDo: "Work described in the book promise",
                whatWorks: ["Some existing approaches", "Current systems"],
                whatDoesntWork: ["Pain points from promise"],
                timeAllocation: "50% on pain area, 50% other",
                biggestFrustration: "Core pain from promise",
              },
              goals: [
                { goal: "Achieve outcome from promise", type: "outcome" },
                { goal: "Feel confident and capable", type: "feeling" },
              ],
              painPoints: [
                { friction: "Current challenge", realCost: "Time and opportunity lost" },
              ],
              objections: [
                { objection: "Don't have time to read", proofNeeded: "Practical, quick application" },
              ],
              successMetrics: [{ metric: "Measurable improvement", feeling: "Greater confidence" }],
              learningStyle: {
                prefers: ["Practical examples", "Clear frameworks"],
                hates: ["Theory without application"],
                bestFormat: "Short, actionable chapters",
              },
              voiceBlendFit: {
                primary: "Practical and clear",
                reasoning: "Resonates with need for actionable solutions",
              },
            },
          ],
        };
      }

      const batchCount = Math.min(batchSize, requestedPersonaCount - batchStart);
      const seedUserTypes = audienceResearch.identifiedUserTypes.slice(
        batchStart,
        batchStart + batchCount,
      );
      const batchPersonas = await generatePersonaDeepProfileBatch({
        model,
        systemPrompt,
        promise,
        audienceResearch,
        requestedCount: batchCount,
        existingPersonas: personas,
        seedUserTypes,
        batchLabel: `${batchStart + 1}-${batchStart + batchCount}`,
        log,
      });

      personas.push(...batchPersonas);
    }

    const result = PersonaPackDeepProfileSchema.parse({ personas });

    log("[maybeGeneratePersonasDeepProfile] LLM invocation successful, personas generated:" + result.personas?.length);
    return result;
  } catch (error) {
    log("[maybeGeneratePersonasDeepProfile] CRITICAL ERROR:" + (error instanceof Error ? error.message : String(error)));
    if (error instanceof Error) {
      log("[maybeGeneratePersonasDeepProfile] Stack trace:" + error.stack);
    }
    throw error;
  }
}

export async function maybeGeneratePersonaComparisonAnalysis(
  personas: PersonaDeepProfile[],
  bookSetupProfile?: BookSetupProfile | null,
): Promise<PersonaComparisonAnalysis> {
  const { writeFileSync } = await import("fs");
  const logPath = "/tmp/persona-comparison-gen.log";
  const log = (...parts: unknown[]) => {
    const msg = parts
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          typeof part === "number" ||
          typeof part === "boolean" ||
          part === null ||
          part === undefined
        ) {
          return String(part);
        }

        try {
          return JSON.stringify(part);
        } catch {
          return String(part);
        }
      })
      .join(" ");

    console.log(msg);
    try {
      writeFileSync(logPath, msg + "\n", { flag: "a" });
    } catch {
      // Ignore log file write failures
    }
  };

  const fallback = buildFallbackPersonaComparisonAnalysis(personas);

  try {
    log("[maybeGeneratePersonaComparisonAnalysis] Starting Phase 3 generation...");
    const model = await getStructuredAudienceModel({
      maxOutputTokens: 2500,
      timeoutMs: 90000,
    });
    log("[maybeGeneratePersonaComparisonAnalysis] Model initialized:", model ? "yes" : "no");

    if (!model) {
      log("[maybeGeneratePersonaComparisonAnalysis] No model available, returning fallback analysis");
      return fallback;
    }

    const systemPrompt = `${AUDIENCE_RESEARCH_PHASE3_SYSTEM_PROMPT}\n\nBook Voice Context:\n${formatSetupContextForPrompt(bookSetupProfile)}`;
    log("[maybeGeneratePersonaComparisonAnalysis] System prompt length:", systemPrompt.length);

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(
        JSON.stringify({
          personas: summarizePersonasForComparison(personas),
          instruction:
            "Compare these personas and return concise strategic analysis with exact JSON keys only.",
        }),
      ),
    ];

    const rawResponse = await withTimeout(
      model.invoke(messages),
      90000,
      "Persona comparison generation timed out after 90 seconds",
    );
    const stopReason = getStopReason(rawResponse);
    log("[maybeGeneratePersonaComparisonAnalysis] Stop reason:", stopReason ?? "unknown");
    log(
      "[maybeGeneratePersonaComparisonAnalysis] Response metadata:",
      getResponseMetadata(rawResponse),
    );
    log(
      "[maybeGeneratePersonaComparisonAnalysis] Usage metadata:",
      getUsageMetadata(rawResponse),
    );

    const rawLLMText = extractTextFromResponse(rawResponse);
    log("[maybeGeneratePersonaComparisonAnalysis] Raw text length:", rawLLMText.length);

    const jsonText = extractJsonText(rawLLMText);
    log("[maybeGeneratePersonaComparisonAnalysis] Extracted JSON length:", jsonText.length);

    const parsed = JSON.parse(jsonText) as unknown;
    const normalized = normalizePersonaComparisonAnalysis(parsed, personas);
    log(
      "[maybeGeneratePersonaComparisonAnalysis] Generation successful, common themes:",
      normalized.commonThemes.length,
    );

    return normalized;
  } catch (error) {
    log(
      "[maybeGeneratePersonaComparisonAnalysis] ERROR:",
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof JsonExtractionError) {
      log(
        "[maybeGeneratePersonaComparisonAnalysis] JSON extraction details:",
        error.details,
      );
    }
    if (error instanceof Error && error.stack) {
      log("[maybeGeneratePersonaComparisonAnalysis] Stack:", error.stack);
    }
    log("[maybeGeneratePersonaComparisonAnalysis] Returning fallback analysis");
    return fallback;
  }
}
