import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ArtifactType, StageKey, StageStatus } from "@prisma/client";
import { z } from "zod";

import { ParagraphOutlineSchema, parseArtifactWithSchema, parseMetadataRecord } from "../artifact-schemas";
import { getModelForRole } from "../llm/routing";
import type {
  PersonalStoryEncyclopedia,
  PersonalStoryEntry,
  PersonalStoryMessage,
} from "../personal-story-types";
import type { ParagraphOutline } from "../paragraph-outline-types";
import {
  getBookBySlugOrThrow,
  getStageForBook,
  updateStageForBook,
} from "../repositories/books";
import { getCommittedOutlineExpansion } from "../repositories/outline-artifacts";
import {
  commitPersonalStoriesStageBundle,
  createPersonalStoriesArtifactVersion,
  getCommittedPersonalStoryEncyclopedia,
  getPersonalStoryArtifactVersions,
  getPersonalStoriesArtifacts,
} from "../repositories/personal-stories-artifacts";
import { clearStageStaleDependency, invalidateDependentStagesForBook } from "../workflow-dependencies";

const InterviewReplySchema = z.object({
  reply: z.string(),
});

const EncyclopediaSchema = z.object({
  interviewFocus: z.string(),
  nextQuestion: z.string(),
  entries: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        lesson: z.string(),
        whyItMatters: z.string(),
        storyType: z.enum([
          "origin",
          "turning_point",
          "failure",
          "recovery",
          "leadership",
          "conflict",
          "identity",
          "moral",
          "micro_story",
          "observation",
        ]),
        lifeArea: z.string(),
        emotionalNotes: z.array(z.string()).default([]),
        chapterFitHints: z.array(z.string()).default([]),
        status: z.enum(["candidate", "strong", "needs_detail", "not_applicable"]),
        sourceQuote: z.string().nullable().optional(),
      }),
    )
    .default([]),
  noStoryTopics: z.array(z.string()).default([]),
  coverageGaps: z.array(z.string()).default([]),
  interviewerNotes: z.array(z.string()).default([]),
});

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

type ChapterBlueprint = {
  chapterKey: string;
  chapterLabel: string;
  chapterTitle: string;
  chapterDescription: string;
  sectionTitle: string;
};

function normalizeTranscript(value: unknown): PersonalStoryMessage[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is PersonalStoryMessage =>
          Boolean(
            item &&
              typeof item === "object" &&
              "role" in item &&
              "content" in item &&
              (item as { role?: unknown }).role &&
              typeof (item as { content?: unknown }).content === "string",
          ),
      )
    : [];
}

function hasUsableOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your-key-here");
}

async function getChatModel() {
  // Routed via provider layer: Sonnet for interview-based story generation
  return getModelForRole("personal-stories:interview", {
    temperature: 0.35,
    maxOutputTokens: 4000,
    timeoutMs: 20000,
  });
}

function getDefaultEncyclopedia(): PersonalStoryEncyclopedia {
  return {
    interviewFocus:
      "Build a wide-ranging encyclopedia of lived experiences, leadership moments, failures, recoveries, identity stories, and observations that can later support the book.",
    nextQuestion:
      "What is one experience from your life or work that changed how you lead, decide, or communicate?",
    entries: [],
    noStoryTopics: [],
    coverageGaps: [
      "origin story",
      "failure or setback",
      "turning point",
      "leadership under pressure",
      "identity or belief shift",
    ],
    interviewerNotes: [
      "Gather more stories than the book strictly needs.",
      "A short concrete memory is better than a polished speech.",
      "If there is no story for an area, record that clearly and move on.",
    ],
  };
}

