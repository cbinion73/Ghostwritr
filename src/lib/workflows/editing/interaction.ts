import { ArtifactType, StageKey } from "@prisma/client";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import type {
  EditingMessage,
  SuggestedEditorialRevisionTarget,
} from "../../editing-types";
import { getModelForRole } from "../../llm/routing";
import {
  getBookBySlugOrThrow,
  getStageForBook,
  updateStageForBook,
} from "../../repositories/books";
import {
  getLatestEditingArtifactVersion,
} from "../../repositories/editing-artifacts";
import {
  buildConversationSuggestedRevisionTarget,
  buildSuggestedRevisionTarget,
} from "./revision-support";
import { getEditingWorkspace } from "./workspace";
import { ManuscriptAssemblySchema } from "./workspace-schemas";
import {
  getEditorialPreferenceProfile,
  parseEditingMessages,
  parseJson,
} from "./workspace-support";

const EditingConversationReplySchema = z.object({
  reply: z.string(),
  wholeBookAssessment: z.string(),
  focusChapterKey: z.string().nullable().optional(),
  nextActions: z.array(z.string()).default([]),
  suggestedRevision: z
    .object({
      mode: z.enum([
        "structural-edit",
        "clarity-pass",
        "pacing-pass",
        "continuity-pass",
        "voice-consistency-pass",
        "line-edit",
      ]),
      chapterKey: z.string().nullable().optional(),
      selectedChapterKeys: z.array(z.string()).default([]),
      brief: z.string(),
      preserveNotes: z.array(z.string()).default([]),
    })
    .nullable()
    .optional(),
});

/**
 * Editing conversation is analytical/dialogue work over the manuscript. Keep it
 * on final-editor:assess instead of the Opus polish route, which is reserved
 * for actual prose revision.
 */
async function getEditorAssessModel() {
  return getModelForRole("final-editor:assess", {
    temperature: 0.2,
    timeoutMs: 120000,
  });
}

export async function sendEditingMessageWorkflow(
  bookSlug: string,
  userInput: string,
  chapterKey?: string | null,
) {
  const trimmed = userInput.trim();
  if (!trimmed) {
    return getEditingWorkspace(bookSlug);
  }

  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const manuscriptVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MANUSCRIPT_ASSEMBLY,
  );
  const manuscript = manuscriptVersion?.contentJson
    ? ManuscriptAssemblySchema.safeParse(manuscriptVersion.contentJson).data ?? null
    : null;

  if (!manuscript) {
    throw new Error("Assemble the manuscript before starting the editor-agent conversation.");
  }

  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const preferences = getEditorialPreferenceProfile(metadata);
  const transcript = parseEditingMessages(metadata.editorConversation);
  const nextTranscript: EditingMessage[] = [
    ...transcript,
    {
      role: "user",
      content: trimmed,
      chapterKey: chapterKey ?? null,
      createdAt: new Date().toISOString(),
    },
  ];

  let reply = "I reviewed your note and I’m ready to guide the next full-book revision pass.";
  let wholeBookAssessment = manuscript.editorialOverview;
  let focusChapterKey = chapterKey ?? null;
  let nextActions = manuscript.outstandingConcerns.slice(0, 4);
  let suggestedRevisionTarget: SuggestedEditorialRevisionTarget | null =
    buildConversationSuggestedRevisionTarget({
      manuscript,
      chapterKey,
      userInput: trimmed,
    });

  const model = await getEditorAssessModel();
  if (model) {
    try {
      const structured = model.withStructuredOutput(EditingConversationReplySchema);
      const result = await structured.invoke([
        new SystemMessage(`
You are the editor agent for a ghostwriting platform.

Your job:
- read the full manuscript as one coherent book
- respond conversationally to the author's revision requests
- think at both full-book level and chapter-by-chapter level
- keep advice actionable, concise, and editorial
- prioritize structure, clarity, repetition, pacing, continuity, credibility, and voice consistency
- when appropriate, propose one concrete revision target that can be executed next
        `),
        new HumanMessage(
          JSON.stringify({
            bookTitle: book.titleWorking ?? "Untitled Book",
            chapterFocus: chapterKey ?? null,
            preferences,
            latestUserInput: trimmed,
            transcript: nextTranscript.slice(-12),
            manuscript: {
              title: manuscript.title,
              chapterCount: manuscript.chapterCount,
              totalWords: manuscript.totalWords,
              editorialOverview: manuscript.editorialOverview,
              outstandingConcerns: manuscript.outstandingConcerns,
              chapters: manuscript.chapters.map((chapter) => ({
                chapterKey: chapter.chapterKey,
                chapterLabel: chapter.chapterLabel,
                reviewSummary: chapter.reviewSummary,
                excerpt: chapter.chapterText.slice(0, 2000),
              })),
            },
          }),
        ),
      ]);

      reply = result.reply;
      wholeBookAssessment = result.wholeBookAssessment;
      focusChapterKey = result.focusChapterKey ?? focusChapterKey;
      nextActions = result.nextActions ?? [];
      suggestedRevisionTarget = result.suggestedRevision
        ? buildSuggestedRevisionTarget(result.suggestedRevision)
        : suggestedRevisionTarget;
    } catch {
      // Keep deterministic fallback reply below.
    }
  }

  const finalTranscript: EditingMessage[] = [
    ...nextTranscript,
    {
      role: "assistant",
      content: reply,
      chapterKey: focusChapterKey,
      createdAt: new Date().toISOString(),
    },
  ];

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...metadata,
      editorConversation: finalTranscript.slice(-20),
      wholeBookAssessment,
      suggestedNextActions: nextActions,
      focusChapterKey,
      suggestedRevisionTarget,
      updatedAt: new Date().toISOString(),
    },
  });

  return getEditingWorkspace(bookSlug);
}

export async function updateEditorialPreferencesWorkflow(
  bookSlug: string,
  input: {
    styleNotes: string;
    preserveVoice: boolean;
    preferTighterProse: boolean;
    preferBolderCuts: boolean;
  },
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const current = getEditorialPreferenceProfile(metadata);

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...metadata,
      editorialPreferences: {
        ...current,
        updatedAt: new Date().toISOString(),
        styleNotes: input.styleNotes.trim(),
        preserveVoice: input.preserveVoice,
        preferTighterProse: input.preferTighterProse,
        preferBolderCuts: input.preferBolderCuts,
      },
      updatedAt: new Date().toISOString(),
    },
  });

  return getEditingWorkspace(bookSlug);
}
