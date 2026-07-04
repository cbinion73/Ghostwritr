import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ArtifactStatus, ActorType, StageKey } from "@prisma/client";

import { getModelForRole } from "../llm/routing";
import { renumberBookOutline, type BookOutline, type OutlineChapter } from "../outline-types";
import { setChapterGenerationProgress, clearChapterGenerationProgress } from "./outline-progress-tracker";
import {
  renumberParagraphOutline,
  type ChapterParagraphPlan,
  type ParagraphOutline,
  type ParagraphPlan,
} from "../paragraph-outline-types";
import { db } from "../db";
import { clearStageStaleDependency, invalidateDependentStagesForBook } from "../workflow-dependencies";
import { getBookBySlugOrThrow, getOrCreateBookBySlug } from "../repositories/books";
import {
  commitOutlineExpansionBundle,
  createOutlineExpansionVersion,
  getCommittedOutline,
  getCommittedOutlineExpansion,
  getOutlineExpansionVersions,
} from "../repositories/outline-artifacts";
import {
  saveChapterParagraphPlan,
  getChapterParagraphPlans,
} from "../repositories/chapter-paragraph-artifacts";

type ParagraphWorkflowState = {
  bookSlug: string;
  bookId?: string;
  committedOutline?: BookOutline | null;
  paragraphOutline?: ParagraphOutline;
  revisionComment?: string;
  revisionTargetId?: string;
  revisionTargetType?: "chapter" | "paragraph";
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function isChapterParagraphPlan(value: unknown): value is ChapterParagraphPlan {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.chapterId === "string" && Array.isArray(record.paragraphs);
}

const CHAPTER_PARAGRAPH_SYSTEM_PROMPT = `
You are designing the paragraph outline for a single chapter in a nonfiction book.

Input:
- Chapter title, description, core idea
- Chapter word count target
- Internal structure label (e.g., ME-WE-TRUTH-YOU-WE)
- Book context (title, pitch, overall theme)

Return JSON only. No markdown fences. No commentary.

For this chapter, generate:
- paragraphs (array of paragraph objects)

For each paragraph:
- mainIdea (what this paragraph delivers)
- purpose (why it exists in the chapter flow)
- contentType (scene, example, data, framework, dialogue, story, question)
- wordCountTarget (word budget for this paragraph)
- hook (if this paragraph opens the chapter or marks a major shift; otherwise "[No hook]")
- structuralElement (if applicable: ME, WE, TRUTH, YOU, or leave blank)

Rules:
- Paragraph word counts must sum exactly to the chapter word count target
- Paragraph count should fit the chapter scope (4-8 paragraphs typical)
- Hooks appear on opening paragraph and major transitions
- Structure should reflect the chapter's internal architecture
- No paragraphs without a clear purpose

Output shape:
{
  "paragraphs": [
    {
      "mainIdea": "...",
      "purpose": "...",
      "contentType": "scene",
      "wordCountTarget": 350,
      "hook": "..." or "[No hook]",
      "structuralElement": "ME"
    }
  ]
}
`;

async function getChatModel() {
  const model = await getModelForRole("outline:phase-2", {
    temperature: 0.2,
    maxOutputTokens: 8000,
    timeoutMs: 120000,
  });
  if (!model) {
    console.error("getModelForRole returned null for outline:phase-2");
    console.error("ANTHROPIC_API_KEY exists:", Boolean(process.env.ANTHROPIC_API_KEY));
  }
  return model;
}

function extractJsonText(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || start > end) {
    throw new Error("No valid JSON object found in response");
  }

  return text.slice(start, end + 1);
}

function distributeWordCounts(total: number, desired: number[]): number[] {
  if (desired.length === 0) return [];

  const weights = desired.map((w) => (w > 0 ? w : 1));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const baseCounts = weights.map((w) => Math.floor((total * w) / weightSum));

  let assigned = baseCounts.reduce((a, b) => a + b, 0);
  const fractions = weights
    .map((w, i) => ({ i, frac: (total * w) / weightSum - baseCounts[i] }))
    .sort((a, b) => b.frac - a.frac);

  let cursor = 0;
  while (assigned < total) {
    baseCounts[fractions[cursor % fractions.length].i] += 1;
    assigned += 1;
    cursor += 1;
  }

  while (assigned > total) {
    const i = fractions[cursor % fractions.length].i;
    if (baseCounts[i] > 1) {
      baseCounts[i] -= 1;
      assigned -= 1;
    }
    cursor += 1;
  }

  return baseCounts;
}