function buildChapterBlueprints(outline: ParagraphOutline | null): ChapterBlueprint[] {
  return (
    outline?.sections.flatMap((section) =>
      section.chapters.map((chapter) => ({
        chapterKey: chapter.chapterId,
        chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`,
        chapterTitle: chapter.chapterTitle,
        chapterDescription: chapter.chapterDescription,
        sectionTitle: section.sectionTitle,
      })),
    ) ?? []
  );
}

async function getCommittedChapterBlueprints(bookId: string) {
  const committedOutlineVersion = await getCommittedOutlineExpansion(bookId);
  const outline = parseArtifactWithSchema(
    committedOutlineVersion?.contentJson,
    ParagraphOutlineSchema,
  );
  return buildChapterBlueprints(outline);
}

function inferInterviewFocus(chapters: ChapterBlueprint[]) {
  if (chapters.length === 0) {
    return getDefaultEncyclopedia().interviewFocus;
  }

  const preview = chapters
    .slice(0, 4)
    .map((chapter) => chapter.chapterLabel)
    .join(", ");

  return `Build a chapter-aware encyclopedia of lived experiences, leadership moments, failures, recoveries, identity stories, and observations that can support specific chapters in this book. Prioritize memories that could fit ${preview}${chapters.length > 4 ? ", and the rest of the outline" : ""}.`;
}

function inferNextQuestion(chapters: ChapterBlueprint[]) {
  const firstChapter = chapters[0];
  if (!firstChapter) {
    return getDefaultEncyclopedia().nextQuestion;
  }

  return `For ${firstChapter.chapterLabel}, what real experience from your life or work best illustrates the chapter's central tension or lesson?`;
}

function buildChapterCoverage(
  chapters: ChapterBlueprint[],
  encyclopedia: PersonalStoryEncyclopedia,
) {
  return chapters.map((chapter) => {
    const matchedEntries = encyclopedia.entries.filter((entry) =>
      entry.chapterFitHints.some((hint) =>
        hint.toLowerCase().includes(chapter.chapterTitle.toLowerCase()) ||
        hint.toLowerCase().includes(chapter.chapterLabel.toLowerCase()),
      ),
    );

    return {
      ...chapter,
      matchedStoryCount: matchedEntries.length,
      matchedStoryTitles: matchedEntries.slice(0, 3).map((entry) => entry.title),
    };
  });
}

function normalizeEncyclopedia(
  value: Partial<PersonalStoryEncyclopedia> | null | undefined,
): PersonalStoryEncyclopedia {
  const fallback = getDefaultEncyclopedia();
  return {
    interviewFocus: value?.interviewFocus ?? fallback.interviewFocus,
    nextQuestion: value?.nextQuestion ?? fallback.nextQuestion,
    entries: Array.isArray(value?.entries)
      ? value.entries.map((entry, index) => normalizeEntry(entry, index))
      : fallback.entries,
    noStoryTopics: Array.isArray(value?.noStoryTopics) ? value.noStoryTopics : fallback.noStoryTopics,
    coverageGaps: Array.isArray(value?.coverageGaps) ? value.coverageGaps : fallback.coverageGaps,
    interviewerNotes: Array.isArray(value?.interviewerNotes)
      ? value.interviewerNotes
      : fallback.interviewerNotes,
  };
}

function normalizeEntry(
  entry: Omit<PersonalStoryEntry, "emotionalNotes" | "chapterFitHints" | "sourceQuote"> & {
    emotionalNotes?: string[];
    chapterFitHints?: string[];
    sourceQuote?: string | null;
  },
  index: number,
): PersonalStoryEntry {
  return {
    ...entry,
    id: entry.id || `story-${index + 1}`,
    emotionalNotes: entry.emotionalNotes ?? [],
    chapterFitHints: entry.chapterFitHints ?? [],
    sourceQuote: entry.sourceQuote ?? null,
  };
}

function mergeEntries(
  existing: PersonalStoryEntry[],
  incoming: PersonalStoryEntry[],
): PersonalStoryEntry[] {
  const byId = new Map<string, PersonalStoryEntry>();
  const byTitle = new Map<string, string>();

  for (const entry of existing) {
    const normalized = normalizeEntry(entry, byId.size);
    byId.set(normalized.id, normalized);
    byTitle.set(normalized.title.trim().toLowerCase(), normalized.id);
  }

  for (const entry of incoming) {
    const normalized = normalizeEntry(entry, byId.size);
    const titleKey = normalized.title.trim().toLowerCase();
    const existingId = byId.has(normalized.id) ? normalized.id : byTitle.get(titleKey);
    const targetId = existingId ?? normalized.id;
    const prior = byId.get(targetId);

    byId.set(targetId, {
      ...normalized,
      id: targetId,
      emotionalNotes: Array.from(
        new Set([...(prior?.emotionalNotes ?? []), ...normalized.emotionalNotes]),
      ),
      chapterFitHints: Array.from(
        new Set([...(prior?.chapterFitHints ?? []), ...normalized.chapterFitHints]),
      ),
    });
    byTitle.set(titleKey, targetId);
  }

  return Array.from(byId.values());
}

function fallbackReply(
  userInput: string,
  encyclopedia: PersonalStoryEncyclopedia,
  transcript: PersonalStoryMessage[],
) {
  if (/no story|don't have|do not have|none comes to mind/i.test(userInput)) {
    return `That helps too. We can mark this area as a gap and move to a different angle instead of forcing a story. ${encyclopedia.nextQuestion}`;
  }

  const priorUserTurns = transcript.filter((message) => message.role === "user").length;
  const prompt =
    priorUserTurns <= 1
      ? "Stay concrete. Tell me what happened, who was involved, and what changed for you."
      : "Good. Now give me one more layer of detail: what tension, mistake, surprise, or realization made this memorable?";

  return `That sounds useful. I’m treating it as raw material for the story encyclopedia, not as a polished anecdote yet. ${prompt}`;
}

function fallbackEncyclopediaUpdate(
  prior: PersonalStoryEncyclopedia,
  userInput: string,
): PersonalStoryEncyclopedia {
  const trimmed = userInput.trim();
  if (!trimmed) {
    return prior;
  }

  const noStory = /no story|don't have|do not have|none comes to mind/i.test(trimmed);
  if (noStory) {
    return {
      ...prior,
      noStoryTopics: Array.from(new Set([...prior.noStoryTopics, prior.nextQuestion])),
      coverageGaps: Array.from(new Set([...prior.coverageGaps, "another concrete lived example"])),
      nextQuestion:
        "Tell me about a moment when you handled pressure, conflict, or uncertainty better or worse than expected.",
    };
  }

  const newEntry: PersonalStoryEntry = {
    id: `story-${prior.entries.length + 1}`,
    title:
      trimmed.split(/[.!?]/)[0]?.slice(0, 80).trim() || `Story ${prior.entries.length + 1}`,
    summary: trimmed,
    lesson: "Lesson still being clarified through the interview.",
    whyItMatters: "Potentially useful as a personal story, turning point, or credibility moment.",
    storyType: "observation",
    lifeArea: "work or life experience",
    emotionalNotes: [],
    chapterFitHints: [],
    status: "needs_detail",
    sourceQuote: null,
  };

  return {
    ...prior,
    entries: mergeEntries(prior.entries, [newEntry]),
    coverageGaps: prior.coverageGaps.filter(
      (gap) => gap !== "another concrete lived example",
    ),
    nextQuestion:
      "What was the emotional center of that moment: fear, conviction, embarrassment, relief, anger, grief, hope, or something else?",
  };
}

async function generateInterviewReply(
  title: string,
  transcript: PersonalStoryMessage[],
  encyclopedia: PersonalStoryEncyclopedia,
  userInput: string,
  chapterBlueprints: ChapterBlueprint[],
) {
  const model = await getChatModel();
  if (!model) {
    return fallbackReply(userInput, encyclopedia, transcript);
  }

  try {
    const structured = model.withStructuredOutput(InterviewReplySchema);
    const result = await structured.invoke([
      new SystemMessage(`
You are an interview partner helping an author build a personal stories encyclopedia for a nonfiction book.

Your job:
- conduct a warm, precise interview
- ask one strong next question at a time
- help the author surface concrete memories, tensions, decisions, failures, recoveries, and beliefs
- keep the chapter architecture in view so stories can later attach to the right chapter
- never force a story if the author does not have one
- treat "I don't have a story for this" as useful information

Rules:
- keep the reply concise
- acknowledge what is useful in the user's answer
- ask for the next best detail or the next best story
- do not sound therapeutic or generic
- do not turn the conversation into a lecture
      `),
      new HumanMessage(
        JSON.stringify({
          bookTitle: title,
          latestUserInput: userInput,
          transcript,
          encyclopedia,
          chapterBlueprints,
        }),
      ),
    ]);

    return result.reply;
  } catch {
    return fallbackReply(userInput, encyclopedia, transcript);
  }
}

async function generateEncyclopediaUpdate(
  title: string,
  transcript: PersonalStoryMessage[],
  prior: PersonalStoryEncyclopedia,
  chapterBlueprints: ChapterBlueprint[],
) {
  const model = await getChatModel();
  if (!model) {
    return fallbackEncyclopediaUpdate(
      prior,
      transcript[transcript.length - 1]?.role === "user"
        ? transcript[transcript.length - 1].content
        : "",
    );
  }

  try {
    const structured = model.withStructuredOutput(EncyclopediaSchema);
    const result = await structured.invoke([
      new SystemMessage(`
Update the personal stories encyclopedia for a nonfiction book interview.

Rules:
- capture story candidates even if they are incomplete
- create abundance, not scarcity
- preserve uncertainty when details are thin
- if the author says there is no story, record that in noStoryTopics
- keep coverage gaps honest
- propose one sharp next question that deepens or broadens the interview
- use chapterFitHints to point stories toward actual chapter titles or labels when possible
- do not invent facts that were not implied by the transcript

STATUS is not a formality — it is the gate that decides whether a story is
ever actually usable in a chapter draft. Every entry stuck at "needs_detail"
is silently excluded from every chapter, permanently, no matter how good the
story is. Assign it deliberately:
- "strong": the author told a complete story with a real arc (setup,
  turn, resolution or insight) and concrete, specific detail (a place, a
  person, a moment, an image). If your own reply to the author says
  something like "that's on record" or "that's one of the strongest
  you've given me," the entry MUST be "strong" or "candidate" — do not
  tell the author a story is captured and then leave it at needs_detail.
- "candidate": a real, usable story exists but is missing one dimension
  (e.g. no clear resolution yet, or thin on sensory detail) — still
  usable in a chapter, just not polished.
- "needs_detail": genuinely just a fragment, a topic mentioned in
  passing, or an answer that trailed off before becoming a story.
- "not_applicable": the author explicitly said there's no story here.
When the author signals the interview is ending ("let's stop here", "that's
enough", "I'm done for now"), do not create a new entry from that message —
it is a wrap-up instruction, not story material.
      `),
      new HumanMessage(
        JSON.stringify({
          bookTitle: title,
          priorEncyclopedia: prior,
          transcript,
          chapterBlueprints,
        }),
      ),
    ]);

    return {
      ...result,
      entries: mergeEntries(
        prior.entries,
        (result.entries ?? []).map((entry, index) => normalizeEntry(entry, index)),
      ),
      noStoryTopics: Array.from(
        new Set([...(prior.noStoryTopics ?? []), ...(result.noStoryTopics ?? [])]),
      ),
      coverageGaps: Array.from(new Set(result.coverageGaps ?? [])),
      interviewerNotes: Array.from(
        new Set([...(prior.interviewerNotes ?? []), ...(result.interviewerNotes ?? [])]),
      ),
    } satisfies PersonalStoryEncyclopedia;
  } catch {
    return fallbackEncyclopediaUpdate(
      prior,
      transcript[transcript.length - 1]?.role === "user"
        ? transcript[transcript.length - 1].content
        : "",
    );
  }
}

export async function submitPersonalStoriesMessage(bookSlug: string, userInput: string) {
  const trimmed = userInput.trim();
  if (!trimmed) {
    return getPersonalStoriesWorkspace(bookSlug);
  }

  const book = await getBookBySlugOrThrow(bookSlug);
  const chapterBlueprints = await getCommittedChapterBlueprints(book.id);
  if (chapterBlueprints.length === 0) {
    throw new Error(
      "Commit the paragraph-level Outline before building Personal Stories. The interview needs real chapter targets.",
    );
  }
  const stage = await getStageForBook(book.id, StageKey.PERSONAL_STORIES);
  const artifacts = await getPersonalStoriesArtifacts(book.id);

  const chatArtifact = artifacts.find(
    (artifact) => artifact.artifactType === ArtifactType.PERSONAL_STORY_CHAT,
  );
  const encyclopediaArtifact = artifacts.find(
    (artifact) => artifact.artifactType === ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
  );

  const priorTranscript = normalizeTranscript(chatArtifact?.versions[0]?.contentJson);
  const priorEncyclopedia = parseJson<PersonalStoryEncyclopedia>(
    encyclopediaArtifact?.versions[0]?.contentJson,
    getDefaultEncyclopedia(),
  );
  const normalizedPriorEncyclopedia = normalizeEncyclopedia(priorEncyclopedia);

  const transcriptWithUser = [...priorTranscript, { role: "user", content: trimmed } as const];
  const updatedEncyclopedia = await generateEncyclopediaUpdate(
    book.titleWorking ?? "Untitled Book",
    transcriptWithUser,
    normalizedPriorEncyclopedia,
    chapterBlueprints,
  );
  const assistantReply = await generateInterviewReply(
    book.titleWorking ?? "Untitled Book",
    transcriptWithUser,
    updatedEncyclopedia,
    trimmed,
    chapterBlueprints,
  );
  const finalTranscript = [
    ...transcriptWithUser,
    { role: "assistant", content: assistantReply } as const,
  ];

  await createPersonalStoriesArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PERSONAL_STORY_CHAT,
    title: "Personal Stories Interview",
    summary: assistantReply,
    contentJson: finalTranscript,
    contentText: finalTranscript
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n\n"),
    modelName: hasUsableOpenAIKey()
      ? process.env.OPENAI_PERSONAL_STORIES_MODEL ?? "gpt-5.4"
      : "local-fallback",
    promptTemplateVersion: "personal-stories-chat-v1",
  });

  await createPersonalStoriesArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
    title: "Personal Story Encyclopedia",
    summary: `${updatedEncyclopedia.entries.length} story candidates captured`,
    contentJson: updatedEncyclopedia,
    contentText: JSON.stringify(updatedEncyclopedia, null, 2),
    modelName: hasUsableOpenAIKey()
      ? process.env.OPENAI_PERSONAL_STORIES_MODEL ?? "gpt-5.4"
      : "local-fallback",
    promptTemplateVersion: "personal-stories-encyclopedia-v1",
  });

  await updateStageForBook(book.id, StageKey.PERSONAL_STORIES, {
    status: StageStatus.IN_PROGRESS,
    metadataJson: {
      interviewStatus: "active",
      storyCount: updatedEncyclopedia.entries.length,
      noStoryTopicCount: updatedEncyclopedia.noStoryTopics.length,
      nextQuestion: updatedEncyclopedia.nextQuestion,
      updatedAt: new Date().toISOString(),
    },
  });

  return {
    transcript: finalTranscript,
    encyclopedia: updatedEncyclopedia,
    stage,
  };
}

export async function seedPersonalStoriesInterview(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const chapterBlueprints = await getCommittedChapterBlueprints(book.id);
  if (chapterBlueprints.length === 0) {
    throw new Error(
      "Commit the paragraph-level Outline before starting Personal Stories. The interview needs real chapter targets.",
    );
  }
  const artifacts = await getPersonalStoriesArtifacts(book.id);
  if (artifacts.length > 0) {
    return getPersonalStoriesWorkspace(bookSlug);
  }

  const encyclopedia = {
    ...getDefaultEncyclopedia(),
    interviewFocus: inferInterviewFocus(chapterBlueprints),
    nextQuestion: inferNextQuestion(chapterBlueprints),
    coverageGaps: chapterBlueprints.map((chapter) => chapter.chapterLabel),
  };
  const transcript: PersonalStoryMessage[] = [
    {
      role: "assistant",
      content:
        `We’re going to build a chapter-aware personal story encyclopedia for this book, not force polished anecdotes too early. Start with one moment from your life or work that best fits ${chapterBlueprints[0]?.chapterLabel ?? "the opening chapter"} and changed how you lead, decide, communicate, or see people.`,
    },
  ];

  await createPersonalStoriesArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PERSONAL_STORY_CHAT,
    title: "Personal Stories Interview",
    summary: transcript[0].content,
    contentJson: transcript,
    contentText: transcript[0].content,
    promptTemplateVersion: "personal-stories-chat-v1",
    modelName: "seed",
  });

  await createPersonalStoriesArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
    title: "Personal Story Encyclopedia",
    summary: "Interview initialized",
    contentJson: encyclopedia,
    contentText: JSON.stringify(encyclopedia, null, 2),
    promptTemplateVersion: "personal-stories-encyclopedia-v1",
    modelName: "seed",
  });

  await updateStageForBook(book.id, StageKey.PERSONAL_STORIES, {
    status: StageStatus.IN_PROGRESS,
    metadataJson: {
      interviewStatus: "active",
      storyCount: 0,
      noStoryTopicCount: 0,
      nextQuestion: encyclopedia.nextQuestion,
      updatedAt: new Date().toISOString(),
    },
  });

  return getPersonalStoriesWorkspace(bookSlug);
}

