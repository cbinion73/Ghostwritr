import { ActorType, ArtifactStatus, ArtifactType, Prisma, StageKey, StageStatus } from "@prisma/client";

import { db } from "../db";
import { getStageForBook } from "./books";
import { pruneToSingleCommittedArtifact } from "./artifact-lifecycle";

type CreateFictionArtifactVersionInput = {
  bookId: string;
  stageKey: StageKey;
  artifactType: ArtifactType;
  title: string;
  summary: string;
  contentJson: Prisma.InputJsonValue;
  contentText?: string | null;
  promptTemplateVersion?: string | null;
  modelName?: string | null;
};

async function ensureArtifact(
  tx: Prisma.TransactionClient,
  input: Pick<CreateFictionArtifactVersionInput, "bookId" | "stageKey" | "artifactType" | "title" | "summary">,
) {
  const stage = await getStageForBook(input.bookId, input.stageKey);
  if (!stage) {
    throw new Error(`Stage ${input.stageKey} is not available for this book.`);
  }

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
        status: ArtifactStatus.DRAFT,
        title: input.title,
        summary: input.summary,
      },
    }));

  return { stage, artifact };
}

export async function createFictionArtifactVersion(input: CreateFictionArtifactVersionInput) {
  return db.$transaction(async (tx) => {
    const { stage, artifact } = await ensureArtifact(tx, input);
    const latestVersion = await tx.artifactVersion.findFirst({
      where: { artifactId: artifact.id },
      orderBy: { versionNumber: "desc" },
    });

    const version = await tx.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
        lifecycleState: ArtifactStatus.DRAFT,
        contentJson: input.contentJson,
        contentText: input.contentText ?? null,
        summary: input.summary,
        createdByType: ActorType.SYSTEM,
        promptTemplateVersion: input.promptTemplateVersion ?? null,
        modelName: input.modelName ?? null,
      },
    });

    await tx.artifact.update({
      where: { id: artifact.id },
      data: {
        currentVersionId: version.id,
        summary: input.summary,
        title: input.title,
      },
    });

    await tx.bookStage.update({
      where: {
        bookId_stageKey: {
          bookId: input.bookId,
          stageKey: input.stageKey,
        },
      },
      data: {
        status: StageStatus.IN_PROGRESS,
        activeArtifactVersionId: version.id,
        metadataJson: {
          automationStatus: "drafted",
          lastUpdatedAt: new Date().toISOString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { stage, artifact, version };
  });
}

export async function getLatestFictionArtifactVersion(bookId: string, artifactType: ArtifactType) {
  const artifact = await db.artifact.findFirst({
    where: { bookId, artifactType },
  });

  if (!artifact) {
    return null;
  }

  return db.artifactVersion.findFirst({
    where: { artifactId: artifact.id },
    orderBy: { versionNumber: "desc" },
  });
}

export async function getCommittedFictionArtifactVersion(bookId: string, artifactType: ArtifactType) {
  const artifact = await db.artifact.findFirst({
    where: { bookId, artifactType },
  });

  if (!artifact?.committedVersionId) {
    return null;
  }

  return db.artifactVersion.findUnique({
    where: { id: artifact.committedVersionId },
  });
}

export async function getFictionArtifactVersions(bookId: string, artifactType: ArtifactType, limit = 5) {
  const artifact = await db.artifact.findFirst({
    where: { bookId, artifactType },
  });

  if (!artifact) {
    return [];
  }

  return db.artifactVersion.findMany({
    where: { artifactId: artifact.id },
    orderBy: { versionNumber: "desc" },
    take: limit,
  });
}

export async function commitFictionArtifact(bookId: string, stageKey: StageKey, artifactType: ArtifactType) {
  return db.$transaction(async (tx) => {
    const stage = await getStageForBook(bookId, stageKey);
    if (!stage) {
      throw new Error(`Stage ${stageKey} is not available for this book.`);
    }

    const artifact = await tx.artifact.findFirst({
      where: {
        bookId,
        stageId: stage.id,
        artifactType,
      },
    });

    if (!artifact?.currentVersionId) {
      throw new Error(`No ${artifactType} draft exists yet.`);
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
        status: ArtifactStatus.COMMITTED,
        committedVersionId: artifact.currentVersionId,
      },
    });

    await pruneToSingleCommittedArtifact(tx, {
      bookId,
      stageId: stage.id,
      artifactType,
      keepArtifactId: artifact.id,
      keepVersionId: artifact.currentVersionId,
    });

    await tx.bookStage.update({
      where: {
        bookId_stageKey: {
          bookId,
          stageKey,
        },
      },
      data: {
        status: StageStatus.COMMITTED,
        activeArtifactVersionId: artifact.currentVersionId,
        committedArtifactVersionId: artifact.currentVersionId,
        committedAt: new Date(),
        metadataJson: {
          automationStatus: "committed",
          committedAt: new Date().toISOString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    return artifact.currentVersionId;
  });
}
