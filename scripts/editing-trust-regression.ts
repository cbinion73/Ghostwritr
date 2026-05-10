import { ArtifactType, StageKey } from "@prisma/client";

import {
  applyManuscriptRevisionWorkflow,
  assembleManuscriptWorkflow,
  executeEditorialRevisionPlanWorkflow,
  generateEditorialRevisionPlanWorkflow,
  generateManuscriptRevisionWorkflow,
  generateSuggestedRevisionFromConversationWorkflow,
  getEditingWorkspace,
  preparePublishingPackageWorkflow,
  rejectManuscriptRevisionWorkflow,
  sendEditingMessageWorkflow,
} from "../src/lib/workflows/editing";
import {
  cloneBookBySlug,
  deleteBookBySlug,
} from "../src/lib/repositories/books";
import { getLatestEditingArtifactVersion } from "../src/lib/repositories/editing-artifacts";
import { getStageControlCapabilities, retryStageWorkflow } from "../src/lib/workflows/stage-controls";

async function main() {
  const clone = await cloneBookBySlug("fiction-smoke", {
    titleWorking: `Editing Trust Regression ${Date.now()}`,
  });

  try {
    await assembleManuscriptWorkflow(clone.slug);
    const initialWorkspace = await getEditingWorkspace(clone.slug);
    const initialHistoryCount = initialWorkspace.manuscriptHistory.length;
    const initialLatestHistoryVersion = initialWorkspace.manuscriptHistory[0]?.versionNumber ?? 0;
    const initialRevisionCount = initialWorkspace.revisionQueue.length;
    const initialLatestRevisionVersion = initialWorkspace.revisionQueue[0]?.versionNumber ?? 0;
    const initialPublishingVersion =
      (await getLatestEditingArtifactVersion(clone.id, ArtifactType.PUBLISHING_PACKAGE))?.versionNumber ?? 0;
    const initialProvenanceVersion =
      (await getLatestEditingArtifactVersion(clone.id, ArtifactType.PROVENANCE_REPORT))?.versionNumber ?? 0;
    const initialMarketingVersion =
      (await getLatestEditingArtifactVersion(clone.id, ArtifactType.MARKETING_HANDOFF_PACKAGE))?.versionNumber ?? 0;

    await generateManuscriptRevisionWorkflow(clone.slug, "clarity-pass", null, {
      brief: "Tighten the strongest opening chapters without flattening the story momentum.",
    });
    let workspace = await getEditingWorkspace(clone.slug);
    const rejectedCandidate = workspace.revisionQueue[0];

    if (!rejectedCandidate) {
      throw new Error("Expected a pending revision candidate after generation.");
    }

    if (workspace.appliedRevisionIds.includes(rejectedCandidate.id) || workspace.rejectedRevisionIds.includes(rejectedCandidate.id)) {
      throw new Error("Latest generated revision should start as pending.");
    }

    await rejectManuscriptRevisionWorkflow(clone.slug, rejectedCandidate.id);
    workspace = await getEditingWorkspace(clone.slug);
    if (!workspace.rejectedRevisionIds.includes(rejectedCandidate.id)) {
      throw new Error("Rejected revision ID was not persisted.");
    }

    if (!rejectedCandidate.revision.rationale.includes("Target outcome: Tighten the strongest opening chapters without flattening the story momentum.")) {
      throw new Error("Manual revision brief was not carried into the generated revision rationale.");
    }

    await generateEditorialRevisionPlanWorkflow(clone.slug, null);
    workspace = await getEditingWorkspace(clone.slug);
    const firstPlanItem = workspace.revisionPlan?.chapterQueue[0];
    if (!firstPlanItem) {
      throw new Error("Expected a generated revision plan with at least one queued item.");
    }
    if (!firstPlanItem.targetOutcome.trim()) {
      throw new Error("Revision plan items should include a target outcome.");
    }
    if (!Array.isArray(firstPlanItem.preserveNotes)) {
      throw new Error("Revision plan items should include preserve notes.");
    }
    if (!workspace.revisionPlan?.globalObjectives?.length) {
      throw new Error("Revision plan should include whole-book objectives.");
    }
    if (!workspace.revisionPlan?.coherenceRisks?.length) {
      throw new Error("Revision plan should include a coherence watchlist.");
    }

    await executeEditorialRevisionPlanWorkflow(clone.slug, {
      limit: 1,
      autoApply: false,
    });
    workspace = await getEditingWorkspace(clone.slug);
    const plannedRevision = workspace.revisionQueue[0];
    const revisionPlan = workspace.revisionPlan;
    if (!plannedRevision?.revision.rationale.includes("Target outcome:")) {
      throw new Error("Plan execution did not pass the target outcome into the generated revision.");
    }
    if (
      !revisionPlan?.globalObjectives.some((objective) =>
        plannedRevision.revision.rationale.includes(objective),
      )
    ) {
      throw new Error("Plan execution did not carry whole-book objectives into the generated revision rationale.");
    }

    await sendEditingMessageWorkflow(
      clone.slug,
      "Give me the next chapter-specific revision you would run for the strongest weak point in chapter 1.",
      workspace.chapters[0]?.chapterKey ?? null,
    );
    workspace = await getEditingWorkspace(clone.slug);
    if (!workspace.suggestedRevisionTarget?.brief) {
      throw new Error("Editor conversation did not persist a suggested revision target.");
    }
    if (
      workspace.suggestedRevisionTarget.selectedChapterKeys?.length &&
      !workspace.suggestedRevisionTarget.selectedChapterKeys.includes(workspace.chapters[0]?.chapterKey ?? "")
    ) {
      throw new Error("Chapter-focused conversation suggestion drifted away from the requested chapter.");
    }

    await generateSuggestedRevisionFromConversationWorkflow(clone.slug);
    workspace = await getEditingWorkspace(clone.slug);
    if (!workspace.revisionQueue[0]?.revision.rationale.includes("Target outcome:")) {
      throw new Error("Conversation-driven suggested revision did not produce a targeted revision rationale.");
    }

    await sendEditingMessageWorkflow(
      clone.slug,
      "Run a continuity pass across the opening movement so the first chapters land with stronger shared momentum.",
      null,
    );
    workspace = await getEditingWorkspace(clone.slug);
    if ((workspace.suggestedRevisionTarget?.selectedChapterKeys?.length ?? 0) < 2) {
      throw new Error("Whole-book continuity conversation did not produce a multi-section suggested revision target.");
    }

    const selectedChapterKeys = workspace.chapters.slice(0, 2).map((chapter) => chapter.chapterKey);
    await generateManuscriptRevisionWorkflow(clone.slug, "continuity-pass", null, {
      brief: "Rewrite the connected opening movement so the selected sections land with tighter continuity and stronger shared momentum.",
      selectedChapterKeys,
    });
    workspace = await getEditingWorkspace(clone.slug);
    const selectedSectionsRevision = workspace.revisionQueue[0];
    if (!selectedSectionsRevision) {
      throw new Error("Expected a selected-sections revision candidate.");
    }
    if (
      selectedSectionsRevision.revision.selectedChapterKeys?.length !== selectedChapterKeys.length
    ) {
      throw new Error("Selected-sections revision did not persist the targeted chapter set.");
    }
    if (
      selectedSectionsRevision.revision.changedChapters.some(
        (chapter) => !selectedChapterKeys.includes(chapter.chapterKey),
      )
    ) {
      throw new Error("Selected-sections revision rewrote chapters outside the requested target set.");
    }

    await generateManuscriptRevisionWorkflow(clone.slug, "line-edit", null);
    workspace = await getEditingWorkspace(clone.slug);
    const applyCandidate = workspace.revisionQueue.find(
      (entry) =>
        entry.id !== rejectedCandidate.id &&
        !workspace.appliedRevisionIds.includes(entry.id) &&
        !workspace.rejectedRevisionIds.includes(entry.id),
    );

    if (!applyCandidate) {
      throw new Error("Expected a second pending revision candidate to apply.");
    }

    await applyManuscriptRevisionWorkflow(clone.slug, applyCandidate.id);
    workspace = await getEditingWorkspace(clone.slug);

    if (!workspace.appliedRevisionIds.includes(applyCandidate.id)) {
      throw new Error("Applied revision ID was not persisted.");
    }

    if ((workspace.manuscriptHistory[0]?.versionNumber ?? 0) <= initialLatestHistoryVersion) {
      throw new Error("Applying a revision did not create a newer manuscript assembly version.");
    }

    if ((workspace.revisionQueue[0]?.versionNumber ?? 0) <= initialLatestRevisionVersion) {
      throw new Error("Revision queue did not retain a newer generated revision version.");
    }

    const refreshedPublishingVersion =
      (await getLatestEditingArtifactVersion(clone.id, ArtifactType.PUBLISHING_PACKAGE))?.versionNumber ?? 0;
    const refreshedProvenanceVersion =
      (await getLatestEditingArtifactVersion(clone.id, ArtifactType.PROVENANCE_REPORT))?.versionNumber ?? 0;
    const refreshedMarketingVersion =
      (await getLatestEditingArtifactVersion(clone.id, ArtifactType.MARKETING_HANDOFF_PACKAGE))?.versionNumber ?? 0;

    if (refreshedPublishingVersion <= initialPublishingVersion) {
      throw new Error("Applying a revision did not refresh the publishing package.");
    }
    if (refreshedProvenanceVersion <= initialProvenanceVersion) {
      throw new Error("Applying a revision did not refresh the provenance report.");
    }
    if (refreshedMarketingVersion <= initialMarketingVersion) {
      throw new Error("Applying a revision did not refresh the marketing handoff package.");
    }

    if (workspace.publishPackageSyncState.status !== "synced") {
      throw new Error("Publish package should be synced immediately after apply-driven refresh.");
    }

    await assembleManuscriptWorkflow(clone.slug);
    workspace = await getEditingWorkspace(clone.slug);

    if (workspace.publishPackageSyncState.status !== "stale") {
      throw new Error("Manual manuscript reassembly should mark the publish package as stale.");
    }

    await preparePublishingPackageWorkflow(clone.slug);
    workspace = await getEditingWorkspace(clone.slug);

    if (workspace.publishPackageSyncState.status !== "synced") {
      throw new Error("Refreshing the publish package did not clear the stale sync state.");
    }

    const latestHistory = workspace.manuscriptHistory[0];
    const previousHistory = workspace.manuscriptHistory[1];

    if (!latestHistory || !previousHistory) {
      throw new Error("Expected at least two manuscript history entries after applying a revision.");
    }

    if (!Array.isArray(latestHistory.chapters) || latestHistory.chapters.length === 0) {
      throw new Error("Latest manuscript history entry is missing compareable chapter snapshots.");
    }

    if (latestHistory.id === previousHistory.id) {
      throw new Error("Latest and previous manuscript history entries should be distinct.");
    }

    const capabilityMatrix = {
      baseStory: getStageControlCapabilities(StageKey.BASE_STORY),
      research: getStageControlCapabilities(StageKey.RESEARCH),
      externalStories: getStageControlCapabilities(StageKey.EXTERNAL_STORIES),
      editing: getStageControlCapabilities(StageKey.EDITING),
    };

    if (!capabilityMatrix.baseStory.canRetry || capabilityMatrix.baseStory.canResumeFailed) {
      throw new Error("Base Story stage controls are not reporting the expected capabilities.");
    }

    if (!capabilityMatrix.research.canRetry || !capabilityMatrix.research.canResumeFailed) {
      throw new Error("Research stage controls are not reporting the expected capabilities.");
    }

    if (!capabilityMatrix.externalStories.canRetry || !capabilityMatrix.externalStories.canResumeFailed) {
      throw new Error("External Stories stage controls are not reporting the expected capabilities.");
    }

    if (capabilityMatrix.editing.canRetry || capabilityMatrix.editing.canCancel) {
      throw new Error("Editing stage should not expose retry/cancel controls.");
    }

    let unsupportedError = "";
    try {
      await retryStageWorkflow(clone.slug, StageKey.EDITING, () => {});
    } catch (error) {
      unsupportedError = error instanceof Error ? error.message : String(error);
    }

    if (!unsupportedError.includes("Retry is not implemented")) {
      throw new Error("Unsupported retry did not fail with the expected guardrail message.");
    }

    console.log(
      JSON.stringify(
        {
          slug: clone.slug,
          initialHistoryCount,
          finalHistoryCount: workspace.manuscriptHistory.length,
          initialLatestHistoryVersion,
          finalLatestHistoryVersion: workspace.manuscriptHistory[0]?.versionNumber ?? 0,
          initialRevisionCount,
          finalRevisionCount: workspace.revisionQueue.length,
          initialLatestRevisionVersion,
          finalLatestRevisionVersion: workspace.revisionQueue[0]?.versionNumber ?? 0,
          initialPublishingVersion,
          refreshedPublishingVersion,
          initialProvenanceVersion,
          refreshedProvenanceVersion,
          initialMarketingVersion,
          refreshedMarketingVersion,
          appliedRevisionId: applyCandidate.id,
          rejectedRevisionId: rejectedCandidate.id,
          latestHistoryVersion: latestHistory.versionNumber,
          previousHistoryVersion: previousHistory.versionNumber,
        },
        null,
        2,
      ),
    );
  } finally {
    await deleteBookBySlug(clone.slug);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
