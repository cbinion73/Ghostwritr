import { ArtifactType } from "@prisma/client";

import type {
  AudienceResearchArtifact,
  BookPromiseReport,
  CoreTruthsArtifact,
  MarketReport,
  PromiseArtifactAvailability,
  PromiseBrief,
  PromiseMessage,
  PromisePhaseApprovals,
  PromisePhaseApprovalStatus,
  PersonaDeepProfile,
  PersonaPack,
  PositioningRecommendations,
  PromiseScorecard,
  PromiseTabName,
  TitleSubtitleFinalization,
  TransformationArtifact,
} from "../../promise-types";
import type { BookSetupProfile } from "../../book-setup-types";
import type { TruthPersonaContext } from "./report-presentation";

export const PROMISE_WORKSPACE_TAB_ORDER = [
  "promise-statement",
  "audience",
  "truth",
  "transformation",
  "market",
  "recommendations",
  "book-promise",
] as const satisfies readonly PromiseTabName[];

type ArtifactAvailabilitySource = {
  artifactType: ArtifactType;
};

type PromiseWorkspaceArtifactSource = ArtifactAvailabilitySource & {
  versions: readonly { contentJson: unknown }[];
};

export function buildPromiseWorkspaceArtifactMap<TArtifact extends PromiseWorkspaceArtifactSource>(
  artifacts: readonly TArtifact[],
): Map<ArtifactType, TArtifact> {
  return new Map(artifacts.map((artifact) => [artifact.artifactType, artifact]));
}

export function buildPromiseArtifactAvailability(
  artifacts: readonly ArtifactAvailabilitySource[],
): PromiseArtifactAvailability {
  const artifactTypes = new Set(artifacts.map((artifact) => artifact.artifactType));

  return {
    promiseBrief: artifactTypes.has(ArtifactType.PROMISE_BRIEF),
    audienceResearch: artifactTypes.has(ArtifactType.AUDIENCE_RESEARCH),
    coreTruths: artifactTypes.has(ArtifactType.CORE_TRUTHS),
    transformationArc: artifactTypes.has(ArtifactType.TRANSFORMATION_ARC),
    market: artifactTypes.has(ArtifactType.MARKET_REPORT),
    recommendations: artifactTypes.has(ArtifactType.POSITIONING_RECOMMENDATIONS),
    bookPromiseReport: artifactTypes.has(ArtifactType.BOOK_PROMISE_REPORT),
  };
}

type PromiseWorkspaceSourceDocumentSource = {
  id: string;
  title: string;
  mimeType: string;
  storagePath: string;
  createdAt: Date;
  metadataJson: unknown;
};

export type PromiseWorkspaceSourceDocument = {
  id: string;
  title: string;
  mimeType: string;
  storagePath: string;
  createdAt: Date;
  enabled: boolean;
  note: string;
};

function sourceDocumentMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function mapPromiseWorkspaceSourceDocuments(
  documents: readonly PromiseWorkspaceSourceDocumentSource[],
): PromiseWorkspaceSourceDocument[] {
  return documents.map((document) => {
    const metadata = sourceDocumentMetadata(document.metadataJson);

    return {
      id: document.id,
      title: document.title,
      mimeType: document.mimeType,
      storagePath: document.storagePath,
      createdAt: document.createdAt,
      enabled: typeof metadata.enabled === "boolean" ? metadata.enabled : true,
      note: typeof metadata.note === "string" ? metadata.note : "",
    };
  });
}

export function getDefaultPromisePhaseApprovals(): PromisePhaseApprovals {
  return Object.fromEntries(
    PROMISE_WORKSPACE_TAB_ORDER.map((tab) => [tab, { status: "pending" as const }]),
  ) as PromisePhaseApprovals;
}

function normalizePromisePhaseStatus(value: unknown): PromisePhaseApprovalStatus {
  if (value === "approved" || value === "rejected") {
    return value;
  }

  return "pending";
}

