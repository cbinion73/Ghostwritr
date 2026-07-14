import { ArtifactType, StageKey } from "@prisma/client";

import type {
  MarketReport,
  PersonaPack,
  PositioningRecommendations,
  PromiseBrief,
  PromiseMessage,
  PromiseScorecard,
} from "../../promise-types";
import {
  normalizeBookSetupProfile,
  parseArtifactJson,
  type PromiseWorkflowState,
} from "./generation-runtime-state";

type SourceDocumentRecord = {
  id: string;
  title: string;
  mimeType: string;
  metadataJson: unknown;
};

type PromiseArtifactRecord = {
  artifactType: ArtifactType;
  versions: Array<{
    contentJson: unknown;
  }>;
};

type LoadContextNodeDependencies = {
  getOrCreateBookBySlug: (slug: string) => Promise<{ id: string }>;
  getStageForBook: (bookId: string, stageKey: StageKey) => Promise<{ id: string } | null | undefined>;
  getCommittedBookSetup: (bookId: string) => Promise<{ contentJson: unknown } | null | undefined>;
  listBookSourceDocuments: (input: {
    bookId: string;
    stageKey: StageKey;
    enabledOnly: true;
  }) => Promise<SourceDocumentRecord[]>;
  getPromiseArtifacts: (bookId: string) => Promise<PromiseArtifactRecord[]>;
  getPromiseBriefVersions: (bookId: string) => Promise<unknown>;
};

type GeneratePromiseReplyDependencies = {
  maybeGenerateAssistantReplyWithSetup: (
    messages: PromiseMessage[],
    bookSetupProfile: PromiseWorkflowState["bookSetupProfile"],
    referenceMaterials: PromiseWorkflowState["referenceMaterials"],
    bookSlug: string,
  ) => Promise<string>;
};

type ExtractPromiseNodeDependencies = {
  maybeExtractPromise: (
    bookSlug: string,
    messages: PromiseMessage[],
    assistantReply: string,
    bookSetupProfile: PromiseWorkflowState["bookSetupProfile"],
    referenceMaterials: PromiseWorkflowState["referenceMaterials"],
  ) => Promise<unknown>;
};

type ScorePromiseNodeDependencies = {
  maybeScorePromise: (promise: PromiseBrief) => Promise<unknown>;
};

type PersonaNodeDependencies = {
  maybeGeneratePersonas: (promise: PromiseBrief) => Promise<unknown>;
};

type MarketNodeDependencies = {
  maybeGenerateMarketReport: (promise: PromiseBrief) => Promise<unknown>;
};

type RecommendationsNodeDependencies = {
  maybeGenerateRecommendations: (
    promise: PromiseBrief,
    marketReport: MarketReport,
    personas: PersonaPack,
  ) => Promise<unknown>;
};

type PromiseArtifactWrite = {
  bookId: string;
  artifactType: ArtifactType;
  title?: string;
  summary?: string;
  contentJson?: unknown;
  contentText?: string;
};

type DirectionEventWrite = {
  bookId: string;
  stageKey: StageKey;
  eventType: string;
  title: string;
  content?: string | null;
  metadataJson?: unknown;
};

type PersistNodeDependencies = {
  createPromiseArtifactVersion: (input: PromiseArtifactWrite) => Promise<unknown>;
  createDirectionEvent: (input: DirectionEventWrite) => Promise<unknown>;
};

export function createLoadContextNode(dependencies: LoadContextNodeDependencies) {
  return async function loadContextNode(state: PromiseWorkflowState) {
    const book = await dependencies.getOrCreateBookBySlug(state.bookSlug);
    const stage = await dependencies.getStageForBook(book.id, StageKey.PROMISE);
    const committedBookSetup = await dependencies.getCommittedBookSetup(book.id);
    const referenceDocuments = await dependencies.listBookSourceDocuments({
      bookId: book.id,
      stageKey: StageKey.PROMISE,
      enabledOnly: true,
    });
    const artifacts = await dependencies.getPromiseArtifacts(book.id);
    await dependencies.getPromiseBriefVersions(book.id);
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
      bookSetupProfile: normalizeBookSetupProfile(committedBookSetup?.contentJson),
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
  };
}

