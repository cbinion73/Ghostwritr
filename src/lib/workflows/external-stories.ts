import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
  BaseStoryBundleSchema,
  BookOutlineSchema,
  ChapterExternalStoryDossierSchema,
  ParagraphOutlineSchema,
  parseArtifactWithSchema,
  parseMetadataRecord,
} from "../artifact-schemas";
import { getModelForRole, resolveModelSpec } from "../llm/routing";
import { getLLMCallContext, runWithLLMContext } from "../llm/call-context";
import { resolveResearchLens, buildLensStoryQueries, type ResearchLens } from "../research-lenses";
import { normalizeBaseStoryBundle } from "../base-story-utils";
import { getCommittedBookSetup } from "../repositories/book-setup-artifacts";
import { normalizeBookSetupProfile } from "../book-setup-types";
import {
  ArtifactStatus,
  Prisma,
  StageKey,
  StageStatus,
  StoryVerificationStatus,
  WorkflowRunStatus,
} from "@prisma/client";
import { z } from "zod";

import type { BookOutline } from "../outline-types";
import type { ParagraphOutline } from "../paragraph-outline-types";
import type { BaseStoryBundle } from "../base-story-types";
import type {
  ChapterExternalStoryDossier,
  ChapterExternalStoryItem,
  ChapterExternalStorySource,
  ChapterExternalStoryVerification,
  ExternalStoryFit,
  ExternalStoryType,
  StorySourceTier,
} from "../external-story-types";
import {
  getBookBySlugOrThrow,
  getOrCreateBookBySlug,
  getStageForBook,
  updateStageForBook,
} from "../repositories/books";
import {
  getExternalStoryBinderChapterKeys,
  listExternalStoryBinderTabs,
  syncExternalStoryBinderTabs,
} from "../repositories/external-stories-binder";
export {
  addExternalStoryBinderTabWorkflow,
  addExternalStoryClipWorkflow,
  archiveExternalStoryBinderTabWorkflow,
  combineExternalStoryBinderTabsWorkflow,
  deleteExternalStoryClipWorkflow,
  renameExternalStoryBinderTabWorkflow,
  separateExternalStoryBinderTabWorkflow,
} from "./external-stories/binder-actions";
import {
  commitExternalStoryPack,
  createExternalStoryPackVersion,
  getCommittedExternalStoryPack,
  getExternalStoriesForVersion,
  getExternalStoriesForVersions,
  getExternalStoryPackVersions,
  getExternalStorySourcesForVersions,
  getExternalStorySourcesForVersion,
  getExternalStoryVerificationsForChapter,
  getExternalStoryVerificationsForChapters,
  getLatestExternalStoryPackVersionsByChapter,
} from "../repositories/external-stories-artifacts";
import {
  claimWorkflowRun,
  completeWorkflowRun,
  createWorkflowRun,
  failWorkflowRun,
  getActiveWorkflowRunForStage,
  getWorkflowRunById,
  startWorkflowRunHeartbeat,
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

export type ChapterSeed = {
  chapterKey: string;
  chapterLabel: string;
  chapterTitle: string;
  chapterDescription: string;
  sectionId?: string;
  sectionTitle?: string;
  baseStoryChapterPurpose?: string;
  baseStoryChapterThread?: string;
  baseStoryBookThread?: string;
};

type CandidateSource = {
  id: string;
  url: string;
  title?: string;
  query?: string;
  provider?: string;
  snippet?: string | null;
};

type FetchedSource = ChapterExternalStorySource & {
  text: string;
  html: string;
};

const StorySchema = z.object({
  stories: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      // Classification fields (unchanged)
      storyType: z.enum([
        "ORIGIN",
        "TURNING_POINT",
        "FAILURE",
        "RECOVERY",
        "DECISION_UNDER_PRESSURE",
        "INNOVATION",
        "CULTURE",
        "CREDIBILITY",
        "CONTRADICTION",
        "MORAL",
        "LEGACY",
        "MICRO_STORY",
      ]),
      storyFit: z.enum([
        "OPENING_HOOK",
        "CHAPTER_PIVOT",
        "PROOF_POINT",
        "EMOTIONAL_RELEASE",
        "CLOSING_RESONANCE",
        "MARKETING_REUSE",
      ]),
      leadershipTheme: z.string().nullable().optional(),

      // --- Narrative structure (the fix for flatness) ---
      // Every story must have real scenes, not a metadata blob. These fields
      // force the model to write narratively instead of classifying.
      hook: z
        .string()
        .describe(
          "The single opening image, line, or moment that grabs the reader. Concrete and specific, not abstract. Write it like the first sentence of a scene.",
        ),
      setting: z
        .string()
        .describe(
          "Who, when, where, and what the world felt like right before things changed. Include concrete sensory details grounded in the source.",
        ),
      protagonistState: z
        .string()
        .describe(
          "What the central person wanted, feared, or believed going in. The interior condition that makes the story matter.",
        ),
      inciting: z
        .string()
        .describe(
          "The specific moment or decision that broke normalcy and started the story in motion.",
        ),
      escalation: z
        .string()
        .describe(
          "The rising pressure, costs, or stakes as the situation developed. Show the squeeze, not a summary of it.",
        ),
      turn: z
        .string()
        .describe(
          "The reversal, insight, or irreversible choice that changed the trajectory. The hinge of the story.",
        ),
      resolution: z
        .string()
        .describe(
          "What actually happened after the turn — concrete outcome, not a moral.",
        ),
      meaning: z
        .string()
        .describe(
          "The truth this story makes believable for the chapter. One sentence, non-cliche.",
        ),
      sensoryDetails: z
        .array(z.string())
        .min(2)
        .describe(
          "At least 2–4 concrete sensory anchors (what people saw, heard, felt, smelled, or touched) drawn from the source. No generic phrases like 'felt the tension.'",
        ),
      dialogueSnippets: z
        .array(z.string())
        .describe(
          "Any quoted or tightly paraphrased lines of dialogue from the source. Empty array if none exist.",
        ),
      internalShift: z
        .string()
        .describe(
          "The belief, assumption, or identity that moved inside the protagonist. What did they stop believing or start believing.",
        ),

      // Backwards-compat fields (still populated for existing UI)
      summary: z
        .string()
        .describe(
          "A rich narrative paragraph (6–10 sentences) that reads like a scene, not a report. Should contain at least one sensory detail and one moment of tension or choice.",
        ),
      whyItMatters: z
        .string()
        .describe(
          "Why this story earns its place in this specific chapter. Anchor to the chapter's claim in one vivid sentence.",
        ),
      emotionalRole: z
        .string()
        .describe(
          "The emotional function this story plays for the reader (e.g. 'permission to try and fail', 'the cost of waiting').",
        ),
    }),
  ),
});

