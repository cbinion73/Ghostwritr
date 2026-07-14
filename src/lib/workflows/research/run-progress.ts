import { Prisma, StageKey, WorkflowRunStatus } from "@prisma/client";

import { parseMetadataRecord } from "../../artifact-schemas";
import { getStageForBook, updateStageForBook } from "../../repositories/books";
import { getWorkflowRunById } from "../../repositories/workflow-runs";

export function recentActivity(
  entries: Array<{ at: string; message: string }> | undefined,
  message: string,
) {
  return [{ at: new Date().toISOString(), message }, ...(entries ?? [])].slice(0, 3);
}

export async function pulseResearchStage(input: {
  bookId: string;
  currentChapterKey?: string | null;
  currentAction: string;
  message: string;
}) {
  const stage = await getStageForBook(input.bookId, StageKey.RESEARCH);
  const metadata = parseMetadataRecord(stage?.metadataJson);

  await updateStageForBook(input.bookId, StageKey.RESEARCH, {
    metadataJson: {
      ...metadata,
      automationStatus: "running",
      currentAction: input.currentAction,
      currentChapterKey: input.currentChapterKey ?? null,
      recentActivity: recentActivity(
        Array.isArray(metadata.recentActivity)
          ? (metadata.recentActivity as Array<{ at: string; message: string }>)
          : undefined,
        input.message,
      ),
      lastRunAt: new Date().toISOString(),
    } as Prisma.InputJsonValue,
  });
}

export async function wasResearchWorkflowCanceled(runId?: string | null) {
  if (!runId) {
    return false;
  }

  const run = await getWorkflowRunById(runId);
  return run?.status === WorkflowRunStatus.CANCELED;
}
