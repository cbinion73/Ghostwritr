import { ArtifactType, Prisma } from "@prisma/client";

export const CHAPTER_SCOPED_ARTIFACT_TYPES = new Set<ArtifactType>([
  ArtifactType.CHAPTER_PARAGRAPH_PLAN,
  ArtifactType.RESEARCH_PACK,
  ArtifactType.EXTERNAL_STORY_PACK,
  ArtifactType.PERSONAL_STORY_CHAT,
  ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
  ArtifactType.CHAPTER_DRAFT,
  ArtifactType.FICTION_DRAFT_MANUSCRIPT,
  ArtifactType.MANUSCRIPT_REVISION,
]);

export function isChapterScopedArtifactType(artifactType: ArtifactType) {
  return CHAPTER_SCOPED_ARTIFACT_TYPES.has(artifactType);
}

export function normalizeChapterId(chapterId: string | null | undefined) {
  const normalized = chapterId?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function getChapterIdFromMetadata(metadataJson: unknown) {
  if (!metadataJson || typeof metadataJson !== "object" || Array.isArray(metadataJson)) {
    return null;
  }
  const metadata = metadataJson as Record<string, unknown>;
  return normalizeChapterId(
    typeof metadata.chapterId === "string"
      ? metadata.chapterId
      : typeof metadata.chapterKey === "string"
        ? metadata.chapterKey
        : null,
  );
}

export function getArtifactChapterId(input: {
  chapterId?: string | null;
  metadataJson?: unknown;
}) {
  return normalizeChapterId(input.chapterId) ?? getChapterIdFromMetadata(input.metadataJson);
}

export function chapterIdentityMetadata(
  chapterId: string,
  extra: Record<string, unknown> = {},
): Prisma.InputJsonValue {
  return {
    ...extra,
    chapterId,
    // Keep chapterKey during the migration window because several UI and
    // workflow seams still read that legacy metadata name.
    chapterKey: chapterId,
  };
}

export function chapterIdentityWhere(chapterId: string): Prisma.ArtifactWhereInput {
  return {
    OR: [
      { chapterId },
      { metadataJson: { path: ["chapterId"], equals: chapterId } },
      { metadataJson: { path: ["chapterKey"], equals: chapterId } },
    ],
  };
}

export function chapterIdentityCreateData(chapterId: string) {
  return { chapterId };
}
