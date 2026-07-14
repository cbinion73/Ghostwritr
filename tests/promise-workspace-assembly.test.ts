import assert from "node:assert/strict";
import test from "node:test";

import { ArtifactType } from "@prisma/client";

import {
  buildPromiseArtifactAvailability,
  buildPromiseWorkspaceBaseArtifacts,
  buildPromiseWorkspaceDownstreamArtifacts,
  buildPromiseWorkspaceArtifactMap,
  buildPromiseWorkspaceResult,
  buildPromiseWorkspaceVersionComparison,
  getDefaultPromisePhaseApprovals,
  getPromiseWorkspaceConversationMessages,
  mapPromiseWorkspaceSourceDocuments,
  mapPromiseWorkspaceVersions,
  normalizePromisePhaseApprovals,
  parsePromiseWorkspaceConversationMessages,
  PROMISE_WORKSPACE_TAB_ORDER,
} from "../src/lib/workflows/promise/workspace-assembly";
import type { PromiseBrief } from "../src/lib/promise-types";

test("buildPromiseArtifactAvailability projects the Promise workspace artifact flags", () => {
  const availability = buildPromiseArtifactAvailability([
    { artifactType: ArtifactType.PROMISE_BRIEF },
    { artifactType: ArtifactType.AUDIENCE_RESEARCH },
    { artifactType: ArtifactType.MARKET_REPORT },
    { artifactType: ArtifactType.BOOK_PROMISE_REPORT },
  ]);

  assert.deepEqual(availability, {
    promiseBrief: true,
    audienceResearch: true,
    coreTruths: false,
    transformationArc: false,
    market: true,
    recommendations: false,
    bookPromiseReport: true,
  });
});

test("buildPromiseArtifactAvailability returns false for every flag with no artifacts", () => {
  const availability = buildPromiseArtifactAvailability([]);

  assert.deepEqual(availability, {
    promiseBrief: false,
    audienceResearch: false,
    coreTruths: false,
    transformationArc: false,
    market: false,
    recommendations: false,
    bookPromiseReport: false,
  });
});

test("mapPromiseWorkspaceSourceDocuments projects enabled and note metadata", () => {
  const createdAt = new Date("2026-07-13T13:17:00.000Z");
  const documents = mapPromiseWorkspaceSourceDocuments([
    {
      id: "doc-enabled",
      title: "Enabled document",
      mimeType: "application/pdf",
      storagePath: "uploads/enabled.pdf",
      createdAt,
      metadataJson: {
        enabled: false,
        note: "Use this for Phase 1 only.",
      },
    },
    {
      id: "doc-default",
      title: "Default document",
      mimeType: "text/plain",
      storagePath: "uploads/default.txt",
      createdAt,
      metadataJson: {
        enabled: "not-a-boolean",
        note: 123,
      },
    },
  ]);

  assert.deepEqual(documents, [
    {
      id: "doc-enabled",
      title: "Enabled document",
      mimeType: "application/pdf",
      storagePath: "uploads/enabled.pdf",
      createdAt,
      enabled: false,
      note: "Use this for Phase 1 only.",
    },
    {
      id: "doc-default",
      title: "Default document",
      mimeType: "text/plain",
      storagePath: "uploads/default.txt",
      createdAt,
      enabled: true,
      note: "",
    },
  ]);
});

test("getDefaultPromisePhaseApprovals returns pending status for every Promise tab", () => {
  const approvals = getDefaultPromisePhaseApprovals();

  assert.deepEqual(
    PROMISE_WORKSPACE_TAB_ORDER.map((tab) => approvals[tab]?.status),
    PROMISE_WORKSPACE_TAB_ORDER.map(() => "pending"),
  );
});

