import { ArtifactType, StageKey, StageStatus } from "@prisma/client";

import { BookSetupProfileSchema } from "../../artifact-schemas";
import type { EditorialMode } from "../../editing-types";
import { clearStageStaleDependency } from "../../workflow-dependencies";
import { getCommittedBookSetup } from "../../repositories/book-setup-artifacts";
import { getBookBySlugOrThrow, getStageForBook, updateStageForBook } from "../../repositories/books";
import {
  commitEditingArtifact,
  createEditingArtifactVersion,
  getEditingArtifactVersionById,
  getEditingArtifactVersions,
  getLatestEditingArtifactVersion,
} from "../../repositories/editing-artifacts";
import { generateEditorialAssessmentWorkflow } from "./assessment";
import { assembleManuscriptWorkflow } from "./assembly";
import { loadEditingChapters } from "./chapter-loader";
import { preparePublishingPackageWorkflow, syncPublishDerivedArtifacts } from "./publishing";
import { buildPublishingPackage } from "./publishing-support";
import {
  executeEditorialRevisionPlanWorkflow,
  generateEditorialRevisionPlanWorkflow,
} from "./revision";
import { getEditingWorkspace } from "./workspace";
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
  ManuscriptRevisionSchema,
} from "./workspace-schemas";

function countWords(value: string | null | undefined) {
  return value?.split(/\s+/).filter(Boolean).length ?? 0;
}

export async function commitEditingStageWorkflow(bookSlug: string) {
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
  const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
  const editorialPreferences = getEditorialPreferenceProfile(metadata);
  const revisionPlanExecution = parseJsonWithSchema(
    metadata.revisionPlanExecution,
    EditorialRevisionPlanExecutionSchema,
  );
  const revisionPlan = parseJsonWithSchema(metadata.revisionPlan, EditorialRevisionPlanSchema);

  const assembly = manuscriptVersion?.contentJson
    ? ManuscriptAssemblySchema.safeParse(manuscriptVersion.contentJson).data ?? null
    : null;
  if (!assembly) {
    throw new Error("Assemble the full manuscript before committing the Editing stage.");
  }
  if (
    assembly.chapterCount !== chapters.length ||
    chapters.some((chapter, index) => assembly.chapters[index]?.chapterKey !== chapter.chapterKey)
  ) {
    throw new Error(
      "The manuscript assembly is stale. Reassemble the manuscript so Editing matches the latest chapter drafts before committing.",
    );
  }

  // A chapter with an applied revision is SUPPOSED to diverge from its raw
  // Chapter Draft text — that's the point of Revise & Polish. Compare per
  // chapter and skip the comparison entirely for chapters an applied revision
  // already covers so reassembly never silently discards accepted edits.
  const appliedRevisionIdsForStaleCheck = Array.isArray(
    parseJson<Record<string, unknown>>(stage?.metadataJson, {}).appliedRevisionIds,
  )
    ? (parseJson<Record<string, unknown>>(stage?.metadataJson, {}).appliedRevisionIds as unknown[]).filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  const revisedChapterKeys = new Set<string>();
  for (const revisionVersionId of appliedRevisionIdsForStaleCheck) {
    const revisionVersion = await getEditingArtifactVersionById(revisionVersionId);
    const revision = parseJsonWithSchema(revisionVersion?.contentJson, ManuscriptRevisionSchema);
    for (const changed of revision?.changedChapters ?? []) {
      revisedChapterKeys.add(changed.chapterKey);
    }
  }

  const chapterSignature = (chapterKey: string, chapterText: string, quality: { score: number } | null | undefined) =>
    `${chapterKey}:${countWords(chapterText)}:${chapterText}:${quality?.score ?? "na"}`;

  const staleChapterLabels = chapters
    .filter((chapter) => !revisedChapterKeys.has(chapter.chapterKey))
    .filter((chapter) => {
      const assemblyChapter = assembly.chapters.find((c) => c.chapterKey === chapter.chapterKey);
      if (!assemblyChapter) return true;
      return (
        chapterSignature(chapter.chapterKey, chapter.chapterText, chapter.quality) !==
        chapterSignature(assemblyChapter.chapterKey, assemblyChapter.chapterText, assemblyChapter.quality)
      );
    })
    .map((chapter) => chapter.chapterLabel);

  if (staleChapterLabels.length > 0) {
    throw new Error(
      `These chapters changed after the manuscript was assembled and have no applied revision covering them: ${staleChapterLabels.join(", ")}. Reassemble the manuscript before committing Editing.`,
    );
  }

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

  if (editorialReadinessGate.recommendation === "blocked") {
    await updateStageForBook(book.id, StageKey.EDITING, {
      metadataJson: {
        ...metadata,
        editorialReadinessGate,
        updatedAt: new Date().toISOString(),
      },
    });
    throw new Error(
      `Editing is not ready to commit yet. ${editorialReadinessGate.risks[0] ?? "Run another editorial pass first."}`,
    );
  }

  await commitEditingArtifact(book.id, ArtifactType.MANUSCRIPT_ASSEMBLY);

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
    summary: "Editing committed and manuscript export package prepared.",
    contentJson: publishingPackage,
    contentText: JSON.stringify(publishingPackage, null, 2),
    promptTemplateVersion: "editing-publishing-package-v1",
    modelName: "deterministic-packager",
  });

  await commitEditingArtifact(book.id, ArtifactType.PUBLISHING_PACKAGE);

  await syncPublishDerivedArtifacts({
    bookId: book.id,
    workflowType: book.workflowType,
    assembly,
    publishingPackage,
    editorialPreferences,
    revisionPlanExecution,
  });

  await updateStageForBook(book.id, StageKey.EDITING, {
    status: StageStatus.COMMITTED,
    committedAt: stage?.committedAt ?? new Date(),
    metadataJson: {
      ...metadata,
      automationStatus: "committed",
      assembledAt: assembly.assembledAt,
      preparedAt: publishingPackage.preparedAt,
      publishPackageSourceAssemblyVersionId: manuscriptVersion?.id ?? null,
      publishPackageRefreshedAt: publishingPackage.preparedAt,
      publishDerivedRefreshedAt: new Date().toISOString(),
      totalWords: assembly.totalWords,
      chapterCount: assembly.chapterCount,
      editorialReadinessGate,
    },
  });

  await clearStageStaleDependency(bookSlug, StageKey.EDITING);

  return publishingPackage;
}

