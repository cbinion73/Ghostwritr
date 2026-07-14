import { notFound } from "next/navigation";
import { ArtifactType, BookWorkflowType } from "@prisma/client";
import type { StageStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookSpineForUser } from "@/lib/repositories/book-spine";
import {
  STAGE_TOKENS,
  FICTION_STAGE_TOKENS,
  type StageGroup,
} from "@/lib/ui/stage-tokens";

import { WorkspaceShell, type WorkspaceStage } from "./workspace-shell";
import { EvidenceRoomContent } from "./research/evidence-room-content";
import { PromiseDetailContent } from "./promise/promise-detail-content";
import { PromiseWizard } from "./promise/promise-wizard";
import { OutlineDetailContent } from "./outline/outline-detail-content";
import { BaseStoryDetailContent } from "./base-story/base-story-detail-content";
import { ExternalStoriesContent } from "./external-stories/external-stories-content";
import { PersonalStoriesContent } from "./personal-stories/personal-stories-content";
import { BookSetupDetailContent } from "./setup/book-setup-detail-content";
import { EditingDetailContent } from "./editing/editing-detail-content";
import { TypesetDetailContent } from "./typeset/typeset-detail-content";
import { FictionStageDetailContent } from "./fiction-stage-detail-content";
import { getOvernightState } from "@/lib/workflows/overnight-build";