export function normalizePromisePhaseApprovals(value: unknown): PromisePhaseApprovals {
  const defaults = getDefaultPromisePhaseApprovals();
  const metadata = sourceDocumentMetadata(value);
  const phaseApprovals = sourceDocumentMetadata(metadata.phaseApprovals);

  return PROMISE_WORKSPACE_TAB_ORDER.reduce<PromisePhaseApprovals>((accumulator, tab) => {
    const rawEntry = sourceDocumentMetadata(phaseApprovals[tab]);
    accumulator[tab] = {
      status: normalizePromisePhaseStatus(rawEntry.status),
      ...(typeof rawEntry.feedback === "string" && rawEntry.feedback.trim().length > 0
        ? { feedback: rawEntry.feedback.trim() }
        : {}),
      ...(typeof rawEntry.approvedAt === "string" ? { approvedAt: rawEntry.approvedAt } : {}),
      ...(typeof rawEntry.rejectedAt === "string" ? { rejectedAt: rawEntry.rejectedAt } : {}),
    };
    return accumulator;
  }, { ...defaults });
}

type PromiseBriefVersionSource = {
  id: string;
  versionNumber: number;
  lifecycleState: string;
  createdAt: Date;
  contentJson: unknown;
};

export type PromiseWorkspaceParsedVersion = {
  id: string;
  versionNumber: number;
  lifecycleState: string;
  createdAt: Date;
  promiseBrief: PromiseBrief;
};

export type PromiseWorkspaceVersionComparison = {
  latest: PromiseWorkspaceParsedVersion;
  previous: PromiseWorkspaceParsedVersion;
} | null;

export type PromiseWorkspaceStrategicBriefSummarySource = {
  id: string;
  versionNumber: number;
  createdAt: Date;
};

export function mapPromiseWorkspaceVersions(
  versions: readonly PromiseBriefVersionSource[],
  parsePromiseBrief: (contentJson: unknown) => PromiseBrief,
): PromiseWorkspaceParsedVersion[] {
  return versions.map((version) => ({
    id: version.id,
    versionNumber: version.versionNumber,
    lifecycleState: version.lifecycleState,
    createdAt: version.createdAt,
    promiseBrief: parsePromiseBrief(version.contentJson),
  }));
}

export function buildPromiseWorkspaceVersionComparison(
  versions: readonly PromiseWorkspaceParsedVersion[],
): PromiseWorkspaceVersionComparison {
  return versions.length >= 2
    ? {
        latest: versions[0],
        previous: versions[1],
      }
    : null;
}

function isPromiseMessage(value: unknown): value is PromiseMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (record.role === "user" || record.role === "assistant") &&
    typeof record.content === "string"
  );
}

export function parsePromiseWorkspaceConversationMessages(value: unknown): PromiseMessage[] {
  const record = sourceDocumentMetadata(value);
  const messages = record.messages;

  return Array.isArray(messages) ? messages.filter(isPromiseMessage) : [];
}

export function getPromiseWorkspaceConversationMessages(
  artifactMap: ReadonlyMap<ArtifactType, PromiseWorkspaceArtifactSource>,
): PromiseMessage[] {
  return parsePromiseWorkspaceConversationMessages(
    artifactMap.get(ArtifactType.PROMISE_CHAT)?.versions[0]?.contentJson,
  );
}

export type PromiseWorkspaceBaseArtifacts = {
  bookSetupProfile: BookSetupProfile | null;
  promiseBrief: PromiseBrief;
  scorecard: PromiseScorecard;
  personaPack: PersonaPack;
  audienceResearch: AudienceResearchArtifact | undefined;
};

export type PromiseWorkspaceBaseArtifactParsers = {
  normalizeBookSetupProfile: (contentJson: unknown) => BookSetupProfile | null;
  parsePromiseBrief: (contentJson: unknown) => PromiseBrief;
  parseScorecard: (contentJson: unknown, promiseBrief: PromiseBrief) => PromiseScorecard;
  parsePersonaPack: (contentJson: unknown, promiseBrief: PromiseBrief) => PersonaPack;
  parseAudienceResearch: (contentJson: unknown) => AudienceResearchArtifact | undefined;
};

