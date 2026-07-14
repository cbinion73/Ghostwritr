import { ArtifactType, BookWorkflowType } from "@prisma/client";

import type { ChapterDraftBundle, ChapterReviewBundle } from "../../chapter-draft-types";
import type { EditingChapterSnapshot } from "../../editing-types";
import type { FictionDraftArtifact } from "../../fiction-types";
import type { ParagraphOutline } from "../../paragraph-outline-types";
import { getChapterArtifactVersions } from "../../repositories/chapter-draft-artifacts";
import { listChapterApprovalStates } from "../../repositories/chapter-approval-state";
import { getEditingArtifactVersionById } from "../../repositories/editing-artifacts";
import { getCommittedFictionArtifactVersion } from "../../repositories/fiction-artifacts";
import { getCommittedOutlineExpansion } from "../../repositories/outline-artifacts";
import { parseJson } from "./workspace-support";

function countWords(value: string | null | undefined) {
  return value?.split(/\s+/).filter(Boolean).length ?? 0;
}

async function loadNonfictionEditingChapters(bookId: string) {
  const committedOutlineVersion = await getCommittedOutlineExpansion(bookId);
  const outline = parseJson<ParagraphOutline | null>(committedOutlineVersion?.contentJson, null);
  if (!outline) {
    throw new Error("Committed paragraph-level Outline is required before Editing can begin.");
  }

  const chapters: EditingChapterSnapshot[] = [];
  const approvalStates = new Map(
    (await listChapterApprovalStates(bookId)).map((state) => [state.chapterId, state]),
  );

  for (const section of outline.sections) {
    for (const chapter of section.chapters) {
      const approvalState = approvalStates.get(chapter.chapterId);
      if (!approvalState?.approvedDraftVersionId || approvalState.isStale) {
        throw new Error(
          `Every chapter must have a current approved Quill draft before Editing can begin. ${chapter.chapterTitle} is not approved.`,
        );
      }

      const [approvedDraftVersion, reviewVersions] = await Promise.all([
        getEditingArtifactVersionById(approvalState.approvedDraftVersionId),
        getChapterArtifactVersions(bookId, chapter.chapterId, ArtifactType.EDITORIAL_REVIEW, 1),
      ]);
      const draft = approvedDraftVersion
        ? parseJson<ChapterDraftBundle | null>(approvedDraftVersion.contentJson, null)
        : null;
      const review = reviewVersions[0]
        ? parseJson<ChapterReviewBundle | null>(reviewVersions[0].contentJson, null)
        : null;
      // Some chapters were committed through the plain conversational
      // agent-chat path rather than the structured chapter-draft flow, so
      // their contentJson is a bare `{ text }` blob instead of a full
      // ChapterDraftBundle -- draft.chapterText comes back undefined even
      // though the prose is right there under a different key.
      const rawDraftContent = approvedDraftVersion?.contentJson as { text?: unknown } | null | undefined;
      const resolvedChapterText =
        draft?.chapterText ?? (typeof rawDraftContent?.text === "string" ? rawDraftContent.text : "");

      chapters.push({
        chapterKey: chapter.chapterId,
        chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`,
        sectionTitle: section.sectionTitle,
        wordCount: countWords(resolvedChapterText),
        reviewSummary: review?.overallAssessment ?? null,
        chapterText: resolvedChapterText,
        approvedDraftVersionId: approvalState.approvedDraftVersionId,
        paragraphOutline: chapter.paragraphs.map((paragraph) => ({
          id: paragraph.id,
          topicSentence: paragraph.topicSentence,
          purpose: paragraph.purpose,
        })),
        quality: draft?.quality ?? null,
      });
    }
  }

  return { outline, chapters };
}

async function loadFictionEditingChapters(bookId: string) {
  const committedDraft = await getCommittedFictionArtifactVersion(
    bookId,
    ArtifactType.FICTION_DRAFT_MANUSCRIPT,
  );
  const draft = parseJson<FictionDraftArtifact | null>(committedDraft?.contentJson, null);
  if (!draft || draft.chapters.length === 0) {
    throw new Error("Committed fiction Draft is required before Editing can begin.");
  }

  const chapters: EditingChapterSnapshot[] = draft.chapters.map((chapter) => ({
    chapterKey: chapter.chapterKey,
    chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.title}`,
    sectionTitle: "Narrative Draft",
    wordCount: chapter.wordCount,
    reviewSummary: null,
    chapterText: chapter.text,
    quality: chapter.quality ?? null,
  }));

  return { outline: null, chapters };
}

export async function loadEditingChapters(book: { id: string; workflowType: BookWorkflowType }) {
  if (book.workflowType === BookWorkflowType.FICTION) {
    return loadFictionEditingChapters(book.id);
  }

  return loadNonfictionEditingChapters(book.id);
}
