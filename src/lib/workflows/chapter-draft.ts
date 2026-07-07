import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  ArtifactStatus,
  ArtifactType,
  Prisma,
  StageKey,
  StageStatus,
  WorkflowRunStatus,
} from "@prisma/client";
import { z } from "zod";

import { resolveResearchLens } from "../research-lenses";

import {
  BaseStoryBundleSchema,
  BookSetupProfileSchema,
  ChapterDraftBundleSchema,
  ChapterReviewBundleSchema,
  ParagraphOutlineSchema,
  PromiseBriefSchema,
  parseArtifactWithSchema,
  parseMetadataRecord,
} from "../artifact-schemas";
import { db } from "../db";
import { getCraftNotes } from "../craft-ledger";
import { getModelForRole } from "../llm/routing";
import { buildCachedSystemBlocks } from "../llm/providers";
import type { BaseStoryBundle, BaseStoryChapter } from "../base-story-types";
import type { BookSetupProfile, WriterPersonaBlend } from "../book-setup-types";
import { CANONICAL_PERSONAS } from "../personas";
import type { FrameworkStep } from "../personas";
import type {
  ChapterDraftBundle,
  ChapterDraftParagraph,
  ChapterReviewBundle,
} from "../chapter-draft-types";
import type { ChapterExternalStoryDossier, ChapterExternalStoryItem } from "../external-story-types";
import type { ParagraphOutline, SectionParagraphPlan, ChapterParagraphPlan } from "../paragraph-outline-types";
import type { PersonalStoryEncyclopedia } from "../personal-story-types";
import type { PromiseBrief } from "../promise-types";
import type { ChapterResearchDossier, ChapterResearchItem } from "../research-types";
import { normalizeBaseStoryBundle } from "../base-story-utils";
import { countWords, estimatePagesFromWords, toPercent } from "../manuscript-metrics";
import { clearStageStaleDependency, invalidateDependentStagesForBook } from "../workflow-dependencies";
import {
  getBookBySlugOrThrow,
  getStageForBook,
  updateStageForBook,
} from "../repositories/books";
import { getCommittedBookSetup } from "../repositories/book-setup-artifacts";
import {
  commitChapterDraft,
  createChapterArtifactVersion,
  getChapterArtifactVersions,
} from "../repositories/chapter-draft-artifacts";
import { getCommittedBaseStory } from "../repositories/base-story-artifacts";
import {
  buildResearchDossierFromStructuredRows,
  buildExternalStoryDossierFromStructuredRows,
} from "../repositories/structured-dossiers";
import {
  getCommittedExternalStoryPack,
  getExternalStoryPackVersions,
} from "../repositories/external-stories-artifacts";
import {
  getCommittedOutlineExpansion,
} from "../repositories/outline-artifacts";
import {
  getCommittedPersonalStoryEncyclopedia,
} from "../repositories/personal-stories-artifacts";
import { getCommittedPromiseBrief } from "../repositories/promise-artifacts";
import {
  getCommittedResearchPack,
} from "../repositories/research-artifacts";
import {
  claimWorkflowRun,
  completeWorkflowRun,
  createWorkflowRun,
  failWorkflowRun,
  getActiveWorkflowRunForStage,
  getWorkflowRunById,
} from "../repositories/workflow-runs";

type ChapterContext = {
  section: SectionParagraphPlan;
  chapter: ChapterParagraphPlan;
  /** This chapter's section of the committed Chapter Manifest (pattern/arc/
   * source-assignment guidance), when one exists. */
  manifestGuidance?: string | null;
  /** Book-level craft ledger — the author's accumulated revision feedback,
   * injected into every draft/revise call so it persists across chapters. */
  craftNotes?: string[];
};

type ChapterWordTarget = {
  chapterKey: string;
  targetWords: number;
  minimumWords: number;
  maximumWords: number;
  weight: number;
};

type DraftQualityAssessment = {
  score: number;
  needsRevision: boolean;
  readiness: "strong" | "watch" | "needs attention";
  signals: Array<{
    label: string;
    state: "pass" | "warn" | "fail";
    detail: string;
  }>;
  concerns: string[];
};

type SourceWeaveRequirements = {
  requiredCategories: string[];
  missingCategoryWarnings: string[];
  priorities: string[];
  chapterMandate: string[];
  argumentAnchors: string[];
};

const DraftSchema = z.object({
  openingHook: z.string(),
  narrativeThread: z.string(),
  chapterText: z.string(),
  paragraphs: z.array(
    z.object({
      id: z.string(),
      topicSentence: z.string(),
      prose: z.string(),
      sourceNotes: z.array(z.string()).default([]),
    }),
  ),
  sourceUsage: z.object({
    research: z.array(z.string()).default([]),
    externalStories: z.array(z.string()).default([]),
    personalStories: z.array(z.string()).default([]),
    baseStory: z.array(z.string()).default([]),
    // Citation trace: the exact `id` values (from the research/externalStories
    // input arrays) the author actually wove into the prose. Enables the
    // linked-notes brain to distinguish "available" from "used".
    researchItemIds: z.array(z.string()).default([]),
    externalStoryItemIds: z.array(z.string()).default([]),
  }),
});

const ReviewSchema = z.object({
  overallAssessment: z.string(),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  revisionPriorities: z.array(z.string()).default([]),
  aiAuthorshipFlags: z.array(z.string()).default([]),
  verdict: z.enum(["ready_for_review", "needs_revision"]),
});

const AdversarialCriticSchema = z.object({
  summary: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  aiTellFlags: z.array(z.string()).default([]),
  paddingFlags: z.array(z.string()).default([]),
  voiceFlags: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

type AdversarialCriticResult = z.infer<typeof AdversarialCriticSchema>;

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function normalizeEncyclopedia(value: unknown): PersonalStoryEncyclopedia {
  const raw = parseJson<Partial<PersonalStoryEncyclopedia> | null>(value, null);
  return {
    interviewFocus: raw?.interviewFocus ?? "",
    nextQuestion: raw?.nextQuestion ?? "",
    entries: Array.isArray(raw?.entries) ? raw.entries : [],
    noStoryTopics: Array.isArray(raw?.noStoryTopics) ? raw.noStoryTopics : [],
    coverageGaps: Array.isArray(raw?.coverageGaps) ? raw.coverageGaps : [],
    interviewerNotes: Array.isArray(raw?.interviewerNotes) ? raw.interviewerNotes : [],
  };
}

function hasUsableOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your-key-here");
}

async function getAuthorModel() {
  // Routed via provider layer: Sonnet for cost-effective drafting
  return getModelForRole("chapter-draft:author", {
    temperature: 0.45,
    maxOutputTokens: 16000,
    timeoutMs: 30000,
  });
}

async function getReviewerModel() {
  // Routed via provider layer: Sonnet for fast revision
  return getModelForRole("chapter-draft:revise", {
    temperature: 0.2,
    maxOutputTokens: 8000,
    timeoutMs: 30000,
  });
}

async function getVoiceGuardCriticModel() {
  return getModelForRole("voice-guard:critic", {
    temperature: 0.1,
    maxOutputTokens: 5000,
    timeoutMs: 30000,
  });
}

async function getCommittedResearchDossier(bookId: string, chapterKey: string) {
  const committed = await getCommittedResearchPack(bookId, chapterKey);
  const parsed = committed
    ? parseJson<ChapterResearchDossier | null>(committed.contentJson, null)
    : null;
  // Legacy dossiers are {text} blobs — only trust the parse when it actually
  // has the structured shape. Otherwise fall back to the structured tables
  // populated by the background extraction pass, so blob-era research still
  // reaches the author model.
  if (parsed && Array.isArray(parsed.factBank)) {
    return parsed;
  }
  return buildResearchDossierFromStructuredRows(bookId, chapterKey, chapterKey);
}

async function getCommittedExternalStoriesDossier(bookId: string, chapterKey: string) {
  const committed = await getCommittedExternalStoryPack(bookId, chapterKey);
  const parsed = committed
    ? parseJson<ChapterExternalStoryDossier | null>(committed.contentJson, null)
    : null;
  if (parsed && Array.isArray(parsed.storyCandidates)) {
    return parsed;
  }
  return buildExternalStoryDossierFromStructuredRows(bookId, chapterKey, chapterKey);
}

async function getCommittedBaseStoryBundle(bookId: string) {
  const committed = await getCommittedBaseStory(bookId);
  if (committed) {
    return normalizeBaseStoryBundle(
      parseArtifactWithSchema(committed.contentJson, BaseStoryBundleSchema),
    );
  }
  return null;
}

async function getCommittedPersonalStoriesEncyclopedia(bookId: string) {
  const committed = await getCommittedPersonalStoryEncyclopedia(bookId);
  if (committed) {
    return normalizeEncyclopedia(committed.contentJson);
  }
  return null;
}

/**
 * Pull one chapter's section out of the committed Chapter Manifest markdown
 * (sections start at `## <heading>`). Fuzzy title match in both directions so
 * "Chapter 3: The Wedge" matches a "## The Wedge" heading and vice versa.
 */
function extractManifestChapterGuidance(manifestText: string | null, chapterTitle: string) {
  if (!manifestText?.trim()) return null;
  const normalizedTitle = chapterTitle.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalizedTitle) return null;

  const sections = manifestText.split(/\n(?=## )/);
  for (const section of sections) {
    const headingLine = section.split("\n", 1)[0] ?? "";
    if (!headingLine.startsWith("## ")) continue;
    const normalizedHeading = headingLine
      .slice(3)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (
      normalizedHeading &&
      (normalizedHeading.includes(normalizedTitle) || normalizedTitle.includes(normalizedHeading))
    ) {
      return section.trim().slice(0, 1500);
    }
  }
  return null;
}

async function getCommittedManifestText(bookId: string) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.CHAPTER_MANIFEST,
      status: { in: [ArtifactStatus.COMMITTED, ArtifactStatus.REVIEW_READY] },
    },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const version = artifact?.versions[0];
  if (!version) return null;
  if (typeof version.contentText === "string" && version.contentText.trim()) {
    return version.contentText;
  }
  const json = version.contentJson as { text?: unknown } | null;
  return typeof json?.text === "string" ? json.text : null;
}

async function getDraftInputs(bookId: string) {
  const promiseVersion = await getCommittedPromiseBrief(bookId);
  const paragraphOutlineVersion = await getCommittedOutlineExpansion(bookId);
  const bookSetupVersion = await getCommittedBookSetup(bookId);
  const baseStory = await getCommittedBaseStoryBundle(bookId);
  const personalStories = await getCommittedPersonalStoriesEncyclopedia(bookId);
  const manifestText = await getCommittedManifestText(bookId);
  const craftNotes = await getCraftNotes(bookId);

  const promise = parseArtifactWithSchema(promiseVersion?.contentJson, PromiseBriefSchema);
  const bookSetup = parseArtifactWithSchema(bookSetupVersion?.contentJson, BookSetupProfileSchema);
  const paragraphOutline = parseArtifactWithSchema(
    paragraphOutlineVersion?.contentJson,
    ParagraphOutlineSchema,
  );

  if (!promise || !paragraphOutline) {
    throw new Error(
      "Committed Promise and committed paragraph-level Outline are required before generating chapter drafts.",
    );
  }

  if (!baseStory || baseStory.chapters.length === 0) {
    throw new Error(
      "A committed Base Story is required before chapter drafting can begin.",
    );
  }

  if (!personalStories || personalStories.entries.length === 0) {
    throw new Error(
      "A committed Personal Stories encyclopedia is required before chapter drafting can begin.",
    );
  }

  const chapterContexts = paragraphOutline.sections.flatMap((section) =>
    section.chapters.map((chapter) => ({
      section,
      chapter,
      manifestGuidance: extractManifestChapterGuidance(manifestText, chapter.chapterTitle),
      craftNotes,
    })),
  );

  const readinessChecks = await Promise.all(
    chapterContexts.map(async (context) => {
      const [research, externalStories] = await Promise.all([
        getCommittedResearchDossier(bookId, context.chapter.chapterId),
        getCommittedExternalStoriesDossier(bookId, context.chapter.chapterId),
      ]);

      return {
        chapterKey: context.chapter.chapterId,
        chapterTitle: context.chapter.chapterTitle,
        hasResearch: research
          ? research.sourceRegister.length > 0 ||
            research.verificationSummary.verifiedItems > 0
          : false,
        hasExternalStories: externalStories
          ? externalStories.sourceRegister.length > 0 ||
            externalStories.verificationSummary.verifiedStories > 0
          : false,
      };
    }),
  );

  const chaptersMissingResearch = readinessChecks
    .filter((entry) => !entry.hasResearch)
    .map((entry) => entry.chapterTitle);
  const chaptersMissingStories = readinessChecks
    .filter((entry) => !entry.hasExternalStories)
    .map((entry) => entry.chapterTitle);

  if (chaptersMissingResearch.length > 0 || chaptersMissingStories.length > 0) {
    const parts: string[] = [];
    if (chaptersMissingResearch.length > 0) {
      parts.push(
        `Research is still missing or empty for ${chaptersMissingResearch.slice(0, 3).join(", ")}${chaptersMissingResearch.length > 3 ? ", and others" : ""}`,
      );
    }
    if (chaptersMissingStories.length > 0) {
      parts.push(
        `External stories are still missing or empty for ${chaptersMissingStories.slice(0, 3).join(", ")}${chaptersMissingStories.length > 3 ? ", and others" : ""}`,
      );
    }

    throw new Error(
      `${parts.join(". ")}. Chapter drafting is intentionally blocked until those chapter dossiers contain real upstream material.`,
    );
  }

  return { promise, paragraphOutline, chapterContexts, baseStory, personalStories, bookSetup };
}

