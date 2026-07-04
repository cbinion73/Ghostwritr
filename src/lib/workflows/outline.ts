import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ArtifactType, StageKey } from "@prisma/client";

import { getCommittedBookSetup } from "../repositories/book-setup-artifacts";
import { getModelForRole } from "../llm/routing";
import {
  calculateOutlineWordCountVerification,
  renumberBookOutline,
  type BookOutline,
  type OutlineChapter,
  type OutlineParagraph,
  type OutlineSection,
  type OutlineStructureBlock,
  type OutlineGenerationMeta,
  type ReaderJourneyPhase,
  type OutlinePhaseMapping,
} from "../outline-types";
import type { BookSetupProfile } from "../book-setup-types";
import { DEFAULT_BOOK_SETUP_PROFILE } from "../book-setup-types";
import type { BookPromiseReport, PromiseBrief } from "../promise-types";
import { getBookBySlugOrThrow, getOrCreateBookBySlug, getStageForBook } from "../repositories/books";
import {
  commitOutlineStageBundle,
  createOutlineVersion,
  getCommittedOutline,
  getOutlineVersions,
} from "../repositories/outline-artifacts";
import { getCommittedPromiseBrief, getPromiseArtifacts } from "../repositories/promise-artifacts";
import { getBookKnowledgeBase, formatKnowledgeForPrompt } from "../services/knowledge-base";
import { clearStageStaleDependency, invalidateDependentStagesForBook } from "../workflow-dependencies";
import { triggerWorkflowRunInBackground } from "../workflow-queue";
import { enqueueAndTriggerBaseStoryWorkflow } from "./base-story";
import { enqueueAndTriggerFullExternalStoriesWorkflow } from "./external-stories";

type OutlineWorkflowState = {
  bookSlug: string;
  userInput?: string;
  revisionComment?: string;
  revisionTargetId?: string;
  revisionTargetType?: "section" | "chapter";
  bookId?: string;
  committedPromise?: PromiseBrief | null;
  bookPromiseReport?: BookPromiseReport | null;
  bookSetupProfile?: BookSetupProfile | null;
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
  bookPromiseReport: Annotation<BookPromiseReport | null | undefined>,
  bookSetupProfile: Annotation<BookSetupProfile | null | undefined>,
  currentOutline: Annotation<BookOutline | undefined>,
  outline: Annotation<BookOutline | undefined>,
});

const READER_JOURNEY_PHASES = [
  "Phase 1: Current Reality",
  "Phase 2: Disruption",
  "Phase 3: Revelation",
  "Phase 4: Application",
  "Phase 5: Transformation"
] as const;

// Which material drives the outline's structure depends on whether the book
// actually has uploaded source documents. With a Knowledge Base, real content
// leads; without one, the committed Promise IS the primary source — an author
// starting from just an idea must not have their Promise work demoted to
// "reference only" against an empty Knowledge Base.
function outlineSourceDirective(hasKnowledgeBase: boolean) {
  return hasKnowledgeBase
    ? `CRITICAL: Your primary source is the ACTUAL BOOK CONTENT in the Knowledge Base section below.
The Book Pitch, Promise, and audience data are supporting context—use them to keep the reader transformation on track, but ground the content structure in the Knowledge Base.`
    : `CRITICAL: This book has NO Knowledge Base source documents. The committed Promise—reader problem, reader desire, core truth, and transformation arc in the book context—IS your primary source. Derive the book's big ideas and structure directly from that committed promise so the outline delivers exactly the transformation the author locked in.`;
}

const OUTLINE_SOURCE_DIRECTIVE_TOKEN = "__OUTLINE_SOURCE_DIRECTIVE__";

const OUTLINE_FULL_SYSTEM_PROMPT = `
You are the Outline-stage architect for a serious nonfiction book.

${OUTLINE_SOURCE_DIRECTIVE_TOKEN}

YOUR TASK:
1. Read the Knowledge Base content deeply
2. Discover the BIG IDEAS that naturally emerge from that content
3. Organize those big ideas into sections (each section = a cluster of related big ideas)
4. Within each section, create chapters that each deliver ONE big idea through the reader's journey
5. Within each chapter, structure the content using the ME-WE-TRUTH-YOU-WE framework where appropriate

What is a "big idea"? A single, powerful insight or framework that the book teaches. For example:
- "People remember stories, not statistics"
- "The 4P framework organizes all organizational thinking"
- "Influence flows through connection, not authority"
NOT a big idea: "Chapter 2 talks about…" (that's a placeholder, not an idea)

Section organization: Group related big ideas into logical sections. Each section should have ONE overarching theme that binds its chapters.

Chapter architecture: Each chapter should introduce, explore, and land ONE big idea. Use the ME-WE-TRUTH-YOU-WE structure:
- ME: Connect to the reader's current experience or belief
- WE: Explore shared experiences or common patterns
- TRUTH: Reveal the core insight (the big idea) that changes perspective
- YOU: Show how the reader can apply or experience this truth
- WE: Reconnect the reader to community, possibility, or collective action

Return JSON only. Do not include markdown fences. Do not add commentary before or after the JSON.

CRITICAL: Do NOT include any promise structure, pillar numbering, or pitch framework into chapter descriptions. All descriptions must be original content-driven descriptions derived from discovering and articulating the book's big ideas.

Generate a complete outline artifact with this hierarchy:
- book
- section
- chapter

Requirements:
- Determine the number of sections organically from the material. Do not force a formula.
- Determine the number of chapters per section organically from the material. Do not force symmetry.
- Every section and chapter must have a clear big idea and job in the reader journey.
- The outline must guide the reader through all 5 phases of transformation (Current Reality → Disruption → Revelation → Application → Transformation) somewhere across the book.
- Each section should span 1-3 phases, and each chapter should emphasize ONE specific phase.
- The outline must respect the book's target word count and cascade the math correctly.

Word count rules:
- targetWordCount must equal the sum of all section wordCountTarget values.
- Each section.wordCountTarget must equal the sum of its chapters' wordCountTarget values.
- Do not generate paragraph-level plans in Phase 1. Phase 2 handles paragraph blueprints.
- internalStructure blocks should describe the intended chapter architecture at a high level, not individual paragraph output.

Audience and voice rules:
- Use recognizable audience segments and buying contexts from the Book Pitch and audience research, not fictitious full-name personas.
- voiceBlendEmphasis should explain which voice leads the chapter and why.
- personasThatResonate should explain which audience segments recognize themselves in the chapter and why.

Structure rules:
- overview should explain the whole-book architecture and the journey through big ideas in one strong paragraph.
- structureRationale should explain why this section/chapter architecture is the right fit for the book and its big ideas.
- Each section needs:
  - title
  - optional subtitle
  - bigIdea (the single overarching insight that organizes this section)
  - description (what big idea(s) this section explores)
  - whyThisSectionExists (why this section exists in the book's narrative)
  - whatItCovers
  - howItServesTheLargerStory
  - readerJourneyPhases (which 1-3 phases this section primarily covers)
  - wordCountTarget
  - chapters
- Each chapter needs:
  - title
  - optional subtitle
  - bigIdea (the single powerful insight this chapter teaches)
  - description (how this chapter delivers its big idea)
  - whyThisChapterExists (why this chapter exists in the section)
  - coreIdea (explicit statement of the chapter's core big idea)
  - whatGetsConveyed
  - storytellingTechnique
  - personasThatResonate
  - voiceBlendEmphasis
  - readerTransformationByEnd
  - readerJourneyPhase (which single phase this chapter emphasizes)
  - wordCountTarget
  - internalStructureLabel
  - internalStructure
  - openingHook
  - closingBridge

Internal structure rules:
- Use ME-WE-TRUTH-YOU-WE when it fits the chapter and the big idea the chapter teaches.
- If a chapter needs a different structure, name it honestly in internalStructureLabel and reflect that in internalStructure.
- internalStructure should describe the major structural elements, their rough span, their purpose, and their word count.
- Each section of the internal structure should serve the big idea (the TRUTH).

Revision behavior:
- If a current outline and a revision target are supplied, revise that specific part while preserving coherence elsewhere.
- If the user asked for a fresh pass, rethink the full architecture from the Knowledge Base content rather than making tiny edits.

Quality bar:
- Commercially sharp, editorially coherent, and structurally sound.
- Not a bland table of contents.
- Every chapter should feel necessary and should articulate a clear big idea.
- Avoid obvious symmetry. Do not default to the same number of chapters per section or near-identical chapter lengths unless the material genuinely demands it.
- Let the natural big ideas and argument progression determine where the book spends more space.
`;

