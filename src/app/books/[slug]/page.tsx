import { notFound } from "next/navigation";
import { BookWorkflowType } from "@prisma/client";
import type { StageStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { getBookSpine } from "@/lib/repositories/book-spine";
import {
  STAGE_TOKENS,
  FICTION_STAGE_TOKENS,
  type StageGroup,
} from "@/lib/ui/stage-tokens";

import { WorkspaceShell, type WorkspaceStage } from "./workspace-shell";

export default async function BookWorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const spine = await getBookSpine(slug);

  if (!spine) notFound();

  const isFiction = spine.book.workflowType === BookWorkflowType.FICTION;
  const tokens = isFiction ? FICTION_STAGE_TOKENS : STAGE_TOKENS;
  const groupKeys: StageGroup[] = isFiction
    ? ["setup", "story-architecture", "production"]
    : ["setup", "material", "production"];

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

  const statusByTokenIdx = tokens.map((t) => {
    const row = stageByKey.get(t.key);
    return (row?.status ?? "NOT_STARTED") as StageStatus;
  });

  const stages: WorkspaceStage[] = tokens.map((t, idx) => {
    const row = stageByKey.get(t.key);
    const locked = idx > 0 && statusByTokenIdx[idx - 1] === "NOT_STARTED";
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

  const defaultStage =
    stages.find((s) => s.status === "IN_PROGRESS" || s.status === "READY_FOR_REVIEW") ??
    stages.find((s) => !s.locked) ??
    stages[0];

  const title = spine.book.titleWorking ?? slug;
  const subtitle = spine.book.subtitle;

  return (
    <WorkspaceShell
      slug={slug}
      bookTitle={title}
      bookSubtitle={subtitle}
      stages={stages}
      groupKeys={groupKeys}
      defaultStageKey={defaultStage.key}
      totalCommitted={totalCommitted}
      totalArtifacts={totalArtifacts}
    />
  );
}