function findBaseStoryChapter(
  baseStory: BaseStoryBundle | null,
  chapterKey: string,
): BaseStoryChapter | null {
  return baseStory?.chapters.find((chapter) => chapter.chapterKey === chapterKey) ?? null;
}

function findRelevantPersonalStories(
  encyclopedia: PersonalStoryEncyclopedia | null,
  chapterTitle: string,
) {
  if (!encyclopedia) {
    return [];
  }

  const titleWords = chapterTitle.toLowerCase().split(/\W+/).filter(Boolean);
  return encyclopedia.entries
    .filter((entry) => entry.status !== "not_applicable")
    .filter((entry) => {
      const haystack = `${entry.title} ${entry.summary} ${entry.whyItMatters}`.toLowerCase();
      return (
        entry.chapterFitHints.length > 0 ||
        titleWords.some((word) => word.length > 3 && haystack.includes(word))
      );
    })
    .slice(0, 4);
}

function countDescriptionWords(value: string | null | undefined) {
  return value?.split(/\s+/).filter(Boolean).length ?? 0;
}

function roundToNearestTwentyFive(value: number) {
  return Math.max(250, Math.round(value / 25) * 25);
}

function calculateChapterTargetWeights(chapterContexts: ChapterContext[]) {
  return chapterContexts.map((context) => {
    const paragraphCount = Math.max(1, context.chapter.paragraphs.length);
    const chapterDescriptionWords = countDescriptionWords(context.chapter.chapterDescription);
    const sectionDescriptionWords = countDescriptionWords(context.section.sectionDescription);
    const chapterTitleWords = countDescriptionWords(context.chapter.chapterTitle);

    const weight =
      1 +
      paragraphCount * 0.7 +
      chapterDescriptionWords * 0.045 +
      sectionDescriptionWords * 0.015 +
      chapterTitleWords * 0.1;

    return {
      chapterKey: context.chapter.chapterId,
      weight,
    };
  });
}

function buildChapterWordTargets(
  chapterContexts: ChapterContext[],
  totalTargetWordCount: number | null | undefined,
) {
  if (!totalTargetWordCount || chapterContexts.length === 0) {
    return new Map<string, ChapterWordTarget>();
  }

  const weighted = calculateChapterTargetWeights(chapterContexts);
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);

  const provisional = weighted.map((entry) => {
    const exactTarget = (entry.weight / totalWeight) * totalTargetWordCount;
    return {
      ...entry,
      exactTarget,
      roundedTarget: roundToNearestTwentyFive(exactTarget),
    };
  });

  let difference =
    totalTargetWordCount - provisional.reduce((sum, entry) => sum + entry.roundedTarget, 0);
  if (difference !== 0) {
    const direction = difference > 0 ? 25 : -25;
    const ordered = [...provisional].sort((a, b) =>
      direction > 0
        ? b.exactTarget - b.roundedTarget - (a.exactTarget - a.roundedTarget)
        : a.exactTarget - a.roundedTarget - (b.exactTarget - b.roundedTarget),
    );

    let index = 0;
    while (difference !== 0 && ordered.length > 0 && index < 5000) {
      const candidate = ordered[index % ordered.length];
      const nextTarget = candidate.roundedTarget + direction;
      if (nextTarget >= 250) {
        candidate.roundedTarget = nextTarget;
        difference -= direction;
      }
      index += 1;
    }
  }

  return new Map<string, ChapterWordTarget>(
    provisional.map((entry) => {
      const tolerance = Math.max(250, Math.round(entry.roundedTarget * 0.16));
      return [
        entry.chapterKey,
        {
          chapterKey: entry.chapterKey,
          targetWords: entry.roundedTarget,
          minimumWords: Math.max(250, entry.roundedTarget - tolerance),
          maximumWords: entry.roundedTarget + tolerance,
          weight: entry.weight,
        },
      ];
    }),
  );
}

