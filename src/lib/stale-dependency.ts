export type StaleDependencyState = {
  changedStageKey: string;
  changedAt?: string;
  reason: string;
};

export function getStaleDependencyState(value: unknown): StaleDependencyState | null {
  const metadata = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const raw =
    metadata.staleDependency && typeof metadata.staleDependency === "object"
      ? (metadata.staleDependency as Record<string, unknown>)
      : null;

  if (!raw || typeof raw.reason !== "string" || raw.reason.trim().length === 0) {
    return null;
  }

  return {
    changedStageKey:
      typeof raw.changedStageKey === "string" ? raw.changedStageKey : "UNKNOWN_STAGE",
    changedAt: typeof raw.changedAt === "string" ? raw.changedAt : undefined,
    reason: raw.reason,
  };
}

export function getStaleDependencyRecoveryHint(stageKey?: string | null) {
  switch (stageKey) {
    case "BASE_STORY":
      return "Regenerate Base Story from the refreshed upstream outline before committing it again.";
    case "RESEARCH":
      return "Regenerate the affected dossier or rerun full research so the binder reflects the refreshed upstream inputs.";
    case "EXTERNAL_STORIES":
      return "Regenerate the story vault so the examples and case studies match the refreshed upstream inputs.";
    case "CHAPTER_DRAFT":
      return "Regenerate the affected chapter drafts so the manuscript reflects the refreshed source stack.";
    case "EDITING":
      return "Reassemble the manuscript and rerun the editorial pass so Editing reflects the latest draft inputs.";
    case "PUBLISH":
      return "Refresh the publishing package after Editing is current so the final handoff artifacts are synced again.";
    case "FICTION_DRAFT":
      return "Regenerate the affected fiction draft chapters so the manuscript reflects the refreshed story planning artifacts.";
    default:
      return "Regenerate this stage from its updated upstream artifacts before relying on it downstream.";
  }
}
