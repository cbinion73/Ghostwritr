import {
  ArtifactStatus,
  ArtifactType,
} from "@prisma/client";

import {
  BaseStoryBundleSchema,
  BookSetupProfileSchema,
  ParagraphOutlineSchema,
  PromiseBriefSchema,
  parseArtifactWithSchema,
} from "../../artifact-schemas";
import type { BaseStoryBundle, BaseStoryChapter } from "../../base-story-types";
import { normalizeBaseStoryBundle } from "../../base-story-utils";
import type { BookSetupProfile, WriterPersonaBlend } from "../../book-setup-types";
import { getCraftNotes } from "../../craft-ledger";
import type { ChapterExternalStoryDossier } from "../../external-story-types";
import { db } from "../../db";
import type {
  ChapterParagraphPlan,
  SectionParagraphPlan,
} from "../../paragraph-outline-types";
import {
  Phase1StrategicBriefSchema,
  type Phase1StrategicBrief,
} from "../../phase1-strategic-brief";
import {
  getCompactPersonalStoryCardsForChapter,
} from "../../personal-story-contract";
import type { PersonalStoryEncyclopedia } from "../../personal-story-types";
import { CANONICAL_PERSONAS, type FrameworkStep } from "../../personas";
import type { PromiseBrief } from "../../promise-types";
import {
  validateQuillContextPacket,
  type QuillContextPacket,
} from "../../quill-context-contract";
import { getCommittedBaseStory } from "../../repositories/base-story-artifacts";
import { getCommittedBookSetup } from "../../repositories/book-setup-artifacts";
import { getCommittedOutlineExpansion } from "../../repositories/outline-artifacts";
import { getCommittedPersonalStoryEncyclopedia } from "../../repositories/personal-stories-artifacts";
import { getCommittedPhase1StrategicBrief } from "../../repositories/phase1-strategic-brief-artifacts";
import { getCommittedPromiseBrief } from "../../repositories/promise-artifacts";
import type { ChapterResearchDossier } from "../../research-types";
import {
  buildExternalStoryEvidenceContract,
  buildResearchEvidenceContract,
} from "../../source-evidence-contract";
import {
  findBaseStoryChapter,
  getCommittedExternalStoriesDossier,
  getCommittedResearchDossier,
} from "./source-availability";

export type ChapterContext = {
  section: SectionParagraphPlan;
  chapter: ChapterParagraphPlan;
  /** This chapter's section of the committed Chapter Manifest (pattern/arc/
   * source-assignment guidance), when one exists. */
  manifestGuidance?: string | null;
  /** Book-level craft ledger — the author's accumulated revision feedback,
   * injected into every draft/revise call so it persists across chapters. */
  craftNotes?: string[];
};

export type ChapterDraftInputs = {
  phase1StrategicBrief: Phase1StrategicBrief | null;
  promise: PromiseBrief;
  paragraphOutline: NonNullable<ReturnType<typeof parseParagraphOutlineForType>>;
  chapterContexts: ChapterContext[];
  baseStory: BaseStoryBundle;
  personalStories: PersonalStoryEncyclopedia;
  bookSetup: BookSetupProfile | null;
};