function sanitizeDraftProse(value: string) {
  return value
    .replace(
      /\bAdd enough developed explanation, specificity, and connective tissue to support roughly \d+ words of finished prose\.?/gi,
      "",
    )
    .replace(
      /\bAdd concrete illustration, fuller explanation, and a cleaner transition so this section does more real narrative and analytical work\.?/gi,
      "",
    )
    .replace(
      /\bThis paragraph should do enough work to carry roughly \d+ words of developed nonfiction prose once fully written\.?/gi,
      "",
    )
    .replace(/\bdo not use em dashes\b/gi, "")
    .replace(/\bkeep the revised chapter inside the requested target band when possible\b/gi, "")
    .replace(/\bopen the chapter by\b/gi, "")
    .replace(/\bone strong proof point here is\b/gi, "")
    .replace(/\ba useful outside story is\b/gi, "")
    .replace(/\bthis chapter advances the larger movement of\b/gi, "")
    .replace(/\s+\./g, ".")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function hasMetaDraftLanguage(value: string) {
  const text = value.toLowerCase();
  return [
    "this chapter begins by",
    "open the chapter by",
    "one strong proof point here is",
    "a useful outside story is",
    "surface the forces",
    "raise the stakes so the reader sees",
    "to move forward, the chapter has to",
    "the chapter advances the larger",
    "create the pivot from diagnosis",
  ].some((snippet) => text.includes(snippet));
}

function deterministicAdversarialCritic(
  draft: ChapterDraftBundle,
  chapterTarget: ChapterWordTarget | null,
): AdversarialCriticResult {
  const text = draft.chapterText;
  const lowered = text.toLowerCase();
  const aiTellFlags: string[] = [];
  const paddingFlags: string[] = [];
  const voiceFlags: string[] = [];

  if (hasMetaDraftLanguage(text)) {
    aiTellFlags.push("The draft still contains planning-shaped meta language instead of finished prose.");
  }
  if (/[—]/.test(text)) {
    aiTellFlags.push("The draft uses an em dash, which violates the style guard.");
  }
  if (/\b(in conclusion|ultimately|it is important to note|delve into|landscape|leverage)\b/i.test(text)) {
    aiTellFlags.push("The draft is using generic or overfamiliar AI-adjacent transition language.");
  }
  if (/\bthis chapter\b/i.test(text) || /\bthe reader\b/i.test(text)) {
    aiTellFlags.push("The prose refers to the writing itself instead of staying inside the manuscript voice.");
  }

  const paragraphs = text.split(/\n\s*\n/).map((entry) => entry.trim()).filter(Boolean);
  const repeatedOpeners = new Map<string, number>();
  for (const paragraph of paragraphs) {
    const opener = paragraph.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
    if (opener) {
      repeatedOpeners.set(opener, (repeatedOpeners.get(opener) ?? 0) + 1);
    }
  }
  if ([...repeatedOpeners.values()].some((count) => count >= 3)) {
    voiceFlags.push("Several paragraphs begin with overly repetitive rhythm, which makes the voice feel machine-shaped.");
  }

  if (chapterTarget) {
    const wordCount = countWords(text);
    const delta = Math.abs(wordCount - chapterTarget.targetWords);
    if (delta > Math.max(200, Math.round(chapterTarget.targetWords * 0.18))) {
      paddingFlags.push("The chapter is still drifting too far from the intended length target to trust the prose shape.");
    }
  }

  if (paragraphs.some((paragraph) => paragraph.split(/\s+/).filter(Boolean).length < 35)) {
    paddingFlags.push("At least one paragraph is so thin that it still reads like a drafted note instead of finished manuscript prose.");
  }

  const allFlags = [...aiTellFlags, ...paddingFlags, ...voiceFlags];
  return {
    summary:
      allFlags.length === 0
        ? "The prose does not show obvious AI tells, padding, or voice drift under deterministic review."
        : allFlags[0],
    riskLevel: allFlags.length >= 4 ? "high" : allFlags.length >= 2 ? "medium" : allFlags.length === 1 ? "low" : "low",
    aiTellFlags,
    paddingFlags,
    voiceFlags,
    recommendations:
      allFlags.length === 0
        ? ["Keep the current natural voice and source integration intact during further revision."]
        : [
            "Rewrite any paragraph that talks about what the chapter is doing instead of simply doing it.",
            "Replace generic abstractions with concrete consequence and natural transition.",
            "Expand thin paragraphs with real explanation or scene detail rather than filler phrasing.",
          ],
  };
}

async function runAdversarialProseCritic(
  promise: PromiseBrief,
  context: ChapterContext,
  draft: ChapterDraftBundle,
  chapterTarget: ChapterWordTarget | null,
): Promise<AdversarialCriticResult> {
  const fallback = deterministicAdversarialCritic(draft, chapterTarget);
  const model = await getVoiceGuardCriticModel();
  if (!model) {
    return fallback;
  }

  try {
    const structured = model.withStructuredOutput(AdversarialCriticSchema);
    const result = await structured.invoke([
      new SystemMessage(`
You are the adversarial prose critic in a ghostwriting pipeline.

Your job is not to be nice. Your job is to catch:
- AI tells
- consultant tone
- padded explanation
- repetitive sentence rhythm
- chapter prose that talks about itself instead of simply reading like a book

Return only the structured critique. Be specific and tough.
      `),
      new HumanMessage(
        JSON.stringify({
          promise,
          chapter: context.chapter,
          chapterTarget,
          draft,
        }),
      ),
    ]);
    return {
      summary: result.summary,
      riskLevel: result.riskLevel,
      aiTellFlags: result.aiTellFlags ?? [],
      paddingFlags: result.paddingFlags ?? [],
      voiceFlags: result.voiceFlags ?? [],
      recommendations: result.recommendations ?? [],
    };
  } catch (err) {
    console.error(`[chapter-draft] runAdversarialProseCritic failed for ${context.chapter?.chapterId ?? "unknown"}, falling back to deterministic critic:`, err);
    return fallback;
  }
}

function cleanEvidenceText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(/skip to main content/gi, "")
    .replace(/official websites use \.gov/gi, "")
    .replace(/here's how you know/gi, "")
    .replace(/jump to content/gi, "")
    .replace(/subscribe to [^.]+/gi, "")
    .replace(/have a website account\??/gi, "")
    .replace(/\b(log in|login|sign in|account settings)\b/gi, "")
    .replace(/\s+\|\s+/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function shortenEvidenceText(value: string, maxLength = 220) {
  if (value.length <= maxLength) {
    return value;
  }

  const shortened = value.slice(0, maxLength);
  const safeCut = shortened.lastIndexOf(" ");
  return `${(safeCut > 80 ? shortened.slice(0, safeCut) : shortened).trim()}...`;
}

function toSentence(value: string | null | undefined) {
  const trimmed = sanitizeDraftProse(value ?? "");
  if (!trimmed) {
    return "";
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function trimToWordLimit(text: string, maximumWords: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maximumWords) {
    return text.trim();
  }

  return `${words.slice(0, maximumWords).join(" ").trim()}`.replace(/\s+([,.;!?])/g, "$1");
}

function buildDeterministicParagraphProse(args: {
  paragraph: ChapterContext["chapter"]["paragraphs"][number];
  paragraphIndex: number;
  targetWords: number;
  researchItem?: ChapterResearchItem | null;
  externalStory?: ChapterExternalStoryItem | null;
  personalStory?: { title: string; summary: string; whyItMatters?: string | null } | null;
  baseStoryChapter?: BaseStoryChapter | null;
  chapterTitle: string;
}) {
  const {
    paragraph,
    paragraphIndex,
    targetWords,
    researchItem,
    externalStory,
    personalStory,
    baseStoryChapter,
    chapterTitle,
  } = args;

  const bridgePhrases = [
    "That matters because",
    "What follows from that is that",
    "In lived terms,",
    "The real consequence is that",
    "Seen up close,",
    "In practice,",
  ];
  const consequencePhrases = [
    "pressure compounds when nobody redesigns the condition that keeps creating the problem",
    "people start mistaking heroic effort for a system that actually works",
    "small frictions turn into expensive habits because the structure never gets corrected",
    "teams normalize the workaround and stop seeing the design flaw underneath it",
    "the reader can feel the gap between what sounds right and what actually holds up in the room",
  ];

  const evidenceSentence = researchItem
    ? toSentence(
        `A concrete anchor here comes from ${cleanEvidenceText(
          researchItem.summary || researchItem.claimText,
        ).replace(/^[a-z]/, (letter) => letter.toUpperCase())}`,
      )
    : "";
  const outsideStorySentence = externalStory
    ? toSentence(
        `${cleanEvidenceText(externalStory.title)} gives the chapter a real-world face: ${cleanEvidenceText(
          externalStory.summary,
        )}`,
      )
    : "";
  const personalStorySentence = personalStory
    ? toSentence(
        `${personalStory.title} belongs here because ${cleanEvidenceText(
          personalStory.summary,
        ).replace(/^[a-z]/, (letter) => letter.toUpperCase())}`,
      )
    : "";
  const baseStorySentence = baseStoryChapter
    ? toSentence(
        `${baseStoryChapter.chapterStory} This is how ${chapterTitle} keeps the book's larger movement alive.`,
      )
    : "";

  const sentences = [
    toSentence(paragraph.topicSentence),
    toSentence(paragraph.mainIdea || paragraph.purpose),
    toSentence(
      `${bridgePhrases[paragraphIndex % bridgePhrases.length]} ${consequencePhrases[paragraphIndex % consequencePhrases.length]}`,
    ),
    evidenceSentence,
    outsideStorySentence,
    personalStorySentence,
    baseStorySentence,
    toSentence(
      `${paragraph.purpose} The point is not merely to name the pattern, but to make its stakes impossible to ignore.`,
    ),
  ].filter(Boolean);

  let prose = sentences.join(" ");
  const expansionPool = [
    toSentence(
      `${paragraph.hook || paragraph.topicSentence} The paragraph should feel like finished prose, so the explanation has to earn the turn from observation into meaning.`,
    ),
    toSentence(
      `${bridgePhrases[(paragraphIndex + 2) % bridgePhrases.length]} the chapter gains force when the evidence is translated into implication instead of left sitting on the page as a fact.`,
    ),
    toSentence(
      `${consequencePhrases[(paragraphIndex + 2) % consequencePhrases.length].replace(/^[a-z]/, (letter) =>
        letter.toUpperCase(),
      )}, which is why this section keeps pressing beyond description into consequence.`,
    ),
  ].filter(Boolean);

  let expansionIndex = 0;
  while (countWords(prose) < targetWords && expansionPool.length > 0) {
    prose = `${prose} ${expansionPool[expansionIndex % expansionPool.length]}`.trim();
    expansionIndex += 1;
    if (expansionIndex > 12) {
      break;
    }
  }

  return trimToWordLimit(sanitizeDraftProse(prose), Math.max(targetWords, Math.round(targetWords * 1.08)));
}

function compactResearchItem(item: ChapterResearchItem) {
  return {
    id: item.id,
    type: item.itemType,
    claim: shortenEvidenceText(cleanEvidenceText(item.summary || item.claimText)),
    sourceTier: item.sourceTier,
  };
}

function compactExternalStory(item: ChapterExternalStoryItem) {
  return {
    id: item.id,
    title: shortenEvidenceText(cleanEvidenceText(item.title), 120),
    summary: shortenEvidenceText(cleanEvidenceText(item.summary), 220),
    whyItMatters: shortenEvidenceText(cleanEvidenceText(item.whyItMatters), 180),
    fit: item.storyFit,
    type: item.storyType,
  };
}

type ResolvedFramework = {
  dominantPersona: string;
  name: string;
  flow: readonly FrameworkStep[];
};

const DEFAULT_FRAMEWORK: ResolvedFramework = (() => {
  const andy = CANONICAL_PERSONAS.find((p) => p.frameworkName === "ME-WE-TRUTH-YOU-WE");
  return {
    dominantPersona: andy?.name ?? "AndyGPT",
    name: andy?.frameworkName ?? "ME-WE-TRUTH-YOU-WE",
    flow: andy?.frameworkFlow ?? [],
  };
})();

/**
 * Resolve the dominant persona's chapter-shaping framework from a voice blend.
 * Rule: highest percentInfluence wins; ties broken by personaId (deterministic).
 * Falls back to AndyGPT's ME-WE-TRUTH-YOU-WE if no blend is set.
 */
function resolveDominantFramework(
  blend: WriterPersonaBlend[] | undefined | null,
): ResolvedFramework {
  const active = (blend ?? []).filter((b) => b.percentInfluence > 0);
  if (active.length === 0) return DEFAULT_FRAMEWORK;

  const dominant = [...active].sort(
    (a, b) =>
      b.percentInfluence - a.percentInfluence ||
      a.personaId.localeCompare(b.personaId),
  )[0];

  const canonical = CANONICAL_PERSONAS.find((p) => p.slug === dominant.personaSlug);
  if (!canonical || canonical.frameworkFlow.length === 0) {
    return DEFAULT_FRAMEWORK;
  }

  return {
    dominantPersona: canonical.name,
    name: canonical.frameworkName,
    flow: canonical.frameworkFlow,
  };
}

// For a Biblical/Theological-lens book, the framework's "truth" beat (the
// principle the chapter delivers) shouldn't be a generic secular insight —
// it should be what God actually says. Swapping the slot's own prompt text
// here means every persona's framework that happens to have a "truth" slot
// (currently just AndyGPT's ME-WE-TRUTH-YOU-WE) gets this automatically,
// without needing a separate Christian-only framework to maintain.
const BIBLICAL_TRUTH_SLOT_PROMPT =
  "Answer the chapter's tension with what GOD says about it directly. Cite the specific passage(s) of Scripture that speak to it, what Jesus says or models if relevant, and the doctrinal principle at stake. Where possible, name a biblical story or historical figure from Scripture who faced a genuinely similar tension and draw out the truth their experience reveals. This beat must be grounded in God's own words and character — not a generic secular principle dressed in Christian language.";

function renderFrameworkSlotsForPrompt(framework: ResolvedFramework, isBiblical: boolean): string {
  if (framework.flow.length === 0) {
    return "  (no framework flow available — default to natural chapter progression)";
  }
  return framework.flow
    .map((step) => {
      const prompt = isBiblical && step.slot === "truth" ? BIBLICAL_TRUTH_SLOT_PROMPT : step.prompt;
      return `  ${step.slot}: ${prompt}`;
    })
    .join("\n");
}

function buildSourceWeaveRequirements(
  research: ChapterResearchDossier | null,
  externalStories: ChapterExternalStoryDossier | null,
  relevantPersonalStories: Array<{
    title: string;
    summary: string;
    whyItMatters: string;
  }>,
  baseStoryChapter: BaseStoryChapter | null,
): SourceWeaveRequirements {
  const requiredCategories: string[] = [];
  const missingCategoryWarnings: string[] = [];
  const priorities: string[] = [];

  if (research && (research.factBank.length > 0 || research.statistics.length > 0 || research.examples.length > 0)) {
    requiredCategories.push("research");
    priorities.push(
      "Ground at least one core move in a concrete verified fact, statistic, or example so the chapter earns authority instead of merely asserting it.",
    );
  } else {
    missingCategoryWarnings.push("No committed research evidence is available for this chapter yet.");
  }

  if (externalStories && externalStories.storyCandidates.length > 0) {
    requiredCategories.push("external story");
    priorities.push(
      "Use one outside case or story only where it creates belief, tension, or a meaningful real-world turn in the chapter.",
    );
  } else {
    missingCategoryWarnings.push("No committed external story dossier is available for this chapter yet.");
  }

  if (relevantPersonalStories.length > 0) {
    requiredCategories.push("personal story");
    priorities.push(
      "Use one personal story beat when it sharpens authenticity or emotional specificity rather than merely decorating the point.",
    );
  } else {
    missingCategoryWarnings.push("No clearly relevant personal story match was found for this chapter.");
  }

  if (baseStoryChapter) {
    requiredCategories.push("base story thread");
    priorities.push(
      "Keep the chapter visibly connected to the larger book movement so the manuscript feels unified from chapter to chapter.",
    );
  } else {
    missingCategoryWarnings.push("No base-story chapter thread was resolved for this chapter.");
  }

  return {
    requiredCategories,
    missingCategoryWarnings,
    priorities,
    chapterMandate: [
      baseStoryChapter?.chapterPurpose,
      baseStoryChapter?.threadRole,
      baseStoryChapter?.movement.truth,
    ].filter((value): value is string => Boolean(value?.trim())),
    argumentAnchors: [
      ...(research?.researchQuestions.map((question) => question.question) ?? []),
      ...(research?.gaps ?? []),
    ]
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 4),
  };
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function averageSentenceLength(text: string) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return 0;
  }

  return Math.round(
    sentences.reduce((sum, sentence) => sum + countWords(sentence), 0) / sentences.length,
  );
}

function countParagraphAnchorHits(draft: ChapterDraftBundle, context: ChapterContext) {
  const body = draft.chapterText.toLowerCase();
  return context.chapter.paragraphs.filter((paragraph) => {
    const anchor = paragraph.topicSentence
      .split(/\W+/)
      .find((word) => word.length > 4);
    return anchor ? body.includes(anchor.toLowerCase()) : false;
  }).length;
}

function countMandateHits(text: string, values: string[]) {
  const body = text.toLowerCase();
  return values.filter((value) => {
    const anchor = value
      .split(/\W+/)
      .find((word) => word.length > 4);
    return anchor ? body.includes(anchor.toLowerCase()) : false;
  }).length;
}

/**
 * Run-stable book context — identical for every chapter in a workflow run,
 * so it lives in the cached system prefix (Anthropic prompt caching) instead
 * of being re-sent at full input price inside each per-chapter packet.
 */
function buildSharedBookContextJson(
  promise: PromiseBrief,
  bookSetupProfile: BookSetupProfile | null,
  baseStory: BaseStoryBundle | null,
): string {
  const framework = resolveDominantFramework(bookSetupProfile?.writerPersonaBlend);
  const shared = {
    promise,
    bookSetupProfile: bookSetupProfile
      ? {
          writerPersona: bookSetupProfile.writerPersona,
          writerPersonaGuidance: bookSetupProfile.writerPersonaGuidance ?? [],
          voiceReferenceNotes: bookSetupProfile.voiceReferenceNotes,
          notesToSystem: bookSetupProfile.notesToSystem,
        }
      : null,
    voice: {
      dominantPersona: framework.dominantPersona,
      frameworkName: framework.name,
      frameworkFlow: framework.flow.map((step) => ({ slot: step.slot, prompt: step.prompt })),
    },
    baseStoryBook: baseStory
      ? {
          storyPremise: baseStory.storyPremise,
          bookThread: baseStory.bookThread,
          movement: baseStory.bookMovement,
        }
      : null,
  };
  return `SHARED BOOK CONTEXT (identical for every chapter in this run):\n${JSON.stringify(shared)}`;
}

function buildAuthorInputPacket(
  promise: PromiseBrief,
  context: ChapterContext,
  research: ChapterResearchDossier | null,
  externalStories: ChapterExternalStoryDossier | null,
  personalStories: PersonalStoryEncyclopedia | null,
  baseStory: BaseStoryBundle | null,
  baseStoryChapter: BaseStoryChapter | null,
  bookSetupProfile: BookSetupProfile | null,
  chapterTarget: ChapterWordTarget | null,
) {
  const relevantPersonalStories = findRelevantPersonalStories(
    personalStories,
    context.chapter.chapterTitle,
  ).map((story) => ({
    title: story.title,
    summary: story.summary,
    whyItMatters: story.whyItMatters,
  }));

  const framework = resolveDominantFramework(bookSetupProfile?.writerPersonaBlend);
  const sourceWeavePlan = buildSourceWeaveRequirements(
    research,
    externalStories,
    relevantPersonalStories,
    baseStoryChapter,
  );

  return {
    promise,
    bookSetupProfile: bookSetupProfile
      ? {
          writerPersona: bookSetupProfile.writerPersona,
          writerPersonaGuidance: bookSetupProfile.writerPersonaGuidance ?? [],
          voiceReferenceNotes: bookSetupProfile.voiceReferenceNotes,
          notesToSystem: bookSetupProfile.notesToSystem,
        }
      : null,
    voice: {
      dominantPersona: framework.dominantPersona,
      frameworkName: framework.name,
      frameworkFlow: framework.flow.map((step) => ({ slot: step.slot, prompt: step.prompt })),
    },
    sourceWeavePlan,
    section: {
      id: context.section.sectionId,
      title: context.section.sectionTitle,
      description: context.section.sectionDescription,
    },
    chapter: {
      id: context.chapter.chapterId,
      title: context.chapter.chapterTitle,
      description: context.chapter.chapterDescription,
      paragraphs: context.chapter.paragraphs,
    },
    // The committed Chapter Manifest's guidance for this chapter (opening
    // pattern, narrative arc, which sources to lean on) — follow it when
    // deciding how to weave the material below.
    manifestGuidance: context.manifestGuidance ?? null,
    // Standing author feedback accumulated from prior revisions — every one
    // of these must be honored in the prose.
    authorCraftNotes: context.craftNotes ?? [],
    chapterTarget,
    research: research
      ? {
          goal: research.researchGoal,
          verifiedFacts: research.factBank.slice(0, 4).map(compactResearchItem),
          verifiedStatistics: research.statistics.slice(0, 3).map(compactResearchItem),
          verifiedExamples: research.examples.slice(0, 3).map(compactResearchItem),
          verifiedDefinitions: research.definitions.slice(0, 2).map(compactResearchItem),
        }
      : null,
    externalStories: externalStories
      ? externalStories.storyCandidates.slice(0, 4).map(compactExternalStory)
      : [],
    personalStories: relevantPersonalStories,
    baseStoryBook: baseStory
      ? {
          storyPremise: baseStory.storyPremise,
          bookThread: baseStory.bookThread,
          movement: baseStory.bookMovement,
        }
      : null,
    baseStoryChapter: baseStoryChapter
      ? {
          chapterPurpose: baseStoryChapter.chapterPurpose,
          threadRole: baseStoryChapter.threadRole,
          chapterStory: baseStoryChapter.chapterStory,
          movement: baseStoryChapter.movement,
        }
      : null,
  };
}

function fallbackDraft(
  context: ChapterContext,
  research: ChapterResearchDossier | null,
  externalStories: ChapterExternalStoryDossier | null,
  personalStories: PersonalStoryEncyclopedia | null,
  baseStory: BaseStoryBundle | null,
  baseStoryChapter: BaseStoryChapter | null,
  chapterTarget: ChapterWordTarget | null,
): ChapterDraftBundle {
  const relevantPersonalStories = findRelevantPersonalStories(
    personalStories,
    context.chapter.chapterTitle,
  );

  const paragraphs = context.chapter.paragraphs.map((paragraph, index) => {
    const researchItem = research?.factBank[index] ?? research?.examples[index] ?? research?.statistics[index];
    const externalStory = externalStories?.storyCandidates[index];
    const personalStory = relevantPersonalStories[index];
    const sourceNotes = [
      researchItem ? `Research: ${researchItem.claimText}` : null,
      externalStory ? `External story: ${externalStory.title}` : null,
      personalStory ? `Personal story: ${personalStory.title}` : null,
    ].filter((value): value is string => Boolean(value));
    const targetWords = Math.max(140, Math.round(paragraph.wordCountTarget || 0));

    return {
      id: paragraph.id,
      topicSentence: paragraph.topicSentence,
      prose: buildDeterministicParagraphProse({
        paragraph,
        paragraphIndex: index,
        targetWords,
        researchItem,
        externalStory,
        personalStory,
        baseStoryChapter,
        chapterTitle: context.chapter.chapterTitle,
      }),
      sourceNotes,
    };
  });

  const openingHook = externalStories?.storyCandidates[0]
    ? sanitizeDraftProse(
        `${baseStoryChapter?.movement.me ?? "In laboratories, change rarely announces itself as a sweeping transformation. It arrives as another delayed result, another handoff no one fully owns, another day when smart people work hard and still feel the system slipping against them."} ${baseStoryChapter?.movement.we ?? ""} ${cleanEvidenceText(
          externalStories.storyCandidates[0].summary,
        )}`,
      )
    : sanitizeDraftProse(
        `${baseStoryChapter?.movement.me ?? "Laboratory leaders do not struggle because they lack commitment."} ${baseStoryChapter?.movement.we ?? "They struggle because modern labs ask for speed, precision, compliance, and resilience at the same time, often inside systems that were never built to carry that weight cleanly."}`,
      );

  const chapterText = [openingHook, ...paragraphs.map((paragraph) => paragraph.prose)].join("\n\n");

  return {
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    chapterDescription: context.chapter.chapterDescription,
    sectionTitle: context.section.sectionTitle,
    openingHook,
    narrativeThread:
      (
        [baseStory?.bookMovement.truth, baseStoryChapter?.threadRole, baseStoryChapter?.movement.truth]
          .filter(Boolean)
          .join(" ") ||
        baseStoryChapter?.threadRole
      ) ??
      `This chapter advances the larger movement of ${context.section.sectionTitle}.`,
    chapterText,
    paragraphs,
    sourceUsage: {
      research: research
        ? [...research.factBank, ...research.statistics, ...research.examples]
            .slice(0, 4)
            .map((item) => item.claimText)
        : [],
      externalStories: externalStories?.storyCandidates.slice(0, 3).map((story) => story.title) ?? [],
      personalStories: relevantPersonalStories.slice(0, 3).map((story) => story.title),
      baseStory: [
        baseStory?.bookThread,
        baseStory?.bookMovement.truth,
        baseStoryChapter?.chapterStory,
        baseStoryChapter?.movement.truth,
      ].filter((value): value is string => Boolean(value)),
    },
    quality: {
      score: 0,
      readiness: "needs attention",
      needsRevision: true,
      revisionPasses: 0,
      signals: [],
    },
  };
}

function forceDraftTowardTarget(
  context: ChapterContext,
  draft: ChapterDraftBundle,
  chapterTarget: ChapterWordTarget | null,
) {
  if (!chapterTarget) {
    return draft;
  }

  // Never substitute template prose for missing paragraphs, pad with repeated
  // filler sentences, or hard-truncate to the word band — corrupted prose in a
  // committed manuscript is strictly worse than a length miss. The quality
  // assessor's "Length fit" / "Paragraph coverage" signals (and needsRevision)
  // report the miss so the repair loop / author can fix it with real writing.
  void context;
  return {
    ...draft,
    openingHook: sanitizeDraftProse(draft.openingHook),
    chapterText: sanitizeDraftProse(draft.chapterText),
    paragraphs: draft.paragraphs.map((paragraph) => ({
      ...paragraph,
      prose: sanitizeDraftProse(paragraph.prose),
    })),
  };
}

async function enforceFinishedBookProse(
  promise: PromiseBrief,
  context: ChapterContext,
  draft: ChapterDraftBundle,
  bookSetupProfile: BookSetupProfile | null,
) {
  const combinedText = `${draft.openingHook}\n\n${draft.chapterText}`;
  if (!hasMetaDraftLanguage(combinedText)) {
    return draft;
  }

  const model = await getAuthorModel();
  if (!model) {
    return {
      ...draft,
      openingHook: sanitizeDraftProse(draft.openingHook),
      chapterText: sanitizeDraftProse(draft.chapterText),
      paragraphs: draft.paragraphs.map((paragraph) => ({
        ...paragraph,
        prose: sanitizeDraftProse(paragraph.prose),
      })),
    };
  }

  try {
    const structured = model.withStructuredOutput(DraftSchema);
    const result = await structured.invoke([
      new SystemMessage(`
Rewrite the supplied chapter draft into finished nonfiction book prose.

Hard rules:
- do not describe what the chapter is doing
- do not give writing instructions
- do not refer to "this chapter", "the reader", "open the chapter", or "proof point" language
- write actual Lean Labs manuscript prose
- keep the meaning, chapter structure, and source-backed ideas
- integrate research and stories naturally instead of naming sources
- copy the input draft's sourceUsage object through unchanged (including researchItemIds and externalStoryItemIds)
      `),
      new HumanMessage(
        JSON.stringify({
          promise,
          chapter: context.chapter,
          bookSetupProfile,
          draft,
        }),
      ),
    ]);

    return normalizeDraftResult(context, result);
  } catch (err) {
    console.error(`[chapter-draft] enforceFinishedBookProse failed for ${context.chapter?.chapterId ?? "unknown"}, keeping prior draft:`, err);
    return draft;
  }
}

function normalizeDraftResult(
  context: ChapterContext,
  result: {
    openingHook: string;
    narrativeThread: string;
    chapterText: string;
    paragraphs: Array<{
      id: string;
      topicSentence: string;
      prose: string;
      sourceNotes?: string[];
    }>;
    sourceUsage: {
      research?: string[];
      externalStories?: string[];
      personalStories?: string[];
      baseStory?: string[];
      researchItemIds?: string[];
      externalStoryItemIds?: string[];
    };
  },
): ChapterDraftBundle {
  const paragraphs: ChapterDraftParagraph[] = result.paragraphs.map((paragraph) => ({
    id: paragraph.id,
    topicSentence: paragraph.topicSentence,
    prose: sanitizeDraftProse(paragraph.prose),
    sourceNotes: paragraph.sourceNotes ?? [],
  }));
  const openingHook = sanitizeDraftProse(result.openingHook);
  const chapterBody =
    paragraphs.length > 0
      ? paragraphs.map((paragraph) => paragraph.prose).join("\n\n")
      : sanitizeDraftProse(result.chapterText);
  const chapterText = [openingHook, chapterBody].filter(Boolean).join("\n\n");

  return {
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    chapterDescription: context.chapter.chapterDescription,
    sectionTitle: context.section.sectionTitle,
    openingHook,
    narrativeThread: result.narrativeThread,
    chapterText,
    paragraphs,
    sourceUsage: {
      research: result.sourceUsage.research ?? [],
      externalStories: result.sourceUsage.externalStories ?? [],
      personalStories: result.sourceUsage.personalStories ?? [],
      baseStory: result.sourceUsage.baseStory ?? [],
      researchItemIds: result.sourceUsage.researchItemIds ?? [],
      externalStoryItemIds: result.sourceUsage.externalStoryItemIds ?? [],
    },
    quality: {
      score: 0,
      readiness: "needs attention",
      needsRevision: true,
      revisionPasses: 0,
      signals: [],
    },
  };
}

function assessNonfictionDraftQuality(
  draft: ChapterDraftBundle,
  review: ChapterReviewBundle,
  chapterTarget: ChapterWordTarget | null,
  sourceAvailability: {
    researchCount: number;
    externalStoryCount: number;
    personalStoryCount: number;
    hasBaseStory: boolean;
  },
  context: ChapterContext,
  sourceWeaveFocus: SourceWeaveRequirements,
): DraftQualityAssessment {
  const sourceCategoriesUsed = [
    draft.sourceUsage.research.length > 0,
    draft.sourceUsage.externalStories.length > 0,
    draft.sourceUsage.personalStories.length > 0,
    draft.sourceUsage.baseStory.length > 0,
  ].filter(Boolean).length;
  const draftWordCount = countWords(draft.chapterText);
  const paragraphSourceNoteCoverage = draft.paragraphs.filter(
    (paragraph) => paragraph.sourceNotes.length > 0,
  ).length;
  const paragraphTargetFailures = context.chapter.paragraphs.filter((plannedParagraph, index) => {
    const prose = draft.paragraphs[index]?.prose ?? "";
    const actualWordCount = countWords(prose);
    const targetWordCount = Math.max(80, Math.round(plannedParagraph.wordCountTarget || 0));
    const tolerance = Math.max(60, Math.round(targetWordCount * 0.28));
    return actualWordCount < targetWordCount - tolerance || actualWordCount > targetWordCount + tolerance;
  }).length;
  const paragraphAnchorHits = countParagraphAnchorHits(draft, context);
  const sentenceAverage = averageSentenceLength(draft.chapterText);
  const mandateHits = countMandateHits(
    draft.chapterText,
    [...sourceWeaveFocus.chapterMandate, ...sourceWeaveFocus.argumentAnchors].slice(0, 6),
  );
  const missingAvailableCategories: string[] = [];
  const concerns: string[] = [];
  let score = 100;

  if (chapterTarget) {
    if (draftWordCount < chapterTarget.minimumWords || draftWordCount > chapterTarget.maximumWords) {
      concerns.push("The chapter is outside its intended target band.");
      score -= 22;
    }
  }

  if (sourceCategoriesUsed < 3) {
    concerns.push("The chapter is not weaving enough upstream source types together yet.");
    score -= sourceCategoriesUsed <= 1 ? 24 : 12;
  }

  if (sourceAvailability.researchCount > 0 && draft.sourceUsage.research.length === 0) {
    missingAvailableCategories.push("research");
    concerns.push("The chapter had verified research available but did not clearly use it.");
    score -= 18;
  }

  if (sourceAvailability.externalStoryCount > 0 && draft.sourceUsage.externalStories.length === 0) {
    missingAvailableCategories.push("external story");
    concerns.push("The chapter had external stories available but did not weave one into the prose.");
    score -= 12;
  }

  if (sourceAvailability.personalStoryCount > 0 && draft.sourceUsage.personalStories.length === 0) {
    missingAvailableCategories.push("personal story");
    concerns.push("The chapter had relevant personal stories available but did not use one where it could have added authenticity.");
    score -= 12;
  }

  if (sourceAvailability.hasBaseStory && draft.sourceUsage.baseStory.length === 0) {
    missingAvailableCategories.push("base story thread");
    concerns.push("The chapter lost contact with the shared base-story thread.");
    score -= 10;
  }

  if (review.aiAuthorshipFlags.length > 0) {
    concerns.push(...review.aiAuthorshipFlags);
    score -= Math.min(30, review.aiAuthorshipFlags.length * 10);
  }

  if (review.concerns.length > 0) {
    concerns.push(...review.concerns.slice(0, 3));
    score -= Math.min(24, review.concerns.length * 6);
  }

  if (hasMetaDraftLanguage(draft.chapterText) || hasMetaDraftLanguage(draft.openingHook)) {
    concerns.push("The draft still contains meta-writing language instead of finished prose.");
    score -= 18;
  }

  if (paragraphAnchorHits < Math.max(1, Math.ceil(context.chapter.paragraphs.length / 2))) {
    concerns.push("Too few planned paragraph anchors are doing visible work in the final prose.");
    score -= 12;
  }

  if (paragraphTargetFailures > 0) {
    concerns.push(
      `${paragraphTargetFailures} planned paragraph${paragraphTargetFailures === 1 ? "" : "s"} drift materially outside their intended word-count target.`,
    );
    score -= Math.min(18, paragraphTargetFailures * 6);
  }

  if (
    mandateHits === 0 &&
    (sourceWeaveFocus.chapterMandate.length > 0 || sourceWeaveFocus.argumentAnchors.length > 0)
  ) {
    concerns.push("The chapter is not clearly carrying its intended argument or narrative mandate forward.");
    score -= 14;
  }

  if (sentenceAverage < 10 || sentenceAverage > 30) {
    concerns.push("Sentence rhythm is flattening out, which makes the chapter sound less naturally authored.");
    score -= 8;
  }

  const lengthState =
    chapterTarget == null
      ? "warn"
      : draftWordCount < chapterTarget.minimumWords || draftWordCount > chapterTarget.maximumWords
        ? "fail"
        : "pass";
  const sourceWeaveState =
    sourceCategoriesUsed >= 3 ? "pass" : sourceCategoriesUsed >= 2 ? "warn" : "fail";
  const paragraphCoverageState =
    draft.paragraphs.length === 0
      ? "fail"
      : draft.chapterText
            .split(/\n\s*\n/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean).length >= draft.paragraphs.length
        ? "pass"
        : "warn";
  const paragraphLengthState =
    paragraphTargetFailures === 0 ? "pass" : paragraphTargetFailures <= 1 ? "warn" : "fail";
  const sourceIntegrationState =
    missingAvailableCategories.length === 0 &&
    paragraphSourceNoteCoverage >= Math.max(1, Math.ceil(draft.paragraphs.length / 3))
      ? "pass"
      : missingAvailableCategories.length <= 1 && paragraphSourceNoteCoverage > 0
        ? "warn"
        : "fail";
  const argumentState =
    paragraphAnchorHits >= Math.max(1, Math.ceil(context.chapter.paragraphs.length / 2)) &&
    mandateHits > 0
      ? "pass"
      : paragraphAnchorHits > 0 || mandateHits > 0
        ? "warn"
        : "fail";
  const voiceTextureState =
    hasMetaDraftLanguage(draft.chapterText) || sentenceAverage < 10 || sentenceAverage > 30
      ? "warn"
      : "pass";
  const reviewState =
    review.verdict === "ready_for_review" && review.aiAuthorshipFlags.length === 0
      ? "pass"
      : review.verdict === "needs_revision"
        ? "fail"
        : "warn";
  const signals = [
    {
      label: "Length fit",
      state: lengthState,
      detail:
        chapterTarget == null
          ? "No chapter target is locked yet."
          : `${draftWordCount.toLocaleString()} words against a ${chapterTarget.minimumWords.toLocaleString()}-${chapterTarget.maximumWords.toLocaleString()} target band.`,
    },
    {
      label: "Source weave",
      state: sourceWeaveState,
      detail:
        sourceWeaveState === "pass"
          ? "The draft is pulling from multiple upstream artifact types."
          : sourceWeaveState === "warn"
            ? "The draft is using some upstream inputs, but the weave still looks thin."
            : "The draft is leaning on too few upstream inputs and risks feeling assembled.",
    },
    {
      label: "Paragraph coverage",
      state: paragraphCoverageState,
      detail: `${draft.paragraphs.length.toLocaleString()} planned paragraph anchors are represented in the drafted prose.`,
    },
    {
      label: "Paragraph length fit",
      state: paragraphLengthState,
      detail:
        paragraphLengthState === "pass"
          ? "Planned paragraph targets are landing inside their intended prose bands."
          : `${paragraphTargetFailures} planned paragraph${paragraphTargetFailures === 1 ? "" : "s"} still need length correction against the blueprint.`,
    },
    {
      label: "Source integration",
      state: sourceIntegrationState,
      detail:
        sourceIntegrationState === "pass"
          ? `Source-backed material is distributed across ${paragraphSourceNoteCoverage}/${draft.paragraphs.length} paragraph anchors.`
          : missingAvailableCategories.length > 0
            ? `Available categories still underused: ${missingAvailableCategories.join(", ")}.`
            : "The draft is not yet distributing evidence and story material cleanly through the chapter.",
    },
    {
      label: "Argument pressure",
      state: argumentState,
      detail:
        argumentState === "pass"
          ? `The prose is visibly carrying ${paragraphAnchorHits}/${context.chapter.paragraphs.length} planned paragraph anchors and the chapter mandate forward.`
          : argumentState === "warn"
            ? "The chapter is carrying some of the planned argumentative spine, but the throughline still needs more force."
            : "The finished prose is not yet clearly delivering the chapter's intended argument or narrative movement.",
    },
    {
      label: "Voice texture",
      state: voiceTextureState,
      detail:
        voiceTextureState === "pass"
          ? `Average sentence length sits around ${sentenceAverage} words, which supports a more naturally authored rhythm.`
          : "The prose rhythm is still flattening or slipping toward meta-writing patterns instead of sounding fully authored.",
    },
    {
      label: "Editorial review",
      state: reviewState,
      detail:
        review.aiAuthorshipFlags.length > 0
          ? `${review.aiAuthorshipFlags.length} AI-authorship flag(s) still need attention.`
          : review.overallAssessment,
    },
  ] as DraftQualityAssessment["signals"];
  const normalizedScore = Math.max(0, score);

  return {
    score: normalizedScore,
    readiness: normalizedScore >= 85 ? "strong" : normalizedScore >= 65 ? "watch" : "needs attention",
    needsRevision: review.verdict === "needs_revision" || normalizedScore < 78,
    signals,
    concerns,
  };
}

async function generateDraft(
  promise: PromiseBrief,
  context: ChapterContext,
  research: ChapterResearchDossier | null,
  externalStories: ChapterExternalStoryDossier | null,
  personalStories: PersonalStoryEncyclopedia | null,
  baseStory: BaseStoryBundle | null,
  baseStoryChapter: BaseStoryChapter | null,
  bookSetupProfile: BookSetupProfile | null,
  chapterTarget: ChapterWordTarget | null,
): Promise<ChapterDraftBundle> {
  const fallback = fallbackDraft(
    context,
    research,
    externalStories,
    personalStories,
    baseStory,
    baseStoryChapter,
    chapterTarget,
  );
  const model = await getAuthorModel();
  if (!model) {
    return fallback;
  }

  try {
    const structured = model.withStructuredOutput(DraftSchema);
    const authorInput = buildAuthorInputPacket(
      promise,
      context,
      research,
      externalStories,
      personalStories,
      baseStory,
      baseStoryChapter,
      bookSetupProfile,
      chapterTarget,
    );
    const framework = resolveDominantFramework(bookSetupProfile?.writerPersonaBlend);
    const isBiblicalLens = resolveResearchLens(bookSetupProfile?.researchLens).key === "biblical";
    const frameworkSlots = renderFrameworkSlotsForPrompt(framework, isBiblicalLens);
    // Shared book context is byte-identical across chapters — cached prefix.
    // Per-chapter packet drops the shared fields so they aren't re-sent.
    const sharedContext = buildSharedBookContextJson(promise, bookSetupProfile, baseStory);
    const {
      promise: _sharedPromise,
      bookSetupProfile: _sharedProfile,
      voice: _sharedVoice,
      baseStoryBook: _sharedBaseStory,
      ...chapterInput
    } = authorInput;
    const result = await structured.invoke([
      new SystemMessage({
        content: buildCachedSystemBlocks(
          `
You are a ghostwriter writing a finished nonfiction book chapter for a real author.

Your job is to write the best, most human chapter you can from the material available to you.
Write like a real human author, not like a planner, analyst, or assistant.

Hard rules:
- do not use em dashes
- do not use ellipses for effect
- do not sound like AI, a consultant, or a motivational LinkedIn post
- avoid cliches, filler, and generic transitions
- vary sentence rhythm naturally
- write polished nonfiction prose, not bullet summaries
- use the paragraph topic sentences as the structural spine
- use research, external stories, personal stories, and base-story thread only where they genuinely strengthen the chapter
- if manifestGuidance is present, honor its opening pattern, narrative arc, and source assignments for this chapter — it is the author-approved plan for how this chapter weaves its material
- if authorCraftNotes is present, treat every note as a standing rule from the author — these are corrections they already had to make once, and repeating a corrected mistake is the fastest way to lose their trust
- do not mechanically mention every input
- aim for the chapter target range if one is provided
- if the chapter risks being too short, deepen explanation, examples, and analysis instead of padding
- never output writing instructions, drafting notes, target-word reminders, or any meta-commentary about the writing process
- never write sentences that describe what the chapter or paragraph should do; just write the actual chapter prose
- use research judiciously: convert it into synthesized insight, not citation-shaped prose
- use external stories judiciously: choose only the few that create belief, tension, or emotional lift
- use personal stories judiciously: only when they add authenticity and are truly relevant
- never dump raw source titles, website navigation text, or publication labels into the prose
- chapter openings should read like real opening pages in a published nonfiction book
- every paragraph should read like finished prose, not an outline point with evidence attached
- synthesize source material into narrative and argument; never paste source phrasing unless it is a real short quote
- honor the ${framework.name} framework (the dominant persona is ${framework.dominantPersona}); the chapter's shape is defined by this framework, not by generic teaching structure
- every paragraph should make a concrete move, support it with specificity, and then turn that specificity into consequence, implication, or insight
- if a paragraph only restates the point, deepen it until it earns its place in the chapter

Writing approach:
- be conversational, convincing, and grounded
- structure the chapter using the ${framework.name} framework — walk these beats in order; do NOT mechanically label them, but let the prose embody the progression:
${frameworkSlots}
- favor finished sentences, real transitions, and genuine authorial voice
- if a source helps, absorb it into the argument as a human writer would
- if a story helps, tell only the part that earns its place in the chapter
- satisfy the source-weave plan when material is available: normally absorb at least one concrete research anchor, one outside story or case, one relevant personal-story beat, and the base-story thread when those inputs exist
- keep the chapter mandate alive on the page so the prose clearly carries the intended chapter purpose, thread role, and paragraph-level movement

Citation trace (required):
- every research entry and external story in your input carries an "id" field
- in sourceUsage.researchItemIds, list the exact id of every research entry whose substance you actually used in the prose
- in sourceUsage.externalStoryItemIds, list the exact id of every external story you actually told or referenced
- copy ids verbatim; never invent ids; leave the arrays empty if you used none
      `,
          sharedContext,
          "1h",
        ),
      }),
      new HumanMessage(JSON.stringify(chapterInput)),
    ]);

    return normalizeDraftResult(context, result);
  } catch (err) {
    console.error(`[chapter-draft] generateDraft failed for ${context.chapter?.chapterId ?? "unknown"}, using deterministic fallback draft:`, err);
    return fallback;
  }
}

function fallbackReview(draft: ChapterDraftBundle): ChapterReviewBundle {
  const aiFlags = draft.chapterText.includes("—")
    ? ["Contains an em dash, which violates the style guard."]
    : [];

  return {
    chapterKey: draft.chapterKey,
    overallAssessment:
      "The chapter has a usable backbone and clear structure, but it should be reviewed for stronger narrative texture and cleaner transitions.",
    strengths: [
      "The chapter follows the planned topic-sentence structure.",
      "The supporting material is relevant to the chapter promise.",
    ],
    concerns: aiFlags.length > 0 ? aiFlags : ["Some passages may still read more planned than lived."],
    revisionPriorities: [
      "Sharpen the opening hook so the chapter begins with more tension.",
      "Make sure any source material feels integrated rather than pasted in.",
    ],
    aiAuthorshipFlags: aiFlags,
    verdict: aiFlags.length > 0 ? "needs_revision" : "ready_for_review",
  };
}

async function reviewDraft(
  promise: PromiseBrief,
  context: ChapterContext,
  draft: ChapterDraftBundle,
  sourceWeaveFocus?: SourceWeaveRequirements,
  chapterTarget?: ChapterWordTarget | null,
): Promise<ChapterReviewBundle> {
  const fallback = fallbackReview(draft);
  const model = await getReviewerModel();
  const critic = await runAdversarialProseCritic(promise, context, draft, chapterTarget ?? null);
  if (!model) {
    return {
      ...fallback,
      overallAssessment: critic.summary || fallback.overallAssessment,
      concerns: [...new Set([...fallback.concerns, ...critic.paddingFlags, ...critic.voiceFlags])],
      revisionPriorities: [...new Set([...fallback.revisionPriorities, ...critic.recommendations])],
      aiAuthorshipFlags: [...new Set([...fallback.aiAuthorshipFlags, ...critic.aiTellFlags])],
      verdict:
        critic.riskLevel === "high" || critic.aiTellFlags.length > 0 || critic.paddingFlags.length > 0
          ? "needs_revision"
          : fallback.verdict,
    };
  }

  try {
    const structured = model.withStructuredOutput(ReviewSchema);
    const result = await structured.invoke([
      new SystemMessage({
        content: buildCachedSystemBlocks(
          `
You are the editorial feedback agent for a ghostwriting platform.

Review the draft like a sharp editor.

Rules:
- actively look for AI tells
- flag em dashes immediately
- flag generic abstractions, repetitive rhythm, inflated language, and consultant tone
- flag chapters that leave available research, outside stories, personal stories, or chapter-thread material underused
- flag paragraphs that never turn from evidence into consequence, interpretation, or implication
- prefer specific, actionable revision notes
- be tough but fair
      `,
          `SHARED BOOK CONTEXT (identical for every chapter in this run):\n${JSON.stringify({ promise })}`,
          "1h",
        ),
      }),
      new HumanMessage(
        JSON.stringify({
          chapter: context.chapter,
          sourceWeaveFocus,
          draft,
        }),
      ),
    ]);

    return {
      chapterKey: context.chapter.chapterId,
      overallAssessment: critic.summary
        ? `${result.overallAssessment} Adversarial critic: ${critic.summary}`
        : result.overallAssessment,
      strengths: result.strengths ?? [],
      concerns: [...new Set([...(result.concerns ?? []), ...critic.paddingFlags, ...critic.voiceFlags])],
      revisionPriorities: [...new Set([...(result.revisionPriorities ?? []), ...critic.recommendations])],
      aiAuthorshipFlags: [...new Set([...(result.aiAuthorshipFlags ?? []), ...critic.aiTellFlags])],
      verdict:
        result.verdict === "needs_revision" || critic.riskLevel === "high" || critic.aiTellFlags.length > 0
          ? "needs_revision"
          : result.verdict,
    };
  } catch (err) {
    console.error(`[chapter-draft] reviewDraft failed for ${context.chapter?.chapterId ?? "unknown"}, using deterministic fallback review:`, err);
    return {
      ...fallback,
      overallAssessment: critic.summary || fallback.overallAssessment,
      concerns: [...new Set([...fallback.concerns, ...critic.paddingFlags, ...critic.voiceFlags])],
      revisionPriorities: [...new Set([...fallback.revisionPriorities, ...critic.recommendations])],
      aiAuthorshipFlags: [...new Set([...fallback.aiAuthorshipFlags, ...critic.aiTellFlags])],
      verdict:
        critic.riskLevel === "high" || critic.aiTellFlags.length > 0 || critic.paddingFlags.length > 0
          ? "needs_revision"
          : fallback.verdict,
    };
  }
}

async function reviseDraft(
  promise: PromiseBrief,
  context: ChapterContext,
  draft: ChapterDraftBundle,
  review: ChapterReviewBundle,
  research: ChapterResearchDossier | null,
  externalStories: ChapterExternalStoryDossier | null,
  personalStories: PersonalStoryEncyclopedia | null,
  baseStory: BaseStoryBundle | null,
  baseStoryChapter: BaseStoryChapter | null,
  bookSetupProfile: BookSetupProfile | null,
  chapterTarget: ChapterWordTarget | null,
) {
  const model = await getAuthorModel();
  if (!model) {
    return draft;
  }

  try {
    const structured = model.withStructuredOutput(DraftSchema);
    const authorInput = buildAuthorInputPacket(
      promise,
      context,
      research,
      externalStories,
      personalStories,
      baseStory,
      baseStoryChapter,
      bookSetupProfile,
      chapterTarget,
    );
    const framework = resolveDominantFramework(bookSetupProfile?.writerPersonaBlend);
    const isBiblicalLens = resolveResearchLens(bookSetupProfile?.researchLens).key === "biblical";
    const frameworkSlots = renderFrameworkSlotsForPrompt(framework, isBiblicalLens);
    const sharedContext = buildSharedBookContextJson(promise, bookSetupProfile, baseStory);
    const {
      promise: _sharedPromise,
      bookSetupProfile: _sharedProfile,
      voice: _sharedVoice,
      baseStoryBook: _sharedBaseStory,
      ...chapterInput
    } = authorInput;
    const result = await structured.invoke([
      new SystemMessage({
        content: buildCachedSystemBlocks(
          `
Revise the chapter draft using the editorial feedback.

Hard rules:
- do not use em dashes
- remove AI-sounding phrasing
- keep the prose natural and human
- preserve the chapter structure and purpose
- keep the revised chapter inside the requested target band when possible
- remove any trace of meta-writing language, drafting instructions, or target-word commentary
- make the prose read like finished manuscript pages, not assembled source notes
- if a fact or story stays in the chapter, integrate it cleanly into the flow of the paragraph
- preserve and sharpen the intended ${framework.name} framework progression
- the dominant persona is ${framework.dominantPersona}; the revised chapter should walk these beats in order (do not label them — let the prose embody the progression):
${frameworkSlots}
- if research, outside stories, personal stories, or the base-story thread are available, make sure the revision uses the strongest ones intentionally rather than leaving them idle
- if authorCraftNotes is present, treat every note as a standing rule from the author — these are corrections they already had to make once; apply them throughout the revision
- make each paragraph earn itself by moving from assertion into consequence, interpretation, or real-world implication
- keep sourceUsage accurate: carry the input draft's researchItemIds/externalStoryItemIds forward, adding or removing ids only when the revision actually adds or drops that material
      `,
          sharedContext,
          "1h",
        ),
      }),
      new HumanMessage(
        JSON.stringify({
          authorInput: chapterInput,
          draft,
          review,
        }),
      ),
    ]);

    return normalizeDraftResult(context, result);
  } catch (err) {
    console.error(`[chapter-draft] reviseDraft failed for ${context.chapter?.chapterId ?? "unknown"}, keeping prior draft:`, err);
    return draft;
  }
}

async function tuneDraftToTarget(
  promise: PromiseBrief,
  context: ChapterContext,
  draft: ChapterDraftBundle,
  bookSetupProfile: BookSetupProfile | null,
  chapterTarget: ChapterWordTarget | null,
) {
  if (!chapterTarget) {
    return draft;
  }

  const model = await getAuthorModel();
  if (!model) {
    return forceDraftTowardTarget(context, draft, chapterTarget);
  }

  let workingDraft = draft;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const currentWordCount = countWords(workingDraft.chapterText);
    if (
      currentWordCount >= chapterTarget.minimumWords &&
      currentWordCount <= chapterTarget.maximumWords
    ) {
      return workingDraft;
    }

    try {
      const structured = model.withStructuredOutput(DraftSchema);
      const result = await structured.invoke([
        new SystemMessage(`
You are adjusting a chapter draft to the right length without changing its meaning.

Rules:
- do not use em dashes
- preserve the chapter's argument and structure
- if short, deepen analysis, examples, and transitions
- if long, cut repetition and collapse overlap
- keep the result natural and human
- this is not optional: you must move the chapter materially closer to the requested range
- if the chapter is far too short, add substantial developed prose, not filler
- each paragraph should do real explanatory, narrative, or persuasive work
- never answer with notes about the target; return only finished book prose
- copy the input draft's sourceUsage object through unchanged (including researchItemIds and externalStoryItemIds)
      `),
        new HumanMessage(
          JSON.stringify({
            promise,
            chapter: context.chapter,
            bookSetupProfile,
            chapterTarget,
            currentWordCount,
            targetDelta: chapterTarget.targetWords - currentWordCount,
            attempt: attempt + 1,
            draft: workingDraft,
          }),
        ),
      ]);

      workingDraft = normalizeDraftResult(context, result);
    } catch (err) {
      console.error(`[chapter-draft] tuneDraftToTarget attempt ${attempt + 1} failed for ${context.chapter?.chapterId ?? "unknown"}, forcing draft toward target deterministically:`, err);
      return forceDraftTowardTarget(context, workingDraft, chapterTarget);
    }
  }

  return forceDraftTowardTarget(context, workingDraft, chapterTarget);
}

async function generateSingleChapterDraft(
  bookId: string,
  promise: PromiseBrief,
  context: ChapterContext,
  baseStory: BaseStoryBundle | null,
  personalStories: PersonalStoryEncyclopedia | null,
  bookSetupProfile: BookSetupProfile | null,
  chapterTarget: ChapterWordTarget | null,
  workflowRunId?: string,
) {
  const [research, externalStories] = await Promise.all([
    getCommittedResearchDossier(bookId, context.chapter.chapterId),
    getCommittedExternalStoriesDossier(bookId, context.chapter.chapterId),
  ]);
  const baseStoryChapter = findBaseStoryChapter(baseStory, context.chapter.chapterId);
  const relevantPersonalStories = findRelevantPersonalStories(
    personalStories,
    context.chapter.chapterTitle,
  );
  const sourceWeaveFocus = buildSourceWeaveRequirements(
    research,
    externalStories,
    relevantPersonalStories.map((story) => ({
      title: story.title,
      summary: story.summary,
      whyItMatters: story.whyItMatters,
    })),
    baseStoryChapter,
  );
  const sourceAvailability = {
    researchCount:
      (research?.factBank.length ?? 0) +
      (research?.statistics.length ?? 0) +
      (research?.examples.length ?? 0),
    externalStoryCount: externalStories?.storyCandidates.length ?? 0,
    personalStoryCount: relevantPersonalStories.length,
    hasBaseStory: Boolean(baseStoryChapter),
  };

  const firstDraft = await generateDraft(
    promise,
    context,
    research,
    externalStories,
    personalStories,
    baseStory,
    baseStoryChapter,
    bookSetupProfile,
    chapterTarget,
  );
  let workingDraft = firstDraft;
  let review = await reviewDraft(promise, context, workingDraft, sourceWeaveFocus, chapterTarget);
  let quality = assessNonfictionDraftQuality(
    workingDraft,
    review,
    chapterTarget,
    sourceAvailability,
    context,
    sourceWeaveFocus,
  );
  let revisionPasses = 0;

  for (let attempt = 0; attempt < 2 && quality.needsRevision; attempt += 1) {
    workingDraft = await reviseDraft(
      promise,
      context,
      workingDraft,
      {
        ...review,
        verdict: "needs_revision",
        concerns: [...new Set([...review.concerns, ...quality.concerns])],
        revisionPriorities: [
          ...new Set([
            ...review.revisionPriorities,
            "Strengthen the weave between research, outside stories, personal stories, and the chapter thread.",
            "Push the chapter back toward the requested target range without sounding padded.",
            "Reduce any AI-shaped abstractions or repetitive explanatory rhythm.",
          ]),
        ],
      },
      research,
      externalStories,
      personalStories,
      baseStory,
      baseStoryChapter,
      bookSetupProfile,
      chapterTarget,
    );
    revisionPasses += 1;
    review = await reviewDraft(promise, context, workingDraft, sourceWeaveFocus, chapterTarget);
    quality = assessNonfictionDraftQuality(
      workingDraft,
      review,
      chapterTarget,
      sourceAvailability,
      context,
      sourceWeaveFocus,
    );
  }

  const finalDraft = await tuneDraftToTarget(
    promise,
    context,
    workingDraft,
    bookSetupProfile,
    chapterTarget,
  );
  const polishedDraft = await enforceFinishedBookProse(
    promise,
    context,
    finalDraft,
    bookSetupProfile,
  );
  review = await reviewDraft(promise, context, polishedDraft, sourceWeaveFocus, chapterTarget);
  quality = assessNonfictionDraftQuality(
    polishedDraft,
    review,
    chapterTarget,
    sourceAvailability,
    context,
    sourceWeaveFocus,
  );
  const finalDraftWithQuality: ChapterDraftBundle = {
    ...polishedDraft,
    quality: {
      score: quality.score,
      readiness: quality.readiness,
      needsRevision: quality.needsRevision,
      revisionPasses,
      signals: quality.signals,
    },
  };

  const draftVersion = await createChapterArtifactVersion({
    bookId,
    artifactType: ArtifactType.CHAPTER_DRAFT,
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    summary: finalDraftWithQuality.openingHook,
    contentJson: finalDraftWithQuality as unknown as Prisma.InputJsonValue,
    contentText: finalDraftWithQuality.chapterText,
    workflowRunId,
    promptTemplateVersion: "chapter-draft-author-v1",
    modelName: hasUsableOpenAIKey()
      ? process.env.OPENAI_CHAPTER_DRAFT_AUTHOR_MODEL ?? "gpt-5.4"
      : "local-fallback",
  });
  const reviewVersion = await createChapterArtifactVersion({
    bookId,
    artifactType: ArtifactType.EDITORIAL_REVIEW,
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    summary: review.overallAssessment,
    contentJson: review as unknown as Prisma.InputJsonValue,
    contentText: JSON.stringify(review, null, 2),
    workflowRunId,
    promptTemplateVersion: "chapter-draft-review-v1",
    modelName: hasUsableOpenAIKey()
      ? process.env.OPENAI_CHAPTER_DRAFT_REVIEWER_MODEL ?? "gpt-5.4"
      : "local-fallback",
  });

  return {
    draft: finalDraftWithQuality,
    review,
    draftVersion,
    reviewVersion,
    sourceAvailability: {
      ...sourceAvailability,
    },
  };
}

function isDraftInsideTargetBand(wordCount: number, chapterTarget: ChapterWordTarget | null) {
  if (!chapterTarget) {
    return true;
  }

  return wordCount >= chapterTarget.minimumWords && wordCount <= chapterTarget.maximumWords;
}

async function expandSingleChapterDraftTowardTarget(params: {
  bookId: string;
  promise: PromiseBrief;
  context: ChapterContext;
  baseStory: BaseStoryBundle | null;
  personalStories: PersonalStoryEncyclopedia | null;
  bookSetup: BookSetupProfile | null;
  chapterTarget: ChapterWordTarget | null;
}) {
  const { bookId, promise, context, baseStory, personalStories, bookSetup, chapterTarget } = params;
  const [research, externalStories, draftVersions, reviewVersions] = await Promise.all([
    getCommittedResearchDossier(bookId, context.chapter.chapterId),
    getCommittedExternalStoriesDossier(bookId, context.chapter.chapterId),
    getChapterArtifactVersions(bookId, context.chapter.chapterId, ArtifactType.CHAPTER_DRAFT, 1),
    getChapterArtifactVersions(bookId, context.chapter.chapterId, ArtifactType.EDITORIAL_REVIEW, 1),
  ]);

  const latestDraft = draftVersions[0]
    ? parseArtifactWithSchema(draftVersions[0].contentJson, ChapterDraftBundleSchema)
    : null;
  if (!latestDraft) {
    throw new Error(`No saved draft exists yet for ${context.chapter.chapterTitle}. Generate the chapter first.`);
  }

  if (isDraftInsideTargetBand(countWords(latestDraft.chapterText), chapterTarget)) {
    return {
      chapterKey: context.chapter.chapterId,
      chapterTitle: context.chapter.chapterTitle,
      expanded: false,
      wordCount: countWords(latestDraft.chapterText),
    };
  }

  const latestReview = reviewVersions[0]
    ? parseArtifactWithSchema(reviewVersions[0].contentJson, ChapterReviewBundleSchema)
    : null;
  const baseStoryChapter = findBaseStoryChapter(baseStory, context.chapter.chapterId);
  const relevantPersonalStories = findRelevantPersonalStories(
    personalStories,
    context.chapter.chapterTitle,
  );
  const sourceWeaveFocus = buildSourceWeaveRequirements(
    research,
    externalStories,
    relevantPersonalStories.map((story) => ({
      title: story.title,
      summary: story.summary,
      whyItMatters: story.whyItMatters,
    })),
    baseStoryChapter,
  );
  const sourceAvailability = {
    researchCount:
      (research?.factBank.length ?? 0) +
      (research?.statistics.length ?? 0) +
      (research?.examples.length ?? 0),
    externalStoryCount: externalStories?.storyCandidates.length ?? 0,
    personalStoryCount: relevantPersonalStories.length,
    hasBaseStory: Boolean(baseStoryChapter),
  };

  let expandedDraft = await tuneDraftToTarget(
    promise,
    context,
    latestDraft,
    bookSetup,
    chapterTarget,
  );
  expandedDraft = await enforceFinishedBookProse(
    promise,
    context,
    expandedDraft,
    bookSetup,
  );

  const review = await reviewDraft(
    promise,
    context,
    expandedDraft,
    sourceWeaveFocus,
    chapterTarget,
  );
  const quality = assessNonfictionDraftQuality(
    expandedDraft,
    review,
    chapterTarget,
    sourceAvailability,
    context,
    sourceWeaveFocus,
  );
  const finalDraft: ChapterDraftBundle = {
    ...expandedDraft,
    quality: {
      score: quality.score,
      readiness: quality.readiness,
      needsRevision: quality.needsRevision,
      revisionPasses: (latestDraft.quality?.revisionPasses ?? 0) + 1,
      signals: quality.signals,
    },
  };

  await createChapterArtifactVersion({
    bookId,
    artifactType: ArtifactType.CHAPTER_DRAFT,
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    summary: finalDraft.openingHook,
    contentJson: finalDraft as unknown as Prisma.InputJsonValue,
    contentText: finalDraft.chapterText,
    promptTemplateVersion: "chapter-draft-length-recovery-v1",
    modelName: hasUsableOpenAIKey()
      ? process.env.OPENAI_CHAPTER_DRAFT_AUTHOR_MODEL ?? "gpt-5.4"
      : "local-length-recovery",
  });
  await createChapterArtifactVersion({
    bookId,
    artifactType: ArtifactType.EDITORIAL_REVIEW,
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    summary:
      latestReview?.overallAssessment ??
      review.overallAssessment,
    contentJson: review as unknown as Prisma.InputJsonValue,
    contentText: JSON.stringify(review, null, 2),
    promptTemplateVersion: "chapter-draft-length-recovery-review-v1",
    modelName: hasUsableOpenAIKey()
      ? process.env.OPENAI_CHAPTER_DRAFT_REVIEWER_MODEL ?? "gpt-5.4"
      : "local-length-recovery",
  });

  return {
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    expanded: true,
    previousWordCount: countWords(latestDraft.chapterText),
    wordCount: countWords(finalDraft.chapterText),
  };
}

export async function expandChapterDraftTowardTargetWorkflow(bookSlug: string, chapterKey: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { promise, chapterContexts, baseStory, personalStories, bookSetup } = await getDraftInputs(book.id);
  const context = chapterContexts.find((entry) => entry.chapter.chapterId === chapterKey);
  if (!context) {
    throw new Error(`Chapter ${chapterKey} could not be found in the committed paragraph outline.`);
  }

  const chapterTargets = buildChapterWordTargets(chapterContexts, bookSetup?.targetWordCount);
  return expandSingleChapterDraftTowardTarget({
    bookId: book.id,
    promise,
    context,
    baseStory,
    personalStories,
    bookSetup,
    chapterTarget: chapterTargets.get(context.chapter.chapterId) ?? null,
  });
}

export async function expandUnderTargetChapterDraftsWorkflow(bookSlug: string, limit = 2) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { promise, chapterContexts, baseStory, personalStories, bookSetup } = await getDraftInputs(book.id);
  const chapterTargets = buildChapterWordTargets(chapterContexts, bookSetup?.targetWordCount);
  const candidates: Array<{ context: ChapterContext; deficit: number }> = [];

  for (const context of chapterContexts) {
    const latestDraftVersion = (await getChapterArtifactVersions(
      book.id,
      context.chapter.chapterId,
      ArtifactType.CHAPTER_DRAFT,
      1,
    ))[0];
    const latestDraft = latestDraftVersion
      ? parseArtifactWithSchema(latestDraftVersion.contentJson, ChapterDraftBundleSchema)
      : null;
    const target = chapterTargets.get(context.chapter.chapterId) ?? null;
    const currentWords = countWords(latestDraft?.chapterText ?? "");
    if (latestDraft && target && currentWords < target.minimumWords) {
      candidates.push({
        context,
        deficit: target.minimumWords - currentWords,
      });
    }
  }

  const selected = candidates
    .sort((left, right) => right.deficit - left.deficit)
    .slice(0, Math.max(1, limit));

  const results = [];
  for (const candidate of selected) {
    results.push(
      await expandSingleChapterDraftTowardTarget({
        bookId: book.id,
        promise,
        context: candidate.context,
        baseStory,
        personalStories,
        bookSetup,
        chapterTarget: chapterTargets.get(candidate.context.chapter.chapterId) ?? null,
      }),
    );
  }

  return {
    expandedChapterKeys: results.filter((entry) => entry.expanded).map((entry) => entry.chapterKey),
    inspectedChapterCount: chapterContexts.length,
    results,
  };
}

