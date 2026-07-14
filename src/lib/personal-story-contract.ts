import type {
  PersonalStoryAssignment,
  PersonalStoryEncyclopedia,
  PersonalStoryEntry,
  PersonalStoryPermission,
  PersonalStoryProvenance,
  PersonalStoryUsage,
} from "./personal-story-types";

export type PersonalStoryReadiness = "READY" | "NEEDS_DETAIL" | "PERMISSION_BLOCKED" | "NOT_APPLICABLE";

export type CanonicalPersonalStory = PersonalStoryEntry & {
  provenance: PersonalStoryProvenance;
  permission: PersonalStoryPermission;
  missingDetails: string[];
  assignments: PersonalStoryAssignment[];
  usageHistory: PersonalStoryUsage[];
  readiness: PersonalStoryReadiness;
};

export type CompactPersonalStoryCard = {
  id: string;
  title: string;
  summary: string;
  lesson: string;
  whyItMatters: string;
  storyType: PersonalStoryEntry["storyType"];
  emotionalNotes: string[];
  assignment: {
    chapterKey: string;
    chapterTitle?: string | null;
    relevance: string;
  };
  permissionStatus: "granted";
};

function tidy(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeProvenance(entry: PersonalStoryEntry): PersonalStoryProvenance {
  return {
    rawNotes:
      Array.isArray(entry.provenance?.rawNotes) && entry.provenance.rawNotes.length > 0
        ? entry.provenance.rawNotes.filter((note) => tidy(note))
        : [entry.sourceQuote].filter((note): note is string => Boolean(tidy(note))),
    sourceMessageIds: Array.isArray(entry.provenance?.sourceMessageIds)
      ? entry.provenance.sourceMessageIds.filter((id) => Boolean(tidy(id)))
      : [],
    capturedAt: entry.provenance?.capturedAt ?? null,
  };
}

function normalizePermission(entry: PersonalStoryEntry): PersonalStoryPermission {
  if (entry.permission) {
    return {
      status: entry.permission.status,
      notes: entry.permission.notes ?? null,
    };
  }

  return {
    status: entry.status === "not_applicable" ? "restricted" : "needs_review",
    notes:
      "Permission has not been explicitly confirmed. Review before using this story in final prose.",
  };
}

function normalizeAssignments(entry: PersonalStoryEntry): PersonalStoryAssignment[] {
  if (Array.isArray(entry.assignments) && entry.assignments.length > 0) {
    return entry.assignments
      .filter((assignment) => tidy(assignment.chapterKey))
      .map((assignment) => ({
        chapterKey: assignment.chapterKey,
        chapterTitle: assignment.chapterTitle ?? null,
        relevance: tidy(assignment.relevance) ?? "Assigned to this chapter.",
      }));
  }

  return entry.chapterFitHints
    .map((hint) => tidy(hint))
    .filter((hint): hint is string => Boolean(hint))
    .map((hint) => ({
      chapterKey: hint,
      chapterTitle: null,
      relevance: "Legacy chapter fit hint. Confirm chapter ID before drafting.",
    }));
}

function inferMissingDetails(entry: PersonalStoryEntry) {
  const explicit = Array.isArray(entry.missingDetails) ? entry.missingDetails.filter(Boolean) : [];
  if (explicit.length > 0) {
    return explicit;
  }
  if (entry.status === "needs_detail") {
    return ["Story needs more concrete detail before drafting."];
  }
  return [];
}

function inferReadiness(
  entry: PersonalStoryEntry,
  permission: PersonalStoryPermission,
  missingDetails: string[],
): PersonalStoryReadiness {
  if (entry.status === "not_applicable") {
    return "NOT_APPLICABLE";
  }
  if (entry.status === "needs_detail" || missingDetails.length > 0) {
    return "NEEDS_DETAIL";
  }
  if (permission.status !== "granted") {
    return "PERMISSION_BLOCKED";
  }
  return "READY";
}

export function normalizePersonalStoryEntry(entry: PersonalStoryEntry): CanonicalPersonalStory {
  const provenance = normalizeProvenance(entry);
  const permission = normalizePermission(entry);
  const missingDetails = inferMissingDetails(entry);
  const assignments = normalizeAssignments(entry);
  const usageHistory = Array.isArray(entry.usageHistory) ? entry.usageHistory : [];

  return {
    ...entry,
    provenance,
    permission,
    missingDetails,
    assignments,
    usageHistory,
    readiness: inferReadiness(entry, permission, missingDetails),
  };
}

export function normalizePersonalStoryEncyclopedia(
  encyclopedia: PersonalStoryEncyclopedia,
) {
  const entries = encyclopedia.entries.map(normalizePersonalStoryEntry);
  return {
    ...encyclopedia,
    entries,
    readinessSummary: {
      totalStories: entries.length,
      readyStories: entries.filter((entry) => entry.readiness === "READY").length,
      needsDetailStories: entries.filter((entry) => entry.readiness === "NEEDS_DETAIL").length,
      permissionBlockedStories: entries.filter(
        (entry) => entry.readiness === "PERMISSION_BLOCKED",
      ).length,
      notApplicableStories: entries.filter((entry) => entry.readiness === "NOT_APPLICABLE").length,
    },
  };
}

export function getReadyPersonalStoriesForChapter(
  encyclopedia: PersonalStoryEncyclopedia | null,
  chapter: { chapterKey: string; chapterTitle: string },
) {
  if (!encyclopedia) {
    return [];
  }

  const titleWords = chapter.chapterTitle.toLowerCase().split(/\W+/).filter(Boolean);
  return encyclopedia.entries
    .map(normalizePersonalStoryEntry)
    .filter((entry) => entry.readiness === "READY")
    .filter((entry) => entry.status === "candidate" || entry.status === "strong")
    .filter((entry) => {
      const assigned = entry.assignments.some(
        (assignment) =>
          assignment.chapterKey === chapter.chapterKey ||
          assignment.chapterTitle?.toLowerCase() === chapter.chapterTitle.toLowerCase(),
      );
      const haystack = `${entry.title} ${entry.summary} ${entry.whyItMatters}`.toLowerCase();
      return (
        assigned ||
        titleWords.some((word) => word.length > 3 && haystack.includes(word))
      );
    })
    .slice(0, 4);
}

export function getPersonalStoryFollowUpsForChapter(
  encyclopedia: PersonalStoryEncyclopedia | null,
  chapter: { chapterKey: string; chapterTitle: string },
) {
  if (!encyclopedia) {
    return [];
  }

  const titleWords = chapter.chapterTitle.toLowerCase().split(/\W+/).filter(Boolean);
  return encyclopedia.entries
    .map(normalizePersonalStoryEntry)
    .filter((entry) => entry.readiness !== "READY")
    .filter((entry) => {
      const assigned = entry.assignments.some(
        (assignment) =>
          assignment.chapterKey === chapter.chapterKey ||
          assignment.chapterTitle?.toLowerCase() === chapter.chapterTitle.toLowerCase(),
      );
      const haystack = `${entry.title} ${entry.summary} ${entry.whyItMatters}`.toLowerCase();
      return (
        assigned ||
        titleWords.some((word) => word.length > 3 && haystack.includes(word))
      );
    })
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      readiness: entry.readiness,
      missingDetails: entry.missingDetails,
      permissionStatus: entry.permission.status,
      followUp:
        entry.readiness === "NEEDS_DETAIL"
          ? `Ask for missing details before using "${entry.title}".`
          : entry.readiness === "PERMISSION_BLOCKED"
            ? `Resolve permission before using "${entry.title}".`
            : `Do not use "${entry.title}" in this chapter.`,
    }));
}

export function getCompactPersonalStoryCardsForChapter(
  encyclopedia: PersonalStoryEncyclopedia | null,
  chapter: { chapterKey: string; chapterTitle: string },
): CompactPersonalStoryCard[] {
  if (!encyclopedia) {
    return [];
  }

  return encyclopedia.entries
    .map(normalizePersonalStoryEntry)
    .filter((entry) => entry.readiness === "READY")
    .flatMap((entry) =>
      entry.assignments
        .filter(
          (assignment) =>
            assignment.chapterKey === chapter.chapterKey ||
            assignment.chapterTitle?.toLowerCase() === chapter.chapterTitle.toLowerCase(),
        )
        .map((assignment) => ({
          id: entry.id,
          title: entry.title,
          summary: entry.summary,
          lesson: entry.lesson,
          whyItMatters: entry.whyItMatters,
          storyType: entry.storyType,
          emotionalNotes: entry.emotionalNotes.slice(0, 4),
          assignment: {
            chapterKey: assignment.chapterKey,
            chapterTitle: assignment.chapterTitle ?? null,
            relevance: assignment.relevance,
          },
          permissionStatus: "granted" as const,
        })),
    )
    .slice(0, 4);
}
