import { ArtifactType, StageKey, StageStatus, BookWorkflowType } from "@prisma/client";

import { BookSetupProfileSchema } from "../../artifact-schemas";
import type {
  EditorialPreferenceProfile,
  EditorialRevisionPlanExecution,
  ManuscriptAssembly,
  PublishingPackage,
} from "../../editing-types";
import { buildPublishPackageSyncState } from "../../publish-sync";
import { getCommittedBookSetup } from "../../repositories/book-setup-artifacts";
import { getBookBySlugOrThrow, getStageForBook, updateBookMetadata, updateStageForBook } from "../../repositories/books";
import {
  commitEditingArtifact,
  createEditingArtifactVersion,
  getEditingArtifactVersions,
  getLatestEditingArtifactVersion,
} from "../../repositories/editing-artifacts";
import { loadEditingChapters } from "./chapter-loader";
import {
  buildDraftQualityRollup,
  computeEditorialReadinessGate,
  getEditorialPreferenceProfile,
  parseJson,
  parseJsonWithSchema,
} from "./workspace-support";
import {
  EditorialAssessmentSchema,
  EditorialRevisionPlanExecutionSchema,
  EditorialRevisionPlanSchema,
  ManuscriptAssemblySchema,
  PublishingPackageSchema,
} from "./workspace-schemas";
import {
  buildMarketingHandoffPackage,
  buildProvenanceReport,
  buildPublishingPackage,
} from "./publishing-support";
import { generatePublicationPassWorkflow } from "./publication-pass";

export async function syncPublishDerivedArtifacts(params: {
  bookId: string;
  workflowType: BookWorkflowType;
  assembly: ManuscriptAssembly;
  publishingPackage: PublishingPackage;
  editorialPreferences: EditorialPreferenceProfile;
  revisionPlanExecution: EditorialRevisionPlanExecution | null;
  refreshDerivedOnly?: boolean;
}) {
  const {
    bookId,
    workflowType,
    assembly,
    publishingPackage,
    editorialPreferences,
    revisionPlanExecution,
    refreshDerivedOnly = false,
  } = params;

  const provenanceReport = buildProvenanceReport({
    workflowType,
    bookTitle: assembly.title,
    publishingPackage,
    editorialPreferences,
    revisionPlanExecution,
  });
  await createEditingArtifactVersion({
    bookId,
    artifactType: ArtifactType.PROVENANCE_REPORT,
    title: "Provenance Report",
    summary: refreshDerivedOnly
      ? "Provenance report refreshed from the latest publishing package."
      : "Traceability report for the final manuscript and publishing package.",
    contentJson: provenanceReport,
    contentText: JSON.stringify(provenanceReport, null, 2),
    promptTemplateVersion: "editing-provenance-v1",
    modelName: "deterministic-packager",
    preserveStageCommit: true,
  });
  await commitEditingArtifact(bookId, ArtifactType.PROVENANCE_REPORT);

  const marketingHandoff = buildMarketingHandoffPackage({
    workflowType,
    assembly,
    publishingPackage,
  });
  await createEditingArtifactVersion({
    bookId,
    artifactType: ArtifactType.MARKETING_HANDOFF_PACKAGE,
    title: "Marketing Handoff Package",
    summary: refreshDerivedOnly
      ? "Marketing handoff refreshed from the latest publishing package."
      : "Reader-facing synopsis, hooks, and positioning notes for downstream packaging.",
    contentJson: marketingHandoff,
    contentText: JSON.stringify(marketingHandoff, null, 2),
    promptTemplateVersion: "editing-marketing-handoff-v1",
    modelName: "deterministic-packager",
    preserveStageCommit: true,
  });
  await commitEditingArtifact(bookId, ArtifactType.MARKETING_HANDOFF_PACKAGE);
}

