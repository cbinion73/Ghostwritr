import { END, START, Annotation, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ArtifactType, StageKey } from "@prisma/client";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import { getModelForRole } from "../llm/routing";
import {
  commitPromiseStageBundle,
  createPromiseArtifactVersion,
  getCommittedPromiseBrief,
  getPromiseBriefVersions,
  getPromiseArtifacts,
} from "../repositories/promise-artifacts";
import { getCommittedBookSetup } from "../repositories/book-setup-artifacts";
import { getOrCreateBookBySlug, getStageForBook } from "../repositories/books";
import { createDirectionEvent, listDirectionEventsForStage } from "../repositories/direction-events";
import { listBookSourceDocuments } from "../repositories/source-documents";
import type {
  MarketReport,
  PersonaPack,
  PositioningRecommendations,
  PromiseBrief,
  PromiseMessage,
  PromiseScorecard,
} from "../promise-types";
import type { BookSetupProfile } from "../book-setup-types";

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

const MarketReportSchema = z.object({
  marketCategory: z.string(),
  comparisonTitles: z.array(
    z.object({
      title: z.string(),
      author: z.string(),
      whyRelevant: z.string(),
      differenceOpportunity: z.string(),
    }),
  ),
  saturationAssessment: z.string(),
  attractionDrivers: z.array(z.string()).default([]),
  commercialRisks: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

const PositioningRecommendationsSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()).default([]),
});

type PromiseWorkflowState = {
  bookSlug: string;
  userInput: string;
  bookId?: string;
  stageId?: string;
  bookSetupProfile?: BookSetupProfile | null;
  referenceMaterials?: Array<{
    id: string;
    title: string;
    mimeType: string;
    note: string;
  }>;
  conversationMessages: PromiseMessage[];
  assistantReply?: string;
  extractedPromise?: PromiseBrief;
  scorecard?: PromiseScorecard;
  personaPack?: PersonaPack;
  marketReport?: MarketReport;
  recommendations?: PositioningRecommendations;
};

const WorkflowState = Annotation.Root({
  bookSlug: Annotation<string>,
  userInput: Annotation<string>,
  bookId: Annotation<string | undefined>,
  stageId: Annotation<string | undefined>,
  bookSetupProfile: Annotation<BookSetupProfile | null | undefined>,
  referenceMaterials: Annotation<
    Array<{
      id: string;
      title: string;
      mimeType: string;
      note: string;
    }>
  >({
    reducer: (_, value) => value,
    default: () => [],
  }),
  conversationMessages: Annotation<PromiseMessage[]>({
    reducer: (_, value) => value,
    default: () => [],
  }),
  assistantReply: Annotation<string | undefined>,
  extractedPromise: Annotation<PromiseBrief | undefined>,
  scorecard: Annotation<PromiseScorecard | undefined>,
  personaPack: Annotation<PersonaPack | undefined>,
  marketReport: Annotation<MarketReport | undefined>,
  recommendations: Annotation<PositioningRecommendations | undefined>,
});

function hasUsableOpenAIKey() {
  return Boolean(
    process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your-key-here",
  );
}

