import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
  BaseStoryBundleSchema,
  BookOutlineSchema,
  ChapterResearchDossierSchema,
  ParagraphOutlineSchema,
  parseArtifactWithSchema,
  parseMetadataRecord,
} from "../artifact-schemas";
import { getModelForRole, resolveModelSpec, type StageRole } from "../llm/routing";
import {
  ArtifactStatus,
  Prisma,
  ResearchSource,
  ResearchVerificationStatus,
  StageKey,
  StageStatus,
  WorkflowRunStatus,
} from "@prisma/client";
import { z } from "zod";

import type { BookOutline } from "../outline-types";
import type { ParagraphOutline } from "../paragraph-outline-types";
import type { BaseStoryBundle } from "../base-story-types";
import type {
  ChapterResearchDossier,
  ChapterResearchItem,
  ChapterResearchQuestion,
  ChapterResearchSource,
  ChapterResearchVerification,
  ResearchItemType,
  ResearchSourceTier,
} from "../research-types";
import {
  getBookBySlugOrThrow,
  getOrCreateBookBySlug,
  getStageForBook,
  updateStageForBook,
} from "../repositories/books";
import {
  archiveResearchBinderTab,
  combineResearchBinderTabs,
  createResearchBinderTab,
  createResearchIdeaClip,
  deleteResearchIdeaClip,
  getBinderTabChapterKeys,
  listResearchBinderTabs,
  renameResearchBinderTab,
  separateResearchBinderTab,
  syncResearchBinderTabsFromOutline,
} from "../repositories/research-binder";
import {
  commitResearchPack,
  createResearchPackVersion,
  getCommittedResearchPack,
  getLatestResearchPackVersionsByChapter,
  getResearchPackVersions,
  getResearchSourcesForVersions,
  getResearchVerificationsForChapter,
} from "../repositories/research-artifacts";
import {
  claimWorkflowRun,
  completeWorkflowRun,
  createWorkflowRun,
  failWorkflowRun,
  getActiveWorkflowRunForStage,
  getWorkflowRunById,
} from "../repositories/workflow-runs";
import {
  getCommittedOutline,
  getCommittedOutlineExpansion,
} from "../repositories/outline-artifacts";
import { getCommittedBaseStory } from "../repositories/base-story-artifacts";
import {
  fetchWebPage,
  searchWeb,
  summarizeSearchAttempts,
} from "../web-access";
import { clearStageStaleDependency, invalidateDependentStagesForBook } from "../workflow-dependencies";
import { runQualityAgentWorkflow } from "./quality-agent";

type ChapterContext = {
  chapterKey: string;
  chapterTitle: string;
  chapterDescription: string;
  sectionId?: string;
  sectionTitle?: string;
  baseStoryChapterPurpose?: string;
  baseStoryChapterThread?: string;
  baseStoryBookThread?: string;
  paragraphs: Array<{
    paragraphId: string;
    topicSentence: string;
    purpose: string;
  }>;
};

type WorkspaceChapterSeed = {
  chapterKey: string;
  chapterLabel: string;
  chapterTitle: string;
  sectionTitle?: string;
};

type DossierStatus = "EMPTY" | "DRAFT" | "NEEDS_REVIEW" | "COMMITTED";
type ResearchModelPurpose =
  | "questions"
  | "extraction"
  | "verification"
  | "adjudication";
type ResearchReasoningEffort = "minimal" | "low" | "medium" | "high";

type CandidateSource = {
  id: string;
  url: string;
  title?: string;
  query?: string;
  provider?: string;
  snippet?: string | null;
};

type FetchedSource = ChapterResearchSource & {
  text: string;
  html: string;
};

const RESEARCH_WORKSPACE_LOG_PATH = "/tmp/research-workspace.log";

class ResearchChapterTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchChapterTimeoutError";
  }
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

const ExtractedItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      itemType: z.enum([
        "FACT",
        "STATISTIC",
        "QUOTE",
        "EXAMPLE",
        "CASE_STUDY",
        "COUNTERPOINT",
        "DEFINITION",
      ]),
      claimText: z.string(),
      evidenceExcerpt: z.string().nullable().optional(),
      summary: z.string().nullable().optional(),
      mappedParagraphId: z.string().nullable().optional(),
      confidenceScore: z.number().min(0).max(1).nullable().optional(),
      relevanceScore: z.number().min(0).max(1).nullable().optional(),
    }),
  ),
});

const VerificationSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      status: z.enum(["VERIFIED", "REJECTED", "NEEDS_CORROBORATION"]),
      claimSupported: z.boolean(),
      tierConfirmed: z.boolean(),
      secondSourceRequired: z.boolean(),
      secondSourceConfirmed: z.boolean(),
      notes: z.string(),
    }),
  ),
});

const AdjudicationSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      status: z.enum(["VERIFIED", "REJECTED", "NEEDS_CORROBORATION"]),
      notes: z.string(),
      secondSourceRequired: z.boolean(),
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

const EXTRACTION_SYSTEM_PROMPT = `You are the senior research extractor for a nonfiction book chapter. You are not a summarizer; you are building a dossier that the author will cite by field.

Read the full source text and extract EVERY item that could strengthen the chapter, under these rules:

1. DEPTH OVER BREVITY.
   - Every claim gets the full context that makes it credible: the study's N, the time period, the sample, who funded it.
   - For statistics: capture the number, the denominator, the year, and the measurement definition.
   - For examples: capture the named entity, the setting, what actually happened, and the observable outcome.
   - For quotes: capture the speaker's role, the context, and the verbatim line.

2. FAITHFUL BUT RIGOROUS.
   - Never invent. If a detail isn't in the source, leave it null.
   - Preserve nuance: if the source says "up to 30%" do not write "30%".
   - If the source contradicts a common framing, capture the contradiction as a COUNTERPOINT.

3. FILL THE EVIDENCE EXCERPT.
   - Every item must include an evidenceExcerpt that quotes or tightly paraphrases the source line this claim rests on. This is non-optional. Without the excerpt the claim cannot be verified downstream.

4. MAP TO PARAGRAPHS.
   - Look at the chapter paragraph outline in the input. Map each item to the most relevant paragraph id. This is how the claim gets placed in the draft.

5. SCORE HONESTLY.
   - relevanceScore: how directly this serves the chapter's thesis (0.0–1.0). Be honest. A 0.5 item is still useful but shouldn't pass as 0.9.
   - confidenceScore: how confident you are this is accurately extracted from the source (0.0–1.0). Penalize weak framing, vague numbers, or second-hand citations.

6. NO CONSULTANT NOISE.
   - No "in today's fast-paced world". No "at the end of the day". No "as the saying goes". No rhetorical padding. The author will throw those out anyway.

7. EXTRACT WIDELY.
   - Err on the side of capturing more candidate items. The verifier will cull. Shallow extraction is the failure mode — do not produce 2 items when the source supports 12.

Return every legitimate item the source supports.`;

const VERIFICATION_SYSTEM_PROMPT = `You are the second-pass verifier for a chapter research dossier.

Your job is to independently verify each candidate item against the fetched source text.

Rules:
- REJECT any claim whose evidenceExcerpt is not actually supported by the source text.
- REJECT distortions: a source saying "up to 30%" does not support a claim of "30%".
- REJECT missing context: a statistic without denominator or time period is not verified.
- NEEDS_CORROBORATION for claims that look true but depend on a single weak citation, or where the source quotes a second party uncritically.
- VERIFIED only when the source text directly and unambiguously supports the claim.
- Confirm whether the source tier still looks correct based on publisher reputation and evidence type.
- Be strict. A false positive poisons the draft; a false negative just means more research.`;

function enhancePromptWithQualityFeedback(
  basePrompt: string,
  qualityFeedback?: unknown,
): string {
  if (!qualityFeedback || typeof qualityFeedback !== "object") {
    return basePrompt;
  }

  const feedback = qualityFeedback as Record<string, unknown>;
  const guidance = feedback.guidance ? String(feedback.guidance) : null;
  const issues = Array.isArray(feedback.issues) ? feedback.issues : [];

  if (!guidance && issues.length === 0) {
    return basePrompt;
  }

  const feedbackText = `

QUALITY FEEDBACK FROM PREVIOUS ATTEMPT:
${guidance ? `Priority: ${guidance}` : ""}
${issues.length > 0 ? `Issues to fix:\n${issues.map((issue) => `- ${issue}`).join("\n")}` : ""}`;

  return basePrompt + feedbackText;
}

function getResearchChapterTimeoutMs() {
  const rawValue = Number(process.env.RESEARCH_CHAPTER_TIMEOUT_MS ?? 120000);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return 120000;
  }

  return rawValue;
}

