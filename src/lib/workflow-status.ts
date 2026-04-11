// Simple in-memory workflow status tracker
const workflowStatus = new Map<string, { isRunning: boolean; startedAt: number }>();

export function markWorkflowRunning(bookId: string) {
  workflowStatus.set(bookId, { isRunning: true, startedAt: Date.now() });
}

export function markWorkflowComplete(bookId: string) {
  workflowStatus.delete(bookId);
}

export function isWorkflowRunning(bookId: string): boolean {
  const status = workflowStatus.get(bookId);
  if (!status) return false;

  // Auto-expire status after 5 minutes to prevent stale state
  if (Date.now() - status.startedAt > 5 * 60 * 1000) {
    workflowStatus.delete(bookId);
    return false;
  }

  return status.isRunning;
}

export function getElapsedSeconds(bookId: string): number {
  const status = workflowStatus.get(bookId);
  if (!status) return 0;
  return Math.round((Date.now() - status.startedAt) / 1000);
}
