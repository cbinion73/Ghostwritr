import { ArtifactType, StageKey } from "@prisma/client";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import { getModelForRole } from "../llm/routing";
import {
  createPromiseArtifactVersion,
  getPromiseBriefVersions,
  getPromiseArtifacts,
} from "../repositories/promise-artifacts";
import { getCommittedBookSetup } from "../repositories/book-setup-artifacts";
import { getCommittedPhase1StrategicBrief } from "../repositories/phase1-strategic-brief-artifacts";
import { getBookBySlugOrThrow, getOrCreateBookBySlug, getStageForBook } from "../repositories/books";
import { createDirectionEvent, listDirectionEventsForStage } from "../repositories/direction-events";
import { listBookSourceDocuments } from "../repositories/source-documents";
import type {
  AudienceResearchArtifact,
  AudienceResearchPhase1,
  CoreTruthsArtifact,
  MarketReport,
  PromiseArtifactAvailability,
  PersonaPack,
  PersonaPackDeepProfile,
  PromisePhaseApprovals,
  PromiseArtifactMetadata,
  PositioningRecommendations,
  PromiseBrief,
  PromiseMessage,
  PromiseScorecard,
  TransformationArtifact,
} from "../promise-types";
import type { BookSetupProfile } from "../book-setup-types";
import {
  extractExecutiveSummaryFromMarkdown,
  extractMarkdownLabeledValue,
  extractMarkdownNumberedList,
} from "./promise/report-markdown";
import {
  buildPromiseWorkspaceVersionComparison,
  buildPromiseArtifactAvailability,
  buildPromiseWorkspaceBaseArtifacts,
  buildPromiseWorkspaceDownstreamArtifacts,
  buildPromiseWorkspaceArtifactMap,
  buildPromiseWorkspaceResult,
  getPromiseWorkspaceConversationMessages,
  mapPromiseWorkspaceSourceDocuments,
  mapPromiseWorkspaceVersions,
  normalizePromisePhaseApprovals,
} from "./promise/workspace-assembly";
import {
  ensurePromiseEnvLoaded,
  getStructuredAudienceModel,
  getStructuredPromiseModel,
} from "./promise/generation-models";
import {
  getResponseMetadata,
  getStopReason,
  isLikelyTruncatedJson,
} from "./promise/generation-response";
import {
  formatReferenceMaterialsForPrompt,
  formatSetupContextForPrompt,
} from "./promise/generation-context";
import {
  createFallbackMarketReport as createFallbackMarketReportFromModule,
} from "./promise/market-analysis-fallback";
import { normalizeMarketReport } from "./promise/market-analysis-normalization";
import {
  maybeGenerateMarketReport,
  maybeGenerateRecommendations,
} from "./promise/market-analysis";
import { maybeGenerateCoreTruths } from "./promise/generation-core-truths";
import { maybeGenerateTransformationArc } from "./promise/generation-transformation";
import {
  normalizeBookSetupProfile,
  parseArtifactJson,
} from "./promise/generation-runtime-state";

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
  // from `required` and the API rejects the schema outright ("'required' is
  // required to be supplied and to be an array including every key in
  // properties"). .nullable() keeps the key required while still letting
  // the model return null when there's nothing to report.
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

