import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { StageKey } from "@prisma/client";
import { z } from "zod";

import { getModelForRole } from "../llm/routing";
import { renumberBookOutline, type BookOutline } from "../outline-types";
import type { PromiseBrief } from "../promise-types";
import { getOrCreateBookBySlug, getStageForBook } from "../repositories/books";
import {
  commitOutlineStageBundle,
  createOutlineVersion,
  getCommittedOutline,
  getOutlineVersions,
} from "../repositories/outline-artifacts";
import { getCommittedPromiseBrief } from "../repositories/promise-artifacts";
import { triggerWorkflowRunInBackground } from "../workflow-queue";
import { enqueueAndTriggerBaseStoryWorkflow } from "./base-story";
import { enqueueAndTriggerFullExternalStoriesWorkflow } from "./external-stories";
import { enqueueAndTriggerFullResearchWorkflow } from "./research";

const OutlineSchema = z.object({
  workingTitle: z.string(),
  overview: z.string(),
  readerTransformation: z.string(),
  sections: z
    .array(
      z.object({
        id: z.string(),
        number: z.number(),
        title: z.string(),
        description: z.string(),
        chapters: z.array(
          z.object({
            id: z.string(),
            number: z.number(),
            title: z.string(),
            description: z.string(),
          }),
        ),
      }),
    )
    .min(2)
    .max(8),
});

type OutlineWorkflowState = {
  bookSlug: string;
  userInput?: string;
  revisionComment?: string;
  revisionTargetId?: string;
  revisionTargetType?: "section" | "chapter";
  bookId?: string;
  committedPromise?: PromiseBrief | null;
  currentOutline?: BookOutline;
  outline?: BookOutline;
};

const WorkflowState = Annotation.Root({
  bookSlug: Annotation<string>,
  userInput: Annotation<string | undefined>,
  revisionComment: Annotation<string | undefined>,
  revisionTargetId: Annotation<string | undefined>,
  revisionTargetType: Annotation<"section" | "chapter" | undefined>,
  bookId: Annotation<string | undefined>,
  committedPromise: Annotation<PromiseBrief | null | undefined>,
  currentOutline: Annotation<BookOutline | undefined>,
  outline: Annotation<BookOutline | undefined>,
});

const OUTLINE_SYSTEM_PROMPT = `
You are the Outline-stage architect for a serious nonfiction book.

The required hierarchy is:
- section
- chapter
- paragraph
- topic sentence

For this stage, generate only:
- sections
- chapters within each section

Rules:
- Sections are the top-level divisions of the book.
- Chapters live inside sections.
- Each section should have a strong strategic role in the book.
- Each chapter should have a strong role inside its section.
- Section descriptions should explain why that section exists and what movement it creates.
- Chapter descriptions should explain what work that chapter does inside the section.
- Do not generate paragraphs or topic sentences yet.
- Build a coherent nonfiction book, not a blog series.
- If a current outline is provided, revise it rather than replacing it casually.
- If a revision target and comment are provided, prioritize that item while preserving coherence elsewhere.
- Keep titles clear, strong, and commercially sensible.
`;

function hasUsableOpenAIKey() {
  return Boolean(
    process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your-key-here",
  );
}

