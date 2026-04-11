import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  ArtifactType,
  Prisma,
  StageKey,
  StageStatus,
  WorkflowRunStatus,
} from "@prisma/client";
import { z } from "zod";

import { getModelForRole } from "../llm/routing";
import type { BaseStoryBundle, BaseStoryChapter } from "../base-story-types";
import type { BookSetupProfile } from "../book-setup-types";
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
import { getOrCreateBookBySlug, getStageForBook, updateStageForBook } from "../repositories/books";
import { getCommittedBookSetup } from "../repositories/book-setup-artifacts";
import {
  commitChapterDraft,
  createChapterArtifactVersion,
  getChapterArtifactVersions,
} from "../repositories/chapter-draft-artifacts";
import {
  getBaseStoryVersions,
  getCommittedBaseStory,
} from "../repositories/base-story-artifacts";
import {
  getCommittedExternalStoryPack,
  getExternalStoryPackVersions,
} from "../repositories/external-stories-artifacts";
import {
  getCommittedOutlineExpansion,
} from "../repositories/outline-artifacts";
import {
  getCommittedPersonalStoryEncyclopedia,
  getPersonalStoryArtifactVersions,
} from "../repositories/personal-stories-artifacts";
import { getCommittedPromiseBrief } from "../repositories/promise-artifacts";
import {
  getCommittedResearchPack,
  getResearchPackVersions,
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
};

type ChapterWordTarget = {
  chapterKey: string;
  targetWords: number;
  minimumWords: number;
  maximumWords: number;
  weight: number;
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
    maxRetries: 0,
  });
}

async function getReviewerModel() {
  // Routed via provider layer: Sonnet for fast revision
  return getModelForRole("chapter-draft:revise", {
    temperature: 0.2,
    maxOutputTokens: 8000,
    timeoutMs: 30000,
    maxRetries: 0,
  });
}

async function getLatestOrCommittedResearch(bookId: string, chapterKey: string) {
  const committed = await getCommittedResearchPack(bookId, chapterKey);
  if (committed) {
    return parseJson<ChapterResearchDossier | null>(committed.contentJson, null);
  }
  const versions = await getResearchPackVersions(bookId, chapterKey, 1);
  return versions[0] ? parseJson<ChapterResearchDossier | null>(versions[0].contentJson, null) : null;
}

async function getLatestOrCommittedExternalStories(bookId: string, chapterKey: string) {
  const committed = await getCommittedExternalStoryPack(bookId, chapterKey);
  if (committed) {
    return parseJson<ChapterExternalStoryDossier | null>(committed.contentJson, null);
  }
  const versions = await getExternalStoryPackVersions(bookId, chapterKey, 1);
  return versions[0]
    ? parseJson<ChapterExternalStoryDossier | null>(versions[0].contentJson, null)
    : null;
}

async function getLatestOrCommittedBaseStory(bookId: string) {
  const committed = await getCommittedBaseStory(bookId);
  if (committed) {
    return normalizeBaseStoryBundle(parseJson<BaseStoryBundle | null>(committed.contentJson, null));
  }
  const versions = await getBaseStoryVersions(bookId, 1);
  return normalizeBaseStoryBundle(
    versions[0] ? parseJson<BaseStoryBundle | null>(versions[0].contentJson, null) : null,
  );
}

async function getLatestOrCommittedPersonalStories(bookId: string) {
  const committed = await getCommittedPersonalStoryEncyclopedia(bookId);
  if (committed) {
    return normalizeEncyclopedia(committed.contentJson);
  }
  const versions = await getPersonalStoryArtifactVersions(
    bookId,
    ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
    1,
  );
  return versions[0] ? normalizeEncyclopedia(versions[0].contentJson) : null;
}

