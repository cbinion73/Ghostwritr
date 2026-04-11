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

type UpsertPromiseArtifactInput = {
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

export async function getPromiseArtifacts(bookId: string) {
  return db.artifact.findMany({
    where: {
      bookId,
      stage: {
        stageKey: StageKey.PROMISE,
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

export async function getCommittedPromiseBrief(bookId: string) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.PROMISE_BRIEF,
      committedVersionId: {
        not: null,
      },
    },
    include: {
      versions: {
        where: {
          lifecycleState: ArtifactStatus.COMMITTED,
        },
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  return artifact?.versions[0] ?? null;
}

export async function getPromiseBriefVersions(bookId: string, limit = 6) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.PROMISE_BRIEF,
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

export async function createPromiseArtifactVersion(input: UpsertPromiseArtifactInput) {
  const promiseStage = await getStageForBook(input.bookId, StageKey.PROMISE);

  if (!promiseStage) {
    throw new Error(`Promise stage not found for book ${input.bookId}`);
  }

  return db.$transaction(async (tx) => {
    const artifact =
      (await tx.artifact.findFirst({
        where: {
          bookId: input.bookId,
          stageId: promiseStage.id,
          artifactType: input.artifactType,
        },
      })) ??
      (await tx.artifact.create({
        data: {
          bookId: input.bookId,
          stageId: promiseStage.id,
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

    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const version = await tx.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        versionNumber: nextVersionNumber,
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

    return version;
  });
}

export async function commitPromiseArtifact(params: {
  artifactId: string;
  versionId: string;
}) {
  return db.$transaction(async (tx) => {
    await tx.artifactVersion.update({
      where: { id: params.versionId },
      data: {
        lifecycleState: ArtifactStatus.COMMITTED,
        committedAt: new Date(),
      },
    });

    return tx.artifact.update({
      where: { id: params.artifactId },
      data: {
        committedVersionId: params.versionId,
        currentVersionId: params.versionId,
        status: ArtifactStatus.COMMITTED,
      },
    });
  });
}

export async function commitPromiseStageBundle(bookId: string) {
  const promiseStage = await getStageForBook(bookId, StageKey.PROMISE);

  if (!promiseStage) {
    throw new Error(`Promise stage not found for book ${bookId}`);
  }

  const defaultUser = await ensureDefaultLocalUser();

  return db.$transaction(async (tx) => {
    const artifacts = await tx.artifact.findMany({
      where: {
        bookId,
        stageId: promiseStage.id,
        currentVersionId: {
          not: null,
        },
      },
    });

    for (const artifact of artifacts) {
      if (!artifact.currentVersionId) {
        continue;
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
          status: ArtifactStatus.COMMITTED,
        },
      });
    }

    const primaryArtifact = artifacts.find(
      (artifact) => artifact.artifactType === ArtifactType.PROMISE_BRIEF,
    );

    await tx.bookStage.update({
      where: { id: promiseStage.id },
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
        stageId: promiseStage.id,
        artifactId: primaryArtifact?.id,
        decisionType: DecisionType.COMMIT,
        decisionValue: "promise_stage_committed",
        createdByUserId: defaultUser.id,
      },
    });

    return true;
  });
}