export async function preparePublishingPackageWorkflow(
  bookSlug: string,
  options?: {
    forceDerivedArtifactRefresh?: boolean;
  },
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const { chapters } = await loadEditingChapters(book);
  const committedBookSetupVersion = await getCommittedBookSetup(book.id);
  const bookSetup = committedBookSetupVersion?.contentJson
    ? BookSetupProfileSchema.safeParse(committedBookSetupVersion.contentJson).data ?? null
    : null;
  const manuscriptVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MANUSCRIPT_ASSEMBLY,
  );
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const assembly = manuscriptVersion?.contentJson
    ? ManuscriptAssemblySchema.safeParse(manuscriptVersion.contentJson).data ?? null
    : null;

  if (!assembly) {
    throw new Error("Assemble the manuscript before preparing the publishing package.");
  }

  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const revisionPlanExecution = parseJsonWithSchema(
    metadata.revisionPlanExecution,
    EditorialRevisionPlanExecutionSchema,
  );
  const revisionPlan = parseJsonWithSchema(metadata.revisionPlan, EditorialRevisionPlanSchema);
  const latestAssessmentVersion = await getEditingArtifactVersions(
    book.id,
    ArtifactType.EDITORIAL_ASSESSMENT,
    1,
  );
  const latestAssessment = parseJsonWithSchema(
    latestAssessmentVersion[0]?.contentJson,
    EditorialAssessmentSchema,
  );
  const appliedRevisionIds = Array.isArray(metadata.appliedRevisionIds)
    ? metadata.appliedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const rejectedRevisionIds = Array.isArray(metadata.rejectedRevisionIds)
    ? metadata.rejectedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const editorialReadinessGate = computeEditorialReadinessGate({
    manuscript: assembly,
    draftQualityRollup: buildDraftQualityRollup(chapters),
    latestAssessment,
    revisionPlan,
    revisionPlanExecution,
    appliedRevisionIds,
    rejectedRevisionIds,
    bookTargetWordCount: bookSetup?.targetWordCount ?? null,
    bookTargetTolerance: bookSetup?.wordCountTolerance ?? null,
  });

  const publishingPackage = buildPublishingPackage({
    assembly,
    workflowType: book.workflowType,
    bookSetup,
    draftQualityRollup: buildDraftQualityRollup(chapters),
    editorialRecommendation: editorialReadinessGate.recommendation,
  });

  await createEditingArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PUBLISHING_PACKAGE,
    title: "Publishing Package",
    summary: "Publishing package refreshed from the latest manuscript assembly and setup intent.",
    contentJson: publishingPackage,
    contentText: JSON.stringify(publishingPackage, null, 2),
    promptTemplateVersion: "editing-publishing-package-v2",
    modelName: "deterministic-packager",
  });

  await commitEditingArtifact(book.id, ArtifactType.PUBLISHING_PACKAGE);

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...metadata,
      preparedAt: publishingPackage.preparedAt,
      publishPackageSourceAssemblyVersionId: manuscriptVersion?.id ?? null,
      publishPackageRefreshedAt: new Date().toISOString(),
      publishDerivedRefreshedAt: new Date().toISOString(),
      editorialReadinessGate,
    },
  });

  const editorialPreferences = getEditorialPreferenceProfile(metadata);
  const hasDerivedArtifacts =
    Boolean(await getLatestEditingArtifactVersion(book.id, ArtifactType.PROVENANCE_REPORT)) ||
    Boolean(await getLatestEditingArtifactVersion(book.id, ArtifactType.MARKETING_HANDOFF_PACKAGE));

  if (options?.forceDerivedArtifactRefresh || stage?.status === StageStatus.COMMITTED || hasDerivedArtifacts) {
    await syncPublishDerivedArtifacts({
      bookId: book.id,
      workflowType: book.workflowType,
      assembly,
      publishingPackage,
      editorialPreferences,
      revisionPlanExecution,
      refreshDerivedOnly: true,
    });
  }

  // Run the full publication-grade review automatically once ordinary
  // editorial readiness says the manuscript is ready to commit. The pass is
  // signature-cached, so repeated package refreshes do not pay for the same
  // manuscript twice. Its independent findings remain author-resolvable in
  // Editing and continue to gate final export.
  if (
    book.workflowType === BookWorkflowType.NONFICTION &&
    editorialReadinessGate.recommendation === "ready_for_commit"
  ) {
    await generatePublicationPassWorkflow(bookSlug);
  }

  return publishingPackage;
}

export async function finalizePublishingHandoffWorkflow(
  bookSlug: string,
  options?: {
    archiveReady?: boolean;
  },
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const stageMetadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const bookMetadata =
    book.metadataJson && typeof book.metadataJson === "object"
      ? (book.metadataJson as Record<string, unknown>)
      : {};

  let manuscriptVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.MANUSCRIPT_ASSEMBLY);
  let publishingVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.PUBLISHING_PACKAGE);
  let publishingPackage = publishingVersion?.contentJson
    ? parseJsonWithSchema(publishingVersion.contentJson, PublishingPackageSchema)
    : null;

  const syncState = buildPublishPackageSyncState({
    currentAssemblyVersionId: manuscriptVersion?.id ?? null,
    hasPublishingPackage: Boolean(publishingPackage),
    packageSourceAssemblyVersionId:
      typeof stageMetadata.publishPackageSourceAssemblyVersionId === "string"
        ? stageMetadata.publishPackageSourceAssemblyVersionId
        : null,
    lastRefreshedAt:
      typeof stageMetadata.publishPackageRefreshedAt === "string"
        ? stageMetadata.publishPackageRefreshedAt
        : publishingPackage?.preparedAt ?? null,
  });

  if (!publishingPackage || syncState.status !== "synced") {
    await preparePublishingPackageWorkflow(bookSlug);
    manuscriptVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.MANUSCRIPT_ASSEMBLY);
    publishingVersion = await getLatestEditingArtifactVersion(book.id, ArtifactType.PUBLISHING_PACKAGE);
    publishingPackage = publishingVersion?.contentJson
      ? parseJsonWithSchema(publishingVersion.contentJson, PublishingPackageSchema)
      : null;
  }

  if (!publishingPackage || !manuscriptVersion) {
    throw new Error("Prepare a synced publishing package before finalizing handoff.");
  }

  const finalizedAt = new Date().toISOString();
  const finalHandoffState = {
    finalizedAt,
    archivedAt: options?.archiveReady ? finalizedAt : null,
    packageVersionId: publishingVersion?.id ?? null,
    packagePreparedAt: publishingPackage.preparedAt,
    notes: [
      "Publishing package is locked to the latest synced manuscript assembly.",
      "Interior layout, cover brief, distribution manifest, provenance, and marketing handoff are ready for downstream production.",
      options?.archiveReady
        ? "The book is marked archive-ready for a final cold-storage export."
        : "Archive export remains available for long-term storage after handoff.",
    ],
  };

  await updateStageForBook(book.id, StageKey.EDITING, {
    metadataJson: {
      ...stageMetadata,
      finalHandoffState,
      updatedAt: new Date().toISOString(),
    },
  });

  await updateBookMetadata(book.id, {
    ...bookMetadata,
    finalHandoffState,
  });

  return finalHandoffState;
}
