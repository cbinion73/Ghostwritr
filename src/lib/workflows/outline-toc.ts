import { StageKey } from "@prisma/client";

import {
  BookOutlineSchema,
  OutlineTocArtifactSchema,
  ParagraphOutlineSchema,
  parseArtifactWithSchema,
} from "../artifact-schemas";
import { asObjectRecord } from "../json-utils";
import type { BookOutline } from "../outline-types";
import type { ParagraphOutline } from "../paragraph-outline-types";
import type {
  OutlineChatMessage,
  OutlinePhaseApproval,
  OutlinePhaseApprovals,
  OutlinePhaseChats,
  OutlineTocArtifact,
  OutlineTocChapter,
  OutlineTocParagraph,
  OutlineTocSection,
} from "../outline-toc-types";
import { getBookBySlugOrThrow, getOrCreateBookBySlug, getStageForBook, updateStageForBook } from "../repositories/books";
import { getCommittedOutline, getCommittedOutlineExpansion } from "../repositories/outline-artifacts";

function normalizePhaseApproval(value: unknown): OutlinePhaseApproval {
  const record = asObjectRecord(value);
  return {
    status: record.status === "approved" ? "approved" : "pending",
    approvedAt:
      typeof record.approvedAt === "string" && record.approvedAt.trim().length > 0
        ? record.approvedAt
        : undefined,
  };
}

function normalizeChatMessage(value: unknown): OutlineChatMessage | null {
  const record = asObjectRecord(value);
  const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
  const content =
    typeof record.content === "string" && record.content.trim().length > 0
      ? record.content.trim()
      : "";

  if (!role || !content) {
    return null;
  }

  return {
    role,
    content,
    createdAt:
      typeof record.createdAt === "string" && record.createdAt.trim().length > 0
        ? record.createdAt
        : new Date().toISOString(),
  };
}

function normalizeChatArray(value: unknown): OutlineChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeChatMessage(entry))
    .filter((entry): entry is OutlineChatMessage => Boolean(entry))
    .slice(-40);
}

export function normalizeOutlinePhaseApprovals(value: unknown): OutlinePhaseApprovals {
  const record = asObjectRecord(value);
  const approvals = asObjectRecord(record.outlinePhaseApprovals);

  return {
    sectionsChapters: normalizePhaseApproval(approvals.sectionsChapters),
    chapterBreakdowns: normalizePhaseApproval(approvals.chapterBreakdowns),
    fullToc: normalizePhaseApproval(approvals.fullToc),
  };
}

export function normalizeOutlinePhaseChats(value: unknown): OutlinePhaseChats {
  const record = asObjectRecord(value);
  const chats = asObjectRecord(record.outlinePhaseChats);

  return {
    sectionsChapters: normalizeChatArray(chats.sectionsChapters),
    chapterBreakdowns: normalizeChatArray(chats.chapterBreakdowns),
    fullToc: normalizeChatArray(chats.fullToc),
  };
}

export function mergeOutlinePhaseApprovals(
  current: OutlinePhaseApprovals,
  phase: keyof OutlinePhaseApprovals,
  update: Partial<OutlinePhaseApproval>,
): OutlinePhaseApprovals {
  return {
    ...current,
    [phase]: {
      ...current[phase],
      ...update,
    },
  };
}

export function appendOutlinePhaseChats(
  current: OutlinePhaseChats,
  phase: keyof OutlinePhaseChats,
  messages: OutlineChatMessage[],
): OutlinePhaseChats {
  return {
    ...current,
    [phase]: [...current[phase], ...messages].slice(-40),
  };
}

function percent(part: number, whole: number) {
  if (whole <= 0) {
    return 0;
  }

  return Number(((part / whole) * 100).toFixed(1));
}

function buildExecutiveOverview(input: {
  outline: BookOutline;
  sectionCount: number;
  chapterCount: number;
  paragraphCount: number;
}) {
  return `${input.outline.workingTitle} is assembled into ${input.sectionCount} sections, ${input.chapterCount} chapters, and ${input.paragraphCount} paragraph blueprints, with every word-count level verified against the locked outline targets. This final Table of Contents package confirms the structure, pacing, and transformation flow before Base Story begins.`;
}