test("normalizePromisePhaseApprovals normalizes statuses and trims feedback", () => {
  const approvals = normalizePromisePhaseApprovals({
    phaseApprovals: {
      "promise-statement": {
        status: "approved",
        feedback: "  lock this promise  ",
        approvedAt: "2026-07-13T17:20:00.000Z",
      },
      audience: {
        status: "rejected",
        feedback: "",
        rejectedAt: "2026-07-13T17:21:00.000Z",
      },
      truth: {
        status: "not-real",
      },
    },
  });

  assert.deepEqual(approvals["promise-statement"], {
    status: "approved",
    feedback: "lock this promise",
    approvedAt: "2026-07-13T17:20:00.000Z",
  });
  assert.deepEqual(approvals.audience, {
    status: "rejected",
    rejectedAt: "2026-07-13T17:21:00.000Z",
  });
  assert.equal(approvals.truth?.status, "pending");
  assert.equal(approvals.market?.status, "pending");
});

function promiseBrief(workingTitle: string): PromiseBrief {
  return {
    workingTitle,
    audiencePrimary: "Operators",
    audienceSecondary: [],
    category: "Business",
    readerProblem: "Busy teams lack rhythm.",
    readerDesire: "clearer execution",
    bigIdea: "Cadence creates clarity.",
    coreTruth: "Rhythm beats urgency.",
    transformationBefore: "Reactive",
    transformationAfter: "Rhythmic",
    differentiation: "Practical operating model",
    promiseStatement: "Build a calmer cadence.",
    stakes: "Misalignment compounds.",
    tone: [],
    openQuestions: [],
  };
}

test("mapPromiseWorkspaceVersions projects versions with caller-owned parsing", () => {
  const createdAt = new Date("2026-07-13T17:22:00.000Z");
  const versions = mapPromiseWorkspaceVersions(
    [
      {
        id: "version-2",
        versionNumber: 2,
        lifecycleState: "CURRENT",
        createdAt,
        contentJson: { workingTitle: "Second promise" },
      },
    ],
    (contentJson) => promiseBrief((contentJson as { workingTitle: string }).workingTitle),
  );

  assert.deepEqual(versions, [
    {
      id: "version-2",
      versionNumber: 2,
      lifecycleState: "CURRENT",
      createdAt,
      promiseBrief: promiseBrief("Second promise"),
    },
  ]);
});

test("buildPromiseWorkspaceVersionComparison returns latest and previous when available", () => {
  const createdAt = new Date("2026-07-13T17:23:00.000Z");
  const versions = [
    {
      id: "version-3",
      versionNumber: 3,
      lifecycleState: "CURRENT",
      createdAt,
      promiseBrief: promiseBrief("Third promise"),
    },
    {
      id: "version-2",
      versionNumber: 2,
      lifecycleState: "SUPERSEDED",
      createdAt,
      promiseBrief: promiseBrief("Second promise"),
    },
  ];

  assert.deepEqual(buildPromiseWorkspaceVersionComparison(versions), {
    latest: versions[0],
    previous: versions[1],
  });
  assert.equal(buildPromiseWorkspaceVersionComparison(versions.slice(0, 1)), null);
});

test("buildPromiseWorkspaceArtifactMap indexes artifacts by artifact type", () => {
  const artifacts = [
    {
      artifactType: ArtifactType.PROMISE_CHAT,
      versions: [{ contentJson: { messages: [] } }],
      marker: "chat",
    },
    {
      artifactType: ArtifactType.PROMISE_BRIEF,
      versions: [{ contentJson: {} }],
      marker: "brief",
    },
  ];

  const artifactMap = buildPromiseWorkspaceArtifactMap(artifacts);

  assert.equal(artifactMap.get(ArtifactType.PROMISE_CHAT)?.marker, "chat");
  assert.equal(artifactMap.get(ArtifactType.PROMISE_BRIEF)?.marker, "brief");
});

test("parsePromiseWorkspaceConversationMessages returns only valid user and assistant messages", () => {
  const messages = parsePromiseWorkspaceConversationMessages({
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "system", content: "skip" },
      { role: "user", content: 123 },
      null,
    ],
  });

  assert.deepEqual(messages, [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
  ]);
  assert.deepEqual(parsePromiseWorkspaceConversationMessages({ messages: "bad" }), []);
});

test("getPromiseWorkspaceConversationMessages reads the PROMISE_CHAT artifact", () => {
  const artifactMap = buildPromiseWorkspaceArtifactMap([
    {
      artifactType: ArtifactType.PROMISE_CHAT,
      versions: [
        {
          contentJson: {
            messages: [{ role: "user", content: "draft the promise" }],
          },
        },
      ],
    },
  ]);

  assert.deepEqual(getPromiseWorkspaceConversationMessages(artifactMap), [
    { role: "user", content: "draft the promise" },
  ]);
});

