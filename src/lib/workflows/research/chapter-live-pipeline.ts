import { resolveModelSpec } from "../../llm/routing";
import type {
  ChapterResearchDossier,
  ChapterResearchItem,
  ChapterResearchSource,
  ChapterResearchVerification,
} from "../../research-types";
import { summarizeSearchAttempts } from "../../web-access";
import { buildDossier } from "./dossier";
import {
  adjudicateAmbiguousItems,
  extractItemsFromSource,
  verifyItemsForSource,
} from "./extraction-verification";
import { getResearchChapterExecutionSetup } from "./execution-setup";
import { buildProvisionalResearchPack } from "./fallback";
import { persistChapterResearchDossier } from "./persistence";
import {
  discoverCandidateSources,
  fetchCandidateSource,
  type FetchedSource,
  maybeGenerateResearchQuestions,
  verifySourceIntegrity,
} from "./source-discovery";
import {
  pulseResearchStage,
} from "./run-progress";
import {
  summarizeDomains,
  summarizeQueries,
} from "./source-utils";

class ResearchChapterTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchChapterTimeoutError";
  }
}

function getResearchChapterTimeoutMs() {
  const rawValue = Number(process.env.RESEARCH_CHAPTER_TIMEOUT_MS ?? 120000);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return 120000;
  }

  return rawValue;
}