const OUTLINE_COMPACT_RETRY_SYSTEM_PROMPT = `
You are the Outline-stage architect for a serious nonfiction book.

This phase must stay lightweight. Generate the architecture only.
${OUTLINE_SOURCE_DIRECTIVE_TOKEN}

YOUR TASK: Discover the big ideas in the Knowledge Base and organize them into sections and chapters.
- Each chapter = ONE big idea delivered through the reader's journey
- Each section = a cluster of related big ideas with ONE overarching theme
- Use ME-WE-TRUTH-YOU-WE structure where it fits

Return JSON only. Do not include markdown fences. Do not add commentary before or after the JSON.

CRITICAL: Do NOT include any promise structure or pitch framework. All descriptions must be original, content-driven, and grounded in the Knowledge Base big ideas.

Generate only the minimum fields needed for a strong Phase 1 outline:
- workingTitle
- overview
- structureRationale
- readerTransformation
- targetWordCount
- sections

For each section, return only:
- title
- subtitle (optional, max 10 words)
- bigIdea (the single overarching theme that organizes this section)
- whyThisSectionExists (why this section is essential)
- readerJourneyPhases (1-3 phases this section covers, e.g., ["Current Reality", "Disruption"] or ["Revelation"])
- wordCountTarget
- chapters

For each chapter, return only:
- title
- subtitle (optional, max 10 words)
- bigIdea (the single powerful insight this chapter teaches)
- whyThisChapterExists (why this chapter is essential to the section)
- coreIdea (restatement of the big idea as a core principle)
- readerJourneyPhase (which single phase this chapter emphasizes)
- wordCountTarget

Strictly do not include:
- descriptions
- whatItCovers
- howItServesTheLargerStory
- whatGetsConveyed
- storytellingTechnique
- openingHook
- closingBridge
- paragraphs
- personasThatResonate
- voiceBlendEmphasis
- internalStructure
- calculationDisplay

Keep every field concise:
- overview: max 70 words (describe the big ideas journey through the book)
- structureRationale: max 70 words (why these big ideas, in this order)
- readerTransformation: max 35 words
- subtitle: max 10 words (adds specificity or angle to the title)
- bigIdea (section): max 18 words (the single overarching theme)
- whyThisSectionExists: max 18 words (the section's role in the book)
- readerJourneyPhases: 1-3 phases like ["Current Reality", "Disruption"] or ["Revelation", "Application"]
- bigIdea (chapter): max 18 words (the single insight this chapter teaches)
- whyThisChapterExists: max 18 words (the chapter's role in the section)
- coreIdea: max 18 words (restatement of the chapter's big idea)
- readerJourneyPhase: one of the 5 phases (Current Reality, Disruption, Revelation, Application, Transformation)

Requirements:
- Determine sections and chapters organically from the Knowledge Base big ideas.
- Avoid obvious symmetry in chapter counts and chapter lengths.
- Respect the book target word count exactly at the book > section > chapter level.
- Cover the full reader journey across all 5 phases using section readerJourneyPhases and chapter readerJourneyPhase assignments.
- Every title, whyThisChapterExists, and coreIdea should articulate a genuine big idea.
- Each chapter's readerJourneyPhase should align with how that chapter delivers its big idea to the reader.
`;

type JsonExtractionDetails = {
  startIndex: number;
  endIndex: number;
  depth: number;
  inString: boolean;
  escaping: boolean;
};

class JsonExtractionError extends Error {
  details: JsonExtractionDetails;
  kind: "missing_json" | "incomplete_json";

  constructor(
    kind: "missing_json" | "incomplete_json",
    message: string,
    details: JsonExtractionDetails,
  ) {
    super(message);
    this.name = "JsonExtractionError";
    this.kind = kind;
    this.details = details;
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

/**
 * Committed BOOK_SETUP_PROFILE artifacts come in two shapes: the structured
 * profile and a markdown {text} blob (Blueprint chat commits). Shallow-merge
 * over defaults so downstream field access never hits undefined.
 */
function normalizeBookSetupProfile(value: unknown): BookSetupProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return { ...DEFAULT_BOOK_SETUP_PROFILE, ...(value as Partial<BookSetupProfile>) };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function coerceString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function cleanDescription(value: string): string {
  // Strip out book promise/pitch data that sometimes leaks into descriptions
  let text = value.trim();

  // If the entire thing starts with promise statement markers, return empty
  // This handles cases like "--- This book promises..." at the start
  if (text.startsWith("---") && text.toLowerCase().includes("this book promises")) {
    return "";
  }

  const cleaned = text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();

      // Skip empty lines early
      if (trimmed.length === 0) {
        return false;
      }

      // Filter out promise-related markers and text
      if (
        line.includes("# Pillars:") ||
        line.includes("## The Promise") ||
        line.includes("## 1. The Promise") ||
        line.includes("Comprehensive Promise Statement") ||
        trimmed.startsWith("---") ||
        trimmed.toLowerCase().startsWith("this book promises") || // Any line starting with promise statement
        trimmed.toLowerCase().includes("fundamentally change how you") // Common promise phrasing
      ) {
        return false;
      }

      // Filter out excessive markdown headings (promise structure)
      if (trimmed.startsWith("###") || trimmed.startsWith("####")) {
        return false;
      }

      return true;
    })
    .join("\n")
    .trim();

  // If the description got stripped to nothing, return fallback
  return cleaned.length > 0 ? cleaned : "";
}

function coerceStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const next = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);

  return next.length ? next : fallback;
}

function truncateText(value: string | null | undefined, limit = 500): string {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trim()}...`;
}

function truncateList(value: string[] | null | undefined, itemLimit = 6, textLimit = 180): string[] {
  return (value ?? [])
    .map((entry) => truncateText(entry, textLimit))
    .filter((entry) => entry.length > 0)
    .slice(0, itemLimit);
}

function summarizeOutlineForPrompt(
  outline: BookOutline | null,
  targetId?: string,
  targetType?: "section" | "chapter",
) {
  if (!outline) {
    return null;
  }

  const sections = outline.sections.map((section) => ({
    id: section.id,
    number: section.number,
    title: truncateText(section.title, 120),
    wordCountTarget: section.wordCountTarget,
    readerJourneyPhases: section.readerJourneyPhases.slice(0, 3),
    chapters: section.chapters.map((chapter) => ({
      id: chapter.id,
      number: chapter.number,
      title: truncateText(chapter.title, 120),
      wordCountTarget: chapter.wordCountTarget,
    })),
  }));

  const targetedSection =
    targetType === "section" && targetId
      ? outline.sections.find((section) => section.id === targetId) ?? null
      : null;
  const targetedChapter =
    targetType === "chapter" && targetId
      ? outline.sections.flatMap((section) => section.chapters).find((chapter) => chapter.id === targetId) ??
        null
      : null;

  return {
    overview: truncateText(outline.overview, 280),
    structureRationale: truncateText(outline.structureRationale, 280),
    targetWordCount: outline.targetWordCount,
    sections,
    targetedSection: targetedSection
      ? {
          id: targetedSection.id,
          number: targetedSection.number,
          title: truncateText(targetedSection.title, 140),
          description: truncateText(targetedSection.description, 280),
          whyThisSectionExists: truncateText(targetedSection.whyThisSectionExists, 220),
          whatItCovers: truncateText(targetedSection.whatItCovers, 220),
          howItServesTheLargerStory: truncateText(
            targetedSection.howItServesTheLargerStory,
            220,
          ),
          chapterTitles: targetedSection.chapters.map((chapter) => truncateText(chapter.title, 100)),
        }
      : null,
    targetedChapter: targetedChapter
      ? {
          id: targetedChapter.id,
          number: targetedChapter.number,
          title: truncateText(targetedChapter.title, 140),
          description: truncateText(targetedChapter.description, 280),
          coreIdea: truncateText(targetedChapter.coreIdea, 220),
          whatGetsConveyed: truncateList(targetedChapter.whatGetsConveyed, 4, 140),
          storytellingTechnique: truncateText(targetedChapter.storytellingTechnique, 120),
          openingHook: truncateText(targetedChapter.openingHook, 160),
          closingBridge: truncateText(targetedChapter.closingBridge, 160),
        }
      : null,
  };
}

function coercePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return Math.max(1, Math.round(fallback));
}

function slugifyId(value: string, fallback: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || fallback;
}

function describeRange(start: number, end: number) {
  return start === end ? `Para ${start}` : `Paras ${start}-${end}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function extractTextFromResponse(response: unknown): string {
  if (!response) {
    return "";
  }

  if (typeof response === "string") {
    return response;
  }

  const record = objectRecord(response);
  const content = record.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        const entryRecord = objectRecord(entry);
        if (typeof entryRecord.text === "string") {
          return entryRecord.text;
        }

        if (
          entryRecord.type === "text" &&
          typeof entryRecord.value === "string"
        ) {
          return entryRecord.value;
        }

        return "";
      })
      .join("");
  }

  if (typeof record.text === "string") {
    return record.text;
  }

  return "";
}

