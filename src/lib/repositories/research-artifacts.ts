import {
  ActorType,
  ArtifactStatus,
  ArtifactType,
  DecisionType,
  Prisma,
  ResearchItemType,
  ResearchSourceTier,
  ResearchVerificationStatus,
  ResearchVerifierType,
  StageKey,
  StageStatus,
} from "@prisma/client";

import type {
  ChapterResearchDossier,
  ChapterResearchItem,
  ChapterResearchSource,
  ChapterResearchVerification,
} from "../research-types";
import { db } from "../db";
import { sanitizeUnknown, stripNullChars } from "../sanitize";
import { getStageForBook } from "./books";
import { ensureDefaultLocalUser } from "../users";

type CreateResearchPackVersionInput = {
  bookId: string;
  chapterKey: string;
  chapterTitle: string;
  summary?: string;
  dossier: ChapterResearchDossier;
  sources: ChapterResearchSource[];
  items: ChapterResearchItem[];
  verifications: ChapterResearchVerification[];
  createdByType?: ActorType;
  createdByUserId?: string;
  workflowRunId?: string;
  promptTemplateVersion?: string;
  modelName?: string;
};

function getResearchArtifactTitle(chapterKey: string, chapterTitle: string) {
  return `Research Pack: ${chapterKey} - ${chapterTitle}`;
}

function toDecimalValue(value?: number | null) {
  return value == null ? undefined : new Prisma.Decimal(value.toFixed(2));
}

function toJsonValue(value?: Record<string, unknown>) {
  return sanitizeUnknown((value ?? {}) as Prisma.InputJsonValue);
}

function shouldPersistResearchItemAsVerified(
  item: ChapterResearchItem,
  source: ChapterResearchSource | undefined,
  verification: ChapterResearchVerification | undefined,
) {
  if (item.verificationStatus === "VERIFIED") {
    return true;
  }

  if (!source || !source.isVerified) {
    return false;
  }

  if (!verification) {
    return false;
  }

  if (verification.status === "REJECTED") {
    return false;
  }

  if (!verification.claimSupported || !verification.tierConfirmed) {
    return false;
  }

  if (verification.secondSourceConfirmed) {
    return true;
  }

  if (source.sourceTier === "A") {
    return item.itemType !== "QUOTE";
  }

  if (source.sourceTier !== "B") {
    return false;
  }

  const promotableTierBTypes: ResearchItemType[] = [
    ResearchItemType.FACT,
    ResearchItemType.DEFINITION,
    ResearchItemType.EXAMPLE,
    ResearchItemType.CASE_STUDY,
    ResearchItemType.COUNTERPOINT,
  ];

  return promotableTierBTypes.includes(item.itemType as ResearchItemType);
}

function normalizeResearchPersistenceInput(input: CreateResearchPackVersionInput) {
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const verificationByItemId = new Map(
    input.verifications
      .filter((verification) => verification.researchItemId)
      .map((verification) => [verification.researchItemId as string, verification]),
  );

  const items = input.items.map((item) => {
    const source = sourceById.get(item.sourceId);
    const verification = verificationByItemId.get(item.id);
    const promoted = shouldPersistResearchItemAsVerified(item, source, verification);
    return {
      ...item,
      verificationStatus: promoted ? "VERIFIED" : item.verificationStatus,
    };
  });

  const verifications = input.verifications.map((verification) => {
    if (!verification.researchItemId) {
      return verification;
    }

    const item = items.find((candidate) => candidate.id === verification.researchItemId);
    if (!item || item.verificationStatus !== "VERIFIED") {
      return verification;
    }

    return {
      ...verification,
      status: "VERIFIED" as ResearchVerificationStatus,
    };
  });

  const verifiedItems = items.filter((item) => item.verificationStatus === "VERIFIED");
  const needsCorroborationItems = items.filter(
    (item) => item.verificationStatus === "NEEDS_CORROBORATION",
  );
  const examples = verifiedItems.filter(
    (item) => item.itemType === "EXAMPLE" || item.itemType === "CASE_STUDY",
  );
  const byType = (itemType: ResearchItemType) =>
    verifiedItems.filter((item) => item.itemType === itemType);

  const dossier: ChapterResearchDossier = {
    ...input.dossier,
    factBank: byType("FACT"),
    statistics: byType("STATISTIC"),
    quotes: byType("QUOTE"),
    examples,
    counterpoints: byType("COUNTERPOINT"),
    definitions: byType("DEFINITION"),
    gaps: [
      ...(verifiedItems.length === 0
        ? ["No verified research items were admitted yet for this chapter."]
        : []),
      ...needsCorroborationItems.map(
        (item) => `Needs corroboration before admission: ${item.claimText}`,
      ),
    ],
    verificationSummary: {
      ...input.dossier.verificationSummary,
      totalItems: items.length,
      verifiedItems: verifiedItems.length,
      rejectedItems: items.filter((item) => item.verificationStatus === "REJECTED").length,
      needsCorroborationItems: needsCorroborationItems.length,
    },
  };

  return {
    ...input,
    dossier,
    items,
    verifications,
  };
}

