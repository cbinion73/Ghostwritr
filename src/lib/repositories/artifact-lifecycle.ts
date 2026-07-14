import { ArtifactType, Prisma, PrismaClient } from "@prisma/client";
import { supersedeArtifactHistoryInTransaction } from "./artifact-transaction-service";

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
 * Call immediately after marking one ArtifactVersion COMMITTED. Preserves
 * history while marking every other version of the same Artifact and every
 * other Artifact row representing the same logical item as SUPERSEDED.
 *
 * The function name is legacy from the pre-4.2 implementation. It no longer
 * deletes rows; it preserves the audit trail and removes losing candidates
 * from live selection by status/lifecycle state.
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
  return supersedeArtifactHistoryInTransaction(tx, params);
}
