import {
  ArtifactStatus,
  ArtifactType,
  StageKey,
  StageStatus,
} from "@prisma/client";

import {
  ChapterDraftBundleSchema,
  parseArtifactWithSchema,
  parseMetadataRecord,
} from "../../artifact-schemas";
import {
  commitChapterDraft,
  getChapterArtifactVersions,
} from "../../repositories/chapter-draft-artifacts";
import {
  getBookBySlugOrThrow,
  getStageForBook,
  updateStageForBook,
} from "../../repositories/books";
import { clearStageStaleDependency, invalidateDependentStagesForBook } from "../../workflow-dependencies";
import {
  getDraftInputs,
} from "./context";

export async function commitChapterDraftWorkflow(bookSlug: string, chapterKey: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const result = await commitChapterDraft(book.id, chapterKey);
  await clearStageStaleDependency(bookSlug, StageKey.CHAPTER_DRAFT, { chapterIds: [chapterKey] });
  await invalidateDependentStagesForBook(bookSlug, StageKey.CHAPTER_DRAFT, { chapterIds: [chapterKey] });
  return result;
}

export async function commitAllChapterDraftsWorkflow(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.CHAPTER_DRAFT);
  const { chapterContexts } = await getDraftInputs(book.id);

  if (chapterContexts.length === 0) {
    throw new Error("No committed outline chapters are available for chapter draft commit.");
  }

  const committedChapterKeys: string[] = [];
  const missingChapterKeys: string[] = [];
  const needsRevisionChapterKeys: string[] = [];

  for (const context of chapterContexts) {
    const draftVersions = await getChapterArtifactVersions(
      book.id,
      context.chapter.chapterId,
      ArtifactType.CHAPTER_DRAFT,
      1,
    );
    const latestVersion = draftVersions[0] ?? null;
    if (!latestVersion) {
      missingChapterKeys.push(context.chapter.chapterId);
      continue;
    }

    // A chapter whose revision passes were exhausted still carries
    // needsRevision — bulk commit must not silently ship it. It stays
    // uncommitted and reported; the author can repair it or commit it
    // individually (an explicit human override) via commitChapterDraftWorkflow.
    if (latestVersion.lifecycleState !== ArtifactStatus.COMMITTED) {
      const latestDraft = parseArtifactWithSchema(latestVersion.contentJson, ChapterDraftBundleSchema);
      if (
        latestDraft?.quality?.needsRevision ||
        latestDraft?.quality?.integrity?.status !== "pass"
      ) {
        needsRevisionChapterKeys.push(context.chapter.chapterId);
        continue;
      }
      await commitChapterDraft(book.id, context.chapter.chapterId);
    }

    committedChapterKeys.push(context.chapter.chapterId);
  }

  const metadata = parseMetadataRecord(stage?.metadataJson);
  const now = new Date().toISOString();
  const blockedCount = missingChapterKeys.length + needsRevisionChapterKeys.length;
  const holdSummary = [
    missingChapterKeys.length > 0 ? `${missingChapterKeys.length} still missing` : null,
    needsRevisionChapterKeys.length > 0
      ? `${needsRevisionChapterKeys.length} held for revision (${needsRevisionChapterKeys.join(", ")})`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  await updateStageForBook(book.id, StageKey.CHAPTER_DRAFT, {
    status: blockedCount === 0 ? StageStatus.COMMITTED : StageStatus.READY_FOR_REVIEW,
    committedAt: blockedCount === 0 ? new Date() : undefined,
    metadataJson: {
      ...metadata,
      automationStatus: blockedCount === 0 ? "committed" : "ready_for_review",
      currentAction:
        blockedCount === 0
          ? "All chapter drafts committed"
          : `Committed ${committedChapterKeys.length} chapter drafts. ${holdSummary}.`,
      totalChapters: chapterContexts.length,
      completedChapters: committedChapterKeys.length,
      needsRevisionChapterKeys,
      currentChapterKey: null,
      recentActivity: [
        {
          at: now,
          message:
            blockedCount === 0
              ? "Committed all chapter drafts."
              : `Committed all clean chapter drafts. ${holdSummary}.`,
        },
        ...(
          Array.isArray(metadata.recentActivity)
            ? (metadata.recentActivity as Array<{ at: string; message: string }>)
            : []
        ),
      ].slice(0, 10),
      lastRunAt: now,
    },
  });

  await clearStageStaleDependency(bookSlug, StageKey.CHAPTER_DRAFT, { chapterIds: committedChapterKeys });
  await invalidateDependentStagesForBook(bookSlug, StageKey.CHAPTER_DRAFT, { chapterIds: committedChapterKeys });

  return {
    committedChapterKeys,
    missingChapterKeys,
    needsRevisionChapterKeys,
    totalChapters: chapterContexts.length,
  };
}