/**
 * Re-run the encyclopedia distillation over an EXISTING interview transcript
 * without appending a new message — for books whose interview happened
 * under the pre-fix prompt (see the encyclopedia-update system prompt above)
 * and got every entry stuck at "needs_detail" despite the author having
 * told complete, usable stories. Re-derives status/summary/etc. for the
 * same transcript under the corrected prompt and commits the result so
 * Chapter Draft picks it up immediately.
 */
export async function reprocessPersonalStoriesEncyclopediaWorkflow(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const chapterBlueprints = await getCommittedChapterBlueprints(book.id);
  if (chapterBlueprints.length === 0) {
    throw new Error("Commit the paragraph-level Outline before reprocessing Personal Stories.");
  }

  const artifacts = await getPersonalStoriesArtifacts(book.id);
  const chatArtifact = artifacts.find(
    (artifact) => artifact.artifactType === ArtifactType.PERSONAL_STORY_CHAT,
  );
  const encyclopediaArtifact = artifacts.find(
    (artifact) => artifact.artifactType === ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
  );

  const transcript = normalizeTranscript(chatArtifact?.versions[0]?.contentJson);
  if (transcript.length === 0) {
    throw new Error("No interview transcript exists yet for this book.");
  }
  const priorEncyclopedia = normalizeEncyclopedia(
    parseJson<Partial<PersonalStoryEncyclopedia> | null>(
      encyclopediaArtifact?.versions[0]?.contentJson,
      null,
    ),
  );

  const reprocessed = await generateEncyclopediaUpdate(
    book.titleWorking ?? "Untitled Book",
    transcript,
    priorEncyclopedia,
    chapterBlueprints,
  );

  await createPersonalStoriesArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
    title: "Personal Story Encyclopedia",
    summary: `${reprocessed.entries.length} story candidates captured (reprocessed)`,
    contentJson: reprocessed,
    contentText: JSON.stringify(reprocessed, null, 2),
    modelName: hasUsableOpenAIKey()
      ? process.env.OPENAI_PERSONAL_STORIES_MODEL ?? "gpt-5.4"
      : "local-fallback",
    promptTemplateVersion: "personal-stories-encyclopedia-v2-reprocess",
  });

  const result = await commitPersonalStoriesWorkflow(bookSlug);

  const before = priorEncyclopedia.entries.filter(
    (e) => e.status === "candidate" || e.status === "strong",
  ).length;
  const after = reprocessed.entries.filter(
    (e) => e.status === "candidate" || e.status === "strong",
  ).length;

  return { encyclopedia: reprocessed, usableBefore: before, usableAfter: after, commitResult: result };
}