function getResearchChapterRetryLimit() {
  const rawValue = Number(process.env.RESEARCH_CHAPTER_RETRY_LIMIT ?? 2);
  if (!Number.isFinite(rawValue) || rawValue < 1) {
    return 2;
  }

  return Math.floor(rawValue);
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

function getResearchModelName(purpose: ResearchModelPurpose) {
  if (purpose === "questions") {
    return process.env.OPENAI_RESEARCH_QUESTION_MODEL ?? "gpt-5.4";
  }

  if (purpose === "verification") {
    return process.env.OPENAI_RESEARCH_VERIFICATION_MODEL ?? "gpt-5.4";
  }

  if (purpose === "adjudication") {
    return process.env.OPENAI_RESEARCH_ADJUDICATION_MODEL ?? "gpt-5.4";
  }

  return process.env.OPENAI_RESEARCH_EXTRACTION_MODEL ?? "gpt-5.4";
}

function getResearchReasoningEffort(purpose: ResearchModelPurpose): ResearchReasoningEffort {
  if (purpose === "questions") {
    return (process.env.OPENAI_RESEARCH_QUESTION_REASONING ??
      "high") as ResearchReasoningEffort;
  }

  if (purpose === "verification") {
    return (process.env.OPENAI_RESEARCH_VERIFICATION_REASONING ??
      "high") as ResearchReasoningEffort;
  }

  if (purpose === "adjudication") {
    return (process.env.OPENAI_RESEARCH_ADJUDICATION_REASONING ??
      "xhigh") as ResearchReasoningEffort;
  }

  return (process.env.OPENAI_RESEARCH_EXTRACTION_REASONING ??
    "high") as ResearchReasoningEffort;
}

function roleForPurpose(purpose: ResearchModelPurpose): StageRole {
  if (purpose === "questions") return "research:questions";
  if (purpose === "verification") return "research:agent-3-verifier"; // Three-agent pipeline: Verifier agent
  if (purpose === "adjudication") return "research:adjudicate";
  return "research:extract";
}

async function getChatModel(purpose: ResearchModelPurpose) {
  // Three-agent research pipeline:
  // - Agent 1 (Researcher): questions + extraction with web search
  // - Agent 2 (Extractor): lightweight URL extraction and passage retrieval
  // - Agent 3 (Verifier): Haiku compares claims against actual source excerpts
  // Each role is independently overridable via env (LLM_RESEARCH_* variables).
  const timeoutMs =
    purpose === "adjudication" ? 120000 : purpose === "extraction" ? 120000 : 60000;
  const reasoningEffort = getResearchReasoningEffort(purpose);
  const normalizedEffort =
    reasoningEffort === "minimal"
      ? "low"
      : ((reasoningEffort === "low" || reasoningEffort === "medium" || reasoningEffort === "high")
          ? reasoningEffort
          : "high");

  return getModelForRole(roleForPurpose(purpose), {
    // Temperature is role-dependent. Questions and extraction want a touch
    // of variance so the model explores the source; verification wants
    // determinism.
    temperature: purpose === "verification" ? 0.1 : 0.4,
    maxOutputTokens: 8000,
    timeoutMs,
    reasoningEffort: normalizedEffort,
  });
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function parseJsonText<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getMessageTextContent(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("\n");
  }

  return "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function classifySourceTier(url: string): {
  tier: ResearchSourceTier;
  weight: number;
} {
  const normalized = url.toLowerCase();

  const tierAIndicators = [
    ".gov/",
    ".gov?",
    ".gov",
    "doi.org",
    "ncbi.nlm.nih.gov",
    "pubmed",
    "census.gov",
    "bls.gov",
    "oecd.org",
    "worldbank.org",
    "nih.gov",
  ];

  const tierCIndicators = [
    "reddit.com",
    "medium.com",
    "substack.com",
    "blog.",
    "blogspot.",
    "wordpress.",
  ];

  if (tierAIndicators.some((indicator) => normalized.includes(indicator))) {
    return { tier: "A", weight: 1 };
  }

  if (tierCIndicators.some((indicator) => normalized.includes(indicator))) {
    return { tier: "C", weight: 0.5 };
  }

  return { tier: "B", weight: 0.75 };
}

function getChapterContext(
  chapterKey: string,
  outline: BookOutline | null,
  paragraphOutline: ParagraphOutline | null,
): ChapterContext | null {
  if (paragraphOutline) {
    for (const section of paragraphOutline.sections) {
      const chapter = section.chapters.find((item) => item.chapterId === chapterKey);
      if (chapter) {
        return {
          chapterKey,
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          sectionId: section.sectionId,
          sectionTitle: section.sectionTitle,
          paragraphs: chapter.paragraphs.map((paragraph) => ({
            paragraphId: paragraph.id,
            topicSentence: paragraph.topicSentence,
            purpose: paragraph.purpose,
          })),
        };
      }
    }
  }

  if (outline) {
    for (const section of outline.sections) {
      const chapter = section.chapters.find((item) => item.id === chapterKey);
      if (chapter) {
        return {
          chapterKey,
          chapterTitle: chapter.title,
          chapterDescription: chapter.description,
          sectionId: section.id,
          sectionTitle: section.title,
          paragraphs: [],
        };
      }
    }
  }

  return null;
}

function getBaseStoryChapterContext(
  baseStory: BaseStoryBundle | null,
  chapterKey: string,
) {
  if (!baseStory) {
    return null;
  }

  const chapter = baseStory.chapters.find((entry) => entry.chapterKey === chapterKey);
  if (!chapter) {
    return null;
  }

  return {
    baseStoryChapterPurpose: chapter.chapterPurpose,
    baseStoryChapterThread: chapter.chapterStory,
    baseStoryBookThread: baseStory.bookThread,
  };
}

async function wasWorkflowCanceled(runId?: string | null) {
  if (!runId) {
    return false;
  }

  const run = await getWorkflowRunById(runId);
  return run?.status === WorkflowRunStatus.CANCELED;
}

// Only research real narrative chapters — skip outline section headers like
// "Big question: ...", "Pillars: ...", "Full Book Outline", etc. that Atlas
// sometimes places as chapter entries in the outline JSON.
const REAL_CHAPTER_RE = /^(introduction|epilogue|prologue|conclusion|closing|afterword|foreword|preface|chapter\s+\d+)/i;

function isRealChapter(title: string): boolean {
  // REAL_CHAPTER_RE matches generic/structural labels (front-matter words,
  // bare "Chapter N" placeholders) — a title matches when it's NOT one of
  // those, i.e. when it's a real, descriptively-titled chapter. This was
  // inverted (missing the `!`) for every book, which meant any chapter with
  // a normal narrative title (the overwhelming majority) was excluded —
  // zero chapters ever reached Research or External Stories generation,
  // and the "Generate" button stayed disabled regardless of upstream state.
  return !REAL_CHAPTER_RE.test(title.trim());
}

function getWorkspaceChapterSeeds(
  outline: BookOutline | null,
  paragraphOutline: ParagraphOutline | null,
): WorkspaceChapterSeed[] {
  if (paragraphOutline) {
    return paragraphOutline.sections.flatMap((section) =>
      section.chapters
        .filter((chapter) => isRealChapter(chapter.chapterTitle))
        .map((chapter) => ({
          chapterKey: chapter.chapterId,
          chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`,
          chapterTitle: chapter.chapterTitle,
          sectionTitle: section.sectionTitle,
        })),
    );
  }

  if (outline) {
    return outline.sections.flatMap((section) =>
      section.chapters
        .filter((chapter) => isRealChapter(chapter.title))
        .map((chapter) => ({
          chapterKey: chapter.id,
          chapterLabel: `Chapter ${chapter.number}: ${chapter.title}`,
          chapterTitle: chapter.title,
          sectionTitle: section.title,
        })),
    );
  }

  return [];
}

async function getResearchChapterSeeds(bookId: string) {
  const [outlineVersion, paragraphVersion, baseStoryVersion] = await Promise.all([
    getCommittedOutline(bookId),
    getCommittedOutlineExpansion(bookId),
    getCommittedBaseStory(bookId),
  ]);
  const outline = parseArtifactWithSchema(outlineVersion?.contentJson, BookOutlineSchema);
  const paragraphOutline = parseArtifactWithSchema(
    paragraphVersion?.contentJson,
    ParagraphOutlineSchema,
  );
  const baseStory = parseArtifactWithSchema(baseStoryVersion?.contentJson, BaseStoryBundleSchema);

  return {
    outline,
    paragraphOutline,
    baseStory,
    chapterSeeds: getWorkspaceChapterSeeds(outline, paragraphOutline),
  };
}

function getDossierStatus(input: {
  versionNumber?: number;
  isCommitted?: boolean;
  verifiedItems?: number;
  needsCorroborationItems?: number;
}): DossierStatus {
  if (!input.versionNumber) {
    return "EMPTY";
  }

  if (input.isCommitted) {
    return "COMMITTED";
  }

  // Chapters with ANY verified items are ready to draft with
  // Quality loop improves them continuously in background
  if ((input.verifiedItems ?? 0) > 0) {
    return "DRAFT";
  }

  // Only truly stuck chapters (0 verified items) need review
  return "NEEDS_REVIEW";
}

function normalizeWorkspaceResearchSource(source: ResearchSource): ChapterResearchSource {
  return {
    id: source.id,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    title: source.title,
    publisher: source.publisher,
    author: source.author,
    publishedAt: source.publishedAt?.toISOString() ?? null,
    accessedAt: source.accessedAt?.toISOString() ?? null,
    contentType: source.contentType,
    sourceTier: source.sourceTier as ChapterResearchSource["sourceTier"],
    tierWeight: Number(source.tierWeight),
    isVerified: source.isVerified,
    verificationStatus:
      source.verificationStatus as ChapterResearchSource["verificationStatus"],
    verificationNotes: source.verificationNotes,
    snapshotPath: source.snapshotPath,
    extractedTextPath: source.extractedTextPath,
    metadata: parseJson<Record<string, unknown>>(source.metadataJson, {}),
  };
}

function createResearchWorkspaceProfiler(bookSlug: string, selectedTabId?: string) {
  const startedAt = Date.now();
  const runId = `research-workspace-${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
  const entries: string[] = [];

  const serializeDetail = (detail?: Record<string, unknown>) => {
    if (!detail || Object.keys(detail).length === 0) {
      return "";
    }

    try {
      return ` ${JSON.stringify(detail)}`;
    } catch {
      return " [unserializable detail]";
    }
  };

  const mark = (step: string, detail?: Record<string, unknown>) => {
    const elapsedMs = Date.now() - startedAt;
    entries.push(
      `${new Date().toISOString()} [${runId}] +${elapsedMs}ms ${step}${serializeDetail(detail)}`,
    );
  };

  const flush = async (status: "ok" | "error", detail?: Record<string, unknown>) => {
    mark(`complete:${status}`, {
      bookSlug,
      selectedTabId: selectedTabId ?? null,
      totalMs: Date.now() - startedAt,
      ...(detail ?? {}),
    });

    if (entries.length === 0) {
      return;
    }

    const output = `${entries.join("\n")}\n`;
    console.info(output.trimEnd());

    try {
      await appendFile(RESEARCH_WORKSPACE_LOG_PATH, output, "utf8");
    } catch {
      // Logging should never break the workspace load.
    }
  };

  return { mark, flush };
}

async function maybeGenerateResearchQuestions(
  chapter: ChapterContext,
): Promise<ChapterResearchQuestion[]> {
  const model = await getChatModel("questions");

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
    const result = await structuredModel.invoke([
      new SystemMessage(QUESTION_SYSTEM_PROMPT),
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
    ]);

    return result.questions.length > 0 ? result.questions : fallback;
  } catch {
    return fallback;
  }
}

async function discoverCandidateSources(
  chapter: ChapterContext,
  questions: ChapterResearchQuestion[],
) {
  // Broader, deeper query bank. The old version used only 2 generated
  // questions + 4 boilerplate seeds, producing shallow 12-source pools.
  // We now fan out across categories the extractor is expected to fill:
  // stats, mechanisms, case studies, counterevidence, definitions, origins,
  // and recent developments — all anchored to the chapter's actual thesis.
  const descSlice = chapter.chapterDescription.slice(0, 140);
  const queries = [
    `${chapter.chapterTitle} ${descSlice}`,
    ...(chapter.baseStoryChapterThread
      ? [chapter.baseStoryChapterThread.replace(/\s+/g, " ").slice(0, 120)]
      : []),
    `${chapter.chapterTitle} peer reviewed study`,
    `${chapter.chapterTitle} official report statistics`,
    `${chapter.chapterTitle} government data`,
    `${chapter.chapterTitle} longitudinal research`,
    `${chapter.chapterTitle} case study`,
    `${chapter.chapterTitle} counterexample critique`,
    `${chapter.chapterTitle} mechanism how it works`,
    `${chapter.chapterTitle} origin history first`,
    `${chapter.chapterTitle} recent developments`,
    // Pull in up to 6 generated questions (was 2) so the brief actually
    // shapes the search.
    ...questions.slice(0, 6).map((question) => question.question),
  ];

  // Was 6 per query / 12 total — too shallow for a real chapter. 10 per
  // query / 40 total gives the extractor a substantially larger pool to
  // work from without overwhelming the fetcher.
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

async function fetchCandidateSource(
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

async function verifySourceIntegrity(source: FetchedSource): Promise<ChapterResearchVerification> {
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

async function extractItemsFromSource(
  chapter: ChapterContext,
  source: FetchedSource,
  qualityFeedback?: unknown,
): Promise<ChapterResearchItem[]> {
  const model = await getChatModel("extraction");

  const fallbackSourceChunks = source.text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim().length > 80)
    .slice(0, Math.max(3, Math.min(6, chapter.paragraphs.length || 3)));

  const fallback: ChapterResearchItem[] = fallbackSourceChunks.map((sentence, index) => {
    const paragraph = chapter.paragraphs[index % Math.max(1, chapter.paragraphs.length)];
    const itemType: ResearchItemType =
      /\d/.test(sentence) ? "STATISTIC" : index === 0 ? "FACT" : "EXAMPLE";

    return {
      id: `${source.id}-item-${index + 1}`,
      itemType,
      claimText: sentence.trim(),
      evidenceExcerpt: sentence.trim().slice(0, 320),
      summary: `Candidate support drawn from ${source.publisher ?? source.title}.`,
      sourceId: source.id,
      sourceTier: source.sourceTier,
      tierWeight: source.tierWeight,
      verificationStatus: "PENDING",
      relevanceScore: 0.62,
      confidenceScore: 0.52,
      mappedSectionId: chapter.sectionId ?? null,
      mappedChapterId: chapter.chapterKey,
      mappedParagraphId: paragraph?.paragraphId ?? null,
      metadata: {},
    };
  });

  if (!model) {
    return fallback;
  }

  try {
    const structuredModel = model.withStructuredOutput(ExtractedItemsSchema);
    const enhancedPrompt = enhancePromptWithQualityFeedback(EXTRACTION_SYSTEM_PROMPT, qualityFeedback);
    const result = await structuredModel.invoke([
      new SystemMessage(enhancedPrompt),
      new HumanMessage(
        JSON.stringify({
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          chapterParagraphs: chapter.paragraphs,
          source: {
            title: source.title,
            url: source.canonicalUrl ?? source.url,
            publisher: source.publisher,
            sourceTier: source.sourceTier,
            // Was slice(0, 12000) — ~3k tokens, truncated mid-sentence and
            // lost most long-form reporting. Claude Sonnet 4.6 has a 200k
            // context window; send the full source up to a safety cap.
            text: source.text.slice(0, 180000),
          },
        }),
      ),
    ]);

    if (result.items.length === 0) {
      // Don't silently return the sentence-split fallback. Log the gap so
      // it shows up in server logs and return the provisional items with a
      // metadata flag so downstream UI can distinguish real extraction from
      // the fallback.
      console.warn(
        `[research] extraction returned zero items for source ${source.id} (${source.title}). Using sentence-split provisional.`,
      );
      return fallback.map((item) => ({
        ...item,
        metadata: { ...(item.metadata ?? {}), provisional: true, reason: "extraction-empty" },
      }));
    }

    return result.items.map((item, index) => ({
      id: item.id || `${source.id}-item-${index + 1}`,
      itemType: item.itemType as ResearchItemType,
      claimText: item.claimText,
      evidenceExcerpt: item.evidenceExcerpt ?? null,
      summary: item.summary ?? null,
      sourceId: source.id,
      sourceTier: source.sourceTier,
      tierWeight: source.tierWeight,
      verificationStatus: "PENDING",
      relevanceScore: item.relevanceScore ?? 0.65,
      confidenceScore: item.confidenceScore ?? 0.6,
      mappedSectionId: chapter.sectionId ?? null,
      mappedChapterId: chapter.chapterKey,
      mappedParagraphId: item.mappedParagraphId ?? chapter.paragraphs[0]?.paragraphId ?? null,
      metadata: {},
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown extraction error";
    console.error(
      `[research] extraction threw for source ${source.id} (${source.title}): ${message}`,
    );
    return fallback.map((item) => ({
      ...item,
      metadata: {
        ...(item.metadata ?? {}),
        provisional: true,
        reason: "extraction-failed",
        error: message,
      },
    }));
  }
}

async function verifyItemsForSource(
  chapter: ChapterContext,
  source: FetchedSource,
  items: ChapterResearchItem[],
  qualityFeedback?: unknown,
): Promise<{
  items: ChapterResearchItem[];
  verifications: ChapterResearchVerification[];
}> {
  const model = await getChatModel("verification");
  const enhancedVerificationPrompt = enhancePromptWithQualityFeedback(
    VERIFICATION_SYSTEM_PROMPT,
    qualityFeedback,
  );

  if (!model) {
    return {
      items,
      verifications: items.map((item) => ({
        id: `${item.id}-llm-verify`,
        sourceRecordId: source.id,
        researchItemId: item.id,
        verifierType: "LLM_VERIFIER",
        status: "NEEDS_CORROBORATION",
        titleMatch: null,
        contentMatch: null,
        claimSupported: true,
        tierConfirmed: true,
        secondSourceRequired: source.sourceTier !== "A",
        secondSourceConfirmed: false,
        notes: "Fallback verification marked this item as needing corroboration.",
        metadata: {},
      })),
    };
  }

  try {
    const structuredModel = model.withStructuredOutput(VerificationSchema);
    const result = await structuredModel.invoke([
      new SystemMessage(enhancedVerificationPrompt),
      new HumanMessage(
        JSON.stringify({
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          source: {
            title: source.title,
            url: source.canonicalUrl ?? source.url,
            sourceTier: source.sourceTier,
            // Was slice(0, 12000); same reasoning as extraction.
            text: source.text.slice(0, 180000),
          },
          candidateItems: items.map((item) => ({
            itemId: item.id,
            claimText: item.claimText,
            evidenceExcerpt: item.evidenceExcerpt,
            itemType: item.itemType,
          })),
        }),
      ),
    ]);

    const verificationById = new Map(result.items.map((item) => [item.itemId, item]));
    const nextItems = items.map((item) => {
      const verification = verificationById.get(item.id);
      const promoted = shouldAutoPromoteResearchItem(item, source, verification);
      return {
        ...item,
        verificationStatus: promoted
          ? "VERIFIED"
          : ((verification?.status as ResearchVerificationStatus) ?? "REJECTED"),
      };
    });

    const verifications: ChapterResearchVerification[] = nextItems.map((item) => {
      const verification = verificationById.get(item.id);

      return {
        id: `${item.id}-llm-verify`,
        sourceRecordId: source.id,
        researchItemId: item.id,
        verifierType: "LLM_VERIFIER",
        status: shouldAutoPromoteResearchItem(item, source, verification)
          ? "VERIFIED"
          : ((verification?.status as ResearchVerificationStatus) ?? "REJECTED"),
        titleMatch: null,
        contentMatch: null,
        claimSupported: verification?.claimSupported ?? false,
        tierConfirmed: verification?.tierConfirmed ?? false,
        secondSourceRequired: verification?.secondSourceRequired ?? false,
        secondSourceConfirmed: verification?.secondSourceConfirmed ?? false,
        notes: verification?.notes ?? "Verification failed.",
        metadata: {},
      };
    });

    return { items: nextItems, verifications };
  } catch {
    return {
      items: items.map((item) => ({
        ...item,
        verificationStatus: "NEEDS_CORROBORATION",
      })),
      verifications: items.map((item) => ({
        id: `${item.id}-llm-verify`,
        sourceRecordId: source.id,
        researchItemId: item.id,
        verifierType: "LLM_VERIFIER",
        status: "NEEDS_CORROBORATION",
        titleMatch: null,
        contentMatch: null,
        claimSupported: true,
        tierConfirmed: true,
        secondSourceRequired: true,
        secondSourceConfirmed: false,
        notes: "Verification fallback marked this item as needing corroboration.",
        metadata: {},
      })),
    };
  }
}

function shouldAutoPromoteResearchItem(
  item: ChapterResearchItem,
  source: FetchedSource,
  verification?: {
    status?: ResearchVerificationStatus;
    claimSupported?: boolean;
    tierConfirmed?: boolean;
    secondSourceRequired?: boolean;
    secondSourceConfirmed?: boolean;
  },
) {
  if (!verification) {
    return false;
  }

  if (verification.status === "VERIFIED") {
    return true;
  }

  if (verification.status === "REJECTED") {
    return false;
  }

  if (!verification.claimSupported || !verification.tierConfirmed) {
    return false;
  }

  if (verification.secondSourceConfirmed) {
    return true;
  }

  const promotableTierBTypes = [
    "FACT",
    "DEFINITION",
    "EXAMPLE",
    "CASE_STUDY",
    "COUNTERPOINT",
  ];

  if (source.sourceTier === "A") {
    return item.itemType !== "QUOTE";
  }

  if (source.sourceTier !== "B") {
    return false;
  }

  return promotableTierBTypes.includes(item.itemType);
}

async function adjudicateAmbiguousItems(
  chapter: ChapterContext,
  source: FetchedSource,
  items: ChapterResearchItem[],
  verifications: ChapterResearchVerification[],
) {
  const model = await getChatModel("adjudication");
  if (!model) {
    return { items, verifications };
  }

  const ambiguousItems = items.filter((item) => item.verificationStatus !== "VERIFIED");
  if (ambiguousItems.length === 0) {
    return { items, verifications };
  }

  try {
    const response = await model.invoke([
      new SystemMessage(`
You are the final adjudicator for ambiguous research-verification decisions.

Return strict JSON with this shape:
{
  "items": [
    {
      "itemId": "string",
      "status": "VERIFIED" | "REJECTED" | "NEEDS_CORROBORATION",
      "notes": "string",
      "secondSourceRequired": true | false
    }
  ]
}

Rules:
- Be conservative.
- Only upgrade to VERIFIED if the source text clearly supports the claim.
- Use NEEDS_CORROBORATION when the claim seems plausible but too important or too soft to accept alone.
- Use REJECTED when the claim is not supported or is distorted.
      `),
      new HumanMessage(
        JSON.stringify({
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          source: {
            title: source.title,
            url: source.canonicalUrl ?? source.url,
            sourceTier: source.sourceTier,
          },
          candidateItems: ambiguousItems.map((item) => ({
            id: item.id,
            claimText: item.claimText,
            evidenceExcerpt: item.evidenceExcerpt,
            currentStatus: item.verificationStatus,
          })),
          sourceText: source.text.slice(0, 180000),
        }),
      ),
    ]);

    const result = AdjudicationSchema.safeParse(
      parseJsonText(getMessageTextContent(response.content), { items: [] }),
    );

    if (!result.success) {
      return { items, verifications };
    }

    const adjudicationById = new Map(result.data.items.map((item) => [item.itemId, item]));

    return {
      items: items.map((item) => {
        const adjudication = adjudicationById.get(item.id);
        if (!adjudication) {
          return item;
        }

        const promoted = shouldAutoPromoteResearchItem(item, source, {
          status: adjudication.status as ResearchVerificationStatus,
          claimSupported: adjudication.status !== "REJECTED",
          tierConfirmed: true,
          secondSourceRequired: adjudication.secondSourceRequired,
          secondSourceConfirmed: false,
        });

        return {
          ...item,
          verificationStatus: promoted
            ? "VERIFIED"
            : (adjudication.status as ResearchVerificationStatus),
        };
      }),
      verifications: [
        ...verifications,
        ...result.data.items.map((item) => {
          const originalItem = items.find((candidate) => candidate.id === item.itemId);
          const promoted =
            originalItem != null
              ? shouldAutoPromoteResearchItem(originalItem, source, {
                  status: item.status as ResearchVerificationStatus,
                  claimSupported: item.status !== "REJECTED",
                  tierConfirmed: true,
                  secondSourceRequired: item.secondSourceRequired,
                  secondSourceConfirmed: false,
                })
              : false;

          return {
            id: `${item.itemId}-pro-adjudication`,
            sourceRecordId: source.id,
            researchItemId: item.itemId,
            verifierType: "LLM_VERIFIER" as const,
            status: promoted
              ? "VERIFIED"
              : (item.status as ResearchVerificationStatus),
            titleMatch: null,
            contentMatch: null,
            claimSupported: item.status !== "REJECTED",
            tierConfirmed: true,
            secondSourceRequired: item.secondSourceRequired,
            secondSourceConfirmed: false,
            notes: `Adjudication review: ${item.notes}`,
            metadata: {
              adjudicationModel: resolveModelSpec("research:adjudicate"),
            },
          };
        }),
      ],
    };
  } catch {
    return { items, verifications };
  }
}

function buildDossier(
  chapter: ChapterContext,
  questions: ChapterResearchQuestion[],
  sources: ChapterResearchSource[],
  items: ChapterResearchItem[],
): ChapterResearchDossier {
  const verifiedItems = items.filter((item) => item.verificationStatus === "VERIFIED");
  const needsCorroborationItems = items.filter(
    (item) => item.verificationStatus === "NEEDS_CORROBORATION",
  );

  const byType = (itemType: ResearchItemType) =>
    verifiedItems.filter((item) => item.itemType === itemType);

  const examples = verifiedItems.filter((item) =>
    item.itemType === "EXAMPLE" || item.itemType === "CASE_STUDY",
  );

  const verifiedSources = sources.filter((source) => source.isVerified);

  return {
    chapterKey: chapter.chapterKey,
    chapterTitle: chapter.chapterTitle,
    chapterDescription: chapter.chapterDescription,
    researchGoal: `Build a defensible research dossier for ${chapter.chapterTitle} with independently verified facts, figures, and examples.`,
    researchQuestions: questions,
    factBank: byType("FACT"),
    statistics: byType("STATISTIC"),
    quotes: byType("QUOTE"),
    examples,
    counterpoints: byType("COUNTERPOINT"),
    definitions: byType("DEFINITION"),
    gaps: [
      ...(verifiedItems.length === 0
        ? ["No verified research items were admitted yet for this chapter."]
        : []),
      ...needsCorroborationItems.map(
        (item) => `Needs corroboration before admission: ${item.claimText}`,
      ),
    ],
    sourceRegister: sources,
    verificationSummary: {
      totalSources: sources.length,
      verifiedSources: verifiedSources.length,
      totalItems: items.length,
      verifiedItems: verifiedItems.length,
      rejectedItems: items.filter((item) => item.verificationStatus === "REJECTED").length,
      needsCorroborationItems: needsCorroborationItems.length,
    },
  };
}

function buildProvisionalResearchPack(
  chapter: ChapterContext,
  questions: ChapterResearchQuestion[],
  failureMessage: string,
) {
  const timedOut = /timed out/i.test(failureMessage);
  const sourceId = `${chapter.chapterKey}-provisional-source`;
  const provisionalSource: ChapterResearchSource = {
    id: sourceId,
    url: "about:provisional-research-plan",
    title: `Provisional research scaffold for ${chapter.chapterTitle}`,
    publisher: "GHOSTWRITR",
    author: "System fallback",
    accessedAt: new Date().toISOString(),
    contentType: "text/plain",
    sourceTier: "C",
    tierWeight: 0.5,
    isVerified: false,
    verificationStatus: "NEEDS_CORROBORATION",
    verificationNotes:
      "Generated without live web verification. Replace with traced sources before final drafting.",
    metadata: {
      provisional: true,
      retryRecommended: true,
      failureReason: failureMessage,
      timeout: timedOut,
    },
  };

  const provisionalItems: ChapterResearchItem[] = [
    {
      id: `${chapter.chapterKey}-lead-1`,
      itemType: "DEFINITION",
      claimText: `Define the central operating problem in ${chapter.chapterTitle} with a traceable source before drafting.`,
      summary: `Use this as a research lead for ${chapter.chapterDescription}`,
      sourceId,
      sourceTier: "C",
      tierWeight: 0.5,
      verificationStatus: "NEEDS_CORROBORATION",
      mappedChapterId: chapter.chapterKey,
      mappedParagraphId: chapter.paragraphs[0]?.paragraphId ?? null,
      metadata: { provisional: true },
    },
    {
      id: `${chapter.chapterKey}-lead-2`,
      itemType: "STATISTIC",
      claimText: `Find 2-3 current metrics or benchmarks that quantify the operational stakes behind ${chapter.chapterTitle}.`,
      summary: "Research lead only. Do not quote as fact until verified.",
      sourceId,
      sourceTier: "C",
      tierWeight: 0.5,
      verificationStatus: "NEEDS_CORROBORATION",
      mappedChapterId: chapter.chapterKey,
      mappedParagraphId: chapter.paragraphs[1]?.paragraphId ?? chapter.paragraphs[0]?.paragraphId ?? null,
      metadata: { provisional: true },
    },
    {
      id: `${chapter.chapterKey}-lead-3`,
      itemType: "EXAMPLE",
      claimText: `Locate one concrete case study that demonstrates ${chapter.chapterTitle} in practice.`,
      summary: "Use this to anchor the chapter with a real-world example later.",
      sourceId,
      sourceTier: "C",
      tierWeight: 0.5,
      verificationStatus: "NEEDS_CORROBORATION",
      mappedChapterId: chapter.chapterKey,
      mappedParagraphId: chapter.paragraphs[2]?.paragraphId ?? chapter.paragraphs[0]?.paragraphId ?? null,
      metadata: { provisional: true },
    },
  ];

  const provisionalVerifications: ChapterResearchVerification[] = provisionalItems.map((item) => ({
    id: `${item.id}-verify`,
    sourceRecordId: sourceId,
    researchItemId: item.id,
    verifierType: "LLM_VERIFIER",
    status: "NEEDS_CORROBORATION",
    titleMatch: false,
    contentMatch: false,
    claimSupported: false,
    tierConfirmed: false,
    secondSourceRequired: true,
    secondSourceConfirmed: false,
    notes: "Fallback scaffold only. Retry after web access is configured.",
    metadata: { provisional: true },
  }));

  const dossier: ChapterResearchDossier = {
    chapterKey: chapter.chapterKey,
    chapterTitle: chapter.chapterTitle,
    chapterDescription: chapter.chapterDescription,
    researchGoal: `Provisional dossier for ${chapter.chapterTitle}. This chapter still needs verified web research before final drafting.`,
    researchQuestions: questions,
    factBank: [],
    statistics: provisionalItems.filter((item) => item.itemType === "STATISTIC"),
    quotes: [],
    examples: provisionalItems.filter((item) => item.itemType === "EXAMPLE"),
    counterpoints: [],
    definitions: provisionalItems.filter((item) => item.itemType === "DEFINITION"),
    gaps: [
      "This dossier was generated without working web access.",
      "All items below are research leads, not admitted facts.",
      failureMessage,
    ],
    sourceRegister: [provisionalSource],
    verificationSummary: {
      totalSources: 1,
      verifiedSources: 0,
      totalItems: provisionalItems.length,
      verifiedItems: 0,
      rejectedItems: 0,
      needsCorroborationItems: provisionalItems.length,
    },
    metadata: {
      provisional: true,
      retryRecommended: true,
      warning: "Fallback draft only. Retry once live web search is configured.",
      failureReason: failureMessage,
      timeout: timedOut,
    },
  };

  return {
    dossier,
    sources: [provisionalSource],
    items: provisionalItems,
    verifications: provisionalVerifications,
  };
}

function recentActivity(
  entries: Array<{ at: string; message: string }> | undefined,
  message: string,
) {
  return [{ at: new Date().toISOString(), message }, ...(entries ?? [])].slice(0, 3);
}

function summarizeQueries(queries: string[]) {
  return queries.slice(0, 2).join(" | ");
}

function summarizeDomains(urls: string[]) {
  const domains = Array.from(
    new Set(
      urls.flatMap((url) => {
        try {
          return [new URL(url).hostname.replace(/^www\./, "")];
        } catch {
          return [];
        }
      }),
    ),
  );

  return domains.slice(0, 3).join(", ");
}

async function pulseResearchStage(input: {
  bookId: string;
  currentChapterKey?: string | null;
  currentAction: string;
  message: string;
}) {
  const stage = await getStageForBook(input.bookId, StageKey.RESEARCH);
  const metadata = parseMetadataRecord(stage?.metadataJson);

  await updateStageForBook(input.bookId, StageKey.RESEARCH, {
    metadataJson: {
      ...metadata,
      automationStatus: "running",
      currentAction: input.currentAction,
      currentChapterKey: input.currentChapterKey ?? null,
      recentActivity: recentActivity(
        Array.isArray(metadata.recentActivity)
          ? (metadata.recentActivity as Array<{ at: string; message: string }>)
          : undefined,
        input.message,
      ),
      lastRunAt: new Date().toISOString(),
    } as Prisma.InputJsonValue,
  });
}

export async function runChapterResearchWorkflow(bookSlug: string, chapterKey: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const [outlineVersion, paragraphVersion, baseStoryVersion] = await Promise.all([
    getCommittedOutline(book.id),
    getCommittedOutlineExpansion(book.id),
    getCommittedBaseStory(book.id),
  ]);

  const outline = parseArtifactWithSchema(outlineVersion?.contentJson, BookOutlineSchema);
  const paragraphOutline = parseArtifactWithSchema(
    paragraphVersion?.contentJson,
    ParagraphOutlineSchema,
  );
  const baseStory = parseArtifactWithSchema(baseStoryVersion?.contentJson, BaseStoryBundleSchema);

  if (!baseStory) {
    throw new Error("A committed Base Story is required before Research can run.");
  }

  const chapter = getChapterContext(chapterKey, outline, paragraphOutline);
  if (!chapter) {
    throw new Error(`Committed chapter ${chapterKey} was not found`);
  }
  const chapterContext: ChapterContext = {
    ...chapter,
    ...getBaseStoryChapterContext(baseStory, chapterKey),
  };

  // Read quality feedback if this is a retry
  const stage = await getStageForBook(book.id, StageKey.RESEARCH);
  const qualityFeedback =
    stage?.metadataJson && typeof stage.metadataJson === "object"
      ? (stage.metadataJson as Record<string, unknown>).lastQualityFeedback
      : null;

  const retryMessage = qualityFeedback && typeof qualityFeedback === "object"
    ? ` (Quality Retry: ${(qualityFeedback as Record<string, unknown>).guidance})`
    : "";
  await pulseResearchStage({
    bookId: book.id,
    currentChapterKey: chapterContext.chapterKey,
    currentAction: "Framing research questions",
    message: `Framing research questions for ${chapterContext.chapterTitle}${retryMessage}`,
  });
  const questions = await maybeGenerateResearchQuestions(chapterContext);
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
          await discoverCandidateSources(chapterContext, questions);
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
            const items = await extractItemsFromSource(chapter, source, qualityFeedback);
            const verification = await verifyItemsForSource(chapter, source, items, qualityFeedback);
            const adjudicated = await adjudicateAmbiguousItems(
              chapter,
              source,
              verification.items,
              verification.verifications,
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
  const version = await createResearchPackVersion({
    bookId: book.id,
    chapterKey,
    chapterTitle: chapter.chapterTitle,
    summary: dossier.researchGoal,
    dossier,
    sources: persistedSources,
    items: persistedItems,
    verifications,
    modelName: `questions:${resolveModelSpec("research:questions")}; extraction:${resolveModelSpec("research:extract")}; verification:${resolveModelSpec("research:verify")}; adjudication:${resolveModelSpec("research:adjudicate")}`,
    promptTemplateVersion: "research-v2-depth",
  });

  return {
    book,
    chapter,
    dossier,
    artifactVersionId: version.id,
  };
}

type ResearchRunOptions = {
  chapterKeys?: string[];
  preserveCompletedCount?: number;
  preserveProvisionalChapters?: string[];
};

export async function runFullResearchWorkflow(
  bookSlug: string,
  runId?: string,
  options: ResearchRunOptions = {},
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const baseStoryVersion = await getCommittedBaseStory(book.id);
  if (!baseStoryVersion) {
    throw new Error("A committed Base Story is required before Research can run.");
  }
  const { chapterSeeds: allChapterSeeds } = await getResearchChapterSeeds(book.id);
  const requestedChapterKeys = new Set(options.chapterKeys ?? []);
  const chapterSeeds =
    requestedChapterKeys.size > 0
      ? allChapterSeeds.filter((chapter) => requestedChapterKeys.has(chapter.chapterKey))
      : allChapterSeeds;

  if (chapterSeeds.length === 0) {
    throw new Error("No committed chapters are available for research generation.");
  }

  const preservedCompletedCount = options.preserveCompletedCount ?? 0;
  const provisionalChapters = [...new Set(options.preserveProvisionalChapters ?? [])];
  const chapterRetryLimit = getResearchChapterRetryLimit();

  await updateStageForBook(book.id, StageKey.RESEARCH, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "running",
      currentAction: "Searching and verifying sources",
      totalChapters: allChapterSeeds.length,
      completedChapters: preservedCompletedCount,
      failedChapters: [],
      provisionalChapters,
      currentChapterKey: chapterSeeds[0]?.chapterKey ?? null,
      recentActivity: recentActivity(
        undefined,
        requestedChapterKeys.size > 0
          ? `Resumed research for ${chapterSeeds.length} failed chapter${chapterSeeds.length === 1 ? "" : "s"}.`
          : "Started full research run.",
      ),
      lastRunAt: new Date().toISOString(),
    },
  });

  const completedChapterKeys: string[] = [];
  const failedChapters: Array<{ chapterKey: string; message: string }> = [];

  for (const [index, chapter] of chapterSeeds.entries()) {
    if (await wasWorkflowCanceled(runId)) {
      return {
        totalChapters: allChapterSeeds.length,
        completedChapterKeys,
        failedChapters,
        canceled: true,
      };
    }

    let chapterFailedMessage: string | null = null;
    let finalResult: Awaited<ReturnType<typeof runChapterResearchWorkflow>> | null = null;

    for (let attempt = 1; attempt <= chapterRetryLimit; attempt += 1) {
      try {
        const result = await runChapterResearchWorkflow(bookSlug, chapter.chapterKey);
        const shouldRetry =
          result.dossier.metadata?.provisional &&
          result.dossier.metadata?.retryRecommended &&
          attempt < chapterRetryLimit;

        if (shouldRetry) {
          await pulseResearchStage({
            bookId: book.id,
            currentChapterKey: chapter.chapterKey,
            currentAction: "Retrying chapter research",
            message: `Retrying ${chapter.chapterTitle} after provisional result`,
          });
          continue;
        }

        finalResult = result;
        break;
      } catch (error) {
        chapterFailedMessage =
          error instanceof Error ? error.message : "Unknown research error";

        if (attempt < chapterRetryLimit) {
          await pulseResearchStage({
            bookId: book.id,
            currentChapterKey: chapter.chapterKey,
            currentAction: "Retrying chapter research",
            message: `Retrying ${chapter.chapterTitle} after error`,
          });
          continue;
        }
      }
    }

    if (finalResult) {
      completedChapterKeys.push(chapter.chapterKey);
      if (finalResult.dossier.metadata?.provisional) {
        if (!provisionalChapters.includes(chapter.chapterKey)) {
          provisionalChapters.push(chapter.chapterKey);
        }

        if (finalResult.dossier.metadata?.timeout) {
          failedChapters.push({
            chapterKey: chapter.chapterKey,
            message:
              finalResult.dossier.metadata.failureReason ??
              `Chapter research timed out for ${chapter.chapterTitle}.`,
          });
        }
      }
    } else if (chapterFailedMessage) {
      failedChapters.push({
        chapterKey: chapter.chapterKey,
        message: chapterFailedMessage,
      });
    }

    if (await wasWorkflowCanceled(runId)) {
      return {
        totalChapters: allChapterSeeds.length,
        completedChapterKeys,
        failedChapters,
        canceled: true,
      };
    }

    await updateStageForBook(book.id, StageKey.RESEARCH, {
      status: StageStatus.IN_PROGRESS,
      metadataJson: {
        automationStatus: "running",
        currentAction:
          chapterSeeds[index + 1]?.chapterKey != null
            ? "Searching and verifying sources"
            : "Finishing research dossier review",
        totalChapters: allChapterSeeds.length,
        completedChapters: preservedCompletedCount + completedChapterKeys.length,
        failedChapters,
        provisionalChapters,
        currentChapterKey: chapterSeeds[index + 1]?.chapterKey ?? null,
        recentActivity: recentActivity(
          undefined,
          failedChapters.some((item) => item.chapterKey === chapter.chapterKey)
            ? `Failed ${chapter.chapterTitle}`
            : provisionalChapters.includes(chapter.chapterKey)
              ? `Generated provisional dossier for ${chapter.chapterTitle}`
            : `Completed ${chapter.chapterTitle}`,
        ),
        lastRunAt: new Date().toISOString(),
      },
    });
  }

  await updateStageForBook(book.id, StageKey.RESEARCH, {
    status:
      failedChapters.length > 0 ? StageStatus.BLOCKED : StageStatus.READY_FOR_REVIEW,
    metadataJson: {
      automationStatus: failedChapters.length > 0 ? "blocked" : "ready_for_review",
      currentAction:
        failedChapters.length > 0
          ? "Needs retry after search failures"
          : provisionalChapters.length > 0
            ? "Provisional dossiers ready for review"
            : "Ready for review",
      totalChapters: allChapterSeeds.length,
      completedChapters: preservedCompletedCount + completedChapterKeys.length,
      failedChapters,
      provisionalChapters,
      currentChapterKey: null,
      recentActivity: recentActivity(
        undefined,
        failedChapters.length > 0
          ? `Research run ended with ${failedChapters.length} failed chapter${failedChapters.length === 1 ? "" : "s"}.`
          : provisionalChapters.length > 0
            ? `Generated ${provisionalChapters.length} provisional dossier${provisionalChapters.length === 1 ? "" : "s"}.`
          : "Research run completed successfully.",
      ),
      lastRunAt: new Date().toISOString(),
    },
  });

  return {
    totalChapters: allChapterSeeds.length,
    completedChapterKeys,
    failedChapters,
    provisionalChapters,
  };
}

type EnqueueResearchOptions = {
  chapterKeys?: string[];
  preserveCompletedCount?: number;
  preserveProvisionalChapters?: string[];
};

export async function enqueueFullResearchWorkflow(
  bookSlug: string,
  options: EnqueueResearchOptions = {},
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const existingRun = await getActiveWorkflowRunForStage(book.id, StageKey.RESEARCH);

  if (existingRun) {
    return existingRun;
  }

  const { chapterSeeds } = await getResearchChapterSeeds(book.id);

  if (chapterSeeds.length === 0) {
    throw new Error("No committed outline chapters are available for research generation.");
  }

  const requestedChapterKeys = new Set(options.chapterKeys ?? []);
  const targetChapterSeeds =
    requestedChapterKeys.size > 0
      ? chapterSeeds.filter((chapter) => requestedChapterKeys.has(chapter.chapterKey))
      : chapterSeeds;

  if (targetChapterSeeds.length === 0) {
    throw new Error("No matching failed research chapters were found to resume.");
  }

  await updateStageForBook(book.id, StageKey.RESEARCH, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "queued",
      currentAction: "Queued for background processing",
      totalChapters: chapterSeeds.length,
      completedChapters: options.preserveCompletedCount ?? 0,
      failedChapters: [],
      provisionalChapters: options.preserveProvisionalChapters ?? [],
      currentChapterKey: targetChapterSeeds[0]?.chapterKey ?? null,
      recentActivity: recentActivity(
        undefined,
        requestedChapterKeys.size > 0
          ? `Queued failed-only research resume for ${targetChapterSeeds.length} chapter${targetChapterSeeds.length === 1 ? "" : "s"}.`
          : "Queued full research run.",
      ),
      lastRunAt: new Date().toISOString(),
    },
  });

  return createWorkflowRun({
    bookId: book.id,
    stageKey: StageKey.RESEARCH,
    inputJson: {
      kind: "full_research_generation",
      bookSlug,
      chapterKeys: targetChapterSeeds.map((chapter) => chapter.chapterKey),
      preserveCompletedCount: options.preserveCompletedCount ?? 0,
      preserveProvisionalChapters: options.preserveProvisionalChapters ?? [],
    },
  });
}

export async function processWorkflowRun(runId: string) {
  const run = await getWorkflowRunById(runId);

  if (!run) {
    throw new Error(`Workflow run ${runId} was not found.`);
  }

  const claimed = await claimWorkflowRun(runId);
  if (claimed.count === 0) {
    return { skipped: true };
  }

  const input = parseJson<Record<string, unknown>>(run.inputJson, {});
  const bookSlug =
    typeof input.bookSlug === "string" ? input.bookSlug : run.book.slug;
  const chapterKeys = Array.isArray(input.chapterKeys)
    ? input.chapterKeys.filter((value): value is string => typeof value === "string")
    : undefined;
  const preserveCompletedCount =
    typeof input.preserveCompletedCount === "number" ? input.preserveCompletedCount : 0;
  const preserveProvisionalChapters = Array.isArray(input.preserveProvisionalChapters)
    ? input.preserveProvisionalChapters.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  try {
    const result = await runFullResearchWorkflow(bookSlug, runId, {
      chapterKeys,
      preserveCompletedCount,
      preserveProvisionalChapters,
    });
    if ((result as { canceled?: boolean }).canceled) {
      return result;
    }
    await completeWorkflowRun(runId, result as unknown as Prisma.InputJsonValue);
    await runQualityAgentWorkflow(bookSlug);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workflow error";
    await failWorkflowRun(runId, message, {
      kind: "full_research_generation_failed",
      bookSlug,
    });
    await runQualityAgentWorkflow(bookSlug);
    throw error;
  }
}

export async function enqueueAndTriggerFullResearchWorkflow(
  bookSlug: string,
  trigger: (runId: string) => void,
  options: EnqueueResearchOptions = {},
) {
  const queuedRun = await enqueueFullResearchWorkflow(bookSlug, options);
  if (queuedRun.status === WorkflowRunStatus.QUEUED) {
    trigger(queuedRun.id);
  }
  return queuedRun;
}

export async function commitChapterResearchWorkflow(bookSlug: string, chapterKey: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const result = await commitResearchPack(book.id, chapterKey);
  await clearStageStaleDependency(bookSlug, StageKey.RESEARCH);
  await invalidateDependentStagesForBook(bookSlug, StageKey.RESEARCH);
  return result;
}

export async function commitAllResearchWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.RESEARCH);
  const { chapterSeeds } = await getResearchChapterSeeds(book.id);

  if (chapterSeeds.length === 0) {
    throw new Error("No committed outline chapters are available for research commit.");
  }

  const committedChapterKeys: string[] = [];
  const missingChapterKeys: string[] = [];
  const latestVersionsByChapter = await getLatestResearchPackVersionsByChapter(
    book.id,
    chapterSeeds.map((chapter) => chapter.chapterKey),
  );

  for (const chapter of chapterSeeds) {
    const latestVersion = latestVersionsByChapter.get(chapter.chapterKey) ?? null;
    if (!latestVersion) {
      missingChapterKeys.push(chapter.chapterKey);
      continue;
    }

    if (latestVersion.lifecycleState !== ArtifactStatus.COMMITTED) {
      await commitResearchPack(book.id, chapter.chapterKey);
    }

    committedChapterKeys.push(chapter.chapterKey);
  }

  const metadata = parseMetadataRecord(stage?.metadataJson);
  const now = new Date().toISOString();

  await updateStageForBook(book.id, StageKey.RESEARCH, {
    status:
      missingChapterKeys.length === 0 ? StageStatus.COMMITTED : StageStatus.READY_FOR_REVIEW,
    committedAt: missingChapterKeys.length === 0 ? new Date() : undefined,
    metadataJson: {
      ...metadata,
      automationStatus: missingChapterKeys.length === 0 ? "committed" : "ready_for_review",
      currentAction:
        missingChapterKeys.length === 0
          ? "All research dossiers committed"
          : `Committed ${committedChapterKeys.length} research dossiers. ${missingChapterKeys.length} still missing.`,
      totalChapters: chapterSeeds.length,
      completedChapters: committedChapterKeys.length,
      failedChapters: [],
      currentChapterKey: null,
      recentActivity: recentActivity(
        Array.isArray(metadata.recentActivity)
          ? (metadata.recentActivity as Array<{ at: string; message: string }>)
          : undefined,
        missingChapterKeys.length === 0
          ? "Committed all research dossiers."
          : `Committed all available research dossiers. Missing: ${missingChapterKeys.join(", ")}`,
      ),
      lastRunAt: now,
    } as Prisma.InputJsonValue,
  });

  return {
    committedChapterKeys,
    missingChapterKeys,
    totalChapters: chapterSeeds.length,
  };
}

export async function getChapterResearchWorkspace(bookSlug: string, chapterKey: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, "RESEARCH");
  const versions = await getResearchPackVersions(book.id, chapterKey);
  const committedVersion = await getCommittedResearchPack(book.id, chapterKey);
  const verifications = await getResearchVerificationsForChapter(book.id, chapterKey);

  return {
    book,
    stage,
    versions: versions.map((version) => ({
      ...version,
      dossier: parseArtifactWithSchema(version.contentJson, ChapterResearchDossierSchema),
      invalidContent:
        version.contentJson != null &&
        !parseArtifactWithSchema(version.contentJson, ChapterResearchDossierSchema),
      isCommitted: version.lifecycleState === ArtifactStatus.COMMITTED,
    })),
    committedDossier: committedVersion
      ? parseArtifactWithSchema(committedVersion.contentJson, ChapterResearchDossierSchema)
      : null,
    verificationCount: verifications.length,
  };
}

export async function getResearchWorkspace(bookSlug: string, selectedTabId?: string) {
  const profiler = createResearchWorkspaceProfiler(bookSlug, selectedTabId);
  profiler.mark("start");

  try {
    const book = await getBookBySlugOrThrow(bookSlug);
    profiler.mark("book_loaded", { bookId: book.id });

    const stage = await getStageForBook(book.id, "RESEARCH");
    profiler.mark("stage_loaded", {
      stageStatus: stage?.status ?? null,
    });

    const { outline, paragraphOutline, baseStory, chapterSeeds } = await getResearchChapterSeeds(book.id);
    profiler.mark("chapter_seeds_loaded", {
      chapterCount: chapterSeeds.length,
      hasOutline: Boolean(outline),
      hasParagraphOutline: Boolean(paragraphOutline),
    });

    await syncResearchBinderTabsFromOutline(
      book.id,
      chapterSeeds.map(({ chapterKey, chapterLabel }) => ({ chapterKey, chapterLabel })),
    );
    profiler.mark("binder_tabs_synced", {
      chapterCount: chapterSeeds.length,
    });

    const tabs = await listResearchBinderTabs(book.id);
    const tabsWithChapterKeys = tabs.map((tab) => ({
      ...tab,
      chapterKeys: getBinderTabChapterKeys(tab.chapterKeysJson),
    }));
    profiler.mark("binder_tabs_loaded", {
      tabCount: tabsWithChapterKeys.length,
      ideaCount: tabsWithChapterKeys.reduce((sum, tab) => sum + tab.ideaClips.length, 0),
    });

    const selectedTab =
      tabsWithChapterKeys.find((tab) => tab.id === selectedTabId) ??
      tabsWithChapterKeys[0] ??
      null;
    profiler.mark("selected_tab_resolved", {
      selectedTabId: selectedTab?.id ?? null,
      selectedChapterCount: selectedTab?.chapterKeys.length ?? 0,
    });

    const chapterMap = new Map(chapterSeeds.map((chapter) => [chapter.chapterKey, chapter]));
    const selectedChapterKeys = selectedTab?.chapterKeys ?? [];
    const allTabbedChapterKeys = Array.from(
      new Set(tabsWithChapterKeys.flatMap((tab) => tab.chapterKeys)),
    );

    const latestVersionsByChapter = await getLatestResearchPackVersionsByChapter(
      book.id,
      allTabbedChapterKeys,
    );
    profiler.mark("latest_versions_loaded", {
      chapterCount: allTabbedChapterKeys.length,
      versionCount: latestVersionsByChapter.size,
    });

    const dossierByChapter = new Map(
      Array.from(latestVersionsByChapter.entries()).map(([chapterKey, version]) => [
        chapterKey,
        parseArtifactWithSchema(version.contentJson, ChapterResearchDossierSchema),
      ]),
    );
    profiler.mark("dossiers_parsed", {
      dossierCount: dossierByChapter.size,
    });

    const selectedVersionIds = selectedChapterKeys
      .map((chapterKey) => latestVersionsByChapter.get(chapterKey)?.id)
      .filter((value): value is string => Boolean(value));
    const selectedSources = await getResearchSourcesForVersions(selectedVersionIds);
    profiler.mark("selected_sources_loaded", {
      selectedVersionCount: selectedVersionIds.length,
      sourceCount: selectedSources.length,
    });

    const sourcesByVersionId = new Map<string, ChapterResearchSource[]>();

    for (const source of selectedSources) {
      const versionId = source.researchArtifactVersionId;
      if (!versionId) {
        continue;
      }

      const bucket = sourcesByVersionId.get(versionId) ?? [];
      bucket.push(normalizeWorkspaceResearchSource(source));
      sourcesByVersionId.set(versionId, bucket);
    }
    profiler.mark("sources_grouped", {
      versionCount: sourcesByVersionId.size,
    });

    const dossierEntries = selectedChapterKeys.map((chapterKey) => {
      const version = latestVersionsByChapter.get(chapterKey) ?? null;
      const dossier = dossierByChapter.get(chapterKey) ?? null;
      const sources = version ? sourcesByVersionId.get(version.id) ?? [] : [];

      return {
        chapter: chapterMap.get(chapterKey) ?? {
          chapterKey,
          chapterLabel: chapterKey,
          chapterTitle: chapterKey,
        },
        version,
        dossier,
        sources,
        invalidArtifact: Boolean(version && !dossier),
        status: getDossierStatus({
          versionNumber: version?.versionNumber,
          isCommitted: version?.lifecycleState === ArtifactStatus.COMMITTED,
          verifiedItems: dossier?.verificationSummary.verifiedItems ?? 0,
          needsCorroborationItems:
            dossier?.verificationSummary.needsCorroborationItems ?? 0,
        }),
      };
    });
    profiler.mark("dossier_entries_built", {
      dossierEntryCount: dossierEntries.length,
    });

    const invalidArtifactWarnings = dossierEntries
      .filter((entry) => entry.invalidArtifact)
      .map(
        (entry) =>
          `${entry.chapter.chapterLabel} has a saved research dossier version that no longer matches the expected schema. Regenerate this dossier before relying on it downstream.`,
      );

    const tabsWithSummary = tabsWithChapterKeys.map((tab) => {
      const chapterVersions = tab.chapterKeys.map((chapterKey) => ({
        version: latestVersionsByChapter.get(chapterKey) ?? null,
        dossier: dossierByChapter.get(chapterKey) ?? null,
      }));

      const generatedCount = chapterVersions.filter((entry) => entry.version).length;
      const committedCount = chapterVersions.filter(
        (entry) => entry.version?.lifecycleState === ArtifactStatus.COMMITTED,
      ).length;
      const verifiedSourceCount = chapterVersions.reduce(
        (sum, entry) => sum + (entry.dossier?.verificationSummary.verifiedSources ?? 0),
        0,
      );
      const verifiedItemCount = chapterVersions.reduce(
        (sum, entry) => sum + (entry.dossier?.verificationSummary.verifiedItems ?? 0),
        0,
      );
      const needsReviewCount = chapterVersions.reduce(
        (sum, entry) =>
          sum + (entry.dossier?.verificationSummary.needsCorroborationItems ?? 0),
        0,
      );

      return {
        ...tab,
        summary: {
          status: getDossierStatus({
            versionNumber:
              generatedCount > 0 ? chapterVersions[0]?.version?.versionNumber ?? 1 : undefined,
            isCommitted: committedCount === tab.chapterKeys.length && tab.chapterKeys.length > 0,
            verifiedItems: verifiedItemCount,
            needsCorroborationItems: needsReviewCount,
          }),
          chapterCount: tab.chapterKeys.length,
          generatedCount,
          committedCount,
          verifiedSourceCount,
          verifiedItemCount,
          needsReviewCount,
          ideaCount: tab.ideaClips.length,
        },
      };
    });
    profiler.mark("tab_summaries_built", {
      tabCount: tabsWithSummary.length,
    });

    const selectedTabWithSummary =
      tabsWithSummary.find((tab) => tab.id === selectedTab?.id) ?? null;

    const stageMetadata = parseMetadataRecord(stage?.metadataJson);

    const result = {
      book,
      stage,
      outline,
      paragraphOutline,
      baseStoryReady: Boolean(baseStory),
      tabs: tabsWithSummary,
      selectedTab: selectedTabWithSummary,
      availableChapters: chapterSeeds,
      dossierEntries,
      invalidArtifactWarnings,
      progress: {
        totalChapters:
          typeof stageMetadata.totalChapters === "number"
            ? stageMetadata.totalChapters
            : chapterSeeds.length,
        completedChapters:
          typeof stageMetadata.completedChapters === "number"
            ? stageMetadata.completedChapters
            : tabsWithSummary.filter((tab) => tab.summary.generatedCount > 0).length,
        currentChapterKey:
          typeof stageMetadata.currentChapterKey === "string"
            ? stageMetadata.currentChapterKey
            : null,
        failedChapters: Array.isArray(stageMetadata.failedChapters)
          ? stageMetadata.failedChapters
          : [],
        provisionalChapters: Array.isArray(stageMetadata.provisionalChapters)
          ? stageMetadata.provisionalChapters
          : [],
        automationStatus:
          typeof stageMetadata.automationStatus === "string"
            ? stageMetadata.automationStatus
            : stage?.status === StageStatus.READY_FOR_REVIEW
              ? "ready_for_review"
              : "idle",
      },
    };

    profiler.mark("result_ready", {
      totalChapters: result.progress.totalChapters,
      completedChapters: result.progress.completedChapters,
      automationStatus: result.progress.automationStatus,
    });
    await profiler.flush("ok");
    return result;
  } catch (error) {
    await profiler.flush("error", {
      message: error instanceof Error ? error.message : "Unknown workspace error",
    });
    throw error;
  }
}

export async function runResearchBinderTabWorkflow(bookSlug: string, tabId: string) {
  const workspace = await getResearchWorkspace(bookSlug, tabId);

  if (!workspace.selectedTab) {
    throw new Error("No dossier tab is selected.");
  }

  for (const chapterKey of workspace.selectedTab.chapterKeys) {
    await runChapterResearchWorkflow(bookSlug, chapterKey);
  }

  return workspace.selectedTab.chapterKeys;
}

export async function commitResearchBinderTabWorkflow(bookSlug: string, tabId: string) {
  const workspace = await getResearchWorkspace(bookSlug, tabId);

  if (!workspace.selectedTab) {
    throw new Error("No dossier tab is selected.");
  }

  for (const chapterKey of workspace.selectedTab.chapterKeys) {
    await commitChapterResearchWorkflow(bookSlug, chapterKey);
  }

  return workspace.selectedTab.chapterKeys;
}

export async function addResearchBinderTabWorkflow(
  bookSlug: string,
  label: string,
  chapterKey?: string,
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return createResearchBinderTab(book.id, label, chapterKey ? [chapterKey] : []);
}

export async function renameResearchBinderTabWorkflow(
  bookSlug: string,
  tabId: string,
  label: string,
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return renameResearchBinderTab(book.id, tabId, label);
}

export async function archiveResearchBinderTabWorkflow(bookSlug: string, tabId: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return archiveResearchBinderTab(book.id, tabId);
}

export async function combineResearchBinderTabsWorkflow(
  bookSlug: string,
  sourceTabId: string,
  targetTabId: string,
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return combineResearchBinderTabs(book.id, sourceTabId, targetTabId);
}

export async function separateResearchBinderTabWorkflow(
  bookSlug: string,
  sourceTabId: string,
  chapterKey: string,
  newLabel: string,
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return separateResearchBinderTab(book.id, sourceTabId, chapterKey, newLabel);
}

export async function addResearchIdeaClipWorkflow(input: {
  bookSlug: string;
  tabId: string;
  chapterKey?: string;
  title?: string;
  content: string;
}) {
  const book = await getOrCreateBookBySlug(input.bookSlug);

  return createResearchIdeaClip({
    bookId: book.id,
    binderTabId: input.tabId,
    chapterKey: input.chapterKey,
    title: input.title,
    content: input.content,
  });
}

export async function deleteResearchIdeaClipWorkflow(bookSlug: string, ideaId: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return deleteResearchIdeaClip(book.id, ideaId);
}
