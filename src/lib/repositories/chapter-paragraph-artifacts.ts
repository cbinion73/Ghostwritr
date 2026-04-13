import {
  ActorType,
  ArtifactStatus,
  ArtifactType,
  Prisma,
} from "@prisma/client";

import { db } from "../db";
import type { ChapterParagraphPlan } from "../paragraph-outline-types";

type SaveChapterParagraphInput = {
  bookId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  sectionId: string;
  contentJson: ChapterParagraphPlan;
  createdByType?: ActorType;
  createdByUserId?: string;
  workflowRunId?: string;
  modelName?: string;
};

/**
 * Save or update a chapter's paragraph plan as a separate artifact
 */
export async function saveChapterParagraphPlan(input: SaveChapterParagraphInput) {
  const stage = await db.bookStage.findFirst({
    where: { bookId: input.bookId, stageKey: "OUTLINE" },
  });

  if (!stage) {
    throw new Error("OUTLINE stage not found for book");
  }

  // Find or create artifact for this chapter
  // Note: We store chapter metadata in the artifact and filter by it
  let artifact = await db.artifact.findFirst({
    where: {
      bookId: input.bookId,
      stageId: stage.id,
      artifactType: "CHAPTER_PARAGRAPH_PLAN" as any,
      title: {
        contains: input.chapterId,
      },
    },
  });

  if (!artifact) {
    artifact = await db.artifact.create({
      data: {
        bookId: input.bookId,
        stageId: stage.id,
        artifactType: "CHAPTER_PARAGRAPH_PLAN" as any,
        title: `Paragraph Plan: ${input.chapterTitle}`,
        summary: `Chapter ${input.chapterNumber}: ${input.chapterTitle}`,
        metadataJson: {
          chapterId: input.chapterId,
          chapterNumber: input.chapterNumber,
          chapterTitle: input.chapterTitle,
          sectionId: input.sectionId,
        },
      },
    });
  }

  // Get version count from database
  const artifact_versions = await db.artifactVersion.findMany({
    where: { artifactId: artifact.id },
  });

  // Create new version
  const version = await db.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      versionNumber: (artifact_versions?.length ?? 0) + 1,
      lifecycleState: ArtifactStatus.DRAFT,
      contentJson: input.contentJson as Prisma.InputJsonValue,
      createdByType: input.createdByType || ActorType.SYSTEM,
      createdByUserId: input.createdByUserId,
      workflowRunId: input.workflowRunId,
      modelName: input.modelName,
    },
  });

  // Update artifact to point to latest version
  await db.artifact.update({
    where: { id: artifact.id },
    data: { currentVersionId: version.id },
  });

  return { artifact, version };
}

/**
 * Get all chapter paragraph plans for a book
 */
export async function getChapterParagraphPlans(bookId: string) {
  const stage = await db.bookStage.findFirst({
    where: { bookId, stageKey: "OUTLINE" },
  });

  if (!stage) return [];

  return db.artifact.findMany({
    where: {
      bookId,
      stageId: stage.id,
      artifactType: "CHAPTER_PARAGRAPH_PLAN" as any,
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });
}

/**
 * Get chapter paragraph plan for a specific chapter
 */
export async function getChapterParagraphPlan(bookId: string, chapterId: string) {
  const stage = await db.bookStage.findFirst({
    where: { bookId, stageKey: "OUTLINE" },
  });

  if (!stage) return null;

  return db.artifact.findFirst({
    where: {
      bookId,
      stageId: stage.id,
      artifactType: "CHAPTER_PARAGRAPH_PLAN" as any,
      title: {
        contains: chapterId,
      },
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });
}

/**
 * Commit a chapter's paragraph plan
 */
export async function commitChapterParagraphPlan(bookId: string, chapterId: string) {
  const artifact = await getChapterParagraphPlan(bookId, chapterId);

  if (!artifact || !artifact.currentVersionId) {
    throw new Error("No paragraph plan found for this chapter");
  }

  const committedAt = new Date();

  // Update version to committed
  await db.artifactVersion.update({
    where: { id: artifact.currentVersionId },
    data: {
      lifecycleState: ArtifactStatus.COMMITTED,
      committedAt,
    },
  });

  // Update artifact
  return db.artifact.update({
    where: { id: artifact.id },
    data: { committedVersionId: artifact.currentVersionId },
  });
}
