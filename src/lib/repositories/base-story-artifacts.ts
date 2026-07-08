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
import { pruneToSingleCommittedArtifact } from "./artifact-lifecycle";

type UpsertBaseStoryInput = {
  bookId: string;
  title?: string;
  summary?: string;
  contentJson?: Prisma.InputJsonValue;
  contentText?: string;
  createdByType?: ActorType;
  createdByUserId?: string;
  workflowRunId?: string;
  promptTemplateVersion?: string;
  modelName?: string;
};

export async function getBaseStoryVersions(bookId: string, limit = 6) {
  const artifact = await db.artifact.findFirst({
    where: { bookId, artifactType: ArtifactType.BASE_STORY },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: limit,
      },
    },
  });

  return artifact?.versions ?? [];
}

export async function getCommittedBaseStory(bookId: string) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.BASE_STORY,
      committedVersionId: { not: null },
    },
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

export async function createBaseStoryVersion(input: UpsertBaseStoryInput) {
  const stage = await getStageForBook(input.bookId, StageKey.BASE_STORY);
  if (!stage) {
    throw new Error(`Base Story stage not found for book ${input.bookId}`);
  }

  return db.$transaction(async (tx) => {
    const artifact =
      (await tx.artifact.findFirst({
        where: { bookId: input.bookId, stageId: stage.id, artifactType: ArtifactType.BASE_STORY },
      })) ??
      (await tx.artifact.create({
        data: {
          bookId: input.bookId,
          stageId: stage.id,
          artifactType: ArtifactType.BASE_STORY,
          title: input.title,
          summary: input.summary,
          status: ArtifactStatus.DRAFT,
        },
      }));

    const latestVersion = await tx.artifactVersion.findFirst({
      where: { artifactId: artifact.id },
      orderBy: { versionNumber: "desc" },
    });

    const version = await tx.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
        lifecycleState: ArtifactStatus.DRAFT,
        contentJson: input.contentJson ?? {},
        contentText: input.contentText,
        summary: input.summary,
        createdByType: input.createdByType ?? ActorType.SYSTEM,
        createdByUserId: input.createdByUserId,
        workflowRunId: input.workflowRunId,
        promptTemplateVersion: input.promptTemplateVersion,
        modelName: input.modelName,
      },
    });

    await tx.artifact.update({
      where: { id: artifact.id },
      data: {
        title: input.title ?? artifact.title,
        summary: input.summary ?? artifact.summary,
        currentVersionId: version.id,
        status: ArtifactStatus.DRAFT,
      },
    });

    await tx.bookStage.update({
      where: { id: stage.id },
      data: {
        status: StageStatus.IN_PROGRESS,
        activeArtifactVersionId: version.id,
      },
    });

    return version;
  });
}

export async function commitBaseStory(bookId: string) {
  const stage = await getStageForBook(bookId, StageKey.BASE_STORY);
  if (!stage) {
    throw new Error(`Base Story stage not found for book ${bookId}`);
  }

  const defaultUser = await ensureDefaultLocalUser();

  return db.$transaction(async (tx) => {
    const candidates = await tx.artifact.findMany({
      where: {
        bookId,
        stageId: stage.id,
        artifactType: ArtifactType.BASE_STORY,
        currentVersionId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
    });

    const artifact = candidates[0];
    if (!artifact?.currentVersionId) {
      throw new Error("No base story version available to commit.");
    }

    await tx.artifactVersion.update({
      where: { id: artifact.currentVersionId },
      data: { lifecycleState: ArtifactStatus.COMMITTED, committedAt: new Date() },
    });

    await tx.artifact.update({
      where: { id: artifact.id },
      data: {
        committedVersionId: artifact.currentVersionId,
        status: ArtifactStatus.COMMITTED,
      },
    });

    // Base Story is one-per-book — only the committed version/artifact
    // should persist.
    await pruneToSingleCommittedArtifact(tx, {
      bookId,
      stageId: stage.id,
      artifactType: ArtifactType.BASE_STORY,
      keepArtifactId: artifact.id,
      keepVersionId: artifact.currentVersionId,
    });

    await tx.bookStage.update({
      where: { id: stage.id },
      data: {
        status: StageStatus.COMMITTED,
        committedAt: new Date(),
        committedArtifactVersionId: artifact.currentVersionId,
        activeArtifactVersionId: artifact.currentVersionId,
      },
    });

    await tx.decision.create({
      data: {
        bookId,
        stageId: stage.id,
        artifactId: artifact.id,
        decisionType: DecisionType.COMMIT,
        decisionValue: "base_story_committed",
        createdByUserId: defaultUser.id,
      },
    });
  });
}