export async function getResearchPackVersions(
  bookId: string,
  chapterKey: string,
  limit = 6,
) {
  try {
    // Use a more efficient query strategy:
    // 1. Find artifacts by bookId and type (uses existing index)
    // 2. Filter by chapter key pattern in memory
    // 3. Return versions for the matching artifact
    const artifacts = await db.artifact.findMany({
      where: {
        bookId,
        artifactType: ArtifactType.RESEARCH_PACK,
      },
      select: {
        id: true,
        title: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50, // Reasonable limit to avoid scanning entire table
    });

    // Find the artifact matching this chapter
    const titlePrefix = `Research Pack: ${chapterKey} - `;
    const matchingArtifact = artifacts.find((a) => a.title?.startsWith(titlePrefix));

    if (!matchingArtifact) {
      return [];
    }

    // Now fetch versions for the matching artifact
    const versions = await db.artifactVersion.findMany({
      where: {
        artifactId: matchingArtifact.id,
      },
      orderBy: { versionNumber: "desc" },
      take: limit,
    });

    return versions;
  } catch (error) {
    // If database query times out or fails, return empty array
    // This allows the page to load while research data loads asynchronously
    console.error(`Failed to fetch research pack versions for ${chapterKey}:`, error);
    return [];
  }
}

export async function getCommittedResearchPack(bookId: string, chapterKey: string) {
  try {
    // Use optimized query to avoid expensive title string matching
    const artifacts = await db.artifact.findMany({
      where: {
        bookId,
        artifactType: ArtifactType.RESEARCH_PACK,
        committedVersionId: {
          not: null,
        },
      },
      select: {
        id: true,
        title: true,
        committedVersionId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Find the artifact matching this chapter
    const titlePrefix = `Research Pack: ${chapterKey} - `;
    const matchingArtifact = artifacts.find((a) => a.title?.startsWith(titlePrefix));

    if (!matchingArtifact || !matchingArtifact.committedVersionId) {
      return null;
    }

    // Fetch the committed version
    const committedVersion = await db.artifactVersion.findFirst({
      where: {
        artifactId: matchingArtifact.id,
        lifecycleState: ArtifactStatus.COMMITTED,
      },
      orderBy: { versionNumber: "desc" },
    });

    return committedVersion ?? null;
  } catch (error) {
    // If database query times out or fails, return null
    // This allows the page to load while committed research data loads asynchronously
    console.error(`Failed to fetch committed research pack for ${chapterKey}:`, error);
    return null;
  }
}

export async function getResearchSourcesForVersion(researchArtifactVersionId: string) {
  return db.researchSource.findMany({
    where: { researchArtifactVersionId },
    orderBy: [{ sourceTier: "asc" }, { title: "asc" }],
  });
}

export async function getResearchItemsForVersion(researchArtifactVersionId: string) {
  return db.researchItem.findMany({
    where: { researchArtifactVersionId },
    orderBy: [{ itemType: "asc" }, { createdAt: "asc" }],
  });
}

export async function getResearchVerificationsForChapter(bookId: string, chapterKey: string) {
  return db.researchVerification.findMany({
    where: { bookId, chapterKey },
    orderBy: { createdAt: "asc" },
  });
}

export async function createResearchPackVersion(input: CreateResearchPackVersionInput) {
  const researchStage = await getStageForBook(input.bookId, StageKey.RESEARCH);

  if (!researchStage) {
    throw new Error(`Research stage not found for book ${input.bookId}`);
  }

  const normalizedInput = normalizeResearchPersistenceInput(input);

  return db.$transaction(async (tx) => {
    const dossier = sanitizeUnknown(normalizedInput.dossier);
    const sources = sanitizeUnknown(normalizedInput.sources);
    const items = sanitizeUnknown(normalizedInput.items);
    const verifications = sanitizeUnknown(normalizedInput.verifications);
    const artifactTitle = getResearchArtifactTitle(normalizedInput.chapterKey, normalizedInput.chapterTitle);
    const artifact =
      (await tx.artifact.findFirst({
        where: {
          bookId: normalizedInput.bookId,
          stageId: researchStage.id,
          artifactType: ArtifactType.RESEARCH_PACK,
          title: artifactTitle,
        },
      })) ??
      (await tx.artifact.create({
        data: {
          bookId: normalizedInput.bookId,
          stageId: researchStage.id,
          artifactType: ArtifactType.RESEARCH_PACK,
          title: artifactTitle,
          summary: normalizedInput.summary,
          status: ArtifactStatus.DRAFT,
          metadataJson: {
            chapterKey: normalizedInput.chapterKey,
            chapterTitle: normalizedInput.chapterTitle,
          },
        },
      }));

    const latestVersion = await tx.artifactVersion.findFirst({
      where: { artifactId: artifact.id },
      orderBy: { versionNumber: "desc" },
    });

    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const version = await tx.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        versionNumber: nextVersionNumber,
        lifecycleState: ArtifactStatus.DRAFT,
        contentJson: dossier as Prisma.InputJsonValue,
        contentText: stripNullChars(JSON.stringify(dossier, null, 2)),
        summary: stripNullChars(normalizedInput.summary ?? normalizedInput.dossier.researchGoal),
        createdByType: normalizedInput.createdByType ?? ActorType.SYSTEM,
        createdByUserId: normalizedInput.createdByUserId,
        workflowRunId: normalizedInput.workflowRunId,
        promptTemplateVersion: normalizedInput.promptTemplateVersion
          ? stripNullChars(normalizedInput.promptTemplateVersion)
          : undefined,
        modelName: normalizedInput.modelName ? stripNullChars(normalizedInput.modelName) : undefined,
      },
    });

    const sourceIdMap = new Map<string, string>();

    for (const source of sources) {
      const createdSource = await tx.researchSource.create({
        data: {
          bookId: normalizedInput.bookId,
          stageId: researchStage.id,
          researchArtifactVersionId: version.id,
          chapterKey: normalizedInput.chapterKey,
          url: stripNullChars(source.url),
          canonicalUrl: source.canonicalUrl ? stripNullChars(source.canonicalUrl) : undefined,
          title: stripNullChars(source.title),
          publisher: source.publisher ? stripNullChars(source.publisher) : undefined,
          author: source.author ? stripNullChars(source.author) : undefined,
          publishedAt: source.publishedAt ? new Date(source.publishedAt) : undefined,
          accessedAt: source.accessedAt ? new Date(source.accessedAt) : undefined,
          contentType: source.contentType ? stripNullChars(source.contentType) : undefined,
          sourceTier: source.sourceTier as ResearchSourceTier,
          tierWeight: new Prisma.Decimal(source.tierWeight.toFixed(2)),
          isVerified: source.isVerified,
          verificationStatus: source.verificationStatus as ResearchVerificationStatus,
          verificationNotes: source.verificationNotes
            ? stripNullChars(source.verificationNotes)
            : undefined,
          snapshotPath: source.snapshotPath ? stripNullChars(source.snapshotPath) : undefined,
          extractedTextPath: source.extractedTextPath
            ? stripNullChars(source.extractedTextPath)
            : undefined,
          metadataJson: toJsonValue(source.metadata),
        },
      });
      sourceIdMap.set(source.id, createdSource.id);
    }

    const itemIdMap = new Map<string, string>();
    for (const item of items) {
      const sourceRecordId = sourceIdMap.get(item.sourceId);
      if (!sourceRecordId) {
        continue;
      }

      const createdItem = await tx.researchItem.create({
        data: {
          bookId: normalizedInput.bookId,
          stageId: researchStage.id,
          researchArtifactVersionId: version.id,
          sourceRecordId,
          chapterKey: normalizedInput.chapterKey,
          itemType: item.itemType as ResearchItemType,
          claimText: stripNullChars(item.claimText),
          evidenceExcerpt: item.evidenceExcerpt ? stripNullChars(item.evidenceExcerpt) : undefined,
          summary: item.summary ? stripNullChars(item.summary) : undefined,
          sourceTier: item.sourceTier as ResearchSourceTier,
          tierWeight: new Prisma.Decimal(item.tierWeight.toFixed(2)),
          verificationStatus: item.verificationStatus as ResearchVerificationStatus,
          relevanceScore: toDecimalValue(item.relevanceScore),
          confidenceScore: toDecimalValue(item.confidenceScore),
          mappedSectionId: item.mappedSectionId ?? undefined,
          mappedChapterId: item.mappedChapterId ?? undefined,
          mappedParagraphId: item.mappedParagraphId ?? undefined,
          metadataJson: toJsonValue(item.metadata),
        },
      });
      itemIdMap.set(item.id, createdItem.id);
    }

    for (const verification of verifications) {
      await tx.researchVerification.create({
        data: {
          bookId: normalizedInput.bookId,
          stageId: researchStage.id,
          chapterKey: normalizedInput.chapterKey,
          sourceRecordId: verification.sourceRecordId
            ? sourceIdMap.get(verification.sourceRecordId) ?? undefined
            : undefined,
          researchItemId: verification.researchItemId
            ? itemIdMap.get(verification.researchItemId) ?? undefined
            : undefined,
          verifierType: verification.verifierType as ResearchVerifierType,
          status: verification.status as ResearchVerificationStatus,
          titleMatch: verification.titleMatch ?? undefined,
          contentMatch: verification.contentMatch ?? undefined,
          claimSupported: verification.claimSupported ?? undefined,
          tierConfirmed: verification.tierConfirmed ?? undefined,
          secondSourceRequired: verification.secondSourceRequired,
          secondSourceConfirmed: verification.secondSourceConfirmed,
          notes: verification.notes ? stripNullChars(verification.notes) : undefined,
          metadataJson: toJsonValue(verification.metadata),
        },
      });
    }

    await tx.artifact.update({
      where: { id: artifact.id },
      data: {
        currentVersionId: version.id,
        summary: input.summary ?? artifact.summary,
        status: ArtifactStatus.DRAFT,
      },
    });

    await tx.bookStage.update({
      where: { id: researchStage.id },
      data: {
        status: StageStatus.IN_PROGRESS,
        activeArtifactVersionId: version.id,
      },
    });

    return version;
  }, {
    maxWait: 10000,
    timeout: 30000,
  });
}

export async function commitResearchPack(bookId: string, chapterKey: string) {
  const researchStage = await getStageForBook(bookId, StageKey.RESEARCH);

  if (!researchStage) {
    throw new Error(`Research stage not found for book ${bookId}`);
  }

  const defaultUser = await ensureDefaultLocalUser();

  return db.$transaction(async (tx) => {
    const artifact = await tx.artifact.findFirst({
      where: {
        bookId,
        stageId: researchStage.id,
        artifactType: ArtifactType.RESEARCH_PACK,
        title: {
          startsWith: `Research Pack: ${chapterKey} - `,
        },
        currentVersionId: {
          not: null,
        },
      },
    });

    if (!artifact?.currentVersionId) {
      throw new Error(`No research pack version available to commit for ${chapterKey}`);
    }

    await tx.artifactVersion.update({
      where: { id: artifact.currentVersionId },
      data: {
        lifecycleState: ArtifactStatus.COMMITTED,
        committedAt: new Date(),
      },
    });

    await tx.artifact.update({
      where: { id: artifact.id },
      data: {
        committedVersionId: artifact.currentVersionId,
        status: ArtifactStatus.COMMITTED,
      },
    });

    await tx.decision.create({
      data: {
        bookId,
        stageId: researchStage.id,
        artifactId: artifact.id,
        decisionType: DecisionType.COMMIT,
        decisionValue: `research_pack_committed:${chapterKey}`,
        createdByUserId: defaultUser.id,
      },
    });

    return true;
  });
}
