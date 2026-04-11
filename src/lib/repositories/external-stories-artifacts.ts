import {
  ActorType,
  ArtifactStatus,
  ArtifactType,
  DecisionType,
  Prisma,
  StageKey,
  StageStatus,
  StorySourceTier,
  StoryVerificationStatus,
  StoryVerifierType,
  ExternalStoryType,
  ExternalStoryFit,
} from "@prisma/client";

import type {
  ChapterExternalStoryDossier,
  ChapterExternalStoryItem,
  ChapterExternalStorySource,
  ChapterExternalStoryVerification,
} from "../external-story-types";
import { db, withDbRetry } from "../db";
import { sanitizeUnknown, stripNullChars } from "../sanitize";
import { getStageForBook } from "./books";
import { ensureDefaultLocalUser } from "../users";

type CreateExternalStoryPackVersionInput = {
  bookId: string;
  chapterKey: string;
  chapterTitle: string;
  summary?: string;
  dossier: ChapterExternalStoryDossier;
  sources: ChapterExternalStorySource[];
  stories: ChapterExternalStoryItem[];
  verifications: ChapterExternalStoryVerification[];
  createdByType?: ActorType;
  createdByUserId?: string;
  workflowRunId?: string;
  promptTemplateVersion?: string;
  modelName?: string;
};

function toJsonValue(value?: Record<string, unknown>) {
  return sanitizeUnknown((value ?? {}) as Prisma.InputJsonValue);
}

function getArtifactTitle(chapterKey: string, chapterTitle: string) {
  return `External Stories: ${chapterKey} - ${chapterTitle}`;
}

export async function getExternalStoryPackVersions(bookId: string, chapterKey: string, limit = 6) {
  const artifact = await withDbRetry(() =>
    db.artifact.findFirst({
      where: {
        bookId,
        artifactType: ArtifactType.EXTERNAL_STORY_PACK,
        title: { startsWith: `External Stories: ${chapterKey} - ` },
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: limit,
        },
      },
    }),
  );

  return artifact?.versions ?? [];
}

