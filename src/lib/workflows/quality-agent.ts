import { ArtifactStatus, Prisma, StageKey, StageStatus } from "@prisma/client";

import type { BaseStoryBundle } from "../base-story-types";
import type { BookOutline } from "../outline-types";
import type { ParagraphOutline } from "../paragraph-outline-types";
import type { ChapterExternalStoryDossier } from "../external-story-types";
import type { ChapterResearchDossier } from "../research-types";
import { getOrCreateBookBySlug, getStageForBook, updateStageForBook } from "../repositories/books";
import {
  commitBaseStory,
  getBaseStoryVersions,
} from "../repositories/base-story-artifacts";
import {
  commitExternalStoryPack,
  getExternalStoriesForVersion,
  getExternalStoryPackVersions,
  getExternalStorySourcesForVersion,
} from "../repositories/external-stories-artifacts";
import {
  getCommittedOutline,
  getCommittedOutlineExpansion,
} from "../repositories/outline-artifacts";
import {
  commitResearchPack,
  getResearchItemsForVersion,
  getResearchPackVersions,
  getResearchSourcesForVersion,
} from "../repositories/research-artifacts";
import {
  createWorkflowRun,
  getActiveWorkflowRunForStage,
} from "../repositories/workflow-runs";
import { triggerWorkflowRunInBackground } from "../workflow-queue";

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function mergeMetadata(
  current: unknown,
  patch: Record<string, unknown>,
) {
  return ({
    ...(current && typeof current === "object" ? (current as Record<string, unknown>) : {}),
    ...patch,
  }) as Prisma.InputJsonValue;
}

function getFailedChapterKeys(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const record = metadata as Record<string, unknown>;
  if (!Array.isArray(record.failedChapters)) {
    return [];
  }

  return record.failedChapters
    .map((entry) => {
      if (entry && typeof entry === "object" && "chapterKey" in entry) {
        const chapterKey = entry.chapterKey;
        return typeof chapterKey === "string" ? chapterKey : null;
      }

      return null;
    })
    .filter((value): value is string => Boolean(value));
}

function getProvisionalChapterKeys(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const record = metadata as Record<string, unknown>;
  if (!Array.isArray(record.provisionalChapters)) {
    return [];
  }

  return record.provisionalChapters.filter(
    (entry): entry is string => typeof entry === "string",
  );
}

function stageHasBlockingMetadata(metadata: unknown) {
  const failed = getFailedChapterKeys(metadata);
  const provisional = getProvisionalChapterKeys(metadata);
  return failed.length > 0 || provisional.length > 0;
}

async function bumpRetryCount(bookId: string, stageKey: StageKey) {
  const stage = await getStageForBook(bookId, stageKey);
  const metadata =
    stage?.metadataJson && typeof stage.metadataJson === "object"
      ? (stage.metadataJson as Record<string, unknown>)
      : {};
  const retryCount =
    typeof metadata.qualityRetryCount === "number" ? metadata.qualityRetryCount : 0;

  await updateStageForBook(bookId, stageKey, {
    metadataJson: mergeMetadata(stage?.metadataJson, {
      qualityRetryCount: retryCount + 1,
      lastQualityActionAt: new Date().toISOString(),
    }),
  });

  return retryCount + 1;
}

async function resetRetryCount(bookId: string, stageKey: StageKey) {
  const stage = await getStageForBook(bookId, stageKey);
  await updateStageForBook(bookId, stageKey, {
    metadataJson: mergeMetadata(stage?.metadataJson, {
      qualityRetryCount: 0,
      lastQualityActionAt: new Date().toISOString(),
    }),
  });
}

