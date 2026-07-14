import { ArtifactType, StageKey } from "@prisma/client";

import { parseMetadataRecord } from "../../artifact-schemas";
import { normalizePersonalStoryEncyclopedia } from "../../personal-story-contract";
import { getBookBySlugOrThrow, getStageForBook } from "../../repositories/books";
import {
  getCommittedPersonalStoryEncyclopedia,
  getPersonalStoryArtifactVersions,
  getPersonalStoriesArtifacts,
} from "../../repositories/personal-stories-artifacts";
import type { PersonalStoryEncyclopedia } from "../../personal-story-types";
import {
  buildChapterCoverage,
  getCommittedChapterBlueprints,
  getDefaultEncyclopedia,
  normalizeEncyclopedia,
  normalizeTranscript,
  parseJson,
} from "./support";

export async function getPersonalStoriesWorkspace(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const chapterBlueprints = await getCommittedChapterBlueprints(book.id);
  const stage = await getStageForBook(book.id, StageKey.PERSONAL_STORIES);
  const artifacts = await getPersonalStoriesArtifacts(book.id);
  const chatVersions = await getPersonalStoryArtifactVersions(
    book.id,
    ArtifactType.PERSONAL_STORY_CHAT,
  );
  const encyclopediaVersions = await getPersonalStoryArtifactVersions(
    book.id,
    ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
  );
  const committedEncyclopediaVersion = await getCommittedPersonalStoryEncyclopedia(book.id);

  const latestTranscript = normalizeTranscript(chatVersions[0]?.contentJson);
  const latestEncyclopedia = parseJson<PersonalStoryEncyclopedia>(
    encyclopediaVersions[0]?.contentJson,
    getDefaultEncyclopedia(),
  );
  const committedEncyclopedia = parseJson<PersonalStoryEncyclopedia | null>(
    committedEncyclopediaVersion?.contentJson,
    null,
  );
  const normalizedLatestEncyclopedia = normalizeEncyclopedia(latestEncyclopedia);
  const normalizedCommittedEncyclopedia = committedEncyclopedia
    ? normalizeEncyclopedia(committedEncyclopedia)
    : null;
  const contractLatestEncyclopedia = normalizePersonalStoryEncyclopedia(
    normalizedLatestEncyclopedia,
  );
  const contractCommittedEncyclopedia = normalizedCommittedEncyclopedia
    ? normalizePersonalStoryEncyclopedia(normalizedCommittedEncyclopedia)
    : null;
  const metadata = parseMetadataRecord(stage?.metadataJson);

  return {
    book,
    stage,
    artifacts,
    transcript: latestTranscript,
    encyclopedia: contractLatestEncyclopedia,
    committedEncyclopedia: contractCommittedEncyclopedia,
    versions: { chat: chatVersions, encyclopedia: encyclopediaVersions },
    outlineReady: chapterBlueprints.length > 0,
    chapterBlueprints,
    chapterCoverage: buildChapterCoverage(chapterBlueprints, contractLatestEncyclopedia),
    progress: {
      interviewStatus:
        typeof metadata.interviewStatus === "string" ? metadata.interviewStatus : "idle",
      storyCount:
        typeof metadata.storyCount === "number"
          ? metadata.storyCount
          : normalizedLatestEncyclopedia.entries.length,
      noStoryTopicCount:
        typeof metadata.noStoryTopicCount === "number"
          ? metadata.noStoryTopicCount
          : normalizedLatestEncyclopedia.noStoryTopics.length,
      nextQuestion:
        typeof metadata.nextQuestion === "string"
          ? metadata.nextQuestion
          : normalizedLatestEncyclopedia.nextQuestion,
    },
  };
}
