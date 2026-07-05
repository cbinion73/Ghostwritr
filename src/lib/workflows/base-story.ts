import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  Prisma,
  StageKey,
  StageStatus,
  WorkflowRunStatus,
} from "@prisma/client";
import { z } from "zod";

import {
  BaseStoryBundleSchema,
  BookOutlineSchema,
  BookSetupProfileSchema,
  PromiseBriefSchema,
  parseArtifactWithSchema,
  parseMetadataRecord,
} from "../artifact-schemas";
import { getModelForRole } from "../llm/routing";

import type { BaseStoryBundle, BaseStoryFormat } from "../base-story-types";
import type { BaseStoryFormatPreference, BookSetupProfile } from "../book-setup-types";
import type { BookOutline } from "../outline-types";
import type { PromiseBrief } from "../promise-types";
import { normalizeBaseStoryBundle } from "../base-story-utils";
import {
  getBookBySlugOrThrow,
  getOrCreateBookBySlug,
  getStageForBook,
  updateStageForBook,
} from "../repositories/books";
import {
  commitBaseStory,
  createBaseStoryVersion,
  getBaseStoryVersions,
  getCommittedBaseStory,
} from "../repositories/base-story-artifacts";
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
import { getCommittedBookSetup } from "../repositories/book-setup-artifacts";
import { getCommittedPromiseBrief } from "../repositories/promise-artifacts";
import { clearStageStaleDependency, invalidateDependentStagesForBook } from "../workflow-dependencies";
import { runQualityAgentWorkflow } from "./quality-agent";

const StoryFormatCatalog: BaseStoryBundle["availableFormats"] = [
  { format: "PARABLE", label: "Parable", description: "A symbolic story thread that carries the big idea through the book.", bestFor: "Books built around timeless principles." },
  { format: "HERO_JOURNEY", label: "Hero Journey", description: "A protagonist moves through tension, setbacks, and transformation.", bestFor: "Books centered on courage and change." },
  { format: "GUIDE_JOURNEY", label: "Guide Journey", description: "The narrator or teacher guides the reader through uncertainty into clarity.", bestFor: "Advisory nonfiction and leadership books." },
  { format: "COMPOSITE_CHARACTER", label: "Composite Character", description: "A blended protagonist embodies the reader's struggles and growth.", bestFor: "Books where privacy matters or themes repeat." },
  { format: "CASE_JOURNEY", label: "Case Journey", description: "A single company or leader arc threads across the book.", bestFor: "Business books with strong case-study logic." },
  { format: "MOSAIC_VIGNETTES", label: "Mosaic Vignettes", description: "Short connected scenes or examples create a cumulative narrative thread.", bestFor: "Books needing variety and richness." },
  { format: "QUEST", label: "Quest", description: "A mission-oriented thread drives movement chapter by chapter.", bestFor: "Ambitious or visionary books." },
  { format: "RISE_FALL_REDEMPTION", label: "Rise Fall Redemption", description: "A narrative arc of ascent, collapse, and renewal.", bestFor: "Books about leadership failure and recovery." },
  { format: "LETTER_FRAME", label: "Letter Frame", description: "The book feels like a sustained address to a reader or future leader.", bestFor: "Reflective, intimate nonfiction." },
  { format: "FIELD_MANUAL_NARRATIVE", label: "Field Manual Narrative", description: "The story thread is carried by real-world situations and decision points.", bestFor: "Practical, tactical books." },
];

const BaseStorySchema = z.object({
  selectedFormat: z.enum([
    "PARABLE",
    "HERO_JOURNEY",
    "GUIDE_JOURNEY",
    "COMPOSITE_CHARACTER",
    "CASE_JOURNEY",
    "MOSAIC_VIGNETTES",
    "QUEST",
    "RISE_FALL_REDEMPTION",
    "LETTER_FRAME",
    "FIELD_MANUAL_NARRATIVE",
  ]),
  storyPremise: z.string(),
  bookThread: z.string(),
  bookMovement: z.object({
    me: z.string(),
    we: z.string(),
    truth: z.string(),
    you: z.string(),
    weClosing: z.string(),
  }),
  chapters: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      chapterPurpose: z.string(),
      threadRole: z.string(),
      chapterStory: z.string(),
      movement: z.object({
        me: z.string(),
        we: z.string(),
        truth: z.string(),
        you: z.string(),
        weClosing: z.string(),
      }),
    }),
  ),
});

