import { ArtifactType, ResearchItemType } from "@prisma/client";

import { db } from "../db";
import type {
  ChapterResearchDossier,
  ChapterResearchItem,
  ChapterResearchSource,
} from "../research-types";
import type {
  ChapterExternalStoryDossier,
  ChapterExternalStoryItem,
  ChapterExternalStorySource,
} from "../external-story-types";
import { chapterIdentityWhere } from "./chapter-identity";

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function canonicalPersistedArtifactId(
  value: unknown,
  key: "artifactRecordId" | "artifactSourceId",
  fallback: string,
) {
  const candidate = metadataObject(value)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : fallback;
}

/**
 * Assemble a ChapterResearchDossier / ChapterExternalStoryDossier from the
 * structured ResearchItem/ExternalStoryItem tables.
 *
 * This is the bridge that finally connects the conversational-agent era
 * (dossiers saved as markdown text, structured rows written by the
 * background extraction pass) to the chapter-draft author pipeline, which
 * consumes the typed dossier shape. Without it, blob-era research never
 * reaches the author model at all.
 */

async function getLatestPackVersionId(
  bookId: string,
  chapterKey: string,
  artifactType: ArtifactType,
) {
  // Prefer the committed version; fall back to the latest saved one.
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType,
      ...chapterIdentityWhere(chapterKey),
    },
    orderBy: { createdAt: "desc" },
    select: {
      committedVersionId: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  return artifact?.committedVersionId ?? artifact?.versions[0]?.id ?? null;
}

export async function buildResearchDossierFromStructuredRows(
  bookId: string,
  chapterKey: string,
  chapterTitle: string,
): Promise<ChapterResearchDossier | null> {
  const versionId = await getLatestPackVersionId(bookId, chapterKey, ArtifactType.RESEARCH_PACK);
  if (!versionId) return null;

  const [items, sources] = await Promise.all([
    db.researchItem.findMany({ where: { researchArtifactVersionId: versionId } }),
    db.researchSource.findMany({ where: { researchArtifactVersionId: versionId } }),
  ]);
  if (items.length === 0) return null;

  const toItem = (row: (typeof items)[number]): ChapterResearchItem => ({
    id: canonicalPersistedArtifactId(row.metadataJson, "artifactRecordId", row.id),
    itemType: row.itemType,
    claimText: row.claimText,
    evidenceExcerpt: row.evidenceExcerpt,
    summary: row.summary,
    sourceId: canonicalPersistedArtifactId(
      sources.find((source) => source.id === row.sourceRecordId)?.metadataJson,
      "artifactSourceId",
      row.sourceRecordId,
    ),
    sourceTier: row.sourceTier,
    tierWeight: Number(row.tierWeight),
    verificationStatus: row.verificationStatus,
    metadata: metadataObject(row.metadataJson),
  });

  const byType = (type: ResearchItemType) =>
    items.filter((row) => row.itemType === type).map(toItem);

  const sourceRegister: ChapterResearchSource[] = sources.map((row) => ({
    id: canonicalPersistedArtifactId(row.metadataJson, "artifactSourceId", row.id),
    url: row.url,
    title: row.title,
    publisher: row.publisher,
    author: row.author,
    sourceTier: row.sourceTier,
    tierWeight: Number(row.tierWeight),
    isVerified: row.isVerified,
    verificationStatus: row.verificationStatus,
  }));

  const verifiedItems = items.filter((row) => row.verificationStatus === "VERIFIED").length;

  return {
    chapterKey,
    chapterTitle,
    chapterDescription: "",
    researchGoal: `Verified research base for ${chapterTitle}`,
    researchQuestions: [],
    factBank: byType("FACT"),
    statistics: byType("STATISTIC"),
    quotes: byType("QUOTE"),
    examples: [...byType("EXAMPLE"), ...byType("CASE_STUDY")],
    counterpoints: byType("COUNTERPOINT"),
    definitions: byType("DEFINITION"),
    gaps: [],
    sourceRegister,
    verificationSummary: {
      totalSources: sources.length,
      verifiedSources: sources.filter((row) => row.isVerified).length,
      totalItems: items.length,
      verifiedItems,
      rejectedItems: items.filter((row) => row.verificationStatus === "REJECTED").length,
      needsCorroborationItems: items.filter(
        (row) => row.verificationStatus === "NEEDS_CORROBORATION",
      ).length,
    },
  };
}

export async function buildExternalStoryDossierFromStructuredRows(
  bookId: string,
  chapterKey: string,
  chapterTitle: string,
): Promise<ChapterExternalStoryDossier | null> {
  const versionId = await getLatestPackVersionId(
    bookId,
    chapterKey,
    ArtifactType.EXTERNAL_STORY_PACK,
  );
  if (!versionId) return null;

  const [items, sources] = await Promise.all([
    db.externalStoryItem.findMany({ where: { storyArtifactVersionId: versionId } }),
    db.externalStorySource.findMany({ where: { storyArtifactVersionId: versionId } }),
  ]);
  if (items.length === 0) return null;

  const storyCandidates: ChapterExternalStoryItem[] = items.map((row) => ({
    id: canonicalPersistedArtifactId(row.metadataJson, "artifactRecordId", row.id),
    sourceId: canonicalPersistedArtifactId(
      sources.find((source) => source.id === row.sourceRecordId)?.metadataJson,
      "artifactSourceId",
      row.sourceRecordId,
    ),
    title: row.title,
    summary: row.summary,
    whyItMatters: row.whyItMatters,
    emotionalRole: row.emotionalRole,
    storyType: row.storyType,
    storyFit: row.storyFit,
    leadershipTheme: row.leadershipTheme,
    sourceTier: row.sourceTier,
    tierWeight: Number(row.tierWeight),
    verificationStatus: row.verificationStatus,
    metadata: metadataObject(row.metadataJson),
  }));

  const sourceRegister: ChapterExternalStorySource[] = sources.map((row) => ({
    id: canonicalPersistedArtifactId(row.metadataJson, "artifactSourceId", row.id),
    url: row.url,
    title: row.title,
    publisher: row.publisher,
    sourceTier: row.sourceTier,
    tierWeight: Number(row.tierWeight),
    isVerified: row.isVerified,
    verificationStatus: row.verificationStatus,
  }));

  return {
    chapterKey,
    chapterTitle,
    chapterDescription: "",
    storyGoal: `Story bank for ${chapterTitle}`,
    storyCandidates,
    sourceRegister,
    storyTypesCovered: Array.from(new Set(storyCandidates.map((story) => story.storyType))),
    storyFitsCovered: Array.from(new Set(storyCandidates.map((story) => story.storyFit))),
    verificationSummary: {
      totalSources: sources.length,
      verifiedSources: sources.filter((row) => row.isVerified).length,
      totalStories: items.length,
      verifiedStories: items.filter((row) => row.verificationStatus === "VERIFIED").length,
      rejectedStories: items.filter((row) => row.verificationStatus === "REJECTED").length,
      needsCorroborationStories: items.filter(
        (row) => row.verificationStatus === "PENDING",
      ).length,
    },
  };
}