async function getChatModel() {
  // Routed via provider layer: Sonnet for outline generation
  return getModelForRole("outline:author", {
    temperature: 0.2,
    maxOutputTokens: 8000,
    timeoutMs: 30000,
    maxRetries: 0,
  });
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function fallbackOutline(promise: PromiseBrief): BookOutline {
  return renumberBookOutline({
    workingTitle: promise.workingTitle,
    overview:
      "A strategic nonfiction book that helps enterprise leaders move from AI-driven overload to calm, credible decision-making by progressing through a few major sections, each with a focused internal chapter arc.",
    readerTransformation: `${promise.transformationBefore} -> ${promise.transformationAfter}`,
    sections: [
      {
        id: "sec-1",
        number: 1,
        title: "Seeing the Noise Clearly",
        description:
          "This opening section names the real leadership problem behind AI hype and competing inputs. Its job is to help the reader feel accurately seen, understand the cost of reactive leadership, and accept that clarity is now a strategic discipline rather than a personality trait.",
        chapters: [
          {
            id: "sec-1-ch-1",
            number: 1,
            title: "The Leadership Crisis in the Age of AI Hype",
            description:
              "This chapter opens the book by diagnosing the environment leaders are living in. It establishes the emotional and strategic cost of overload and creates urgency for a different way of leading.",
          },
          {
            id: "sec-1-ch-2",
            number: 2,
            title: "Why Reactivity Looks Like Leadership",
            description:
              "This chapter shows why rushed responses are often mistaken for competence. Its role is to expose the trap before the book starts offering a better operating model.",
          },
        ],
      },
      {
        id: "sec-2",
        number: 2,
        title: "Building the Clarity Discipline",
        description:
          "This middle section develops the internal and practical disciplines leaders need in order to move from noise to signal. It shifts the book from diagnosis into framework and trains the reader to interpret complexity more wisely.",
        chapters: [
          {
            id: "sec-2-ch-1",
            number: 1,
            title: "Cultivating a Clarity Mindset",
            description:
              "This chapter develops the inner posture required for clear leadership under pressure. Its role is to show that calm and discernment are trainable leadership capacities, not luxuries.",
          },
          {
            id: "sec-2-ch-2",
            number: 2,
            title: "Separating Signal from Hype",
            description:
              "This chapter gives the reader a practical framework for evaluating AI noise, vendor claims, and competing demands. It is where the book begins to feel especially useful and concrete.",
          },
          {
            id: "sec-2-ch-3",
            number: 3,
            title: "Balancing Speed and Deliberation",
            description:
              "This chapter addresses the real-world tension between urgency and wisdom. Its purpose is to help leaders act decisively without surrendering clarity.",
          },
        ],
      },
      {
        id: "sec-3",
        number: 3,
        title: "Leading Others with Credibility",
        description:
          "This section turns the framework outward. Its role is to help leaders communicate clearly, create trust, and guide teams and organizations through uncertainty without pretending to know more than they do.",
        chapters: [
          {
            id: "sec-3-ch-1",
            number: 1,
            title: "Communicating with Credibility",
            description:
              "This chapter shows how leaders can speak honestly and clearly in uncertain conditions. Its role is to connect clarity with trust and influence.",
          },
          {
            id: "sec-3-ch-2",
            title: "Building AI Literacy Across the Organization",
            number: 2,
            description:
              "This chapter broadens the frame from individual leaders to teams and organizations. It shows that clarity scales only when the wider system becomes more informed and less reactive.",
          },
        ],
      },
      {
        id: "sec-4",
        number: 4,
        title: "Sustaining Clarity Over Time",
        description:
          "The closing section helps the reader turn temporary insight into durable leadership practice. Its role is to show how clarity becomes an enduring operating system rather than a short-lived response to the AI moment.",
        chapters: [
          {
            id: "sec-4-ch-1",
            number: 1,
            title: "Using Metrics Without Becoming Ruled by Them",
            description:
              "This chapter helps leaders use evidence and measurement well without becoming captive to dashboards, vanity metrics, or false certainty.",
          },
          {
            id: "sec-4-ch-2",
            number: 2,
            title: "Leading Beyond the Hype Cycle",
            description:
              "This final chapter closes the book by helping the reader carry clarity forward into future waves of disruption. Its role is to leave the reader with a durable identity and practice, not just a moment of insight.",
          },
        ],
      },
    ],
  });
}

function normalizeOutline(value: unknown, fallback: BookOutline): BookOutline {
  const raw = parseJson<Record<string, unknown> | null>(value, null);

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const nextSections = Array.isArray(raw.sections)
    ? raw.sections
    : Array.isArray(raw.chapters)
      ? raw.chapters
      : [];

  return renumberBookOutline({
    workingTitle:
      typeof raw.workingTitle === "string" ? raw.workingTitle : fallback.workingTitle,
    overview: typeof raw.overview === "string" ? raw.overview : fallback.overview,
    readerTransformation:
      typeof raw.readerTransformation === "string"
        ? raw.readerTransformation
        : fallback.readerTransformation,
    sections: nextSections.map((section, sectionIndex) => {
      const sectionRecord =
        section && typeof section === "object" ? (section as Record<string, unknown>) : {};
      const nextChapters = Array.isArray(sectionRecord.chapters)
        ? sectionRecord.chapters
        : Array.isArray(sectionRecord.sections)
          ? sectionRecord.sections
          : [];

      return {
        id:
          typeof sectionRecord.id === "string"
            ? sectionRecord.id
            : `section-${sectionIndex + 1}`,
        number:
          typeof sectionRecord.number === "number" ? sectionRecord.number : sectionIndex + 1,
        title:
          typeof sectionRecord.title === "string"
            ? sectionRecord.title
            : `Section ${sectionIndex + 1}`,
        description:
          typeof sectionRecord.description === "string"
            ? sectionRecord.description
            : "Section description pending.",
        chapters: nextChapters.map((chapter, chapterIndex) => {
          const chapterRecord =
            chapter && typeof chapter === "object" ? (chapter as Record<string, unknown>) : {};

          return {
            id:
              typeof chapterRecord.id === "string"
                ? chapterRecord.id
                : `section-${sectionIndex + 1}-chapter-${chapterIndex + 1}`,
            number:
              typeof chapterRecord.number === "number" ? chapterRecord.number : chapterIndex + 1,
            title:
              typeof chapterRecord.title === "string"
                ? chapterRecord.title
                : `Chapter ${chapterIndex + 1}`,
            description:
              typeof chapterRecord.description === "string"
                ? chapterRecord.description
                : typeof chapterRecord.purpose === "string"
                  ? chapterRecord.purpose
                  : "Chapter description pending.",
          };
        }),
      };
    }),
  });
}

async function maybeGenerateOutline(
  promise: PromiseBrief,
  currentOutline?: BookOutline,
  userInput?: string,
  revisionComment?: string,
  revisionTargetId?: string,
  revisionTargetType?: "section" | "chapter",
) {
  const model = await getChatModel();

  if (!model) {
    return fallbackOutline(promise);
  }

  const structuredModel = model.withStructuredOutput(OutlineSchema);

  const generated = await structuredModel.invoke([
    new SystemMessage(OUTLINE_SYSTEM_PROMPT),
    new HumanMessage(
      JSON.stringify({
        promise,
        currentOutline: currentOutline ?? null,
        userInput: userInput ?? null,
        revisionComment: revisionComment ?? null,
        revisionTargetId: revisionTargetId ?? null,
        revisionTargetType: revisionTargetType ?? null,
      }),
    ),
  ]);

  return renumberBookOutline(generated);
}

async function loadPromiseNode(state: OutlineWorkflowState) {
  const book = await getOrCreateBookBySlug(state.bookSlug);
  const committedPromiseVersion = await getCommittedPromiseBrief(book.id);
  const committedPromise = parseJson<PromiseBrief | null>(committedPromiseVersion?.contentJson, null);
  const fallback = fallbackOutline(
    committedPromise ?? {
      workingTitle: book.titleWorking ?? "Untitled Book",
      audiencePrimary: "",
      audienceSecondary: [],
      category: "",
      readerProblem: "",
      readerDesire: "",
      bigIdea: "",
      coreTruth: "",
      transformationBefore: "",
      transformationAfter: "",
      differentiation: "",
      promiseStatement: "",
      stakes: "",
      tone: [],
      openQuestions: [],
    },
  );
  const latestOutlineVersion = (await getOutlineVersions(book.id, 1))[0];

  return {
    bookId: book.id,
    committedPromise,
    currentOutline: latestOutlineVersion
      ? normalizeOutline(latestOutlineVersion.contentJson, fallback)
      : undefined,
  };
}

async function generateOutlineNode(state: OutlineWorkflowState) {
  if (!state.committedPromise) {
    return {};
  }

  return {
    outline: await maybeGenerateOutline(
      state.committedPromise,
      state.currentOutline,
      state.userInput,
      state.revisionComment,
      state.revisionTargetId,
      state.revisionTargetType,
    ),
  };
}

async function persistOutlineNode(state: OutlineWorkflowState) {
  if (!state.bookId || !state.outline) {
    return {};
  }

  await createOutlineVersion({
    bookId: state.bookId,
    title: "Book Outline",
    summary: state.outline.overview,
    contentJson: state.outline,
    contentText: JSON.stringify(state.outline, null, 2),
  });

  return {};
}

const outlineGraph = new StateGraph(WorkflowState)
  .addNode("loadPromise", loadPromiseNode)
  .addNode("generateOutline", generateOutlineNode)
  .addNode("persistOutline", persistOutlineNode)
  .addEdge(START, "loadPromise")
  .addEdge("loadPromise", "generateOutline")
  .addEdge("generateOutline", "persistOutline")
  .addEdge("persistOutline", END)
  .compile();

export async function runOutlineWorkflow(
  bookSlug: string,
  options?: {
    userInput?: string;
    revisionComment?: string;
    revisionTargetId?: string;
    revisionTargetType?: "section" | "chapter";
  },
) {
  return outlineGraph.invoke({
    bookSlug,
    userInput: options?.userInput,
    revisionComment: options?.revisionComment,
    revisionTargetId: options?.revisionTargetId,
    revisionTargetType: options?.revisionTargetType,
  });
}

export async function commitOutlineWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  await commitOutlineStageBundle(book.id);
  await Promise.all([
    enqueueAndTriggerFullResearchWorkflow(bookSlug, triggerWorkflowRunInBackground),
    enqueueAndTriggerFullExternalStoriesWorkflow(bookSlug, triggerWorkflowRunInBackground),
    enqueueAndTriggerBaseStoryWorkflow(bookSlug, triggerWorkflowRunInBackground),
  ]);
}

