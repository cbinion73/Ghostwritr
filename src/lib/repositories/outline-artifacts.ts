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

type UpsertOutlineArtifactInput = {
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

export async function getOutlineArtifacts(bookId: string) {
  return db.artifact.findMany({
    where: {
      bookId,
      stage: {
        stageKey: StageKey.OUTLINE,
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

export async function getOutlineVersions(bookId: string, limit = 6) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.OUTLINE,
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

export async function getCommittedOutline(bookId: string) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.OUTLINE,
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

export async function getOutlineExpansionVersions(bookId: string, limit = 6) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.OUTLINE_EXPANSION,
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

export async function getCommittedOutlineExpansion(bookId: string) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.OUTLINE_EXPANSION,
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

export async function createOutlineExpansionVersion(input: UpsertOutlineArtifactInput) {
  const outlineStage = await getStageForBook(input.bookId, StageKey.OUTLINE);

  if (!outlineStage) {
    throw new Error(`Outline stage not found for book ${input.bookId}`);
  }

  return db.$transaction(async (tx) => {
    const artifact =
      (await tx.artifact.findFirst({
        where: {
          bookId: input.bookId,
          stageId: outlineStage.id,
          artifactType: ArtifactType.OUTLINE_EXPANSION,
        },
      })) ??
      (await tx.artifact.create({
        data: {
          bookId: input.bookId,
          stageId: outlineStage.id,
          artifactType: ArtifactType.OUTLINE_EXPANSION,
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

export async function commitOutlineExpansionBundle(bookId: string) {
  const outlineStage = await getStageForBook(bookId, StageKey.OUTLINE);

  if (!outlineStage) {
    throw new Error(`Outline stage not found for book ${bookId}`);
  }

  const defaultUser = await ensureDefaultLocalUser();

  return db.$transaction(async (tx) => {
    const artifact = await tx.artifact.findFirst({
      where: {
        bookId,
        stageId: outlineStage.id,
        artifactType: ArtifactType.OUTLINE_EXPANSION,
        currentVersionId: {
          not: null,
        },
      },
    });

    if (!artifact?.currentVersionId) {
      throw new Error("No paragraph-level outline version available to commit");
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

    await tx.decision.create({
      data: {
        bookId,
        stageId: outlineStage.id,
        artifactId: artifact.id,
        decisionType: DecisionType.COMMIT,
        decisionValue: "outline_expansion_committed",
        createdByUserId: defaultUser.id,
      },
    });

    return true;
  });
}

export async function createOutlineVersion(input: UpsertOutlineArtifactInput) {
  const outlineStage = await getStageForBook(input.bookId, StageKey.OUTLINE);

  if (!outlineStage) {
    throw new Error(`Outline stage not found for book ${input.bookId}`);
  }

  return db.$transaction(async (tx) => {
    const artifact =
      (await tx.artifact.findFirst({
        where: {
          bookId: input.bookId,
          stageId: outlineStage.id,
          artifactType: ArtifactType.OUTLINE,
        },
      })) ??
      (await tx.artifact.create({
        data: {
          bookId: input.bookId,
          stageId: outlineStage.id,
          artifactType: ArtifactType.OUTLINE,
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

    await tx.bookStage.update({
      where: { id: outlineStage.id },
      data: {
        status: StageStatus.IN_PROGRESS,
        activeArtifactVersionId: version.id,
      },
    });

    return version;
  });
}

export async function commitOutlineStageBundle(
  bookId: string,
  options?: { finalizeStage?: boolean },
) {
  const outlineStage = await getStageForBook(bookId, StageKey.OUTLINE);

  if (!outlineStage) {
    throw new Error(`Outline stage not found for book ${bookId}`);
  }

  const defaultUser = await ensureDefaultLocalUser();

  return db.$transaction(async (tx) => {
    const artifact = await tx.artifact.findFirst({
      where: {
        bookId,
        stageId: outlineStage.id,
        artifactType: ArtifactType.OUTLINE,
        currentVersionId: {
          not: null,
        },
      },
    });

    if (!artifact?.currentVersionId) {
      throw new Error("No outline version available to commit");
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

    await tx.bookStage.update({
      where: { id: outlineStage.id },
      data:
        options?.finalizeStage === false
          ? {
              status: StageStatus.IN_PROGRESS,
              committedAt: null,
              activeArtifactVersionId: artifact.currentVersionId,
            }
          : {
              status: StageStatus.COMMITTED,
              committedAt: new Date(),
              committedArtifactVersionId: artifact.currentVersionId,
              activeArtifactVersionId: artifact.currentVersionId,
            },
    });

    await tx.decision.create({
      data: {
        bookId,
        stageId: outlineStage.id,
        artifactId: artifact.id,
        decisionType: DecisionType.COMMIT,
        decisionValue: "outline_stage_committed",
        createdByUserId: defaultUser.id,
      },
    });

    return true;
  });
}