export async function commitPersonalStoriesWorkflow(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const chapterBlueprints = await getCommittedChapterBlueprints(book.id);
  if (chapterBlueprints.length === 0) {
    throw new Error("Commit the paragraph-level Outline before committing Personal Stories.");
  }
  const encyclopediaVersions = await getPersonalStoryArtifactVersions(
    book.id,
    ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
    1,
  );
  const latestEncyclopedia = normalizeEncyclopedia(
    parseJson<Partial<PersonalStoryEncyclopedia> | null>(encyclopediaVersions[0]?.contentJson, null),
  );
  if (latestEncyclopedia.entries.length === 0) {
    throw new Error("Capture at least one personal story before committing the encyclopedia.");
  }
  const result = await commitPersonalStoriesStageBundle(book.id);
  await clearStageStaleDependency(bookSlug, StageKey.PERSONAL_STORIES);
  await invalidateDependentStagesForBook(bookSlug, StageKey.PERSONAL_STORIES);
  return result;
}

export async function getPersonalStoriesWorkspace(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const chapterBlueprints = await getCommittedChapterBlueprints(book.id);
  const stage = await getStageForBook(book.id, StageKey.PERSONAL_STORIES);
  const artifacts = await getPersonalStoriesArtifacts(book.id);
  const chatVersions = await getPersonalStoryArtifactVersions(
    book.id,
    ArtifactType.PERSONAL_STORY_CHAT,
  );
  const encyclopediaVersions = await getPersonalStoryArtifactVersions(
    book.id,
    ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
  );
  const committedEncyclopediaVersion = await getCommittedPersonalStoryEncyclopedia(book.id);

  const latestTranscript = normalizeTranscript(chatVersions[0]?.contentJson);
  const latestEncyclopedia = parseJson<PersonalStoryEncyclopedia>(
    encyclopediaVersions[0]?.contentJson,
    getDefaultEncyclopedia(),
  );
  const committedEncyclopedia = parseJson<PersonalStoryEncyclopedia | null>(
    committedEncyclopediaVersion?.contentJson,
    null,
  );
  const normalizedLatestEncyclopedia = normalizeEncyclopedia(latestEncyclopedia);
  const normalizedCommittedEncyclopedia = committedEncyclopedia
    ? normalizeEncyclopedia(committedEncyclopedia)
    : null;
  const metadata = parseMetadataRecord(stage?.metadataJson);
  const chapterCoverage = buildChapterCoverage(chapterBlueprints, normalizedLatestEncyclopedia);

  return {
    book,
    stage,
    artifacts,
    transcript: latestTranscript,
    encyclopedia: normalizedLatestEncyclopedia,
    committedEncyclopedia: normalizedCommittedEncyclopedia,
    versions: {
      chat: chatVersions,
      encyclopedia: encyclopediaVersions,
    },
    outlineReady: chapterBlueprints.length > 0,
    chapterBlueprints,
    chapterCoverage,
    progress: {
      interviewStatus:
        typeof metadata.interviewStatus === "string" ? metadata.interviewStatus : "idle",
      storyCount:
        typeof metadata.storyCount === "number"
          ? metadata.storyCount
          : normalizedLatestEncyclopedia.entries.length,
      noStoryTopicCount:
        typeof metadata.noStoryTopicCount === "number"
          ? metadata.noStoryTopicCount
          : normalizedLatestEncyclopedia.noStoryTopics.length,
      nextQuestion:
        typeof metadata.nextQuestion === "string"
          ? metadata.nextQuestion
          : normalizedLatestEncyclopedia.nextQuestion,
    },
  };
}
