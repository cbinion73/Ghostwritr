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
      // A chapter can briefly have more than one Artifact row (the plain
      // agent-chat save path and the structured author path don't share one)
      // until commitChapterDraft supersedes the losers. Excluding SUPERSEDED
      // here means a stale duplicate can never win this lookup again just
      // because it happens to have a later updatedAt.
      status: { not: ArtifactStatus.SUPERSEDED },
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
  // not title prefix, for the same reason, and exclude SUPERSEDED duplicates.
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.CHAPTER_DRAFT,
      metadataJson: { path: ["chapterKey"], equals: chapterKey },
      stage: {
        stageKey: StageKey.CHAPTER_DRAFT,
      },
      committedVersionId: { not: null },
      status: { not: ArtifactStatus.SUPERSEDED },
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

/**
 * A chapterKey can end up with more than one Artifact row (plain agent-chat
 * saves and the structured author/regenerate path each find-or-create by a
 * different title, so they never see each other). Call this after committing
 * whichever one wins so exactly one COMMITTED artifact remains per chapter —
 * the rest are marked SUPERSEDED rather than deleted, so history/versions
 * are still inspectable if something needs to be recovered.
 */
async function supersedeDuplicateChapterArtifacts(
  tx: Prisma.TransactionClient,
  bookId: string,
  chapterKey: string,
  artifactType: ArtifactType,
  keepArtifactId: string,
) {
  const duplicates = await tx.artifact.findMany({
    where: {
      bookId,
      artifactType,
      metadataJson: { path: ["chapterKey"], equals: chapterKey },
      id: { not: keepArtifactId },
      status: { not: ArtifactStatus.SUPERSEDED },
    },
    select: { id: true },
  });

  for (const duplicate of duplicates) {
    await tx.artifactVersion.updateMany({
      where: { artifactId: duplicate.id, lifecycleState: { not: ArtifactStatus.SUPERSEDED } },
      data: { lifecycleState: ArtifactStatus.SUPERSEDED },
    });
    await tx.artifact.update({
      where: { id: duplicate.id },
      data: { status: ArtifactStatus.SUPERSEDED },
    });
  }

  return duplicates.length;
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
    // Match by metadataJson.chapterKey, not title prefix — the plain
    // agent-chat chapter-draft save path writes a bare title, so a title
    // match here would silently miss any chapter last saved through that
    // path. Order by updatedAt desc so the most recently written draft is
    // the one that wins when a chapter has more than one Artifact row.
    const candidates = await tx.artifact.findMany({
      where: {
        bookId,
        stageId: stage.id,
        artifactType: ArtifactType.CHAPTER_DRAFT,
        metadataJson: { path: ["chapterKey"], equals: chapterKey },
        currentVersionId: { not: null },
        status: { not: ArtifactStatus.SUPERSEDED },
      },
      orderBy: { updatedAt: "desc" },
    });

    const artifact = candidates[0];
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

    // Any other Artifact row for this same chapterKey is a duplicate from
    // the other write path — supersede it now so exactly one committed
    // draft remains and future lookups can't pick it back up.
    await supersedeDuplicateChapterArtifacts(tx, bookId, chapterKey, ArtifactType.CHAPTER_DRAFT, artifact.id);

    const totalDraftArtifacts = await tx.artifact.count({
      where: {
        bookId,
        stageId: stage.id,
        artifactType: ArtifactType.CHAPTER_DRAFT,
        status: { not: ArtifactStatus.SUPERSEDED },
      },
    });
    const committedDraftArtifacts = await tx.artifact.count({
      where: {
        bookId,
        stageId: stage.id,
        artifactType: ArtifactType.CHAPTER_DRAFT,
        committedVersionId: { not: null },
        status: { not: ArtifactStatus.SUPERSEDED },
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
