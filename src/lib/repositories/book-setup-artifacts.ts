import { ActorType, ArtifactStatus, ArtifactType, Prisma, StageKey } from "@prisma/client";

import type { BookSetupProfile } from "../book-setup-types";
import { db } from "../db";
import { getStageForBook } from "./books";
import { pruneToSingleCommittedArtifact } from "./artifact-lifecycle";

export async function getBookSetupVersions(bookId: string, limit = 6) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.BOOK_SETUP_PROFILE,
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

export async function getCommittedBookSetup(bookId: string) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.BOOK_SETUP_PROFILE,
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

export async function createBookSetupVersion(input: {
  bookId: string;
  profile: BookSetupProfile;
  summary?: string;
}) {
  const stage = await getStageForBook(input.bookId, StageKey.BOOK_SETUP);
  if (!stage) {
    throw new Error(`Book Setup stage not found for book ${input.bookId}`);
  }

  return db.$transaction(async (tx) => {
    const artifact =
      (await tx.artifact.findFirst({
        where: {
          bookId: input.bookId,
          stageId: stage.id,
          artifactType: ArtifactType.BOOK_SETUP_PROFILE,
        },
      })) ??
      (await tx.artifact.create({
        data: {
          bookId: input.bookId,
          stageId: stage.id,
          artifactType: ArtifactType.BOOK_SETUP_PROFILE,
          title: "Book Setup Profile",
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
        contentJson: input.profile as Prisma.InputJsonValue,
        contentText: JSON.stringify(input.profile, null, 2),
        summary: input.summary ?? `${input.profile.writerPersona} • ${input.profile.targetWordCount.toLocaleString()} words`,
        createdByType: ActorType.USER,
      },
    });

    await tx.artifact.update({
      where: { id: artifact.id },
      data: {
        currentVersionId: version.id,
        status: ArtifactStatus.DRAFT,
        summary: version.summary,
        metadataJson: {
          writerPersona: input.profile.writerPersona,
          targetWordCount: input.profile.targetWordCount,
          outputFormats: input.profile.outputFormats,
        },
      },
    });

    return version;
  });
}

export async function commitBookSetup(bookId: string) {
  const stage = await getStageForBook(bookId, StageKey.BOOK_SETUP);
  if (!stage) {
    throw new Error(`Book Setup stage not found for book ${bookId}`);
  }

  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      stageId: stage.id,
      artifactType: ArtifactType.BOOK_SETUP_PROFILE,
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  const version = artifact?.versions[0];
  if (!artifact || !version) {
    throw new Error("No Book Setup profile exists yet.");
  }

  return db.$transaction(async (tx) => {
    await tx.artifactVersion.update({
      where: { id: version.id },
      data: {
        lifecycleState: ArtifactStatus.COMMITTED,
        committedAt: new Date(),
      },
    });

    await tx.artifact.update({
      where: { id: artifact.id },
      data: {
        currentVersionId: version.id,
        committedVersionId: version.id,
        status: ArtifactStatus.COMMITTED,
      },
    });

    await pruneToSingleCommittedArtifact(tx, {
      bookId,
      stageId: stage.id,
      artifactType: ArtifactType.BOOK_SETUP_PROFILE,
      keepArtifactId: artifact.id,
      keepVersionId: version.id,
    });

    return tx.bookStage.update({
      where: {
        bookId_stageKey: {
          bookId,
          stageKey: StageKey.BOOK_SETUP,
        },
      },
      data: {
        status: "COMMITTED",
        committedArtifactVersionId: version.id,
        committedAt: new Date(),
      },
    });
  });
}
