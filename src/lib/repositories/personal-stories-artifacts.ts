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

type UpsertPersonalStoryArtifactInput = {
  bookId: string;
  artifactType: ArtifactType;
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

export async function createPersonalStoriesArtifactVersion(
  input: UpsertPersonalStoryArtifactInput,
) {
  const stage = await getStageForBook(input.bookId, StageKey.PERSONAL_STORIES);
  if (!stage) {
    throw new Error(`Personal Stories stage not found for book ${input.bookId}`);
  }

  return db.$transaction(async (tx) => {
    const artifact =
      (await tx.artifact.findFirst({
        where: {
          bookId: input.bookId,
          stageId: stage.id,
          artifactType: input.artifactType,
        },
      })) ??
      (await tx.artifact.create({
        data: {
          bookId: input.bookId,
          stageId: stage.id,
          artifactType: input.artifactType,
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

export async function getPersonalStoriesArtifacts(bookId: string) {
  return db.artifact.findMany({
    where: {
      bookId,
      stage: {
        stageKey: StageKey.PERSONAL_STORIES,
      },
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getPersonalStoryArtifactVersions(
  bookId: string,
  artifactType: ArtifactType,
  limit = 8,
) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType,
      stage: {
        stageKey: StageKey.PERSONAL_STORIES,
      },
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: limit,
      },
    },
  });

  return artifact?.versions ?? [];
}

export async function getCommittedPersonalStoryEncyclopedia(bookId: string) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
      stage: {
        stageKey: StageKey.PERSONAL_STORIES,
      },
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

export async function commitPersonalStoriesStageBundle(bookId: string) {
  const stage = await getStageForBook(bookId, StageKey.PERSONAL_STORIES);
  if (!stage) {
    throw new Error(`Personal Stories stage not found for book ${bookId}`);
  }

  const defaultUser = await ensureDefaultLocalUser();

  return db.$transaction(async (tx) => {
    const artifacts = await tx.artifact.findMany({
      where: {
        bookId,
        stageId: stage.id,
        currentVersionId: { not: null },
      },
    });

    for (const artifact of artifacts) {
      if (!artifact.currentVersionId) continue;

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
          status: ArtifactStatus.COMMITTED,
        },
      });
    }

    const primaryArtifact = artifacts.find(
      (artifact) => artifact.artifactType === ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
    );

    await tx.bookStage.update({
      where: { id: stage.id },
      data: {
        status: StageStatus.COMMITTED,
        committedAt: new Date(),
        committedArtifactVersionId: primaryArtifact?.currentVersionId ?? null,
        activeArtifactVersionId: primaryArtifact?.currentVersionId ?? null,
      },
    });

    await tx.decision.create({
      data: {
        bookId,
        stageId: stage.id,
        artifactId: primaryArtifact?.id,
        decisionType: DecisionType.COMMIT,
        decisionValue: "personal_stories_committed",
        createdByUserId: defaultUser.id,
      },
    });

    return true;
  });
}
