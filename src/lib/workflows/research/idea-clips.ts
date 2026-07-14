import { getOrCreateBookBySlug } from "../../repositories/books";
import {
  createResearchIdeaClip,
  deleteResearchIdeaClip,
} from "../../repositories/research-binder";

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
