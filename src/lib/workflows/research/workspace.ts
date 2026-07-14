import { appendFile } from "node:fs/promises";

import { ArtifactStatus, StageKey, StageStatus } from "@prisma/client";

import {
  ChapterResearchDossierSchema,
  parseMetadataRecord,
  parseArtifactWithSchema,
} from "../../artifact-schemas";
import type { ChapterResearchSource } from "../../research-types";
import { getBookBySlugOrThrow, getStageForBook } from "../../repositories/books";
import {
  getBinderTabChapterKeys,
  listResearchBinderTabs,
  syncResearchBinderTabsFromOutline,
} from "../../repositories/research-binder";
import {
  getCommittedResearchPack,
  getLatestResearchPackVersionsByChapter,
  getResearchPackVersions,
  getResearchSourcesForVersions,
  getResearchVerificationsForChapter,
} from "../../repositories/research-artifacts";
import { getResearchChapterSeeds } from "./chapter-seeds";
import {
  getDossierStatus,
  normalizeWorkspaceResearchSource,
} from "./workspace-support";

const RESEARCH_WORKSPACE_LOG_PATH = "/tmp/research-workspace.log";

function createResearchWorkspaceProfiler(bookSlug: string, selectedTabId?: string) {
  const startedAt = Date.now();
  const runId = `research-workspace-${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
  const entries: string[] = [];

  const serializeDetail = (detail?: Record<string, unknown>) => {
    if (!detail || Object.keys(detail).length === 0) {
      return "";
    }

    try {
      return ` ${JSON.stringify(detail)}`;
    } catch {
      return " [unserializable detail]";
    }
  };

  const mark = (step: string, detail?: Record<string, unknown>) => {
    const elapsedMs = Date.now() - startedAt;
    entries.push(
      `${new Date().toISOString()} [${runId}] +${elapsedMs}ms ${step}${serializeDetail(detail)}`,
    );
  };

  const flush = async (status: "ok" | "error", detail?: Record<string, unknown>) => {
    mark(`complete:${status}`, {
      bookSlug,
      selectedTabId: selectedTabId ?? null,
      totalMs: Date.now() - startedAt,
      ...(detail ?? {}),
    });

    if (entries.length === 0) {
      return;
    }

    const output = `${entries.join("\n")}\n`;
    console.info(output.trimEnd());

    try {
      await appendFile(RESEARCH_WORKSPACE_LOG_PATH, output, "utf8");
    } catch {
      // Logging should never break the workspace load.
    }
  };

  return { mark, flush };
}

export async function getChapterResearchWorkspace(bookSlug: string, chapterKey: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.RESEARCH);
  const versions = await getResearchPackVersions(book.id, chapterKey);
  const committedVersion = await getCommittedResearchPack(book.id, chapterKey);
  const verifications = await getResearchVerificationsForChapter(book.id, chapterKey);

  return {
    book,
    stage,
    versions: versions.map((version) => ({
      ...version,
      dossier: parseArtifactWithSchema(version.contentJson, ChapterResearchDossierSchema),
      invalidContent:
        version.contentJson != null &&
        !parseArtifactWithSchema(version.contentJson, ChapterResearchDossierSchema),
      isCommitted: version.lifecycleState === ArtifactStatus.COMMITTED,
    })),
    committedDossier: committedVersion
      ? parseArtifactWithSchema(committedVersion.contentJson, ChapterResearchDossierSchema)
      : null,
    verificationCount: verifications.length,
  };
}

export async function getResearchWorkspace(bookSlug: string, selectedTabId?: string) {
  const profiler = createResearchWorkspaceProfiler(bookSlug, selectedTabId);
  profiler.mark("start");

  try {
    const book = await getBookBySlugOrThrow(bookSlug);
    profiler.mark("book_loaded", { bookId: book.id });

    const stage = await getStageForBook(book.id, StageKey.RESEARCH);
    profiler.mark("stage_loaded", {
      stageStatus: stage?.status ?? null,
    });

    const { outline, paragraphOutline, baseStory, chapterSeeds } = await getResearchChapterSeeds(book.id);
    profiler.mark("chapter_seeds_loaded", {
      chapterCount: chapterSeeds.length,
      hasOutline: Boolean(outline),
      hasParagraphOutline: Boolean(paragraphOutline),
    });

    await syncResearchBinderTabsFromOutline(
      book.id,
      chapterSeeds.map(({ chapterKey, chapterLabel }) => ({ chapterKey, chapterLabel })),
    );
    profiler.mark("binder_tabs_synced", {
      chapterCount: chapterSeeds.length,
    });

    const tabs = await listResearchBinderTabs(book.id);
    const tabsWithChapterKeys = tabs.map((tab) => ({
      ...tab,
      chapterKeys: getBinderTabChapterKeys(tab.chapterKeysJson),
    }));
    profiler.mark("binder_tabs_loaded", {
      tabCount: tabsWithChapterKeys.length,
      ideaCount: tabsWithChapterKeys.reduce((sum, tab) => sum + tab.ideaClips.length, 0),
    });

    const selectedTab =
      tabsWithChapterKeys.find((tab) => tab.id === selectedTabId) ??
      tabsWithChapterKeys[0] ??
      null;
    profiler.mark("selected_tab_resolved", {
      selectedTabId: selectedTab?.id ?? null,
      selectedChapterCount: selectedTab?.chapterKeys.length ?? 0,
    });

    const chapterMap = new Map(chapterSeeds.map((chapter) => [chapter.chapterKey, chapter]));
    const selectedChapterKeys = selectedTab?.chapterKeys ?? [];
    const allTabbedChapterKeys = Array.from(
      new Set(tabsWithChapterKeys.flatMap((tab) => tab.chapterKeys)),
    );

    const latestVersionsByChapter = await getLatestResearchPackVersionsByChapter(
      book.id,
      allTabbedChapterKeys,
    );
    profiler.mark("latest_versions_loaded", {
      chapterCount: allTabbedChapterKeys.length,
      versionCount: latestVersionsByChapter.size,
    });

    const dossierByChapter = new Map(
      Array.from(latestVersionsByChapter.entries()).map(([chapterKey, version]) => [
        chapterKey,
        parseArtifactWithSchema(version.contentJson, ChapterResearchDossierSchema),
      ]),
    );
    profiler.mark("dossiers_parsed", {
      dossierCount: dossierByChapter.size,
    });

    const selectedVersionIds = selectedChapterKeys
      .map((chapterKey) => latestVersionsByChapter.get(chapterKey)?.id)
      .filter((value): value is string => Boolean(value));
    const selectedSources = await getResearchSourcesForVersions(selectedVersionIds);
    profiler.mark("selected_sources_loaded", {
      selectedVersionCount: selectedVersionIds.length,
      sourceCount: selectedSources.length,
    });

    const sourcesByVersionId = new Map<string, ChapterResearchSource[]>();

    for (const source of selectedSources) {
      const versionId = source.researchArtifactVersionId;
      if (!versionId) {
        continue;
      }

      const bucket = sourcesByVersionId.get(versionId) ?? [];
      bucket.push(normalizeWorkspaceResearchSource(source));
      sourcesByVersionId.set(versionId, bucket);
    }
    profiler.mark("sources_grouped", {
      versionCount: sourcesByVersionId.size,
    });

    const dossierEntries = selectedChapterKeys.map((chapterKey) => {
      const version = latestVersionsByChapter.get(chapterKey) ?? null;
      const dossier = dossierByChapter.get(chapterKey) ?? null;
      const sources = version ? sourcesByVersionId.get(version.id) ?? [] : [];

      return {
        chapter: chapterMap.get(chapterKey) ?? {
          chapterKey,
          chapterLabel: chapterKey,
          chapterTitle: chapterKey,
        },
        version,
        dossier,
        sources,
        invalidArtifact: Boolean(version && !dossier),
        status: getDossierStatus({
          versionNumber: version?.versionNumber,
          isCommitted: version?.lifecycleState === ArtifactStatus.COMMITTED,
          verifiedItems: dossier?.verificationSummary.verifiedItems ?? 0,
          needsCorroborationItems:
            dossier?.verificationSummary.needsCorroborationItems ?? 0,
        }),
      };
    });
    profiler.mark("dossier_entries_built", {
      dossierEntryCount: dossierEntries.length,
    });

    const invalidArtifactWarnings = dossierEntries
      .filter((entry) => entry.invalidArtifact)
      .map(
        (entry) =>
          `${entry.chapter.chapterLabel} has a saved research dossier version that no longer matches the expected schema. Regenerate this dossier before relying on it downstream.`,
      );

    const tabsWithSummary = tabsWithChapterKeys.map((tab) => {
      const chapterVersions = tab.chapterKeys.map((chapterKey) => ({
        version: latestVersionsByChapter.get(chapterKey) ?? null,
        dossier: dossierByChapter.get(chapterKey) ?? null,
      }));

      const generatedCount = chapterVersions.filter((entry) => entry.version).length;
      const committedCount = chapterVersions.filter(
        (entry) => entry.version?.lifecycleState === ArtifactStatus.COMMITTED,
      ).length;
      const verifiedSourceCount = chapterVersions.reduce(
        (sum, entry) => sum + (entry.dossier?.verificationSummary.verifiedSources ?? 0),
        0,
      );
      const verifiedItemCount = chapterVersions.reduce(
        (sum, entry) => sum + (entry.dossier?.verificationSummary.verifiedItems ?? 0),
        0,
      );
      const needsReviewCount = chapterVersions.reduce(
        (sum, entry) =>
          sum + (entry.dossier?.verificationSummary.needsCorroborationItems ?? 0),
        0,
      );

      return {
        ...tab,
        summary: {
          status: getDossierStatus({
            versionNumber:
              generatedCount > 0 ? chapterVersions[0]?.version?.versionNumber ?? 1 : undefined,
            isCommitted: committedCount === tab.chapterKeys.length && tab.chapterKeys.length > 0,
            verifiedItems: verifiedItemCount,
            needsCorroborationItems: needsReviewCount,
          }),
          chapterCount: tab.chapterKeys.length,
          generatedCount,
          committedCount,
          verifiedSourceCount,
          verifiedItemCount,
          needsReviewCount,
          ideaCount: tab.ideaClips.length,
        },
      };
    });
    profiler.mark("tab_summaries_built", {
      tabCount: tabsWithSummary.length,
    });

    const selectedTabWithSummary =
      tabsWithSummary.find((tab) => tab.id === selectedTab?.id) ?? null;

    const stageMetadata = parseMetadataRecord(stage?.metadataJson);

    const result = {
      book,
      stage,
      outline,
      paragraphOutline,
      baseStoryReady: Boolean(baseStory),
      tabs: tabsWithSummary,
      selectedTab: selectedTabWithSummary,
      availableChapters: chapterSeeds,
      dossierEntries,
      invalidArtifactWarnings,
      progress: {
        totalChapters:
          typeof stageMetadata.totalChapters === "number"
            ? stageMetadata.totalChapters
            : chapterSeeds.length,
        completedChapters:
          typeof stageMetadata.completedChapters === "number"
            ? stageMetadata.completedChapters
            : tabsWithSummary.filter((tab) => tab.summary.generatedCount > 0).length,
        currentChapterKey:
          typeof stageMetadata.currentChapterKey === "string"
            ? stageMetadata.currentChapterKey
            : null,
        failedChapters: Array.isArray(stageMetadata.failedChapters)
          ? stageMetadata.failedChapters
          : [],
        provisionalChapters: Array.isArray(stageMetadata.provisionalChapters)
          ? stageMetadata.provisionalChapters
          : [],
        automationStatus:
          typeof stageMetadata.automationStatus === "string"
            ? stageMetadata.automationStatus
            : stage?.status === StageStatus.READY_FOR_REVIEW
              ? "ready_for_review"
              : "idle",
      },
    };

    profiler.mark("result_ready", {
      totalChapters: result.progress.totalChapters,
      completedChapters: result.progress.completedChapters,
      automationStatus: result.progress.automationStatus,
    });
    await profiler.flush("ok");
    return result;
  } catch (error) {
    await profiler.flush("error", {
      message: error instanceof Error ? error.message : "Unknown workspace error",
    });
    throw error;
  }
}