// Ground truth for "what still needs drafting" — same reasoning as
// getUnfinishedResearchChapterKeys in research.ts: a chapter a dead run
// never reached isn't recorded anywhere in stage metadata, so resume must
// check actual saved versions rather than trust in-memory progress state.
export async function getUnfinishedChapterDraftChapterKeys(bookId: string): Promise<string[]> {
  const { chapterContexts } = await getDraftInputs(bookId);
  const results = await Promise.all(
    chapterContexts.map(async (context) => {
      const versions = await getChapterArtifactVersions(
        bookId,
        context.chapter.chapterId,
        ArtifactType.CHAPTER_DRAFT,
        1,
      );
      return versions.length === 0 ? context.chapter.chapterId : null;
    }),
  );
  return results.filter((key): key is string => key !== null);
}

export async function runChapterDraftWorkflow(
  bookSlug: string,
  chapterKey?: string,
  chapterKeys?: string[],
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { promise, chapterContexts, baseStory, personalStories, bookSetup } = await getDraftInputs(
    book.id,
  );
  const chapterTargets = buildChapterWordTargets(chapterContexts, bookSetup?.targetWordCount);

  const requestedKeys = chapterKeys && chapterKeys.length > 0 ? new Set(chapterKeys) : null;
  const targetContexts = requestedKeys
    ? chapterContexts.filter((context) => requestedKeys.has(context.chapter.chapterId))
    : chapterKey
      ? chapterContexts.filter((context) => context.chapter.chapterId === chapterKey)
      : chapterContexts;

  if (targetContexts.length === 0) {
    throw new Error("No chapter contexts found for draft generation.");
  }

  const activityLog = (message: string, prior?: Array<{ at: string; message: string }>) =>
    [{ at: new Date().toISOString(), message }, ...(prior ?? [])].slice(0, 3);

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "running",
      totalChapters: targetContexts.length,
      completedChapters: 0,
      currentChapterKey: targetContexts[0]?.chapter.chapterId ?? null,
      recentActivity: activityLog(`Starting draft for ${targetContexts.length} chapter(s).`),
      lastRunAt: new Date().toISOString(),
    },
  });

  const generated = [];
  let recentActivity = activityLog(`Starting draft for ${targetContexts.length} chapter(s).`);

  for (const [index, context] of targetContexts.entries()) {
    recentActivity = activityLog(`Drafting ${context.chapter.chapterTitle}…`, recentActivity);
    await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
      status: StageStatus.IN_PROGRESS,
      metadataJson: {
        automationStatus: "running",
        totalChapters: targetContexts.length,
        completedChapters: index,
        currentChapterKey: context.chapter.chapterId,
        recentActivity,
        lastRunAt: new Date().toISOString(),
      },
    });

    const result = await generateSingleChapterDraft(
      book.id,
      promise,
      context,
      baseStory,
      personalStories,
      bookSetup,
      chapterTargets.get(context.chapter.chapterId) ?? null,
    );

    generated.push(result);
    recentActivity = activityLog(`Finished ${context.chapter.chapterTitle}.`, recentActivity);
  }

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: StageStatus.READY_FOR_REVIEW,
    metadataJson: {
      automationStatus: "ready_for_review",
      totalChapters: targetContexts.length,
      completedChapters: targetContexts.length,
      currentChapterKey: null,
      recentActivity: activityLog("All requested chapters drafted.", recentActivity),
      lastRunAt: new Date().toISOString(),
    },
  });

  return generated;
}

