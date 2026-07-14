import {
  ActorType,
  ArtifactStatus,
  ArtifactType,
  DecisionType,
  StageKey,
  StageStatus,
  type Prisma,
} from "@prisma/client";

import { db } from "../db";
import { ensureDefaultLocalUser } from "../users";
import { getStageForBook } from "./books";
import { pruneToSingleCommittedArtifact } from "./artifact-lifecycle";
import { chapterIdentityMetadata, chapterIdentityWhere } from "./chapter-identity";
import { markFinalRevisionPending } from "./chapter-approval-state";

type EditingArtifactType =
  | "EDITORIAL_ASSESSMENT"
  | "MANUSCRIPT_REVISION"
  | "MANUSCRIPT_ASSEMBLY"
  | "PUBLISHING_PACKAGE"
  | "PROVENANCE_REPORT"
  | "MARKETING_HANDOFF_PACKAGE";

type CreateEditingArtifactVersionInput = {
  bookId: string;
  artifactType: EditingArtifactType;
  title: string;
  summary: string;
  contentJson: Prisma.InputJsonValue;
  contentText?: string;
  promptTemplateVersion?: string;
  modelName?: string;
  workflowRunId?: string;
  preserveStageCommit?: boolean;
  /** MANUSCRIPT_REVISION only — every chapter used to share one Artifact
   * row, so a chapter's revision could get pushed out of any windowed
   * fetch once enough OTHER chapters were revised afterward (confirmed
   * live: 6 of 16 already-applied revisions became invisible this way).
   * Passing chapterKey gives each chapter its own Artifact instead. */
  chapterKey?: string | null;
};

function artifactLabel(type: EditingArtifactType) {
  switch (type) {
    case ArtifactType.EDITORIAL_ASSESSMENT:
      return "Editorial Assessment";
    case ArtifactType.MANUSCRIPT_REVISION:
      return "Manuscript Revision";
    case ArtifactType.MANUSCRIPT_ASSEMBLY:
      return "Full Manuscript Assembly";
    case ArtifactType.PROVENANCE_REPORT:
      return "Provenance Report";
    case ArtifactType.MARKETING_HANDOFF_PACKAGE:
      return "Marketing Handoff Package";
    default:
      return "Publishing Package";
  }
}

export async function getLatestEditingArtifactVersion(
  bookId: string,
  artifactType: EditingArtifactType,
) {
  const stage = await getStageForBook(bookId, StageKey.EDITING);
  if (!stage) {
    return null;
  }

  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      stageId: stage.id,
      artifactType,
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  return artifact?.versions[0] ?? null;
}

export async function getCurrentEditingArtifactVersionIdsForBooks(
  bookIds: string[],
  artifactTypes: EditingArtifactType[],
) {
  if (bookIds.length === 0 || artifactTypes.length === 0) {
    return new Map<string, Partial<Record<EditingArtifactType, string | null>>>();
  }

  const artifacts = await db.artifact.findMany({
    where: {
      bookId: { in: bookIds },
      artifactType: { in: artifactTypes },
      stage: {
        stageKey: StageKey.EDITING,
      },
    },
    select: {
      bookId: true,
      artifactType: true,
      currentVersionId: true,
    },
  });

  const byBook = new Map<string, Partial<Record<EditingArtifactType, string | null>>>();
  for (const artifact of artifacts) {
    const existing = byBook.get(artifact.bookId) ?? {};
    existing[artifact.artifactType as EditingArtifactType] = artifact.currentVersionId;
    byBook.set(artifact.bookId, existing);
  }

  return byBook;
}

/**
 * Every "Generate Revision" click for any chapter shares one MANUSCRIPT_REVISION
 * Artifact row and appends a new version — so looking a specific revision up
 * by scanning a `take`-limited window (as apply/reject used to) silently
 * fails once more than `take` revisions have been generated for the book,
 * even though the row is still right there. Fetch it directly instead.
 */
export async function getEditingArtifactVersionById(versionId: string) {
  return db.artifactVersion.findUnique({ where: { id: versionId } });
}

export async function getEditingArtifactVersions(
  bookId: string,
  artifactType: EditingArtifactType,
  take = 10,
) {
  const stage = await getStageForBook(bookId, StageKey.EDITING);
  if (!stage) {
    return [];
  }

  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      stageId: stage.id,
      artifactType,
    },
  });

  if (!artifact) {
    return [];
  }

  return db.artifactVersion.findMany({
    where: { artifactId: artifact.id },
    orderBy: { versionNumber: "desc" },
    take,
  });
}

