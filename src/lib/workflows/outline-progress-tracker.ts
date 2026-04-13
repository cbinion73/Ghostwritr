import type { GenerationProgress } from "./outline-paragraphs";

const progressMap = new Map<string, GenerationProgress>();

export function setChapterGenerationProgress(bookSlug: string, progress: GenerationProgress) {
  progressMap.set(bookSlug, { ...progress });
}

export function getChapterGenerationProgress(bookSlug: string): GenerationProgress | null {
  const progress = progressMap.get(bookSlug);
  return progress ? { ...progress } : null;
}

export function clearChapterGenerationProgress(bookSlug: string) {
  progressMap.delete(bookSlug);
}
