import { ArtifactType } from "@prisma/client";

import type {
  EditingChapterSnapshot,
  ManuscriptAssembly,
} from "../../editing-types";
import {
  getBookBySlugOrThrow,
} from "../../repositories/books";
import {
  createEditingArtifactVersion,
} from "../../repositories/editing-artifacts";
import {
  loadEditingChapters,
} from "./chapter-loader";
import {
  buildSourceDraftSignature,
} from "./revision-support";

function buildEditorialOverview(chapters: EditingChapterSnapshot[]) {
  const reviewed = chapters.filter((chapter) => chapter.reviewSummary);
  const qualityAware = chapters.filter((chapter) => chapter.quality);
  if (reviewed.length === 0) {
    if (qualityAware.length > 0) {
      const averageScore = Math.round(
        qualityAware.reduce((sum, chapter) => sum + (chapter.quality?.score ?? 0), 0) / qualityAware.length,
      );
      return `The manuscript is assembled and draft quality signals average ${averageScore}/100, but no chapter-level editorial reviews exist yet.`;
    }

    return "The manuscript is assembled, but no chapter-level editorial reviews exist yet.";
  }

  return `The manuscript is assembled from ${chapters.length} drafted chapters. ${reviewed.length} chapters already have editorial review notes that can guide the next whole-book revision pass.`;
}

function buildOutstandingConcerns(chapters: EditingChapterSnapshot[]) {
  const concerns = chapters
    .filter((chapter) => !chapter.reviewSummary)
    .slice(0, 4)
    .map((chapter) => `${chapter.chapterLabel} still lacks chapter-level editorial review notes.`);

  for (const chapter of chapters) {
    if (chapter.quality?.needsRevision) {
      concerns.push(
        `${chapter.chapterLabel} still shows ${chapter.quality.readiness} draft quality (${chapter.quality.score}/100).`,
      );
    }
    if (concerns.length >= 6) {
      break;
    }
  }

  return concerns;
}

function buildFullText(chapters: EditingChapterSnapshot[]) {
  return chapters
    .map((chapter) => `# ${chapter.chapterLabel}\n\n${chapter.chapterText}`)
    .join("\n\n");
}

export async function assembleManuscriptWorkflow(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { chapters } = await loadEditingChapters(book);
  const draftedChapters = chapters.filter((chapter) => chapter.chapterText.trim().length > 0);

  if (draftedChapters.length === 0) {
    throw new Error("No chapter drafts exist yet. Finish drafting chapters before assembling the manuscript.");
  }

  if (draftedChapters.length !== chapters.length) {
    throw new Error("Every chapter must have a draft before the full manuscript can be assembled.");
  }

  const assembly: ManuscriptAssembly = {
    title: book.titleWorking ?? "Untitled Book",
    subtitle: book.subtitle ?? null,
    assembledAt: new Date().toISOString(),
    sourceDraftSignature: buildSourceDraftSignature(chapters),
    chapterCount: chapters.length,
    totalWords: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    editorialOverview: buildEditorialOverview(chapters),
    outstandingConcerns: buildOutstandingConcerns(chapters),
    chapters,
    fullText: buildFullText(chapters),
    chapterKeys: chapters.map((chapter) => chapter.chapterKey),
  };

  await createEditingArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.MANUSCRIPT_ASSEMBLY,
    title: "Full Manuscript Assembly",
    summary: `${assembly.chapterCount} chapters assembled into a full manuscript.`,
    contentJson: assembly,
    contentText: assembly.fullText,
    promptTemplateVersion: "editing-assembly-v1",
    modelName: "deterministic-assembler",
  });

  return assembly;
}
