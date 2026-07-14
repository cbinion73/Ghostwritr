import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import { getModelForRole } from "../../llm/routing";
import { buildLensQueries, type ResearchLens } from "../../research-lenses";
import type {
  ChapterResearchQuestion,
  ChapterResearchSource,
  ChapterResearchVerification,
} from "../../research-types";
import {
  fetchWebPage,
  searchWeb,
} from "../../web-access";
import type { ChapterContext } from "./execution-setup";
import {
  classifySourceTier,
  slugify,
} from "./source-utils";

export type CandidateSource = {
  id: string;
  url: string;
  title?: string;
  query?: string;
  provider?: string;
  snippet?: string | null;
};

export type FetchedSource = ChapterResearchSource & {
  text: string;
  html: string;
};

type ResearchQuestionModel = {
  withStructuredOutput: (schema: typeof QuestionSchema) => {
    invoke: (messages: Array<SystemMessage | HumanMessage>) => Promise<unknown>;
  };
};

async function getDefaultQuestionModel() {
  return getModelForRole("research:questions", {
    temperature: 0.4,
    maxOutputTokens: 8000,
    timeoutMs: 60000,
    reasoningEffort: "low",
  }) as Promise<ResearchQuestionModel | null>;
}

const QuestionSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      priority: z.enum(["primary", "secondary"]),
    }),
  ),
});

const QUESTION_SYSTEM_PROMPT = `You are building the research brief for one chapter of a nonfiction book.

Return 8–14 focused research questions that would drive a deep, rigorous dossier. Cover these angles explicitly:

1. CORE CLAIMS — What specific claims does this chapter need evidence for? Name each claim and the category of evidence that would close it (peer-reviewed, government data, longitudinal study, first-hand account).
2. HARD NUMBERS — Which statistics, base rates, ratios, or trends would make the chapter concrete? Ask for the *denominator*, *time period*, and *source authority*, not just "a statistic about X."
3. MECHANISMS — Not just "does X work" but "why and how does X work, and where does it break." Ask for the causal pathway.
4. CASE STUDIES — Specific named organizations, people, or events where this chapter's thesis was tested under pressure. Prefer named over generic.
5. COUNTEREVIDENCE — What would a thoughtful skeptic ask? What's the strongest example against the chapter's claim? A chapter without counterpoints reads as propaganda.
6. DEFINITIONS & FRAMING — Terms the chapter uses that need precise working definitions, not dictionary definitions.
7. HISTORICAL ORIGIN — Where did this idea or pattern come from? First named instance? Paradigm shift moment?
8. CONTEMPORARY PULSE — Most recent 2–3 year developments that would make the chapter feel current.

Each question should be sharp enough that a research assistant would know exactly what to search for.`;

export async function maybeGenerateResearchQuestions(input: {
  chapter: ChapterContext;
  lens: ResearchLens;
  getQuestionModel?: () => Promise<ResearchQuestionModel | null>;
}): Promise<ChapterResearchQuestion[]> {
  const { chapter, lens } = input;
  const model = await (input.getQuestionModel ?? getDefaultQuestionModel)();

  const fallback: ChapterResearchQuestion[] = [
    {
      id: `${chapter.chapterKey}-q1`,
      question: `What high-quality evidence best supports the central claim of ${chapter.chapterTitle}?`,
      priority: "primary",
    },
    {
      id: `${chapter.chapterKey}-q2`,
      question: `What credible figures, studies, or official data points would make ${chapter.chapterTitle} more concrete?`,
      priority: "primary",
    },
    {
      id: `${chapter.chapterKey}-q3`,
      question: `What examples, case studies, or counterexamples would make ${chapter.chapterTitle} more persuasive and nuanced?`,
      priority: "secondary",
    },
  ];

  if (!model) {
    return fallback;
  }

  try {
    const structuredModel = model.withStructuredOutput(QuestionSchema);
    const questionPrompt = lens.directives
      ? `${QUESTION_SYSTEM_PROMPT}\n\n${lens.directives}`
      : QUESTION_SYSTEM_PROMPT;
    const result = QuestionSchema.parse(await structuredModel.invoke([
      new SystemMessage(questionPrompt),
      new HumanMessage(
        JSON.stringify({
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          baseStoryChapterPurpose: chapter.baseStoryChapterPurpose ?? null,
          baseStoryChapterThread: chapter.baseStoryChapterThread ?? null,
          baseStoryBookThread: chapter.baseStoryBookThread ?? null,
          paragraphs: chapter.paragraphs,
        }),
      ),
    ]));

    return result.questions.length > 0 ? result.questions : fallback;
  } catch {
    return fallback;
  }
}

