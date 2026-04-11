export function estimateWordsPerPage(trimSize: string) {
  const normalized = trimSize.toLowerCase().replace(/\s+/g, "");

  if (normalized.includes("5x8")) {
    return 220;
  }

  if (normalized.includes("5.5x8.5")) {
    return 235;
  }

  if (normalized.includes("6x9")) {
    return 250;
  }

  if (normalized.includes("7x10")) {
    return 300;
  }

  if (normalized.includes("8.5x11")) {
    return 420;
  }

  return 250;
}

export function countWords(text: string | null | undefined) {
  if (!text) {
    return 0;
  }

  const matches = text
    .replace(/\u2019/g, "'")
    .match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);

  return matches?.length ?? 0;
}

export function estimatePagesFromWords(wordCount: number, trimSize: string) {
  if (wordCount <= 0) {
    return 0;
  }

  const wordsPerPage = estimateWordsPerPage(trimSize);
  return Math.max(1, Math.ceil(wordCount / wordsPerPage));
}

export function toPercent(completed: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}
