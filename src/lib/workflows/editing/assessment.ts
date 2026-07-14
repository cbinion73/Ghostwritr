import { ArtifactType, StageKey } from "@prisma/client";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import type { EditorialAssessment, EditorialMode } from "../../editing-types";
import { getModelForRole } from "../../llm/routing";
import { getBookBySlugOrThrow, getStageForBook, updateStageForBook } from "../../repositories/books";
import {
  createEditingArtifactVersion,
  getEditingArtifactVersions,
  getLatestEditingArtifactVersion,
} from "../../repositories/editing-artifacts";
import {
  buildBookWideEditorialFindings,
  buildEditorialPromptChapterContext,
  buildSourceDraftSignature,
  modeLabel,
  normalizeBookWideEditorialFindings,
} from "./revision-support";
import { buildDraftQualityRollup, getEditorialPreferenceProfile, parseJson, parseJsonWithSchema } from "./workspace-support";
import { EditorialAssessmentSchema, ManuscriptAssemblySchema } from "./workspace-schemas";

const EditorialAssessmentReplySchema = z.object({
  assessmentSummary: z.string(),
  bookWideFindings: z
    .object({
      duplication: z.array(z.string()).default([]),
      continuity: z.array(z.string()).default([]),
      structure: z.array(z.string()).default([]),
      voice: z.array(z.string()).default([]),
      aiArtifacts: z.array(z.string()).default([]),
      terminology: z.array(z.string()).default([]),
      citations: z.array(z.string()).default([]),
      preservation: z.array(z.string()).default([]),
      chapterInstructions: z.array(z.string()).default([]),
    })
    .optional(),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  // Every sibling array field here defaults to [] -- chapterNotes was the
  // one exception, so a whole-book assessment (no chapterKey focus) that
  // reasonably omitted per-chapter notes failed Zod validation entirely,
  // discarding an otherwise good, expensive LLM response and silently
  // falling back to the generic deterministic assessment.
  chapterNotes: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      observation: z.string(),
      priority: z.enum(["high", "medium", "low"]),
    }),
  ).default([]),
  nextActions: z.array(z.string()).default([]),
});

async function getEditorAssessModel() {
  // Let the routing table's per-role ceiling for final-editor:assess apply.
  return getModelForRole("final-editor:assess", {
    temperature: 0.2,
    timeoutMs: 120000,
  });
}

