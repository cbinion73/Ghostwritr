import type {
  ChapterExternalStoryDossier,
  ChapterExternalStoryItem,
  ChapterExternalStorySource,
} from "./external-story-types";
import type {
  ChapterResearchDossier,
  ChapterResearchItem,
  ChapterResearchSource,
} from "./research-types";

export type EvidenceKind = "RESEARCH_CLAIM" | "EXTERNAL_STORY";

export type EvidenceAdmissibility = "ADMISSIBLE" | "NEEDS_CORROBORATION" | "EXCLUDED";

export type EvidenceSourceMetadata = {
  id: string;
  url: string;
  canonicalUrl?: string | null;
  title: string;
  publisher?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  accessedAt?: string | null;
  contentType?: string | null;
  sourceTier: "A" | "B" | "C";
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED" | "NEEDS_CORROBORATION";
  verificationNotes?: string | null;
};

export type ChapterEvidenceRecord = {
  id: string;
  kind: EvidenceKind;
  chapterKey: string;
  title: string;
  claimOrStory: string;
  source: EvidenceSourceMetadata | null;
  supportingExcerpt: string | null;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED" | "NEEDS_CORROBORATION";
  relevance: {
    score: number | null;
    reason: string;
  };
  exclusions: string[];
  admissibility: EvidenceAdmissibility;
};

export type ChapterEvidenceContract = {
  chapterKey: string;
  chapterTitle: string;
  records: ChapterEvidenceRecord[];
  summary: {
    totalRecords: number;
    admissibleRecords: number;
    needsCorroborationRecords: number;
    excludedRecords: number;
  };
};