export async function discoverCandidateSources(
  chapter: ChapterContext,
  questions: ChapterResearchQuestion[],
  lens: ResearchLens,
  bookSubject: string,
) {
  // Broader, deeper query bank. The lens reframes this per genre — e.g.
  // Biblical/Theological asks for commentary/exegesis and word studies instead
  // of generic business/academic search patterns.
  const descSlice = chapter.chapterDescription.slice(0, 140);
  const topics = [
    chapter.chapterTitle,
    ...(chapter.baseStoryChapterThread
      ? [chapter.baseStoryChapterThread.replace(/\s+/g, " ").slice(0, 120)]
      : []),
  ];
  const queries = [
    `${chapter.chapterTitle} ${descSlice}`,
    ...buildLensQueries(lens, topics, null, bookSubject),
    ...questions.slice(0, 6).map((question) => question.question),
  ];

  const search = await searchWeb(queries, {
    perQueryLimit: 10,
    totalLimit: 40,
  });

  return {
    candidates: search.results.map((result, index) => ({
      id: `candidate-${index + 1}`,
      url: result.url,
      title: result.title,
      query: result.query,
      provider: result.provider,
      snippet: result.snippet ?? null,
    })),
    attempts: search.attempts,
  };
}

async function saveSnapshot(
  bookSlug: string,
  chapterKey: string,
  title: string,
  html: string,
  text: string,
) {
  const baseDir = path.join(
    process.cwd(),
    "reference-library",
    "processed",
    "research-snapshots",
    bookSlug,
    chapterKey,
  );
  await mkdir(baseDir, { recursive: true });

  const baseName = slugify(title) || "source";
  const htmlPath = path.join(baseDir, `${baseName}.html`);
  const textPath = path.join(baseDir, `${baseName}.txt`);

  await writeFile(htmlPath, html, "utf8");
  await writeFile(textPath, text, "utf8");

  return {
    snapshotPath: htmlPath,
    extractedTextPath: textPath,
  };
}

export async function fetchCandidateSource(
  bookSlug: string,
  chapter: ChapterContext,
  candidate: CandidateSource,
): Promise<FetchedSource | null> {
  try {
    const page = await fetchWebPage(candidate.url, {
      purpose: "Research Bot",
      minTextLength: 400,
    });
    const { tier, weight } = classifySourceTier(page.finalUrl);
    const { snapshotPath, extractedTextPath } = await saveSnapshot(
      bookSlug,
      chapter.chapterKey,
      page.title,
      page.html,
      page.text,
    );

    return {
      id: candidate.id,
      url: candidate.url,
      canonicalUrl: page.finalUrl,
      title: page.title,
      publisher: page.publisher,
      author: null,
      publishedAt: null,
      accessedAt: new Date().toISOString(),
      contentType: page.contentType,
      sourceTier: tier,
      tierWeight: weight,
      isVerified: false,
      verificationStatus: "PENDING",
      verificationNotes: null,
      snapshotPath,
      extractedTextPath,
      metadata: {
        searchTitle: candidate.title ?? null,
        searchQuery: candidate.query ?? null,
        searchProvider: candidate.provider ?? null,
        searchSnippet: candidate.snippet ?? null,
        contentLength: page.text.length,
      },
      text: page.text,
      html: page.html,
    };
  } catch {
    return null;
  }
}

export async function verifySourceIntegrity(
  source: FetchedSource,
): Promise<ChapterResearchVerification> {
  const searchTitle = String(source.metadata?.searchTitle ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
  const normalizedTitle = source.title.toLowerCase().replace(/[^a-z0-9\s]+/g, " ");
  const overlappingWords = searchTitle.filter((word) => normalizedTitle.includes(word));
  const titleMatch = searchTitle.length === 0 || overlappingWords.length >= Math.min(2, searchTitle.length);
  const contentMatch = source.text.length >= 400;

  return {
    id: `${source.id}-fetch-check`,
    sourceRecordId: source.id,
    verifierType: "FETCH_VALIDATOR",
    status: titleMatch && contentMatch ? "VERIFIED" : "REJECTED",
    titleMatch,
    contentMatch,
    claimSupported: null,
    tierConfirmed: true,
    secondSourceRequired: false,
    secondSourceConfirmed: false,
    notes:
      titleMatch && contentMatch
        ? "Fetched page, title, and content passed basic integrity checks."
        : "Source failed integrity checks due to title mismatch or insufficient content.",
    metadata: {},
  };
}
