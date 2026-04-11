import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ArtifactStatus } from "@prisma/client";
import { z } from "zod";

import { getModelForRole } from "../llm/routing";
import { renumberBookOutline, type BookOutline } from "../outline-types";
import {
  renumberParagraphOutline,
  type ParagraphOutline,
} from "../paragraph-outline-types";
import { getOrCreateBookBySlug } from "../repositories/books";
import {
  commitOutlineExpansionBundle,
  createOutlineExpansionVersion,
  getCommittedOutline,
  getCommittedOutlineExpansion,
  getOutlineExpansionVersions,
} from "../repositories/outline-artifacts";

const ParagraphOutlineSchema = z.object({
  workingTitle: z.string(),
  overview: z.string(),
  sections: z.array(
    z.object({
      sectionId: z.string(),
      sectionNumber: z.number(),
      sectionTitle: z.string(),
      sectionDescription: z.string(),
      chapters: z.array(
        z.object({
          chapterId: z.string(),
          chapterNumber: z.number(),
          chapterTitle: z.string(),
          chapterDescription: z.string(),
          paragraphs: z.array(
            z.object({
              id: z.string(),
              topicSentence: z.string(),
              purpose: z.string(),
            }),
          ),
        }),
      ),
    }),
  ),
});

type ParagraphWorkflowState = {
  bookSlug: string;
  bookId?: string;
  committedOutline?: BookOutline | null;
  currentParagraphOutline?: ParagraphOutline;
  paragraphOutline?: ParagraphOutline;
  revisionComment?: string;
  revisionTargetId?: string;
  revisionTargetType?: "chapter" | "paragraph";
};

const WorkflowState = Annotation.Root({
  bookSlug: Annotation<string>,
  bookId: Annotation<string | undefined>,
  committedOutline: Annotation<BookOutline | null | undefined>,
  currentParagraphOutline: Annotation<ParagraphOutline | undefined>,
  paragraphOutline: Annotation<ParagraphOutline | undefined>,
  revisionComment: Annotation<string | undefined>,
  revisionTargetId: Annotation<string | undefined>,
  revisionTargetType: Annotation<"chapter" | "paragraph" | undefined>,
});

const PARAGRAPH_SYSTEM_PROMPT = `
You are expanding a committed nonfiction outline with this hierarchy:
- section
- chapter
- paragraph
- topic sentence

For this stage:
- keep sections and chapters intact
- create paragraph plans under each chapter
- give each paragraph a sharp topic sentence
- explain the role of each paragraph in one sentence

Rules:
- Do not casually rewrite the committed section list.
- Do not casually rewrite chapter titles unless a revision comment explicitly asks for it.
- Decide how many paragraphs each chapter actually needs in order to fully develop the chapter's idea.
- Some chapters may need 4 paragraphs, while others may need 6, 7, or more.
- Do not use a fixed paragraph count across the whole book.
- Add as many paragraphs as needed for a strong draft thinking path, but do not add filler.
- The paragraph plan should feel like a useful reasoning scaffold for later drafting, research, and story selection.
- Topic sentences should feel like the opening line of a serious nonfiction paragraph.
- Paragraph purposes should explain what role that paragraph plays inside its chapter.
- Taken together, the paragraphs should show the full movement of the chapter from setup through development to landing.
- If a current paragraph outline exists, revise it rather than replacing it blindly.
`;

function hasUsableOpenAIKey() {
  return Boolean(
    process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your-key-here",
  );
}

