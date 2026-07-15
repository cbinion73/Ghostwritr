import type { BaseStoryBundle } from "../../base-story-types";
import {
  buildExternalStoryDossierFromStructuredRows,
  buildResearchDossierFromStructuredRows,
} from "../../repositories/structured-dossiers";
import { getCommittedExternalStoryPack } from "../../repositories/external-stories-artifacts";
import { getCommittedResearchPack } from "../../repositories/research-artifacts";
import { getCurrentSourceAdmissions } from "../../repositories/source-verification";
import {
  getAdmissibleExternalStories,
  getAdmissibleResearchItems,
} from "../../source-evidence-contract";
import type { ChapterExternalStoryDossier } from "../../external-story-types";
import {
  getCompactPersonalStoryCardsForChapter,
  getReadyPersonalStoriesForChapter,
} from "../../personal-story-contract";
import type { PersonalStoryEncyclopedia } from "../../personal-story-types";
import type { ChapterResearchDossier } from "../../research-types";

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

export async function getCommittedResearchDossier(bookId: string, chapterKey: string) {
  const committed = await getCommittedResearchPack(bookId, chapterKey);
  const parsed = committed
    ? parseJson<ChapterResearchDossier | null>(committed.contentJson, null)
    : null;
  // Legacy dossiers are {text} blobs — only trust the parse when it actually
  // has the structured shape. Otherwise fall back to the structured tables
  // populated by the background extraction pass, so blob-era research still
  // reaches the author model.
  if (parsed && Array.isArray(parsed.factBank)) {
    const admissions = await getCurrentSourceAdmissions({
      bookId,
      chapterKey,
      artifactVersionIds: committed ? [committed.id] : [],
    });
    return getAdmissibleResearchItems(parsed, admissions).dossier;
  }
  const structured = await buildResearchDossierFromStructuredRows(bookId, chapterKey, chapterKey);
  if (!structured) {
    return null;
  }
  const admissions = committed ? await getCurrentSourceAdmissions({
    bookId,
    chapterKey,
    artifactVersionIds: [committed.id],
  }) : new Map();
  return getAdmissibleResearchItems(structured, admissions).dossier;
}

export async function getCommittedExternalStoriesDossier(bookId: string, chapterKey: string) {
  const committed = await getCommittedExternalStoryPack(bookId, chapterKey);
  const parsed = committed
    ? parseJson<ChapterExternalStoryDossier | null>(committed.contentJson, null)
    : null;
  if (parsed && Array.isArray(parsed.storyCandidates)) {
    const admissions = await getCurrentSourceAdmissions({
      bookId,
      chapterKey,
      artifactVersionIds: committed ? [committed.id] : [],
    });
    return getAdmissibleExternalStories(parsed, admissions).dossier;
  }
  const structured = await buildExternalStoryDossierFromStructuredRows(bookId, chapterKey, chapterKey);
  if (!structured) {
    return null;
  }
  const admissions = committed ? await getCurrentSourceAdmissions({
    bookId,
    chapterKey,
    artifactVersionIds: [committed.id],
  }) : new Map();
  return getAdmissibleExternalStories(structured, admissions).dossier;
}

export function findBaseStoryChapter(
  baseStory: BaseStoryBundle | null,
  chapterKey: string,
) {
  return baseStory?.chapters.find((chapter) => chapter.chapterKey === chapterKey) ?? null;
}

export function findRelevantPersonalStories(
  encyclopedia: PersonalStoryEncyclopedia | null,
  chapter: { chapterKey: string; chapterTitle: string },
) {
  return getReadyPersonalStoriesForChapter(encyclopedia, chapter);
}

export function findPersonalStoryCards(
  encyclopedia: PersonalStoryEncyclopedia | null,
  chapter: { chapterKey: string; chapterTitle: string },
) {
  return getCompactPersonalStoryCardsForChapter(encyclopedia, chapter);
}

export async function getChapterDraftSourceContext(input: {
  bookId: string;
  chapterKey: string;
  chapterTitle: string;
  baseStory: BaseStoryBundle | null;
  personalStories: PersonalStoryEncyclopedia | null;
}) {
  const [research, externalStories] = await Promise.all([
    getCommittedResearchDossier(input.bookId, input.chapterKey),
    getCommittedExternalStoriesDossier(input.bookId, input.chapterKey),
  ]);

  const personalStoryCards = findPersonalStoryCards(input.personalStories, {
    chapterKey: input.chapterKey,
    chapterTitle: input.chapterTitle,
  });
  const baseStoryChapter = findBaseStoryChapter(input.baseStory, input.chapterKey);

  return {
    research,
    externalStories,
    personalStoryCards,
    baseStoryChapter,
  };
}
