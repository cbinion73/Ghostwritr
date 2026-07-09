import { ArtifactType, Prisma, PrismaClient } from "@prisma/client";

type TxOrClient = PrismaClient | Prisma.TransactionClient;

/**
 * Call immediately after marking one ArtifactVersion COMMITTED. Deletes
 * every other version of the same Artifact (earlier drafts that lost) and
 * every OTHER Artifact row representing the same logical item — same
 * bookId + stageId + artifactType, and same metadataJson.chapterKey when
 * the type is chapter/item-scoped — including all of that row's versions.
 *
 * "Only committed persists" is a hard project rule, not a soft archive:
 * duplicates come from separate write paths (a plain agent-chat save vs. a
 * structured author/regenerate path) that each find-or-create by a
 * different key and never see each other's row, so without this a stale
 * draft can sit there fully committed and race a real one for which
 * content downstream code reads. Deletion (not a SUPERSEDED status) is
 * deliberate: nothing but the single committed version should remain in
 * the database.
 */
export async function pruneToSingleCommittedArtifact(
  tx: TxOrClient,
  params: {
    bookId: string;
    stageId: string;
    artifactType: ArtifactType;
    keepArtifactId: string;
    keepVersionId: string;
    /** Pass for chapter/item-scoped artifact types (Research, External
     * Stories, Chapter Draft, etc.); omit for one-per-book artifact types. */
    chapterKey?: string | null;
    /** metadataJson field name to match chapterKey against — defaults to
     * "chapterKey". Chapter Paragraph Plan uses "chapterId" instead. */
    chapterKeyField?: string;
  },
) {
  const { bookId, stageId, artifactType, keepArtifactId, keepVersionId, chapterKey, chapterKeyField = "chapterKey" } = params;

  // 1. Delete every other version of the artifact that just got committed —
  // earlier drafts/review-ready attempts that lost the commit.
  await tx.artifactVersion.deleteMany({
    where: { artifactId: keepArtifactId, id: { not: keepVersionId } },
  });

  // 2. Find any OTHER Artifact row for the same logical item.
  const duplicates = await tx.artifact.findMany({
    where: {
      bookId,
      stageId,
      artifactType,
      id: { not: keepArtifactId },
      ...(chapterKey
        ? { metadataJson: { path: [chapterKeyField], equals: chapterKey } }
        : {}),
    },
    select: { id: true },
  });

  if (duplicates.length === 0) {
    return 0;
  }

  const duplicateIds = duplicates.map((d) => d.id);
  const duplicateVersionIds = (
    await tx.artifactVersion.findMany({
      where: { artifactId: { in: duplicateIds } },
      select: { id: true },
    })
  ).map((v) => v.id);

  // BookStage.activeArtifactVersionId/committedArtifactVersionId are plain
  // UUID columns with no DB-level FK, so deleting the artifact wouldn't be
  // blocked either way — but clear them first so nothing is left pointing
  // at a row that's about to disappear.
  if (duplicateVersionIds.length > 0) {
    await tx.bookStage.updateMany({
      where: { committedArtifactVersionId: { in: duplicateVersionIds } },
      data: { committedArtifactVersionId: null },
    });
    await tx.bookStage.updateMany({
      where: { activeArtifactVersionId: { in: duplicateVersionIds } },
      data: { activeArtifactVersionId: null },
    });
  }

  // ArtifactVersion.artifact and Decision.artifact both cascade/SetNull on
  // delete, so deleting the Artifact rows is sufficient to clean up.
  await tx.artifact.deleteMany({ where: { id: { in: duplicateIds } } });

  return duplicates.length;
}