async function withResearchTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ResearchChapterTimeoutError(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function runChapterResearchWorkflowImpl(bookSlug: string, chapterKey: string) {
  const { book, chapter, chapterContext, lens, bookSubject, qualityFeedback } =
    await getResearchChapterExecutionSetup(bookSlug, chapterKey);

  const retryMessage = qualityFeedback && typeof qualityFeedback === "object"
    ? ` (Quality Retry: ${(qualityFeedback as Record<string, unknown>).guidance})`
    : "";
  await pulseResearchStage({
    bookId: book.id,
    currentChapterKey: chapterContext.chapterKey,
    currentAction: "Framing research questions",
    message: `Framing research questions for ${chapterContext.chapterTitle}${retryMessage}`,
  });
  const questions = await maybeGenerateResearchQuestions({
    chapter: chapterContext,
    lens,
  });
  let dossier: ChapterResearchDossier;
  let persistedSources: ChapterResearchSource[];
  let persistedItems: ChapterResearchItem[];
  let verifications: ChapterResearchVerification[];
  const chapterTimeoutMs = getResearchChapterTimeoutMs();

  try {
    const liveResult = await withResearchTimeout(
      (async () => {
        await pulseResearchStage({
          bookId: book.id,
          currentChapterKey: chapterContext.chapterKey,
          currentAction: "Searching the web for source leads",
          message: `Searching the web for ${chapterContext.chapterTitle}`,
        });
        const { candidates: candidateSources, attempts: searchAttempts } =
          await discoverCandidateSources(chapterContext, questions, lens, bookSubject);
        if (candidateSources.length === 0) {
          throw new Error(
            `No web search results were discovered for ${chapterContext.chapterTitle}. ${summarizeSearchAttempts(searchAttempts)}`,
          );
        }
        await pulseResearchStage({
          bookId: book.id,
          currentChapterKey: chapter.chapterKey,
          currentAction: "Reviewing search results",
          message: `Found ${candidateSources.length} leads via ${Array.from(new Set(searchAttempts.map((attempt) => attempt.provider))).join(", ")}. Queries: ${summarizeQueries(Array.from(new Set(searchAttempts.map((attempt) => attempt.query))))}`,
        });

        await pulseResearchStage({
          bookId: book.id,
          currentChapterKey: chapter.chapterKey,
          currentAction: "Fetching source pages",
          message: `Fetching ${candidateSources.length} source leads for ${chapter.chapterTitle}`,
        });
        const fetchedSources = (
          await Promise.all(
            candidateSources.map((candidate) =>
              fetchCandidateSource(book.slug, chapter, candidate),
            ),
          )
        ).filter((source): source is FetchedSource => Boolean(source));
        if (fetchedSources.length === 0) {
          throw new Error(
            `No source pages could be fetched for ${chapter.chapterTitle}. Search attempts: ${summarizeSearchAttempts(searchAttempts)}`,
          );
        }
        await pulseResearchStage({
          bookId: book.id,
          currentChapterKey: chapter.chapterKey,
          currentAction: "Fetched source pages",
          message: `Fetched ${fetchedSources.length} pages from ${summarizeDomains(fetchedSources.map((source) => source.canonicalUrl ?? source.url))}`,
        });

        await pulseResearchStage({
          bookId: book.id,
          currentChapterKey: chapter.chapterKey,
          currentAction: "Checking source integrity",
          message: `Checking ${fetchedSources.length} fetched sources for ${chapter.chapterTitle}`,
        });
        const sourceVerifications = await Promise.all(
          fetchedSources.map((source) => verifySourceIntegrity(source)),
        );

        const verifiedSources = fetchedSources.map((source) => {
          const verification = sourceVerifications.find((item) => item.sourceRecordId === source.id);
          const isVerified = verification?.status === "VERIFIED";

          return {
            ...source,
            isVerified,
            verificationStatus: verification?.status ?? "REJECTED",
            verificationNotes: verification?.notes ?? null,
          };
        });
        if (verifiedSources.filter((source) => source.isVerified).length === 0) {
          throw new Error(
            `Fetched sources for ${chapter.chapterTitle} failed integrity verification. Review search quality or web access before drafting.`,
          );
        }
        await pulseResearchStage({
          bookId: book.id,
          currentChapterKey: chapter.chapterKey,
          currentAction: "Running extraction model",
          message: `Calling ${resolveModelSpec("research:extract")} to extract candidate claims`,
        });

        await pulseResearchStage({
          bookId: book.id,
          currentChapterKey: chapter.chapterKey,
          currentAction: "Extracting and verifying research items",
          message: `Extracting and verifying claims for ${chapter.chapterTitle}`,
        });
        const extractionResults = await Promise.all(
          verifiedSources.map(async (source) => {
            const items = await extractItemsFromSource(chapter, source, lens, qualityFeedback);
            const verification = await verifyItemsForSource(chapter, source, items, lens, qualityFeedback);
            const adjudicated = await adjudicateAmbiguousItems(
              chapter,
              source,
              verification.items,
              verification.verifications,
              lens,
            );
            return {
              source,
              items: adjudicated.items,
              verifications: adjudicated.verifications,
            };
          }),
        );

        const verifiedItems = extractionResults.flatMap((result) =>
          result.items.filter((item) => item.verificationStatus === "VERIFIED"),
        );

        const nextVerifications = [
          ...sourceVerifications,
          ...extractionResults.flatMap((result) => result.verifications),
        ];
        const nextItems = [
          ...verifiedItems,
          ...extractionResults.flatMap((result) =>
            result.items.filter((item) => item.verificationStatus !== "VERIFIED"),
          ),
        ];
        const nextDossier = buildDossier(chapter, questions, verifiedSources, nextItems);
        await pulseResearchStage({
          bookId: book.id,
          currentChapterKey: chapter.chapterKey,
          currentAction: "Admitting verified research",
          message: `Admitted ${nextDossier.verificationSummary.verifiedSources} sources and ${nextDossier.verificationSummary.verifiedItems} verified items`,
        });
        if (nextDossier.sourceRegister.length === 0) {
          throw new Error(
            `No research sources were admitted for ${chapter.chapterTitle}. The chapter dossier is not strong enough to use downstream.`,
          );
        }

        return {
          dossier: nextDossier,
          persistedSources: verifiedSources,
          persistedItems: nextItems,
          verifications: nextVerifications,
        };
      })(),
      chapterTimeoutMs,
      `Chapter research timed out after ${Math.round(chapterTimeoutMs / 1000)} seconds for ${chapter.chapterTitle}.`,
    );

    dossier = liveResult.dossier;
    persistedSources = liveResult.persistedSources;
    persistedItems = liveResult.persistedItems;
    verifications = liveResult.verifications;
  } catch (error) {
    const fallback = buildProvisionalResearchPack(
      chapter,
      questions,
      error instanceof Error ? error.message : "Live web research failed.",
    );
    dossier = fallback.dossier;
    persistedSources = fallback.sources;
    persistedItems = fallback.items;
    verifications = fallback.verifications;
  }

  await pulseResearchStage({
    bookId: book.id,
    currentChapterKey: chapter.chapterKey,
    currentAction: "Saving chapter dossier",
    message: `Saving dossier for ${chapter.chapterTitle}`,
  });
  const version = await persistChapterResearchDossier({
    bookId: book.id,
    chapter,
    dossier,
    sources: persistedSources,
    items: persistedItems,
    verifications,
  });

  return {
    book,
    chapter,
    dossier,
    artifactVersionId: version.id,
  };
}
