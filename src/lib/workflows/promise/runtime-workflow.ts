import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StageKey } from "@prisma/client";
import { z } from "zod";

import type { BookSetupProfile } from "../../book-setup-types";
import { getModelForRole } from "../../llm/routing";
import type {
  PersonaPack,
  PromiseBrief,
  PromiseMessage,
  PromiseScorecard,
} from "../../promise-types";
import {
  getCommittedBookSetup,
} from "../../repositories/book-setup-artifacts";
import {
  getOrCreateBookBySlug,
  getStageForBook,
} from "../../repositories/books";
import { createDirectionEvent } from "../../repositories/direction-events";
import {
  createPromiseArtifactVersion,
  getPromiseArtifacts,
  getPromiseBriefVersions,
} from "../../repositories/promise-artifacts";
import { listBookSourceDocuments } from "../../repositories/source-documents";
import {
  maybeGenerateMarketReport,
  maybeGenerateRecommendations,
} from "./market-analysis";
import {
  ensurePromiseEnvLoaded,
  getStructuredAudienceModel,
  getStructuredPromiseModel,
} from "./generation-models";
import {
  formatReferenceMaterialsForPrompt,
  formatSetupContextForPrompt,
} from "./generation-context";
import { createPromiseWorkflowRunner } from "./generation-runtime";
import {
  appendUserMessageNode,
  createExtractPromiseNode,
  createGeneratePromiseReplyNode,
  createLoadContextNode,
  createMarketNode,
  createPersonaNode,
  createPersistNode,
  createRecommendationsNode,
  createScorePromiseNode,
} from "./generation-runtime-nodes";
import {
  fallbackPersonaPack,
  fallbackPromiseExtraction,
  fallbackScorecard,
} from "./workspace-loader-support";

const PromiseBriefSchema = z.object({
  workingTitle: z.string(),
  audiencePrimary: z.string(),
  audienceSecondary: z.array(z.string()).default([]),
  category: z.string(),
  readerProblem: z.string(),
  readerDesire: z.string(),
  bigIdea: z.string(),
  coreTruth: z.string(),
  transformationBefore: z.string(),
  transformationAfter: z.string(),
  differentiation: z.string(),
  promiseStatement: z.string(),
  stakes: z.string(),
  tone: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  // OpenAI strict structured-output mode requires every property in every
  // nested object schema to appear in `required` — .optional() drops a key
  // from `required` and the API rejects the schema outright. .nullable()
  // keeps the key required while still letting the model return null.
  metadata: z.object({
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    model: z.string().nullable(),
    grounding: z.object({
      previousPhases: z.array(z.string()).nullable(),
      kbSources: z.array(z.string()).nullable(),
      audienceSignals: z.array(z.string()).nullable(),
    }).nullable(),
    tokenUsage: z.object({
      inputTokens: z.number().nullable(),
      outputTokens: z.number().nullable(),
      totalTokens: z.number().nullable(),
      cacheReadInputTokens: z.number().nullable(),
      cacheWriteInputTokens: z.number().nullable(),
      reasoningTokens: z.number().nullable(),
    }).nullable(),
  }).nullable(),
});

const PromiseScorecardSchema = z.object({
  scores: z.object({
    clarity: z.number(),
    audienceFit: z.number(),
    distinctiveness: z.number(),
    commercialPull: z.number(),
    credibility: z.number(),
  }),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  nextBestRevisions: z.array(z.string()).default([]),
});

const PersonaPackSchema = z.object({
  personas: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      priority: z.enum(["primary", "secondary"]),
      context: z.string(),
      painPoints: z.array(z.string()).default([]),
      desiredOutcomes: z.array(z.string()).default([]),
      buyingMotivations: z.array(z.string()).default([]),
      languageCues: z.array(z.string()).default([]),
    }),
  ),
});

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