export async function enqueueChapterDraftWorkflow(
  bookSlug: string,
  chapterKey?: string,
  chapterKeys?: string[],
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const existing = await getActiveWorkflowRunForStage(book.id, StageKey.CHAPTER_DRAFT);
  if (existing) {
    return existing;
  }

  const { chapterContexts } = await getDraftInputs(book.id);
  const targetCount =
    chapterKeys && chapterKeys.length > 0
      ? chapterKeys.length
      : chapterKey
        ? 1
        : chapterContexts.length;

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "queued",
      totalChapters: targetCount,
      completedChapters: 0,
      currentChapterKey: chapterKeys?.[0] ?? chapterKey ?? null,
      lastRunAt: new Date().toISOString(),
    },
  });

  return createWorkflowRun({
    bookId: book.id,
    stageKey: StageKey.CHAPTER_DRAFT,
    inputJson: {
      kind: "chapter_draft_generation",
      bookSlug,
      chapterKey: chapterKey ?? null,
      chapterKeys: chapterKeys ?? null,
    },
  });
}

export async function processChapterDraftWorkflowRun(runId: string) {
  const run = await getWorkflowRunById(runId);
  if (!run) {
    throw new Error(`Workflow run ${runId} was not found.`);
  }

  const claimed = await claimWorkflowRun(runId);
  if (claimed.count === 0) {
    return { skipped: true };
  }

  const input = parseJson<Record<string, unknown>>(run.inputJson, {});
  const bookSlug = typeof input.bookSlug === "string" ? input.bookSlug : run.book.slug;
  const chapterKey = typeof input.chapterKey === "string" ? input.chapterKey : undefined;
  const chapterKeys = Array.isArray(input.chapterKeys)
    ? input.chapterKeys.filter((key): key is string => typeof key === "string")
    : undefined;

  try {
    const result = await runChapterDraftWorkflow(bookSlug, chapterKey, chapterKeys);
    await completeWorkflowRun(runId, result as unknown as Prisma.InputJsonValue);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chapter draft workflow error";
    await updateStageForBook(run.bookId, StageKey.CHAPTER_DRAFT, {
      status: StageStatus.BLOCKED,
      metadataJson: {
        automationStatus: "blocked",
        totalChapters:
          typeof input.chapterKey === "string" ? 1 : null,
        completedChapters: 0,
        currentChapterKey: null,
        lastRunAt: new Date().toISOString(),
        errorMessage: message,
      },
    });
    await failWorkflowRun(runId, message, {
      kind: "chapter_draft_generation_failed",
      bookSlug,
      chapterKey: chapterKey ?? null,
    });
    throw error;
  }
}

