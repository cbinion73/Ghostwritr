import { ArtifactType, StageKey } from "@prisma/client";

import { BookSetupProfileSchema } from "../../artifact-schemas";
import type { EditingChapterSnapshot } from "../../editing-types";
import { buildPublishPackageSyncState } from "../../publish-sync";
import { getCommittedBookSetup } from "../../repositories/book-setup-artifacts";
import { getBookBySlugOrThrow, getStageForBook } from "../../repositories/books";
import {
  getEditingArtifactVersions,
  getLatestEditingArtifactVersion,
} from "../../repositories/editing-artifacts";
import {
  EditorialAssessmentSchema,
  EditorialRevisionPlanExecutionSchema,
  EditorialRevisionPlanSchema,
  FinalHandoffStateSchema,
  ManuscriptAssemblySchema,
  ManuscriptRevisionSchema,
  MarketingHandoffPackageSchema,
  ProvenanceReportSchema,
  PublishingPackageSchema,
  SuggestedEditorialRevisionTargetSchema,
} from "./workspace-schemas";
import { loadEditingChapters } from "./chapter-loader";
import {
  buildDraftQualityRollup,
  buildExcerpt,
  computeEditorialReadinessGate,
  getEditorialPreferenceProfile,
  parseEditingMessages,
  parseJson,
  parseJsonWithSchema,
} from "./workspace-support";
import { buildSourceDraftSignature } from "./revision-support";
import {
  evaluatePublicationPassReport,
  PublicationPassReportSchema,
} from "./publication-pass";

// 8.2e2a workspace extraction map.
//
// `getEditingWorkspace` now lives in this module. Keep this map as the narrow
// dependency contract for the move; do not pull assessment/revision/publishing
// and interaction runtime orchestration into the workspace module.
export const EDITING_WORKSPACE_EXTRACTION_DEPENDENCIES = {
  publicEntrypoint: "src/lib/workflows/editing-public.ts",
  temporarySource: "src/lib/workflows/editing.ts",
  futureOwner: "src/lib/workflows/editing/workspace.ts",
  exportedFunction: "getEditingWorkspace",
  directDataLoaders: [
    "getBookBySlugOrThrow",
    "getStageForBook",
    "getCommittedBookSetup",
    "loadEditingChapters",
    "getLatestEditingArtifactVersion",
    "getEditingArtifactVersions",
  ],
  artifactTypes: [
    "MANUSCRIPT_ASSEMBLY",
    "PUBLISHING_PACKAGE",
    "PROVENANCE_REPORT",
    "MARKETING_HANDOFF_PACKAGE",
    "EDITORIAL_ASSESSMENT",
    "MANUSCRIPT_REVISION",
  ],
  schemas: [
    "BookSetupProfileSchema",
    "ManuscriptAssemblySchema",
    "PublishingPackageSchema",
    "ProvenanceReportSchema",
    "MarketingHandoffPackageSchema",
    "EditorialPreferenceProfileSchema",
    "EditorialRevisionPlanSchema",
    "EditorialRevisionPlanExecutionSchema",
    "EditorialAssessmentSchema",
    "SuggestedEditorialRevisionTargetSchema",
    "ManuscriptRevisionSchema",
    "FinalHandoffStateSchema",
  ],
  pureHelpers: [
    "parseJson",
    "parseJsonWithSchema",
    "parseEditingMessages",
    "getEditorialPreferenceProfile",
    "buildDraftQualityRollup",
    "buildExcerpt",
    "computeEditorialReadinessGate",
    "buildPublishPackageSyncState",
  ],
  metadataFields: [
    "editorConversation",
    "editorialPreferences",
    "revisionPlan",
    "revisionPlanExecution",
    "suggestedRevisionTarget",
    "appliedRevisionIds",
    "rejectedRevisionIds",
    "publishPackageSourceAssemblyVersionId",
    "publishPackageRefreshedAt",
    "finalHandoffState",
    "wholeBookAssessment",
    "suggestedNextActions",
    "focusChapterKey",
  ],
} as const;

export * from "./workspace-support";