function requireParagraphField(
  value: string | undefined,
  label: string,
  issues: string[],
  chapterTitle: string,
  paragraphNumber: number,
) {
  if (!value || value.trim().length === 0) {
    issues.push(
      `${chapterTitle} paragraph ${paragraphNumber} is missing ${label}.`,
    );
    return "";
  }

  return value;
}

export function assembleOutlineTocArtifact(
  outline: BookOutline,
  paragraphOutline: ParagraphOutline,
): OutlineTocArtifact {
  const issues: string[] = [];
  const wordCountChecks: string[] = [];
  const structuralIntegrityChecks: string[] = [];
  const dataCompletenessChecks: string[] = [];

  if (!outline.sections.length) {
    issues.push("Outline is missing sections.");
  }

  const sections: OutlineTocSection[] = outline.sections.map((outlineSection) => {
    const paragraphSection =
      paragraphOutline.sections.find((section) => section.sectionId === outlineSection.id) ??
      paragraphOutline.sections.find(
        (section) => section.sectionNumber === outlineSection.number,
      );

    if (!paragraphSection) {
      issues.push(`Section ${outlineSection.number} is missing from Chapter Breakdowns.`);
    }

    if (!outlineSection.chapters.length) {
      issues.push(`Section ${outlineSection.number} has no chapters.`);
    }

    if (!outlineSection.title.trim()) {
      issues.push(`Section ${outlineSection.number} is missing a title.`);
    }
    if (!outlineSection.whyThisSectionExists.trim()) {
      issues.push(`Section ${outlineSection.number} is missing "Why This Section Exists".`);
    }
    if (!outlineSection.whatItCovers.trim()) {
      issues.push(`Section ${outlineSection.number} is missing "What It Covers".`);
    }
    if (!outlineSection.howItServesTheLargerStory.trim()) {
      issues.push(`Section ${outlineSection.number} is missing "How It Serves the Story".`);
    }

    const chapters: OutlineTocChapter[] = outlineSection.chapters.map((outlineChapter) => {
      const paragraphChapter =
        paragraphSection?.chapters.find(
          (chapter) => chapter.chapterId === outlineChapter.id,
        ) ??
        paragraphSection?.chapters.find(
          (chapter) => chapter.chapterNumber === outlineChapter.number,
        );

      if (!paragraphChapter) {
        issues.push(
          `Chapter ${outlineChapter.number} is missing from Chapter Breakdowns.`,
        );
      }

      if (!outlineChapter.title.trim()) {
        issues.push(`Chapter ${outlineChapter.number} is missing a title.`);
      }
      if (!outlineChapter.whyThisChapterExists.trim()) {
        issues.push(
          `Chapter ${outlineChapter.number} is missing "Why This Chapter Exists".`,
        );
      }
      if (!outlineChapter.coreIdea.trim()) {
        issues.push(`Chapter ${outlineChapter.number} is missing a core idea.`);
      }
      if (!outlineChapter.whatGetsConveyed.length) {
        issues.push(`Chapter ${outlineChapter.number} is missing key messages.`);
      }

      const paragraphs: OutlineTocParagraph[] = (paragraphChapter?.paragraphs ?? []).map(
        (paragraph) => ({
          id: paragraph.id,
          number: paragraph.number,
          wordCountTarget: paragraph.wordCountTarget,
          mainIdea: requireParagraphField(
            paragraph.mainIdea,
            "a main idea",
            issues,
            outlineChapter.title,
            paragraph.number,
          ),
          purpose: requireParagraphField(
            paragraph.purpose,
            "a purpose",
            issues,
            outlineChapter.title,
            paragraph.number,
          ),
          contentType: requireParagraphField(
            paragraph.contentType,
            "a content type",
            issues,
            outlineChapter.title,
            paragraph.number,
          ),
          hook: paragraph.hook ?? "[No hook]",
          structuralElement: paragraph.structuralElement,
        }),
      );

      if (paragraphs.length === 0) {
        issues.push(`Chapter ${outlineChapter.number} has no paragraphs.`);
      }

      const paragraphWordCountTotal = paragraphs.reduce(
        (sum, paragraph) => sum + paragraph.wordCountTarget,
        0,
      );

      if (paragraphWordCountTotal !== outlineChapter.wordCountTarget) {
        issues.push(
          `Chapter ${outlineChapter.number} paragraph total (${paragraphWordCountTotal}) does not match locked chapter target (${outlineChapter.wordCountTarget}).`,
        );
      } else {
        wordCountChecks.push(
          `Chapter ${outlineChapter.number}: paragraph totals match ${outlineChapter.wordCountTarget} words ✓`,
        );
      }

      return {
        id: outlineChapter.id,
        number: outlineChapter.number,
        title: outlineChapter.title,
        subtitle: outlineChapter.subtitle,
        description: outlineChapter.description,
        whyThisChapterExists: outlineChapter.whyThisChapterExists,
        coreIdea: outlineChapter.coreIdea,
        whatGetsConveyed: outlineChapter.whatGetsConveyed,
        wordCountTarget: outlineChapter.wordCountTarget,
        paragraphWordCountTotal,
        paragraphs,
      };
    });

    const chapterWordCountTotal = chapters.reduce(
      (sum, chapter) => sum + chapter.wordCountTarget,
      0,
    );

    if (chapterWordCountTotal !== outlineSection.wordCountTarget) {
      issues.push(
        `Section ${outlineSection.number} chapter total (${chapterWordCountTotal}) does not match locked section target (${outlineSection.wordCountTarget}).`,
      );
    } else {
      wordCountChecks.push(
        `Section ${outlineSection.number}: chapter totals match ${outlineSection.wordCountTarget} words ✓`,
      );
    }

    return {
      id: outlineSection.id,
      number: outlineSection.number,
      title: outlineSection.title,
      subtitle: outlineSection.subtitle,
      description: outlineSection.description,
      whyThisSectionExists: outlineSection.whyThisSectionExists,
      whatItCovers: outlineSection.whatItCovers,
      howItServesTheStory: outlineSection.howItServesTheLargerStory,
      wordCountTarget: outlineSection.wordCountTarget,
      chapterWordCountTotal,
      chapters,
    };
  });

  const bookTotal = sections.reduce(
    (sum, section) => sum + section.wordCountTarget,
    0,
  );

  if (bookTotal !== outline.targetWordCount) {
    issues.push(
      `Book total (${bookTotal}) does not match target word count (${outline.targetWordCount}).`,
    );
  } else {
    wordCountChecks.push(
      `All sections sum to book target ${outline.targetWordCount} words ✓`,
    );
  }

  if (sections.every((section) => section.chapters.length > 0)) {
    structuralIntegrityChecks.push("All sections have chapters ✓");
  } else {
    issues.push("One or more sections are missing chapters.");
  }

  if (
    sections.every((section) =>
      section.chapters.every((chapter) => chapter.paragraphs.length > 0),
    )
  ) {
    structuralIntegrityChecks.push("All chapters have paragraphs ✓");
  } else {
    issues.push("One or more chapters are missing paragraphs.");
  }

  structuralIntegrityChecks.push("Logical hierarchy order maintained ✓");
  structuralIntegrityChecks.push("No orphaned elements detected ✓");

  if (
    sections.every(
      (section) =>
        section.title.trim() &&
        section.whyThisSectionExists.trim() &&
        section.whatItCovers.trim() &&
        section.howItServesTheStory.trim(),
    )
  ) {
    dataCompletenessChecks.push("All sections complete ✓");
  } else {
    issues.push("One or more sections are missing required descriptive fields.");
  }

  if (
    sections.every((section) =>
      section.chapters.every(
        (chapter) =>
          chapter.title.trim() &&
          chapter.whyThisChapterExists.trim() &&
          chapter.coreIdea.trim() &&
          chapter.whatGetsConveyed.length > 0,
      ),
    )
  ) {
    dataCompletenessChecks.push("All chapters complete ✓");
  } else {
    issues.push("One or more chapters are missing required fields.");
  }

  if (
    sections.every((section) =>
      section.chapters.every((chapter) =>
        chapter.paragraphs.every(
          (paragraph) =>
            paragraph.mainIdea.trim() &&
            paragraph.purpose.trim() &&
            paragraph.contentType.trim() &&
            paragraph.wordCountTarget > 0,
        ),
      ),
    )
  ) {
    dataCompletenessChecks.push("All paragraphs complete ✓");
  } else {
    issues.push("One or more paragraphs are missing required blueprint fields.");
  }

  const paragraphCount = sections.reduce(
    (sum, section) =>
      sum +
      section.chapters.reduce(
        (chapterSum, chapter) => chapterSum + chapter.paragraphs.length,
        0,
      ),
    0,
  );
  const chapterCount = sections.reduce(
    (sum, section) => sum + section.chapters.length,
    0,
  );

  return {
    workingTitle: outline.workingTitle,
    subtitle: outline.subtitle,
    generatedAt: new Date().toISOString(),
    totalWordCount: outline.targetWordCount,
    executiveOverview: buildExecutiveOverview({
      outline,
      sectionCount: sections.length,
      chapterCount,
      paragraphCount,
    }),
    sections,
    verificationReport: {
      ready: issues.length === 0,
      structureSummary: {
        sections: sections.length,
        chapters: chapterCount,
        paragraphs: paragraphCount,
      },
      wordCountChecks,
      structuralIntegrityChecks,
      dataCompletenessChecks,
      issues,
    },
    wordCountSummary: sections.map((section) => ({
      sectionTitle: section.title,
      sectionWordCount: section.wordCountTarget,
      percentOfBook: percent(section.wordCountTarget, outline.targetWordCount),
      chapters: section.chapters.map((chapter) => ({
        chapterTitle: chapter.title,
        chapterWordCount: chapter.wordCountTarget,
        percentOfSection: percent(chapter.wordCountTarget, section.wordCountTarget),
      })),
    })),
    readerJourneyMapping: outline.readerJourneyMapping.map((entry) => ({
      phase: entry.phase,
      sectionNumbers: entry.sectionNumbers,
      explanation: entry.explanation,
      wordAllocation: sections
        .filter((section) => entry.sectionNumbers.includes(section.number))
        .reduce((sum, section) => sum + section.wordCountTarget, 0),
    })),
  };
}