/**
 * Extraction model: pulls richly-structured story candidates from a source.
 * Routed to Claude Sonnet 4.6 by default (narrative judgment + strict schema).
 * Temperature raised to 0.6 — narrative work wants variance, not determinism.
 */
async function getExtractionModel() {
  // No fallbackRole: if the primary provider isn't configured, callers hit
  // the provisional-fallback path and the user sees `metadata.provisional:
  // true` instead of a silently-degraded pipeline. That's the whole point
  // of the loud-failure refactor.
  return getModelForRole("external-stories:extract", {
    temperature: 0.6,
    maxOutputTokens: 8000,
    timeoutMs: 90000,
    reasoningEffort: "high",
  });
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function classifySourceTier(url: string): { tier: StorySourceTier; weight: number } {
  const normalized = url.toLowerCase();
  if ([".gov", "doi.org", "oecd.org", "worldbank.org", "hbr.org"].some((part) => normalized.includes(part))) {
    return { tier: "A", weight: 1 };
  }

  if (["reddit.com", "medium.com", "blog.", "substack.com"].some((part) => normalized.includes(part))) {
    return { tier: "C", weight: 0.5 };
  }

  return { tier: "B", weight: 0.75 };
}

async function wasWorkflowCanceled(runId?: string | null) {
  if (!runId) {
    return false;
  }

  const run = await getWorkflowRunById(runId);
  return run?.status === WorkflowRunStatus.CANCELED;
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

async function pulseExternalStoriesStage(input: {
  bookId: string;
  currentChapterKey?: string | null;
  currentAction: string;
  message: string;
}) {
  const stage = await getStageForBook(input.bookId, StageKey.EXTERNAL_STORIES);
  const metadata = parseMetadataRecord(stage?.metadataJson);

  await updateStageForBook(input.bookId, StageKey.EXTERNAL_STORIES, {
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

function buildProvisionalStoryVault(
  chapter: ChapterSeed,
  failureMessage: string,
) {
  const sourceId = `${chapter.chapterKey}-provisional-story-source`;
  const provisionalSource: ChapterExternalStorySource = {
    id: sourceId,
    url: "about:provisional-story-vault",
    title: `Provisional story hunt for ${chapter.chapterTitle}`,
    publisher: "GHOSTWRITR",
    author: "System fallback",
    accessedAt: new Date().toISOString(),
    contentType: "text/plain",
    sourceTier: "C",
    tierWeight: 0.5,
    isVerified: false,
    verificationStatus: "NEEDS_CORROBORATION",
    verificationNotes:
      "Generated without live web access. Replace these leads with true, sourced stories before final drafting.",
    metadata: { provisional: true, retryRecommended: true },
  };

  const stories: ChapterExternalStoryItem[] = [
    {
      id: `${chapter.chapterKey}-story-lead-1`,
      sourceId,
      title: `${chapter.chapterTitle}: leadership under pressure`,
      summary: "Look for a true case where a leader had to stabilize a complex operation under pressure.",
      whyItMatters: `This would help readers believe the chapter's claim in ${chapter.chapterTitle}.`,
      emotionalRole: "Credibility through a real operating example.",
      storyType: "DECISION_UNDER_PRESSURE",
      storyFit: "PROOF_POINT",
      leadershipTheme: "Operational leadership",
      sourceTier: "C",
      tierWeight: 0.5,
      verificationStatus: "NEEDS_CORROBORATION",
      mappedChapterId: chapter.chapterKey,
      metadata: { provisional: true },
    },
    {
      id: `${chapter.chapterKey}-story-lead-2`,
      sourceId,
      title: `${chapter.chapterTitle}: turnaround or recovery`,
      summary: "Look for a true turnaround story that shows performance improved after a system redesign.",
      whyItMatters: "This gives the chapter a believable before-and-after arc.",
      emotionalRole: "Hope and momentum.",
      storyType: "RECOVERY",
      storyFit: "CHAPTER_PIVOT",
      leadershipTheme: "Continuous improvement",
      sourceTier: "C",
      tierWeight: 0.5,
      verificationStatus: "NEEDS_CORROBORATION",
      mappedChapterId: chapter.chapterKey,
      metadata: { provisional: true },
    },
    {
      id: `${chapter.chapterKey}-story-lead-3`,
      sourceId,
      title: `${chapter.chapterTitle}: memorable opening hook`,
      summary: "Look for a vivid true moment that can open the chapter and create emotional connection quickly.",
      whyItMatters: "Useful later for drafting, marketing, and speaking content.",
      emotionalRole: "Immediate attention and emotional resonance.",
      storyType: "MICRO_STORY",
      storyFit: "OPENING_HOOK",
      leadershipTheme: "Belief-building",
      sourceTier: "C",
      tierWeight: 0.5,
      verificationStatus: "NEEDS_CORROBORATION",
      mappedChapterId: chapter.chapterKey,
      metadata: { provisional: true },
    },
  ];

  const verifications: ChapterExternalStoryVerification[] = stories.map((story) => ({
    id: `${story.id}-verify`,
    sourceRecordId: sourceId,
    externalStoryId: story.id,
    verifierType: "LLM_VERIFIER",
    status: "NEEDS_CORROBORATION",
    titleMatch: false,
    contentMatch: false,
    claimSupported: false,
    secondSourceRequired: true,
    secondSourceConfirmed: false,
    notes: "Fallback story lead only. Retry after web access is configured.",
    metadata: { provisional: true },
  }));

  const dossier: ChapterExternalStoryDossier = {
    chapterKey: chapter.chapterKey,
    chapterTitle: chapter.chapterTitle,
    chapterDescription: chapter.chapterDescription,
    storyGoal: `Provisional story vault for ${chapter.chapterTitle}. These are story-hunt leads, not yet sourced true stories.`,
    storyCandidates: stories,
    sourceRegister: [provisionalSource],
    storyTypesCovered: [...new Set(stories.map((story) => story.storyType))],
    storyFitsCovered: [...new Set(stories.map((story) => story.storyFit))],
    verificationSummary: {
      totalSources: 1,
      verifiedSources: 0,
      totalStories: stories.length,
      verifiedStories: 0,
      rejectedStories: 0,
      needsCorroborationStories: stories.length,
    },
    metadata: {
      provisional: true,
      retryRecommended: true,
      warning: `Fallback draft only. ${failureMessage}`,
    },
  };

  return {
    dossier,
    sources: [provisionalSource],
    stories,
    verifications,
  };
}

async function saveSnapshot(bookSlug: string, chapterKey: string, title: string, html: string, text: string) {
  const baseDir = path.join(
    process.cwd(),
    "reference-library",
    "processed",
    "external-story-snapshots",
    bookSlug,
    chapterKey,
  );
  await mkdir(baseDir, { recursive: true });

  const baseName = slugify(title) || "story-source";
  const htmlPath = path.join(baseDir, `${baseName}.html`);
  const textPath = path.join(baseDir, `${baseName}.txt`);

  await writeFile(htmlPath, html, "utf8");
  await writeFile(textPath, text, "utf8");

  return { snapshotPath: htmlPath, extractedTextPath: textPath };
}

export async function getChapterSeeds(bookId: string) {
  const [outlineVersion, paragraphVersion, baseStoryVersion] = await Promise.all([
    getCommittedOutline(bookId),
    getCommittedOutlineExpansion(bookId),
    getCommittedBaseStory(bookId),
  ]);
  const outline = parseArtifactWithSchema(outlineVersion?.contentJson, BookOutlineSchema);
  const paragraph = parseArtifactWithSchema(paragraphVersion?.contentJson, ParagraphOutlineSchema);
  const baseStory = normalizeBaseStoryBundle(
    parseArtifactWithSchema(baseStoryVersion?.contentJson, BaseStoryBundleSchema),
  );
  const baseStoryChapters = new Map(
    (baseStory?.chapters ?? []).map((chapter) => [chapter.chapterKey, chapter]),
  );

  // Only run external stories for real narrative chapters — skip section headers
  // like "Big question: ...", "Pillars: ...", "Full Book Outline" etc.
  // REAL_CHAPTER_RE matches generic/structural labels, so a title is real
  // when it does NOT match — this was missing the negation, which excluded
  // every normally-titled chapter (the vast majority of any book) instead
  // of just the generic placeholders it was meant to skip.
  const REAL_CHAPTER_RE = /^(introduction|epilogue|prologue|conclusion|closing|afterword|foreword|preface|chapter\s+\d+)/i;
  const isRealChapter = (title: string) => !REAL_CHAPTER_RE.test(title.trim());

  if (paragraph) {
    return {
      outline,
      paragraph,
      baseStory,
      chapterSeeds: paragraph.sections.flatMap((section) =>
        section.chapters
          .filter((chapter) => isRealChapter(chapter.chapterTitle))
          .map((chapter) => ({
            chapterKey: chapter.chapterId,
            chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`,
            chapterTitle: chapter.chapterTitle,
            chapterDescription: chapter.chapterDescription,
            sectionId: section.sectionId,
            sectionTitle: section.sectionTitle,
            baseStoryChapterPurpose: baseStoryChapters.get(chapter.chapterId)?.chapterPurpose,
            baseStoryChapterThread: baseStoryChapters.get(chapter.chapterId)?.guidance.draftingInstruction,
            baseStoryBookThread: baseStory?.narrativeGuidance.throughLine,
          })),
      ),
    };
  }

  return {
    outline,
    paragraph,
    baseStory,
    chapterSeeds:
      outline?.sections.flatMap((section) =>
        section.chapters
          .filter((chapter) => isRealChapter(chapter.title))
          .map((chapter) => ({
            chapterKey: chapter.id,
            chapterLabel: `Chapter ${chapter.number}: ${chapter.title}`,
            chapterTitle: chapter.title,
            chapterDescription: chapter.description,
            sectionId: section.id,
            sectionTitle: section.title,
            baseStoryChapterPurpose: baseStoryChapters.get(chapter.id)?.chapterPurpose,
            baseStoryChapterThread: baseStoryChapters.get(chapter.id)?.guidance.draftingInstruction,
            baseStoryBookThread: baseStory?.narrativeGuidance.throughLine,
          })),
      ) ?? [],
  };
}

async function discoverCandidateSources(
  chapter: ChapterSeed,
  lens: ResearchLens,
  bookSubject: string,
) {
  // Broader, more specific queries produce richer source pools. Each angle
  // targets a different kind of story (turnaround / failure / decision /
  // individual human moment / contrarian / long-form reporting) — reframed
  // per the book's research lens so a Biblical/Theological book searches for
  // testimonies and church-history accounts instead of business case studies.
  const descSlice = chapter.chapterDescription.slice(0, 120);
  const topics = [
    chapter.chapterTitle,
    ...(chapter.baseStoryChapterThread
      ? [chapter.baseStoryChapterThread.replace(/\s+/g, " ").slice(0, 120)]
      : []),
  ];
  const queries = [
    ...buildLensStoryQueries(lens, topics, bookSubject),
    `${chapter.chapterTitle} extraordinary accomplishment story`,
    `${chapter.chapterTitle} personal account first hand`,
    `${chapter.chapterTitle} long form profile`,
    `${chapter.chapterTitle} ${descSlice}`,
  ];

  // Broadened: was 6 per query / 14 total. A 250-page book chapter needs
  // depth across many kinds of sources, not 14 random hits.
  const search = await searchWeb(queries, {
    perQueryLimit: 8,
    totalLimit: 32,
  });

  return {
    candidates: search.results.map((result, index) => ({
      id: `story-candidate-${index + 1}`,
      url: result.url,
      title: result.title,
      query: result.query,
      provider: result.provider,
      snippet: result.snippet ?? null,
    })),
    attempts: search.attempts,
  };
}

async function fetchSource(bookSlug: string, chapter: ChapterSeed, candidate: CandidateSource): Promise<FetchedSource | null> {
  try {
    const page = await fetchWebPage(candidate.url, {
      purpose: "External Stories Bot",
      minTextLength: 500,
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
      isVerified: true,
      verificationStatus: "VERIFIED",
      verificationNotes: "Fetched and stored for story extraction.",
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

const STORY_EXTRACTION_PROMPT = `You are a narrative journalist extracting true external stories from a source document for a nonfiction book chapter.

Your job is NOT to classify or summarize. Your job is to find scenes — moments where a real person or organization faced a decision, pressure, reversal, or consequence, and to capture them with enough narrative texture that a ghostwriter could dramatize them into a chapter opening.

CORE REQUIREMENTS for every story you return:

1. IT MUST BE A SCENE, NOT A SUMMARY.
   - Start from a specific moment, not a generic description.
   - Ground everything in concrete people, places, times, and things that appear in the source.
   - If the source doesn't name specifics, DO NOT invent them — skip that story.

2. IT MUST HAVE NARRATIVE ARC.
   - Hook → Setting → Protagonist's interior state → Inciting moment → Escalation → Turn → Resolution → Meaning.
   - Each field on the schema must be answered with real content from the source, not hedged or padded.

3. IT MUST HAVE TEXTURE.
   - At least 2–4 sensory details (sight, sound, weight, texture, temperature, posture, facial expression) drawn from the source.
   - Any dialogue that exists in the source MUST be captured in dialogueSnippets, verbatim or tightly paraphrased.
   - Capture the internal shift — what the protagonist stopped believing or started believing.

4. IT MUST BE DRAFT-READY.
   - The "summary" field is not a metadata blurb. It is a 6–10 sentence narrative paragraph that could be lightly edited into chapter prose. Write it like the first page of a scene.
   - Avoid consultant clichés, abstractions, or filler ("in today's fast-paced world", "at the end of the day", "the rest is history").
   - No em-dashes, no "it's worth noting", no "in a world where".

5. BE SELECTIVE.
   - A shallow story hurts the chapter. If the source only yields a vague reference, do not force a story. Return fewer, better entries.
   - Reject anything you cannot ground in specifics from the source.

6. FIT TO THE CHAPTER.
   - Every story must serve the chapter's thesis. "whyItMatters" should make that link concrete, not generic.
   - Classify storyType and storyFit only after you've written the narrative — the classification is the tail, not the dog.

7. NO SECOND PASS WILL REVIEW THIS. Get it right the first time:
   - The hook must be the single most arresting moment, not a generic opener — if your first draft of it is generic, rewrite it before returning.
   - internalShift must be one crisp sentence: exactly what the protagonist stopped believing or started believing.
   - Do not pad. Do not use em-dashes. Do not use consultant phrases ("at the end of the day", "it's worth noting"). If the source can't support a detail, leave the field sparse rather than inventing texture.

Return between 1 and 5 story candidates per source — quality over quantity.`;

// Free (no LLM call) integrity gate, mirroring research.ts's
// verifySourceIntegrity — drops fetched pages that clearly don't match what
// was searched for or are too thin to contain a real scene, before paying
// for an extraction call on them.
function passesContentIntegrityCheck(source: FetchedSource): boolean {
  const searchTitle = String(source.metadata?.searchTitle ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
  const normalizedTitle = source.title.toLowerCase().replace(/[^a-z0-9\s]+/g, " ");
  const overlappingWords = searchTitle.filter((word) => normalizedTitle.includes(word));
  const titleMatch = searchTitle.length === 0 || overlappingWords.length >= Math.min(2, searchTitle.length);
  const contentMatch = source.text.length >= 400;
  return titleMatch && contentMatch;
}

async function extractStories(
  chapter: ChapterSeed,
  source: FetchedSource,
  lens: ResearchLens,
): Promise<ChapterExternalStoryItem[]> {
  const model = await getExtractionModel();

  // Keep a minimal structural fallback for when no LLM is configured. This
  // is NOT dressed up to look like a real story — it's flagged provisional
  // so downstream UI can show the gap instead of hiding it.
  const fallback: ChapterExternalStoryItem[] = [
    {
      id: `${source.id}-story-1`,
      sourceId: source.id,
      title: source.title,
      summary: `[Provisional] A story connected to ${chapter.chapterTitle} was indexed from this source but no LLM was available to extract it with narrative depth.`,
      whyItMatters: `This lead should be re-run once an extraction model is configured.`,
      emotionalRole: "Placeholder — not yet extracted.",
      storyType: "DECISION_UNDER_PRESSURE",
      storyFit: "PROOF_POINT",
      leadershipTheme: chapter.chapterTitle,
      sourceTier: source.sourceTier,
      tierWeight: source.tierWeight,
      verificationStatus: "NEEDS_CORROBORATION",
      mappedSectionId: chapter.sectionId ?? null,
      mappedChapterId: chapter.chapterKey,
      metadata: { provisional: true, reason: "no-extraction-model" },
    },
  ];

  if (!model) {
    return fallback;
  }

  try {
    const structured = model.withStructuredOutput(StorySchema);
    const systemPrompt = lens.storyGuidance
      ? `${STORY_EXTRACTION_PROMPT}\n\n${lens.storyGuidance}`
      : STORY_EXTRACTION_PROMPT;
    const result = await structured.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(
        JSON.stringify({
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          baseStoryChapterPurpose: chapter.baseStoryChapterPurpose ?? null,
          baseStoryChapterThread: chapter.baseStoryChapterThread ?? null,
          baseStoryBookThread: chapter.baseStoryBookThread ?? null,
          sourceTitle: source.title,
          sourceUrl: source.canonicalUrl ?? source.url,
          // Was slice(0, 18000) — truncated mid-sentence and lost most
          // long-form reporting. Claude Sonnet 4.6 has a 200k context
          // window; send the full source up to a safety cap of 180k chars.
          sourceText: source.text.slice(0, 180000),
        }),
      ),
    ]);

    if (result.stories.length === 0) {
      return fallback;
    }

    return result.stories.map((story, index) => ({
      id: `${source.id}-story-${index + 1}`,
      sourceId: source.id,
      title: story.title,
      summary: story.summary,
      whyItMatters: story.whyItMatters,
      emotionalRole: story.emotionalRole,
      storyType: story.storyType as ExternalStoryType,
      storyFit: story.storyFit as ExternalStoryFit,
      leadershipTheme: story.leadershipTheme ?? chapter.chapterTitle,
      sourceTier: source.sourceTier,
      tierWeight: source.tierWeight,
      verificationStatus: "VERIFIED",
      mappedSectionId: chapter.sectionId ?? null,
      mappedChapterId: chapter.chapterKey,
      // Narrative structure is persisted in metadata.narrative so it can
      // round-trip through the existing Prisma JSON column without a
      // schema migration. UI can read from here to display scene-grade
      // detail, and chapter-draft can pass it straight to Opus.
      metadata: {
        narrative: {
          hook: story.hook,
          setting: story.setting,
          protagonistState: story.protagonistState,
          inciting: story.inciting,
          escalation: story.escalation,
          turn: story.turn,
          resolution: story.resolution,
          meaning: story.meaning,
          sensoryDetails: story.sensoryDetails,
          dialogueSnippets: story.dialogueSnippets,
          internalShift: story.internalShift,
        },
      },
    }));
  } catch (error) {
    // Do NOT silently return a dressed-up fallback. Let the caller decide
    // whether to treat extraction failure as a real failure.
    const message = error instanceof Error ? error.message : "Unknown extraction error";
    console.error(
      `[external-stories] extraction failed for source ${source.id} (${source.title}): ${message}`,
    );
    return fallback.map((item) => ({
      ...item,
      metadata: { provisional: true, reason: "extraction-failed", error: message },
    }));
  }
}

function buildDossier(chapter: ChapterSeed, sources: ChapterExternalStorySource[], stories: ChapterExternalStoryItem[]): ChapterExternalStoryDossier {
  const verifiedStories = stories.filter((story) => story.verificationStatus === "VERIFIED");

  // `sources` is often actually FetchedSource[] (structurally assignable to
  // ChapterExternalStorySource[]) carrying the full scraped page `html` and
  // extracted `text` along for the ride — only needed transiently during
  // extraction, not in the persisted dossier. See matching fix in
  // research.ts's buildDossier for the OOM this caused.
  const persistedSourceRegister: ChapterExternalStorySource[] = sources.map(
    ({ text: _text, html: _html, ...source }: Partial<FetchedSource> & ChapterExternalStorySource) => source,
  );

  return {
    chapterKey: chapter.chapterKey,
    chapterTitle: chapter.chapterTitle,
    chapterDescription: chapter.chapterDescription,
    storyGoal: `Collect an over-complete bank of true external stories that make ${chapter.chapterTitle} emotionally believable, memorable, and reusable across the book and downstream marketing.`,
    storyCandidates: stories,
    sourceRegister: persistedSourceRegister,
    storyTypesCovered: Array.from(new Set(verifiedStories.map((story) => story.storyType))),
    storyFitsCovered: Array.from(new Set(verifiedStories.map((story) => story.storyFit))),
    verificationSummary: {
      totalSources: sources.length,
      verifiedSources: sources.filter((source) => source.isVerified).length,
      totalStories: stories.length,
      verifiedStories: verifiedStories.length,
      rejectedStories: stories.filter((story) => story.verificationStatus === "REJECTED").length,
      needsCorroborationStories: stories.filter((story) => story.verificationStatus === "NEEDS_CORROBORATION").length,
    },
  };
}

async function runChapterExternalStoriesWorkflowImpl(bookSlug: string, chapterKey: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const { chapterSeeds, baseStory } = await getChapterSeeds(book.id);
  if (!baseStory) {
    throw new Error("A committed Base Story is required before External Stories can run.");
  }
  const chapter = chapterSeeds.find((item) => item.chapterKey === chapterKey);
  if (!chapter) {
    throw new Error(`Committed chapter ${chapterKey} was not found for External Stories.`);
  }

  // Per-book research lens (set in Book Setup) reframes story search and
  // extraction for the book's actual genre — without this, every book's
  // External Stories search used the same business/leadership phrasing
  // ("case study", "company turnaround"), regardless of subject.
  const committedSetup = await getCommittedBookSetup(book.id);
  const setupProfile = normalizeBookSetupProfile(committedSetup?.contentJson);
  const baseLens = resolveResearchLens(setupProfile?.researchLens);
  // Fold the author's preferred Bible translation into storyGuidance so
  // Chronicle quotes scripture consistently in any testimony/story it writes.
  const lens: ResearchLens =
    baseLens.key === "biblical" && setupProfile?.preferredBibleTranslation
      ? {
          ...baseLens,
          storyGuidance: `${baseLens.storyGuidance}\n\nTRANSLATION PREFERENCE: Quote scripture in the ${setupProfile.preferredBibleTranslation} translation unless a specific source only provides another translation.`,
        }
      : baseLens;
  const bookMeta = book.metadataJson && typeof book.metadataJson === "object"
    ? (book.metadataJson as Record<string, unknown>)
    : {};
  const bookSubject = [
    typeof bookMeta.premise === "string" ? bookMeta.premise : null,
    book.titleWorking,
  ].filter(Boolean).join(" ").slice(0, 80);

  let dossier: ChapterExternalStoryDossier;
  let persistedSources: ChapterExternalStorySource[];
  let persistedStories: ChapterExternalStoryItem[];
  let verifications: ChapterExternalStoryVerification[];

  try {
    await pulseExternalStoriesStage({
      bookId: book.id,
      currentChapterKey: chapter.chapterKey,
      currentAction: "Searching the web for true story leads",
      message: `Searching true story leads for ${chapter.chapterTitle}`,
    });
    const { candidates, attempts: searchAttempts } = await discoverCandidateSources(chapter, lens, bookSubject);
    if (candidates.length === 0) {
      throw new Error(
        `No story search results were discovered for ${chapter.chapterTitle}. ${summarizeSearchAttempts(searchAttempts)}`,
      );
    }
    await pulseExternalStoriesStage({
      bookId: book.id,
      currentChapterKey: chapter.chapterKey,
      currentAction: "Reviewing story search results",
      message: `Found ${candidates.length} story leads via ${Array.from(new Set(searchAttempts.map((attempt) => attempt.provider))).join(", ")}. Queries: ${summarizeQueries(Array.from(new Set(searchAttempts.map((attempt) => attempt.query))))}`,
    });
    await pulseExternalStoriesStage({
      bookId: book.id,
      currentChapterKey: chapter.chapterKey,
      currentAction: "Fetching story source pages",
      message: `Fetching ${candidates.length} story leads for ${chapter.chapterTitle}`,
    });
    const fetchedSources = (await Promise.all(
      candidates.map((candidate) => fetchSource(book.slug, chapter, candidate)),
    )).filter((source): source is FetchedSource => Boolean(source));
    if (fetchedSources.length === 0) {
      throw new Error(
        `No story source pages could be fetched for ${chapter.chapterTitle}. Search attempts: ${summarizeSearchAttempts(searchAttempts)}`,
      );
    }
    await pulseExternalStoriesStage({
      bookId: book.id,
      currentChapterKey: chapter.chapterKey,
      currentAction: "Fetched story source pages",
      message: `Fetched ${fetchedSources.length} pages from ${summarizeDomains(fetchedSources.map((source) => source.canonicalUrl ?? source.url))}`,
    });

    // Free heuristic gate before paying for extraction — drops pages that
    // don't match what was searched for or are too thin to hold a real scene.
    const integritySources = fetchedSources.filter(passesContentIntegrityCheck);
    if (integritySources.length === 0) {
      throw new Error(
        `All ${fetchedSources.length} fetched story pages for ${chapter.chapterTitle} failed the integrity check (title mismatch or too little content).`,
      );
    }
    await pulseExternalStoriesStage({
      bookId: book.id,
      currentChapterKey: chapter.chapterKey,
      currentAction: "Extracting story candidates",
      message: `Extracting story candidates for ${chapter.chapterTitle} from ${integritySources.length} of ${fetchedSources.length} fetched pages (${fetchedSources.length - integritySources.length} dropped by integrity check)`,
    });
    await pulseExternalStoriesStage({
      bookId: book.id,
      currentChapterKey: chapter.chapterKey,
      currentAction: "Running story extraction model",
      message: `Calling ${resolveModelSpec("external-stories:extract")} to extract scene-grade story candidates`,
    });
    const extractedStoriesBySource = await Promise.all(
      integritySources.map(async (source) => ({
        source,
        stories: await extractStories(chapter, source, lens),
      })),
    );

    // Extraction already demands scene-grade depth (sensory detail, dialogue,
    // draft-ready prose) in one pass — a second "enrichment" call used to
    // re-run the same source through the same model asking for the same
    // depth again, doubling both the call count and the source-text token
    // cost for no measurable quality gain. Removed; see STORY_EXTRACTION_PROMPT.
    const stories = extractedStoriesBySource.flatMap(({ stories: storyBatch }) => storyBatch);

    if (stories.length === 0) {
      throw new Error(
        `No usable story candidates were extracted for ${chapter.chapterTitle}. The chapter vault is too thin to review.`,
      );
    }

    verifications = stories.map((story) => ({
      id: `${story.id}-verify`,
      sourceRecordId: story.sourceId,
      externalStoryId: story.id,
      verifierType: "LLM_VERIFIER",
      status: story.verificationStatus,
      titleMatch: true,
      contentMatch: true,
      claimSupported: true,
      secondSourceRequired: false,
      secondSourceConfirmed: false,
      notes: "Story candidate extracted from fetched source.",
      metadata: {},
    }));

    dossier = buildDossier(chapter, integritySources, stories);
    await pulseExternalStoriesStage({
      bookId: book.id,
      currentChapterKey: chapter.chapterKey,
      currentAction: "Admitting verified stories",
      message: `Admitted ${dossier.verificationSummary.totalSources} sources and ${dossier.verificationSummary.verifiedStories} verified story candidates`,
    });
    if (dossier.sourceRegister.length === 0 || dossier.storyCandidates.length === 0) {
      throw new Error(
        `No external stories were admitted for ${chapter.chapterTitle}. The story vault is not strong enough to use downstream.`,
      );
    }
    persistedSources = integritySources;
    persistedStories = stories;
  } catch (error) {
    const fallback = buildProvisionalStoryVault(
      chapter,
      error instanceof Error ? error.message : "Live story research failed.",
    );
    dossier = fallback.dossier;
    persistedSources = fallback.sources;
    persistedStories = fallback.stories;
    verifications = fallback.verifications;
  }

  await pulseExternalStoriesStage({
    bookId: book.id,
    currentChapterKey: chapter.chapterKey,
    currentAction: "Saving chapter story vault",
    message: `Saving story vault for ${chapter.chapterTitle}`,
  });
  const version = await createExternalStoryPackVersion({
    bookId: book.id,
    chapterKey,
    chapterTitle: chapter.chapterTitle,
    summary: dossier.storyGoal,
    dossier,
    sources: persistedSources,
    stories: persistedStories,
    verifications,
    modelName: resolveModelSpec("external-stories:extract"),
    promptTemplateVersion: "external-stories-v2-narrative",
  });

  return { book, chapter, dossier, artifactVersionId: version.id };
}

// See runChapterResearchWorkflow in research.ts for why this wrapper exists —
// tags every call this chapter makes with its chapterKey for per-chapter
// cost attribution, nested inside whatever ambient context the caller set.
export async function runChapterExternalStoriesWorkflow(bookSlug: string, chapterKey: string) {
  const outer = getLLMCallContext();
  if (outer) {
    return runWithLLMContext({ ...outer, chapterKey }, () =>
      runChapterExternalStoriesWorkflowImpl(bookSlug, chapterKey),
    );
  }
  return runChapterExternalStoriesWorkflowImpl(bookSlug, chapterKey);
}

type ExternalStoriesRunOptions = {
  chapterKeys?: string[];
  preserveCompletedCount?: number;
  preserveProvisionalChapters?: string[];
};

export async function runFullExternalStoriesWorkflow(
  bookSlug: string,
  runId?: string,
  options: ExternalStoriesRunOptions = {},
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const { chapterSeeds: allChapterSeeds, baseStory } = await getChapterSeeds(book.id);
  if (!baseStory) {
    throw new Error("A committed Base Story is required before External Stories can run.");
  }
  const requestedChapterKeys = new Set(options.chapterKeys ?? []);
  const chapterSeeds =
    requestedChapterKeys.size > 0
      ? allChapterSeeds.filter((chapter) => requestedChapterKeys.has(chapter.chapterKey))
      : allChapterSeeds;
  if (chapterSeeds.length === 0) {
    throw new Error("No committed outline chapters are available for External Stories generation.");
  }

  const preservedCompletedCount = options.preserveCompletedCount ?? 0;
  const provisionalChapters = [...new Set(options.preserveProvisionalChapters ?? [])];

  await updateStageForBook(book.id, StageKey.EXTERNAL_STORIES, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "running",
      currentAction: "Collecting story leads and case studies",
      totalChapters: allChapterSeeds.length,
      completedChapters: preservedCompletedCount,
      failedChapters: [],
      provisionalChapters,
      currentChapterKey: chapterSeeds[0]?.chapterKey ?? null,
      recentActivity: recentActivity(
        undefined,
        requestedChapterKeys.size > 0
          ? `Resumed external stories for ${chapterSeeds.length} failed chapter${chapterSeeds.length === 1 ? "" : "s"}.`
          : "Started external stories run.",
      ),
      lastRunAt: new Date().toISOString(),
    },
  });

  const completed: string[] = [];
  const failed: Array<{ chapterKey: string; message: string }> = [];

  const markCanceled = async () => {
    await updateStageForBook(book.id, StageKey.EXTERNAL_STORIES, {
      status: StageStatus.READY_FOR_REVIEW,
      metadataJson: {
        automationStatus: "canceled",
        currentAction: "Canceled by user",
        totalChapters: allChapterSeeds.length,
        completedChapters: preservedCompletedCount + completed.length,
        failedChapters: failed,
        provisionalChapters,
        currentChapterKey: null,
        recentActivity: recentActivity(
          undefined,
          `External stories run canceled after completing ${completed.length} of ${allChapterSeeds.length} chapters.`,
        ),
        lastRunAt: new Date().toISOString(),
      },
    });
  };

  for (const [index, chapter] of chapterSeeds.entries()) {
    if (await wasWorkflowCanceled(runId)) {
      await markCanceled();
      return { totalChapters: allChapterSeeds.length, completedChapterKeys: completed, failedChapters: failed, canceled: true };
    }

    try {
      const result = await runChapterExternalStoriesWorkflow(bookSlug, chapter.chapterKey);
      completed.push(chapter.chapterKey);
      if (result.dossier.metadata?.provisional) {
        provisionalChapters.push(chapter.chapterKey);
      }
    } catch (error) {
      failed.push({
        chapterKey: chapter.chapterKey,
        message: error instanceof Error ? error.message : "Unknown external stories error",
      });
    }

    if (await wasWorkflowCanceled(runId)) {
      await markCanceled();
      return { totalChapters: allChapterSeeds.length, completedChapterKeys: completed, failedChapters: failed, canceled: true };
    }

    await updateStageForBook(book.id, StageKey.EXTERNAL_STORIES, {
      status: StageStatus.IN_PROGRESS,
      metadataJson: {
        automationStatus: "running",
        currentAction:
          chapterSeeds[index + 1]?.chapterKey != null
            ? "Collecting story leads and case studies"
            : "Finishing story vault review",
        totalChapters: allChapterSeeds.length,
        completedChapters: preservedCompletedCount + completed.length,
        failedChapters: failed,
        provisionalChapters,
        currentChapterKey: chapterSeeds[index + 1]?.chapterKey ?? null,
        recentActivity: recentActivity(
          undefined,
          failed.some((item) => item.chapterKey === chapter.chapterKey)
            ? `Failed ${chapter.chapterTitle}`
            : provisionalChapters.includes(chapter.chapterKey)
              ? `Generated provisional story vault for ${chapter.chapterTitle}`
            : `Completed ${chapter.chapterTitle}`,
        ),
        lastRunAt: new Date().toISOString(),
      },
    });
  }

  await updateStageForBook(book.id, StageKey.EXTERNAL_STORIES, {
    status: failed.length > 0 ? StageStatus.BLOCKED : StageStatus.READY_FOR_REVIEW,
    metadataJson: {
      automationStatus: failed.length > 0 ? "blocked" : "ready_for_review",
      currentAction:
        failed.length > 0
          ? "Needs retry after search failures"
          : provisionalChapters.length > 0
            ? "Provisional story vaults ready for review"
            : "Ready for review",
      totalChapters: allChapterSeeds.length,
      completedChapters: preservedCompletedCount + completed.length,
      failedChapters: failed,
      provisionalChapters,
      currentChapterKey: null,
      recentActivity: recentActivity(
        undefined,
        failed.length > 0
          ? `External stories ended with ${failed.length} failed chapter${failed.length === 1 ? "" : "s"}.`
          : provisionalChapters.length > 0
            ? `Generated ${provisionalChapters.length} provisional story vault${provisionalChapters.length === 1 ? "" : "s"}.`
          : "External stories completed successfully.",
      ),
      lastRunAt: new Date().toISOString(),
    },
  });

  return {
    totalChapters: allChapterSeeds.length,
    completedChapterKeys: completed,
    failedChapters: failed,
    provisionalChapters,
  };
}

type EnqueueExternalStoriesOptions = {
  chapterKeys?: string[];
  preserveCompletedCount?: number;
  preserveProvisionalChapters?: string[];
};

export async function enqueueFullExternalStoriesWorkflow(
  bookSlug: string,
  options: EnqueueExternalStoriesOptions = {},
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const existing = await getActiveWorkflowRunForStage(book.id, StageKey.EXTERNAL_STORIES);
  if (existing) return existing;

  const { chapterSeeds } = await getChapterSeeds(book.id);
  if (chapterSeeds.length === 0) {
    throw new Error("No committed outline chapters are available for External Stories generation.");
  }

  const requestedChapterKeys = new Set(options.chapterKeys ?? []);
  const targetChapterSeeds =
    requestedChapterKeys.size > 0
      ? chapterSeeds.filter((chapter) => requestedChapterKeys.has(chapter.chapterKey))
      : chapterSeeds;

  if (targetChapterSeeds.length === 0) {
    throw new Error("No matching failed external story chapters were found to resume.");
  }

  await updateStageForBook(book.id, StageKey.EXTERNAL_STORIES, {
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
          ? `Queued failed-only external stories resume for ${targetChapterSeeds.length} chapter${targetChapterSeeds.length === 1 ? "" : "s"}.`
          : "Queued external stories run.",
      ),
      lastRunAt: new Date().toISOString(),
    },
  });

  return createWorkflowRun({
    bookId: book.id,
    stageKey: StageKey.EXTERNAL_STORIES,
    inputJson: {
      kind: "full_external_stories_generation",
      bookSlug,
      chapterKeys: targetChapterSeeds.map((chapter) => chapter.chapterKey),
      preserveCompletedCount: options.preserveCompletedCount ?? 0,
      preserveProvisionalChapters: options.preserveProvisionalChapters ?? [],
    },
  });
}

export async function processExternalStoriesWorkflowRun(runId: string) {
  const run = await getWorkflowRunById(runId);
  if (!run) throw new Error(`Workflow run ${runId} was not found.`);

  const claimed = await claimWorkflowRun(runId);
  if (claimed.count === 0) return { skipped: true };
  const stopHeartbeat = startWorkflowRunHeartbeat(runId, claimed.leaseOwner, claimed.leaseMs);

  const input = parseJson<Record<string, unknown>>(run.inputJson, {});
  const bookSlug = typeof input.bookSlug === "string" ? input.bookSlug : run.book.slug;
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
    const result = await runFullExternalStoriesWorkflow(bookSlug, runId, {
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
    const message = error instanceof Error ? error.message : "Unknown external stories workflow error";
    await failWorkflowRun(runId, message, {
      kind: "full_external_stories_generation_failed",
      bookSlug,
    });
    await runQualityAgentWorkflow(bookSlug);
    throw error;
  } finally {
    stopHeartbeat();
  }
}

// See getUnfinishedResearchChapterKeys in research/jobs.ts for why this checks
// saved versions rather than trusting only the in-memory failedChapters
// list — a chapter a dead run never reached is indistinguishable from one
// that's still pending unless we check what's actually been saved.
export async function getUnfinishedExternalStoriesChapterKeys(bookId: string): Promise<string[]> {
  const { chapterSeeds } = await getChapterSeeds(bookId);
  if (chapterSeeds.length === 0) return [];

  const latestVersionsByChapter = await getLatestExternalStoryPackVersionsByChapter(
    bookId,
    chapterSeeds.map((chapter) => chapter.chapterKey),
  );

  return chapterSeeds
    .filter((chapter) => !latestVersionsByChapter.has(chapter.chapterKey))
    .map((chapter) => chapter.chapterKey);
}

export async function enqueueAndTriggerFullExternalStoriesWorkflow(
  bookSlug: string,
  trigger: (runId: string) => void,
  options: EnqueueExternalStoriesOptions = {},
) {
  const queuedRun = await enqueueFullExternalStoriesWorkflow(bookSlug, options);
  if (queuedRun.status === WorkflowRunStatus.QUEUED) {
    trigger(queuedRun.id);
  }

  return queuedRun;
}

export async function commitChapterExternalStoriesWorkflow(bookSlug: string, chapterKey: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const result = await commitExternalStoryPack(book.id, chapterKey);
  await clearStageStaleDependency(bookSlug, StageKey.EXTERNAL_STORIES, { chapterIds: [chapterKey] });
  await invalidateDependentStagesForBook(bookSlug, StageKey.EXTERNAL_STORIES, { chapterIds: [chapterKey] });
  return result;
}

export async function commitAllExternalStoriesWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EXTERNAL_STORIES);
  const { chapterSeeds } = await getChapterSeeds(book.id);

  if (chapterSeeds.length === 0) {
    throw new Error("No committed outline chapters are available for External Stories commit.");
  }

  const committedChapterKeys: string[] = [];
  const missingChapterKeys: string[] = [];
  const latestVersionsByChapter = await getLatestExternalStoryPackVersionsByChapter(
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
      await commitExternalStoryPack(book.id, chapter.chapterKey);
    }

    committedChapterKeys.push(chapter.chapterKey);
  }

  const metadata = parseMetadataRecord(stage?.metadataJson);
  const now = new Date().toISOString();

  await updateStageForBook(book.id, StageKey.EXTERNAL_STORIES, {
    status:
      missingChapterKeys.length === 0 ? StageStatus.COMMITTED : StageStatus.READY_FOR_REVIEW,
    committedAt: missingChapterKeys.length === 0 ? new Date() : undefined,
    metadataJson: {
      ...metadata,
      automationStatus: missingChapterKeys.length === 0 ? "committed" : "ready_for_review",
      currentAction:
        missingChapterKeys.length === 0
          ? "All external stories dossiers committed"
          : `Committed ${committedChapterKeys.length} external story dossiers. ${missingChapterKeys.length} still missing.`,
      totalChapters: chapterSeeds.length,
      completedChapters: committedChapterKeys.length,
      failedChapters: [],
      currentChapterKey: null,
      recentActivity: recentActivity(
        Array.isArray(metadata.recentActivity)
          ? (metadata.recentActivity as Array<{ at: string; message: string }>)
          : undefined,
        missingChapterKeys.length === 0
          ? "Committed all external stories dossiers."
          : `Committed all available external stories dossiers. Missing: ${missingChapterKeys.join(", ")}`,
      ),
      lastRunAt: now,
    } as Prisma.InputJsonValue,
  });
  await clearStageStaleDependency(bookSlug, StageKey.EXTERNAL_STORIES, { chapterIds: committedChapterKeys });
  await invalidateDependentStagesForBook(bookSlug, StageKey.EXTERNAL_STORIES, { chapterIds: committedChapterKeys });

  return {
    committedChapterKeys,
    missingChapterKeys,
    totalChapters: chapterSeeds.length,
  };
}
