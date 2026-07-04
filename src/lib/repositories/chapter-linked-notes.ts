/**
 * The digital brain — read model for a committed chapter's research facts
 * and external stories, shown as Obsidian/Roam-style backlinked notes.
 *
 * Data shape: the structured ResearchItem/ExternalStoryItem tables are
 * populated by the background extraction pass (structured-extraction.ts)
 * whenever a dossier is saved, plus the one-time backfill for legacy
 * artifacts. When a chapter has no structured rows (extraction pending or
 * failed) this falls back to the real dossier text — one note per pack,
 * not fabricated granularity — so the feature always works.
 *
 * "usedInDraft" is the citation trace: the chapter-draft author reports
 * which item ids it actually wove into the prose (sourceUsage.researchItemIds
 * / externalStoryItemIds on the committed draft bundle).
 *
 * No schema changes. Backlinks are computed here, not stored — system-
 * generated only, no manual link authoring.
 */

import { ArtifactType } from "@prisma/client";

import { db } from "../db";
import {
  getLatestResearchPackVersionsByChapter,
  getResearchItemsForVersion,
  getResearchSourcesForVersion,
} from "./research-artifacts";
import {
  getLatestExternalStoryPackVersionsByChapter,
  getExternalStoriesForVersion,
  getExternalStorySourcesForVersion,
} from "./external-stories-artifacts";

export type LinkedResearchNote = {
  id: string;
  itemType: string;
  claimText: string;
  evidenceExcerpt: string | null;
  sourceTier: string;
  verificationStatus: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  /** True when the committed chapter draft's citation trace includes this item. */
  usedInDraft: boolean;
};

export type LinkedStoryNote = {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  storyType: string;
  storyFit: string;
  sourceTier: string;
  verificationStatus: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  /** True when the committed chapter draft's citation trace includes this story. */
  usedInDraft: boolean;
};

export type LinkedNoteBacklink = {
  researchItemId: string;
  storyItemId: string;
  reason: string;
};

export type ChapterLinkedNotes = {
  chapterKey: string;
  research: LinkedResearchNote[];
  stories: LinkedStoryNote[];
  backlinks: LinkedNoteBacklink[];
};

// Rough thematic compatibility between a research item's type and a
// story's type/fit — deterministic grouping, not fuzzy matching.
const THEME_COMPATIBILITY: Record<string, string[]> = {
  STATISTIC: ["PROOF_POINT", "CREDIBILITY"],
  CASE_STUDY: ["PROOF_POINT", "TURNING_POINT", "INNOVATION"],
  EXAMPLE: ["PROOF_POINT", "MICRO_STORY"],
  QUOTE: ["CREDIBILITY", "MORAL"],
  COUNTERPOINT: ["CONTRADICTION", "FAILURE"],
  FACT: ["OPENING_HOOK", "CHAPTER_PIVOT"],
  DEFINITION: ["OPENING_HOOK"],
};

/**
 * Read the citation trace (which structured item ids the author actually
 * used) from the latest chapter-draft bundle for this chapter.
 */
async function getDraftCitationTrace(bookId: string, chapterKey: string) {
  const empty = { research: new Set<string>(), stories: new Set<string>() };
  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType: ArtifactType.CHAPTER_DRAFT,
      metadataJson: { path: ["chapterKey"], equals: chapterKey },
    },
    orderBy: { createdAt: "desc" },
    select: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { contentJson: true },
      },
    },
  });
  const bundle = artifact?.versions[0]?.contentJson;
  if (!bundle || typeof bundle !== "object") return empty;
  const usage = (bundle as { sourceUsage?: { researchItemIds?: unknown; externalStoryItemIds?: unknown } })
    .sourceUsage;
  if (!usage) return empty;
  return {
    research: new Set(Array.isArray(usage.researchItemIds) ? (usage.researchItemIds as string[]) : []),
    stories: new Set(
      Array.isArray(usage.externalStoryItemIds) ? (usage.externalStoryItemIds as string[]) : [],
    ),
  };
}

function extractDossierText(contentJson: unknown): string | null {
  if (
    contentJson &&
    typeof contentJson === "object" &&
    "text" in contentJson &&
    typeof (contentJson as { text: unknown }).text === "string"
  ) {
    return (contentJson as { text: string }).text;
  }
  return null;
}

