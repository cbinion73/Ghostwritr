import { ArtifactType, Prisma, PrismaClient } from "@prisma/client";

type TxOrClient = PrismaClient | Prisma.TransactionClient;

// Known hardcoded fallback openers from chapter-draft.ts's fallbackDraft() —
// used whenever the real author call fails, so real Opus prose never
// legitimately starts with these.
const KNOWN_FALLBACK_OPENERS = [
  "In laboratories, change rarely announces itself as a sweeping transformation.",
  "Laboratory leaders do not struggle because they lack commitment.",
];

/**
 * Detects content that should never win a "most recently updated" pick among
 * duplicate chapter artifacts: a raw API error blob saved as content (found
 * live in production — a failed generation's error response committed as if
 * it were the chapter), the deterministic fallback template's known opening
 * lines, or a bare planning/prompt document instead of prose. Recency alone
 * is not a reliable signal for which duplicate is "the real one" — a later
 * timestamp often just means a regeneration attempt that failed and produced
 * garbage, not a better draft.
 */
export function isLikelyGarbageChapterContent(text: string | null | undefined): boolean {
  if (!text || text.trim().length === 0) return true;
  const trimmed = text.trim();

  if (trimmed.startsWith("⚠")) return true;
  if (/"type"\s*:\s*"(error|overloaded_error|invalid_request_error)"/.test(trimmed)) return true;
  if (KNOWN_FALLBACK_OPENERS.some((opener) => trimmed.startsWith(opener))) return true;
  if (/^\*\*[\w\s]+'?s?\s*Pre-Draft Plan\*\*/i.test(trimmed)) return true;

  return false;
}

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
