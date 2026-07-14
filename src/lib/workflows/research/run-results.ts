export type ResearchFailedChapter = {
  chapterKey: string;
  message: string;
};

type ResearchChapterResult = {
  dossier: {
    metadata?: {
      provisional?: unknown;
      retryRecommended?: unknown;
      timeout?: unknown;
      failureReason?: unknown;
    };
  };
};

export function shouldRetryResearchChapterResult(
  result: ResearchChapterResult,
  attempt: number,
  chapterRetryLimit: number,
) {
  return Boolean(
    result.dossier.metadata?.provisional &&
      result.dossier.metadata?.retryRecommended &&
      attempt < chapterRetryLimit,
  );
}

export function recordResearchChapterOutcome(input: {
  chapterKey: string;
  chapterTitle: string;
  finalResult: ResearchChapterResult | null;
  chapterFailedMessage: string | null;
  completedChapterKeys: string[];
  provisionalChapters: string[];
  failedChapters: ResearchFailedChapter[];
}) {
  const {
    chapterKey,
    chapterTitle,
    finalResult,
    chapterFailedMessage,
    completedChapterKeys,
    provisionalChapters,
    failedChapters,
  } = input;

  if (finalResult) {
    completedChapterKeys.push(chapterKey);
    if (finalResult.dossier.metadata?.provisional) {
      if (!provisionalChapters.includes(chapterKey)) {
        provisionalChapters.push(chapterKey);
      }

      if (finalResult.dossier.metadata?.timeout) {
        failedChapters.push({
          chapterKey,
          message:
            typeof finalResult.dossier.metadata.failureReason === "string"
              ? finalResult.dossier.metadata.failureReason
              : `Chapter research timed out for ${chapterTitle}.`,
        });
      }
    }
  } else if (chapterFailedMessage) {
    failedChapters.push({
      chapterKey,
      message: chapterFailedMessage,
    });
  }
}

export function researchChapterProgressMessage(input: {
  chapterKey: string;
  chapterTitle: string;
  failedChapters: ResearchFailedChapter[];
  provisionalChapters: string[];
}) {
  if (input.failedChapters.some((item) => item.chapterKey === input.chapterKey)) {
    return `Failed ${input.chapterTitle}`;
  }

  if (input.provisionalChapters.includes(input.chapterKey)) {
    return `Generated provisional dossier for ${input.chapterTitle}`;
  }

  return `Completed ${input.chapterTitle}`;
}