export async function getCommittedExternalStoryPack(bookId: string, chapterKey: string) {
  const artifact = await withDbRetry(() =>
    db.artifact.findFirst({
      where: {
        bookId,
        artifactType: ArtifactType.EXTERNAL_STORY_PACK,
        title: { startsWith: `External Stories: ${chapterKey} - ` },
        committedVersionId: { not: null },
      },
      include: {
        versions: {
          where: { lifecycleState: ArtifactStatus.COMMITTED },
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
    }),
  );

  return artifact?.versions[0] ?? null;
}

export async function getExternalStorySourcesForVersion(storyArtifactVersionId: string) {
  return withDbRetry(() =>
    db.externalStorySource.findMany({
      where: { storyArtifactVersionId },
      orderBy: [{ sourceTier: "asc" }, { title: "asc" }],
    }),
  );
}

export async function getExternalStoriesForVersion(storyArtifactVersionId: string) {
  return withDbRetry(() =>
    db.externalStoryItem.findMany({
      where: { storyArtifactVersionId },
      orderBy: [{ storyType: "asc" }, { createdAt: "asc" }],
    }),
  );
}

export async function getExternalStoryVerificationsForChapter(bookId: string, chapterKey: string) {
  return withDbRetry(() =>
    db.externalStoryVerification.findMany({
      where: { bookId, chapterKey },
      orderBy: { createdAt: "asc" },
    }),
  );
}

export async function createExternalStoryPackVersion(input: CreateExternalStoryPackVersionInput) {
  const stage = await getStageForBook(input.bookId, StageKey.EXTERNAL_STORIES);
  if (!stage) {
    throw new Error(`External Stories stage not found for book ${input.bookId}`);
  }

  return db.$transaction(async (tx) => {
    const dossier = sanitizeUnknown(input.dossier);
    const sources = sanitizeUnknown(input.sources);
    const stories = sanitizeUnknown(input.stories);
    const verifications = sanitizeUnknown(input.verifications);
    const title = getArtifactTitle(input.chapterKey, input.chapterTitle);
    const artifact =
      (await tx.artifact.findFirst({
        where: {
          bookId: input.bookId,
          stageId: stage.id,
          artifactType: ArtifactType.EXTERNAL_STORY_PACK,
          title,
        },
      })) ??
      (await tx.artifact.create({
        data: {
          bookId: input.bookId,
          stageId: stage.id,
        artifactType: ArtifactType.EXTERNAL_STORY_PACK,
        title,
          summary: input.summary ? stripNullChars(input.summary) : undefined,
          status: ArtifactStatus.DRAFT,
          metadataJson: {
            chapterKey: input.chapterKey,
            chapterTitle: input.chapterTitle,
          },
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
        contentJson: dossier as Prisma.InputJsonValue,
        contentText: stripNullChars(JSON.stringify(dossier, null, 2)),
        summary: stripNullChars(input.summary ?? dossier.storyGoal),
        createdByType: input.createdByType ?? ActorType.SYSTEM,
        createdByUserId: input.createdByUserId,
        workflowRunId: input.workflowRunId,
        promptTemplateVersion: input.promptTemplateVersion
          ? stripNullChars(input.promptTemplateVersion)
          : undefined,
        modelName: input.modelName ? stripNullChars(input.modelName) : undefined,
      },
    });

    const sourceMap = new Map<string, string>();
    for (const source of sources) {
      const created = await tx.externalStorySource.create({
        data: {
          bookId: input.bookId,
          stageId: stage.id,
          storyArtifactVersionId: version.id,
          chapterKey: input.chapterKey,
          url: stripNullChars(source.url),
          canonicalUrl: source.canonicalUrl ? stripNullChars(source.canonicalUrl) : undefined,
          title: stripNullChars(source.title),
          publisher: source.publisher ? stripNullChars(source.publisher) : undefined,
          author: source.author ? stripNullChars(source.author) : undefined,
          publishedAt: source.publishedAt ? new Date(source.publishedAt) : undefined,
          accessedAt: source.accessedAt ? new Date(source.accessedAt) : undefined,
          contentType: source.contentType ? stripNullChars(source.contentType) : undefined,
          sourceTier: source.sourceTier as StorySourceTier,
          tierWeight: new Prisma.Decimal(source.tierWeight.toFixed(2)),
          isVerified: source.isVerified,
          verificationStatus: source.verificationStatus as StoryVerificationStatus,
          verificationNotes: source.verificationNotes
            ? stripNullChars(source.verificationNotes)
            : undefined,
          snapshotPath: source.snapshotPath ? stripNullChars(source.snapshotPath) : undefined,
          extractedTextPath: source.extractedTextPath
            ? stripNullChars(source.extractedTextPath)
            : undefined,
          metadataJson: toJsonValue(source.metadata),
        },
      });
      sourceMap.set(source.id, created.id);
    }

    const storyMap = new Map<string, string>();
    for (const story of stories) {
      const sourceRecordId = sourceMap.get(story.sourceId);
      if (!sourceRecordId) {
        continue;
      }

      const created = await tx.externalStoryItem.create({
        data: {
          bookId: input.bookId,
          stageId: stage.id,
          storyArtifactVersionId: version.id,
          sourceRecordId,
          chapterKey: input.chapterKey,
          title: stripNullChars(story.title),
          summary: stripNullChars(story.summary),
          whyItMatters: stripNullChars(story.whyItMatters),
          emotionalRole: stripNullChars(story.emotionalRole),
          storyType: story.storyType as ExternalStoryType,
          storyFit: story.storyFit as ExternalStoryFit,
          leadershipTheme: story.leadershipTheme ? stripNullChars(story.leadershipTheme) : undefined,
          sourceTier: story.sourceTier as StorySourceTier,
          tierWeight: new Prisma.Decimal(story.tierWeight.toFixed(2)),
          verificationStatus: story.verificationStatus as StoryVerificationStatus,
          mappedSectionId: story.mappedSectionId ?? undefined,
          mappedChapterId: story.mappedChapterId ?? undefined,
          metadataJson: toJsonValue(story.metadata),
        },
      });
      storyMap.set(story.id, created.id);
    }

    if (verifications.length > 0) {
      await tx.externalStoryVerification.createMany({
        data: verifications.map((verification) => ({
          bookId: input.bookId,
          stageId: stage.id,
          chapterKey: input.chapterKey,
          sourceRecordId: verification.sourceRecordId
            ? sourceMap.get(verification.sourceRecordId) ?? undefined
            : undefined,
          externalStoryId: verification.externalStoryId
            ? storyMap.get(verification.externalStoryId) ?? undefined
            : undefined,
          verifierType: verification.verifierType as StoryVerifierType,
          status: verification.status as StoryVerificationStatus,
          titleMatch: verification.titleMatch ?? undefined,
          contentMatch: verification.contentMatch ?? undefined,
          claimSupported: verification.claimSupported ?? undefined,
          secondSourceRequired: verification.secondSourceRequired,
          secondSourceConfirmed: verification.secondSourceConfirmed,
          notes: verification.notes ? stripNullChars(verification.notes) : undefined,
          metadataJson: toJsonValue(verification.metadata),
        })),
      });
    }

    await tx.artifact.update({
      where: { id: artifact.id },
      data: {
        currentVersionId: version.id,
        summary: input.summary ? stripNullChars(input.summary) : artifact.summary,
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
  }, {
    maxWait: 10000,
    timeout: 120000,
  });
}

export async function commitExternalStoryPack(bookId: string, chapterKey: string) {
  const stage = await getStageForBook(bookId, StageKey.EXTERNAL_STORIES);
  if (!stage) {
    throw new Error(`External Stories stage not found for book ${bookId}`);
  }

  const defaultUser = await ensureDefaultLocalUser();

  return db.$transaction(async (tx) => {
    const artifact = await tx.artifact.findFirst({
      where: {
        bookId,
        stageId: stage.id,
        artifactType: ArtifactType.EXTERNAL_STORY_PACK,
        title: { startsWith: `External Stories: ${chapterKey} - ` },
        currentVersionId: { not: null },
      },
    });

    if (!artifact?.currentVersionId) {
      throw new Error(`No external story pack version available to commit for ${chapterKey}`);
    }

    await tx.artifactVersion.update({
      where: { id: artifact.currentVersionId },
      data: { lifecycleState: ArtifactStatus.COMMITTED, committedAt: new Date() },
    });

    await tx.artifact.update({
      where: { id: artifact.id },
      data: { committedVersionId: artifact.currentVersionId, status: ArtifactStatus.COMMITTED },
    });

    await tx.decision.create({
      data: {
        bookId,
        stageId: stage.id,
        artifactId: artifact.id,
        decisionType: DecisionType.COMMIT,
        decisionValue: `external_story_pack_committed:${chapterKey}`,
        createdByUserId: defaultUser.id,
      },
    });

    return true;
  });
}