function findBalancedJsonObject(text: string): JsonExtractionDetails {
  let startIndex = -1;
  let endIndex = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (startIndex === -1) {
      if (char === "{") {
        startIndex = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        endIndex = index;
        break;
      }
    }
  }

  return {
    startIndex,
    endIndex,
    depth,
    inString,
    escaping,
  };
}

function extractJsonText(text: string): string {
  const details = findBalancedJsonObject(text);

  if (details.startIndex === -1) {
    throw new JsonExtractionError("missing_json", "No JSON object found in model response", details);
  }

  if (details.endIndex === -1) {
    throw new JsonExtractionError(
      "incomplete_json",
      "Model response ended before the JSON object closed",
      details,
    );
  }

  return text.slice(details.startIndex, details.endIndex + 1);
}

function distributeWordCounts(total: number, desired: number[]): number[] {
  if (desired.length === 0) {
    return [];
  }

  const safeTotal = Math.max(desired.length, Math.round(total));
  const weights = desired.map((value) => (value > 0 ? value : 1));
  const weightSum = weights.reduce((sum, value) => sum + value, 0);

  const baseCounts = weights.map((weight) => Math.floor((safeTotal * weight) / weightSum));
  let assigned = baseCounts.reduce((sum, value) => sum + value, 0);

  const fractions = weights
    .map((weight, index) => ({
      index,
      fraction: (safeTotal * weight) / weightSum - baseCounts[index],
    }))
    .sort((left, right) => right.fraction - left.fraction);

  let cursor = 0;
  while (assigned < safeTotal) {
    baseCounts[fractions[cursor % fractions.length].index] += 1;
    assigned += 1;
    cursor += 1;
  }

  while (assigned > safeTotal) {
    const index = fractions[cursor % fractions.length].index;
    if (baseCounts[index] > 1) {
      baseCounts[index] -= 1;
      assigned -= 1;
    }
    cursor += 1;
  }

  return baseCounts;
}

function buildDefaultParagraphScaffold(chapterTitle: string, coreIdea: string): OutlineParagraph[] {
  return [
    {
      id: "para-me",
      number: 1,
      mainIdea: `${chapterTitle} opens inside the tension that makes this chapter necessary.`,
      whatGetsConveyed:
        "Ground the reader in a concrete leadership or market tension so the chapter begins with felt stakes rather than abstraction.",
      whyItExists: "Create an immediate human entry point into the chapter.",
      wordCountTarget: 0,
      structuralElement: "ME",
    },
    {
      id: "para-we",
      number: 2,
      mainIdea: "The tension broadens into a shared pattern the audience recognizes in their own world.",
      whatGetsConveyed:
        "Show how the same pressure repeats across teams, roles, or buying contexts so the reader feels less isolated and more accurately seen.",
      whyItExists: "Expand the chapter from individual experience into shared reality.",
      wordCountTarget: 0,
      structuralElement: "WE",
    },
    {
      id: "para-truth",
      number: 3,
      mainIdea: coreIdea || `The chapter reframes ${chapterTitle.toLowerCase()} through the book's central truth.`,
      whatGetsConveyed:
        "Introduce the governing insight, framework move, or paradox that changes how the reader interprets the problem.",
      whyItExists: "Deliver the conceptual shift that makes the chapter matter.",
      wordCountTarget: 0,
      structuralElement: "TRUTH",
    },
    {
      id: "para-you",
      number: 4,
      mainIdea: "The truth becomes useful only when it is translated into action, judgment, or experiment.",
      whatGetsConveyed:
        "Turn the chapter from idea to application by naming what the reader should do, test, or notice next.",
      whyItExists: "Move the chapter from understanding into practical use.",
      wordCountTarget: 0,
      structuralElement: "YOU",
    },
    {
      id: "para-we-vision",
      number: 5,
      mainIdea: "The chapter closes by reconnecting the reader to the broader change this new understanding makes possible.",
      whatGetsConveyed:
        "Show how the chapter advances the wider arc of the book and prepares the reader for the next chapter.",
      whyItExists: "Land the chapter and bridge it forward.",
      wordCountTarget: 0,
      structuralElement: "WE",
    },
  ];
}

function buildInternalStructureFromParagraphs(paragraphs: OutlineParagraph[]): OutlineStructureBlock[] {
  if (!paragraphs.length) {
    return [];
  }

  const blocks: OutlineStructureBlock[] = [];
  let startIndex = 0;

  for (let index = 1; index <= paragraphs.length; index += 1) {
    const current = paragraphs[index];
    const previous = paragraphs[index - 1];
    const boundary = !current || current.structuralElement !== previous.structuralElement;

    if (!boundary) {
      continue;
    }

    const segment = paragraphs.slice(startIndex, index);
    blocks.push({
      label: previous.structuralElement,
      paragraphRange: describeRange(startIndex + 1, index),
      purpose: segment.map((paragraph) => paragraph.whyItExists).join(" "),
      wordCountTarget: segment.reduce((sum, paragraph) => sum + paragraph.wordCountTarget, 0),
    });
    startIndex = index;
  }

  return blocks;
}

function buildPhaseMapping(sections: OutlineSection[]) {
  const phases: ReaderJourneyPhase[] = ["Current Reality", "Disruption", "Revelation", "Application", "Transformation"];

  return phases.map((phase) => {
    const sectionNumbers = sections
      .filter((section) =>
        (section.readerJourneyPhases ?? []).some(
          (entry) => entry === phase,
        ),
      )
      .map((section) => section.number);

    return {
      phase,
      sectionNumbers,
      explanation:
        sectionNumbers.length > 0
          ? `This phase is primarily carried by Section${sectionNumbers.length > 1 ? "s" : ""} ${sectionNumbers.join(", ")}.`
          : `This phase is woven across the book rather than isolated in a single section.`,
    };
  });
}

