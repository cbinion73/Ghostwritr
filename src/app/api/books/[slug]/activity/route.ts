import { NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getTotalCostForBook } from "@/lib/llm/call-log";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { listActiveWorkflowRunsForBook } from "@/lib/repositories/workflow-runs";
import { getElapsedSeconds, isWorkflowRunning } from "@/lib/workflow-status";
import { getStageDefinitionForKey } from "@/lib/workflow-registry";
import type { BookWorkflowType, StageKey } from "@prisma/client";

export const dynamic = "force-dynamic";

function stageLabelForKey(workflowType: BookWorkflowType, stageKey: StageKey): string {
  return getStageDefinitionForKey(workflowType, stageKey)?.label ?? stageKey;
}

export type ActivityRun = {
  runId: string;
  stageKey: string;
  stageLabel: string;
  status: string;
  startedAt: string;
  elapsedSeconds: number;
  costUsd: number;
  totalTokens: number;
  callCount: number;
  /** Most recent LLM stage role, e.g. "voice-guard:critic" — what it's doing right now. */
  latestStageRole: string | null;
  latestCallAt: string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const activeRuns = await listActiveWorkflowRunsForBook(book.id);

  const runs: ActivityRun[] = await Promise.all(
    activeRuns.map(async (run) => {
      const [agg, latest] = await Promise.all([
        db.lLMCallLog.aggregate({
          where: { workflowRunId: run.id },
          _sum: { costUsd: true, totalTokens: true },
          _count: { id: true },
        }),
        db.lLMCallLog.findFirst({
          where: { workflowRunId: run.id },
          orderBy: { createdAt: "desc" },
          select: { stageRole: true, createdAt: true },
        }),
      ]);
      return {
        runId: run.id,
        stageKey: run.stage.stageKey,
        stageLabel: stageLabelForKey(book.workflowType, run.stage.stageKey),
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        elapsedSeconds: Math.max(0, Math.round((Date.now() - run.startedAt.getTime()) / 1000)),
        costUsd: Number(agg._sum.costUsd ?? 0),
        totalTokens: agg._sum.totalTokens ?? 0,
        callCount: agg._count.id,
        latestStageRole: latest?.stageRole ?? null,
        latestCallAt: latest?.createdAt.toISOString() ?? null,
      };
    }),
  );

  // The Promise stage runs inline via server actions (no WorkflowRun row) —
  // bridge its in-memory running flag so the ticker still shows activity.
  const promiseRunning = isWorkflowRunning(book.id) && runs.length === 0;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [totalCostUsd, todayAgg] = await Promise.all([
    getTotalCostForBook(book.id),
    db.lLMCallLog.aggregate({
      where: { bookId: book.id, createdAt: { gte: startOfDay } },
      _sum: { costUsd: true },
    }),
  ]);

  return NextResponse.json({
    active: runs.length > 0 || promiseRunning,
    runs,
    promiseInline: promiseRunning
      ? { elapsedSeconds: getElapsedSeconds(book.id) }
      : null,
    totals: {
      allTimeCostUsd: totalCostUsd,
      todayCostUsd: Number(todayAgg._sum.costUsd ?? 0),
    },
  });
}