export function buildPromiseWorkspaceBaseArtifacts(
  artifactMap: ReadonlyMap<ArtifactType, PromiseWorkspaceArtifactSource>,
  bookSetupContentJson: unknown,
  parsers: PromiseWorkspaceBaseArtifactParsers,
): PromiseWorkspaceBaseArtifacts {
  const bookSetupProfile = parsers.normalizeBookSetupProfile(bookSetupContentJson);
  const promiseBrief = parsers.parsePromiseBrief(
    artifactMap.get(ArtifactType.PROMISE_BRIEF)?.versions[0]?.contentJson,
  );
  const scorecard = parsers.parseScorecard(
    artifactMap.get(ArtifactType.PROMISE_SCORECARD)?.versions[0]?.contentJson,
    promiseBrief,
  );
  const personaPack = parsers.parsePersonaPack(
    artifactMap.get(ArtifactType.PERSONA_PACK)?.versions[0]?.contentJson,
    promiseBrief,
  );
  const audienceResearch = parsers.parseAudienceResearch(
    artifactMap.get(ArtifactType.AUDIENCE_RESEARCH)?.versions[0]?.contentJson,
  );

  return {
    bookSetupProfile,
    promiseBrief,
    scorecard,
    personaPack,
    audienceResearch,
  };
}

export type PromiseWorkspaceDownstreamArtifacts = {
  personaContexts: TruthPersonaContext[];
  coreTruths: CoreTruthsArtifact | undefined;
  transformationArc: TransformationArtifact | undefined;
  marketReport: MarketReport;
  recommendations: PositioningRecommendations;
  titleSubtitleFinalization: TitleSubtitleFinalization | undefined;
  bookPromiseReport: BookPromiseReport | undefined;
};

export type PromiseWorkspaceDownstreamParsers = {
  buildPersonaContexts: (
    promiseBrief: PromiseBrief,
    deepProfiles: PersonaDeepProfile[] | undefined,
    simplePersonas: PersonaPack["personas"],
  ) => TruthPersonaContext[];
  parseCoreTruths: (
    contentJson: unknown,
    promiseBrief: PromiseBrief,
    personaContexts: TruthPersonaContext[],
  ) => CoreTruthsArtifact | undefined;
  parseTransformationArc: (
    contentJson: unknown,
    promiseBrief: PromiseBrief,
    personaContexts: TruthPersonaContext[],
  ) => TransformationArtifact | undefined;
  parseMarketReport: (
    contentJson: unknown,
    promiseBrief: PromiseBrief,
    personaContexts: TruthPersonaContext[],
    coreTruths: CoreTruthsArtifact | undefined,
    transformationArc: TransformationArtifact | undefined,
  ) => MarketReport;
  parseRecommendations: (
    contentJson: unknown,
    promiseBrief: PromiseBrief,
    marketReport: MarketReport,
    personaContexts: TruthPersonaContext[],
    coreTruths: CoreTruthsArtifact | undefined,
    transformationArc: TransformationArtifact | undefined,
  ) => PositioningRecommendations;
  parseTitleSubtitleFinalization: (
    stageMetadata: Record<string, unknown>,
    promiseBrief: PromiseBrief,
    marketReport: MarketReport,
    recommendations: PositioningRecommendations,
    personaContexts: TruthPersonaContext[],
    audienceResearch: AudienceResearchArtifact | undefined,
    coreTruths: CoreTruthsArtifact | undefined,
    transformationArc: TransformationArtifact | undefined,
    bookSetupProfile: BookSetupProfile | null,
  ) => TitleSubtitleFinalization | undefined;
  parseBookPromiseReport: (
    contentJson: unknown,
    promiseBrief: PromiseBrief,
    personaContexts: TruthPersonaContext[],
    marketReport: MarketReport,
    recommendations: PositioningRecommendations,
    audienceResearch: AudienceResearchArtifact | undefined,
    coreTruths: CoreTruthsArtifact | undefined,
    transformationArc: TransformationArtifact | undefined,
    bookSetupProfile: BookSetupProfile | null,
    titleSubtitleFinalization: TitleSubtitleFinalization | undefined,
  ) => BookPromiseReport | undefined;
};