export async function getOutlineWorkspace(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const promiseStage = await getStageForBook(book.id, StageKey.PROMISE);
  const outlineStage = await getStageForBook(book.id, StageKey.OUTLINE);
  const committedPromiseVersion = await getCommittedPromiseBrief(book.id);
  const committedOutlineVersion = await getCommittedOutline(book.id);
  const outlineVersions = await getOutlineVersions(book.id);

  const committedPromise = parseJson<PromiseBrief | null>(
    committedPromiseVersion?.contentJson,
    null,
  );
  const fallback = fallbackOutline(
    committedPromise ?? {
      workingTitle: book.titleWorking ?? "Untitled Book",
      audiencePrimary: "",
      audienceSecondary: [],
      category: "",
      readerProblem: "",
      readerDesire: "",
      bigIdea: "",
      coreTruth: "",
      transformationBefore: "",
      transformationAfter: "",
      differentiation: "",
      promiseStatement: "",
      stakes: "",
      tone: [],
      openQuestions: [],
    },
  );
  const latestOutline = outlineVersions[0]
    ? normalizeOutline(outlineVersions[0].contentJson, fallback)
    : null;
  const committedOutline = committedOutlineVersion
    ? normalizeOutline(committedOutlineVersion.contentJson, fallback)
    : null;

  return {
    book,
    promiseStage,
    outlineStage,
    committedPromise,
    latestOutline,
    committedOutline,
    outlineVersions: outlineVersions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      lifecycleState: version.lifecycleState,
      createdAt: version.createdAt,
      outline: normalizeOutline(version.contentJson, fallback),
    })),
    outlineReadiness: committedPromise
      ? {
          status: "ready" as const,
          nextMoves: [
            "Generate a fully reasoned section and chapter map from the promise",
            "Refine section titles, section descriptions, chapter titles, and chapter roles",
            "Commit the structure when the architecture feels right",
            "Then expand into paragraph-level topic sentences",
          ],
        }
      : {
          status: "blocked" as const,
          nextMoves: [
            "Commit the Promise stage first",
            "Confirm the primary reader and central promise",
            "Lock the commercial positioning before outlining",
          ],
        },
  };
}
