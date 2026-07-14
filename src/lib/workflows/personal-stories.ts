import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ArtifactType, StageKey, StageStatus } from "@prisma/client";

import { parseMetadataRecord } from "../artifact-schemas";
import { getModelForRole, resolveModelSpec } from "../llm/routing";
import type {
  PersonalStoryEncyclopedia,
  PersonalStoryEntry,
  PersonalStoryMessage,
} from "../personal-story-types";
import {
  getBookBySlugOrThrow,
  getStageForBook,
  updateStageForBook,
} from "../repositories/books";
import {
  createPersonalStoriesArtifactVersion,
  getPersonalStoryArtifactVersions,
  getPersonalStoriesArtifacts,
} from "../repositories/personal-stories-artifacts";
import { EncyclopediaSchema, InterviewReplySchema } from "./personal-stories/schemas";
import {
  getCommittedChapterBlueprints,
  getDefaultEncyclopedia,
  inferInterviewFocus,
  inferNextQuestion,
  mergeEntries,
  normalizeEncyclopedia,
  normalizeEntry,
  normalizeTranscript,
  parseJson,
  type ChapterBlueprint,
} from "./personal-stories/support";
import { commitPersonalStoriesWorkflow } from "./personal-stories/commit";
import { getPersonalStoriesWorkspace } from "./personal-stories/workspace";
export { commitPersonalStoriesWorkflow, getPersonalStoriesWorkspace };

async function getChatModel() {
  // Routed via provider layer: Sonnet for interview-based story generation
  //
  // timeoutMs was 20000 (20s) — far too short for the encyclopedia-update
  // call, which re-sends the full growing transcript (this session's cost
  // audit found this role averaging ~147K input tokens/call) through
  // structured output. Found 2026-07-07: a real 8-message interview timed
  // out on effectively every turn and silently fell back to
  // fallbackEncyclopediaUpdate, which hardcodes status "needs_detail" and
  // pastes the raw user message into title/summary — meaning the author's
  // real, complete stories were never actually processed by the model at
  // all, they were just echoed back as unprocessed fragments every time.
  return getModelForRole("personal-stories:interview", {
    temperature: 0.35,
    maxOutputTokens: 4000,
    timeoutMs: 90000,
  });
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
    modelName: resolveModelSpec("personal-stories:interview"),
    promptTemplateVersion: "personal-stories-chat-v1",
  });

  await createPersonalStoriesArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
    title: "Personal Story Encyclopedia",
    summary: `${updatedEncyclopedia.entries.length} story candidates captured`,
    contentJson: updatedEncyclopedia,
    contentText: JSON.stringify(updatedEncyclopedia, null, 2),
    modelName: resolveModelSpec("personal-stories:interview"),
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
    modelName: resolveModelSpec("personal-stories:interview"),
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