async function getDraftInputs(bookId: string) {
  const promiseVersion = await getCommittedPromiseBrief(bookId);
  const paragraphOutlineVersion = await getCommittedOutlineExpansion(bookId);
  const bookSetupVersion = await getCommittedBookSetup(bookId);
  const baseStory = await getLatestOrCommittedBaseStory(bookId);
  const personalStories = await getLatestOrCommittedPersonalStories(bookId);

  const promise = parseJson<PromiseBrief | null>(promiseVersion?.contentJson, null);
  const bookSetup = parseJson<BookSetupProfile | null>(bookSetupVersion?.contentJson, null);
  const paragraphOutline = parseJson<ParagraphOutline | null>(
    paragraphOutlineVersion?.contentJson,
    null,
  );

  if (!promise || !paragraphOutline) {
    throw new Error(
      "Committed Promise and committed paragraph-level Outline are required before generating chapter drafts.",
    );
  }

  if (!baseStory || baseStory.chapters.length === 0) {
    throw new Error(
      "Base Story must be generated before chapter drafting can begin.",
    );
  }

  const chapterContexts = paragraphOutline.sections.flatMap((section) =>
    section.chapters.map((chapter) => ({ section, chapter })),
  );

  const readinessChecks = await Promise.all(
    chapterContexts.map(async (context) => {
      const [research, externalStories] = await Promise.all([
        getLatestOrCommittedResearch(bookId, context.chapter.chapterId),
        getLatestOrCommittedExternalStories(bookId, context.chapter.chapterId),
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

    return {
      id: paragraph.id,
      topicSentence: paragraph.topicSentence,
      prose: sanitizeDraftProse(
        [
          paragraph.topicSentence,
          paragraph.purpose,
          researchItem?.summary || researchItem?.claimText
            ? `In practice, this pressure shows up in ${cleanEvidenceText(
                (researchItem?.summary || researchItem?.claimText || "").toLowerCase(),
              )}.`
            : null,
          externalStory?.summary
            ? `${cleanEvidenceText(externalStory.summary)}`
            : null,
          personalStory?.summary
            ? `${personalStory.summary}`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      ),
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
  } catch {
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
    };
  },
): ChapterDraftBundle {
  const paragraphs: ChapterDraftParagraph[] = result.paragraphs.map((paragraph) => ({
    id: paragraph.id,
    topicSentence: paragraph.topicSentence,
    prose: sanitizeDraftProse(paragraph.prose),
    sourceNotes: paragraph.sourceNotes ?? [],
  }));

  return {
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    chapterDescription: context.chapter.chapterDescription,
    sectionTitle: context.section.sectionTitle,
    openingHook: result.openingHook,
    narrativeThread: result.narrativeThread,
    chapterText: sanitizeDraftProse(result.chapterText),
    paragraphs,
    sourceUsage: {
      research: result.sourceUsage.research ?? [],
      externalStories: result.sourceUsage.externalStories ?? [],
      personalStories: result.sourceUsage.personalStories ?? [],
      baseStory: result.sourceUsage.baseStory ?? [],
    },
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
    const result = await structured.invoke([
      new SystemMessage(`
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
- do not mechanically mention every input
- aim for the chapter target range if one is provided
- if the chapter risks being too short, deepen explanation, examples, and analysis instead of padding
- never output writing instructions, drafting notes, target-word reminders, or any meta-commentary about the writing process
- never write sentences that describe what the chapter or paragraph should do; just write the actual chapter prose
- use research judiciously: convert it into synthesized insight, not citation-shaped prose
- use external stories judiciously: choose only the few that create belief, tension, or emotional lift
- use personal stories judiciously: only when they add authenticity and are truly relevant
- never dump raw source titles, website navigation text, or publication labels into the prose
- write this as a finished chapter for the book Lean Labs, not as planning notes or a dossier summary
- chapter openings should read like real opening pages in a published nonfiction book
- every paragraph should read like finished prose, not an outline point with evidence attached
- synthesize source material into narrative and argument; never paste source phrasing unless it is a real short quote
- honor the book-level and chapter-level me, we, truth, you, we movement passed in the input packet
- let the me and we movements build tension, let truth relieve tension with a clear solution, and let you and weClosing create ownership, application, and shared forward motion

Writing approach:
- be conversational, convincing, and grounded
- use the me, we, truth, you, we movement where it fits naturally:
  me: open with lived tension, scene, observation, or a concrete human moment
  we: expand that moment into a shared professional reality the reader recognizes
  truth: land the chapter's core insight with clarity and authority
  you: help the reader see what this means for their own choices and behavior
  we: return to the broader mission, team, or future-state the chapter is building toward
- do not mechanically label those moves; just make the prose feel that progression
- favor finished sentences, real transitions, and genuine authorial voice
- if a source helps, absorb it into the argument as a human writer would
- if a story helps, tell only the part that earns its place in the chapter
      `),
      new HumanMessage(JSON.stringify(authorInput)),
    ]);

    return normalizeDraftResult(context, result);
  } catch {
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
): Promise<ChapterReviewBundle> {
  const fallback = fallbackReview(draft);
  const model = await getReviewerModel();
  if (!model) {
    return fallback;
  }

  try {
    const structured = model.withStructuredOutput(ReviewSchema);
    const result = await structured.invoke([
      new SystemMessage(`
You are the editorial feedback agent for a ghostwriting platform.

Review the draft like a sharp editor.

Rules:
- actively look for AI tells
- flag em dashes immediately
- flag generic abstractions, repetitive rhythm, inflated language, and consultant tone
- prefer specific, actionable revision notes
- be tough but fair
      `),
      new HumanMessage(
        JSON.stringify({
          promise,
          chapter: context.chapter,
          draft,
        }),
      ),
    ]);

    return {
      chapterKey: context.chapter.chapterId,
      overallAssessment: result.overallAssessment,
      strengths: result.strengths ?? [],
      concerns: result.concerns ?? [],
      revisionPriorities: result.revisionPriorities ?? [],
      aiAuthorshipFlags: result.aiAuthorshipFlags ?? [],
      verdict: result.verdict,
    };
  } catch {
    return fallback;
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
    const result = await structured.invoke([
      new SystemMessage(`
Revise the chapter draft using the editorial feedback.

Hard rules:
- do not use em dashes
- remove AI-sounding phrasing
- keep the prose natural and human
- preserve the chapter structure and purpose
- keep the revised chapter inside the requested target band when possible
- remove any trace of meta-writing language, drafting instructions, or target-word commentary
- make the prose read like finished Lean Labs manuscript pages, not assembled source notes
- if a fact or story stays in the chapter, integrate it cleanly into the flow of the paragraph
- preserve and sharpen the intended me, we, truth, you, we movement
- make sure me and we build pressure, truth provides relief, and you plus weClosing turn toward ownership and application
      `),
      new HumanMessage(
        JSON.stringify({
          authorInput,
          draft,
          review,
        }),
      ),
    ]);

    return normalizeDraftResult(context, result);
  } catch {
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
    return draft;
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
    } catch {
      return workingDraft;
    }
  }

  return workingDraft;
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
    getLatestOrCommittedResearch(bookId, context.chapter.chapterId),
    getLatestOrCommittedExternalStories(bookId, context.chapter.chapterId),
  ]);
  const baseStoryChapter = findBaseStoryChapter(baseStory, context.chapter.chapterId);

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
  const review = await reviewDraft(promise, context, firstDraft);
  const revisedDraft =
    review.verdict === "needs_revision"
      ? await reviseDraft(
          promise,
          context,
          firstDraft,
          review,
          research,
          externalStories,
          personalStories,
          baseStory,
          baseStoryChapter,
          bookSetupProfile,
          chapterTarget,
        )
      : firstDraft;
  const finalDraft = await tuneDraftToTarget(
    promise,
    context,
    revisedDraft,
    bookSetupProfile,
    chapterTarget,
  );
  const polishedDraft = await enforceFinishedBookProse(
    promise,
    context,
    finalDraft,
    bookSetupProfile,
  );

  const draftVersion = await createChapterArtifactVersion({
    bookId,
    artifactType: ArtifactType.CHAPTER_DRAFT,
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    summary: polishedDraft.openingHook,
    contentJson: polishedDraft as unknown as Prisma.InputJsonValue,
    contentText: polishedDraft.chapterText,
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
    draft: polishedDraft,
    review,
    draftVersion,
    reviewVersion,
    sourceAvailability: {
      researchCount:
        (research?.factBank.length ?? 0) +
        (research?.statistics.length ?? 0) +
        (research?.examples.length ?? 0),
      externalStoryCount: externalStories?.storyCandidates.length ?? 0,
      personalStoryCount: findRelevantPersonalStories(
        personalStories,
        context.chapter.chapterTitle,
      ).length,
      hasBaseStory: Boolean(baseStoryChapter),
    },
  };
}

export async function runChapterDraftWorkflow(bookSlug: string, chapterKey?: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const { promise, chapterContexts, baseStory, personalStories, bookSetup } = await getDraftInputs(
    book.id,
  );
  const chapterTargets = buildChapterWordTargets(chapterContexts, bookSetup?.targetWordCount);

  const targetContexts = chapterKey
    ? chapterContexts.filter((context) => context.chapter.chapterId === chapterKey)
    : chapterContexts;

  if (targetContexts.length === 0) {
    throw new Error("No chapter contexts found for draft generation.");
  }

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "running",
      totalChapters: targetContexts.length,
      completedChapters: 0,
      currentChapterKey: targetContexts[0]?.chapter.chapterId ?? null,
      lastRunAt: new Date().toISOString(),
    },
  });

  const generated = [];

  for (const [index, context] of targetContexts.entries()) {
    await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
      status: StageStatus.IN_PROGRESS,
      metadataJson: {
        automationStatus: "running",
        totalChapters: targetContexts.length,
        completedChapters: index,
        currentChapterKey: context.chapter.chapterId,
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
  }

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: StageStatus.READY_FOR_REVIEW,
    metadataJson: {
      automationStatus: "ready_for_review",
      totalChapters: targetContexts.length,
      completedChapters: targetContexts.length,
      currentChapterKey: null,
      lastRunAt: new Date().toISOString(),
    },
  });

  return generated;
}