export async function enqueueAndTriggerChapterDraftWorkflow(
  bookSlug: string,
  trigger: (runId: string) => void,
  chapterKey?: string,
  chapterKeys?: string[],
) {
  const queued = await enqueueChapterDraftWorkflow(bookSlug, chapterKey, chapterKeys);
  if (queued.status === WorkflowRunStatus.QUEUED) {
    trigger(queued.id);
  }

  return queued;
}

export async function commitChapterDraftWorkflow(bookSlug: string, chapterKey: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const result = await commitChapterDraft(book.id, chapterKey);
  await clearStageStaleDependency(bookSlug, StageKey.CHAPTER_DRAFT);
  await invalidateDependentStagesForBook(bookSlug, StageKey.CHAPTER_DRAFT);
  return result;
}

export async function commitAllChapterDraftsWorkflow(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.CHAPTER_DRAFT);
  const { chapterContexts } = await getDraftInputs(book.id);

  if (chapterContexts.length === 0) {
    throw new Error("No committed outline chapters are available for chapter draft commit.");
  }

  const committedChapterKeys: string[] = [];
  const missingChapterKeys: string[] = [];
  const needsRevisionChapterKeys: string[] = [];

  for (const context of chapterContexts) {
    const draftVersions = await getChapterArtifactVersions(
      book.id,
      context.chapter.chapterId,
      ArtifactType.CHAPTER_DRAFT,
      1,
    );
    const latestVersion = draftVersions[0] ?? null;
    if (!latestVersion) {
      missingChapterKeys.push(context.chapter.chapterId);
      continue;
    }

    // A chapter whose revision passes were exhausted still carries
    // needsRevision — bulk commit must not silently ship it. It stays
    // uncommitted and reported; the author can repair it or commit it
    // individually (an explicit human override) via commitChapterDraftWorkflow.
    if (latestVersion.lifecycleState !== ArtifactStatus.COMMITTED) {
      const latestDraft = parseArtifactWithSchema(latestVersion.contentJson, ChapterDraftBundleSchema);
      if (latestDraft?.quality?.needsRevision) {
        needsRevisionChapterKeys.push(context.chapter.chapterId);
        continue;
      }
      await commitChapterDraft(book.id, context.chapter.chapterId);
    }

    committedChapterKeys.push(context.chapter.chapterId);
  }

  const metadata = parseMetadataRecord(stage?.metadataJson);
  const now = new Date().toISOString();
  const blockedCount = missingChapterKeys.length + needsRevisionChapterKeys.length;
  const holdSummary = [
    missingChapterKeys.length > 0 ? `${missingChapterKeys.length} still missing` : null,
    needsRevisionChapterKeys.length > 0
      ? `${needsRevisionChapterKeys.length} held for revision (${needsRevisionChapterKeys.join(", ")})`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: blockedCount === 0 ? StageStatus.COMMITTED : StageStatus.READY_FOR_REVIEW,
    committedAt: blockedCount === 0 ? new Date() : undefined,
    metadataJson: {
      ...metadata,
      automationStatus: blockedCount === 0 ? "committed" : "ready_for_review",
      currentAction:
        blockedCount === 0
          ? "All chapter drafts committed"
          : `Committed ${committedChapterKeys.length} chapter drafts. ${holdSummary}.`,
      totalChapters: chapterContexts.length,
      completedChapters: committedChapterKeys.length,
      needsRevisionChapterKeys,
      currentChapterKey: null,
      recentActivity: [
        {
          at: now,
          message:
            blockedCount === 0
              ? "Committed all chapter drafts."
              : `Committed all clean chapter drafts. ${holdSummary}.`,
        },
        ...(
          Array.isArray(metadata.recentActivity)
            ? (metadata.recentActivity as Array<{ at: string; message: string }>)
            : []
        ),
      ].slice(0, 10),
      lastRunAt: now,
    },
  });

  await clearStageStaleDependency(bookSlug, StageKey.CHAPTER_DRAFT);
  await invalidateDependentStagesForBook(bookSlug, StageKey.CHAPTER_DRAFT);

  return {
    committedChapterKeys,
    missingChapterKeys,
    needsRevisionChapterKeys,
    totalChapters: chapterContexts.length,
  };
}