async function getChatModel() {
  // Routed via provider layer: Sonnet for promise generation
  return getModelForRole("promise:author", {
    temperature: 0.25,
    maxOutputTokens: 4000,
    timeoutMs: 30000,
    maxRetries: 0,
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

const MARKET_REPORT_SYSTEM_PROMPT = `
Produce a practical market analysis for this nonfiction book promise.

Rules:
- Think like a publishing strategist, not a generic analyst.
- Comparison titles should be believable and relevant.
- Difference opportunities should be sharp and specific.
- Call out when the idea risks sounding broad, generic, crowded, or hard to market.
- Recommendations should improve the book's sellability and positioning.
- Keep the analysis concrete and readable.
`;

const POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT = `
Produce concise positioning recommendations that improve the commercial strength of this book promise.

Rules:
- Be specific.
- Push toward sharper positioning.
- Favor recommendations that improve salability, clarity, and differentiation.
- Avoid generic encouragement.
- Keep the summary punchy and strategic.
`;

function parseArtifactJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function formatSetupContextForPrompt(profile?: BookSetupProfile | null) {
  if (!profile) {
    return "No committed book setup profile is available yet.";
  }

  return [
    `Working title: ${profile.workingTitle || "Untitled Book"}`,
    `Writer persona: ${profile.writerPersona}`,
    `Writer persona guidance: ${profile.writerPersonaGuidance?.join(" | ") || "None provided"}`,
    `Target word count: ${profile.targetWordCount}`,
    `Word-count tolerance: +/- ${profile.wordCountTolerance}`,
    `Trim size: ${profile.trimSize}`,
    `Output formats: ${profile.outputFormats.join(", ")}`,
    `Voice references: ${profile.voiceReferenceNotes.join(" | ") || "None provided"}`,
    `System notes: ${profile.notesToSystem.join(" | ") || "None provided"}`,
  ].join("\n");
}

function formatReferenceMaterialsForPrompt(
  materials?: Array<{
    id: string;
    title: string;
    mimeType: string;
    note: string;
  }>,
) {
  if (!materials || materials.length === 0) {
    return "No uploaded reference materials are available for the Promise stage.";
  }

  return materials
    .map(
      (material, index) =>
        `${index + 1}. ${material.title} (${material.mimeType})${material.note ? ` - ${material.note}` : ""}`,
    )
    .join("\n");
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
      bookSetupProfile?.voiceReferenceNotes.length
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
  const mentionsLeadership = promise.audiencePrimary.toLowerCase().includes("leader");
  const mentionsPractical = promise.promiseStatement.toLowerCase().includes("practical");

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

function fallbackMarketReport(promise: PromiseBrief): MarketReport {
  return {
    marketCategory: `${promise.category} / decision-making / innovation`,
    comparisonTitles: [
      {
        title: "The Advantage",
        author: "Patrick Lencioni",
        whyRelevant: "Strong organizational clarity theme",
        differenceOpportunity: "More explicit focus on noise, uncertainty, and modern tech pressure",
      },
      {
        title: "Thinking, Fast and Slow",
        author: "Daniel Kahneman",
        whyRelevant: "Decision-making credibility anchor",
        differenceOpportunity: "Translate insight into an executive operating framework",
      },
      {
        title: "Competing in the Age of AI",
        author: "Marco Iansiti and Karim R. Lakhani",
        whyRelevant: "Adjacent AI and enterprise strategy territory",
        differenceOpportunity: "Lead with calm clarity instead of pure competitive transformation",
      },
    ],
    saturationAssessment: "moderate",
    attractionDrivers: [
      "Timely AI and digital-noise relevance",
      "Clear pain around overload and uncertainty",
      "Strong executive and team-leadership applicability",
    ],
    commercialRisks: [
      "Could read as too broad if the primary buyer is not named clearly",
      "Needs a sharper differentiator than general clarity language",
    ],
    recommendations: [
      "Anchor the promise in enterprise decision pressure",
      "Preserve the emotional relief of calm clarity",
      "Show how the book differs from generic leadership frameworks",
    ],
  };
}

function fallbackRecommendations(
  promise: PromiseBrief,
  marketReport: MarketReport,
): PositioningRecommendations {
  return {
    summary: `The core concept is attractive because it offers relief without losing practical authority. The strongest commercial path is to position ${promise.workingTitle} as a leadership operating system for decision-makers facing AI noise and organizational overload.`,
    recommendations: [
      "Narrow the primary reader toward enterprise leaders responsible for evaluating change",
      "Keep the emotional promise of calmer, clearer leadership visible",
      ...marketReport.recommendations,
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
) {
  const model = await getChatModel();

  if (!model) {
    console.log("[promise] No model available, using fallback");
    return fallbackAssistantReply(messages, bookSetupProfile);
  }


  const response = await model.invoke([
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
  ]);

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
  const model = await getChatModel();

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
  const model = await getChatModel();

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
  const model = await getChatModel();

  if (!model) {
    return fallbackPersonaPack(promise);
  }

  const structuredModel = model.withStructuredOutput(PersonaPackSchema);

  return structuredModel.invoke([
    new SystemMessage(PERSONA_SYSTEM_PROMPT),
    new HumanMessage(JSON.stringify(promise)),
  ]);
}

async function maybeGenerateMarketReport(promise: PromiseBrief) {
  const model = await getChatModel();

  if (!model) {
    return fallbackMarketReport(promise);
  }

  const structuredModel = model.withStructuredOutput(MarketReportSchema);

  return structuredModel.invoke([
    new SystemMessage(MARKET_REPORT_SYSTEM_PROMPT),
    new HumanMessage(JSON.stringify(promise)),
  ]);
}

async function maybeGenerateRecommendations(
  promise: PromiseBrief,
  marketReport: MarketReport,
  personas: PersonaPack,
) {
  const model = await getChatModel();

  if (!model) {
    return fallbackRecommendations(promise, marketReport);
  }

  const structuredModel = model.withStructuredOutput(PositioningRecommendationsSchema);

  return structuredModel.invoke([
    new SystemMessage(POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT),
    new HumanMessage(
      JSON.stringify({
        promise,
        marketReport,
        personas,
      }),
    ),
  ]);
}

async function loadContextNode(state: PromiseWorkflowState) {
  const book = await getOrCreateBookBySlug(state.bookSlug);
  const stage = await getStageForBook(book.id, StageKey.PROMISE);
  const committedBookSetup = await getCommittedBookSetup(book.id);
  const referenceDocuments = await listBookSourceDocuments({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    enabledOnly: true,
  });
  const artifacts = await getPromiseArtifacts(book.id);
  const promiseBriefVersions = await getPromiseBriefVersions(book.id);
  const chatArtifact = artifacts.find(
    (artifact) => artifact.artifactType === ArtifactType.PROMISE_CHAT,
  );
  const latestChatVersion = chatArtifact?.versions[0];
  const conversation = parseArtifactJson<{ messages?: PromiseMessage[] }>(
    latestChatVersion?.contentJson,
    { messages: [] },
  );

  return {
    bookId: book.id,
    stageId: stage?.id,
    bookSetupProfile: parseArtifactJson<BookSetupProfile | null>(
      committedBookSetup?.contentJson,
      null,
    ),
    referenceMaterials: referenceDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      mimeType: document.mimeType,
      note:
        document.metadataJson &&
        typeof document.metadataJson === "object" &&
        "note" in document.metadataJson &&
        typeof document.metadataJson.note === "string"
          ? document.metadataJson.note
          : "",
    })),
    conversationMessages: conversation.messages ?? [],
  };
}

async function appendUserMessageNode(state: PromiseWorkflowState) {
  return {
    conversationMessages: [
      ...state.conversationMessages,
      {
        role: "user" as const,
        content: state.userInput,
      },
    ],
  };
}

async function generatePromiseReplyNode(state: PromiseWorkflowState) {
  const assistantReply = await maybeGenerateAssistantReplyWithSetup(
    state.conversationMessages,
    state.bookSetupProfile,
    state.referenceMaterials,
  );

  return {
    assistantReply,
    conversationMessages: [
      ...state.conversationMessages,
      {
        role: "assistant" as const,
        content: assistantReply,
      },
    ],
  };
}

async function extractPromiseNode(state: PromiseWorkflowState) {
  return {
    extractedPromise: await maybeExtractPromise(
      state.bookSlug,
      state.conversationMessages,
      state.assistantReply ?? "",
      state.bookSetupProfile,
      state.referenceMaterials,
    ),
  };
}

async function scorePromiseNode(state: PromiseWorkflowState) {
  if (!state.extractedPromise) {
    return {};
  }

  return {
    scorecard: await maybeScorePromise(state.extractedPromise),
  };
}

async function personaNode(state: PromiseWorkflowState) {
  if (!state.extractedPromise) {
    return {};
  }

  return {
    personaPack: await maybeGeneratePersonas(state.extractedPromise),
  };
}

async function marketNode(state: PromiseWorkflowState) {
  if (!state.extractedPromise) {
    return {};
  }

  return {
    marketReport: await maybeGenerateMarketReport(state.extractedPromise),
  };
}

async function recommendationsNode(state: PromiseWorkflowState) {
  if (!state.extractedPromise || !state.marketReport || !state.personaPack) {
    return {};
  }

  return {
    recommendations: await maybeGenerateRecommendations(
      state.extractedPromise,
      state.marketReport,
      state.personaPack,
    ),
  };
}

async function persistNode(state: PromiseWorkflowState) {
  if (!state.bookId) {
    return {};
  }

  await createPromiseArtifactVersion({
    bookId: state.bookId,
    artifactType: ArtifactType.PROMISE_CHAT,
    title: "Promise Conversation",
    summary: "Conversation history for iterative promise refinement.",
    contentJson: {
      messages: state.conversationMessages,
    },
    contentText: state.conversationMessages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n\n"),
  });

  if (state.extractedPromise) {
    await createPromiseArtifactVersion({
      bookId: state.bookId,
      artifactType: ArtifactType.PROMISE_BRIEF,
      title: "Promise Brief",
      summary: state.extractedPromise.promiseStatement,
      contentJson: state.extractedPromise,
      contentText: state.extractedPromise.promiseStatement,
    });
  }

  if (state.scorecard) {
    await createPromiseArtifactVersion({
      bookId: state.bookId,
      artifactType: ArtifactType.PROMISE_SCORECARD,
      title: "Promise Scorecard",
      summary: "Scoring and revision guidance for the promise stage.",
      contentJson: state.scorecard,
    });
  }

  if (state.personaPack) {
    await createPromiseArtifactVersion({
      bookId: state.bookId,
      artifactType: ArtifactType.PERSONA_PACK,
      title: "Persona Pack",
      summary: "Reader personas inferred from the current promise direction.",
      contentJson: state.personaPack,
    });
  }

  if (state.marketReport) {
    await createPromiseArtifactVersion({
      bookId: state.bookId,
      artifactType: ArtifactType.MARKET_REPORT,
      title: "Market Report",
      summary: "Comparable books, risks, and opportunities for positioning.",
      contentJson: state.marketReport,
    });
  }

  if (state.recommendations) {
    await createPromiseArtifactVersion({
      bookId: state.bookId,
      artifactType: ArtifactType.POSITIONING_RECOMMENDATIONS,
      title: "Positioning Recommendations",
      summary: state.recommendations.summary,
      contentJson: state.recommendations,
      contentText: state.recommendations.summary,
    });
  }

  await createDirectionEvent({
    bookId: state.bookId,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_WORKFLOW_RAN",
    title: "Promise workflow generated a new pass",
    content: state.userInput,
    metadataJson: {
      hasCommittedSetup: Boolean(state.bookSetupProfile),
      referenceMaterialCount: state.referenceMaterials?.length ?? 0,
      conversationTurns: state.conversationMessages.length,
      generatedArtifacts: [
        state.extractedPromise ? "PROMISE_BRIEF" : null,
        state.scorecard ? "PROMISE_SCORECARD" : null,
        state.personaPack ? "PERSONA_PACK" : null,
        state.marketReport ? "MARKET_REPORT" : null,
        state.recommendations ? "POSITIONING_RECOMMENDATIONS" : null,
      ].filter(Boolean),
    },
  });

  return {};
}

const promiseGraph = new StateGraph(WorkflowState)
  .addNode("loadContext", loadContextNode)
  .addNode("appendUserMessage", appendUserMessageNode)
  .addNode("generatePromiseReply", generatePromiseReplyNode)
  .addNode("extractPromise", extractPromiseNode)
  .addNode("persistArtifacts", persistNode)
  .addEdge(START, "loadContext")
  .addEdge("loadContext", "appendUserMessage")
  .addEdge("appendUserMessage", "generatePromiseReply")
  .addEdge("generatePromiseReply", "extractPromise")
  .addEdge("extractPromise", "persistArtifacts")
  .addEdge("persistArtifacts", END)
  .compile();

export async function runPromiseWorkflow(bookSlug: string, userInput: string) {
  return promiseGraph.invoke({
    bookSlug,
    userInput,
    bookSetupProfile: null,
    referenceMaterials: [],
    conversationMessages: [],
  });
}

export async function commitPromiseWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  await commitPromiseStageBundle(book.id);
  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_COMMITTED",
    title: "Committed promise stage",
    content: "The current promise bundle was approved for downstream stages.",
  });
}