export async function getLinkedNotesForChapter(
  bookId: string,
  chapterKey: string,
): Promise<ChapterLinkedNotes> {
  const [researchVersions, storyVersions] = await Promise.all([
    getLatestResearchPackVersionsByChapter(bookId, [chapterKey]),
    getLatestExternalStoryPackVersionsByChapter(bookId, [chapterKey]),
  ]);

  const researchVersion = researchVersions.get(chapterKey) ?? null;
  const storyVersion = storyVersions.get(chapterKey) ?? null;

  const [researchItems, researchSources, storyItems, storySources, usedIds] = await Promise.all([
    researchVersion ? getResearchItemsForVersion(researchVersion.id) : Promise.resolve([]),
    researchVersion ? getResearchSourcesForVersion(researchVersion.id) : Promise.resolve([]),
    storyVersion ? getExternalStoriesForVersion(storyVersion.id) : Promise.resolve([]),
    storyVersion ? getExternalStorySourcesForVersion(storyVersion.id) : Promise.resolve([]),
    getDraftCitationTrace(bookId, chapterKey),
  ]);

  const sourceById = new Map(researchSources.map((s) => [s.id, s]));
  const storySourceById = new Map(storySources.map((s) => [s.id, s]));

  let research: LinkedResearchNote[] = researchItems
    .filter((item) => item.chapterKey === chapterKey)
    .map((item) => {
      const source = sourceById.get(item.sourceRecordId);
      return {
        id: item.id,
        itemType: item.itemType,
        claimText: item.claimText,
        evidenceExcerpt: item.evidenceExcerpt ?? null,
        sourceTier: item.sourceTier,
        verificationStatus: item.verificationStatus,
        sourceTitle: source?.title ?? null,
        sourceUrl: source?.url ?? null,
        usedInDraft: usedIds.research.has(item.id),
      };
    });

  let stories: LinkedStoryNote[] = storyItems
    .filter((item) => item.chapterKey === chapterKey)
    .map((item) => {
      const source = storySourceById.get(item.sourceRecordId);
      return {
        id: item.id,
        title: item.title,
        summary: item.summary,
        whyItMatters: item.whyItMatters,
        storyType: item.storyType,
        storyFit: item.storyFit,
        sourceTier: item.sourceTier,
        verificationStatus: item.verificationStatus,
        sourceTitle: source?.title ?? null,
        sourceUrl: source?.url ?? null,
        usedInDraft: usedIds.stories.has(item.id),
      };
    });

  // Fallback: no structured rows for this chapter (extraction pending) —
  // surface the real dossier text as a single note per pack instead of
  // showing nothing.
  if (research.length === 0 && researchVersion) {
    const text = extractDossierText(researchVersion.contentJson);
    if (text) {
      research = [
        {
          id: `dossier-${researchVersion.id}`,
          itemType: "DOSSIER",
          claimText: text,
          evidenceExcerpt: null,
          sourceTier: "A",
          verificationStatus: "VERIFIED",
          sourceTitle: null,
          sourceUrl: null,
          usedInDraft: false,
        },
      ];
    }
  }

  if (stories.length === 0 && storyVersion) {
    const text = extractDossierText(storyVersion.contentJson);
    if (text) {
      stories = [
        {
          id: `dossier-${storyVersion.id}`,
          title: "Story Dossier",
          summary: text,
          whyItMatters: "",
          storyType: "DOSSIER",
          storyFit: "PROOF_POINT",
          sourceTier: "A",
          verificationStatus: "VERIFIED",
          sourceTitle: null,
          sourceUrl: null,
          usedInDraft: false,
        },
      ];
    }
  }

  const backlinks: LinkedNoteBacklink[] = [];
  for (const note of research) {
    const compatibleFits = THEME_COMPATIBILITY[note.itemType] ?? [];
    if (compatibleFits.length === 0) continue;
    for (const story of stories) {
      if (compatibleFits.includes(story.storyFit) || compatibleFits.includes(story.storyType)) {
        backlinks.push({
          researchItemId: note.id,
          storyItemId: story.id,
          reason: `${note.itemType} pairs with ${story.storyFit.replace(/_/g, " ").toLowerCase()}`,
        });
      }
    }
  }
  // The dossier fallback always backlinks (single note per side, same
  // chapter) rather than relying on the itemType/storyFit heuristic, which
  // doesn't apply to a DOSSIER-type note.
  if (research.length === 1 && research[0].itemType === "DOSSIER" && stories.length === 1 && stories[0].storyType === "DOSSIER") {
    backlinks.push({
      researchItemId: research[0].id,
      storyItemId: stories[0].id,
      reason: "same chapter",
    });
  }

  return { chapterKey, research, stories, backlinks };
}