export async function createEditingArtifactVersion(input: CreateEditingArtifactVersionInput) {
  const stage = await getStageForBook(input.bookId, StageKey.EDITING);
  if (!stage) {
    throw new Error(`Editing stage not found for book ${input.bookId}`);
  }

  const artifact =
    (await db.artifact.findFirst({
      where: {
        bookId: input.bookId,
        stageId: stage.id,
        artifactType: input.artifactType,
        ...(input.chapterKey
          ? chapterIdentityWhere(input.chapterKey)
          : {}),
      },
    })) ??
    (await db.artifact.create({
      data: {
        bookId: input.bookId,
        stageId: stage.id,
        artifactType: input.artifactType,
        ...(input.chapterKey ? { chapterId: input.chapterKey } : {}),
        title: artifactLabel(input.artifactType),
        summary: input.summary,
        status: ArtifactStatus.DRAFT,
        ...(input.chapterKey ? { metadataJson: chapterIdentityMetadata(input.chapterKey) } : {}),
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
      summary: input.summary,
      contentJson: input.contentJson,
      contentText: input.contentText,
      promptTemplateVersion: input.promptTemplateVersion,
      modelName: input.modelName,
      workflowRunId: input.workflowRunId,
      createdByType: ActorType.SYSTEM,
    },
  });

  await db.artifact.update({
    where: { id: artifact.id },
    data: {
      currentVersionId: version.id,
      status: ArtifactStatus.DRAFT,
      summary: input.summary,
      title: input.title,
    },
  });

  await db.bookStage.update({
    where: { id: stage.id },
    data: {
      status:
        input.preserveStageCommit && stage.status === StageStatus.COMMITTED
          ? StageStatus.COMMITTED
          : StageStatus.READY_FOR_REVIEW,
      activeArtifactVersionId: version.id,
      committedAt:
        input.preserveStageCommit && stage.status === StageStatus.COMMITTED
          ? stage.committedAt
          : stage.committedAt,
    },
  });
  if (input.artifactType === ArtifactType.MANUSCRIPT_REVISION && input.chapterKey) {
    await markFinalRevisionPending({
      bookId: input.bookId,
      chapterId: input.chapterKey,
      versionId: version.id,
    });
  }

  return version;
}

export async function commitEditingArtifact(
  bookId: string,
  artifactType: EditingArtifactType,
) {
  const stage = await getStageForBook(bookId, StageKey.EDITING);
  if (!stage) {
    throw new Error(`Editing stage not found for book ${bookId}`);
  }

  const defaultUser = await ensureDefaultLocalUser();

  return db.$transaction(async (tx) => {
    const artifact = await tx.artifact.findFirst({
      where: {
        bookId,
        stageId: stage.id,
        artifactType,
        currentVersionId: { not: null },
      },
    });

    if (!artifact?.currentVersionId) {
      throw new Error(`No ${artifactLabel(artifactType).toLowerCase()} is available to commit.`);
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

    // Every type this is actually called with (PROVENANCE_REPORT,
    // MARKETING_HANDOFF_PACKAGE, MANUSCRIPT_ASSEMBLY, PUBLISHING_PACKAGE) is
    // one-per-book — safe to prune without a chapterKey. MANUSCRIPT_REVISION
    // is intentionally multi-instance (one per pending chapter revision) and
    // is committed through its own dedicated route, never through here.
    await pruneToSingleCommittedArtifact(tx, {
      bookId,
      stageId: stage.id,
      artifactType,
      keepArtifactId: artifact.id,
      keepVersionId: artifact.currentVersionId,
    });

    await tx.bookStage.update({
      where: { id: stage.id },
      data: {
        status: stage.status === StageStatus.COMMITTED ? StageStatus.COMMITTED : StageStatus.READY_FOR_REVIEW,
        committedAt:
          stage.status === StageStatus.COMMITTED ? stage.committedAt ?? new Date() : stage.committedAt,
        activeArtifactVersionId: artifact.currentVersionId,
        committedArtifactVersionId:
          stage.status === StageStatus.COMMITTED ? artifact.currentVersionId : stage.committedArtifactVersionId,
      },
    });

    await tx.decision.create({
      data: {
        bookId,
        stageId: stage.id,
        artifactId: artifact.id,
        decisionType: DecisionType.COMMIT,
        decisionValue: `${artifactType.toLowerCase()}_committed`,
        createdByUserId: defaultUser.id,
      },
    });

    return true;
  });
}