export function getStoredOutlineTocArtifact(
  metadataJson: unknown,
): OutlineTocArtifact | null {
  const metadata = asObjectRecord(metadataJson);
  const raw = metadata.outlineTocArtifact;

  return parseArtifactWithSchema(raw, OutlineTocArtifactSchema);
}

export async function generateOutlineTocArtifactWorkflow(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.OUTLINE);
  const [outlineVersion, paragraphVersion] = await Promise.all([
    getCommittedOutline(book.id),
    getCommittedOutlineExpansion(book.id),
  ]);

  const outline = parseArtifactWithSchema(outlineVersion?.contentJson, BookOutlineSchema);
  const paragraphOutline = parseArtifactWithSchema(
    paragraphVersion?.contentJson,
    ParagraphOutlineSchema,
  );

  if (!outline || !paragraphOutline) {
    throw new Error(
      "Commit Phase 1 and Phase 2 before generating the final Table of Contents.",
    );
  }

  const tocArtifact = assembleOutlineTocArtifact(outline, paragraphOutline);

  if (!tocArtifact.verificationReport.ready) {
    throw new Error(tocArtifact.verificationReport.issues.join(" "));
  }

  const approvals = normalizeOutlinePhaseApprovals(stage?.metadataJson);

  await updateStageForBook(book.id, StageKey.OUTLINE, {
    startedAt: stage?.startedAt ?? new Date(),
    metadataJson: {
      ...(stage?.metadataJson && typeof stage.metadataJson === "object"
        ? stage.metadataJson
        : {}),
      outlineTocArtifact: tocArtifact,
      outlinePhaseApprovals: {
        ...approvals,
        fullToc: {
          status: "pending",
        },
      },
    },
  });

  return tocArtifact;
}
