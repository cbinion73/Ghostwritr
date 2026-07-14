import { StageKey } from "@prisma/client";

import {
  commitPromiseStageBundle,
  getCommittedPromiseBrief,
  getPromiseArtifacts,
  getPromiseBriefVersions,
} from "../../repositories/promise-artifacts";
import { getBookBySlugOrThrow, getOrCreateBookBySlug, getStageForBook } from "../../repositories/books";
import { createDirectionEvent, listDirectionEventsForStage } from "../../repositories/direction-events";
import { getCommittedPhase1StrategicBrief } from "../../repositories/phase1-strategic-brief-artifacts";
import { getCommittedBookSetup } from "../../repositories/book-setup-artifacts";
import { listBookSourceDocuments } from "../../repositories/source-documents";
import { compileAndCommitPhase1StrategicBrief } from "../phase1-strategic-brief";
import type {
  AudienceResearchArtifact,
  PromiseBrief,
  PromiseScorecard,
  PersonaPack,
} from "../../promise-types";
import {
  buildPromiseArtifactAvailability,
  buildPromiseWorkspaceArtifactMap,
  buildPromiseWorkspaceBaseArtifacts,
  buildPromiseWorkspaceDownstreamArtifacts,
  buildPromiseWorkspaceResult,
  buildPromiseWorkspaceVersionComparison,
  getPromiseWorkspaceConversationMessages,
  mapPromiseWorkspaceSourceDocuments,
  mapPromiseWorkspaceVersions,
  normalizePromisePhaseApprovals,
  PROMISE_WORKSPACE_TAB_ORDER,
} from "./workspace-assembly";
import {
  fallbackPersonaPack,
  fallbackPromiseExtraction,
  fallbackScorecard,
  createFallbackTitleSubtitleFinalization,
  normalizeBookPromiseReportArtifact,
  normalizeTitleSubtitleFinalization,
} from "./workspace-loader-support";
import {
  normalizeBookSetupProfile,
  parseArtifactJson,
} from "./generation-runtime-state";
import { buildTruthPersonaContexts } from "./report-persona-context";
import { asRecord } from "./market-analysis-support";
import { normalizeMarketReport } from "./market-analysis-normalization";
import { createFallbackMarketReport } from "./market-analysis-fallback";
import {
  fallbackRecommendations,
  normalizeRecommendationsArtifact,
} from "./market-recommendations-support";
import {
  normalizeCoreTruthsArtifact,
} from "./generation-core-truths-support";
import {
  normalizeTransformationArtifact,
} from "./generation-transformation-support";

function parseWorkspaceArtifactJson<T>(value: unknown, fallback: T): T {
  return value && typeof value === "object" ? value as T : fallback;
}

export async function commitPromiseWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.PROMISE);
  const phaseApprovals = normalizePromisePhaseApprovals(stage?.metadataJson);
  const allPromiseSectionsApproved = PROMISE_WORKSPACE_TAB_ORDER.every(
    (tab) => phaseApprovals[tab]?.status === "approved",
  );

  if (!allPromiseSectionsApproved) {
    throw new Error("All Promise sections must be approved before committing the Promise stage.");
  }

  await commitPromiseStageBundle(book.id);
  const { version } = await compileAndCommitPhase1StrategicBrief(bookSlug);
  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_COMMITTED",
    title: "Committed promise stage",
    content: "The current promise bundle was approved for downstream stages.",
    metadataJson: {
      phase1StrategicBriefVersionId: version.id,
    },
  });
}