function buildFallbackOutline(
  promise: PromiseBrief,
  bookPromiseReport?: BookPromiseReport | null,
  bookSetupProfile?: BookSetupProfile | null,
): BookOutline {
  const targetWordCount = bookSetupProfile?.targetWordCount ?? 45000;
  const workingTitle = bookPromiseReport?.title ?? bookSetupProfile?.workingTitle ?? promise.workingTitle;
  const subtitle = bookPromiseReport?.subtitle ?? bookSetupProfile?.subtitle ?? undefined;

  const blueprint = [
    {
      title: "The Problem Becomes Visible",
      subtitle: "Naming the cost of the current belief system",
      why: "Open the book inside the reader's real friction so the problem feels immediate and specific.",
      covers:
        "The lived cost of the current false belief, the pressures that keep it alive, and the first signs that the old approach is no longer working.",
      story:
        "This section guides the reader through Current Reality and Disruption by helping them see the current state clearly and feel the awakening friction that makes change necessary.",
      readerJourneyPhases: ["Current Reality" as const, "Disruption" as const],
      weight: 16,
      chapters: [
        {
          title: "The Cost of Staying in the Old Story",
          subtitle: "Why the current approach is quietly failing",
          why: "Establish the felt pain and strategic stakes behind the book.",
          coreIdea: promise.readerProblem || "The current operating model is costing more than it appears.",
          technique: "Scene + diagnosis + commercial context",
          hook: "Start with a vivid scene or buyer moment that shows the problem already costing something real.",
          bridge: "End by revealing that the visible symptoms point to a deeper shared pattern.",
          weight: 7,
        },
        {
          title: "Why Smart People Keep Repeating the Pattern",
          subtitle: "The logic of the false belief",
          why: "Explain why the reader has stayed stuck without insulting their intelligence.",
          coreIdea:
            promise.bigIdea ||
            "The status quo persists because the reader has inherited a belief system that once seemed sensible.",
          technique: "Pattern analysis + audience empathy",
          hook: "Open by naming the seductive logic of the old way.",
          bridge: "Close by widening the problem from individual frustration into a larger shared reality.",
          weight: 9,
        },
      ],
    },
    {
      title: "The Shared Reality Underneath the Problem",
      subtitle: "How the dilemma shows up across the audience",
      why: "Move from individual struggle into the broader audience pattern so readers recognize themselves in a larger whole.",
      covers:
        "The shared tension across audience segments, the different ways it manifests, and the emotional question that primes the truth.",
      story:
        "This section guides the reader through Disruption and Revelation by deepening recognition, surfacing resistance, and setting up the moment where the truth can land.",
      readerJourneyPhases: ["Disruption" as const, "Revelation" as const],
      weight: 18,
      chapters: [
        {
          title: "How the Same Problem Changes Shape Across the Audience",
          subtitle: "Different contexts, one underlying tension",
          why: "Show how the book serves more than one audience segment without losing coherence.",
          coreIdea: "The surface symptoms differ, but the underlying problem is structurally the same.",
          technique: "Comparative examples + persona translation",
          hook: "Open by contrasting two different audience situations that are secretly driven by the same issue.",
          bridge: "Close by pointing toward the deeper question the reader must now answer.",
          weight: 7,
        },
        {
          title: "The Question the Reader Can No Longer Avoid",
          subtitle: "When recognition becomes decision",
          why: "Create the emotional and strategic turn that makes the truth feel necessary rather than optional.",
          coreIdea:
            promise.stakes ||
            "Once the reader sees the true cost of the current pattern, they have to decide whether they are willing to change.",
          technique: "Escalation + reflective challenge",
          hook: "Open by naming the moment when irritation becomes a serious leadership or market decision.",
          bridge: "Close on the edge of the reframe so the truth arrives with momentum.",
          weight: 5,
        },
        {
          title: "Why This Problem Persists Even After People Notice It",
          subtitle: "The forces that pull readers back to the default",
          why: "Show why recognition alone is not enough and why the next section must introduce a new lens rather than more awareness.",
          coreIdea:
            "Readers stay stuck because their environment, incentives, and habits quietly reward the very pattern they say they want to escape.",
          technique: "System analysis + example chain",
          hook: "Open by showing how insight without a new operating model quickly collapses back into the old behavior.",
          bridge: "Close by making the reader ready for a truth that changes interpretation, not just effort.",
          weight: 6,
        },
      ],
    },
    {
      title: "The Truth That Changes the Reader's Lens",
      subtitle: "Where the book's framework or paradox lands",
      why: "Deliver the core insight at the right moment and give it enough space to feel clear, credible, and useful.",
      covers:
        "The central truth, the paradox, the proof, the framework logic, and the reason this truth changes what the reader can do next.",
      story:
        "This section emphasizes the Revelation phase where the new truth is encountered and the reader's understanding is reframed.",
      readerJourneyPhases: ["Revelation" as const],
      weight: 26,
      chapters: [
        {
          title: "The Reframe",
          subtitle: "The central truth in plain language",
          why: "State the book's truth with enough clarity that the whole architecture can now lock into place.",
          coreIdea: promise.coreTruth || promise.bigIdea,
          technique: "Insight delivery + paradox framing",
          hook: "Open by overturning the assumption the reader most expects the book to confirm.",
          bridge: "Close by showing that the truth needs proof and application, not just agreement.",
          weight: 11,
        },
        {
          title: "Why This Truth Holds Up in the Real World",
          subtitle: "Proof, examples, and pressure-testing",
          why: "Make the truth credible enough to survive skepticism and practical enough to matter.",
          coreIdea:
            bookPromiseReport?.authorCredibility ||
            "The truth is not a slogan; it stands up when tested against real conditions and evidence.",
          technique: "Evidence + story + comparison",
          hook: "Open with the objection a smart skeptic would raise to the truth.",
          bridge: "Close by turning credibility into readiness for action.",
          weight: 15,
        },
      ],
    },
    {
      title: "Putting the Truth to Work",
      subtitle: "How readers turn insight into new behavior",
      why: "Translate the framework into action so the book does not stop at diagnosis or inspiration.",
      covers:
        "Application steps, experiments, implementation resistance, and the habits or decisions that make the truth operational.",
      story:
        "This section guides the reader through Application and Transformation by translating insight into practical behavior change.",
      readerJourneyPhases: ["Application" as const, "Transformation" as const],
      weight: 24,
      chapters: [
        {
          title: "The First Moves That Change the Pattern",
          subtitle: "Where implementation actually begins",
          why: "Help the reader move from agreement into the first behavior change that creates momentum.",
          coreIdea:
            promise.transformationAfter ||
            "The new truth becomes real when the reader takes a first concrete step that interrupts the old pattern.",
          technique: "Framework translation + first-step application",
          hook: "Open with the practical question the reader asks right after accepting the truth: what do I do on Monday?",
          bridge: "Close by surfacing the resistance that appears after the first attempt.",
          weight: 6,
        },
        {
          title: "Where Readers Stall and How They Break Through",
          subtitle: "Handling resistance without losing conviction",
          why: "Prepare the reader for the friction of application so they do not mistake resistance for failure.",
          coreIdea:
            "Breakthrough comes when the reader can stay with the new truth long enough to see evidence, not just effort.",
          technique: "Obstacle mapping + decision coaching",
          hook: "Open with the moment when the new behavior feels hardest to sustain.",
          bridge: "Close by showing what starts to change once the new pattern holds.",
          weight: 5,
        },
        {
          title: "How the New Pattern Scales Across Real Decisions",
          subtitle: "Turning a useful experiment into an operating system",
          why: "Move the reader from isolated wins into repeatable judgment so the application section feels durable rather than inspirational.",
          coreIdea:
            "The truth proves itself when it starts to shape multiple decisions consistently, not just one successful experiment.",
          technique: "Applied framework + scenario walk-through",
          hook: "Open by asking what changes when the reader applies the same principle to a second and third decision, not just the first.",
          bridge: "Close by showing how repeated application becomes evidence of a new normal.",
          weight: 7,
        },
      ],
    },
    {
      title: "The New Normal Readers Can Build",
      subtitle: "What becomes possible once the truth is integrated",
      why: "Close the book by turning isolated wins into identity-level change and future-oriented conviction.",
      covers:
        "Integrated success, new identity, collective vision, and the enduring future the book wants the reader to inhabit.",
      story:
        "This closing section emphasizes Transformation by showing how the truth becomes a stable operating pattern and a broader vision.",
      readerJourneyPhases: ["Transformation" as const],
      weight: 16,
      chapters: [
        {
          title: "What Success Looks Like After the Shift",
          subtitle: "Evidence that the truth has taken root",
          why: "Show the reader how they will know the transformation is real.",
          coreIdea:
            promise.transformationAfter ||
            "The outcome of this book is not just better thinking, but a durable new way of seeing and acting.",
          technique: "Outcome vision + success markers",
          hook: "Open with a before-and-after contrast that makes the shift tangible.",
          bridge: "Close by widening the change from the individual into the larger system or market.",
          weight: 6,
        },
        {
          title: "Carrying the Truth Forward",
          subtitle: "How the reader leads from the new center",
          why: "End with a compelling future-state that makes the book feel complete and enduring.",
          coreIdea:
            bookPromiseReport?.corePromise ||
            "The reader's final job is to live from the truth consistently enough that it reshapes how they lead, decide, and build.",
          technique: "Vision casting + closing challenge",
          hook: "Open by inviting the reader to imagine what changes if this way of operating becomes their default.",
          bridge: "Close with a final call that points toward the work beyond the book.",
          weight: 10,
        },
      ],
    },
  ];

  const sectionWordCounts = distributeWordCounts(
    targetWordCount,
    blueprint.map((section) => section.weight),
  );

  const sections: OutlineSection[] = blueprint.map((sectionPlan, sectionIndex) => {
    const chapterWordCounts = distributeWordCounts(
      sectionWordCounts[sectionIndex],
      sectionPlan.chapters.map((chapter) => chapter.weight ?? 1),
    );

    const chapters: OutlineChapter[] = sectionPlan.chapters.map((chapterPlan, chapterIndex) => {
      const paragraphSeed = buildDefaultParagraphScaffold(
        chapterPlan.title,
        chapterPlan.coreIdea,
      );
      const paragraphWordCounts = distributeWordCounts(
        chapterWordCounts[chapterIndex],
        [18, 20, 24, 24, 14],
      );

      const paragraphs = paragraphSeed.map((paragraph, paragraphIndex) => ({
        ...paragraph,
        id: `${slugifyId(chapterPlan.title, `chapter-${chapterIndex + 1}`)}-para-${paragraphIndex + 1}`,
        wordCountTarget: paragraphWordCounts[paragraphIndex],
      }));

      return {
        id: `${slugifyId(sectionPlan.title, `section-${sectionIndex + 1}`)}-chapter-${chapterIndex + 1}`,
        number: chapterIndex + 1,
        title: chapterPlan.title,
        subtitle: chapterPlan.subtitle,
        bigIdea: chapterPlan.coreIdea,
        description: `${chapterPlan.why} ${chapterPlan.coreIdea}`,
        whyThisChapterExists: chapterPlan.why,
        coreIdea: chapterPlan.coreIdea,
        whatGetsConveyed: [
          chapterPlan.coreIdea,
          "Why the chapter matters inside the larger book movement.",
          "What the reader must understand or do before moving on.",
        ],
        storytellingTechnique: chapterPlan.technique,
        personasThatResonate: [
          {
            audienceSegment: bookPromiseReport?.targetAudience || promise.audiencePrimary,
            whyThisResonates:
              "This chapter addresses a live pressure or buying question that the core audience is already trying to solve.",
            priority: "primary",
          },
        ],
        voiceBlendEmphasis: {
          primary: "Andy",
          secondary: "Drucker",
          tertiary: "Jobs",
          reasoning:
            "Lead with clarity and practical diagnosis, support it with strategic framing, and use inspiration to widen the stakes without turning the chapter into hype.",
        },
        readerTransformationByEnd:
          "The reader leaves with a clearer lens for this part of the problem and a stronger sense of what the next chapter must build.",
        readerJourneyPhase:
          chapterIndex === 0
            ? sectionPlan.readerJourneyPhases[0] ?? "Revelation"
            : sectionPlan.readerJourneyPhases[Math.min(sectionPlan.readerJourneyPhases.length - 1, 1)] ?? "Revelation",
        wordCountTarget: chapterWordCounts[chapterIndex],
        calculationDisplay: "",
        internalStructureLabel: "ME-WE-TRUTH-YOU-WE",
        internalStructure: buildInternalStructureFromParagraphs(paragraphs),
        openingHook: chapterPlan.hook,
        closingBridge: chapterPlan.bridge,
        paragraphs,
      };
    });

    return {
      id: `section-${sectionIndex + 1}`,
      number: sectionIndex + 1,
      title: sectionPlan.title,
      subtitle: sectionPlan.subtitle,
      bigIdea: sectionPlan.title,
      description: `${sectionPlan.why} ${sectionPlan.covers}`,
      whyThisSectionExists: sectionPlan.why,
      whatItCovers: sectionPlan.covers,
      howItServesTheLargerStory: sectionPlan.story,
      readerJourneyPhases: sectionPlan.readerJourneyPhases,
      wordCountTarget: sectionWordCounts[sectionIndex],
      calculationDisplay: "",
      chapters,
    };
  });

  const outline = renumberBookOutline({
    workingTitle,
    subtitle,
    overview:
      "This outline opens by making the reader's current problem undeniable, widens that dilemma into a shared audience pattern, delivers the book's core truth at the right moment, and then spends enough space on application and integration for the transformation to feel earned rather than merely described.",
    structureRationale:
      "The architecture follows the reader's journey through Current Reality → Disruption → Revelation → Application → Transformation so the book earns the reader's trust before it asks for change, gives the truth enough room to land, and then devotes substantial space to making the framework usable in the reader's actual context.",
    readerTransformation: `${promise.transformationBefore} -> ${promise.transformationAfter}`,
    targetWordCount,
    readerJourneyMapping: [],
    wordCountVerification: calculateOutlineWordCountVerification({
      targetWordCount,
      sections,
    }),
    sections,
    generationMeta: {
      source: "fallback",
      reason: "Generated from the local scaffold template.",
      generatedAt: new Date().toISOString(),
    },
  });

  return renumberBookOutline({
    ...outline,
    readerJourneyMapping: buildPhaseMapping(outline.sections),
  });
}