test("buildPromiseWorkspaceBaseArtifacts delegates parsing for base artifacts", () => {
  const artifactMap = buildPromiseWorkspaceArtifactMap([
    {
      artifactType: ArtifactType.PROMISE_BRIEF,
      versions: [{ contentJson: { kind: "promise" } }],
    },
    {
      artifactType: ArtifactType.PROMISE_SCORECARD,
      versions: [{ contentJson: { kind: "scorecard" } }],
    },
    {
      artifactType: ArtifactType.PERSONA_PACK,
      versions: [{ contentJson: { kind: "personas" } }],
    },
    {
      artifactType: ArtifactType.AUDIENCE_RESEARCH,
      versions: [{ contentJson: { kind: "audience" } }],
    },
  ]);
  const calls: string[] = [];

  const base = buildPromiseWorkspaceBaseArtifacts(
    artifactMap,
    { kind: "setup" },
    {
      normalizeBookSetupProfile: (contentJson) => {
        calls.push(`setup:${(contentJson as { kind: string }).kind}`);
        return null;
      },
      parsePromiseBrief: (contentJson) => {
        calls.push(`promise:${(contentJson as { kind: string }).kind}`);
        return promiseBrief("Delegated promise");
      },
      parseScorecard: (contentJson, parsedPromiseBrief) => {
        calls.push(`scorecard:${(contentJson as { kind: string }).kind}:${parsedPromiseBrief.workingTitle}`);
        return {
          scores: {
            clarity: 1,
            audienceFit: 1,
            distinctiveness: 1,
            commercialPull: 1,
            credibility: 1,
          },
          strengths: [],
          concerns: [],
          nextBestRevisions: [],
        };
      },
      parsePersonaPack: (contentJson, parsedPromiseBrief) => {
        calls.push(`personas:${(contentJson as { kind: string }).kind}:${parsedPromiseBrief.workingTitle}`);
        return { personas: [] };
      },
      parseAudienceResearch: (contentJson) => {
        calls.push(`audience:${(contentJson as { kind: string }).kind}`);
        return undefined;
      },
    },
  );

  assert.equal(base.bookSetupProfile, null);
  assert.equal(base.promiseBrief.workingTitle, "Delegated promise");
  assert.deepEqual(base.personaPack, { personas: [] });
  assert.equal(base.audienceResearch, undefined);
  assert.deepEqual(calls, [
    "setup:setup",
    "promise:promise",
    "scorecard:scorecard:Delegated promise",
    "personas:personas:Delegated promise",
    "audience:audience",
  ]);
});