export async function runFullEditorialLoopWorkflow(
  bookSlug: string,
  input?: {
    assessmentMode?: EditorialMode;
    planLimit?: number;
    autoApply?: boolean;
    commitAfter?: boolean;
  },
) {
  const assessmentMode = input?.assessmentMode ?? "structural-edit";
  const planLimit = input?.planLimit ?? 3;
  const autoApply = input?.autoApply ?? true;
  const commitAfter = input?.commitAfter ?? false;

  let workspace = await getEditingWorkspace(bookSlug);
  if (!workspace.manuscriptAssembly) {
    await assembleManuscriptWorkflow(bookSlug);
    workspace = await getEditingWorkspace(bookSlug);
  }

  await generateEditorialAssessmentWorkflow(bookSlug, assessmentMode, null);
  await generateEditorialRevisionPlanWorkflow(bookSlug, null);
  workspace = await executeEditorialRevisionPlanWorkflow(bookSlug, {
    limit: planLimit,
    autoApply,
  });

  if (autoApply) {
    await preparePublishingPackageWorkflow(bookSlug);
  }

  if (commitAfter) {
    const committed = await getBookBySlugOrThrow(bookSlug);
    const stage = await getStageForBook(committed.id, StageKey.EDITING);
    const metadata = parseJson<Record<string, unknown>>(stage?.metadataJson, {});
    const latestWorkspace = await getEditingWorkspace(bookSlug);
    const editorialReadinessGate = computeEditorialReadinessGate({
      manuscript: latestWorkspace.manuscriptAssembly,
      draftQualityRollup: latestWorkspace.draftQualityRollup,
      latestAssessment: latestWorkspace.latestAssessment,
      revisionPlan: latestWorkspace.revisionPlan,
      revisionPlanExecution: latestWorkspace.revisionPlanExecution,
      appliedRevisionIds: latestWorkspace.appliedRevisionIds,
      rejectedRevisionIds: latestWorkspace.rejectedRevisionIds,
      bookTargetWordCount: latestWorkspace.bookSetup?.targetWordCount ?? null,
      bookTargetTolerance: latestWorkspace.bookSetup?.wordCountTolerance ?? null,
    });

    await updateStageForBook(committed.id, StageKey.EDITING, {
      metadataJson: {
        ...metadata,
        editorialReadinessGate,
        updatedAt: new Date().toISOString(),
      },
    });

    if (editorialReadinessGate.recommendation === "ready_for_commit") {
      await commitEditingStageWorkflow(bookSlug);
    }
  }

  return getEditingWorkspace(bookSlug);
}