export type ResolvedFramework = {
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

function parseParagraphOutlineForType(value: unknown) {
  return parseArtifactWithSchema(value, ParagraphOutlineSchema);
}

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
export function extractManifestChapterGuidance(
  manifestText: string | null,
  chapterTitle: string,
) {
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

function summarizeApprovedBrief(phase1StrategicBrief: Phase1StrategicBrief | null) {
  if (!phase1StrategicBrief) {
    return "";
  }
  return [
    phase1StrategicBrief.promise.statement,
    phase1StrategicBrief.promise.bigIdea,
    phase1StrategicBrief.audience.primary,
    phase1StrategicBrief.market.strategicPriority,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

/**
 * Resolve the dominant persona's chapter-shaping framework from a voice blend.
 * Rule: highest percentInfluence wins; ties broken by personaId (deterministic).
 * Falls back to AndyGPT's ME-WE-TRUTH-YOU-WE if no blend is set.
 */
export function resolveDominantFramework(
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

function buildVoiceGuideForQuillPacket(bookSetupProfile: BookSetupProfile | null) {
  const framework = resolveDominantFramework(bookSetupProfile?.writerPersonaBlend);
  const guidance = [
    ...(bookSetupProfile?.writerPersonaGuidance ?? []),
    ...(bookSetupProfile?.voiceReferenceNotes ?? []),
    ...(bookSetupProfile?.voiceTone ? [bookSetupProfile.voiceTone] : []),
    ...(bookSetupProfile?.notesToSystem ?? []),
    `Use the ${framework.name} framework led by ${framework.dominantPersona}.`,
  ].filter((value) => value.trim().length > 0);

  return {
    present: Boolean(bookSetupProfile && guidance.length > 0),
    dominantPersona: framework.dominantPersona,
    guidance,
  };
}

export function buildQuillContextReadinessPacket(input: {
  phase1StrategicBrief: Phase1StrategicBrief | null;
  context: ChapterContext;
  research: ChapterResearchDossier | null;
  externalStories: ChapterExternalStoryDossier | null;
  personalStories: PersonalStoryEncyclopedia | null;
  baseStoryChapter: BaseStoryChapter | null;
  bookSetupProfile: BookSetupProfile | null;
}): QuillContextPacket {
  return {
    chapter: {
      chapterKey: input.context.chapter.chapterId,
      chapterTitle: input.context.chapter.chapterTitle,
    },
    approvedBrief: {
      approved: Boolean(input.phase1StrategicBrief?.readiness.isComplete),
      summary: summarizeApprovedBrief(input.phase1StrategicBrief),
    },
    paragraphOutline: {
      current: input.context.chapter.paragraphs.length > 0,
      paragraphs: input.context.chapter.paragraphs.map((paragraph) => ({
        id: paragraph.id,
        topicSentence: paragraph.topicSentence,
        purpose: paragraph.purpose,
        wordCountTarget: paragraph.wordCountTarget,
      })),
    },
    baseStoryGuidance: {
      present: Boolean(input.baseStoryChapter),
      draftingInstruction: input.baseStoryChapter
        ? [
            input.baseStoryChapter.threadRole,
            input.baseStoryChapter.guidance.narrativeFunction,
            input.baseStoryChapter.guidance.continuityCue,
            input.baseStoryChapter.guidance.draftingInstruction,
          ]
            .filter((value) => value.trim().length > 0)
            .join(" ")
        : "",
    },
    evidence: {
      research: input.research ? buildResearchEvidenceContract(input.research).records : [],
      externalStories: input.externalStories
        ? buildExternalStoryEvidenceContract(input.externalStories).records
        : [],
    },
    personalStories: getCompactPersonalStoryCardsForChapter(input.personalStories, {
      chapterKey: input.context.chapter.chapterId,
      chapterTitle: input.context.chapter.chapterTitle,
    }),
    voiceGuide: buildVoiceGuideForQuillPacket(input.bookSetupProfile),
    craftNotes: input.context.craftNotes ?? [],
  };
}

export function validateQuillContextReadiness(input: {
  phase1StrategicBrief: Phase1StrategicBrief | null;
  context: ChapterContext;
  research: ChapterResearchDossier | null;
  externalStories: ChapterExternalStoryDossier | null;
  personalStories: PersonalStoryEncyclopedia | null;
  baseStoryChapter: BaseStoryChapter | null;
  bookSetupProfile: BookSetupProfile | null;
}) {
  const packet = buildQuillContextReadinessPacket(input);
  const validation = validateQuillContextPacket(packet);
  const issues = [...validation.issues];

  if ((input.research?.verificationSummary.verifiedItems ?? 0) <= 0) {
    issues.push("No admissible Research evidence is assigned to this chapter.");
  }
  if ((input.externalStories?.verificationSummary.verifiedStories ?? 0) <= 0) {
    issues.push("No admissible External Story evidence is assigned to this chapter.");
  }

  return {
    ok: issues.length === 0,
    issues,
    packet,
  };
}

export async function getDraftInputs(bookId: string, targetChapterKeys?: string[]) {
  const phase1StrategicBriefVersion = await getCommittedPhase1StrategicBrief(bookId);
  const promiseVersion = await getCommittedPromiseBrief(bookId);
  const paragraphOutlineVersion = await getCommittedOutlineExpansion(bookId);
  const bookSetupVersion = await getCommittedBookSetup(bookId);
  const baseStory = await getCommittedBaseStoryBundle(bookId);
  const personalStories = await getCommittedPersonalStoriesEncyclopedia(bookId);
  const manifestText = await getCommittedManifestText(bookId);
  const craftNotes = await getCraftNotes(bookId);

  const phase1StrategicBrief = parseArtifactWithSchema(
    phase1StrategicBriefVersion?.contentJson,
    Phase1StrategicBriefSchema,
  );
  const promise = parseArtifactWithSchema(promiseVersion?.contentJson, PromiseBriefSchema);
  const bookSetup = parseArtifactWithSchema(bookSetupVersion?.contentJson, BookSetupProfileSchema);
  const paragraphOutline = parseParagraphOutlineForType(paragraphOutlineVersion?.contentJson);

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

  const allChapterContexts = paragraphOutline.sections.flatMap((section) =>
    section.chapters.map((chapter) => ({
      section,
      chapter,
      manifestGuidance: extractManifestChapterGuidance(manifestText, chapter.chapterTitle),
      craftNotes,
    })),
  );
  const requested = targetChapterKeys?.length ? new Set(targetChapterKeys) : null;
  const chapterContexts = requested
    ? allChapterContexts.filter((context) => requested.has(context.chapter.chapterId))
    : allChapterContexts;
  if (requested && chapterContexts.length !== requested.size) {
    throw new Error("One or more selected chapters do not exist in the committed paragraph outline.");
  }

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
          ? research.verificationSummary.verifiedItems > 0
          : false,
        hasExternalStories: externalStories
          ? externalStories.verificationSummary.verifiedStories > 0
          : false,
        quillContextIssues: validateQuillContextReadiness({
          phase1StrategicBrief,
          context,
          research,
          externalStories,
          personalStories,
          baseStoryChapter: findBaseStoryChapter(baseStory, context.chapter.chapterId),
          bookSetupProfile: bookSetup,
        }).issues,
      };
    }),
  );

  const chaptersMissingResearch = readinessChecks
    .filter((entry) => !entry.hasResearch)
    .map((entry) => entry.chapterTitle);
  const chaptersMissingStories = readinessChecks
    .filter((entry) => !entry.hasExternalStories)
    .map((entry) => entry.chapterTitle);
  const chaptersWithInvalidQuillContext = readinessChecks
    .filter((entry) => entry.quillContextIssues.length > 0)
    .map((entry) => ({
      chapterTitle: entry.chapterTitle,
      issues: entry.quillContextIssues,
    }));

  if (
    chaptersMissingResearch.length > 0 ||
    chaptersMissingStories.length > 0 ||
    chaptersWithInvalidQuillContext.length > 0
  ) {
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
    if (chaptersWithInvalidQuillContext.length > 0) {
      const preview = chaptersWithInvalidQuillContext
        .slice(0, 3)
        .map((entry) => `${entry.chapterTitle}: ${entry.issues.slice(0, 3).join("; ")}`)
        .join(" | ");
      parts.push(
        `Quill context is not ready for ${preview}${chaptersWithInvalidQuillContext.length > 3 ? " | and others" : ""}`,
      );
    }

    throw new Error(
      `${parts.join(". ")}. Chapter drafting is intentionally blocked until every chapter packet contains only approved, current, admissible, permissioned, and voice-guided material.`,
    );
  }

  return {
    phase1StrategicBrief,
    promise,
    paragraphOutline,
    chapterContexts,
    baseStory,
    personalStories,
    bookSetup,
  };
}