export async function enqueueChapterDraftWorkflow(bookSlug: string, chapterKey?: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const existing = await getActiveWorkflowRunForStage(book.id, StageKey.CHAPTER_DRAFT);
  if (existing) {
    return existing;
  }

  const { chapterContexts } = await getDraftInputs(book.id);
  const targetCount = chapterKey ? 1 : chapterContexts.length;

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "queued",
      totalChapters: targetCount,
      completedChapters: 0,
      currentChapterKey: chapterKey ?? null,
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

  try {
    const result = await runChapterDraftWorkflow(bookSlug, chapterKey);
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
) {
  const queued = await enqueueChapterDraftWorkflow(bookSlug, chapterKey);
  if (queued.status === WorkflowRunStatus.QUEUED) {
    trigger(queued.id);
  }

  return queued;
}

export async function commitChapterDraftWorkflow(bookSlug: string, chapterKey: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return commitChapterDraft(book.id, chapterKey);
}

export async function getChapterDraftWorkspace(bookSlug: string, selectedChapterKey?: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.CHAPTER_DRAFT);
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
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
        getLatestOrCommittedResearch(book.id, context.chapter.chapterId),
        getLatestOrCommittedExternalStories(book.id, context.chapter.chapterId),
      ]);

      const latestDraft = draftVersions[0]
        ? parseJson<ChapterDraftBundle | null>(draftVersions[0].contentJson, null)
        : null;
      const latestReview = reviewVersions[0]
        ? parseJson<ChapterReviewBundle | null>(reviewVersions[0].contentJson, null)
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
