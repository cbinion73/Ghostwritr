import {
  ActorType,
  ArtifactStatus,
  ArtifactType,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { chapterIdentityWhere } from "./chapter-identity";

type TxOrClient = PrismaClient | Prisma.TransactionClient;

export async function createArtifactVersionInTransaction(
  tx: TxOrClient,
  input: {
    artifactId: string;
    lifecycleState: ArtifactStatus;
    contentJson?: Prisma.InputJsonValue;
    contentText?: string | null;
    summary?: string | null;
    createdByType: ActorType;
    createdByUserId?: string | null;
    workflowRunId?: string | null;
    promptTemplateVersion?: string | null;
    modelName?: string | null;
    committedAt?: Date | null;
    artifactStatus?: ArtifactStatus;
    title?: string | null;
  },
) {
  const latestVersion = await tx.artifactVersion.findFirst({
    where: { artifactId: input.artifactId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });

  const version = await tx.artifactVersion.create({
    data: {
      artifactId: input.artifactId,
      versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
      lifecycleState: input.lifecycleState,
      contentJson: input.contentJson ?? {},
      contentText: input.contentText,
      summary: input.summary,
      createdByType: input.createdByType,
      createdByUserId: input.createdByUserId ?? undefined,
      workflowRunId: input.workflowRunId ?? undefined,
      promptTemplateVersion: input.promptTemplateVersion ?? undefined,
      modelName: input.modelName ?? undefined,
      committedAt: input.committedAt ?? undefined,
    },
  });

  await tx.artifact.update({
    where: { id: input.artifactId },
    data: {
      currentVersionId: version.id,
      ...(input.artifactStatus ? { status: input.artifactStatus } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
    },
  });

  return version;
}

export async function commitArtifactVersionInTransaction(
  tx: TxOrClient,
  input: {
    artifactId: string;
    versionId: string;
    committedAt?: Date;
  },
) {
  const committedAt = input.committedAt ?? new Date();

  await tx.artifactVersion.update({
    where: { id: input.versionId },
    data: {
      lifecycleState: ArtifactStatus.COMMITTED,
      committedAt,
    },
  });

  return tx.artifact.update({
    where: { id: input.artifactId },
    data: {
      currentVersionId: input.versionId,
      committedVersionId: input.versionId,
      status: ArtifactStatus.COMMITTED,
    },
  });
}

export async function rejectArtifactVersionInTransaction(
  tx: TxOrClient,
  input: {
    artifactId: string;
    versionId: string;
  },
) {
  await tx.artifactVersion.update({
    where: { id: input.versionId },
    data: { lifecycleState: ArtifactStatus.SUPERSEDED },
  });

  return tx.artifact.update({
    where: { id: input.artifactId },
    data: { status: ArtifactStatus.DRAFT },
  });
}

export async function markArtifactStaleInTransaction(
  tx: TxOrClient,
  input: {
    artifactId: string;
    reason: string;
    markedAt?: Date;
  },
) {
  const artifact = await tx.artifact.findUnique({
    where: { id: input.artifactId },
    select: { metadataJson: true },
  });
  const metadata =
    artifact?.metadataJson && typeof artifact.metadataJson === "object" && !Array.isArray(artifact.metadataJson)
      ? artifact.metadataJson as Record<string, unknown>
      : {};

  return tx.artifact.update({
    where: { id: input.artifactId },
    data: {
      metadataJson: {
        ...metadata,
        stale: true,
        staleReason: input.reason,
        staleAt: (input.markedAt ?? new Date()).toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

export async function supersedeArtifactHistoryInTransaction(
  tx: TxOrClient,
  params: {
    bookId: string;
    stageId: string;
    artifactType: ArtifactType;
    keepArtifactId: string;
    keepVersionId: string;
    chapterKey?: string | null;
    chapterKeyField?: string;
  },
) {
  const {
    bookId,
    stageId,
    artifactType,
    keepArtifactId,
    keepVersionId,
    chapterKey,
    chapterKeyField = "chapterKey",
  } = params;

  await tx.artifactVersion.updateMany({
    where: { artifactId: keepArtifactId, id: { not: keepVersionId } },
    data: { lifecycleState: ArtifactStatus.SUPERSEDED },
  });

  const duplicates = await tx.artifact.findMany({
    where: {
      bookId,
      stageId,
      artifactType,
      id: { not: keepArtifactId },
      status: { not: ArtifactStatus.SUPERSEDED },
      ...(chapterKey
        ? chapterKeyField === "chapterKey"
          ? chapterIdentityWhere(chapterKey)
          : { metadataJson: { path: [chapterKeyField], equals: chapterKey } }
        : {}),
    },
    select: { id: true },
  });

  if (duplicates.length === 0) return 0;

  const duplicateIds = duplicates.map((duplicate) => duplicate.id);
  const duplicateVersionIds = (
    await tx.artifactVersion.findMany({
      where: { artifactId: { in: duplicateIds } },
      select: { id: true },
    })
  ).map((version) => version.id);

  if (duplicateVersionIds.length > 0) {
    await tx.artifactVersion.updateMany({
      where: { id: { in: duplicateVersionIds } },
      data: { lifecycleState: ArtifactStatus.SUPERSEDED },
    });
    await tx.bookStage.updateMany({
      where: { committedArtifactVersionId: { in: duplicateVersionIds } },
      data: { committedArtifactVersionId: null },
    });
    await tx.bookStage.updateMany({
      where: { activeArtifactVersionId: { in: duplicateVersionIds } },
      data: { activeArtifactVersionId: null },
    });
  }

  await tx.artifact.updateMany({
    where: { id: { in: duplicateIds } },
    data: { status: ArtifactStatus.SUPERSEDED },
  });

  return duplicates.length;
}