async function getChatModel() {
  // Routed via provider layer: Sonnet for paragraph outline expansion
  return getModelForRole("outline:author", {
    temperature: 0.2,
    maxOutputTokens: 4000,
    timeoutMs: 12000,
    maxRetries: 0,
  });
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function estimateParagraphCount(chapter: {
  title: string;
  description: string;
}) {
  const text = `${chapter.title} ${chapter.description}`.toLowerCase();

  let count = 4;

  const complexitySignals = [
    "framework",
    "model",
    "decision",
    "evaluate",
    "evaluation",
    "process",
    "system",
    "strategy",
    "build",
    "develop",
    "balance",
    "compare",
    "criteria",
    "organization",
    "leadership",
    "challenge",
  ];

  const practicalSignals = [
    "tool",
    "practical",
    "approach",
    "technique",
    "method",
    "steps",
    "questions",
  ];

  for (const signal of complexitySignals) {
    if (text.includes(signal)) {
      count += 1;
    }
  }

  for (const signal of practicalSignals) {
    if (text.includes(signal)) {
      count += 1;
    }
  }

  if (chapter.description.length > 180) {
    count += 1;
  }

  return Math.max(4, Math.min(count, 8));
}

function buildFallbackParagraphs(chapter: {
  id: string;
  title: string;
  description: string;
}) {
  const paragraphCount = estimateParagraphCount(chapter);

  const templates = [
    {
      topicSentence: `${chapter.title} begins by naming the pressure, tension, or misconception this chapter needs to clarify.`,
      purpose: "Open the chapter by orienting the reader to the specific issue this chapter is taking on.",
    },
    {
      topicSentence: `What makes this issue difficult is that it is usually surrounded by noise, urgency, or conflicting incentives.`,
      purpose: "Surface the forces that make this chapter's subject easy to misunderstand or mishandle.",
    },
    {
      topicSentence: `The real cost of getting this wrong is not abstract, but visible in weakened judgment, trust, and strategic focus.`,
      purpose: "Raise the stakes so the reader sees why the chapter matters inside the larger argument of the book.",
    },
    {
      topicSentence: `To move forward, the chapter has to separate what feels urgent from what is actually important.`,
      purpose: "Create the pivot from diagnosis into discernment and better reasoning.",
    },
    {
      topicSentence: `A clearer way to think about this chapter's problem is to replace reaction with a more disciplined interpretive lens.`,
      purpose: "Introduce the governing reframing move or conceptual shift the chapter is trying to make.",
    },
    {
      topicSentence: `That reframing only becomes useful when it is translated into decisions, questions, or behaviors leaders can actually practice.`,
      purpose: "Turn the chapter from concept into practical leadership application.",
    },
    {
      topicSentence: `Seen this way, the chapter is not just offering advice, but building a repeatable way of leading under pressure.`,
      purpose: "Deepen the chapter by connecting its insight to a durable operating pattern rather than a one-off tip.",
    },
    {
      topicSentence: `By the end of this chapter, the reader should be able to carry this clearer way of seeing into the rest of the book.`,
      purpose: "Land the chapter and link it forward to the chapters that follow.",
    },
  ];

  return templates.slice(0, paragraphCount).map((template, index) => ({
    id: `${chapter.id}-p${index + 1}`,
    topicSentence: template.topicSentence,
    purpose: template.purpose,
  }));
}

function fallbackParagraphOutline(outline: BookOutline): ParagraphOutline {
  return renumberParagraphOutline({
    workingTitle: outline.workingTitle,
    overview:
      "A paragraph-level expansion of the committed section-and-chapter outline, preserving the book architecture while clarifying the flow inside each chapter.",
    sections: outline.sections.map((section) => ({
      sectionId: section.id,
      sectionNumber: section.number,
      sectionTitle: section.title,
      sectionDescription: section.description,
      chapters: section.chapters.map((chapter) => ({
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        chapterDescription: chapter.description,
        paragraphs: buildFallbackParagraphs(chapter),
      })),
    })),
  });
}

function normalizeParagraphOutline(value: unknown, fallback: ParagraphOutline): ParagraphOutline {
  const raw = parseJson<Record<string, unknown> | null>(value, null);

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const sections = Array.isArray(raw.sections)
    ? raw.sections
    : Array.isArray(raw.chapters)
      ? raw.chapters
      : [];

  return renumberParagraphOutline({
    workingTitle:
      typeof raw.workingTitle === "string" ? raw.workingTitle : fallback.workingTitle,
    overview: typeof raw.overview === "string" ? raw.overview : fallback.overview,
    sections: sections.map((section, sectionIndex) => {
      const sectionRecord =
        section && typeof section === "object" ? (section as Record<string, unknown>) : {};
      const chapters = Array.isArray(sectionRecord.chapters)
        ? sectionRecord.chapters
        : Array.isArray(sectionRecord.sections)
          ? sectionRecord.sections
          : [];

      return {
        sectionId:
          typeof sectionRecord.sectionId === "string"
            ? sectionRecord.sectionId
            : typeof sectionRecord.id === "string"
              ? sectionRecord.id
              : `section-${sectionIndex + 1}`,
        sectionNumber:
          typeof sectionRecord.sectionNumber === "number"
            ? sectionRecord.sectionNumber
            : typeof sectionRecord.number === "number"
              ? sectionRecord.number
              : sectionIndex + 1,
        sectionTitle:
          typeof sectionRecord.sectionTitle === "string"
            ? sectionRecord.sectionTitle
            : typeof sectionRecord.title === "string"
              ? sectionRecord.title
              : `Section ${sectionIndex + 1}`,
        sectionDescription:
          typeof sectionRecord.sectionDescription === "string"
            ? sectionRecord.sectionDescription
            : typeof sectionRecord.description === "string"
              ? sectionRecord.description
              : "Section description pending.",
        chapters: chapters.map((chapter, chapterIndex) => {
          const chapterRecord =
            chapter && typeof chapter === "object" ? (chapter as Record<string, unknown>) : {};
          const paragraphs = Array.isArray(chapterRecord.paragraphs)
            ? chapterRecord.paragraphs
            : [];

          return {
            chapterId:
              typeof chapterRecord.chapterId === "string"
                ? chapterRecord.chapterId
                : typeof chapterRecord.id === "string"
                  ? chapterRecord.id
                  : `section-${sectionIndex + 1}-chapter-${chapterIndex + 1}`,
            chapterNumber:
              typeof chapterRecord.chapterNumber === "number"
                ? chapterRecord.chapterNumber
                : typeof chapterRecord.number === "number"
                  ? chapterRecord.number
                  : chapterIndex + 1,
            chapterTitle:
              typeof chapterRecord.chapterTitle === "string"
                ? chapterRecord.chapterTitle
                : typeof chapterRecord.title === "string"
                  ? chapterRecord.title
                  : `Chapter ${chapterIndex + 1}`,
            chapterDescription:
              typeof chapterRecord.chapterDescription === "string"
                ? chapterRecord.chapterDescription
                : typeof chapterRecord.description === "string"
                  ? chapterRecord.description
                  : "Chapter description pending.",
            paragraphs: paragraphs.map((paragraph, paragraphIndex) => {
              const paragraphRecord =
                paragraph && typeof paragraph === "object"
                  ? (paragraph as Record<string, unknown>)
                  : {};

              return {
                id:
                  typeof paragraphRecord.id === "string"
                    ? paragraphRecord.id
                    : `section-${sectionIndex + 1}-chapter-${chapterIndex + 1}-paragraph-${paragraphIndex + 1}`,
                topicSentence:
                  typeof paragraphRecord.topicSentence === "string"
                    ? paragraphRecord.topicSentence
                    : "Topic sentence pending.",
                purpose:
                  typeof paragraphRecord.purpose === "string"
                    ? paragraphRecord.purpose
                    : "Paragraph purpose pending.",
              };
            }),
          };
        }),
      };
    }),
  });
}

async function maybeGenerateParagraphOutline(
  committedOutline: BookOutline,
  currentParagraphOutline?: ParagraphOutline,
  revisionComment?: string,
  revisionTargetId?: string,
  revisionTargetType?: "chapter" | "paragraph",
) {
  const model = await getChatModel();
  const fallback = fallbackParagraphOutline(renumberBookOutline(committedOutline));

  if (!model) {
    return fallback;
  }

  try {
    const structuredModel = model.withStructuredOutput(ParagraphOutlineSchema);

    const generated = await structuredModel.invoke([
      new SystemMessage(PARAGRAPH_SYSTEM_PROMPT),
      new HumanMessage(
        JSON.stringify({
          committedOutline,
          currentParagraphOutline: currentParagraphOutline ?? null,
          revisionComment: revisionComment ?? null,
          revisionTargetId: revisionTargetId ?? null,
          revisionTargetType: revisionTargetType ?? null,
        }),
      ),
    ]);
    return renumberParagraphOutline(generated);
  } catch (error) {
    console.warn("Paragraph outline generation fell back to local outline.", error);
    return fallback;
  }
}

async function loadContextNode(state: ParagraphWorkflowState) {
  const book = await getOrCreateBookBySlug(state.bookSlug);
  const committedOutlineVersion = await getCommittedOutline(book.id);
  const committedOutlineRaw = parseJson<BookOutline | null>(committedOutlineVersion?.contentJson, null);
  const committedOutline = committedOutlineRaw ? renumberBookOutline(committedOutlineRaw) : null;
  const fallback = committedOutline
    ? fallbackParagraphOutline(committedOutline)
    : { workingTitle: book.titleWorking ?? "Untitled Book", overview: "", sections: [] };
  const latestExpansionVersion = (await getOutlineExpansionVersions(book.id, 1))[0];

  return {
    bookId: book.id,
    committedOutline,
    currentParagraphOutline: latestExpansionVersion
      ? normalizeParagraphOutline(latestExpansionVersion.contentJson, fallback)
      : undefined,
  };
}

async function generateParagraphOutlineNode(state: ParagraphWorkflowState) {
  if (!state.committedOutline) {
    return {};
  }

  return {
    paragraphOutline: await maybeGenerateParagraphOutline(
      state.committedOutline,
      state.currentParagraphOutline,
      state.revisionComment,
      state.revisionTargetId,
      state.revisionTargetType,
    ),
  };
}

async function persistNode(state: ParagraphWorkflowState) {
  if (!state.bookId || !state.paragraphOutline) {
    return {};
  }

  await createOutlineExpansionVersion({
    bookId: state.bookId,
    title: "Paragraph Outline",
    summary: state.paragraphOutline.overview,
    contentJson: state.paragraphOutline,
    contentText: JSON.stringify(state.paragraphOutline, null, 2),
  });

  return {};
}

const paragraphGraph = new StateGraph(WorkflowState)
  .addNode("loadContext", loadContextNode)
  .addNode("generateParagraphOutline", generateParagraphOutlineNode)
  .addNode("persistParagraphOutline", persistNode)
  .addEdge(START, "loadContext")
  .addEdge("loadContext", "generateParagraphOutline")
  .addEdge("generateParagraphOutline", "persistParagraphOutline")
  .addEdge("persistParagraphOutline", END)
  .compile();

export async function runParagraphOutlineWorkflow(
  bookSlug: string,
  options?: {
    revisionComment?: string;
    revisionTargetId?: string;
    revisionTargetType?: "chapter" | "paragraph";
  },
) {
  return paragraphGraph.invoke({
    bookSlug,
    revisionComment: options?.revisionComment,
    revisionTargetId: options?.revisionTargetId,
    revisionTargetType: options?.revisionTargetType,
  });
}

export async function commitParagraphOutlineWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  await commitOutlineExpansionBundle(book.id);
}