test("buildPromiseWorkspaceDownstreamArtifacts delegates downstream normalization in dependency order", () => {
  const artifactMap = buildPromiseWorkspaceArtifactMap([
    {
      artifactType: ArtifactType.CORE_TRUTHS,
      versions: [{ contentJson: { kind: "truth" } }],
    },
    {
      artifactType: ArtifactType.TRANSFORMATION_ARC,
      versions: [{ contentJson: { kind: "transformation" } }],
    },
    {
      artifactType: ArtifactType.MARKET_REPORT,
      versions: [{ contentJson: { kind: "market" } }],
    },
    {
      artifactType: ArtifactType.POSITIONING_RECOMMENDATIONS,
      versions: [{ contentJson: { kind: "recommendations" } }],
    },
    {
      artifactType: ArtifactType.BOOK_PROMISE_REPORT,
      versions: [{ contentJson: { kind: "book-promise" } }],
    },
  ]);
  const calls: string[] = [];
  const baseArtifacts = {
    bookSetupProfile: null,
    promiseBrief: promiseBrief("Downstream promise"),
    scorecard: {
      scores: {
        clarity: 1,
        audienceFit: 1,
        distinctiveness: 1,
        commercialPull: 1,
        credibility: 1,
      },
      strengths: [],
      concerns: [],
      nextBestRevisions: [],
    },
    personaPack: { personas: [] },
    audienceResearch: undefined,
  };

  const downstream = buildPromiseWorkspaceDownstreamArtifacts(
    artifactMap,
    { titleSubtitleFinalization: { kind: "title" } },
    baseArtifacts,
    {
      buildPersonaContexts: (parsedPromiseBrief) => {
        calls.push(`personas:${parsedPromiseBrief.workingTitle}`);
        return [
          {
            name: "Operator Olivia",
            context: "COO",
            dilemma: "too much noise",
            voiceHint: "Drucker",
          },
        ];
      },
      parseCoreTruths: (contentJson) => {
        calls.push(`truth:${(contentJson as { kind: string }).kind}`);
        return { coreInsight: { coreTruth: "truth" } } as never;
      },
      parseTransformationArc: (contentJson) => {
        calls.push(`transformation:${(contentJson as { kind: string }).kind}`);
        return { arc: { stage2We: { sharedProblem: "shared" } } } as never;
      },
      parseMarketReport: (contentJson) => {
        calls.push(`market:${(contentJson as { kind: string }).kind}`);
        return { executiveSummary: { headline: "market" } } as never;
      },
      parseRecommendations: (contentJson) => {
        calls.push(`recommendations:${(contentJson as { kind: string }).kind}`);
        return { summary: "recommend" } as never;
      },
      parseTitleSubtitleFinalization: (stageMetadata) => {
        calls.push(`title:${(stageMetadata.titleSubtitleFinalization as { kind: string }).kind}`);
        return { finalizedTitle: "Final Title" } as never;
      },
      parseBookPromiseReport: (contentJson) => {
        calls.push(`book-promise:${(contentJson as { kind: string }).kind}`);
        return { title: "Book Promise Report" } as never;
      },
    },
  );

  assert.equal(downstream.personaContexts[0]?.name, "Operator Olivia");
  assert.deepEqual(calls, [
    "personas:Downstream promise",
    "truth:truth",
    "transformation:transformation",
    "market:market",
    "recommendations:recommendations",
    "title:title",
    "book-promise:book-promise",
  ]);
});

test("buildPromiseWorkspaceResult assembles the public workspace shape", () => {
  const createdAt = new Date("2026-07-13T17:28:00.000Z");
  const baseArtifacts = {
    bookSetupProfile: null,
    promiseBrief: promiseBrief("Assembled promise"),
    scorecard: {
      scores: {
        clarity: 1,
        audienceFit: 1,
        distinctiveness: 1,
        commercialPull: 1,
        credibility: 1,
      },
      strengths: [],
      concerns: [],
      nextBestRevisions: [],
    },
    personaPack: { personas: [] },
    audienceResearch: undefined,
  };
  const downstreamArtifacts = {
    personaContexts: [],
    coreTruths: undefined,
    transformationArc: undefined,
    marketReport: { executiveSummary: { headline: "market" } } as never,
    recommendations: { summary: "recommend" } as never,
    titleSubtitleFinalization: undefined,
    bookPromiseReport: undefined,
  };

  const workspace = buildPromiseWorkspaceResult({
    book: { slug: "book" },
    stage: { stageKey: "PROMISE" },
    sourceDocuments: [],
    conversationMessages: [{ role: "user", content: "hello" }],
    baseArtifacts,
    downstreamArtifacts,
    phaseApprovals: getDefaultPromisePhaseApprovals(),
    artifactAvailability: buildPromiseArtifactAvailability([]),
    directionEvents: [{ title: "event" }],
    promiseVersions: [],
    compareVersions: null,
    phase1StrategicBriefVersion: {
      id: "brief-version",
      versionNumber: 1,
      createdAt,
    },
  });

  assert.deepEqual(workspace.book, { slug: "book" });
  assert.equal(workspace.promiseBrief.workingTitle, "Assembled promise");
  assert.deepEqual(workspace.personas, { personas: [] });
  assert.deepEqual(workspace.market, { executiveSummary: { headline: "market" } });
  assert.deepEqual(workspace.phase1StrategicBrief, {
    id: "brief-version",
    versionNumber: 1,
    createdAt,
  });
});