function buildPromiseFromBookPitch(
  workingTitle: string,
  bookPromiseReport: BookPromiseReport,
): PromiseBrief {
  return {
    workingTitle: bookPromiseReport.title || workingTitle,
    audiencePrimary: bookPromiseReport.targetAudience,
    audienceSecondary: [],
    category: "Serious nonfiction",
    readerProblem: bookPromiseReport.executiveSummary || bookPromiseReport.rationale,
    readerDesire: bookPromiseReport.corePromise,
    bigIdea: bookPromiseReport.conceptStatement,
    coreTruth: bookPromiseReport.corePromise,
    transformationBefore:
      "The reader understands the stakes intellectually but does not yet have a coherent path forward.",
    transformationAfter: bookPromiseReport.corePromise,
    differentiation: bookPromiseReport.marketOpportunity,
    promiseStatement: bookPromiseReport.corePromise,
    stakes: bookPromiseReport.rationale,
    tone: ["clear", "strategic", "practical"],
    openQuestions: [],
  };
}

function normalizeParagraph(
  rawParagraph: unknown,
  fallbackParagraph: OutlineParagraph | undefined,
  chapterTitle: string,
  paragraphIndex: number,
): OutlineParagraph {
  const record = objectRecord(rawParagraph);
  const mainIdea = coerceString(
    record.mainIdea,
    fallbackParagraph?.mainIdea ?? `${chapterTitle} paragraph ${paragraphIndex + 1} develops the chapter's next key move.`,
  );

  return {
    id: coerceString(
      record.id,
      fallbackParagraph?.id ?? `${slugifyId(chapterTitle, "chapter")}-para-${paragraphIndex + 1}`,
    ),
    number: paragraphIndex + 1,
    mainIdea,
    whatGetsConveyed: coerceString(
      record.whatGetsConveyed,
      fallbackParagraph?.whatGetsConveyed ??
        "Clarify the next part of the chapter's argument in a way that moves the reader forward.",
    ),
    whyItExists: coerceString(
      record.whyItExists,
      fallbackParagraph?.whyItExists ?? "Advance the chapter's reasoning path.",
    ),
    wordCountTarget: coercePositiveInteger(
      record.wordCountTarget,
      fallbackParagraph?.wordCountTarget ?? 500,
    ),
    structuralElement: coerceString(
      record.structuralElement,
      fallbackParagraph?.structuralElement ?? "TRUTH",
    ),
  };
}

