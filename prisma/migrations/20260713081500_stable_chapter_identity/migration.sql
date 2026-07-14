-- Add a first-class, title-independent chapter identity for chapter-scoped artifacts.
ALTER TABLE "Artifact" ADD COLUMN "chapterId" TEXT;

-- Backfill one canonical artifact per existing metadata-based chapter group.
-- Duplicate legacy artifacts are intentionally left NULL so this migration can
-- be applied safely before Package 4.2's artifact lifecycle cleanup.
WITH candidates AS (
  SELECT
    "id",
    COALESCE("metadataJson"->>'chapterId', "metadataJson"->>'chapterKey') AS "candidateChapterId",
    ROW_NUMBER() OVER (
      PARTITION BY
        "bookId",
        "stageId",
        "artifactType",
        COALESCE("metadataJson"->>'chapterId', "metadataJson"->>'chapterKey')
      ORDER BY
        CASE WHEN "committedVersionId" IS NOT NULL THEN 0 ELSE 1 END,
        "updatedAt" DESC,
        "createdAt" DESC
    ) AS "rank"
  FROM "Artifact"
  WHERE COALESCE("metadataJson"->>'chapterId', "metadataJson"->>'chapterKey') IS NOT NULL
    AND COALESCE("metadataJson"->>'chapterId', "metadataJson"->>'chapterKey') <> ''
)
UPDATE "Artifact" AS artifact
SET "chapterId" = candidates."candidateChapterId"
FROM candidates
WHERE artifact."id" = candidates."id"
  AND candidates."rank" = 1;

CREATE INDEX "Artifact_book_stage_type_chapterId_idx"
  ON "Artifact"("bookId", "stageId", "artifactType", "chapterId");

CREATE UNIQUE INDEX "Artifact_book_stage_type_chapterId_unique"
  ON "Artifact"("bookId", "stageId", "artifactType", "chapterId")
  WHERE "chapterId" IS NOT NULL;
