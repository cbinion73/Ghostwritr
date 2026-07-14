import { getBookBySlugOrThrow } from "../../repositories/books";
import {
  archiveExternalStoryBinderTab,
  combineExternalStoryBinderTabs,
  createExternalStoryBinderTab,
  createExternalStoryClip,
  deleteExternalStoryClip,
  renameExternalStoryBinderTab,
  separateExternalStoryBinderTab,
} from "../../repositories/external-stories-binder";

export async function addExternalStoryBinderTabWorkflow(bookSlug: string, label: string, chapterKey?: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  return createExternalStoryBinderTab(book.id, label, chapterKey ? [chapterKey] : []);
}

export async function renameExternalStoryBinderTabWorkflow(bookSlug: string, tabId: string, label: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  return renameExternalStoryBinderTab(book.id, tabId, label);
}

export async function archiveExternalStoryBinderTabWorkflow(bookSlug: string, tabId: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  return archiveExternalStoryBinderTab(book.id, tabId);
}

export async function combineExternalStoryBinderTabsWorkflow(bookSlug: string, sourceTabId: string, targetTabId: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  return combineExternalStoryBinderTabs(book.id, sourceTabId, targetTabId);
}

export async function separateExternalStoryBinderTabWorkflow(bookSlug: string, sourceTabId: string, chapterKey: string, newLabel: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  return separateExternalStoryBinderTab(book.id, sourceTabId, chapterKey, newLabel);
}

export async function addExternalStoryClipWorkflow(input: { bookSlug: string; tabId: string; chapterKey?: string; title?: string; content: string }) {
  const book = await getBookBySlugOrThrow(input.bookSlug);
  return createExternalStoryClip({ bookId: book.id, binderTabId: input.tabId, chapterKey: input.chapterKey, title: input.title, content: input.content });
}

export async function deleteExternalStoryClipWorkflow(bookSlug: string, clipId: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  return deleteExternalStoryClip(book.id, clipId);
}
