import { ArtifactType, StageKey } from "@prisma/client";

import { getBookBySlugOrThrow } from "../../repositories/books";
import {
  commitPersonalStoriesStageBundle,
  getPersonalStoryArtifactVersions,
} from "../../repositories/personal-stories-artifacts";
import type { PersonalStoryEncyclopedia } from "../../personal-story-types";
import {
  clearStageStaleDependency,
  invalidateDependentStagesForBook,
} from "../../workflow-dependencies";
import {
  getCommittedChapterBlueprints,
  normalizeEncyclopedia,
  parseJson,
} from "./support";

export async function commitPersonalStoriesWorkflow(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const chapterBlueprints = await getCommittedChapterBlueprints(book.id);
  if (chapterBlueprints.length === 0) {
    throw new Error("Commit the paragraph-level Outline before committing Personal Stories.");
  }
  const encyclopediaVersions = await getPersonalStoryArtifactVersions(
    book.id,
    ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
    1,
  );
  const latestEncyclopedia = normalizeEncyclopedia(
    parseJson<Partial<PersonalStoryEncyclopedia> | null>(
      encyclopediaVersions[0]?.contentJson,
      null,
    ),
  );
  if (latestEncyclopedia.entries.length === 0) {
    throw new Error("Capture at least one personal story before committing the encyclopedia.");
  }
  const result = await commitPersonalStoriesStageBundle(book.id);
  await clearStageStaleDependency(bookSlug, StageKey.PERSONAL_STORIES);
  await invalidateDependentStagesForBook(bookSlug, StageKey.PERSONAL_STORIES);
  return result;
}
