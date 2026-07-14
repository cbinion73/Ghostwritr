import {
  ChapterResearchDossierSchema,
  parseArtifactWithSchema,
  parseMetadataRecord,
} from "../artifact-schemas";
import { resolveResearchLens } from "../research-lenses";
import {
  ArtifactStatus,
  Prisma,
  ResearchSource,
  StageKey,
  StageStatus,
} from "@prisma/client";

import {
  getDossierStatus,
  type DossierStatus,
} from "./research/workspace-support";
import {
  recentActivity,
} from "./research/run-progress";
import {
  getResearchChapterSeeds,
} from "./research/chapter-seeds";
import { getResearchWorkspace } from "./research/workspace";
import {
  runChapterResearchWorkflow,
} from "./research/execution";
import {
  commitChapterResearchWorkflow,
} from "./research/commit";
import {
  getBookBySlugOrThrow,
  getOrCreateBookBySlug,
  getStageForBook,
  updateStageForBook,
} from "../repositories/books";
import {
  archiveResearchBinderTab,
  combineResearchBinderTabs,
  createResearchBinderTab,
  createResearchIdeaClip,
  deleteResearchIdeaClip,
  renameResearchBinderTab,
  separateResearchBinderTab,
} from "../repositories/research-binder";
import {
  commitResearchPack,
  getLatestResearchPackVersionsByChapter,
} from "../repositories/research-artifacts";
import { clearStageStaleDependency, invalidateDependentStagesForBook } from "../workflow-dependencies";

export async function runResearchBinderTabWorkflow(bookSlug: string, tabId: string) {
  const workspace = await getResearchWorkspace(bookSlug, tabId);

  if (!workspace.selectedTab) {
    throw new Error("No dossier tab is selected.");
  }

  for (const chapterKey of workspace.selectedTab.chapterKeys) {
    await runChapterResearchWorkflow(bookSlug, chapterKey);
  }

  return workspace.selectedTab.chapterKeys;
}

export async function commitResearchBinderTabWorkflow(bookSlug: string, tabId: string) {
  const workspace = await getResearchWorkspace(bookSlug, tabId);

  if (!workspace.selectedTab) {
    throw new Error("No dossier tab is selected.");
  }

  for (const chapterKey of workspace.selectedTab.chapterKeys) {
    await commitChapterResearchWorkflow(bookSlug, chapterKey);
  }

  return workspace.selectedTab.chapterKeys;
}

export async function addResearchBinderTabWorkflow(
  bookSlug: string,
  label: string,
  chapterKey?: string,
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return createResearchBinderTab(book.id, label, chapterKey ? [chapterKey] : []);
}

export async function renameResearchBinderTabWorkflow(
  bookSlug: string,
  tabId: string,
  label: string,
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return renameResearchBinderTab(book.id, tabId, label);
}

export async function archiveResearchBinderTabWorkflow(bookSlug: string, tabId: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return archiveResearchBinderTab(book.id, tabId);
}

export async function combineResearchBinderTabsWorkflow(
  bookSlug: string,
  sourceTabId: string,
  targetTabId: string,
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return combineResearchBinderTabs(book.id, sourceTabId, targetTabId);
}

export async function separateResearchBinderTabWorkflow(
  bookSlug: string,
  sourceTabId: string,
  chapterKey: string,
  newLabel: string,
) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return separateResearchBinderTab(book.id, sourceTabId, chapterKey, newLabel);
}

export async function addResearchIdeaClipWorkflow(input: {
  bookSlug: string;
  tabId: string;
  chapterKey?: string;
  title?: string;
  content: string;
}) {
  const book = await getOrCreateBookBySlug(input.bookSlug);

  return createResearchIdeaClip({
    bookId: book.id,
    binderTabId: input.tabId,
    chapterKey: input.chapterKey,
    title: input.title,
    content: input.content,
  });
}

export async function deleteResearchIdeaClipWorkflow(bookSlug: string, ideaId: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  return deleteResearchIdeaClip(book.id, ideaId);
}