const TitleSubtitleFinalizationSchema = z.object({
  finalizedTitle: z.string(),
  finalizedSubtitle: z.string(),
  positioningHook: z.string(),
  titleRationale: z.string(),
  subtitleRationale: z.string(),
  audienceFit: z.string(),
  marketFit: z.string(),
  alternatives: z.array(
    z.object({
      title: z.string(),
      subtitle: z.string(),
      whyItCouldWork: z.string(),
    }),
  ).default([]),
  // OpenAI strict structured-output mode requires every property in every
  // nested object schema to appear in `required` — .optional() drops a key
  // from `required` and the API rejects the schema outright ("'required' is
  // required to be supplied and to be an array including every key in
  // properties"). .nullable() keeps the key required while still letting
  // the model return null when there's nothing to report.
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

async function getChatModel(
  overrides: {
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    maxRetries?: number;
  } = {},
) {
  ensurePromiseEnvLoaded();
  // Routed via provider layer: Sonnet for promise generation
  return getModelForRole("promise:author", {
    temperature: overrides.temperature ?? 0.25,
    maxOutputTokens: overrides.maxOutputTokens ?? 4000,
    timeoutMs: overrides.timeoutMs ?? 90000, // Increased from 30s to 90s to handle API latency
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// The LLM's own raw JSON never includes our internal metadata block (it's
// stamped on afterward), so `asRecord(record.metadata)` alone is `{}` here.
// The metadata schemas are `.nullable()` but not `.optional()` at every
// nested key (required for OpenAI strict structured-output mode), so an
// incomplete object fails `.parse()` with "expected string/object, received
// undefined" for every missing key. This defaults everything to `null` —
// always schema-valid — since the real values get stamped in afterward by
// the caller anyway (see mergeArtifactMetadata).
function defaultedArtifactMetadata(raw: unknown): PromiseArtifactMetadata {
  const record = asRecord(raw);
  return {
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
    model: typeof record.model === "string" ? record.model : null,
    grounding: null,
    tokenUsage: null,
  };
}

function coerceString(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (match) {
      const parsed = Number.parseFloat(match[0]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceString(item, ""))
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function mergeArtifactMetadata(
  metadata: PromiseArtifactMetadata | undefined,
  updates: PromiseArtifactMetadata,
): PromiseArtifactMetadata {
  // grounding's three fields are `.nullable()` but not `.optional()` in the
  // artifact schemas, so every key must be present even when neither side
  // supplies a `grounding` at all (e.g. TransformationArc's caller never
  // sets one) — spreading two partial/absent sources without defaulting
  // each key individually can silently produce `{}`, missing every key.
  return {
    ...(metadata ?? {}),
    ...(updates ?? {}),
    grounding: {
      previousPhases: updates?.grounding?.previousPhases ?? metadata?.grounding?.previousPhases ?? null,
      kbSources: updates?.grounding?.kbSources ?? metadata?.grounding?.kbSources ?? null,
      audienceSignals: updates?.grounding?.audienceSignals ?? metadata?.grounding?.audienceSignals ?? null,
    },
    tokenUsage: updates?.tokenUsage ?? metadata?.tokenUsage ?? null,
  };
}

function fallbackAssistantReply(messages: PromiseMessage[], bookSetupProfile?: BookSetupProfile | null): string {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const personaLead = bookSetupProfile?.writerPersona
    ? `Write toward the ${bookSetupProfile.writerPersona} persona while keeping the promise commercially sharp. `
    : "";

  return `${personaLead}The idea is promising. The next refinement should sharpen three things: who the primary reader is, what specific pain they feel every day, and what transformation they can expect by the end. Keep the promise practical, concrete, and commercially sharp rather than abstract or inflated. Based on your latest note, preserve the strongest user language and tighten it into a more portable statement: ${latestUserMessage}`;
}

function slugToTitle(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fallbackPromiseExtraction(
  bookSlug: string,
  messages: PromiseMessage[],
  assistantReply: string,
  bookSetupProfile?: BookSetupProfile | null,
): PromiseBrief {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ");

  return {
    workingTitle: bookSetupProfile?.workingTitle || slugToTitle(bookSlug),
    audiencePrimary: "professional leaders responsible for measurable outcomes",
    audienceSecondary: ["department heads", "operations leaders"],
    category: "professional nonfiction",
    readerProblem:
      "leaders are overwhelmed by complexity, competing priorities, and unclear improvement paths",
    readerDesire:
      "clearer thinking, better systems, and more confident leadership under pressure",
    bigIdea: "focused clarity turns complexity into practical progress",
    coreTruth: "performance improves when leaders simplify what matters and act on it consistently",
    transformationBefore: "stretched, reactive, and uncertain about what to fix first",
    transformationAfter: "clear, disciplined, and confident about what to do next",
    differentiation:
      "a practical system for translating complexity into measurable improvement in real organizations",
    promiseStatement:
      "This book gives leaders a practical system to simplify complexity, improve results, and lead with clarity people can follow.",
    stakes:
      "without clarity, teams waste effort, miss outcomes, and lose confidence in the work",
    tone:
      bookSetupProfile?.voiceReferenceNotes?.length
        ? ["clear", "grounded", "practical", ...bookSetupProfile.voiceReferenceNotes.slice(0, 2)]
        : ["clear", "grounded", "practical", "credible"],
    openQuestions: [
      "Should the audience be narrowed further to a more specific operational role?",
      "What single measurable outcome should the promise emphasize most clearly?",
      `Latest refinement signal: ${assistantReply.slice(0, 120)}`,
      `User language to preserve: ${userText.slice(0, 120)}`,
    ],
  };
}

function fallbackScorecard(promise: PromiseBrief): PromiseScorecard {
  const audiencePrimary = promise.audiencePrimary || "";
  const promiseStatement = promise.promiseStatement || "";

  const mentionsLeadership = audiencePrimary.toLowerCase().includes("leader");
  const mentionsPractical = promiseStatement.toLowerCase().includes("practical");

  return {
    scores: {
      clarity: 8.6,
      audienceFit: mentionsLeadership ? 8.3 : 7.6,
      distinctiveness: 7.2,
      commercialPull: mentionsPractical ? 7.8 : 7.1,
      credibility: 8.0,
    },
    strengths: [
      "Clear emotional payoff around calm and clarity",
      "Strong relevance to current leadership pressure",
    ],
    concerns: [
      "The audience could still feel broad without tighter positioning",
      "The concept risks blending into general leadership advice unless the operating context stays specific",
    ],
    nextBestRevisions: [
      "Name the primary reader more explicitly",
      "Keep the promise tied to decision-making under uncertainty",
    ],
  };
}

function fallbackPersonaPack(promise: PromiseBrief): PersonaPack {
  return {
    personas: [
      {
        id: "enterprise_innovation_leader",
        name: "Innovation Leader",
        priority: "primary",
        context: "Owns emerging technology exploration inside a large enterprise",
        painPoints: [
          "too many vendor pitches",
          "unclear criteria for decision-making",
          "pressure to move faster than the organization can absorb change",
        ],
        desiredOutcomes: [
          "clear prioritization",
          "better executive alignment",
          "confidence under uncertainty",
        ],
        buyingMotivations: [
          "practical frameworks",
          "language for explaining decisions to stakeholders",
        ],
        languageCues: ["clarity", "signal", "alignment", "decision-making"],
      },
      {
        id: "digital_transformation_exec",
        name: "Digital Transformation Executive",
        priority: "secondary",
        context: "Needs to translate technical noise into strategic direction",
        painPoints: ["initiative overload", "organizational swirl", "hype fatigue"],
        desiredOutcomes: ["focus", "cross-functional alignment"],
        buyingMotivations: ["credible frameworks", "team confidence"],
        languageCues: ["focus", "calm", "execution", "discipline"],
      },
    ],
  };
}

async function maybeGenerateAssistantReply(messages: PromiseMessage[]) {
  return maybeGenerateAssistantReplyWithSetup(messages, null);
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

  // This is a plain chat call (no withStructuredOutput) — real token
  // streaming works here, unlike the structured-output calls elsewhere in
  // this file, which buffer to a single chunk regardless of .stream() vs
  // .invoke() (verified directly against the Anthropic client). Streaming
  // into the live buffer lets the Refine sidebar show the reply appearing
  // word-by-word instead of a static "thinking" indicator, at no extra
  // token cost — it's the same generation, just surfaced as it arrives.
  if (bookSlug) {
    try {
      const { startPromiseReplyStream, appendPromiseReplyChunk, finishPromiseReplyStream } =
        await import("./promise-reply-stream-tracker");
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
      // Empty stream (e.g. provider returned nothing) — fall through to a
      // non-streaming retry rather than return blank content.
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

  // Only use user messages for extraction, not the full conversation history
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