export async function repairWeakChapterDraftsWorkflow(bookSlug: string, limit = 3) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { promise, chapterContexts, baseStory, personalStories, bookSetup } = await getDraftInputs(
    book.id,
  );
  const chapterTargets = buildChapterWordTargets(chapterContexts, bookSetup?.targetWordCount);

  const weakContexts: ChapterContext[] = [];
  for (const context of chapterContexts) {
    const [draftVersions, reviewVersions] = await Promise.all([
      getChapterArtifactVersions(book.id, context.chapter.chapterId, ArtifactType.CHAPTER_DRAFT, 1),
      getChapterArtifactVersions(book.id, context.chapter.chapterId, ArtifactType.EDITORIAL_REVIEW, 1),
    ]);
    const latestDraft = draftVersions[0]
      ? parseArtifactWithSchema(draftVersions[0].contentJson, ChapterDraftBundleSchema)
      : null;
    const latestReview = reviewVersions[0]
      ? parseArtifactWithSchema(reviewVersions[0].contentJson, ChapterReviewBundleSchema)
      : null;

    const needsRepair = Boolean(
      latestDraft &&
        latestDraft.chapterText.trim().length > 0 &&
        (
          !latestDraft.quality ||
          latestDraft.quality.signals.length === 0 ||
          latestDraft.quality.needsRevision ||
          latestReview?.verdict === "needs_revision"
        ),
    );

    if (needsRepair) {
      weakContexts.push(context);
    }
  }

  const targetContexts = weakContexts.slice(0, Math.max(1, limit));
  if (targetContexts.length === 0) {
    return {
      repairedChapterKeys: [],
      inspectedChapterCount: chapterContexts.length,
    };
  }

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: StageStatus.IN_PROGRESS,
    metadataJson: {
      automationStatus: "repairing_weak_chapters",
      totalChapters: targetContexts.length,
      completedChapters: 0,
      currentChapterKey: targetContexts[0]?.chapter.chapterId ?? null,
      currentAction: "Repairing weak chapter drafts",
      lastRunAt: new Date().toISOString(),
    },
  });

  const repairedChapterKeys: string[] = [];
  for (const [index, context] of targetContexts.entries()) {
    await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
      status: StageStatus.IN_PROGRESS,
      metadataJson: {
        automationStatus: "repairing_weak_chapters",
        totalChapters: targetContexts.length,
        completedChapters: index,
        currentChapterKey: context.chapter.chapterId,
        currentAction: `Repairing ${context.chapter.chapterTitle}`,
        lastRunAt: new Date().toISOString(),
      },
    });

    await generateSingleChapterDraft(
      book.id,
      promise,
      context,
      baseStory,
      personalStories,
      bookSetup,
      chapterTargets.get(context.chapter.chapterId) ?? null,
    );
    await commitChapterDraft(book.id, context.chapter.chapterId);
    repairedChapterKeys.push(context.chapter.chapterId);
  }

  await commitAllChapterDraftsWorkflow(bookSlug);

  return {
    repairedChapterKeys,
    inspectedChapterCount: chapterContexts.length,
  };
}