export async function getParagraphOutlineWorkspace(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const committedOutlineVersion = await getCommittedOutline(book.id);
  const committedOutline = parseJson<BookOutline | null>(committedOutlineVersion?.contentJson, null);
  const fallback = committedOutline
    ? fallbackParagraphOutline(committedOutline)
    : { workingTitle: book.titleWorking ?? "Untitled Book", overview: "", sections: [] };
  const latestExpansionVersion = (await getOutlineExpansionVersions(book.id, 1))[0];
  const committedExpansionVersion = await getCommittedOutlineExpansion(book.id);
  const paragraphVersions = await getOutlineExpansionVersions(book.id);

  return {
    book,
    committedOutline,
    latestParagraphOutline: latestExpansionVersion
      ? normalizeParagraphOutline(latestExpansionVersion.contentJson, fallback)
      : null,
    committedParagraphOutline: committedExpansionVersion
      ? normalizeParagraphOutline(committedExpansionVersion.contentJson, fallback)
      : null,
    paragraphVersions: paragraphVersions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      lifecycleState: version.lifecycleState,
      createdAt: version.createdAt,
      paragraphOutline: normalizeParagraphOutline(version.contentJson, fallback),
      isCommitted: version.lifecycleState === ArtifactStatus.COMMITTED,
    })),
    readiness: committedOutline
      ? {
          status: "ready" as const,
          nextMoves: [
            "Generate paragraph-level topic sentences from the committed section-and-chapter outline",
            "Revise chapter flow and paragraph logic",
            "Commit the paragraph-level structure when it feels strong",
          ],
        }
      : {
          status: "blocked" as const,
          nextMoves: [
            "Commit the section-and-chapter outline first",
            "Lock the table of contents before expanding to paragraph level",
          ],
        },
  };
}
