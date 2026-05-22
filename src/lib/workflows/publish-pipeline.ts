/**
 * getPublishPipelineData — lightweight data fetcher for the Export & Publishing Pipeline page.
 *
 * This is NOT an agent workspace loader. It only reads committed artifact state and
 * computes a deterministic validation report. No LLM calls, no editorial judgment.
 */

import { db } from "@/lib/db";
import { getBookStageLinks } from "@/lib/navigation";
import type { BookWorkflowType } from "@prisma/client";

export type ValidationLevel = "error" | "warning" | "notice";

export type ValidationItem = {
  level: ValidationLevel;
  code: string;
  message: string;
};

export type PipelineChapter = {
  id: string;
  title: string;
  /** "COMMITTED" = approved and locked. "REVIEW_READY" = draft awaiting approval. Anything else = draft. */
  artifactStatus: string;
  wordCount: number;
};

export type StageReadiness = {
  bookSetup: string | null;
  outline: string | null;
  chapterDraft: string | null;
  editing: string | null;
};

export type PublishPipelineData = {
  book: {
    id: string;
    title: string | null;
    subtitle: string | null;
    slug: string;
    workflowType: BookWorkflowType;
    authorName: string | null;
    targetWordCount: number | null;
  };
  stages: StageReadiness;
  chapters: PipelineChapter[];
  summary: {
    totalChapters: number;
    committedChapters: number;
    totalWords: number;
    committedWords: number;
  };
  validation: ValidationItem[];
  stageLinks: ReturnType<typeof getBookStageLinks>;
  canExport: boolean;
};

