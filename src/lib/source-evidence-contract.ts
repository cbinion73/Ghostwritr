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

export type CurrentEvidenceAdmission = {
  artifactVersionId: string;
  verificationFingerprint: string;
  verdict: "VERIFIED" | "VERIFIED_WITH_CORRECTION" | "NEEDS_CORROBORATION" | "NOT_FOUND" | "INACCESSIBLE" | "CONTRADICTED" | "REJECTED";
  admitted: boolean;
  supportingExcerpt?: string | null;
  corrections?: Array<{ field: "title" | "author" | "publisher" | "publishedAt" | "citation" | "url" | "doi" | "sourceRole"; original: string | null; corrected: string }>;
  decision?: "APPROVE" | "APPROVE_CORRECTED" | "REQUEST_CORROBORATION" | "REJECT" | "MANUAL_EXCEPTION" | "REOPEN" | null;
  manualException?: boolean;
  reviewNotes?: string | null;
};

export type EvidenceAdmissionMap = ReadonlyMap<string, CurrentEvidenceAdmission>;

const runtimeAdmissionContext = new WeakMap<object, EvidenceAdmissionMap>();

function admissionsFor(dossier: object, admissions: EvidenceAdmissionMap) {
  return admissions.size > 0 ? admissions : runtimeAdmissionContext.get(dossier) ?? admissions;
}

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
  technicallyEligible?: boolean;
  humanAdmitted?: boolean;
  verificationFingerprint?: string | null;
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
  admission?: CurrentEvidenceAdmission,
): EvidenceSourceMetadata | null {
  if (!source) {
    return null;
  }

  const metadata: EvidenceSourceMetadata = {
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
  for (const correction of admission?.corrections ?? []) {
    if (correction.field === "title") metadata.title = correction.corrected;
    if (correction.field === "author") metadata.author = correction.corrected;
    if (correction.field === "publisher") metadata.publisher = correction.corrected;
    if (correction.field === "publishedAt") metadata.publishedAt = correction.corrected;
    if (correction.field === "citation") metadata.verificationNotes = correction.corrected;
    if (correction.field === "url") {
      metadata.url = correction.corrected;
      metadata.canonicalUrl = correction.corrected;
    }
  }
  return metadata;
}

function applySourceCorrections<T extends ChapterResearchSource | ChapterExternalStorySource>(
  source: T,
  admission?: CurrentEvidenceAdmission,
): T {
  const corrected = { ...source };
  for (const correction of admission?.corrections ?? []) {
    if (correction.field === "title") corrected.title = correction.corrected;
    if (correction.field === "author") corrected.author = correction.corrected;
    if (correction.field === "publisher") corrected.publisher = correction.corrected;
    if (correction.field === "publishedAt") corrected.publishedAt = correction.corrected;
    if (correction.field === "citation") corrected.verificationNotes = correction.corrected;
    if (correction.field === "url") {
      corrected.url = correction.corrected;
      corrected.canonicalUrl = correction.corrected;
    }
  }
  return corrected;
}

function mergeSourceAdmissions(admissions: Array<CurrentEvidenceAdmission | undefined>) {
  const present = admissions.filter((value): value is CurrentEvidenceAdmission => Boolean(value));
  if (!present.length) return undefined;
  const corrections = new Map<string, NonNullable<CurrentEvidenceAdmission["corrections"]>[number]>();
  for (const admission of present) for (const correction of admission.corrections ?? []) {
    const existing = corrections.get(correction.field);
    if (existing && existing.corrected !== correction.corrected) {
      throw new Error(`Conflicting approved source correction for ${correction.field}.`);
    }
    corrections.set(correction.field, correction);
  }
  return { ...present[0], corrections: [...corrections.values()] };
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
  admission?: CurrentEvidenceAdmission;
}): EvidenceAdmissibility {
  const fatalExclusions = input.exclusions.filter((value) =>
    value === "Missing source metadata." ||
    value === "Missing supporting excerpt." ||
    value.includes("provisional") ||
    value.includes("explicitly excluded"),
  );
  if (input.admission?.manualException && input.admission.admitted && input.supportingExcerpt && fatalExclusions.length === 0) {
    return "ADMISSIBLE";
  }
  if (input.verificationStatus === "REJECTED" || input.exclusions.length > 0) {
    return "EXCLUDED";
  }

  if (input.admission?.admitted && input.supportingExcerpt) {
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

function researchExclusions(item: ChapterResearchItem, source: EvidenceSourceMetadata | null, supportingExcerpt: string | null) {
  const exclusions: string[] = [];
  if (!source) exclusions.push("Missing source metadata.");
  if (!supportingExcerpt) exclusions.push("Missing supporting excerpt.");
  if (item.verificationStatus === "REJECTED") exclusions.push("Research item was rejected.");
  if (source?.verificationStatus === "REJECTED") exclusions.push("Source was rejected.");
  if (item.metadata?.provisional === true) exclusions.push("Research item is provisional.");
  return exclusions;
}

export function buildResearchEvidenceContract(
  dossier: ChapterResearchDossier,
  admissions: EvidenceAdmissionMap = new Map(),
): ChapterEvidenceContract {
  admissions = admissionsFor(dossier, admissions);
  const sources = new Map(dossier.sourceRegister.map((source) => [source.id, source]));
  const records = researchItems(dossier).map((item) => {
    const admission = admissions.get(`RESEARCH_CLAIM:${item.id}`);
    const supportingExcerpt = tidy(admission?.supportingExcerpt ?? item.evidenceExcerpt);
    const source = sourceToMetadata(sources.get(item.sourceId), admission);
    const exclusions = researchExclusions(item, source, supportingExcerpt);
    const technicallyEligible = Boolean(
      item.verificationStatus === "VERIFIED" &&
      source?.verificationStatus === "VERIFIED" &&
      supportingExcerpt &&
      exclusions.length === 0,
    );
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
      technicallyEligible,
      humanAdmitted: admission?.admitted === true,
      verificationFingerprint: admission?.verificationFingerprint ?? null,
      admissibility: "NEEDS_CORROBORATION",
    };
    return {
      ...record,
      admissibility: deriveAdmissibility({ ...record, admission }),
    };
  });

  return {
    chapterKey: dossier.chapterKey,
    chapterTitle: dossier.chapterTitle,
    records,
    summary: summarize(records),
  };
}

export function getAdmissibleResearchItems(
  dossier: ChapterResearchDossier,
  admissions: EvidenceAdmissionMap = new Map(),
) {
  admissions = admissionsFor(dossier, admissions);
  const contract = buildResearchEvidenceContract(dossier, admissions);
  const admissibleIds = new Set(
    contract.records
      .filter((record) => record.admissibility === "ADMISSIBLE")
      .map((record) => record.id),
  );

  const filterItems = (items: ChapterResearchItem[]) =>
    items.filter((item) => admissibleIds.has(item.id));

  const admittedDossier = {
      ...dossier,
      factBank: filterItems(dossier.factBank),
      statistics: filterItems(dossier.statistics),
      quotes: filterItems(dossier.quotes),
      examples: filterItems(dossier.examples),
      counterpoints: filterItems(dossier.counterpoints),
      definitions: filterItems(dossier.definitions),
      sourceRegister: dossier.sourceRegister.map((source) => {
        const admission = mergeSourceAdmissions(researchItems(dossier)
          .filter((item) => item.sourceId === source.id && admissibleIds.has(item.id))
          .map((item) => admissions.get(`RESEARCH_CLAIM:${item.id}`))
          .filter((value) => value?.corrections?.length));
        return applySourceCorrections(source, admission);
      }),
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
    } satisfies ChapterResearchDossier;
  runtimeAdmissionContext.set(admittedDossier, admissions);
  return {
    dossier: admittedDossier,
    contract,
  };
}

function storyExcerpt(item: ChapterExternalStoryItem) {
  const excerpt = item.metadata?.supportingExcerpt;
  return typeof excerpt === "string" ? tidy(excerpt) : null;
}

function storyExclusions(item: ChapterExternalStoryItem, source: EvidenceSourceMetadata | null, supportingExcerpt: string | null) {
  const exclusions: string[] = [];
  if (!source) exclusions.push("Missing source metadata.");
  if (!supportingExcerpt) exclusions.push("Missing supporting excerpt.");
  if (item.verificationStatus === "REJECTED") exclusions.push("External story was rejected.");
  if (source?.verificationStatus === "REJECTED") exclusions.push("Source was rejected.");
  if (item.metadata?.excluded === true) exclusions.push("External story is explicitly excluded.");
  return exclusions;
}

export function buildExternalStoryEvidenceContract(
  dossier: ChapterExternalStoryDossier,
  admissions: EvidenceAdmissionMap = new Map(),
): ChapterEvidenceContract {
  admissions = admissionsFor(dossier, admissions);
  const sources = new Map(dossier.sourceRegister.map((source) => [source.id, source]));
  const records = dossier.storyCandidates.map((story) => {
    const admission = admissions.get(`EXTERNAL_STORY:${story.id}`);
    const supportingExcerpt = tidy(admission?.supportingExcerpt ?? storyExcerpt(story));
    const source = sourceToMetadata(sources.get(story.sourceId), admission);
    const exclusions = storyExclusions(story, source, supportingExcerpt);
    const technicallyEligible = Boolean(
      story.verificationStatus === "VERIFIED" &&
      source?.verificationStatus === "VERIFIED" &&
      supportingExcerpt &&
      exclusions.length === 0,
    );
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
      technicallyEligible,
      humanAdmitted: admission?.admitted === true,
      verificationFingerprint: admission?.verificationFingerprint ?? null,
      admissibility: "NEEDS_CORROBORATION",
    };
    return {
      ...record,
      admissibility: deriveAdmissibility({ ...record, admission }),
    };
  });

  return {
    chapterKey: dossier.chapterKey,
    chapterTitle: dossier.chapterTitle,
    records,
    summary: summarize(records),
  };
}

export function getAdmissibleExternalStories(
  dossier: ChapterExternalStoryDossier,
  admissions: EvidenceAdmissionMap = new Map(),
) {
  admissions = admissionsFor(dossier, admissions);
  const contract = buildExternalStoryEvidenceContract(dossier, admissions);
  const admissibleIds = new Set(
    contract.records
      .filter((record) => record.admissibility === "ADMISSIBLE")
      .map((record) => record.id),
  );

  const storyCandidates = dossier.storyCandidates.filter((story) =>
    admissibleIds.has(story.id),
  );

  const admittedDossier = {
      ...dossier,
      storyCandidates,
      sourceRegister: dossier.sourceRegister.map((source) => {
        const admission = mergeSourceAdmissions(storyCandidates
          .filter((story) => story.sourceId === source.id)
          .map((story) => admissions.get(`EXTERNAL_STORY:${story.id}`))
          .filter((value) => value?.corrections?.length));
        return applySourceCorrections(source, admission);
      }),
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
    } satisfies ChapterExternalStoryDossier;
  runtimeAdmissionContext.set(admittedDossier, admissions);
  return {
    dossier: admittedDossier,
    contract,
  };
}