export async function getOutlineWorkspace(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const promiseStage = await getStageForBook(book.id, StageKey.PROMISE);
  const outlineStage = await getStageForBook(book.id, StageKey.OUTLINE);
  const phase1StrategicBriefVersion = await getCommittedPhase1StrategicBrief(book.id);
  const committedPromiseVersion = await getCommittedPromiseBrief(book.id);

  const committedPromise = parseWorkspaceArtifactJson<PromiseBrief | null>(
    committedPromiseVersion?.contentJson,
    null,
  );

  return {
    book,
    promiseStage,
    outlineStage,
    phase1StrategicBrief: phase1StrategicBriefVersion
      ? {
          id: phase1StrategicBriefVersion.id,
          versionNumber: phase1StrategicBriefVersion.versionNumber,
          createdAt: phase1StrategicBriefVersion.createdAt,
        }
      : null,
    committedPromise,
    outlineReadiness: phase1StrategicBriefVersion && committedPromise
      ? {
          status: "ready",
          nextMoves: [
            "Generate chapter-level big ideas from the approved Phase 1 strategic brief",
            "Define the chapter progression and transformation arc",
            "Map each chapter to a ME -> WE -> CORE TRUTH -> YOU -> WE flow",
          ],
        }
      : {
          status: "blocked",
          nextMoves: [
            "Commit the unified Phase 1 strategic brief from the Promise room first",
            "Confirm the primary reader and core truth",
            "Lock the commercial positioning before outlining",
          ],
        },
  };
}