async function getChapterRefs(bookId: string) {
  const outlineVersion = await getCommittedOutline(bookId);
  const paragraphVersion = await getCommittedOutlineExpansion(bookId);
  const outline = parseJson<BookOutline | null>(outlineVersion?.contentJson, null);
  const paragraph = parseJson<ParagraphOutline | null>(paragraphVersion?.contentJson, null);

  if (paragraph) {
    return paragraph.sections.flatMap((section) =>
      section.chapters.map((chapter) => ({
        chapterKey: chapter.chapterId,
        chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`,
      })),
    );
  }

  return (
    outline?.sections.flatMap((section) =>
      section.chapters.map((chapter) => ({
        chapterKey: chapter.id,
        chapterLabel: `Chapter ${chapter.number}: ${chapter.title}`,
      })),
    ) ?? []
  );
}

async function enqueueStageRetry(bookId: string, bookSlug: string, stageKey: StageKey) {
  const existingRun = await getActiveWorkflowRunForStage(bookId, stageKey);
  if (existingRun) {
    return existingRun;
  }

  const stage = await getStageForBook(bookId, stageKey);
  const metadata =
    stage?.metadataJson && typeof stage.metadataJson === "object"
      ? (stage.metadataJson as Record<string, unknown>)
      : {};
  const failedChapterKeys = getFailedChapterKeys(metadata);
  const provisionalChapters = getProvisionalChapterKeys(metadata).filter(
    (chapterKey) => !failedChapterKeys.includes(chapterKey),
  );
  const totalChapters =
    typeof metadata.totalChapters === "number" ? metadata.totalChapters : failedChapterKeys.length;
  const priorCompleted =
    typeof metadata.completedChapters === "number" ? metadata.completedChapters : 0;
  const preserveCompletedCount =
    failedChapterKeys.length > 0
      ? Math.max(0, Math.min(priorCompleted, totalChapters))
      : 0;

  const runType =
    stageKey === StageKey.BASE_STORY ? "base_story_generation" :
    stageKey === StageKey.RESEARCH ? "full_research_generation" :
    "full_external_stories_generation";

  const queuedRun = await createWorkflowRun({
    bookId,
    stageKey,
    inputJson: {
      kind: runType,
      bookSlug,
      ...(failedChapterKeys.length > 0
        ? {
            chapterKeys: failedChapterKeys,
            preserveCompletedCount,
            preserveProvisionalChapters: provisionalChapters,
          }
        : {}),
    },
  });
  triggerWorkflowRunInBackground(queuedRun.id);
  return queuedRun;
}

export async function runQualityAgentWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  const chapterRefs = await getChapterRefs(book.id);

  const [researchStage, externalStage, baseStage] = await Promise.all([
    getStageForBook(book.id, StageKey.RESEARCH),
    getStageForBook(book.id, StageKey.EXTERNAL_STORIES),
    getStageForBook(book.id, StageKey.BASE_STORY),
  ]);

  const [activeResearchRun, activeExternalRun, activeBaseRun] = await Promise.all([
    getActiveWorkflowRunForStage(book.id, StageKey.RESEARCH),
    getActiveWorkflowRunForStage(book.id, StageKey.EXTERNAL_STORIES),
    getActiveWorkflowRunForStage(book.id, StageKey.BASE_STORY),
  ]);

  const researchIssues: string[] = [];
  const researchCommitKeys: string[] = [];
  for (const chapter of chapterRefs) {
    const version = (await getResearchPackVersions(book.id, chapter.chapterKey, 1))[0] ?? null;
    if (!version) {
      researchIssues.push(`${chapter.chapterLabel} has no research dossier.`);
      continue;
    }

    const dossier = parseJson<ChapterResearchDossier | null>(version.contentJson, null);
    const [sources, items] = await Promise.all([
      getResearchSourcesForVersion(version.id),
      getResearchItemsForVersion(version.id),
    ]);
    const verifiedSources = sources.filter((source) => source.isVerified).length;
    const verifiedItems = items.filter((item) => item.verificationStatus === "VERIFIED").length;
    const validLinks = sources.filter((source) => /^https?:\/\//i.test(source.url)).length;

    if (dossier?.metadata?.provisional) {
      researchIssues.push(`${chapter.chapterLabel} is still provisional.`);
      continue;
    }

    if (validLinks < 2) {
      researchIssues.push(`${chapter.chapterLabel} does not have enough valid source links.`);
      continue;
    }

    // With quality feedback loop, accept chapters with at least 1 verified item
    // Quality agent will continuously improve chapters in background
    if (verifiedItems < 1) {
      researchIssues.push(`${chapter.chapterLabel} has no verified research items (0 items verified).`);
      continue;
    }

    // At least 1 verified source required for credibility
    if (verifiedSources < 1) {
      researchIssues.push(`${chapter.chapterLabel} has no verified research sources.`);
      continue;
    }

    if (version.lifecycleState !== ArtifactStatus.COMMITTED) {
      researchCommitKeys.push(chapter.chapterKey);
    }
  }

  const externalIssues: string[] = [];
  const externalCommitKeys: string[] = [];
  for (const chapter of chapterRefs) {
    const version = (await getExternalStoryPackVersions(book.id, chapter.chapterKey, 1))[0] ?? null;
    if (!version) {
      externalIssues.push(`${chapter.chapterLabel} has no external story vault.`);
      continue;
    }

    const dossier = parseJson<ChapterExternalStoryDossier | null>(version.contentJson, null);
    const [sources, stories] = await Promise.all([
      getExternalStorySourcesForVersion(version.id),
      getExternalStoriesForVersion(version.id),
    ]);
    const verifiedStories = stories.filter((story) => story.verificationStatus === "VERIFIED").length;
    const validLinks = sources.filter((source) => /^https?:\/\//i.test(source.url)).length;

    if (dossier?.metadata?.provisional) {
      externalIssues.push(`${chapter.chapterLabel} is still provisional.`);
      continue;
    }

    if (validLinks < 2) {
      externalIssues.push(`${chapter.chapterLabel} does not have enough valid story source links.`);
      continue;
    }

    if (sources.length < 2) {
      externalIssues.push(`${chapter.chapterLabel} needs more external story sources.`);
      continue;
    }

    if (verifiedStories < 3) {
      externalIssues.push(`${chapter.chapterLabel} needs more verified external stories.`);
      continue;
    }

    if (version.lifecycleState !== ArtifactStatus.COMMITTED) {
      externalCommitKeys.push(chapter.chapterKey);
    }
  }

  const baseVersion = (await getBaseStoryVersions(book.id, 1))[0] ?? null;
  const baseBundle = parseJson<BaseStoryBundle | null>(baseVersion?.contentJson, null);
  const baseIssues: string[] = [];
  let baseShouldCommit = false;

  if (!baseVersion) {
    baseIssues.push("Base Story has not generated yet.");
  } else if (!baseBundle || baseBundle.chapters.length !== chapterRefs.length) {
    baseIssues.push("Base Story does not yet cover every chapter.");
  } else if (baseVersion.lifecycleState !== ArtifactStatus.COMMITTED) {
    baseShouldCommit = true;
  }

  const maxAutoRetries = 2;

  const researchHasBlockingMetadata = stageHasBlockingMetadata(researchStage?.metadataJson);
  const externalHasBlockingMetadata = stageHasBlockingMetadata(externalStage?.metadataJson);

  if (researchIssues.length > 0 && !activeResearchRun && researchHasBlockingMetadata) {
    const metadata =
      researchStage?.metadataJson && typeof researchStage.metadataJson === "object"
        ? (researchStage.metadataJson as Record<string, unknown>)
        : {};
    const retryCount =
      typeof metadata.qualityRetryCount === "number" ? metadata.qualityRetryCount : 0;
    if (retryCount < maxAutoRetries) {
      await bumpRetryCount(book.id, StageKey.RESEARCH);
      await updateStageForBook(book.id, StageKey.RESEARCH, {
        metadataJson: mergeMetadata(researchStage?.metadataJson, {
          lastQualityFeedback: {
            issues: researchIssues,
            retryAttempt: retryCount + 1,
            guidance: "Focus on stronger sources (Tier A preferred). Ensure each claim has evidence from source. Prioritize claims that are directly quoted or explicitly supported.",
            failedAt: new Date().toISOString(),
          },
        }),
      });
      await enqueueStageRetry(book.id, bookSlug, StageKey.RESEARCH);
    }
  } else if (researchIssues.length === 0) {
    await resetRetryCount(book.id, StageKey.RESEARCH);
    for (const chapterKey of researchCommitKeys) {
      await commitResearchPack(book.id, chapterKey);
    }
    if (researchStage?.status !== StageStatus.COMMITTED) {
      const metadata =
        researchStage?.metadataJson && typeof researchStage.metadataJson === "object"
          ? (researchStage.metadataJson as Record<string, unknown>)
          : {};
      await updateStageForBook(book.id, StageKey.RESEARCH, {
        status: StageStatus.COMMITTED,
        committedAt: new Date(),
        metadataJson: mergeMetadata(researchStage?.metadataJson, {
          automationStatus: "committed",
          currentAction: "Quality checks passed and research was auto-committed",
          totalChapters:
            typeof metadata.totalChapters === "number"
              ? metadata.totalChapters
              : chapterRefs.length,
          completedChapters:
            typeof metadata.totalChapters === "number"
              ? metadata.totalChapters
              : chapterRefs.length,
          failedChapters: [],
          provisionalChapters: [],
          currentChapterKey: null,
          qualityPassedAt: new Date().toISOString(),
          qualityStatus: "pass",
          recentActivity: [
            {
              at: new Date().toISOString(),
              message: "Quality Agent auto-committed Research.",
            },
            ...((Array.isArray(metadata.recentActivity)
              ? metadata.recentActivity
              : []) as Array<Record<string, unknown>>),
          ].slice(0, 3),
        }),
      });
    }
  }

  if (externalIssues.length > 0 && !activeExternalRun && externalHasBlockingMetadata) {
    const metadata =
      externalStage?.metadataJson && typeof externalStage.metadataJson === "object"
        ? (externalStage.metadataJson as Record<string, unknown>)
        : {};
    const retryCount =
      typeof metadata.qualityRetryCount === "number" ? metadata.qualityRetryCount : 0;
    if (retryCount < maxAutoRetries) {
      await bumpRetryCount(book.id, StageKey.EXTERNAL_STORIES);
      await enqueueStageRetry(book.id, bookSlug, StageKey.EXTERNAL_STORIES);
    }
  } else if (externalIssues.length === 0) {
    await resetRetryCount(book.id, StageKey.EXTERNAL_STORIES);
    for (const chapterKey of externalCommitKeys) {
      await commitExternalStoryPack(book.id, chapterKey);
    }
    if (externalStage?.status !== StageStatus.COMMITTED) {
      const metadata =
        externalStage?.metadataJson && typeof externalStage.metadataJson === "object"
          ? (externalStage.metadataJson as Record<string, unknown>)
          : {};
      await updateStageForBook(book.id, StageKey.EXTERNAL_STORIES, {
        status: StageStatus.COMMITTED,
        committedAt: new Date(),
        metadataJson: mergeMetadata(externalStage?.metadataJson, {
          automationStatus: "committed",
          currentAction: "Quality checks passed and external stories were auto-committed",
          totalChapters:
            typeof metadata.totalChapters === "number"
              ? metadata.totalChapters
              : chapterRefs.length,
          completedChapters:
            typeof metadata.totalChapters === "number"
              ? metadata.totalChapters
              : chapterRefs.length,
          failedChapters: [],
          provisionalChapters: [],
          currentChapterKey: null,
          qualityPassedAt: new Date().toISOString(),
          qualityStatus: "pass",
          recentActivity: [
            {
              at: new Date().toISOString(),
              message: "Quality Agent auto-committed External Stories.",
            },
            ...((Array.isArray(metadata.recentActivity)
              ? metadata.recentActivity
              : []) as Array<Record<string, unknown>>),
          ].slice(0, 3),
        }),
      });
    }
  }

  if (baseIssues.length > 0 && !activeBaseRun) {
    const metadata =
      baseStage?.metadataJson && typeof baseStage.metadataJson === "object"
        ? (baseStage.metadataJson as Record<string, unknown>)
        : {};
    const retryCount =
      typeof metadata.qualityRetryCount === "number" ? metadata.qualityRetryCount : 0;
    if (retryCount < maxAutoRetries) {
      await bumpRetryCount(book.id, StageKey.BASE_STORY);
      await enqueueStageRetry(book.id, bookSlug, StageKey.BASE_STORY);
    }
  } else if (baseIssues.length === 0) {
    await resetRetryCount(book.id, StageKey.BASE_STORY);
    if (baseShouldCommit) {
      await commitBaseStory(book.id);
    }
    if (baseStage?.status !== StageStatus.COMMITTED) {
      const metadata =
        baseStage?.metadataJson && typeof baseStage.metadataJson === "object"
          ? (baseStage.metadataJson as Record<string, unknown>)
          : {};
      await updateStageForBook(book.id, StageKey.BASE_STORY, {
        status: StageStatus.COMMITTED,
        committedAt: new Date(),
        metadataJson: mergeMetadata(baseStage?.metadataJson, {
          automationStatus: "committed",
          currentAction: "Quality checks passed and base story was auto-committed",
          currentChapterKey: null,
          qualityPassedAt: new Date().toISOString(),
          qualityStatus: "pass",
          recentActivity: [
            {
              at: new Date().toISOString(),
              message: "Quality Agent auto-committed Base Story.",
            },
            ...((Array.isArray(metadata.recentActivity)
              ? metadata.recentActivity
              : []) as Array<Record<string, unknown>>),
          ].slice(0, 3),
        }),
      });
    }
  }

  return {
    researchIssues,
    externalIssues,
    baseIssues,
    activeRuns: {
      research: Boolean(activeResearchRun),
      externalStories: Boolean(activeExternalRun),
      baseStory: Boolean(activeBaseRun),
    },
  };
}