function normalizeChapter(
  rawChapter: unknown,
  fallbackChapter: OutlineChapter | undefined,
  sectionTitle: string,
  chapterIndex: number,
): OutlineChapter {
  const record = objectRecord(rawChapter);
  const title = coerceString(
    record.title,
    fallbackChapter?.title ?? `Chapter ${chapterIndex + 1}`,
  );
  const coreIdea = coerceString(
    record.coreIdea,
    fallbackChapter?.coreIdea ?? `This chapter advances ${title.toLowerCase()} inside the larger book argument.`,
  );
  const rawParagraphs = Array.isArray(record.paragraphs) ? record.paragraphs : [];
  const fallbackParagraphs =
    fallbackChapter?.paragraphs?.length
      ? fallbackChapter.paragraphs
      : buildDefaultParagraphScaffold(title, coreIdea);
  const paragraphInput = rawParagraphs.length ? rawParagraphs : fallbackParagraphs;
  const paragraphs = paragraphInput.map((paragraph, paragraphIndex) =>
    normalizeParagraph(paragraph, fallbackParagraphs[paragraphIndex], title, paragraphIndex),
  );

  return {
    id: coerceString(
      record.id,
      fallbackChapter?.id ??
        `${slugifyId(sectionTitle, `section-${chapterIndex + 1}`)}-chapter-${chapterIndex + 1}`,
    ),
    number: coercePositiveInteger(record.number, fallbackChapter?.number ?? chapterIndex + 1),
    title,
    subtitle:
      truncateText(coerceString(record.subtitle, fallbackChapter?.subtitle ?? ""), 120) ||
      undefined,
    bigIdea: truncateText(
      coerceString(
        record.bigIdea,
        fallbackChapter?.bigIdea ?? coreIdea,
      ),
      400,
    ),
    description: truncateText(
      cleanDescription(
        coerceString(record.description, fallbackChapter?.description ?? `${coreIdea}`),
      ),
      600,
    ),
    whyThisChapterExists: truncateText(
      coerceString(
        record.whyThisChapterExists,
        fallbackChapter?.whyThisChapterExists ?? fallbackChapter?.description ?? coreIdea,
      ),
      300,
    ),
    coreIdea: truncateText(coreIdea, 400),
    whatGetsConveyed: truncateList(
      coerceStringArray(record.whatGetsConveyed, fallbackChapter?.whatGetsConveyed ?? [coreIdea]),
      3,
      140,
    ),
    storytellingTechnique: truncateText(
      coerceString(
        record.storytellingTechnique,
        fallbackChapter?.storytellingTechnique ?? "Framework + example + analysis",
      ),
      200,
    ),
    personasThatResonate: Array.isArray(record.personasThatResonate)
      ? record.personasThatResonate.map((entry, index) => {
          const personaRecord = objectRecord(entry);
          const fallbackPersona = fallbackChapter?.personasThatResonate?.[index];
          return {
            audienceSegment: coerceString(
              personaRecord.audienceSegment,
              fallbackPersona?.audienceSegment ?? "Primary audience segment",
            ),
            whyThisResonates: truncateText(
              coerceString(
                personaRecord.whyThisResonates,
                fallbackPersona?.whyThisResonates ??
                  "This chapter mirrors a live problem or buying context for this audience segment.",
              ),
              140,
            ),
            priority:
              personaRecord.priority === "primary" || personaRecord.priority === "secondary"
                ? personaRecord.priority
                : fallbackPersona?.priority,
          };
        })
      : fallbackChapter?.personasThatResonate ?? [],
    voiceBlendEmphasis: (() => {
      const voiceRecord = objectRecord(record.voiceBlendEmphasis);
      const fallbackVoice = fallbackChapter?.voiceBlendEmphasis;
      return {
        primary: coerceString(voiceRecord.primary, fallbackVoice?.primary ?? "Andy"),
        secondary: coerceString(voiceRecord.secondary, fallbackVoice?.secondary ?? "Drucker") || undefined,
        tertiary: coerceString(voiceRecord.tertiary, fallbackVoice?.tertiary ?? "Jobs") || undefined,
        reasoning: truncateText(
          coerceString(
            voiceRecord.reasoning,
            fallbackVoice?.reasoning ??
              "Lead with clear diagnosis, reinforce with strategic framing, and use inspiration only where it deepens conviction.",
          ),
          180,
        ),
      };
    })(),
    readerTransformationByEnd: truncateText(
      coerceString(
        record.readerTransformationByEnd,
        fallbackChapter?.readerTransformationByEnd ??
          "The reader leaves this chapter seeing the problem differently and knowing what must happen next.",
      ),
      180,
    ),
    readerJourneyPhase: (() => {
      const phase = record.readerJourneyPhase ?? fallbackChapter?.readerJourneyPhase;
      if (phase === "Current Reality" || phase === "Disruption" || phase === "Revelation" || phase === "Application" || phase === "Transformation") {
        return phase;
      }
      return "Revelation";
    })(),
    wordCountTarget: coercePositiveInteger(
      record.wordCountTarget,
      fallbackChapter?.wordCountTarget ?? 2500,
    ),
    calculationDisplay: coerceString(record.calculationDisplay, fallbackChapter?.calculationDisplay ?? ""),
    internalStructureLabel: truncateText(
      coerceString(
        record.internalStructureLabel,
        fallbackChapter?.internalStructureLabel ?? "ME-WE-TRUTH-YOU-WE",
      ),
      80,
    ),
    internalStructure: Array.isArray(record.internalStructure)
      ? record.internalStructure.map((entry, index) => {
          const blockRecord = objectRecord(entry);
          const fallbackBlock = fallbackChapter?.internalStructure?.[index];
          return {
            label: coerceString(blockRecord.label, fallbackBlock?.label ?? "TRUTH"),
            paragraphRange: coerceString(
              blockRecord.paragraphRange,
              fallbackBlock?.paragraphRange ?? `Para ${index + 1}`,
            ),
            purpose: truncateText(
              coerceString(
                blockRecord.purpose,
                fallbackBlock?.purpose ?? "Advance the chapter's argument.",
              ),
              140,
            ),
            wordCountTarget: coercePositiveInteger(
              blockRecord.wordCountTarget,
              fallbackBlock?.wordCountTarget ?? 500,
            ),
          };
        })
      : fallbackChapter?.internalStructure ?? [],
    openingHook: truncateText(
      coerceString(
        record.openingHook,
        fallbackChapter?.openingHook ?? `Open with a moment that makes ${title.toLowerCase()} feel urgent.`,
      ),
      160,
    ),
    closingBridge: truncateText(
      coerceString(
        record.closingBridge,
        fallbackChapter?.closingBridge ??
          "Close by handing the reader into the next chapter's tension or application.",
      ),
      160,
    ),
    paragraphs,
  };
}

function normalizeSection(
  rawSection: unknown,
  fallbackSection: OutlineSection | undefined,
  sectionIndex: number,
): OutlineSection {
  const record = objectRecord(rawSection);
  const title = coerceString(
    record.title,
    fallbackSection?.title ?? `Section ${sectionIndex + 1}`,
  );
  const rawChapters = Array.isArray(record.chapters) ? record.chapters : [];
  const fallbackChapters = fallbackSection?.chapters ?? [];
  const chapterInput = rawChapters.length ? rawChapters : fallbackChapters;
  const chapters = chapterInput.map((chapter, chapterIndex) =>
    normalizeChapter(chapter, fallbackChapters[chapterIndex], title, chapterIndex),
  );

  return {
    id: coerceString(record.id, fallbackSection?.id ?? `section-${sectionIndex + 1}`),
    number: coercePositiveInteger(record.number, fallbackSection?.number ?? sectionIndex + 1),
    title,
    subtitle:
      truncateText(coerceString(record.subtitle, fallbackSection?.subtitle ?? ""), 120) ||
      undefined,
    bigIdea: truncateText(
      coerceString(
        record.bigIdea,
        fallbackSection?.bigIdea ?? title,
      ),
      400,
    ),
    description: truncateText(
      coerceString(
        record.description,
        fallbackSection?.description ??
          `${title} gathers the material the reader must absorb before moving into the next part of the book.`,
      ),
      260,
    ),
    whyThisSectionExists: truncateText(
      coerceString(
        record.whyThisSectionExists,
        fallbackSection?.whyThisSectionExists ?? fallbackSection?.description ?? title,
      ),
      180,
    ),
    whatItCovers: truncateText(
      coerceString(
        record.whatItCovers,
        fallbackSection?.whatItCovers ??
          "The essential ideas, examples, and movement for this part of the book.",
      ),
      180,
    ),
    howItServesTheLargerStory: truncateText(
      coerceString(
        record.howItServesTheLargerStory,
        fallbackSection?.howItServesTheLargerStory ??
          "It moves the reader forward in the larger transformation arc.",
      ),
      200,
    ),
    readerJourneyPhases: (() => {
      const phases = Array.isArray(record.readerJourneyPhases) ? record.readerJourneyPhases : fallbackSection?.readerJourneyPhases;
      if (Array.isArray(phases)) {
        return phases.filter((phase): phase is ReaderJourneyPhase =>
          phase === "Current Reality" || phase === "Disruption" || phase === "Revelation" || phase === "Application" || phase === "Transformation"
        );
      }
      return [];
    })(),
    wordCountTarget: coercePositiveInteger(
      record.wordCountTarget,
      fallbackSection?.wordCountTarget ?? 6000,
    ),
    calculationDisplay: coerceString(record.calculationDisplay, fallbackSection?.calculationDisplay ?? ""),
    chapters,
  };
}