const PROMISE_CONVERSATION_SYSTEM_PROMPT = `
You are the Promise-stage strategist for a serious nonfiction book platform.

Your job is not to flatter the user or produce generic business-book copy.
Your job is to help shape a book promise that is:
- clear
- commercially attractive
- specific to a real reader
- differentiated from generic leadership advice
- emotionally resonant without hype
- practical enough to support a full book

Behave like an experienced ghostwriter, editor, and positioning strategist.

Important rules:
- Do not sound like a consultant, marketer, or LinkedIn post.
- Do not use generic phrases like "navigate today's fast-paced world" unless the user already does.
- Do not give long inspirational speeches.
- Prefer grounded language over inflated language.
- Pressure-test the idea. If it is broad, say so plainly.
- Push toward a sharper reader, sharper pain, and sharper transformation.
- Preserve the user's voice and intent.
- For secular nonfiction, think in terms of ME -> WE -> CORE TRUTH -> YOU -> WE.
- Keep responses concise: usually 2 short paragraphs plus 2-4 labeled options or refinements when useful.

When you reply:
1. Name what is strong.
2. Name what is still weak, muddy, broad, or commercially risky.
3. Offer a stronger version of the promise or angle.
4. End with a very small number of concrete refinement options, not an open-ended brainstorm.
`;

const PROMISE_EXTRACTION_SYSTEM_PROMPT = `
Extract a structured nonfiction book promise from the conversation.

Optimize for specificity, commercial usefulness, and editorial clarity.

Rules:
- Fill every field with concrete language.
- Avoid generic filler.
- The audience must be a real buyer/reader segment, not "everyone."
- The big idea should be a portable one-sentence concept.
- The core truth should express the chapter/book-level governing truth in secular nonfiction terms.
- The promise statement should sound like back-cover positioning, not vague aspiration.
- The differentiation field must explain why this book is distinct from generic books in the category.
- Open questions should capture the most important unresolved strategic decisions, not trivia.
`;

const PROMISE_SCORECARD_SYSTEM_PROMPT = `
Score this book promise like a tough but fair publishing strategist.

Score from 1 to 10 for:
- clarity
- audienceFit
- distinctiveness
- commercialPull
- credibility

Rules:
- Do not inflate scores.
- A broad or generic promise should lose points.
- A promise with weak differentiation should lose points.
- Commercial pull should reflect whether the idea feels buyable, not merely smart.
- Strengths, concerns, and next revisions should be concrete and editorially useful.
`;

const PERSONA_SYSTEM_PROMPT = `
Generate reader personas for this nonfiction book promise.

Rules:
- Focus on real buyer/reader profiles, not abstract archetypes.
- Prefer 2-4 strong personas over a long list.
- Each persona should have a believable context, pain pattern, desired outcome, buying motivation, and language cues.
- Keep the language grounded and useful for positioning and writing.
- Avoid empty corporate jargon.
`;

function fallbackAssistantReply(messages: PromiseMessage[], bookSetupProfile?: BookSetupProfile | null): string {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const personaLead = bookSetupProfile?.writerPersona
    ? `Write toward the ${bookSetupProfile.writerPersona} persona while keeping the promise commercially sharp. `
    : "";

  return `${personaLead}The idea is promising. The next refinement should sharpen three things: who the primary reader is, what specific pain they feel every day, and what transformation they can expect by the end. Keep the promise practical, concrete, and commercially sharp rather than abstract or inflated. Based on your latest note, preserve the strongest user language and tighten it into a more portable statement: ${latestUserMessage}`;
}

async function maybeGenerateAssistantReplyWithSetup(
  messages: PromiseMessage[],
  bookSetupProfile?: BookSetupProfile | null,
  referenceMaterials?: Array<{
    id: string;
    title: string;
    mimeType: string;
    note: string;
  }>,
  bookSlug?: string,
) {
  const model = await getChatModel();

  if (!model) {
    console.log("[promise] No model available, using fallback");
    return fallbackAssistantReply(messages, bookSetupProfile);
  }

  const inputMessages = [
    new SystemMessage(
      `${PROMISE_CONVERSATION_SYSTEM_PROMPT}\n\nCommitted Book Setup Context:\n${formatSetupContextForPrompt(
        bookSetupProfile,
      )}\n\nUploaded Reference Materials:\n${formatReferenceMaterialsForPrompt(referenceMaterials)}`,
    ),
    ...messages.map((message) =>
      message.role === "user"
        ? new HumanMessage(message.content)
        : new AIMessage(message.content),
    ),
  ];

  if (bookSlug) {
    try {
      const { startPromiseReplyStream, appendPromiseReplyChunk, finishPromiseReplyStream } =
        await import("../promise-reply-stream-tracker");
      startPromiseReplyStream(bookSlug);
      let full = "";
      const stream = await model.stream(inputMessages);
      for await (const chunk of stream) {
        const piece =
          typeof chunk.content === "string"
            ? chunk.content
            : chunk.content.map((part) => ("text" in part ? part.text : "")).join("");
        if (piece) {
          full += piece;
          appendPromiseReplyChunk(bookSlug, piece);
        }
      }
      finishPromiseReplyStream(bookSlug);
      if (full.trim().length > 0) {
        return full;
      }
    } catch (error) {
      console.error("[promise] Streaming reply failed, falling back to non-streaming call:", error);
    }
  }

  const response = await model.invoke(inputMessages);

  return typeof response.content === "string"
    ? response.content
    : response.content.map((part) => ("text" in part ? part.text : "")).join("\n");
}