async function getChatModel() {
  // Routed via provider layer: Sonnet for cost-effective narrative generation.
  // BaseStorySchema asks for a movement (5 fields) per chapter, so a
  // 16+ chapter book easily exceeds what fits in a 20s timeout — that used
  // to silently exhaust all retries and fall back to the hardcoded
  // placeholder bundle below (confirmed in production: two consecutive
  // ~64s failures, matching 3 attempts x the old 20s cap, both silently
  // swallowed with no error logged). Raising the timeout to 120s wasn't
  // enough on its own — a leftover `maxOutputTokens: 8000` override here
  // was *lowering* this role's own routing-layer default of 12000 (chosen
  // specifically because this role "needs headroom beyond 8,192", per
  // routing.ts) instead of letting it apply. Omitting it now lets that
  // default take effect. Still not enough — a live-monitored regeneration
  // with that fix in place hit the SAME 120s ceiling again (clean SDK
  // timeout, no further error detail), which points at something more
  // fundamental: forcing a large nested tool-call/structured-output
  // schema (16 chapters x 5 movement fields) appears to genuinely take
  // Claude much longer than free-form prose of comparable length (compare
  // chapter-draft:author's reliable 30s timeout at 16,000 tokens of plain
  // prose). Raised substantially to give a real structured-output call
  // room to finish rather than guessing again.
  return getModelForRole("base-story:author", {
    temperature: 0.3,
    timeoutMs: 240000,
  });
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") return value as T;
  return fallback;
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

async function pulseBaseStoryStage(input: {
  bookId: string;
  currentAction: string;
  message: string;
}) {
  const stage = await getStageForBook(input.bookId, StageKey.BASE_STORY);
  const metadata = parseMetadataRecord(stage?.metadataJson);

  await updateStageForBook(input.bookId, StageKey.BASE_STORY, {
    metadataJson: {
      ...metadata,
      automationStatus: "running",
      currentAction: input.currentAction,
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

async function getInputs(bookId: string) {
  const bookSetupVersion = await getCommittedBookSetup(bookId);
  const promiseVersion = await getCommittedPromiseBrief(bookId);
  const outlineVersion = await getCommittedOutline(bookId);
  return {
    bookSetup: parseArtifactWithSchema(bookSetupVersion?.contentJson, BookSetupProfileSchema),
    promise: parseArtifactWithSchema(promiseVersion?.contentJson, PromiseBriefSchema),
    outline: parseArtifactWithSchema(outlineVersion?.contentJson, BookOutlineSchema),
  };
}

async function hasLockedOutlinePackage(bookId: string) {
  const [outlineStage, paragraphOutlineVersion] = await Promise.all([
    getStageForBook(bookId, StageKey.OUTLINE),
    getCommittedOutlineExpansion(bookId),
  ]);

  return (
    outlineStage?.status === StageStatus.COMMITTED &&
    Boolean(paragraphOutlineVersion)
  );
}

function fallbackBaseStory(
  bookTitle: string,
  outline: BookOutline,
  preferredFormat: BaseStoryFormatPreference,
): BaseStoryBundle {
  const selectedFormat =
    preferredFormat && preferredFormat !== "AUTO" ? preferredFormat : "GUIDE_JOURNEY";

  // Deliberately generic and derived only from this book's own title/outline —
  // this used to be hardcoded with "leader / lab / lean" language that had
  // nothing to do with most books, which read as cross-book content leakage
  // when it silently replaced a failed generation (see getChatModel's
  // comment above for how that happened).
  return normalizeBaseStoryBundle({
    workingTitle: bookTitle,
    selectedFormat,
    availableFormats: StoryFormatCatalog,
    storyPremise: `The reader moves from where they stand now toward what "${bookTitle}" promises to give them.`,
    bookThread: `Across the book, the central thread follows the reader's own progress through the ideas in "${bookTitle}".`,
    bookMovement: {
      me: "The book opens inside the reader's own lived experience of the problem this book addresses.",
      we: "That experience broadens into a shared reality other readers in the same position recognize.",
      truth: `The book relieves that tension by naming the governing insight at the heart of "${bookTitle}".`,
      you: "It then turns toward the reader's own responsibility, showing what has to change in how they think and act.",
      weClosing: "The book closes by reconnecting that change to the larger future the reader and others like them can build together.",
    },
    chapters: outline.sections.flatMap((section) =>
      section.chapters.map((chapter) => ({
        chapterKey: chapter.id,
        chapterLabel: `Chapter ${chapter.number}: ${chapter.title}`,
        chapterPurpose: chapter.description,
        threadRole: `This chapter advances the larger thread inside ${section.title}.`,
        chapterStory: `In this chapter, the narrative thread shows how the reader confronts the tension behind ${chapter.title.toLowerCase()} and takes one step closer to the book's promise.`,
        movement: {
          me: `Open inside the tension around ${chapter.title.toLowerCase()}, where its cost is felt in the reader's real experience.`,
          we: "Widen that tension into the shared reality other readers in the same position recognize, not just one isolated case.",
          truth: "Relieve the tension by landing the insight this chapter needs to teach, the shift that makes progress finally possible.",
          you: "Turn that insight toward the reader so they can see what it means for their own choices and actions.",
          weClosing: "Close by reconnecting the chapter's lesson to the broader change the book is building chapter by chapter.",
        },
      })),
    ),
  })!;
}

async function generateBaseStory(
  bookTitle: string,
  promise: PromiseBrief,
  outline: BookOutline,
  preferredFormat: BaseStoryFormatPreference,
): Promise<{ bundle: BaseStoryBundle; usedFallback: boolean }> {
  const model = await getChatModel();
  const fallback = fallbackBaseStory(bookTitle, outline, preferredFormat);
  if (!model) return { bundle: fallback, usedFallback: true };

  const startedAt = Date.now();
  try {
    console.log(`[generateBaseStory] Starting for "${bookTitle}" (${outline.sections.reduce((sum, s) => sum + s.chapters.length, 0)} chapters)...`);
    const structured = model.withStructuredOutput(BaseStorySchema);
    const result = await structured.invoke([
      new SystemMessage(`
You are designing the base story thread for a nonfiction book.

The output should create a chapter-by-chapter narrative thread that ties the whole book together.
Choose the most fitting base-story format from the available formats.
If a preferred format is provided and it is not AUTO, use that format unless it is clearly incompatible with the promise and outline.
The result should feel emotionally coherent and useful for later drafting.
You must define the narrative movement at two levels:
- book level
- chapter level

Use the movement: me -> we -> truth -> you -> we.

Definitions:
- me: begin in lived tension, a human moment, or the felt pressure that makes the book necessary
- we: widen that tension into a shared reality teams, leaders, or organizations recognize
- truth: relieve the tension by naming the governing insight, operating truth, or solution
- you: turn the truth toward ownership, decision, and application for the reader
- weClosing: reconnect the chapter or book to the broader mission, team, or future-state being built

These movement fields are narrative design notes for later drafting, not final chapter prose.
      `),
      new HumanMessage(
        JSON.stringify({
          workingTitle: bookTitle,
          promise,
          outline,
          preferredFormat,
          availableFormats: StoryFormatCatalog,
        }),
      ),
    ]);

    console.log(`[generateBaseStory] LLM call returned after ${Date.now() - startedAt}ms`);

    const normalized = normalizeBaseStoryBundle({
      workingTitle: bookTitle,
      selectedFormat: result.selectedFormat as BaseStoryFormat,
      availableFormats: StoryFormatCatalog,
      storyPremise: result.storyPremise,
      bookThread: result.bookThread,
      bookMovement: result.bookMovement,
      chapters: result.chapters,
    } satisfies BaseStoryBundle);
    if (!normalized) {
      console.error(`[generateBaseStory] normalizeBaseStoryBundle rejected the LLM result for "${bookTitle}":`, JSON.stringify(result).slice(0, 500));
    }
    return normalized
      ? { bundle: normalized, usedFallback: false }
      : { bundle: fallback, usedFallback: true };
  } catch (error) {
    console.error(`[generateBaseStory] Generation failed for "${bookTitle}" after ${Date.now() - startedAt}ms, using fallback:`, error);
    return { bundle: fallback, usedFallback: true };
  }
}

export async function runBaseStoryWorkflow(bookSlug: string, runId?: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const { bookSetup, promise, outline } = await getInputs(book.id);
  const outlineReady = await hasLockedOutlinePackage(book.id);

  if (!outlineReady) {
    throw new Error("Commit the full Outline ToC before generating Base Story.");
  }

  if (!promise || !outline) {
    throw new Error("Committed Promise and Outline are required before generating Base Story.");
  }

  await updateStageForBook(book.id, StageKey.BASE_STORY, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "running",
      currentAction: "Building the narrative thread",
      totalChapters: outline.sections.reduce((sum, section) => sum + section.chapters.length, 0),
      completedChapters: 0,
      recentActivity: recentActivity(undefined, "Started Base Story generation."),
      lastRunAt: new Date().toISOString(),
    },
  });

  if (await wasWorkflowCanceled(runId)) {
    return { canceled: true };
  }

  await pulseBaseStoryStage({
    bookId: book.id,
    currentAction: "Choosing the best narrative format",
    message: `Choosing the best base-story format${bookSetup?.baseStoryFormatPreference && bookSetup.baseStoryFormatPreference !== "AUTO" ? ` with preference ${bookSetup.baseStoryFormatPreference}` : ""}.`,
  });
  const { bundle, usedFallback } = await generateBaseStory(
    book.titleWorking ?? "Untitled Book",
    promise,
    outline,
    bookSetup?.baseStoryFormatPreference ?? "AUTO",
  );
  if (await wasWorkflowCanceled(runId)) {
    return { canceled: true };
  }
  await pulseBaseStoryStage({
    bookId: book.id,
    currentAction: "Drafting chapter-by-chapter narrative thread",
    message: `Built narrative thread in ${bundle.selectedFormat.replace(/_/g, " ").toLowerCase()} format across ${bundle.chapters.length} chapters.`,
  });
  await pulseBaseStoryStage({
    bookId: book.id,
    currentAction: "Saving the narrative thread",
    message: "Saving the base story bundle.",
  });
  const version = await createBaseStoryVersion({
    bookId: book.id,
    title: "Base Story",
    summary: bundle.storyPremise,
    contentJson: bundle as unknown as Prisma.InputJsonValue,
    contentText: JSON.stringify(bundle, null, 2),
    // Reflects what actually happened, not just whether a key was configured
    // — a configured key whose call times out or errors still falls back,
    // and that must be visibly distinguishable from a real generation.
    modelName: usedFallback
      ? "fallback"
      : (process.env.OPENAI_BASE_STORY_MODEL ?? "gpt-5.4"),
    promptTemplateVersion: "base-story-v1",
  });

  await updateStageForBook(book.id, StageKey.BASE_STORY, {
    status: StageStatus.READY_FOR_REVIEW,
    activeArtifactVersionId: version.id,
    metadataJson: {
      automationStatus: "ready_for_review",
      currentAction: usedFallback
        ? "Ready for review — generation failed, this is a placeholder"
        : "Ready for review",
      totalChapters: bundle.chapters.length,
      completedChapters: bundle.chapters.length,
      selectedFormat: bundle.selectedFormat,
      usedFallback,
      recentActivity: recentActivity(
        undefined,
        usedFallback
          ? "Generation failed — saved a generic placeholder for manual review instead of the real narrative thread."
          : `Generated Base Story in ${bundle.selectedFormat.replace(/_/g, " ").toLowerCase()} format.`,
      ),
      lastRunAt: new Date().toISOString(),
    },
  });

  return bundle;
}

export async function enqueueBaseStoryWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const existing = await getActiveWorkflowRunForStage(book.id, StageKey.BASE_STORY);
  if (existing) return existing;
  const outlineReady = await hasLockedOutlinePackage(book.id);

  if (!outlineReady) {
    throw new Error("Commit the full Outline ToC before generating Base Story.");
  }

  const { outline } = await getInputs(book.id);
  if (!outline) {
    throw new Error("Committed Outline is required before generating Base Story.");
  }

  await updateStageForBook(book.id, StageKey.BASE_STORY, {
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    metadataJson: {
      automationStatus: "queued",
      currentAction: "Queued for background processing",
      totalChapters: outline.sections.reduce((sum, section) => sum + section.chapters.length, 0),
      completedChapters: 0,
      recentActivity: recentActivity(undefined, "Queued Base Story generation."),
      lastRunAt: new Date().toISOString(),
    },
  });

  return createWorkflowRun({
    bookId: book.id,
    stageKey: StageKey.BASE_STORY,
    inputJson: {
      kind: "base_story_generation",
      bookSlug,
    },
  });
}

export async function processBaseStoryWorkflowRun(runId: string) {
  const run = await getWorkflowRunById(runId);
  if (!run) throw new Error(`Workflow run ${runId} was not found.`);

  const claimed = await claimWorkflowRun(runId);
  if (claimed.count === 0) return { skipped: true };

  const input = parseJson<Record<string, unknown>>(run.inputJson, {});
  const bookSlug = typeof input.bookSlug === "string" ? input.bookSlug : run.book.slug;

  try {
    const result = await runBaseStoryWorkflow(bookSlug, runId);
    if ((result as { canceled?: boolean }).canceled) {
      return result;
    }
    await completeWorkflowRun(runId, result as unknown as Prisma.InputJsonValue);
    await runQualityAgentWorkflow(bookSlug);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown base story workflow error";
    await failWorkflowRun(runId, message, {
      kind: "base_story_generation_failed",
      bookSlug,
    });
    await runQualityAgentWorkflow(bookSlug);
    throw error;
  }
}

export async function enqueueAndTriggerBaseStoryWorkflow(bookSlug: string, trigger: (runId: string) => void) {
  const queued = await enqueueBaseStoryWorkflow(bookSlug);
  if (queued.status === WorkflowRunStatus.QUEUED) {
    trigger(queued.id);
  }

  return queued;
}

export async function commitBaseStoryWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const result = await commitBaseStory(book.id);
  await clearStageStaleDependency(bookSlug, StageKey.BASE_STORY);
  await invalidateDependentStagesForBook(bookSlug, StageKey.BASE_STORY);
  return result;
}

export async function getBaseStoryWorkspace(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.BASE_STORY);
  const outlineReady = await hasLockedOutlinePackage(book.id);
  const versions = await getBaseStoryVersions(book.id);
  const committed = await getCommittedBaseStory(book.id);
  const latest = normalizeBaseStoryBundle(
    versions[0] ? parseJson<BaseStoryBundle | null>(versions[0].contentJson, null) : null,
  );
  const committedBundle = normalizeBaseStoryBundle(
    committed ? parseJson<BaseStoryBundle | null>(committed.contentJson, null) : null,
  );
  const metadata = parseMetadataRecord(stage?.metadataJson);

  return {
    book,
    stage,
    latestBundle: latest,
    committedBundle,
    versions: versions.map((version) => ({
      ...version,
      bundle: parseJson<BaseStoryBundle | null>(version.contentJson, null),
    })),
    progress: {
      automationStatus: typeof metadata.automationStatus === "string" ? metadata.automationStatus : "idle",
      totalChapters: typeof metadata.totalChapters === "number" ? metadata.totalChapters : latest?.chapters.length ?? 0,
      completedChapters: typeof metadata.completedChapters === "number" ? metadata.completedChapters : latest?.chapters.length ?? 0,
      selectedFormat: typeof metadata.selectedFormat === "string" ? metadata.selectedFormat : latest?.selectedFormat ?? null,
      usedFallback: metadata.usedFallback === true,
    },
    outlineReady,
  };
}