function tidy(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function sourceToMetadata(
  source: ChapterResearchSource | ChapterExternalStorySource | undefined,
): EvidenceSourceMetadata | null {
  if (!source) {
    return null;
  }

  return {
    id: source.id,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    title: source.title,
    publisher: source.publisher,
    author: source.author,
    publishedAt: source.publishedAt,
    accessedAt: source.accessedAt,
    contentType: source.contentType,
    sourceTier: source.sourceTier,
    verificationStatus: source.verificationStatus,
    verificationNotes: source.verificationNotes,
  };
}

function scoreToRelevance(score: number | null | undefined, fallbackReason: string) {
  return {
    score: typeof score === "number" ? score : null,
    reason: fallbackReason,
  };
}

function deriveAdmissibility(input: {
  verificationStatus: ChapterEvidenceRecord["verificationStatus"];
  source: EvidenceSourceMetadata | null;
  supportingExcerpt: string | null;
  exclusions: string[];
}): EvidenceAdmissibility {
  if (input.verificationStatus === "REJECTED" || input.exclusions.length > 0) {
    return "EXCLUDED";
  }

  if (
    input.verificationStatus === "VERIFIED" &&
    input.source?.verificationStatus === "VERIFIED" &&
    input.supportingExcerpt
  ) {
    return "ADMISSIBLE";
  }

  return "NEEDS_CORROBORATION";
}

function summarize(records: ChapterEvidenceRecord[]): ChapterEvidenceContract["summary"] {
  return {
    totalRecords: records.length,
    admissibleRecords: records.filter((record) => record.admissibility === "ADMISSIBLE").length,
    needsCorroborationRecords: records.filter(
      (record) => record.admissibility === "NEEDS_CORROBORATION",
    ).length,
    excludedRecords: records.filter((record) => record.admissibility === "EXCLUDED").length,
  };
}

function researchItems(dossier: ChapterResearchDossier): ChapterResearchItem[] {
  const byId = new Map<string, ChapterResearchItem>();
  for (const item of [
    ...dossier.factBank,
    ...dossier.statistics,
    ...dossier.quotes,
    ...dossier.examples,
    ...dossier.counterpoints,
    ...dossier.definitions,
  ]) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

function researchExclusions(item: ChapterResearchItem, source: EvidenceSourceMetadata | null) {
  const exclusions: string[] = [];
  if (!source) exclusions.push("Missing source metadata.");
  if (!tidy(item.evidenceExcerpt)) exclusions.push("Missing supporting excerpt.");
  if (item.verificationStatus === "REJECTED") exclusions.push("Research item was rejected.");
  if (source?.verificationStatus === "REJECTED") exclusions.push("Source was rejected.");
  if (item.metadata?.provisional === true) exclusions.push("Research item is provisional.");
  return exclusions;
}

export function buildResearchEvidenceContract(
  dossier: ChapterResearchDossier,
): ChapterEvidenceContract {
  const sources = new Map(dossier.sourceRegister.map((source) => [source.id, source]));
  const records = researchItems(dossier).map((item) => {
    const source = sourceToMetadata(sources.get(item.sourceId));
    const exclusions = researchExclusions(item, source);
    const supportingExcerpt = tidy(item.evidenceExcerpt);
    const record: ChapterEvidenceRecord = {
      id: item.id,
      kind: "RESEARCH_CLAIM",
      chapterKey: dossier.chapterKey,
      title: item.itemType,
      claimOrStory: item.claimText,
      source,
      supportingExcerpt,
      verificationStatus: item.verificationStatus,
      relevance: scoreToRelevance(
        item.relevanceScore,
        item.summary ?? `Mapped to chapter "${dossier.chapterTitle}".`,
      ),
      exclusions,
      admissibility: "NEEDS_CORROBORATION",
    };
    return {
      ...record,
      admissibility: deriveAdmissibility(record),
    };
  });

  return {
    chapterKey: dossier.chapterKey,
    chapterTitle: dossier.chapterTitle,
    records,
    summary: summarize(records),
  };
}

export function getAdmissibleResearchItems(dossier: ChapterResearchDossier) {
  const contract = buildResearchEvidenceContract(dossier);
  const admissibleIds = new Set(
    contract.records
      .filter((record) => record.admissibility === "ADMISSIBLE")
      .map((record) => record.id),
  );

  const filterItems = (items: ChapterResearchItem[]) =>
    items.filter((item) => admissibleIds.has(item.id));

  return {
    dossier: {
      ...dossier,
      factBank: filterItems(dossier.factBank),
      statistics: filterItems(dossier.statistics),
      quotes: filterItems(dossier.quotes),
      examples: filterItems(dossier.examples),
      counterpoints: filterItems(dossier.counterpoints),
      definitions: filterItems(dossier.definitions),
      gaps: [
        ...dossier.gaps,
        ...contract.records
          .filter((record) => record.admissibility !== "ADMISSIBLE")
          .map((record) => `Excluded from drafting: ${record.claimOrStory}`),
      ],
      verificationSummary: {
        ...dossier.verificationSummary,
        verifiedItems: contract.summary.admissibleRecords,
        needsCorroborationItems:
          contract.summary.needsCorroborationRecords + contract.summary.excludedRecords,
      },
      metadata: {
        ...dossier.metadata,
        evidenceContractSummary: contract.summary,
      },
    } satisfies ChapterResearchDossier,
    contract,
  };
}

function storyExcerpt(item: ChapterExternalStoryItem) {
  const excerpt = item.metadata?.supportingExcerpt;
  return typeof excerpt === "string" ? tidy(excerpt) : null;
}

function storyExclusions(item: ChapterExternalStoryItem, source: EvidenceSourceMetadata | null) {
  const exclusions: string[] = [];
  if (!source) exclusions.push("Missing source metadata.");
  if (!storyExcerpt(item)) exclusions.push("Missing supporting excerpt.");
  if (item.verificationStatus === "REJECTED") exclusions.push("External story was rejected.");
  if (source?.verificationStatus === "REJECTED") exclusions.push("Source was rejected.");
  if (item.metadata?.excluded === true) exclusions.push("External story is explicitly excluded.");
  return exclusions;
}

export function buildExternalStoryEvidenceContract(
  dossier: ChapterExternalStoryDossier,
): ChapterEvidenceContract {
  const sources = new Map(dossier.sourceRegister.map((source) => [source.id, source]));
  const records = dossier.storyCandidates.map((story) => {
    const source = sourceToMetadata(sources.get(story.sourceId));
    const exclusions = storyExclusions(story, source);
    const supportingExcerpt = storyExcerpt(story);
    const record: ChapterEvidenceRecord = {
      id: story.id,
      kind: "EXTERNAL_STORY",
      chapterKey: dossier.chapterKey,
      title: story.title,
      claimOrStory: story.summary,
      source,
      supportingExcerpt,
      verificationStatus: story.verificationStatus,
      relevance: scoreToRelevance(null, story.whyItMatters),
      exclusions,
      admissibility: "NEEDS_CORROBORATION",
    };
    return {
      ...record,
      admissibility: deriveAdmissibility(record),
    };
  });

  return {
    chapterKey: dossier.chapterKey,
    chapterTitle: dossier.chapterTitle,
    records,
    summary: summarize(records),
  };
}

export function getAdmissibleExternalStories(dossier: ChapterExternalStoryDossier) {
  const contract = buildExternalStoryEvidenceContract(dossier);
  const admissibleIds = new Set(
    contract.records
      .filter((record) => record.admissibility === "ADMISSIBLE")
      .map((record) => record.id),
  );

  const storyCandidates = dossier.storyCandidates.filter((story) =>
    admissibleIds.has(story.id),
  );

  return {
    dossier: {
      ...dossier,
      storyCandidates,
      storyTypesCovered: [...new Set(storyCandidates.map((story) => story.storyType))],
      storyFitsCovered: [...new Set(storyCandidates.map((story) => story.storyFit))],
      verificationSummary: {
        ...dossier.verificationSummary,
        verifiedStories: contract.summary.admissibleRecords,
        needsCorroborationStories:
          contract.summary.needsCorroborationRecords + contract.summary.excludedRecords,
      },
      metadata: {
        ...dossier.metadata,
        evidenceContractSummary: contract.summary,
      },
    } satisfies ChapterExternalStoryDossier,
    contract,
  };
}