async function maybeExtractPromise(
  bookSlug: string,
  messages: PromiseMessage[],
  assistantReply: string,
  bookSetupProfile?: BookSetupProfile | null,
  referenceMaterials?: Array<{
    id: string;
    title: string;
    mimeType: string;
    note: string;
  }>,
) {
  const model = await getStructuredPromiseModel({
    maxOutputTokens: 4000,
    timeoutMs: 90000,
  });

  if (!model) {
    return fallbackPromiseExtraction(bookSlug, messages, assistantReply, bookSetupProfile);
  }

  const structuredModel = model.withStructuredOutput(PromiseBriefSchema);
  const userMessages = messages.filter((message) => message.role === "user");

  return structuredModel.invoke([
    new SystemMessage(
      `${PROMISE_EXTRACTION_SYSTEM_PROMPT}\n\nCommitted Book Setup Context:\n${formatSetupContextForPrompt(
        bookSetupProfile,
      )}\n\nUploaded Reference Materials:\n${formatReferenceMaterialsForPrompt(referenceMaterials)}`,
    ),
    ...userMessages.map((message) => new HumanMessage(message.content)),
    new HumanMessage(`Latest assistant guidance:\n\n${assistantReply}`),
  ]);
}

async function maybeScorePromise(promise: PromiseBrief) {
  const model = await getStructuredPromiseModel({
    maxOutputTokens: 3000,
    timeoutMs: 60000,
  });

  if (!model) {
    return fallbackScorecard(promise);
  }

  const structuredModel = model.withStructuredOutput(PromiseScorecardSchema);

  return structuredModel.invoke([
    new SystemMessage(PROMISE_SCORECARD_SYSTEM_PROMPT),
    new HumanMessage(JSON.stringify(promise)),
  ]);
}

async function maybeGeneratePersonas(promise: PromiseBrief) {
  const model = await getStructuredAudienceModel({
    maxOutputTokens: 5000,
    timeoutMs: 90000,
  });

  if (!model) {
    return fallbackPersonaPack(promise);
  }

  const structuredModel = model.withStructuredOutput(PersonaPackSchema);

  return structuredModel.invoke([
    new SystemMessage(PERSONA_SYSTEM_PROMPT),
    new HumanMessage(JSON.stringify(promise)),
  ]);
}

const loadContextNode = createLoadContextNode({
  getOrCreateBookBySlug,
  getStageForBook,
  getCommittedBookSetup,
  listBookSourceDocuments,
  getPromiseArtifacts,
  getPromiseBriefVersions,
});

const generatePromiseReplyNode = createGeneratePromiseReplyNode({
  maybeGenerateAssistantReplyWithSetup,
});

const extractPromiseNode = createExtractPromiseNode({
  maybeExtractPromise,
});

const scorePromiseNode = createScorePromiseNode({
  maybeScorePromise,
});

const personaNode = createPersonaNode({
  maybeGeneratePersonas,
});

const marketNode = createMarketNode({
  maybeGenerateMarketReport,
});

const recommendationsNode = createRecommendationsNode({
  maybeGenerateRecommendations,
});

const persistNode = createPersistNode({
  createPromiseArtifactVersion: (input) => createPromiseArtifactVersion(input as never),
  createDirectionEvent: (input) => createDirectionEvent(input as never),
});

export const runPromiseWorkflow = createPromiseWorkflowRunner({
  loadContextNode,
  appendUserMessageNode,
  generatePromiseReplyNode,
  extractPromiseNode,
  scorePromiseNode,
  personaNode,
  marketNode,
  recommendationsNode,
  persistNode,
});