export async function getEditingWorkspace(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = await getStageForBook(book.id, StageKey.EDITING);
  const bookSetupVersion = await getCommittedBookSetup(book.id);
  const bookSetup = parseJsonWithSchema(bookSetupVersion?.contentJson, BookSetupProfileSchema);

  let blockingReason: string | null = null;
  let chapters: EditingChapterSnapshot[] = [];

  try {
    ({ chapters } = await loadEditingChapters(book));
  } catch (error) {
    blockingReason = error instanceof Error ? error.message : "Editing inputs are not ready.";
  }

  const draftedChapters = chapters.filter((chapter) => chapter.chapterText.trim().length > 0);
  const manuscriptReady = chapters.length > 0 && draftedChapters.length === chapters.length;
  const totalWords = draftedChapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);

  const manuscriptVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MANUSCRIPT_ASSEMBLY,
  );
  const publishingVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.PUBLISHING_PACKAGE,
  );
  const provenanceVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.PROVENANCE_REPORT,
  );
  const marketingHandoffVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.MARKETING_HANDOFF_PACKAGE,
  );
  const assessmentVersions = await getEditingArtifactVersions(
    book.id,
    ArtifactType.EDITORIAL_ASSESSMENT,
    5,
  );
  const publicationPassVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.EDITORIAL_REVIEW,
  );
  // Every "Generate Revision" click for any chapter shares one Artifact row
  // and appends a new version, so a small take limit here silently drops
  // older chapters' revisions from the queue once enough other chapters get
  // revised afterward. Large headroom here preserves the visible queue.
  const revisionVersions = await getEditingArtifactVersions(book.id, ArtifactType.MANUSCRIPT_REVISION, 500);
  const manuscriptAssembly = manuscriptVersion?.contentJson
    ? parseJsonWithSchema(manuscriptVersion.contentJson, ManuscriptAssemblySchema)
    : null;
  const publishingPackage = publishingVersion?.contentJson
    ? parseJsonWithSchema(publishingVersion.contentJson, PublishingPackageSchema)
    : null;
  const provenanceReport = provenanceVersion?.contentJson
    ? parseJsonWithSchema(provenanceVersion.contentJson, ProvenanceReportSchema)
    : null;
  const marketingHandoffPackage = marketingHandoffVersion?.contentJson
    ? parseJsonWithSchema(marketingHandoffVersion.contentJson, MarketingHandoffPackageSchema)
    : null;
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const editorConversation = parseEditingMessages(metadata.editorConversation);
  const editorialPreferences = getEditorialPreferenceProfile(metadata);
  const revisionPlan = parseJsonWithSchema(metadata.revisionPlan, EditorialRevisionPlanSchema);
  const revisionPlanExecution = parseJsonWithSchema(
    metadata.revisionPlanExecution,
    EditorialRevisionPlanExecutionSchema,
  );
  const latestAssessment = parseJsonWithSchema(
    assessmentVersions[0]?.contentJson,
    EditorialAssessmentSchema,
  );
  const publicationPass = parseJsonWithSchema(
    publicationPassVersion?.contentJson,
    PublicationPassReportSchema,
  );
  const publicationPassEvaluation = evaluatePublicationPassReport(
    publicationPass,
    manuscriptAssembly ? buildSourceDraftSignature(manuscriptAssembly.chapters) : "",
  );
  const suggestedRevisionTarget = parseJsonWithSchema(
    metadata.suggestedRevisionTarget,
    SuggestedEditorialRevisionTargetSchema,
  );
  const manuscriptHistory = (
    await getEditingArtifactVersions(book.id, ArtifactType.MANUSCRIPT_ASSEMBLY, 8)
  )
    .map((version) => {
      const assembly = parseJsonWithSchema(version.contentJson, ManuscriptAssemblySchema);
      if (!assembly) {
        return null;
      }

      return {
        id: version.id,
        versionNumber: version.versionNumber,
        lifecycleState: version.lifecycleState,
        createdAt: version.createdAt.toISOString(),
        summary: version.summary,
        totalWords: assembly.totalWords,
        chapterCount: assembly.chapterCount,
        editorialOverview: assembly.editorialOverview,
        excerpt: buildExcerpt(assembly.fullText),
        chapters: assembly.chapters,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const publishingHistory = (
    await getEditingArtifactVersions(book.id, ArtifactType.PUBLISHING_PACKAGE, 6)
  )
    .map((version) => {
      const parsed = parseJsonWithSchema(version.contentJson, PublishingPackageSchema);
      if (!parsed) {
        return null;
      }

      return {
        id: version.id,
        versionNumber: version.versionNumber,
        lifecycleState: version.lifecycleState,
        createdAt: version.createdAt.toISOString(),
        summary: version.summary,
        packageStatus: parsed.packageStatus,
        totalWords: parsed.totalWords,
        chapterCount: parsed.chapterCount,
        trimSize: parsed.trimSize,
        targetPageCount: parsed.targetPageCount ?? null,
        outputFormats: parsed.outputFormats,
        exportFormats: parsed.exportFormats,
        frontMatter: parsed.frontMatter,
        backMatter: parsed.backMatter,
        packageComponents: parsed.packageComponents,
        exportProfiles: parsed.exportProfiles,
        typesettingPlan: parsed.typesettingPlan,
        preflightChecks: parsed.preflightChecks,
        notes: parsed.notes,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const revisions = revisionVersions
    .map((version) => {
      const parsed = parseJsonWithSchema(version.contentJson, ManuscriptRevisionSchema);
      if (!parsed) {
        return null;
      }

      return {
        id: version.id,
        versionNumber: version.versionNumber,
        lifecycleState: version.lifecycleState,
        summary: version.summary,
        createdAt: version.createdAt.toISOString(),
        revision: parsed,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const appliedRevisionIds = Array.isArray(metadata.appliedRevisionIds)
    ? metadata.appliedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const rejectedRevisionIds = Array.isArray(metadata.rejectedRevisionIds)
    ? metadata.rejectedRevisionIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const draftQualityRollup = buildDraftQualityRollup(chapters);
  const editorialReadinessGate = computeEditorialReadinessGate({
    manuscript: manuscriptAssembly,
    draftQualityRollup,
    latestAssessment,
    revisionPlan,
    revisionPlanExecution,
    appliedRevisionIds,
    rejectedRevisionIds,
    bookTargetWordCount: bookSetup?.targetWordCount ?? null,
    bookTargetTolerance: bookSetup?.wordCountTolerance ?? null,
  });
  const publishPackageSyncState = buildPublishPackageSyncState({
    currentAssemblyVersionId: manuscriptVersion?.id ?? null,
    hasPublishingPackage: Boolean(publishingPackage),
    packageSourceAssemblyVersionId:
      typeof metadata.publishPackageSourceAssemblyVersionId === "string"
        ? metadata.publishPackageSourceAssemblyVersionId
        : null,
    lastRefreshedAt:
      typeof metadata.publishPackageRefreshedAt === "string"
        ? metadata.publishPackageRefreshedAt
        : publishingPackage?.preparedAt ?? null,
  });
  const finalHandoffState = parseJsonWithSchema(metadata.finalHandoffState, FinalHandoffStateSchema);

  return {
    book,
    bookSetup,
    stage,
    blockingReason,
    chapters,
    draftedChapters: draftedChapters.length,
    totalChapters: chapters.length,
    totalWords,
    manuscriptReady,
    draftQualityRollup,
    manuscriptAssembly,
    publishingPackage,
    publishPackageSyncState,
    finalHandoffState,
    provenanceReport,
    marketingHandoffPackage,
    latestAssessment,
    publicationPass,
    publicationPassEvaluation,
    manuscriptHistory,
    publishingHistory,
    revisionQueue: revisions,
    appliedRevisionIds,
    rejectedRevisionIds,
    editorialReadinessGate,
    editorialPreferences,
    revisionPlan,
    revisionPlanExecution,
    editorConversation,
    wholeBookAssessment:
      typeof metadata.wholeBookAssessment === "string"
        ? metadata.wholeBookAssessment
        : latestAssessment?.assessmentSummary ?? manuscriptAssembly?.editorialOverview ?? null,
    suggestedNextActions: Array.isArray(metadata.suggestedNextActions)
      ? metadata.suggestedNextActions.filter((entry): entry is string => typeof entry === "string")
      : latestAssessment?.nextActions ?? manuscriptAssembly?.outstandingConcerns ?? [],
    focusChapterKey:
      typeof metadata.focusChapterKey === "string" ? metadata.focusChapterKey : null,
    suggestedRevisionTarget,
  };
}
