import { getOrCreateBookBySlug } from "../../repositories/books";
import {
  archiveResearchBinderTab,
  combineResearchBinderTabs,
  createResearchBinderTab,
  renameResearchBinderTab,
  separateResearchBinderTab,
} from "../../repositories/research-binder";
import { commitChapterResearchWorkflow } from "./commit";
import { runChapterResearchWorkflow } from "./execution";
import { getResearchWorkspace } from "./workspace";

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
