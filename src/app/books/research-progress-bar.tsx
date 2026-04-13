/**
 * Research Progress Bar Component
 * Shows chapter states: Locked (green), In Progress (orange), Not Started (gray)
 */

type ProgressState = {
  locked: number;
  inProgress: number;
  notStarted: number;
  total: number;
};

function calculateProgressState(
  completedChapters: number,
  totalChapters: number,
  failedChapters: number,
  provisionalChapters: number,
): ProgressState {
  const locked = completedChapters;
  const notStarted = failedChapters + provisionalChapters;
  const inProgress = totalChapters - locked - notStarted;

  return {
    locked: Math.max(0, locked),
    inProgress: Math.max(0, inProgress),
    notStarted: Math.max(0, notStarted),
    total: totalChapters,
  };
}

function getPercentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function ResearchProgressBar({
  completedChapters,
  totalChapters,
  failedChapters = 0,
  provisionalChapters = 0,
}: {
  completedChapters: number;
  totalChapters: number;
  failedChapters?: number;
  provisionalChapters?: number;
}) {
  const state = calculateProgressState(
    completedChapters,
    totalChapters,
    failedChapters,
    provisionalChapters,
  );

  const lockedPct = getPercentage(state.locked, state.total);
  const inProgressPct = getPercentage(state.inProgress, state.total);
  const notStartedPct = getPercentage(state.notStarted, state.total);

  return (
    <div className="research-progress-visualization">
      <div className="segmented-progress-bar">
        {state.locked > 0 && (
          <div
            className="progress-segment locked"
            style={{ width: `${lockedPct}%` }}
            title={`Locked: ${state.locked} chapters`}
          />
        )}
        {state.inProgress > 0 && (
          <div
            className="progress-segment in-progress"
            style={{ width: `${inProgressPct}%` }}
            title={`In Progress: ${state.inProgress} chapters`}
          />
        )}
        {state.notStarted > 0 && (
          <div
            className="progress-segment not-started"
            style={{ width: `${notStartedPct}%` }}
            title={`Not Started: ${state.notStarted} chapters`}
          />
        )}
      </div>

      <div className="progress-legend">
        <div className="legend-item">
          <span className="legend-color locked" />
          <span>Locked: {state.locked}</span>
        </div>
        <div className="legend-item">
          <span className="legend-color in-progress" />
          <span>In Progress: {state.inProgress}</span>
        </div>
        <div className="legend-item">
          <span className="legend-color not-started" />
          <span>Not Started: {state.notStarted}</span>
        </div>
      </div>
    </div>
  );
}