export async function getPromiseWorkspace(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const bookSetupVersion = await getCommittedBookSetup(book.id);
  const sourceDocuments = await listBookSourceDocuments({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
  });
  const stage = await getStageForBook(book.id, StageKey.PROMISE);
  const artifacts = await getPromiseArtifacts(book.id);
  const promiseBriefVersions = await getPromiseBriefVersions(book.id);
  const phase1StrategicBriefVersion = await getCommittedPhase1StrategicBrief(book.id);
  const directionEvents = await listDirectionEventsForStage({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
  });

  const artifactMap = buildPromiseWorkspaceArtifactMap(artifacts);
  const artifactAvailability = buildPromiseArtifactAvailability(artifacts);

  const conversationMessages = getPromiseWorkspaceConversationMessages(artifactMap);
  const baseArtifacts = buildPromiseWorkspaceBaseArtifacts(
    artifactMap,
    bookSetupVersion?.contentJson,
    {
      normalizeBookSetupProfile,
      parsePromiseBrief: (contentJson) =>
        parseArtifactJson<PromiseBrief>(
          contentJson,
          fallbackPromiseExtraction(
            book.slug,
            conversationMessages,
            "",
            normalizeBookSetupProfile(bookSetupVersion?.contentJson),
          ),
        ),
      parseScorecard: (contentJson, parsedPromiseBrief) =>
        parseArtifactJson<PromiseScorecard>(
          contentJson,
          fallbackScorecard(parsedPromiseBrief),
        ),
      parsePersonaPack: (contentJson, parsedPromiseBrief) =>
        parseArtifactJson<PersonaPack>(
          contentJson,
          fallbackPersonaPack(parsedPromiseBrief),
        ),
      parseAudienceResearch: (contentJson) =>
        parseArtifactJson<AudienceResearchArtifact | undefined>(
          contentJson,
          undefined,
        ),
    },
  );
  const {
    bookSetupProfile,
    promiseBrief,
  } = baseArtifacts;
  const stageMetadata = asRecord(stage?.metadataJson);
  const downstreamArtifacts = buildPromiseWorkspaceDownstreamArtifacts(
    artifactMap,
    stageMetadata,
    baseArtifacts,
    {
      buildPersonaContexts: buildTruthPersonaContexts,
      parseCoreTruths: (contentJson, parsedPromiseBrief, parsedPersonaContexts) =>
        contentJson && typeof contentJson === "object"
          ? normalizeCoreTruthsArtifact(
              contentJson,
              parsedPromiseBrief,
              parsedPersonaContexts,
            )
          : undefined,
      parseTransformationArc: (contentJson, parsedPromiseBrief, parsedPersonaContexts) =>
        contentJson && typeof contentJson === "object"
          ? normalizeTransformationArtifact(
              contentJson,
              parsedPromiseBrief,
              parsedPersonaContexts,
            )
          : undefined,
      parseMarketReport: (
        contentJson,
        parsedPromiseBrief,
        parsedPersonaContexts,
        parsedCoreTruths,
        parsedTransformationArc,
      ) =>
        contentJson && typeof contentJson === "object"
          ? normalizeMarketReport(
              contentJson,
              parsedPromiseBrief,
              parsedPersonaContexts,
              parsedCoreTruths,
              parsedTransformationArc,
            )
          : createFallbackMarketReport(
              parsedPromiseBrief,
              parsedPersonaContexts,
              parsedCoreTruths,
              parsedTransformationArc,
            ),
      parseRecommendations: (
        contentJson,
        parsedPromiseBrief,
        parsedMarketReport,
        parsedPersonaContexts,
        parsedCoreTruths,
        parsedTransformationArc,
      ) =>
        contentJson && typeof contentJson === "object"
          ? normalizeRecommendationsArtifact(
              contentJson,
              parsedPromiseBrief,
              parsedMarketReport,
              parsedPersonaContexts,
              parsedCoreTruths,
              parsedTransformationArc,
            )
          : fallbackRecommendations(
              parsedPromiseBrief,
              parsedMarketReport,
              parsedPersonaContexts,
              parsedCoreTruths,
              parsedTransformationArc,
            ),
      parseTitleSubtitleFinalization: (
        parsedStageMetadata,
        parsedPromiseBrief,
        parsedMarketReport,
        parsedRecommendations,
        parsedPersonaContexts,
        parsedAudienceResearch,
        parsedCoreTruths,
        parsedTransformationArc,
        parsedBookSetupProfile,
      ) => {
        const titleSubtitleFinalizationRaw = parsedStageMetadata.titleSubtitleFinalization;
        return titleSubtitleFinalizationRaw && typeof titleSubtitleFinalizationRaw === "object"
          ? normalizeTitleSubtitleFinalization(
              titleSubtitleFinalizationRaw,
              createFallbackTitleSubtitleFinalization(
                parsedPromiseBrief,
                parsedMarketReport,
                parsedRecommendations,
                parsedPersonaContexts,
                parsedAudienceResearch,
                parsedCoreTruths,
                parsedTransformationArc,
                parsedBookSetupProfile,
              ),
            )
          : undefined;
      },
      parseBookPromiseReport: (
        contentJson,
        parsedPromiseBrief,
        parsedPersonaContexts,
        parsedMarketReport,
        parsedRecommendations,
        parsedAudienceResearch,
        parsedCoreTruths,
        parsedTransformationArc,
        parsedBookSetupProfile,
        parsedTitleSubtitleFinalization,
      ) =>
        contentJson && typeof contentJson === "object"
          ? normalizeBookPromiseReportArtifact(
              contentJson,
              parsedPromiseBrief,
              parsedPersonaContexts,
              parsedMarketReport,
              parsedRecommendations,
              parsedAudienceResearch,
              parsedCoreTruths,
              parsedTransformationArc,
              parsedBookSetupProfile,
              parsedTitleSubtitleFinalization,
            )
          : undefined,
    },
  );
  const phaseApprovals = normalizePromisePhaseApprovals(stage?.metadataJson);
  const parsePromiseWorkspaceVersion = (contentJson: unknown) =>
    parseArtifactJson<PromiseBrief>(
      contentJson,
      fallbackPromiseExtraction(
        book.slug,
        conversationMessages,
        "",
        bookSetupProfile,
      ),
    );
  const parsedPromiseVersions = mapPromiseWorkspaceVersions(
    promiseBriefVersions,
    parsePromiseWorkspaceVersion,
  );
  const compareVersions = buildPromiseWorkspaceVersionComparison(parsedPromiseVersions);

  return buildPromiseWorkspaceResult({
    book,
    stage,
    sourceDocuments: mapPromiseWorkspaceSourceDocuments(sourceDocuments),
    conversationMessages,
    baseArtifacts,
    downstreamArtifacts,
    phaseApprovals,
    artifactAvailability,
    directionEvents,
    promiseVersions: parsedPromiseVersions,
    compareVersions,
    phase1StrategicBriefVersion,
  });
}
