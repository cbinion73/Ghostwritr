import {
  ActorType,
  ArtifactStatus,
  ArtifactType,
  DecisionType,
  Prisma,
  StageKey,
  StageStatus,
} from "@prisma/client";

import { db } from "../db";
import { getStageForBook } from "./books";
import { ensureDefaultLocalUser } from "../users";

type CreateChapterArtifactVersionInput = {
  bookId: string;
  artifactType: ArtifactType;
  chapterKey: string;
  chapterTitle: string;
  summary?: string;
  contentJson: Prisma.InputJsonValue;
  contentText?: string;
  createdByType?: ActorType;
  createdByUserId?: string;
  workflowRunId?: string;
  promptTemplateVersion?: string;
  modelName?: string;
};

function getArtifactTitle(
  artifactType: ArtifactType,
  chapterKey: string,
  chapterTitle: string,
) {
  return `${
    artifactType === ArtifactType.CHAPTER_DRAFT ? "Chapter Draft" : "Chapter Review"
  }: ${chapterKey} - ${chapterTitle}`;
}

export async function getChapterArtifactVersions(
  bookId: string,
  chapterKey: string,
  artifactType: ArtifactType,
  limit = 6,
) {
  // Some chapters are committed through the plain conversational
  // agent-chat path rather than createChapterArtifactVersion() below, which
  // writes a bare chapter title (e.g. "Holy Interruptions") instead of the
  // "Chapter Draft: {chapterKey} - {chapterTitle}" format — so the
  // title-prefix match here missed 12 of 16 chapters for a real production
  // book (confirmed 2026-07-08) despite every one of them having a correct
  // metadataJson.chapterKey. Match on that instead; it's set by every write
  // path, and ordering by most-recently-updated Artifact naturally picks up
  // the latest regeneration when a chapter has been redrafted more than once
  // (each redraft under this scenario creates a new Artifact row rather than
  // a new version of the existing one).
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType,
      metadataJson: { path: ["chapterKey"], equals: chapterKey },
      stage: {
        stageKey: StageKey.CHAPTER_DRAFT,
      },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: limit,
      },
    },
  });

  return artifact?.versions ?? [];
}

export async function getCommittedChapterDraft(bookId: string, chapterKey: string) {
  // See getChapterArtifactVersions above — match by metadataJson.chapterKey,
  // not title prefix, for the same reason.
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.CHAPTER_DRAFT,
      metadataJson: { path: ["chapterKey"], equals: chapterKey },
      stage: {
        stageKey: StageKey.CHAPTER_DRAFT,
      },
      committedVersionId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      versions: {
        where: { lifecycleState: ArtifactStatus.COMMITTED },
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  return artifact?.versions[0] ?? null;
}

export async function createChapterArtifactVersion(input: CreateChapterArtifactVersionInput) {
  const stage = await getStageForBook(input.bookId, StageKey.CHAPTER_DRAFT);
  if (!stage) {
    throw new Error(`Chapter Draft stage not found for book ${input.bookId}`);
  }

  const title = getArtifactTitle(input.artifactType, input.chapterKey, input.chapterTitle);
  const artifact =
    (await db.artifact.findFirst({
      where: {
        bookId: input.bookId,
        stageId: stage.id,
        artifactType: input.artifactType,
        title,
      },
    })) ??
    (await db.artifact.create({
      data: {
        bookId: input.bookId,
        stageId: stage.id,
        artifactType: input.artifactType,
        title,
        summary: input.summary,
        status: ArtifactStatus.DRAFT,
        metadataJson: {
          chapterKey: input.chapterKey,
          chapterTitle: input.chapterTitle,
        },
      },
    }));

  const latestVersion = await db.artifactVersion.findFirst({
    where: { artifactId: artifact.id },
    orderBy: { versionNumber: "desc" },
  });

  const version = await db.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
      lifecycleState: ArtifactStatus.DRAFT,
      contentJson: input.contentJson,
      contentText: input.contentText,
      summary: input.summary,
      createdByType: input.createdByType ?? ActorType.SYSTEM,
      createdByUserId: input.createdByUserId,
      workflowRunId: input.workflowRunId,
      promptTemplateVersion: input.promptTemplateVersion,
      modelName: input.modelName,
    },
  });

  await db.artifact.update({
    where: { id: artifact.id },
    data: {
      currentVersionId: version.id,
      summary: input.summary ?? artifact.summary,
      status: ArtifactStatus.DRAFT,
    },
  });

  if (input.artifactType === ArtifactType.CHAPTER_DRAFT) {
    await db.bookStage.update({
      where: { id: stage.id },
      data: {
        status: StageStatus.IN_PROGRESS,
        activeArtifactVersionId: version.id,
      },
    });
  }

  return version;
}

export async function commitChapterDraft(bookId: string, chapterKey: string) {
  const stage = await getStageForBook(bookId, StageKey.CHAPTER_DRAFT);
  if (!stage) {
    throw new Error(`Chapter Draft stage not found for book ${bookId}`);
  }

  const defaultUser = await ensureDefaultLocalUser();

  return db.$transaction(async (tx) => {
    const artifact = await tx.artifact.findFirst({
      where: {
        bookId,
        stageId: stage.id,
        artifactType: ArtifactType.CHAPTER_DRAFT,
        title: { startsWith: `Chapter Draft: ${chapterKey} - ` },
        currentVersionId: { not: null },
      },
    });

    if (!artifact?.currentVersionId) {
      throw new Error("No chapter draft version available to commit.");
    }

    await tx.artifactVersion.update({
      where: { id: artifact.currentVersionId },
      data: {
        lifecycleState: ArtifactStatus.COMMITTED,
        committedAt: new Date(),
      },
    });

    await tx.artifact.update({
      where: { id: artifact.id },
      data: {
        committedVersionId: artifact.currentVersionId,
        currentVersionId: artifact.currentVersionId,
        status: ArtifactStatus.COMMITTED,
      },
    });

    const totalDraftArtifacts = await tx.artifact.count({
      where: {
        bookId,
        stageId: stage.id,
        artifactType: ArtifactType.CHAPTER_DRAFT,
      },
    });
    const committedDraftArtifacts = await tx.artifact.count({
      where: {
        bookId,
        stageId: stage.id,
        artifactType: ArtifactType.CHAPTER_DRAFT,
        committedVersionId: { not: null },
      },
    });

    await tx.bookStage.update({
      where: { id: stage.id },
      data: {
        status:
          totalDraftArtifacts > 0 && totalDraftArtifacts === committedDraftArtifacts
            ? StageStatus.COMMITTED
            : StageStatus.READY_FOR_REVIEW,
        committedAt:
          totalDraftArtifacts > 0 && totalDraftArtifacts === committedDraftArtifacts
            ? new Date()
            : stage.committedAt,
        activeArtifactVersionId: artifact.currentVersionId,
        committedArtifactVersionId:
          totalDraftArtifacts > 0 && totalDraftArtifacts === committedDraftArtifacts
            ? artifact.currentVersionId
            : stage.committedArtifactVersionId,
      },
    });

    await tx.decision.create({
      data: {
        bookId,
        stageId: stage.id,
        artifactId: artifact.id,
        decisionType: DecisionType.COMMIT,
        decisionValue: `chapter_draft_committed:${chapterKey}`,
        createdByUserId: defaultUser.id,
      },
    });

    return true;
  }, {
    maxWait: 10000,
    timeout: 30000,
  });
}
