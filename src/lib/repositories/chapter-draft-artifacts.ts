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
import { isLikelyGarbageChapterContent, pruneToSingleCommittedArtifact } from "./artifact-lifecycle";
import { chapterIdentityMetadata, chapterIdentityWhere } from "./chapter-identity";
import { markDraftApproved, markDraftPending } from "./chapter-approval-state";

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
  // path. commitChapterDraft prunes any duplicate Artifact row for the same
  // chapterKey down to the one it commits (see artifact-lifecycle.ts), so in
  // steady state there's only ever one row here — updatedAt-desc ordering is
  // just a tiebreaker for the window between two saves and the next commit.
  const candidates = await db.artifact.findMany({
    where: {
      bookId,
      artifactType,
      ...chapterIdentityWhere(chapterKey),
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

  // Pre-fix production data can still have more than one committed artifact
  // for the same chapter until it's re-committed — skip any whose latest
  // version looks like an API error or the deterministic fallback opener
  // before falling back to pure recency.
  const artifact =
    candidates.find((c) => !isLikelyGarbageChapterContent(c.versions[0]?.contentText)) ?? candidates[0];

  return artifact?.versions ?? [];
}

export async function getCommittedChapterDraft(bookId: string, chapterKey: string) {
  // See getChapterArtifactVersions above — match by metadataJson.chapterKey,
  // not title prefix, for the same reason.
  const candidates = await db.artifact.findMany({
    where: {
      bookId,
      artifactType: ArtifactType.CHAPTER_DRAFT,
      ...chapterIdentityWhere(chapterKey),
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

  const artifact =
    candidates.find((c) => !isLikelyGarbageChapterContent(c.versions[0]?.contentText)) ?? candidates[0];

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
        ...chapterIdentityWhere(input.chapterKey),
      },
    })) ??
    (await db.artifact.create({
      data: {
        bookId: input.bookId,
        stageId: stage.id,
        artifactType: input.artifactType,
        chapterId: input.chapterKey,
        title,
        summary: input.summary,
        status: ArtifactStatus.DRAFT,
        metadataJson: chapterIdentityMetadata(input.chapterKey, {
          chapterTitle: input.chapterTitle,
        }),
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
    await markDraftPending({
      bookId: input.bookId,
      chapterId: input.chapterKey,
      versionId: version.id,
    });

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
    // the one that wins when a chapter has more than one Artifact row —
    // except recency alone isn't safe: a failed regeneration attempt can be
    // "more recent" than a real draft and save an API error or the
    // deterministic fallback as if it were the chapter, so skip any
    // candidate whose latest version looks like that before picking a
    // winner by timestamp.
    const candidates = await tx.artifact.findMany({
      where: {
        bookId,
        stageId: stage.id,
        artifactType: ArtifactType.CHAPTER_DRAFT,
        ...chapterIdentityWhere(chapterKey),
        currentVersionId: { not: null },
        status: { not: ArtifactStatus.SUPERSEDED },
      },
      orderBy: { updatedAt: "desc" },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });

    const artifact =
      candidates.find((c) => !isLikelyGarbageChapterContent(c.versions[0]?.contentText)) ?? candidates[0];
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
    await markDraftApproved({
      bookId,
      chapterId: chapterKey,
      versionId: artifact.currentVersionId,
      client: tx,
    });

    // Any other Artifact row for this same chapterKey is a duplicate from
    // the other write path — delete it now (and its earlier draft versions
    // on the winner) so exactly one committed draft remains.
    await pruneToSingleCommittedArtifact(tx, {
      bookId,
      stageId: stage.id,
      artifactType: ArtifactType.CHAPTER_DRAFT,
      keepArtifactId: artifact.id,
      keepVersionId: artifact.currentVersionId,
      chapterKey,
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
