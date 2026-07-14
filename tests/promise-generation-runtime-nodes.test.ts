import assert from "node:assert/strict";
import test from "node:test";

import { ArtifactType, StageKey } from "@prisma/client";

import type {
  MarketReport,
  PersonaPack,
  PositioningRecommendations,
  PromiseBrief,
  PromiseScorecard,
} from "../src/lib/promise-types";
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
} from "../src/lib/workflows/promise/generation-runtime-nodes";

const promise = {
  workingTitle: "Lead Through the Fog",
  audiencePrimary: "operations leaders",
  audienceSecondary: [],
  category: "Business",
  readerProblem: "unclear priorities",
  readerDesire: "focused execution",
  bigIdea: "clarity compounds",
  coreTruth: "leaders need operating rhythm",
  transformationBefore: "reactive",
  transformationAfter: "focused",
  differentiation: "field-tested cadence",
  promiseStatement: "A practical system for clear execution.",
  stakes: "teams waste effort",
  tone: ["direct"],
  openQuestions: [],
} satisfies PromiseBrief;

const scorecard = {
  scores: {
    clarity: 8,
    audienceFit: 8,
    distinctiveness: 7,
    commercialPull: 7,
    credibility: 8,
  },
  strengths: ["specific reader"],
  concerns: ["tighten proof"],
  nextBestRevisions: ["name the outcome"],
} satisfies PromiseScorecard;

const personas = {
  personas: [
    {
      id: "ops",
      name: "Operations Leader",
      priority: "primary",
      context: "Owns execution",
      painPoints: ["priority churn"],
      desiredOutcomes: ["predictable execution"],
      buyingMotivations: ["practical cadence"],
      languageCues: ["focus"],
    },
  ],
} satisfies PersonaPack;

const marketReport = {
  marketCategory: "business leadership",
  comparisonTitles: [],
  saturationAssessment: "active but differentiated enough",
  attractionDrivers: [],
  commercialRisks: [],
  recommendations: [],
} as unknown as MarketReport;

const recommendations = {
  summary: "Position around practical clarity for operators.",
} as PositioningRecommendations;

test("Promise runtime append-user node appends the current user input", async () => {
  const result = await appendUserMessageNode({
    bookSlug: "lead-through-the-fog",
    userInput: "Make it sharper.",
    conversationMessages: [{ role: "assistant", content: "What is strong?" }],
  });

  assert.deepEqual(result.conversationMessages, [
    { role: "assistant", content: "What is strong?" },
    { role: "user", content: "Make it sharper." },
  ]);
});

test("Promise runtime assistant-reply node appends generated assistant content", async () => {
  const node = createGeneratePromiseReplyNode({
    maybeGenerateAssistantReplyWithSetup: async (messages, _setup, materials, slug) => {
      assert.equal(slug, "lead-through-the-fog");
      assert.equal(messages.length, 1);
      assert.equal(materials?.[0]?.title, "Author notes");
      return "Here is the sharper promise.";
    },
  });

  const result = await node({
    bookSlug: "lead-through-the-fog",
    userInput: "unused after append",
    referenceMaterials: [
      { id: "doc-1", title: "Author notes", mimeType: "text/plain", note: "setup" },
    ],
    conversationMessages: [{ role: "user", content: "Make it sharper." }],
  });

  assert.equal(result.assistantReply, "Here is the sharper promise.");
  assert.deepEqual(result.conversationMessages.at(-1), {
    role: "assistant",
    content: "Here is the sharper promise.",
  });
});

