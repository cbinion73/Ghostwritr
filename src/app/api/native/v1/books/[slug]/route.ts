import { NextResponse } from "next/server";

import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getTotalCostForBook } from "@/lib/llm/call-log";
import { getLLMBudgetStateForBook } from "@/lib/llm/budgets";
import { getBookBySlugForUserOrThrow } from "@/lib/repositories/books";
import { getArtifactChapterId } from "@/lib/repositories/chapter-identity";
import { getWorkflowDefinition } from "@/lib/workflow-registry";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();
  const book = await getBookBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const [approvalStates, activeRuns, totalCostUsd, budget] = await Promise.all([
    db.chapterApprovalState.findMany({ where: { bookId: book.id } }),
    db.workflowRun.findMany({
      where: { bookId: book.id, status: { in: ["QUEUED", "RUNNING"] } },
      include: { stage: { select: { stageKey: true } } },
      orderBy: { startedAt: "desc" },
    }),
    getTotalCostForBook(book.id),
    getLLMBudgetStateForBook(book.id),
  ]);

  const approvalByChapter = new Map(approvalStates.map((state) => [state.chapterId, state]));
  const draftStage = book.stages.find((stage) =>
    stage.stageKey === "CHAPTER_DRAFT" || stage.stageKey === "FICTION_DRAFT",
  );
  const editingStage = book.stages.find((stage) => stage.stageKey === "EDITING");
  const draftArtifacts = book.artifacts.filter((artifact) => artifact.stageId === draftStage?.id);
  const editingArtifacts = book.artifacts.filter((artifact) => artifact.stageId === editingStage?.id);

  const artifactIds = [...draftArtifacts, ...editingArtifacts].map((artifact) => artifact.id);
  const versions = artifactIds.length
    ? await db.artifactVersion.findMany({
        where: { artifactId: { in: artifactIds } },
        orderBy: [{ artifactId: "asc" }, { versionNumber: "desc" }],
      })
    : [];
  const latestVersionByArtifact = new Map<string, (typeof versions)[number]>();
  for (const version of versions) {
    if (!latestVersionByArtifact.has(version.artifactId)) latestVersionByArtifact.set(version.artifactId, version);
  }

  const editByChapter = new Map(
    editingArtifacts.flatMap((artifact) => {
      const chapterId = getArtifactChapterId(artifact);
      return chapterId ? [[chapterId, artifact] as const] : [];
    }),
  );

  const workflow = getWorkflowDefinition(book.workflowType);
  return NextResponse.json({
    book: {
      id: book.id,
      slug: book.slug,
      title: book.titleWorking ?? "Untitled Book",
      subtitle: book.subtitle,
      workflowType: book.workflowType,
      coverImageUrl: book.coverImageUrl,
      totalCostUsd,
    },
    stages: workflow.stages.map((definition) => {
      const stage = book.stages.find((candidate) => candidate.stageKey === definition.key);
      return {
        key: definition.key,
        number: definition.number,
        label: definition.label,
        description: definition.description,
        group: definition.group,
        status: stage?.status ?? "NOT_STARTED",
        committedAt: stage?.committedAt?.toISOString() ?? null,
      };
    }),
    chapters: draftArtifacts.map((draft, index) => {
      const chapterId = getArtifactChapterId(draft) ?? `ch-${index + 1}`;
      const edit = editByChapter.get(chapterId);
      const selected = edit ?? draft;
      const version = latestVersionByArtifact.get(selected.id);
      const approval = approvalByChapter.get(chapterId);
      return {
        id: chapterId,
        title: selected.title ?? draft.title ?? `Chapter ${index + 1}`,
        content: version?.contentText ?? "",
        wordCount: (version?.contentText ?? "").trim().split(/\s+/).filter(Boolean).length,
        artifactId: selected.id,
        versionId: version?.id ?? null,
        versionNumber: version?.versionNumber ?? 0,
        kind: edit ? "final-revision" : "draft",
        approvalStatus: approval?.status ?? null,
        isStale: approval?.isStale ?? false,
        staleReason: approval?.staleReason ?? null,
      };
    }),
    activeRuns: activeRuns.map((run) => ({
      id: run.id,
      stageKey: run.stage.stageKey,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      attempt: run.attempt,
    })),
    budget,
  });
}