export default async function BookWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    stage?: string;
    tabId?: string;
    wizard?: string;
    phase?: string;
    targetType?: string;
    targetId?: string;
    chapter?: string;
  }>;
}) {
  const { slug } = await params;
  const query = (await searchParams) ?? {};
  const user = await requireAuthenticatedAppUser();
  const spine = await getBookSpineForUser(slug, user.id);

  if (!spine) notFound();

  const isFiction = spine.book.workflowType === BookWorkflowType.FICTION;
  const tokens = isFiction ? FICTION_STAGE_TOKENS : STAGE_TOKENS;
  const groupKeys: StageGroup[] = isFiction
    ? ["setup", "story-architecture", "production", "post-production"]
    : ["setup", "material", "production", "post-production"];

  const stageByKey = new Map(spine.stages.map((s) => [s.stageKey, s]));

  // Fetch committed artifact content for all stages (for the artifact viewer panel)
  const committedArtifacts = await db.artifact.findMany({
    where: {
      bookId: spine.book.id,
      status: { in: ["COMMITTED", "REVIEW_READY"] },
    },
    select: {
      stage: { select: { stageKey: true } },
      versions: {
        select: { contentText: true },
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  const committedContentByKey = new Map(
    committedArtifacts.map((a) => [
      a.stage.stageKey,
      a.versions[0]?.contentText ?? null,
    ]),
  );
  const approvedPhase1Brief = isFiction
    ? null
    : await db.artifact.findFirst({
        where: {
          bookId: spine.book.id,
          artifactType: ArtifactType.PHASE1_STRATEGIC_BRIEF,
          committedVersionId: { not: null },
        },
        select: { id: true },
      });
  const requiresApprovedPhase1 = (stageKey: string) =>
    !isFiction && stageKey !== "BOOK_SETUP" && stageKey !== "PROMISE";

  const statusByTokenIdx = tokens.map((t) => {
    const row = stageByKey.get(t.key);
    return (row?.status ?? "NOT_STARTED") as StageStatus;
  });

  // WORKBOOK_DESIGN is optional/skippable (shown with a "—" dash, never a
  // hard gate) — when checking whether a stage is locked, skip past it to
  // find the nearest real preceding stage, so an unstarted-but-optional
  // Workbook Design doesn't wrongly lock Editing right after it.
  const stages: WorkspaceStage[] = tokens.map((t, idx) => {
    const row = stageByKey.get(t.key);
    let gateIdx = idx - 1;
    while (gateIdx >= 0 && tokens[gateIdx].key === "WORKBOOK_DESIGN") {
      gateIdx -= 1;
    }
    const locked =
      (gateIdx >= 0 && statusByTokenIdx[gateIdx] === "NOT_STARTED") ||
      (requiresApprovedPhase1(t.key) && !approvedPhase1Brief);
    return {
      key: t.key,
      number: t.number,
      label: t.label,
      group: t.group,
      description: t.description,
      route: t.route(slug),
      status: statusByTokenIdx[idx],
      artifactCount: row?.artifactCount ?? 0,
      locked,
      committedContent: committedContentByKey.get(t.key) ?? null,
    };
  });

  const totalCommitted = stages.filter((s) => s.status === "COMMITTED").length;
  const totalArtifacts = stages.reduce((sum, s) => sum + s.artifactCount, 0);

  // Default to Chapter Draft (or Fiction Draft) as the primary workspace view.
  // Fall back to the active/next-unlocked stage only if drafting hasn't started.
  const draftStageKey = isFiction ? "FICTION_DRAFT" : "CHAPTER_DRAFT";
  const draftStage = stages.find((s) => s.key === draftStageKey);
  // ?stage= deep link (used by retired standalone routes) wins when valid.
  const requestedStage = stages.find((s) => s.key === query.stage && !s.locked);
  const defaultStage =
    requestedStage ??
    (draftStage && !draftStage.locked ? draftStage : null) ??
    stages.find((s) => s.status === "IN_PROGRESS" || s.status === "READY_FOR_REVIEW") ??
    stages.find((s) => !s.locked) ??
    stages[0];

  // The Evidence Room and the Verdict room both render server-side and
  // mount as slots for their respective stages.
  const researchStage = stages.find((s) => s.key === "RESEARCH");
  const researchDetail =
    researchStage && !researchStage.locked ? (
      <EvidenceRoomContent
        slug={slug}
        tabId={query.tabId}
        tabHrefBase={`/books/${slug}?stage=RESEARCH`}
      />
    ) : null;

  const promiseStage = stages.find((s) => s.key === "PROMISE");
  const promiseDetail =
    promiseStage && !promiseStage.locked ? <PromiseDetailContent slug={slug} /> : null;

  const outlineStage = stages.find((s) => s.key === "OUTLINE");
  const outlineDetail =
    outlineStage && !outlineStage.locked ? (
      <OutlineDetailContent
        slug={slug}
        query={{ phase: query.phase, targetType: query.targetType, targetId: query.targetId }}
      />
    ) : null;

  const baseStoryStage = stages.find((s) => s.key === "BASE_STORY");
  const baseStoryDetail =
    baseStoryStage && !baseStoryStage.locked ? <BaseStoryDetailContent slug={slug} /> : null;

  const externalStoriesStage = stages.find((s) => s.key === "EXTERNAL_STORIES");
  const externalStoriesDetail =
    externalStoriesStage && !externalStoriesStage.locked ? (
      <ExternalStoriesContent
        slug={slug}
        tabId={query.tabId}
        tabHrefBase={`/books/${slug}?stage=EXTERNAL_STORIES`}
      />
    ) : null;

  const personalStoriesStage = stages.find((s) => s.key === "PERSONAL_STORIES");
  const personalStoriesDetail =
    personalStoriesStage && !personalStoriesStage.locked ? (
      <PersonalStoriesContent slug={slug} />
    ) : null;

  const bookSetupStage = stages.find((s) => s.key === "BOOK_SETUP");
  const bookSetupDetail =
    bookSetupStage && !bookSetupStage.locked ? <BookSetupDetailContent slug={slug} /> : null;

  const editingStage = stages.find((s) => s.key === "EDITING");
  const editingDetail =
    editingStage && !editingStage.locked ? (
      <EditingDetailContent slug={slug} query={query} />
    ) : null;

  const typesetStage = stages.find((s) => s.key === "TYPESET");
  const typesetDetail =
    typesetStage && !typesetStage.locked ? <TypesetDetailContent slug={slug} /> : null;

  const storySetupStage = stages.find((s) => s.key === "STORY_SETUP");
  const storySetupDetail =
    storySetupStage && !storySetupStage.locked ? (
      <FictionStageDetailContent slug={slug} stageKey="STORY_SETUP" />
    ) : null;

  const storyCoreStage = stages.find((s) => s.key === "STORY_CORE");
  const storyCoreDetail =
    storyCoreStage && !storyCoreStage.locked ? (
      <FictionStageDetailContent slug={slug} stageKey="STORY_CORE" />
    ) : null;

  const worldCastStage = stages.find((s) => s.key === "WORLD_CAST");
  const worldCastDetail =
    worldCastStage && !worldCastStage.locked ? (
      <FictionStageDetailContent slug={slug} stageKey="WORLD_CAST" />
    ) : null;

  const plotBlueprintStage = stages.find((s) => s.key === "PLOT_BLUEPRINT");
  const plotBlueprintDetail =
    plotBlueprintStage && !plotBlueprintStage.locked ? (
      <FictionStageDetailContent slug={slug} stageKey="PLOT_BLUEPRINT" chapter={query.chapter} />
    ) : null;

  const scenePlanStage = stages.find((s) => s.key === "SCENE_PLAN");
  const scenePlanDetail =
    scenePlanStage && !scenePlanStage.locked ? (
      <FictionStageDetailContent slug={slug} stageKey="SCENE_PLAN" chapter={query.chapter} />
    ) : null;

  const title = spine.book.titleWorking ?? slug;
  const subtitle = spine.book.subtitle;

  const overnight = getOvernightState(
    (await db.book.findUnique({ where: { id: spine.book.id }, select: { metadataJson: true } }))
      ?.metadataJson,
  );
  const morningReport =
    overnight.report && !overnight.reportAcknowledgedAt ? overnight.report : null;

  return (
    <>
      <WorkspaceShell
        slug={slug}
        bookTitle={title}
        bookSubtitle={subtitle}
        stages={stages}
        groupKeys={groupKeys}
        defaultStageKey={defaultStage.key}
        totalCommitted={totalCommitted}
        totalArtifacts={totalArtifacts}
        researchDetail={researchDetail}
        promiseDetail={promiseDetail}
        outlineDetail={outlineDetail}
        baseStoryDetail={baseStoryDetail}
        externalStoriesDetail={externalStoriesDetail}
        personalStoriesDetail={personalStoriesDetail}
        bookSetupDetail={bookSetupDetail}
        editingDetail={editingDetail}
        typesetDetail={typesetDetail}
        storySetupDetail={storySetupDetail}
        storyCoreDetail={storyCoreDetail}
        worldCastDetail={worldCastDetail}
        plotBlueprintDetail={plotBlueprintDetail}
        scenePlanDetail={scenePlanDetail}
        overnightActive={overnight.active}
        morningReport={morningReport}
      />
      {query.wizard === "true" && <PromiseWizard slug={slug} />}
    </>
  );
}