function rebalanceOutlineWordCounts(outline: BookOutline): BookOutline {
  const sectionTargets = distributeWordCounts(
    outline.targetWordCount,
    outline.sections.map((section) => section.wordCountTarget),
  );

  const sections = outline.sections.map((section, sectionIndex) => {
    const chapterTargets = distributeWordCounts(
      sectionTargets[sectionIndex],
      section.chapters.map((chapter) => chapter.wordCountTarget),
    );

    const chapters = section.chapters.map((chapter, chapterIndex) => {
      const fallbackParagraphs =
        chapter.paragraphs.length > 0
          ? chapter.paragraphs
          : buildDefaultParagraphScaffold(chapter.title, chapter.coreIdea);
      const paragraphTargets = distributeWordCounts(
        chapterTargets[chapterIndex],
        fallbackParagraphs.map((paragraph) => paragraph.wordCountTarget || 1),
      );

      const paragraphs = fallbackParagraphs.map((paragraph, paragraphIndex) => ({
        ...paragraph,
        wordCountTarget: paragraphTargets[paragraphIndex],
      }));

      return {
        ...chapter,
        wordCountTarget: chapterTargets[chapterIndex],
        paragraphs,
        internalStructure: buildInternalStructureFromParagraphs(paragraphs),
      };
    });

    return {
      ...section,
      wordCountTarget: sectionTargets[sectionIndex],
      chapters,
    };
  });

  return renumberBookOutline({
    ...outline,
    sections,
    wordCountVerification: calculateOutlineWordCountVerification({
      targetWordCount: outline.targetWordCount,
      sections,
    }),
  });
}

function normalizeOutline(
  value: unknown,
  fallback: BookOutline,
  overrideTargetWordCount?: number,
): BookOutline {
  const raw = objectRecord(value);
  if (!Object.keys(raw).length) {
    return fallback;
  }

  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  const sectionInput = rawSections.length ? rawSections : fallback.sections;
  const sections = sectionInput.map((section, sectionIndex) =>
    normalizeSection(section, fallback.sections[sectionIndex], sectionIndex),
  );

  const targetWordCount = coercePositiveInteger(
    raw.targetWordCount,
    overrideTargetWordCount ?? fallback.targetWordCount,
  );

  const draft = renumberBookOutline({
    workingTitle: coerceString(raw.workingTitle, fallback.workingTitle),
    subtitle: coerceString(raw.subtitle, fallback.subtitle ?? "") || fallback.subtitle,
    overview: coerceString(raw.overview, fallback.overview),
    structureRationale: coerceString(raw.structureRationale, fallback.structureRationale),
    readerTransformation: coerceString(
      raw.readerTransformation,
      fallback.readerTransformation,
    ),
    targetWordCount,
    readerJourneyMapping: [],
    wordCountVerification: calculateOutlineWordCountVerification({
      targetWordCount,
      sections,
    }),
    sections,
  });

  const rebalanced = rebalanceOutlineWordCounts(draft);
  const rawGenerationMeta = objectRecord(raw.generationMeta);
  const generationMeta: OutlineGenerationMeta =
    Object.keys(rawGenerationMeta).length > 0
      ? {
          source:
            rawGenerationMeta.source === "sonnet" ||
            rawGenerationMeta.source === "fallback"
              ? rawGenerationMeta.source
              : "unknown",
          model: coerceString(rawGenerationMeta.model),
          reason: coerceString(rawGenerationMeta.reason),
          generatedAt: coerceString(rawGenerationMeta.generatedAt),
        }
      : { source: "unknown" };
  const rawPhaseMapping = Array.isArray(raw.readerJourneyMapping) ? raw.readerJourneyMapping : [];
  const readerJourneyMapping =
    rawPhaseMapping.length > 0
      ? rawPhaseMapping.map((entry) => {
          const record = objectRecord(entry);
          const phase = record.phase;
          if (phase !== "Current Reality" && phase !== "Disruption" && phase !== "Revelation" && phase !== "Application" && phase !== "Transformation") {
            return null;
          }
          return {
            phase,
            sectionNumbers: Array.isArray(record.sectionNumbers)
              ? record.sectionNumbers
                  .map((value) => (typeof value === "number" ? Math.round(value) : null))
                  .filter((value): value is number => value !== null && value > 0)
              : [],
            explanation: coerceString(
              record.explanation,
              "This phase is carried by the sections listed here.",
            ),
          };
        }).filter((mapping): mapping is OutlinePhaseMapping => mapping !== null)
      : buildPhaseMapping(rebalanced.sections);

  return renumberBookOutline({
    ...rebalanced,
    generationMeta,
    readerJourneyMapping,
  });
}

async function buildOutlinePromptPayload(params: {
  bookId: string;
  promise: PromiseBrief;
  bookPromiseReport: BookPromiseReport;
  bookSetupProfile?: BookSetupProfile | null;
  currentOutline?: BookOutline;
  userInput?: string;
  revisionComment?: string;
  revisionTargetId?: string;
  revisionTargetType?: "section" | "chapter";
  instruction?: string;
}) {
  const currentOutline =
    params.revisionComment || params.revisionTargetId ? params.currentOutline ?? null : null;

  // Fetch actual book content from Knowledge Base as primary source
  const { content: knowledgeBaseContent, sourceCount } = await getBookKnowledgeBase(params.bookId, 50000);

  return {
    bookContext: {
      workingTitle: truncateText(params.promise.workingTitle, 120),
      targetWordCount: params.bookSetupProfile?.targetWordCount ?? 45000,
      category: truncateText(params.promise.category, 120),
      audiencePrimary: truncateText(params.promise.audiencePrimary, 180),
      readerProblem: truncateText(params.promise.readerProblem, 420),
      readerDesire: truncateText(params.promise.readerDesire, 320),
      coreTruth: truncateText(params.promise.coreTruth, 320),
      transformationBefore: truncateText(params.promise.transformationBefore, 220),
      transformationAfter: truncateText(params.promise.transformationAfter, 220),
      // REMOVED: promiseStatement was being inadvertently copied into chapter descriptions by LLM.
      // Promise context is provided in the system prompt; don't duplicate it as a JSON field.
    },
    knowledgeBase: {
      content: knowledgeBaseContent,
      sourceCount,
      note:
        sourceCount > 0
          ? "The above is the actual book content from your Knowledge Base. Use this as the primary source for determining sections, chapters, and their descriptions."
          : "No Knowledge Base source documents exist for this book. Derive the sections, chapters, and their descriptions from the committed Promise data in bookContext (reader problem, desire, core truth, transformation arc).",
    },
    currentOutline: summarizeOutlineForPrompt(
      currentOutline,
      params.revisionTargetId,
      params.revisionTargetType,
    ),
    userInput: params.userInput ?? null,
    revisionComment: params.revisionComment ?? null,
    revisionTargetId: params.revisionTargetId ?? null,
    revisionTargetType: params.revisionTargetType ?? null,
    instruction:
      params.instruction ??
      "Generate the Phase 1 Outline artifact now: sections with big ideas, chapters with reader journey phases, internal chapter architecture, and verified book-to-section-to-chapter word counts. Do not generate paragraph plans yet.",
  };
}

async function getChatModel(options?: { maxOutputTokens?: number; timeoutMs?: number }) {
  return getModelForRole("outline:phase-1", {
    temperature: 0.2,
    maxOutputTokens: options?.maxOutputTokens ?? 15000,
    timeoutMs: options?.timeoutMs ?? 240000,
  });
}

