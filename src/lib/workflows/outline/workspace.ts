import { ArtifactType, StageKey } from "@prisma/client";

import type { BookPromiseReport, PromiseBrief } from "../../promise-types";
import { getCommittedBookSetup } from "../../repositories/book-setup-artifacts";
import { getBookBySlugOrThrow, getStageForBook } from "../../repositories/books";
import { getCommittedOutline, getOutlineVersions } from "../../repositories/outline-artifacts";
import { getCommittedPhase1StrategicBrief } from "../../repositories/phase1-strategic-brief-artifacts";
import { getCommittedPromiseBrief, getPromiseArtifacts } from "../../repositories/promise-artifacts";
import {
  buildFallbackOutline,
  buildPromiseFromBookPitch,
  normalizeBookSetupProfile,
  normalizeOutline,
  parseJson,
} from "../outline";

export async function getOutlineWorkspace(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const promiseStage = await getStageForBook(book.id, StageKey.PROMISE);
  const outlineStage = await getStageForBook(book.id, StageKey.OUTLINE);
  const phase1StrategicBriefVersion = await getCommittedPhase1StrategicBrief(book.id);
  const committedPromiseVersion = await getCommittedPromiseBrief(book.id);
  const committedBookSetup = await getCommittedBookSetup(book.id);
  const promiseArtifacts = await getPromiseArtifacts(book.id);
  const committedOutlineVersion = await getCommittedOutline(book.id);
  const outlineVersions = await getOutlineVersions(book.id);

  const committedPromise = parseJson<PromiseBrief | null>(committedPromiseVersion?.contentJson, null);
  const bookSetupProfile = normalizeBookSetupProfile(committedBookSetup?.contentJson);
  const bookPromiseReportArtifact = promiseArtifacts.find(
    (artifact) => artifact.artifactType === ArtifactType.BOOK_PROMISE_REPORT,
  );
  const bookPromiseReport = parseJson<BookPromiseReport | null>(
    bookPromiseReportArtifact?.versions[0]?.contentJson,
    null,
  );
  const sourcePromise =
    committedPromise ??
    (bookPromiseReport
      ? buildPromiseFromBookPitch(book.titleWorking ?? "Untitled Book", bookPromiseReport)
      : null);
  const fallback = buildFallbackOutline(
    sourcePromise ?? {
      workingTitle: book.titleWorking ?? "Untitled Book",
      audiencePrimary: "",
      audienceSecondary: [],
      category: "",
      readerProblem: "",
      readerDesire: "",
      bigIdea: "",
      coreTruth: "",
      transformationBefore: "",
      transformationAfter: "",
      differentiation: "",
      promiseStatement: "",
      stakes: "",
      tone: [],
      openQuestions: [],
    },
    bookPromiseReport,
    bookSetupProfile,
  );
  const normalize = (contentJson: unknown) =>
    normalizeOutline(
      contentJson,
      fallback,
      bookSetupProfile?.targetWordCount ?? fallback.targetWordCount,
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
    committedPromise: sourcePromise,
    bookPromiseReport,
    bookSetupProfile,
    latestOutline: outlineVersions[0] ? normalize(outlineVersions[0].contentJson) : null,
    committedOutline: committedOutlineVersion ? normalize(committedOutlineVersion.contentJson) : null,
    outlineVersions: outlineVersions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      lifecycleState: version.lifecycleState,
      createdAt: version.createdAt,
      outline: normalize(version.contentJson),
    })),
    outlineReadiness:
      phase1StrategicBriefVersion && sourcePromise && bookPromiseReport
        ? {
            status: "ready" as const,
            nextMoves: [
              "Generate the full section > chapter > paragraph architecture from the approved Phase 1 strategic brief",
              "Stress-test the word-count cascade so the book target, section totals, chapter totals, and paragraph totals all match",
              "Revise any weak sections or chapters through comments until the flow feels inevitable",
              "Commit the outline once the structure, pacing, and transformation arc all hold together",
            ],
          }
        : {
            status: "blocked" as const,
            nextMoves: [
              "Commit the unified Phase 1 strategic brief from the Promise room first",
              "Finalize the target audience, core truth, and transformation arc before outlining",
              "Confirm the book's target word count in Setup so the outline math has a real anchor",
            ],
          },
  };
}