export async function generateChapterParagraphPlan(
  chapter: OutlineChapter,
  bookContext: { title: string; pitch?: string; wordCountTarget: number },
): Promise<ChapterParagraphPlan> {
  console.log("[generateChapterParagraphPlan] Starting");
  const model = await getChatModel();

  if (!model) {
    console.error("[generateChapterParagraphPlan] No model available");
    throw new Error("No LLM model available for chapter paragraph generation");
  }

  console.log("[generateChapterParagraphPlan] Got model");

  const prompt = `
Book: "${bookContext.title}"
Chapter: "${chapter.title}"
Description: ${chapter.description}
Core Idea: ${chapter.coreIdea}
Word Count Target: ${chapter.wordCountTarget} words
Structure: ${chapter.internalStructureLabel || "Natural flow"}

Generate a paragraph outline for this chapter.
`;

  try {
    console.log("[generateChapterParagraphPlan] Invoking model");
    const response = await model.invoke([
      new SystemMessage(CHAPTER_PARAGRAPH_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);
    console.log("[generateChapterParagraphPlan] Got response");

    const text = typeof response.content === "string" ? response.content : String(response.content);
    const jsonText = extractJsonText(text);
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    const rawParagraphs = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [];

    if (rawParagraphs.length === 0) {
      throw new Error("No paragraphs generated");
    }

    // Normalize paragraphs
    const paragraphs: ParagraphPlan[] = rawParagraphs
      .map((p: unknown, idx: number) => {
        const para = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
        return {
          id: `${chapter.id}-para-${idx + 1}`,
          number: idx + 1,
          topicSentence: String(para.mainIdea || `Paragraph ${idx + 1}`),
          mainIdea: String(para.mainIdea || `Paragraph ${idx + 1}`),
          purpose: String(para.purpose || ""),
          contentType: String(para.contentType || "framework"),
          wordCountTarget: Math.max(1, Math.round(Number(para.wordCountTarget) || 100)),
          hook: String(para.hook || "[No hook]"),
          structuralElement: String(para.structuralElement || ""),
        };
      });

    // Validate and redistribute word counts
    const totalWords = paragraphs.reduce((sum, p) => sum + p.wordCountTarget, 0);
    const finalWords = totalWords === chapter.wordCountTarget
      ? paragraphs.map((p) => p.wordCountTarget)
      : distributeWordCounts(
          chapter.wordCountTarget,
          paragraphs.map((p) => p.wordCountTarget),
        );

    const finalParagraphs = paragraphs.map((p, i) => ({
      ...p,
      wordCountTarget: finalWords[i],
    }));

    return {
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      chapterDescription: chapter.description,
      chapterWordCountTarget: chapter.wordCountTarget,
      calculationDisplay: finalParagraphs
        .map((p) => `[Para ${p.number}: ${p.wordCountTarget}w]`)
        .join(" + ") + ` = [${chapter.wordCountTarget}w]`,
      structureLabel: chapter.internalStructureLabel,
      structureBlocks: [], // Will be filled by renumberParagraphOutline if needed
      paragraphs: finalParagraphs,
    };
  } catch (error) {
    console.error(`Failed to generate paragraph outline for chapter "${chapter.title}":`, error);
    throw error;
  }
}

export type ChapterProgressStatus = "pending" | "processing" | "completed" | "failed";

export type ChapterProgress = {
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  status: ChapterProgressStatus;
  error?: string;
};

export type GenerationProgress = {
  total: number;
  completed: number;
  failed: number;
  chapters: ChapterProgress[];
};

async function generateAllChapterParagraphs(
  outline: BookOutline,
  bookId: string,
  onProgress?: (progress: GenerationProgress) => void,
): Promise<ChapterParagraphPlan[]> {
  // Build chapter-to-section mapping
  const chapterToSection = new Map<string, string>();
  outline.sections.forEach((section) => {
    section.chapters.forEach((chapter) => {
      chapterToSection.set(chapter.id, section.id);
    });
  });

  const allChapters = outline.sections.flatMap((s) => s.chapters);
  const bookContext = {
    title: outline.workingTitle,
    pitch: outline.readerTransformation,
    wordCountTarget: outline.targetWordCount,
  };

  // Initialize progress tracking
  const progress: GenerationProgress = {
    total: allChapters.length,
    completed: 0,
    failed: 0,
    chapters: allChapters.map((ch) => ({
      chapterId: ch.id,
      chapterTitle: ch.title,
      chapterNumber: ch.number,
      status: "pending" as const,
    })),
  };

  onProgress?.(progress);

  // Run chapters sequentially with small delay to avoid rate limiting
  const results: PromiseSettledResult<ChapterParagraphPlan>[] = [];
  for (let idx = 0; idx < allChapters.length; idx++) {
    const chapter = allChapters[idx];

    // Mark as processing
    progress.chapters[idx]!.status = "processing";
    onProgress?.(progress);

    try {
      const plan = await generateChapterParagraphPlan(chapter, bookContext);

      // Save as individual artifact
      const sectionId = chapterToSection.get(chapter.id) || "";
      await saveChapterParagraphPlan({
        bookId,
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        sectionId,
        contentJson: plan,
        createdByType: ActorType.SYSTEM,
        modelName: "claude-sonnet-4-6",
      });

      // Mark as completed
      progress.chapters[idx]!.status = "completed";
      progress.completed += 1;
      onProgress?.(progress);

      results.push({ status: "fulfilled", value: plan } as PromiseFulfilledResult<ChapterParagraphPlan>);
    } catch (error) {
      // Mark as failed
      progress.chapters[idx]!.status = "failed";
      progress.chapters[idx]!.error = String(error);
      progress.failed += 1;
      onProgress?.(progress);

      results.push({ status: "rejected", reason: error } as PromiseRejectedResult);
    }

    // Small delay between chapters to avoid rate limiting
    if (idx < allChapters.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  const plans: ChapterParagraphPlan[] = [];
  const errors: Array<{ chapter: string; error: unknown }> = [];

  results.forEach((result, idx) => {
    if (result.status === "fulfilled") {
      plans.push(result.value);
    } else {
      errors.push({
        chapter: allChapters[idx].title,
        error: result.reason,
      });
      console.error(`Chapter "${allChapters[idx].title}" generation failed:`, result.reason);
    }
  });

  if (errors.length > 0) {
    const failedChapters = errors.map((e) => `"${e.chapter}"`).join(", ");
    const errorDetails = errors.map((e) => `${e.chapter}: ${String(e.error)}`).join("\n");
    console.error("Detailed chapter generation errors:\n", errorDetails);
    throw new Error(`Failed to generate paragraphs for chapters: ${failedChapters}`);
  }

  return plans;
}

async function maybeGenerateParagraphOutline(
  committedOutline: BookOutline,
  bookId: string,
  bookSlug?: string,
): Promise<ParagraphOutline> {
  const normalizedOutline = renumberBookOutline(committedOutline);

  try {
    const chapterPlans = await generateAllChapterParagraphs(
      normalizedOutline,
      bookId,
      bookSlug
        ? (progress) => {
            setChapterGenerationProgress(bookSlug, progress);
          }
        : undefined,
    );

    // Reassemble into section structure
    const sections = normalizedOutline.sections.map((section) => ({
      sectionId: section.id,
      sectionNumber: section.number,
      sectionTitle: section.title,
      sectionDescription: section.description,
      chapters: section.chapters
        .map((chapter) => chapterPlans.find((p) => p.chapterId === chapter.id))
        .filter((p) => p !== undefined) as ChapterParagraphPlan[],
    }));

    const result = renumberParagraphOutline({
      workingTitle: normalizedOutline.workingTitle,
      overview: `Chapter-by-chapter paragraph blueprints for "${normalizedOutline.workingTitle}" based on the locked outline.`,
      sections,
    });

    // Clear progress when done
    if (bookSlug) {
      clearChapterGenerationProgress(bookSlug);
    }

    return result;
  } catch (error) {
    console.error("Paragraph outline generation failed:", error);
    throw error;
  }
}

async function loadContextNode(state: ParagraphWorkflowState) {
  const book = await getBookBySlugOrThrow(state.bookSlug);
  const committedOutlineVersion = await getCommittedOutline(book.id);
  const committedOutline = parseJson<BookOutline | null>(
    committedOutlineVersion?.contentJson,
    null,
  );

  const latestExpansionVersion = (await getOutlineExpansionVersions(book.id, 1))[0];

  return {
    bookId: book.id,
    committedOutline,
    paragraphOutline: committedOutline && latestExpansionVersion
      ? parseJson<ParagraphOutline | undefined>(latestExpansionVersion.contentJson, undefined)
      : undefined,
  };
}

async function generateParagraphOutlineNode(state: ParagraphWorkflowState) {
  if (!state.committedOutline) {
    return {};
  }

  return {
    paragraphOutline: await maybeGenerateParagraphOutline(state.committedOutline, state.bookId || "", state.bookSlug),
  };
}

async function persistNode(state: ParagraphWorkflowState) {
  if (!state.bookId || !state.paragraphOutline) {
    return {};
  }

  await createOutlineExpansionVersion({
    bookId: state.bookId,
    title: "Chapter Breakdowns",
    summary: state.paragraphOutline.overview,
    contentJson: state.paragraphOutline,
    contentText: JSON.stringify(state.paragraphOutline, null, 2),
  });

  return {};
}

export async function runParagraphOutlineWorkflow(
  bookSlug: string,
  options?: {
    revisionComment?: string;
    revisionTargetId?: string;
    revisionTargetType?: "chapter" | "paragraph";
  },
) {
  const state: ParagraphWorkflowState = {
    bookSlug,
    revisionComment: options?.revisionComment,
    revisionTargetId: options?.revisionTargetId,
    revisionTargetType: options?.revisionTargetType,
  };

  const context = await loadContextNode(state);
  const withContext = { ...state, ...context };

  const generated = await generateParagraphOutlineNode(withContext);
  const withGenerated = { ...withContext, ...generated };

  await persistNode(withGenerated);
}

export async function commitParagraphOutlineWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  await commitOutlineExpansionBundle(book.id);
  await clearStageStaleDependency(bookSlug, StageKey.OUTLINE);
  await invalidateDependentStagesForBook(bookSlug, StageKey.OUTLINE);
}

export async function getParagraphOutlineWorkspace(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const committedOutlineVersion = await getCommittedOutline(book.id);
  const committedOutline = parseJson<BookOutline | null>(
    committedOutlineVersion?.contentJson,
    null,
  );

  // Get all chapter paragraph plan artifacts (per-chapter artifacts)
  const allChapterArtifacts = await db.artifact.findMany({
    where: {
      bookId: book.id,
      artifactType: "CHAPTER_PARAGRAPH_PLAN" as any,
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
      },
    },
  });

  // Build latestParagraphOutline from per-chapter artifacts
  let latestParagraphOutline: ParagraphOutline | null = null;
  if (committedOutline && allChapterArtifacts.length > 0) {
    // Get latest version of each chapter artifact
    const chapterPlans: ChapterParagraphPlan[] = [];
    allChapterArtifacts.forEach((artifact) => {
      if (artifact.versions.length > 0) {
        const latestVersion = artifact.versions[0];
        if (isChapterParagraphPlan(latestVersion.contentJson)) {
          chapterPlans.push(latestVersion.contentJson);
        }
      }
    });

    // Reassemble into ParagraphOutline structure
    const sections = committedOutline.sections.map((section) => ({
      sectionId: section.id,
      sectionNumber: section.number,
      sectionTitle: section.title,
      sectionDescription: section.description,
      chapters: section.chapters
        .map((chapter) => chapterPlans.find((p) => p.chapterId === chapter.id))
        .filter((p) => p !== undefined) as ChapterParagraphPlan[],
    }));

    latestParagraphOutline = {
      workingTitle: committedOutline.workingTitle,
      overview: `Chapter-by-chapter paragraph blueprints for "${committedOutline.workingTitle}" based on the locked outline.`,
      sections,
    };
  }

  // Also get old OUTLINE_EXPANSION artifacts for backward compatibility
  const latestExpansionVersion = (await getOutlineExpansionVersions(book.id, 1))[0];
  const committedExpansionVersion = await getCommittedOutlineExpansion(book.id);
  const paragraphVersions = await getOutlineExpansionVersions(book.id);

  return {
    book,
    committedOutline,
    latestParagraphOutline,
    committedParagraphOutline:
      parseJson<ParagraphOutline | null>(committedExpansionVersion?.contentJson, null),
    paragraphVersions: paragraphVersions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      lifecycleState: version.lifecycleState,
      createdAt: version.createdAt,
      paragraphOutline: parseJson<ParagraphOutline | null>(version.contentJson, null),
      isCommitted: version.lifecycleState === ArtifactStatus.COMMITTED,
    })),
    readiness: committedOutline
      ? {
          status: "ready" as const,
          nextMoves: [
            "Generate paragraph blueprints for every chapter from the locked outline",
            "Review the paragraph math and chapter flow",
            "Commit the chapter breakdowns when ready",
          ],
        }
      : {
          status: "blocked" as const,
          nextMoves: [
            "Commit the section-and-chapter outline first",
            "Lock Phase 1 before opening Chapter Breakdowns",
          ],
        },
  };
}
