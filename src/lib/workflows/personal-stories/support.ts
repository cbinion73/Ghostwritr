import { ParagraphOutlineSchema, parseArtifactWithSchema } from "../../artifact-schemas";
import { getCommittedOutlineExpansion } from "../../repositories/outline-artifacts";
import type { ParagraphOutline } from "../../paragraph-outline-types";
import type {
  PersonalStoryEncyclopedia,
  PersonalStoryEntry,
  PersonalStoryMessage,
} from "../../personal-story-types";

export type ChapterBlueprint = {
  chapterKey: string;
  chapterLabel: string;
  chapterTitle: string;
  chapterDescription: string;
  sectionTitle: string;
};

export function parseJson<T>(value: unknown, fallback: T): T {
  return value && typeof value === "object" ? (value as T) : fallback;
}

export function normalizeTranscript(value: unknown): PersonalStoryMessage[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is PersonalStoryMessage =>
          Boolean(
            item &&
              typeof item === "object" &&
              "role" in item &&
              "content" in item &&
              (item as { role?: unknown }).role &&
              typeof (item as { content?: unknown }).content === "string",
          ),
      )
    : [];
}

export function getDefaultEncyclopedia(): PersonalStoryEncyclopedia {
  return {
    interviewFocus:
      "Build a wide-ranging encyclopedia of lived experiences, leadership moments, failures, recoveries, identity stories, and observations that can later support the book.",
    nextQuestion:
      "What is one experience from your life or work that changed how you lead, decide, or communicate?",
    entries: [],
    noStoryTopics: [],
    coverageGaps: [
      "origin story",
      "failure or setback",
      "turning point",
      "leadership under pressure",
      "identity or belief shift",
    ],
    interviewerNotes: [
      "Gather more stories than the book strictly needs.",
      "A short concrete memory is better than a polished speech.",
      "If there is no story for an area, record that clearly and move on.",
    ],
  };
}

function buildChapterBlueprints(outline: ParagraphOutline | null): ChapterBlueprint[] {
  return (
    outline?.sections.flatMap((section) =>
      section.chapters.map((chapter) => ({
        chapterKey: chapter.chapterId,
        chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`,
        chapterTitle: chapter.chapterTitle,
        chapterDescription: chapter.chapterDescription,
        sectionTitle: section.sectionTitle,
      })),
    ) ?? []
  );
}

export async function getCommittedChapterBlueprints(bookId: string) {
  const committedOutlineVersion = await getCommittedOutlineExpansion(bookId);
  const outline = parseArtifactWithSchema(
    committedOutlineVersion?.contentJson,
    ParagraphOutlineSchema,
  );
  return buildChapterBlueprints(outline);
}

export function inferInterviewFocus(chapters: ChapterBlueprint[]) {
  if (chapters.length === 0) return getDefaultEncyclopedia().interviewFocus;
  const preview = chapters.slice(0, 4).map((chapter) => chapter.chapterLabel).join(", ");
  return `Build a chapter-aware encyclopedia of lived experiences, leadership moments, failures, recoveries, identity stories, and observations that can support specific chapters in this book. Prioritize memories that could fit ${preview}${chapters.length > 4 ? ", and the rest of the outline" : ""}.`;
}

export function inferNextQuestion(chapters: ChapterBlueprint[]) {
  const firstChapter = chapters[0];
  return firstChapter
    ? `For ${firstChapter.chapterLabel}, what real experience from your life or work best illustrates the chapter's central tension or lesson?`
    : getDefaultEncyclopedia().nextQuestion;
}

export function buildChapterCoverage(
  chapters: ChapterBlueprint[],
  encyclopedia: PersonalStoryEncyclopedia,
) {
  return chapters.map((chapter) => {
    const matchedEntries = encyclopedia.entries.filter((entry) =>
      entry.chapterFitHints.some(
        (hint) =>
          hint.toLowerCase().includes(chapter.chapterTitle.toLowerCase()) ||
          hint.toLowerCase().includes(chapter.chapterLabel.toLowerCase()),
      ),
    );
    return {
      ...chapter,
      matchedStoryCount: matchedEntries.length,
      matchedStoryTitles: matchedEntries.slice(0, 3).map((entry) => entry.title),
    };
  });
}

export function normalizeEntry(
  entry: Omit<PersonalStoryEntry, "emotionalNotes" | "chapterFitHints" | "sourceQuote"> & {
    emotionalNotes?: string[];
    chapterFitHints?: string[];
    sourceQuote?: string | null;
  },
  index: number,
): PersonalStoryEntry {
  return {
    ...entry,
    id: entry.id || `story-${index + 1}`,
    emotionalNotes: entry.emotionalNotes ?? [],
    chapterFitHints: entry.chapterFitHints ?? [],
    sourceQuote: entry.sourceQuote ?? null,
  };
}

export function normalizeEncyclopedia(
  value: Partial<PersonalStoryEncyclopedia> | null | undefined,
): PersonalStoryEncyclopedia {
  const fallback = getDefaultEncyclopedia();
  return {
    interviewFocus: value?.interviewFocus ?? fallback.interviewFocus,
    nextQuestion: value?.nextQuestion ?? fallback.nextQuestion,
    entries: Array.isArray(value?.entries)
      ? value.entries.map((entry, index) => normalizeEntry(entry, index))
      : fallback.entries,
    noStoryTopics: Array.isArray(value?.noStoryTopics) ? value.noStoryTopics : fallback.noStoryTopics,
    coverageGaps: Array.isArray(value?.coverageGaps) ? value.coverageGaps : fallback.coverageGaps,
    interviewerNotes: Array.isArray(value?.interviewerNotes)
      ? value.interviewerNotes
      : fallback.interviewerNotes,
  };
}

export function mergeEntries(
  existing: PersonalStoryEntry[],
  incoming: PersonalStoryEntry[],
): PersonalStoryEntry[] {
  const byId = new Map<string, PersonalStoryEntry>();
  const byTitle = new Map<string, string>();
  for (const entry of existing) {
    const normalized = normalizeEntry(entry, byId.size);
    byId.set(normalized.id, normalized);
    byTitle.set(normalized.title.trim().toLowerCase(), normalized.id);
  }
  for (const entry of incoming) {
    const normalized = normalizeEntry(entry, byId.size);
    const titleKey = normalized.title.trim().toLowerCase();
    const existingId = byId.has(normalized.id) ? normalized.id : byTitle.get(titleKey);
    const targetId = existingId ?? normalized.id;
    const prior = byId.get(targetId);
    byId.set(targetId, {
      ...normalized,
      id: targetId,
      emotionalNotes: Array.from(
        new Set([...(prior?.emotionalNotes ?? []), ...normalized.emotionalNotes]),
      ),
      chapterFitHints: Array.from(
        new Set([...(prior?.chapterFitHints ?? []), ...normalized.chapterFitHints]),
      ),
    });
    byTitle.set(titleKey, targetId);
  }
  return Array.from(byId.values());
}