export async function generateEditorialAssessmentWorkflow(
  bookSlug: string,
  mode: EditorialMode,
  chapterKey?: string | null,
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const manuscriptVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MANUSCRIPT_ASSEMBLY,
  );
  const manuscript = parseJsonWithSchema(manuscriptVersion?.contentJson, ManuscriptAssemblySchema);
  if (!manuscript) {
    throw new Error("Assemble the manuscript before generating an editorial assessment.");
  }

  const focusChapters = chapterKey
    ? manuscript.chapters.filter((chapter) => chapter.chapterKey === chapterKey)
    : manuscript.chapters;
  if (focusChapters.length === 0) {
    throw new Error("The selected chapter could not be found in the assembled manuscript.");
  }
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const stageMetadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const preferences = getEditorialPreferenceProfile(stageMetadata);
  const draftQualityRollup = buildDraftQualityRollup(manuscript.chapters);
  const bookWideFindings = buildBookWideEditorialFindings(focusChapters);

  // Skip the expensive full-manuscript assess call when nothing changed
  // since the last assessment for this same mode/chapter scope.
  const currentDraftSignature = buildSourceDraftSignature(focusChapters);
  const priorAssessmentVersions = await getEditingArtifactVersions(
    book.id,
    ArtifactType.EDITORIAL_ASSESSMENT,
    1,
  );
  const priorAssessment = parseJsonWithSchema(
    priorAssessmentVersions[0]?.contentJson,
    EditorialAssessmentSchema,
  );
  if (
    priorAssessment &&
    priorAssessment.sourceDraftSignature &&
    priorAssessment.sourceDraftSignature === currentDraftSignature &&
    priorAssessment.mode === mode &&
    (priorAssessment.chapterKey ?? null) === (chapterKey ?? null)
  ) {
    return priorAssessment;
  }

  let assessment: EditorialAssessment = {
    assessedAt: new Date().toISOString(),
    mode,
    chapterKey: chapterKey ?? null,
    assessmentSummary: `A ${modeLabel(mode)} is ready for ${chapterKey ? "the selected chapter" : "the full manuscript"}.`,
    bookWideFindings,
    strengths: [
      "The manuscript has enough assembled prose to support a real editorial assessment.",
      "This pass analyzes the manuscript without rewriting chapter prose.",
    ],
    risks: focusChapters
      .filter((chapter) => !chapter.reviewSummary)
      .slice(0, 4)
      .map((chapter) => `${chapter.chapterLabel} still lacks a chapter-level editorial review note.`),
    chapterNotes: focusChapters.slice(0, 4).map((chapter) => ({
      chapterKey: chapter.chapterKey,
      chapterLabel: chapter.chapterLabel,
      observation: chapter.reviewSummary ?? "This chapter needs a fresh editorial read in the requested mode.",
      priority: chapter.reviewSummary ? "medium" : "high",
    })),
    nextActions: [
      `Generate a ${modeLabel(mode)} revision${chapterKey ? " for this chapter" : ""}.`,
      "Apply the accepted revision back into the manuscript assembly before committing Editing.",
    ],
    sourceDraftSignature: currentDraftSignature,
  };

  const model = await getEditorAssessModel();
  if (model) {
    try {
      const structured = model.withStructuredOutput(EditorialAssessmentReplySchema);
      const result = await structured.invoke([
        new SystemMessage(`
You are the editor agent for a ghostwriting platform.

Produce a concise but serious editorial assessment in the requested mode.
- Evaluate the manuscript as a coherent book.
- If chapterKey is provided, focus on that chapter while still respecting book-level context.
- Prioritize actionable assessment over praise.
- Do not rewrite prose in this pass.
- Return bookWideFindings for duplication, continuity, structure, voice, aiArtifacts, terminology, citations, preservation, and chapterInstructions.
- Use the recorded draft-quality weak signals as real evidence, not as optional metadata.
- Return only the requested structured fields.
        `),
        new HumanMessage(
          JSON.stringify({
            workflowType: book.workflowType,
            bookTitle: manuscript.title,
            mode,
            chapterKey: chapterKey ?? null,
            preferences,
            editorialOverview: manuscript.editorialOverview,
            outstandingConcerns: manuscript.outstandingConcerns,
            draftQualityRollup,
            bookWideFindings,
            chapters: focusChapters.map((chapter) => ({
              ...buildEditorialPromptChapterContext(chapter),
              chapterText: chapter.chapterText.slice(0, 8000),
            })),
          }),
        ),
      ]);

      assessment = {
        assessedAt: new Date().toISOString(),
        mode,
        chapterKey: chapterKey ?? null,
        assessmentSummary: result.assessmentSummary,
        bookWideFindings: normalizeBookWideEditorialFindings(
          result.bookWideFindings,
          bookWideFindings,
        ),
        strengths: result.strengths ?? [],
        risks: result.risks ?? [],
        chapterNotes: result.chapterNotes ?? [],
        nextActions: result.nextActions ?? [],
        sourceDraftSignature: currentDraftSignature,
      };
    } catch (err) {
      console.error(`[editing] generateEditorialAssessmentWorkflow failed for ${bookSlug}, using deterministic fallback assessment:`, err);
      // Keep deterministic fallback assessment.
    }
  }

  await createEditingArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.EDITORIAL_ASSESSMENT,
    title: "Editorial Assessment",
    summary: `${chapterKey ? "Chapter-focused" : "Whole-book"} ${modeLabel(mode)} generated.`,
    contentJson: assessment,
    contentText: JSON.stringify(assessment, null, 2),
    promptTemplateVersion: "editing-assessment-v1",
    modelName: model ? "final-editor:assess" : "deterministic-fallback",
  });

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...stageMetadata,
      wholeBookAssessment: assessment.assessmentSummary,
      suggestedNextActions: assessment.nextActions,
      focusChapterKey: chapterKey ?? null,
      updatedAt: new Date().toISOString(),
    },
  });

  return assessment;
}
