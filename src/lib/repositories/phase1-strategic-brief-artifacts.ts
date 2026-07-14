import { ActorType, ArtifactStatus, ArtifactType, StageKey } from "@prisma/client";

import type { Phase1StrategicBrief } from "../phase1-strategic-brief";
import { db } from "../db";
import { getStageForBook } from "./books";
import {
  commitArtifactVersionInTransaction,
  createArtifactVersionInTransaction,
  supersedeArtifactHistoryInTransaction,
} from "./artifact-transaction-service";

export async function getCommittedPhase1StrategicBrief(bookId: string) {
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.PHASE1_STRATEGIC_BRIEF,
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

export async function createCommittedPhase1StrategicBrief(input: {
  bookId: string;
  brief: Phase1StrategicBrief;
}) {
  const stage = await getStageForBook(input.bookId, StageKey.PROMISE);
  if (!stage) {
    throw new Error(`Promise stage not found for book ${input.bookId}`);
  }

  return db.$transaction(async (tx) => {
    const artifact =
      (await tx.artifact.findFirst({
        where: {
          bookId: input.bookId,
          stageId: stage.id,
          artifactType: ArtifactType.PHASE1_STRATEGIC_BRIEF,
        },
      })) ??
      (await tx.artifact.create({
        data: {
          bookId: input.bookId,
          stageId: stage.id,
          artifactType: ArtifactType.PHASE1_STRATEGIC_BRIEF,
          title: "Approved Phase 1 Strategic Brief",
          status: ArtifactStatus.DRAFT,
          summary: input.brief.promise.statement,
        },
      }));

    const version = await createArtifactVersionInTransaction(tx, {
      artifactId: artifact.id,
      lifecycleState: ArtifactStatus.REVIEW_READY,
      contentJson: input.brief,
      contentText: JSON.stringify(input.brief, null, 2),
      summary: input.brief.promise.statement,
      createdByType: ActorType.SYSTEM,
      artifactStatus: ArtifactStatus.REVIEW_READY,
      title: "Approved Phase 1 Strategic Brief",
    });

    await commitArtifactVersionInTransaction(tx, {
      artifactId: artifact.id,
      versionId: version.id,
    });

    await supersedeArtifactHistoryInTransaction(tx, {
      bookId: input.bookId,
      stageId: stage.id,
      artifactType: ArtifactType.PHASE1_STRATEGIC_BRIEF,
      keepArtifactId: artifact.id,
      keepVersionId: version.id,
    });

    return version;
  });
}