test("Promise runtime load-context node maps setup, references, and chat history", async () => {
  let briefVersionsLoadedFor: string | null = null;
  const node = createLoadContextNode({
    getOrCreateBookBySlug: async (slug) => {
      assert.equal(slug, "lead-through-the-fog");
      return { id: "book-1" };
    },
    getStageForBook: async (bookId, stageKey) => {
      assert.equal(bookId, "book-1");
      assert.equal(stageKey, StageKey.PROMISE);
      return { id: "stage-1" };
    },
    getCommittedBookSetup: async () => ({
      contentJson: { workingTitle: "Lead Through the Fog", writerPersona: "direct guide" },
    }),
    listBookSourceDocuments: async (input) => {
      assert.deepEqual(input, {
        bookId: "book-1",
        stageKey: StageKey.PROMISE,
        enabledOnly: true,
      });
      return [
        {
          id: "doc-1",
          title: "Author notes",
          mimeType: "text/plain",
          metadataJson: { note: "Foundational concept notes" },
        },
        {
          id: "doc-2",
          title: "Raw transcript",
          mimeType: "text/plain",
          metadataJson: {},
        },
      ];
    },
    getPromiseArtifacts: async () => [
      {
        artifactType: ArtifactType.PROMISE_CHAT,
        versions: [{ contentJson: { messages: [{ role: "user", content: "Original idea" }] } }],
      },
    ],
    getPromiseBriefVersions: async (bookId) => {
      briefVersionsLoadedFor = bookId;
      return [];
    },
  });

  const result = await node({
    bookSlug: "lead-through-the-fog",
    userInput: "next message",
    conversationMessages: [],
  });

  assert.equal(result.bookId, "book-1");
  assert.equal(result.stageId, "stage-1");
  assert.equal(result.bookSetupProfile?.workingTitle, "Lead Through the Fog");
  assert.equal(result.referenceMaterials[0]?.note, "Foundational concept notes");
  assert.equal(result.referenceMaterials[1]?.note, "");
  assert.deepEqual(result.conversationMessages, [{ role: "user", content: "Original idea" }]);
  assert.equal(briefVersionsLoadedFor, "book-1");
});

test("Promise runtime extract node delegates full conversation and context", async () => {
  const node = createExtractPromiseNode({
    maybeExtractPromise: async (slug, messages, assistantReply, setup, materials) => {
      assert.equal(slug, "lead-through-the-fog");
      assert.equal(messages[0]?.content, "Original idea");
      assert.equal(assistantReply, "Assistant refinement");
      assert.equal(setup?.workingTitle, "Lead Through the Fog");
      assert.equal(materials?.[0]?.id, "doc-1");
      return promise;
    },
  });

  const result = await node({
    bookSlug: "lead-through-the-fog",
    userInput: "next",
    bookSetupProfile: { workingTitle: "Lead Through the Fog" } as never,
    referenceMaterials: [{ id: "doc-1", title: "Notes", mimeType: "text/plain", note: "" }],
    conversationMessages: [{ role: "user", content: "Original idea" }],
    assistantReply: "Assistant refinement",
  });

  assert.equal(result.extractedPromise.promiseStatement, promise.promiseStatement);
});

test("Promise runtime score, persona, and market nodes skip when no extracted promise exists", async () => {
  const fail = async () => {
    throw new Error("should not be called");
  };

  assert.deepEqual(
    await createScorePromiseNode({ maybeScorePromise: fail })({
      bookSlug: "lead-through-the-fog",
      userInput: "next",
      conversationMessages: [],
    }),
    {},
  );
  assert.deepEqual(
    await createPersonaNode({ maybeGeneratePersonas: fail })({
      bookSlug: "lead-through-the-fog",
      userInput: "next",
      conversationMessages: [],
    }),
    {},
  );
  assert.deepEqual(
    await createMarketNode({ maybeGenerateMarketReport: fail })({
      bookSlug: "lead-through-the-fog",
      userInput: "next",
      conversationMessages: [],
    }),
    {},
  );
});

test("Promise runtime score, persona, and market nodes delegate when extracted promise exists", async () => {
  assert.deepEqual(
    await createScorePromiseNode({ maybeScorePromise: async (input) => {
      assert.equal(input, promise);
      return scorecard;
    } })({
      bookSlug: "lead-through-the-fog",
      userInput: "next",
      conversationMessages: [],
      extractedPromise: promise,
    }),
    { scorecard },
  );

  assert.deepEqual(
    await createPersonaNode({ maybeGeneratePersonas: async (input) => {
      assert.equal(input, promise);
      return personas;
    } })({
      bookSlug: "lead-through-the-fog",
      userInput: "next",
      conversationMessages: [],
      extractedPromise: promise,
    }),
    { personaPack: personas },
  );

  assert.deepEqual(
    await createMarketNode({ maybeGenerateMarketReport: async (input) => {
      assert.equal(input, promise);
      return marketReport;
    } })({
      bookSlug: "lead-through-the-fog",
      userInput: "next",
      conversationMessages: [],
      extractedPromise: promise,
    }),
    { marketReport },
  );
});