export async function getChapterDraftWorkspace(bookSlug: string, selectedChapterKey?: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.CHAPTER_DRAFT);
  const metadata = parseMetadataRecord(stage?.metadataJson);
  let chapterContexts: ChapterContext[] = [];
  let baseStory: BaseStoryBundle | null = null;
  let personalStories: PersonalStoryEncyclopedia | null = null;
  let bookSetup: BookSetupProfile | null = null;
  let blockingReason: string | null = null;

  try {
    const inputs = await getDraftInputs(book.id);
    chapterContexts = inputs.chapterContexts;
    baseStory = inputs.baseStory;
    personalStories = inputs.personalStories;
    bookSetup = inputs.bookSetup;
  } catch (error) {
    blockingReason = error instanceof Error ? error.message : "Chapter draft inputs are not ready.";
  }

  const chapterTargets = buildChapterWordTargets(chapterContexts, bookSetup?.targetWordCount);

  const entries = await Promise.all(
    chapterContexts.map(async (context) => {
      const [draftVersions, reviewVersions, research, externalStories] = await Promise.all([
        getChapterArtifactVersions(book.id, context.chapter.chapterId, ArtifactType.CHAPTER_DRAFT, 2),
        getChapterArtifactVersions(book.id, context.chapter.chapterId, ArtifactType.EDITORIAL_REVIEW, 2),
        getCommittedResearchDossier(book.id, context.chapter.chapterId),
        getCommittedExternalStoriesDossier(book.id, context.chapter.chapterId),
      ]);

      const latestDraft = draftVersions[0]
        ? parseArtifactWithSchema(draftVersions[0].contentJson, ChapterDraftBundleSchema)
        : null;
      const latestReview = reviewVersions[0]
        ? parseArtifactWithSchema(reviewVersions[0].contentJson, ChapterReviewBundleSchema)
        : null;
      const personalMatches = findRelevantPersonalStories(
        personalStories,
        context.chapter.chapterTitle,
      );
      const baseStoryChapter = findBaseStoryChapter(baseStory, context.chapter.chapterId);
      const chapterWordCount = countWords(latestDraft?.chapterText);
      const chapterPageCount = estimatePagesFromWords(
        chapterWordCount,
        bookSetup?.trimSize ?? "6 x 9 in",
      );
      const chapterTarget = chapterTargets.get(context.chapter.chapterId) ?? null;

      return {
        chapterKey: context.chapter.chapterId,
        chapterLabel: `Chapter ${context.chapter.chapterNumber}: ${context.chapter.chapterTitle}`,
        chapterTitle: context.chapter.chapterTitle,
        chapterDescription: context.chapter.chapterDescription,
        sectionTitle: context.section.sectionTitle,
        draftVersion: draftVersions[0] ?? null,
        reviewVersion: reviewVersions[0] ?? null,
        draft: latestDraft,
        review: latestReview,
        status: draftVersions[0]?.lifecycleState ?? "EMPTY",
        metrics: {
          wordCount: chapterWordCount,
          pageCount: chapterPageCount,
          targetWords: chapterTarget?.targetWords ?? null,
          minimumWords: chapterTarget?.minimumWords ?? null,
          maximumWords: chapterTarget?.maximumWords ?? null,
          deltaFromTarget:
            chapterTarget != null ? chapterWordCount - chapterTarget.targetWords : null,
        },
        sourceAvailability: {
          researchCount:
            (research?.factBank.length ?? 0) +
            (research?.statistics.length ?? 0) +
            (research?.examples.length ?? 0),
          externalStoryCount: externalStories?.storyCandidates.length ?? 0,
          personalStoryCount: personalMatches.length,
          hasBaseStory: Boolean(baseStoryChapter),
        },
        research,
        externalStories,
        personalStories: personalMatches,
        baseStoryChapter,
      };
    }),
  );

  const selectedEntry =
    entries.find((entry) => entry.chapterKey === selectedChapterKey) ?? entries[0] ?? null;
  const totalWords = entries.reduce((sum, entry) => sum + entry.metrics.wordCount, 0);
  const totalPages = entries.reduce((sum, entry) => sum + entry.metrics.pageCount, 0);
  const targetWordCount = bookSetup?.targetWordCount ?? null;
  const targetPageCount =
    bookSetup?.targetPageCount ??
    (targetWordCount
      ? estimatePagesFromWords(targetWordCount, bookSetup?.trimSize ?? "6 x 9 in")
      : null);
  const chaptersCompletedFromEntries = entries.filter((entry) => entry.metrics.wordCount > 0).length;

  return {
    book,
    stage,
    blockingReason,
    entries,
    selectedEntry,
    progress: {
      automationStatus:
        typeof metadata.automationStatus === "string" ? metadata.automationStatus : "idle",
      totalChapters:
        typeof metadata.totalChapters === "number" ? metadata.totalChapters : entries.length,
      completedChapters:
        typeof metadata.completedChapters === "number" ? metadata.completedChapters : 0,
      currentChapterKey:
        typeof metadata.currentChapterKey === "string" ? metadata.currentChapterKey : null,
      wordsWritten: totalWords,
      pagesWritten: totalPages,
      targetWordCount,
      targetPageCount,
      chapterCompletionPercent: toPercent(
        chaptersCompletedFromEntries,
        entries.length,
      ),
      wordCompletionPercent: targetWordCount ? toPercent(totalWords, targetWordCount) : 0,
    },
    setup: bookSetup,
  };
}