async function maybeGenerateOutline(
  bookId: string,
  promise: PromiseBrief,
  bookPromiseReport: BookPromiseReport,
  bookSetupProfile?: BookSetupProfile | null,
  currentOutline?: BookOutline,
  userInput?: string,
  revisionComment?: string,
  revisionTargetId?: string,
  revisionTargetType?: "section" | "chapter",
) {
  const fallback = currentOutline ?? buildFallbackOutline(promise, bookPromiseReport, bookSetupProfile);
  const attemptGeneration = async (input: {
    systemPrompt: string;
    instruction: string;
    maxOutputTokens: number;
    timeoutMs: number;
    generationNote?: string;
  }) => {
    const model = await getChatModel({
      maxOutputTokens: input.maxOutputTokens,
      timeoutMs: input.timeoutMs,
    });

    if (!model) {
      throw new Error("Outline model is unavailable");
    }

    const promptPayload = await buildOutlinePromptPayload({
      bookId,
      promise,
      bookPromiseReport,
      bookSetupProfile,
      currentOutline,
      userInput,
      revisionComment,
      revisionTargetId,
      revisionTargetType,
      instruction: input.instruction,
    });

    // Resolve the source directive against whether this book actually has
    // Knowledge Base documents (see outlineSourceDirective).
    const systemPrompt = input.systemPrompt.replace(
      OUTLINE_SOURCE_DIRECTIVE_TOKEN,
      outlineSourceDirective(promptPayload.knowledgeBase.sourceCount > 0),
    );

    const rawResponse = await withTimeout(
      model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(promptPayload)),
      ]),
      input.timeoutMs,
      `Outline generation timed out after ${Math.round(input.timeoutMs / 1000)} seconds`,
    );

    const rawText = extractTextFromResponse(rawResponse).trim();
    if (!rawText) {
      throw new Error("Outline generation returned empty content");
    }

    const jsonText = extractJsonText(rawText);
    const normalized = normalizeOutline(
      JSON.parse(jsonText),
      fallback,
      bookSetupProfile?.targetWordCount ?? fallback.targetWordCount,
    );

    return {
      ...normalized,
      generationMeta: {
        source: "sonnet" as const,
        model: input.generationNote
          ? `claude-sonnet-4-6 (${input.generationNote})`
          : "claude-sonnet-4-6",
        generatedAt: new Date().toISOString(),
      },
    };
  };

  try {
    return await attemptGeneration({
      systemPrompt: OUTLINE_COMPACT_RETRY_SYSTEM_PROMPT,
      instruction:
        "Generate the actual Phase 1 outline only: sections, chapters, stage coverage, and exact section/chapter word-count math. Keep it concise. Do not generate paragraph plans or expanded editorial annotations.",
      maxOutputTokens: 3200,
      timeoutMs: 150000,
      generationNote: "compact primary",
    });
  } catch (error) {
    const firstFailureReason =
      error instanceof Error
        ? error.message
        : "The full outline request failed before completion.";

    try {
      return await attemptGeneration({
        systemPrompt: OUTLINE_FULL_SYSTEM_PROMPT,
        instruction:
          "Retry with richer detail only if possible. Keep the structure organic and the output tight, and still avoid paragraph plans.",
        maxOutputTokens: 4800,
        timeoutMs: 180000,
        generationNote: "full retry",
      });
    } catch (retryError) {
      const retryReason =
        retryError instanceof Error
          ? retryError.message
          : "The compact retry also failed.";
      console.warn("Outline generation fell back to the local outline scaffold.", error);
      console.warn("Compact outline retry also failed.", retryError);
      return {
        ...fallback,
        generationMeta: {
          source: "fallback",
          model: "claude-sonnet-4-6",
          reason: `${firstFailureReason} Compact retry: ${retryReason}`,
          generatedAt: new Date().toISOString(),
        },
      };
    }
  }
}

async function loadPromiseNode(state: OutlineWorkflowState) {
  const book = await getOrCreateBookBySlug(state.bookSlug);
  const committedPromiseVersion = await getCommittedPromiseBrief(book.id);
  const committedBookSetup = await getCommittedBookSetup(book.id);
  const promiseArtifacts = await getPromiseArtifacts(book.id);
  const committedPromise = parseJson<PromiseBrief | null>(committedPromiseVersion?.contentJson, null);
  const bookSetupProfile = normalizeBookSetupProfile(committedBookSetup?.contentJson);
  const bookPromiseReportArtifact = promiseArtifacts.find(
    (artifact) => artifact.artifactType === ArtifactType.BOOK_PROMISE_REPORT,
  );
  const bookPromiseReport = parseJson<BookPromiseReport | null>(
    bookPromiseReportArtifact?.versions[0]?.contentJson,
    null,
  );
  const sourcePromise =
    committedPromise ??
    (bookPromiseReport
      ? buildPromiseFromBookPitch(book.titleWorking ?? "Untitled Book", bookPromiseReport)
      : null);
  const fallback = buildFallbackOutline(
    sourcePromise ?? {
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
    bookPromiseReport,
    bookSetupProfile,
  );
  const latestOutlineVersion = (await getOutlineVersions(book.id, 1))[0];

  return {
    bookId: book.id,
    committedPromise: sourcePromise,
    bookPromiseReport,
    bookSetupProfile,
    currentOutline: latestOutlineVersion
      ? normalizeOutline(
          latestOutlineVersion.contentJson,
          fallback,
          bookSetupProfile?.targetWordCount ?? fallback.targetWordCount,
        )
      : undefined,
  };
}

async function generateOutlineNode(state: OutlineWorkflowState) {
  if (!state.committedPromise || !state.bookPromiseReport || !state.bookId) {
    return {};
  }

  return {
    outline: await maybeGenerateOutline(
      state.bookId,
      state.committedPromise,
      state.bookPromiseReport,
      state.bookSetupProfile,
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

  if (state.outline.generationMeta?.source === "fallback") {
    return {
      outlinePersisted: false,
    };
  }

  await createOutlineVersion({
    bookId: state.bookId,
    title: "Detailed Book Outline",
    summary: state.outline.structureRationale,
    contentJson: state.outline,
    contentText: JSON.stringify(state.outline, null, 2),
  });

  return {
    outlinePersisted: true,
  };
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
  await commitOutlineStageBundle(book.id, { finalizeStage: false });
  await clearStageStaleDependency(bookSlug, StageKey.OUTLINE);
  await invalidateDependentStagesForBook(bookSlug, StageKey.OUTLINE);
}

export async function finalizeOutlineWorkflow(bookSlug: string) {
  await Promise.all([
    enqueueAndTriggerFullExternalStoriesWorkflow(bookSlug, triggerWorkflowRunInBackground),
    enqueueAndTriggerBaseStoryWorkflow(bookSlug, triggerWorkflowRunInBackground),
  ]);
}

export async function getOutlineWorkspace(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const promiseStage = await getStageForBook(book.id, StageKey.PROMISE);
  const outlineStage = await getStageForBook(book.id, StageKey.OUTLINE);
  const committedPromiseVersion = await getCommittedPromiseBrief(book.id);
  const committedBookSetup = await getCommittedBookSetup(book.id);
  const promiseArtifacts = await getPromiseArtifacts(book.id);
  const committedOutlineVersion = await getCommittedOutline(book.id);
  const outlineVersions = await getOutlineVersions(book.id);

  const committedPromise = parseJson<PromiseBrief | null>(
    committedPromiseVersion?.contentJson,
    null,
  );
  const bookSetupProfile = normalizeBookSetupProfile(committedBookSetup?.contentJson);
  const bookPromiseReportArtifact = promiseArtifacts.find(
    (artifact) => artifact.artifactType === ArtifactType.BOOK_PROMISE_REPORT,
  );
  const bookPromiseReport = parseJson<BookPromiseReport | null>(
    bookPromiseReportArtifact?.versions[0]?.contentJson,
    null,
  );
  const sourcePromise =
    committedPromise ??
    (bookPromiseReport
      ? buildPromiseFromBookPitch(book.titleWorking ?? "Untitled Book", bookPromiseReport)
      : null);
  const fallback = buildFallbackOutline(
    sourcePromise ?? {
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
    bookPromiseReport,
    bookSetupProfile,
  );
  const latestOutline = outlineVersions[0]
    ? normalizeOutline(
        outlineVersions[0].contentJson,
        fallback,
        bookSetupProfile?.targetWordCount ?? fallback.targetWordCount,
      )
    : null;
  const committedOutline = committedOutlineVersion
    ? normalizeOutline(
        committedOutlineVersion.contentJson,
        fallback,
        bookSetupProfile?.targetWordCount ?? fallback.targetWordCount,
      )
    : null;

  return {
    book,
    promiseStage,
    outlineStage,
    committedPromise: sourcePromise,
    bookPromiseReport,
    bookSetupProfile,
    latestOutline,
    committedOutline,
    outlineVersions: outlineVersions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      lifecycleState: version.lifecycleState,
      createdAt: version.createdAt,
      outline: normalizeOutline(
        version.contentJson,
        fallback,
        bookSetupProfile?.targetWordCount ?? fallback.targetWordCount,
      ),
    })),
    outlineReadiness:
      sourcePromise && bookPromiseReport
        ? {
            status: "ready" as const,
            nextMoves: [
              "Generate the full section > chapter > paragraph architecture from the locked Book Pitch",
              "Stress-test the word-count cascade so the book target, section totals, chapter totals, and paragraph totals all match",
              "Revise any weak sections or chapters through comments until the flow feels inevitable",
              "Commit the outline once the structure, pacing, and transformation arc all hold together",
            ],
          }
        : {
          status: "blocked" as const,
          nextMoves: [
              "Lock the Book Pitch first",
              "Finalize the target audience, core truth, and transformation arc before outlining",
              "Confirm the book's target word count in Setup so the outline math has a real anchor",
            ],
          },
  };
}