test("Promise runtime recommendations node requires promise, market, and personas", async () => {
  const fail = async () => {
    throw new Error("should not be called");
  };

  assert.deepEqual(
    await createRecommendationsNode({ maybeGenerateRecommendations: fail })({
      bookSlug: "lead-through-the-fog",
      userInput: "next",
      conversationMessages: [],
      extractedPromise: promise,
      marketReport,
    }),
    {},
  );

  const node = createRecommendationsNode({
    maybeGenerateRecommendations: async (inputPromise, inputMarket, inputPersonas) => {
      assert.equal(inputPromise, promise);
      assert.equal(inputMarket, marketReport);
      assert.equal(inputPersonas, personas);
      return recommendations;
    },
  });

  assert.deepEqual(
    await node({
      bookSlug: "lead-through-the-fog",
      userInput: "next",
      conversationMessages: [],
      extractedPromise: promise,
      marketReport,
      personaPack: personas,
    }),
    { recommendations },
  );
});

test("Promise runtime persist node skips writes without a book id", async () => {
  const node = createPersistNode({
    createPromiseArtifactVersion: async () => {
      throw new Error("artifact write should not run");
    },
    createDirectionEvent: async () => {
      throw new Error("direction event should not run");
    },
  });

  assert.deepEqual(
    await node({
      bookSlug: "lead-through-the-fog",
      userInput: "next",
      conversationMessages: [],
    }),
    {},
  );
});

test("Promise runtime persist node writes expected artifact shapes and direction metadata", async () => {
  const artifactWrites: Array<{
    artifactType: ArtifactType;
    title?: string;
    summary?: string;
    contentText?: string;
    contentJson?: unknown;
  }> = [];
  const directionEvents: Array<{ metadataJson?: unknown }> = [];
  const node = createPersistNode({
    createPromiseArtifactVersion: async (input) => {
      artifactWrites.push(input);
      return {};
    },
    createDirectionEvent: async (input) => {
      directionEvents.push(input);
      return {};
    },
  });

  await node({
    bookSlug: "lead-through-the-fog",
    bookId: "book-1",
    userInput: "Make it sharper",
    bookSetupProfile: { workingTitle: "Lead Through the Fog" } as never,
    referenceMaterials: [{ id: "doc-1", title: "Notes", mimeType: "text/plain", note: "" }],
    conversationMessages: [
      { role: "user", content: "Original idea" },
      { role: "assistant", content: "Assistant reply" },
    ],
    extractedPromise: promise,
    scorecard,
    personaPack: personas,
    marketReport,
    recommendations,
  });

  assert.deepEqual(
    artifactWrites.map((write) => write.artifactType),
    [
      ArtifactType.PROMISE_CHAT,
      ArtifactType.PROMISE_BRIEF,
      ArtifactType.PROMISE_SCORECARD,
      ArtifactType.PERSONA_PACK,
      ArtifactType.MARKET_REPORT,
      ArtifactType.POSITIONING_RECOMMENDATIONS,
    ],
  );
  assert.equal(artifactWrites[0]?.contentText, "USER: Original idea\n\nASSISTANT: Assistant reply");
  assert.equal(artifactWrites[1]?.summary, promise.promiseStatement);
  assert.equal(artifactWrites[5]?.contentText, recommendations.summary);
  assert.deepEqual(directionEvents[0]?.metadataJson, {
    hasCommittedSetup: true,
    referenceMaterialCount: 1,
    conversationTurns: 2,
    generatedArtifacts: [
      "PROMISE_BRIEF",
      "PROMISE_SCORECARD",
      "PERSONA_PACK",
      "MARKET_REPORT",
      "POSITIONING_RECOMMENDATIONS",
    ],
  });
});
