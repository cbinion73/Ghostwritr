import { ArtifactStatus, StageKey, StageStatus } from "@prisma/client";

import {
  ChapterExternalStoryDossierSchema,
  parseArtifactWithSchema,
  parseMetadataRecord,
} from "../../artifact-schemas";
import { getBookBySlugOrThrow, getStageForBook } from "../../repositories/books";
import {
  getExternalStoryBinderChapterKeys,
  listExternalStoryBinderTabs,
  syncExternalStoryBinderTabs,
} from "../../repositories/external-stories-binder";
import {
  getExternalStoriesForVersions,
  getExternalStorySourcesForVersions,
  getExternalStoryVerificationsForChapters,
  getLatestExternalStoryPackVersionsByChapter,
} from "../../repositories/external-stories-artifacts";
import { getChapterSeeds } from "../external-stories";

export async function getExternalStoriesWorkspace(bookSlug: string, selectedTabId?: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EXTERNAL_STORIES);
  const { chapterSeeds, baseStory } = await getChapterSeeds(book.id);
  await syncExternalStoryBinderTabs(
    book.id,
    chapterSeeds.map(({ chapterKey, chapterLabel }) => ({ chapterKey, chapterLabel })),
  );

  const tabs = await listExternalStoryBinderTabs(book.id);
  const selectedTab = tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0] ?? null;
  const chapterMap = new Map(chapterSeeds.map((chapter) => [chapter.chapterKey, chapter]));
  const allChapterKeys = Array.from(
    new Set(
      tabs.flatMap((tab) => getExternalStoryBinderChapterKeys(tab.chapterKeysJson)),
    ),
  );
  const latestVersionsByChapter = await getLatestExternalStoryPackVersionsByChapter(
    book.id,
    allChapterKeys,
  );

  const tabsWithSummary = tabs.map((tab) => {
    const chapterKeys = getExternalStoryBinderChapterKeys(tab.chapterKeysJson);
    const versions = chapterKeys.map((chapterKey) => {
      const version = latestVersionsByChapter.get(chapterKey) ?? null;
      const dossier = version
        ? parseArtifactWithSchema(version.contentJson, ChapterExternalStoryDossierSchema)
        : null;
      return { version, dossier, invalidArtifact: Boolean(version && !dossier) };
    });

    return {
      ...tab,
      chapterKeys,
      summary: {
        chapterCount: chapterKeys.length,
        storyCount: versions.reduce((sum, entry) => sum + (entry.dossier?.verificationSummary.totalStories ?? 0), 0),
        verifiedStoryCount: versions.reduce((sum, entry) => sum + (entry.dossier?.verificationSummary.verifiedStories ?? 0), 0),
        ideaCount: tab.storyClips.length,
        status:
          versions.every((entry) => entry.version?.lifecycleState === ArtifactStatus.COMMITTED)
            ? "COMMITTED"
            : versions.some((entry) => entry.dossier)
              ? "DRAFT"
              : "EMPTY",
      },
    };
  });

  const selected = tabsWithSummary.find((tab) => tab.id === selectedTab?.id) ?? null;
  const selectedChapterKeys = selected?.chapterKeys ?? [];
  const selectedVersions = selectedChapterKeys
    .map((chapterKey) => latestVersionsByChapter.get(chapterKey) ?? null)
    .filter((version): version is NonNullable<typeof version> => Boolean(version));
  const selectedVersionIds = [...new Set(selectedVersions.map((version) => version.id))];
  const [selectedSources, selectedStories, selectedVerifications] = await Promise.all([
    getExternalStorySourcesForVersions(selectedVersionIds),
    getExternalStoriesForVersions(selectedVersionIds),
    getExternalStoryVerificationsForChapters(book.id, selectedChapterKeys),
  ]);

  const sourcesByVersion = new Map<string, typeof selectedSources>();
  const storiesByVersion = new Map<string, typeof selectedStories>();
  const verificationsByChapter = new Map<string, typeof selectedVerifications>();

  for (const source of selectedSources) {
    if (!source.storyArtifactVersionId) {
      continue;
    }
    const current = sourcesByVersion.get(source.storyArtifactVersionId) ?? [];
    current.push(source);
    sourcesByVersion.set(source.storyArtifactVersionId, current);
  }

  for (const story of selectedStories) {
    if (!story.storyArtifactVersionId) {
      continue;
    }
    const current = storiesByVersion.get(story.storyArtifactVersionId) ?? [];
    current.push(story);
    storiesByVersion.set(story.storyArtifactVersionId, current);
  }

  for (const verification of selectedVerifications) {
    const current = verificationsByChapter.get(verification.chapterKey) ?? [];
    current.push(verification);
    verificationsByChapter.set(verification.chapterKey, current);
  }

  const dossierEntries = selectedChapterKeys.map((chapterKey) => {
    const version = latestVersionsByChapter.get(chapterKey) ?? null;
    const dossier = version
      ? parseArtifactWithSchema(version.contentJson, ChapterExternalStoryDossierSchema)
      : null;

    return {
      chapter: chapterMap.get(chapterKey) ?? {
        chapterKey,
        chapterLabel: chapterKey,
        chapterTitle: chapterKey,
        chapterDescription: "",
      },
      version,
      dossier,
      invalidArtifact: Boolean(version && !dossier),
      sources: version ? sourcesByVersion.get(version.id) ?? [] : [],
      stories: version ? storiesByVersion.get(version.id) ?? [] : [],
      verifications: verificationsByChapter.get(chapterKey) ?? [],
    };
  });

  const invalidArtifactWarnings = dossierEntries
    .filter((entry) => entry.invalidArtifact)
    .map(
      (entry) =>
        `${entry.chapter.chapterLabel} has a saved external-story dossier version that no longer matches the expected schema. Regenerate this vault before relying on it downstream.`,
    );

  const metadata = parseMetadataRecord(stage?.metadataJson);

  return {
    book,
    stage,
    tabs: tabsWithSummary,
    selectedTab: selected,
    availableChapters: chapterSeeds,
    baseStoryReady: Boolean(baseStory),
    dossierEntries,
    invalidArtifactWarnings,
    progress: {
      totalChapters: typeof metadata.totalChapters === "number" ? metadata.totalChapters : chapterSeeds.length,
      completedChapters: typeof metadata.completedChapters === "number" ? metadata.completedChapters : tabsWithSummary.filter((tab) => tab.summary.storyCount > 0).length,
      currentChapterKey: typeof metadata.currentChapterKey === "string" ? metadata.currentChapterKey : null,
      failedChapters: Array.isArray(metadata.failedChapters) ? metadata.failedChapters : [],
      provisionalChapters: Array.isArray(metadata.provisionalChapters) ? metadata.provisionalChapters : [],
      automationStatus: typeof metadata.automationStatus === "string" ? metadata.automationStatus : stage?.status === StageStatus.READY_FOR_REVIEW ? "ready_for_review" : "idle",
    },
  };
}