export async function getPromiseWorkspace(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const bookSetupVersion = await getCommittedBookSetup(book.id);
  const sourceDocuments = await listBookSourceDocuments({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
  });
  const stage = await getStageForBook(book.id, StageKey.PROMISE);
  const artifacts = await getPromiseArtifacts(book.id);
  const promiseBriefVersions = await getPromiseBriefVersions(book.id);
  const directionEvents = await listDirectionEventsForStage({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
  });

  const artifactMap = new Map(artifacts.map((artifact) => [artifact.artifactType, artifact]));

  const conversation = parseArtifactJson<{ messages?: PromiseMessage[] }>(
    artifactMap.get(ArtifactType.PROMISE_CHAT)?.versions[0]?.contentJson,
    { messages: [] },
  );
  const promiseBrief = parseArtifactJson<PromiseBrief>(
    artifactMap.get(ArtifactType.PROMISE_BRIEF)?.versions[0]?.contentJson,
    fallbackPromiseExtraction(
      book.slug,
      conversation.messages ?? [],
      "",
      parseArtifactJson<BookSetupProfile | null>(bookSetupVersion?.contentJson, null),
    ),
  );
  const scorecard = parseArtifactJson<PromiseScorecard>(
    artifactMap.get(ArtifactType.PROMISE_SCORECARD)?.versions[0]?.contentJson,
    fallbackScorecard(promiseBrief),
  );
  const personaPack = parseArtifactJson<PersonaPack>(
    artifactMap.get(ArtifactType.PERSONA_PACK)?.versions[0]?.contentJson,
    fallbackPersonaPack(promiseBrief),
  );
  const marketReport = parseArtifactJson<MarketReport>(
    artifactMap.get(ArtifactType.MARKET_REPORT)?.versions[0]?.contentJson,
    fallbackMarketReport(promiseBrief),
  );
  const recommendations = parseArtifactJson<PositioningRecommendations>(
    artifactMap.get(ArtifactType.POSITIONING_RECOMMENDATIONS)?.versions[0]?.contentJson,
    fallbackRecommendations(promiseBrief, marketReport),
  );
  const parsedPromiseVersions = promiseBriefVersions.map((version) => ({
    id: version.id,
    versionNumber: version.versionNumber,
    lifecycleState: version.lifecycleState,
    createdAt: version.createdAt,
      promiseBrief: parseArtifactJson<PromiseBrief>(
        version.contentJson,
        fallbackPromiseExtraction(
          book.slug,
          conversation.messages ?? [],
          "",
          parseArtifactJson<BookSetupProfile | null>(bookSetupVersion?.contentJson, null),
        ),
      ),
  }));
  const compareVersions =
    parsedPromiseVersions.length >= 2
      ? {
          latest: parsedPromiseVersions[0],
          previous: parsedPromiseVersions[1],
        }
      : null;

  return {
    book,
    stage,
    bookSetupProfile: parseArtifactJson<BookSetupProfile | null>(
      bookSetupVersion?.contentJson,
      null,
    ),
    sourceDocuments: sourceDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      mimeType: document.mimeType,
      storagePath: document.storagePath,
      createdAt: document.createdAt,
      enabled:
        document.metadataJson &&
        typeof document.metadataJson === "object" &&
        "enabled" in document.metadataJson &&
        typeof document.metadataJson.enabled === "boolean"
          ? document.metadataJson.enabled
          : true,
      note:
        document.metadataJson &&
        typeof document.metadataJson === "object" &&
        "note" in document.metadataJson &&
        typeof document.metadataJson.note === "string"
          ? document.metadataJson.note
          : "",
    })),
    conversationMessages: conversation.messages ?? [],
    promiseBrief,
    scorecard,
    personas: personaPack,
    market: marketReport,
    recommendations,
    directionEvents,
    promiseVersions: parsedPromiseVersions,
    compareVersions,
  };
}

export async function getOutlineWorkspace(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const promiseStage = await getStageForBook(book.id, StageKey.PROMISE);
  const outlineStage = await getStageForBook(book.id, StageKey.OUTLINE);
  const committedPromiseVersion = await getCommittedPromiseBrief(book.id);

  const committedPromise = parseArtifactJson<PromiseBrief | null>(
    committedPromiseVersion?.contentJson,
    null,
  );

  return {
    book,
    promiseStage,
    outlineStage,
    committedPromise,
    outlineReadiness: committedPromise
      ? {
          status: "ready",
          nextMoves: [
            "Generate chapter-level big ideas from the committed promise",
            "Define the chapter progression and transformation arc",
            "Map each chapter to a ME -> WE -> CORE TRUTH -> YOU -> WE flow",
          ],
        }
      : {
          status: "blocked",
          nextMoves: [
            "Commit the Promise stage first",
            "Confirm the primary reader and core truth",
            "Lock the commercial positioning before outlining",
          ],
        },
  };
}