export async function appendUserMessageNode(state: PromiseWorkflowState) {
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

export function createGeneratePromiseReplyNode(dependencies: GeneratePromiseReplyDependencies) {
  return async function generatePromiseReplyNode(state: PromiseWorkflowState) {
    const assistantReply = await dependencies.maybeGenerateAssistantReplyWithSetup(
      state.conversationMessages,
      state.bookSetupProfile,
      state.referenceMaterials,
      state.bookSlug,
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
  };
}

export function createExtractPromiseNode(dependencies: ExtractPromiseNodeDependencies) {
  return async function extractPromiseNode(state: PromiseWorkflowState) {
    return {
      extractedPromise: await dependencies.maybeExtractPromise(
        state.bookSlug,
        state.conversationMessages,
        state.assistantReply ?? "",
        state.bookSetupProfile,
        state.referenceMaterials,
      ) as PromiseBrief,
    };
  };
}

export function createScorePromiseNode(dependencies: ScorePromiseNodeDependencies) {
  return async function scorePromiseNode(state: PromiseWorkflowState) {
    if (!state.extractedPromise) {
      return {};
    }

    return {
      scorecard: await dependencies.maybeScorePromise(state.extractedPromise) as PromiseScorecard,
    };
  };
}

export function createPersonaNode(dependencies: PersonaNodeDependencies) {
  return async function personaNode(state: PromiseWorkflowState) {
    if (!state.extractedPromise) {
      return {};
    }

    return {
      personaPack: await dependencies.maybeGeneratePersonas(state.extractedPromise) as PersonaPack,
    };
  };
}

export function createMarketNode(dependencies: MarketNodeDependencies) {
  return async function marketNode(state: PromiseWorkflowState) {
    if (!state.extractedPromise) {
      return {};
    }

    return {
      marketReport: await dependencies.maybeGenerateMarketReport(state.extractedPromise) as MarketReport,
    };
  };
}

export function createRecommendationsNode(dependencies: RecommendationsNodeDependencies) {
  return async function recommendationsNode(state: PromiseWorkflowState) {
    if (!state.extractedPromise || !state.marketReport || !state.personaPack) {
      return {};
    }

    return {
      recommendations: await dependencies.maybeGenerateRecommendations(
        state.extractedPromise,
        state.marketReport,
        state.personaPack,
      ) as PositioningRecommendations,
    };
  };
}

export function createPersistNode(dependencies: PersistNodeDependencies) {
  return async function persistNode(state: PromiseWorkflowState) {
    if (!state.bookId) {
      return {};
    }

    await dependencies.createPromiseArtifactVersion({
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
      await dependencies.createPromiseArtifactVersion({
        bookId: state.bookId,
        artifactType: ArtifactType.PROMISE_BRIEF,
        title: "Promise Brief",
        summary: state.extractedPromise.promiseStatement,
        contentJson: state.extractedPromise,
        contentText: state.extractedPromise.promiseStatement,
      });
    }

    if (state.scorecard) {
      await dependencies.createPromiseArtifactVersion({
        bookId: state.bookId,
        artifactType: ArtifactType.PROMISE_SCORECARD,
        title: "Promise Scorecard",
        summary: "Scoring and revision guidance for the promise stage.",
        contentJson: state.scorecard,
      });
    }

    if (state.personaPack) {
      await dependencies.createPromiseArtifactVersion({
        bookId: state.bookId,
        artifactType: ArtifactType.PERSONA_PACK,
        title: "Persona Pack",
        summary: "Reader personas inferred from the current promise direction.",
        contentJson: state.personaPack,
      });
    }

    if (state.marketReport) {
      await dependencies.createPromiseArtifactVersion({
        bookId: state.bookId,
        artifactType: ArtifactType.MARKET_REPORT,
        title: "Market Report",
        summary: "Comparable books, risks, and opportunities for positioning.",
        contentJson: state.marketReport,
      });
    }

    if (state.recommendations) {
      await dependencies.createPromiseArtifactVersion({
        bookId: state.bookId,
        artifactType: ArtifactType.POSITIONING_RECOMMENDATIONS,
        title: "Positioning Recommendations",
        summary: state.recommendations.summary,
        contentJson: state.recommendations,
        contentText: state.recommendations.summary,
      });
    }

    await dependencies.createDirectionEvent({
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
  };
}