export function buildPromiseWorkspaceDownstreamArtifacts(
  artifactMap: ReadonlyMap<ArtifactType, PromiseWorkspaceArtifactSource>,
  stageMetadata: Record<string, unknown>,
  baseArtifacts: PromiseWorkspaceBaseArtifacts,
  parsers: PromiseWorkspaceDownstreamParsers,
): PromiseWorkspaceDownstreamArtifacts {
  const { audienceResearch, bookSetupProfile, personaPack, promiseBrief } = baseArtifacts;
  const personaContexts = parsers.buildPersonaContexts(
    promiseBrief,
    audienceResearch?.phase2?.personas,
    personaPack.personas,
  );
  const coreTruths = parsers.parseCoreTruths(
    artifactMap.get(ArtifactType.CORE_TRUTHS)?.versions[0]?.contentJson,
    promiseBrief,
    personaContexts,
  );
  const transformationArc = parsers.parseTransformationArc(
    artifactMap.get(ArtifactType.TRANSFORMATION_ARC)?.versions[0]?.contentJson,
    promiseBrief,
    personaContexts,
  );
  const marketReport = parsers.parseMarketReport(
    artifactMap.get(ArtifactType.MARKET_REPORT)?.versions[0]?.contentJson,
    promiseBrief,
    personaContexts,
    coreTruths,
    transformationArc,
  );
  const recommendations = parsers.parseRecommendations(
    artifactMap.get(ArtifactType.POSITIONING_RECOMMENDATIONS)?.versions[0]?.contentJson,
    promiseBrief,
    marketReport,
    personaContexts,
    coreTruths,
    transformationArc,
  );
  const titleSubtitleFinalization = parsers.parseTitleSubtitleFinalization(
    stageMetadata,
    promiseBrief,
    marketReport,
    recommendations,
    personaContexts,
    audienceResearch,
    coreTruths,
    transformationArc,
    bookSetupProfile,
  );
  const bookPromiseReport = parsers.parseBookPromiseReport(
    artifactMap.get(ArtifactType.BOOK_PROMISE_REPORT)?.versions[0]?.contentJson,
    promiseBrief,
    personaContexts,
    marketReport,
    recommendations,
    audienceResearch,
    coreTruths,
    transformationArc,
    bookSetupProfile,
    titleSubtitleFinalization,
  );

  return {
    personaContexts,
    coreTruths,
    transformationArc,
    marketReport,
    recommendations,
    titleSubtitleFinalization,
    bookPromiseReport,
  };
}

export type PromiseWorkspaceResultInput<TBook, TStage, TDirectionEvent> = {
  book: TBook;
  stage: TStage;
  sourceDocuments: PromiseWorkspaceSourceDocument[];
  conversationMessages: PromiseMessage[];
  baseArtifacts: PromiseWorkspaceBaseArtifacts;
  downstreamArtifacts: PromiseWorkspaceDownstreamArtifacts;
  phaseApprovals: PromisePhaseApprovals;
  artifactAvailability: PromiseArtifactAvailability;
  directionEvents: readonly TDirectionEvent[];
  promiseVersions: PromiseWorkspaceParsedVersion[];
  compareVersions: PromiseWorkspaceVersionComparison;
  phase1StrategicBriefVersion?: PromiseWorkspaceStrategicBriefSummarySource | null;
};

export function buildPromiseWorkspaceResult<TBook, TStage, TDirectionEvent>({
  book,
  stage,
  sourceDocuments,
  conversationMessages,
  baseArtifacts,
  downstreamArtifacts,
  phaseApprovals,
  artifactAvailability,
  directionEvents,
  promiseVersions,
  compareVersions,
  phase1StrategicBriefVersion,
}: PromiseWorkspaceResultInput<TBook, TStage, TDirectionEvent>) {
  return {
    book,
    stage,
    bookSetupProfile: baseArtifacts.bookSetupProfile,
    sourceDocuments,
    conversationMessages,
    promiseBrief: baseArtifacts.promiseBrief,
    scorecard: baseArtifacts.scorecard,
    personas: baseArtifacts.personaPack,
    market: downstreamArtifacts.marketReport,
    recommendations: downstreamArtifacts.recommendations,
    audienceResearch: baseArtifacts.audienceResearch,
    coreTruths: downstreamArtifacts.coreTruths,
    transformationArc: downstreamArtifacts.transformationArc,
    titleSubtitleFinalization: downstreamArtifacts.titleSubtitleFinalization,
    bookPromiseReport: downstreamArtifacts.bookPromiseReport,
    phaseApprovals,
    artifactAvailability,
    directionEvents,
    promiseVersions,
    compareVersions,
    phase1StrategicBrief: phase1StrategicBriefVersion
      ? {
          id: phase1StrategicBriefVersion.id,
          versionNumber: phase1StrategicBriefVersion.versionNumber,
          createdAt: phase1StrategicBriefVersion.createdAt,
        }
      : null,
  };
}