export async function getPublishPipelineData(slug: string): Promise<PublishPipelineData> {
  const book = await db.book.findUnique({
    where: { slug },
    select: {
      id: true,
      titleWorking: true,
      subtitle: true,
      metadataJson: true,
      workflowType: true,
    },
  });
  if (!book) throw new Error("Book not found");

  // ── Stage statuses ───────────────────────────────────────────────────────────
  const stages = await db.bookStage.findMany({
    where: {
      bookId: book.id,
      stageKey: { in: ["BOOK_SETUP", "OUTLINE", "CHAPTER_DRAFT", "EDITING"] },
    },
    select: { stageKey: true, status: true, id: true },
  });
  const stageMap = new Map(stages.map((s) => [s.stageKey, s]));

  // ── Chapter draft artifacts ──────────────────────────────────────────────────
  const chapterStageId = stageMap.get("CHAPTER_DRAFT")?.id ?? null;
  const chapterArtifacts = chapterStageId
    ? await db.artifact.findMany({
        where: { bookId: book.id, stageId: chapterStageId },
        select: {
          id: true,
          title: true,
          status: true,
          versions: {
            select: { contentText: true },
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const chapters: PipelineChapter[] = chapterArtifacts.map((a) => {
    const text = a.versions[0]?.contentText ?? "";
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    return {
      id: a.id,
      title: a.title ?? "Untitled Chapter",
      artifactStatus: a.status,
      wordCount,
    };
  });

  // ── Derived counts ───────────────────────────────────────────────────────────
  const committedChapters = chapters.filter((c) => c.artifactStatus === "COMMITTED");
  const totalWords = chapters.reduce((s, c) => s + c.wordCount, 0);
  const committedWords = committedChapters.reduce((s, c) => s + c.wordCount, 0);

  // ── Book metadata ────────────────────────────────────────────────────────────
  const meta =
    book.metadataJson && typeof book.metadataJson === "object"
      ? (book.metadataJson as Record<string, unknown>)
      : {};
  const authorName = typeof meta.authorName === "string" ? meta.authorName : null;
  const targetWordCount =
    meta.targetWordCount != null ? Number(meta.targetWordCount) : null;

  // ── Stage status snapshot ────────────────────────────────────────────────────
  const stageReadiness: StageReadiness = {
    bookSetup: stageMap.get("BOOK_SETUP")?.status ?? null,
    outline: stageMap.get("OUTLINE")?.status ?? null,
    chapterDraft: stageMap.get("CHAPTER_DRAFT")?.status ?? null,
    editing: stageMap.get("EDITING")?.status ?? null,
  };

  // ── Validation report ────────────────────────────────────────────────────────
  const validation: ValidationItem[] = [];

  // ERRORS — block export
  if (!book.titleWorking) {
    validation.push({
      level: "error",
      code: "MISSING_TITLE",
      message: "Book title is required. Set it in Book Setup before exporting.",
    });
  }
  if (committedChapters.length === 0) {
    validation.push({
      level: "error",
      code: "NO_COMMITTED_CHAPTERS",
      message:
        "No committed chapter drafts found. Commit at least one chapter before generating an export package.",
    });
  }

  // WARNINGS — export allowed, but review before publishing
  if (chapters.length > 0 && committedChapters.length < chapters.length) {
    const missing = chapters.length - committedChapters.length;
    validation.push({
      level: "warning",
      code: "PARTIAL_CHAPTERS",
      message: `${missing} of ${chapters.length} chapter${chapters.length !== 1 ? "s" : ""} ${missing !== 1 ? "are" : "is"} not committed. The export will include only committed chapters.`,
    });
  }

  if (stageReadiness.editing !== "COMMITTED") {
    validation.push({
      level: "warning",
      code: "EDITING_NOT_COMMITTED",
      message:
        "Reed's editing stage is not committed. The manuscript has not received a final editorial pass.",
    });
  }

  if (!book.subtitle) {
    validation.push({
      level: "warning",
      code: "MISSING_SUBTITLE",
      message: "Subtitle is missing. Recommended for publishing metadata.",
    });
  }

  if (targetWordCount && committedWords > 0) {
    const pct = committedWords / targetWordCount;
    if (pct < 0.8) {
      validation.push({
        level: "warning",
        code: "BELOW_WORD_TARGET",
        message: `Committed manuscript is ${committedWords.toLocaleString()} words — ${Math.round((1 - pct) * 100)}% below the ${targetWordCount.toLocaleString()}-word target.`,
      });
    } else if (pct > 1.25) {
      validation.push({
        level: "warning",
        code: "ABOVE_WORD_TARGET",
        message: `Committed manuscript is ${committedWords.toLocaleString()} words — ${Math.round((pct - 1) * 100)}% above the ${targetWordCount.toLocaleString()}-word target.`,
      });
    }
  }

  // NOTICES — informational only
  if (stageReadiness.outline !== "COMMITTED") {
    validation.push({
      level: "notice",
      code: "OUTLINE_NOT_COMMITTED",
      message:
        "Outline stage is not committed. Chapter structure is derived from saved drafts, not the finalized outline.",
    });
  }

  validation.push({
    level: "notice",
    code: "ON_DEMAND_EXPORT",
    message:
      "Export packages are generated on demand and not stored. Each download reflects the current committed artifact state at the time of generation.",
  });

  validation.push({
    level: "notice",
    code: "SOURCE_ARTIFACTS_UNCHANGED",
    message:
      "The pipeline is non-destructive. Generating a package does not modify any source artifacts.",
  });

  // ── Can export? ──────────────────────────────────────────────────────────────
  const hasErrors = validation.some((v) => v.level === "error");
  const canExport = !hasErrors && committedChapters.length > 0;

  return {
    book: {
      id: book.id,
      title: book.titleWorking ?? null,
      subtitle: book.subtitle ?? null,
      slug,
      workflowType: book.workflowType,
      authorName,
      targetWordCount,
    },
    stages: stageReadiness,
    chapters,
    summary: {
      totalChapters: chapters.length,
      committedChapters: committedChapters.length,
      totalWords,
      committedWords,
    },
    validation,
    stageLinks: getBookStageLinks(book.workflowType, slug),
    canExport,
  };
}
