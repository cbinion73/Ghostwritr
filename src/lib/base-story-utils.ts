import type {
  BaseStoryBoundary,
  BaseStoryBundle,
  BaseStoryChapter,
  BookWideNarrativeGuidance,
  ChapterNarrativeGuidance,
  TensionReleaseMovement,
} from "./base-story-types";

function tidy(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

const BASE_STORY_BOUNDARY: BaseStoryBoundary = {
  kind: "base_story_guidance",
  personalStoryPolicy:
    "Base Story supplies narrative spine guidance only. It is not a confirmed author experience, invented personal anecdote, external case study, citation, or final chapter prose.",
};

type LegacyBaseStoryChapter = Omit<BaseStoryChapter, "guidance"> & {
  guidance?: Partial<ChapterNarrativeGuidance> | null;
};

type LegacyBaseStoryBundle = Omit<BaseStoryBundle, "narrativeGuidance" | "chapters"> & {
  narrativeGuidance?: Partial<BookWideNarrativeGuidance> | null;
  chapters?: LegacyBaseStoryChapter[] | null;
};

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

export function buildDefaultBookGuidance(
  bundle: Pick<BaseStoryBundle, "storyPremise" | "bookThread" | "bookMovement">,
): BookWideNarrativeGuidance {
  return {
    premise: tidy(bundle.storyPremise, "The book has a single narrative premise to carry forward."),
    throughLine: tidy(bundle.bookThread, "Each chapter advances the same book-wide through-line."),
    movement: bundle.bookMovement,
    continuityRules: [
      "Use this as connective tissue between chapters, not as final prose to paste into the manuscript.",
      "Do not treat this guidance as a real author memory, confirmed personal story, external story, or cited fact.",
      "When a real personal story is needed, use only confirmed Personal Stories assigned to the chapter.",
    ],
    boundary: BASE_STORY_BOUNDARY,
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

export function buildDefaultChapterGuidance(
  chapter: Pick<BaseStoryChapter, "chapterPurpose" | "threadRole" | "chapterStory" | "movement">,
): ChapterNarrativeGuidance {
  return {
    narrativeFunction: tidy(
      chapter.chapterPurpose,
      "Clarify what this chapter contributes to the book-wide argument.",
    ),
    continuityCue: tidy(
      chapter.threadRole,
      "Connect this chapter back to the book-wide thread and forward to the next turn.",
    ),
    draftingInstruction: tidy(
      chapter.chapterStory,
      "Use this as a drafting cue for continuity, not as a literal story to present as fact.",
    ),
    movement: chapter.movement,
    boundary: BASE_STORY_BOUNDARY,
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

export function normalizeBookWideNarrativeGuidance(
  guidance: Partial<BookWideNarrativeGuidance> | null | undefined,
  bundle: Pick<BaseStoryBundle, "storyPremise" | "bookThread" | "bookMovement">,
): BookWideNarrativeGuidance {
  const fallback = buildDefaultBookGuidance(bundle);
  return {
    premise: tidy(guidance?.premise, fallback.premise),
    throughLine: tidy(guidance?.throughLine, fallback.throughLine),
    movement: normalizeMovement(guidance?.movement, fallback.movement),
    continuityRules:
      Array.isArray(guidance?.continuityRules) && guidance.continuityRules.length > 0
        ? guidance.continuityRules.map((rule) => tidy(rule, "")).filter(Boolean)
        : fallback.continuityRules,
    boundary: BASE_STORY_BOUNDARY,
  };
}

export function normalizeChapterNarrativeGuidance(
  guidance: Partial<ChapterNarrativeGuidance> | null | undefined,
  chapter: Pick<BaseStoryChapter, "chapterPurpose" | "threadRole" | "chapterStory" | "movement">,
): ChapterNarrativeGuidance {
  const fallback = buildDefaultChapterGuidance(chapter);
  return {
    narrativeFunction: tidy(guidance?.narrativeFunction, fallback.narrativeFunction),
    continuityCue: tidy(guidance?.continuityCue, fallback.continuityCue),
    draftingInstruction: tidy(guidance?.draftingInstruction, fallback.draftingInstruction),
    movement: normalizeMovement(guidance?.movement, fallback.movement),
    boundary: BASE_STORY_BOUNDARY,
  };
}

export function normalizeBaseStoryChapter(chapter: LegacyBaseStoryChapter): BaseStoryChapter {
  const movement = normalizeMovement(chapter.movement, buildDefaultChapterMovement(chapter));
  const normalized = {
    ...chapter,
    movement,
  };

  return {
    ...normalized,
    guidance: normalizeChapterNarrativeGuidance(chapter.guidance, normalized),
  };
}

export function normalizeBaseStoryBundle(bundle: LegacyBaseStoryBundle | null): BaseStoryBundle | null {
  if (!bundle) {
    return null;
  }

  const bookMovement = normalizeMovement(bundle.bookMovement, buildDefaultBookMovement(bundle));
  const normalizedBook = {
    ...bundle,
    bookMovement,
  };

  return {
    ...normalizedBook,
    narrativeGuidance: normalizeBookWideNarrativeGuidance(
      bundle.narrativeGuidance,
      normalizedBook,
    ),
    chapters: (bundle.chapters ?? []).map(normalizeBaseStoryChapter),
  };
}

export function buildCompactBaseStoryChapterGuidance(
  bundle: BaseStoryBundle | null,
  chapterKey: string,
) {
  const chapter = bundle?.chapters.find((entry) => entry.chapterKey === chapterKey);
  if (!bundle || !chapter) {
    return null;
  }

  return {
    source: "BASE_STORY_GUIDANCE" as const,
    chapterKey,
    book: {
      premise: bundle.narrativeGuidance.premise,
      throughLine: bundle.narrativeGuidance.throughLine,
      movement: bundle.narrativeGuidance.movement,
      boundary: bundle.narrativeGuidance.boundary,
    },
    chapter: {
      narrativeFunction: chapter.guidance.narrativeFunction,
      continuityCue: chapter.guidance.continuityCue,
      draftingInstruction: chapter.guidance.draftingInstruction,
      movement: chapter.guidance.movement,
      boundary: chapter.guidance.boundary,
    },
  };
}

export function validateBaseStoryGuidanceContract(
  bundle: BaseStoryBundle | null,
  expectedChapterKeys?: string[],
) {
  const issues: string[] = [];

  if (!bundle) {
    return {
      ok: false,
      issues: ["Base Story bundle is missing."],
    };
  }

  if (bundle.narrativeGuidance.boundary.kind !== "base_story_guidance") {
    issues.push("Book-wide guidance must be labeled as Base Story guidance.");
  }

  if (!bundle.narrativeGuidance.boundary.personalStoryPolicy.toLowerCase().includes("not")) {
    issues.push("Book-wide guidance must explicitly distinguish itself from personal stories.");
  }

  const seen = new Set<string>();
  for (const chapter of bundle.chapters) {
    if (seen.has(chapter.chapterKey)) {
      issues.push(`Duplicate Base Story chapter key: ${chapter.chapterKey}`);
    }
    seen.add(chapter.chapterKey);

    if (chapter.guidance.boundary.kind !== "base_story_guidance") {
      issues.push(`Chapter ${chapter.chapterKey} guidance must be labeled as Base Story guidance.`);
    }
    if (!chapter.guidance.boundary.personalStoryPolicy.toLowerCase().includes("not")) {
      issues.push(`Chapter ${chapter.chapterKey} guidance must distinguish itself from personal stories.`);
    }
    if (!chapter.guidance.draftingInstruction.trim()) {
      issues.push(`Chapter ${chapter.chapterKey} is missing compact drafting guidance.`);
    }
  }

  for (const chapterKey of expectedChapterKeys ?? []) {
    if (!seen.has(chapterKey)) {
      issues.push(`Missing Base Story guidance for chapter ${chapterKey}.`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
