import type {
  BaseStoryBundle,
  BaseStoryChapter,
  TensionReleaseMovement,
} from "./base-story-types";

function tidy(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

export function buildDefaultBookMovement(
  bundle: Pick<BaseStoryBundle, "workingTitle" | "storyPremise" | "bookThread">,
): TensionReleaseMovement {
  return {
    me: tidy(
      bundle.storyPremise,
      `The book opens inside the felt pressure that makes ${bundle.workingTitle} necessary.`,
    ),
    we: tidy(
      bundle.bookThread,
      "That pressure is not isolated to one leader. It shapes the shared reality teams and organizations have to navigate together.",
    ),
    truth:
      "The truth the book keeps landing is that clarity, disciplined systems, and credible leadership can relieve that pressure without sacrificing humanity.",
    you:
      "The reader is then invited to own the choices, habits, and leadership posture that turn the truth into daily practice.",
    weClosing:
      "The movement closes by reconnecting personal action to the larger team, mission, and future the book is trying to build.",
  };
}

export function buildDefaultChapterMovement(
  chapter: Pick<BaseStoryChapter, "chapterLabel" | "chapterPurpose" | "threadRole" | "chapterStory">,
): TensionReleaseMovement {
  return {
    me: tidy(
      chapter.chapterPurpose,
      `The chapter opens inside the strain behind ${chapter.chapterLabel}.`,
    ),
    we: tidy(
      chapter.threadRole,
      "It widens that strain into a shared professional reality the reader can recognize in their own world.",
    ),
    truth:
      "Then it lands the governing truth that relieves the tension by clarifying what actually works and why.",
    you:
      "From there it turns toward the reader's responsibility, showing what this truth demands in real decisions and behavior.",
    weClosing: tidy(
      chapter.chapterStory,
      "It closes by reconnecting the chapter's lesson to the broader collective future the book is building toward.",
    ),
  };
}

export function normalizeMovement(
  movement: Partial<TensionReleaseMovement> | null | undefined,
  fallback: TensionReleaseMovement,
): TensionReleaseMovement {
  return {
    me: tidy(movement?.me, fallback.me),
    we: tidy(movement?.we, fallback.we),
    truth: tidy(movement?.truth, fallback.truth),
    you: tidy(movement?.you, fallback.you),
    weClosing: tidy(movement?.weClosing, fallback.weClosing),
  };
}

export function normalizeBaseStoryChapter(chapter: BaseStoryChapter): BaseStoryChapter {
  return {
    ...chapter,
    movement: normalizeMovement(chapter.movement, buildDefaultChapterMovement(chapter)),
  };
}

export function normalizeBaseStoryBundle(bundle: BaseStoryBundle | null): BaseStoryBundle | null {
  if (!bundle) {
    return null;
  }

  return {
    ...bundle,
    bookMovement: normalizeMovement(bundle.bookMovement, buildDefaultBookMovement(bundle)),
    chapters: bundle.chapters.map(normalizeBaseStoryChapter),
  };
}
