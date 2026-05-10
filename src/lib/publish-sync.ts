import type { PublishPackageSyncState } from "./editing-types";

export function buildPublishPackageSyncState(params: {
  currentAssemblyVersionId: string | null;
  packageSourceAssemblyVersionId: string | null;
  hasPublishingPackage: boolean;
  lastRefreshedAt: string | null;
}) {
  const {
    currentAssemblyVersionId,
    packageSourceAssemblyVersionId,
    hasPublishingPackage,
    lastRefreshedAt,
  } = params;

  if (!hasPublishingPackage) {
    return {
      status: "missing",
      detail: currentAssemblyVersionId
        ? "Publish package has not been generated from the current manuscript yet."
        : "No manuscript assembly is available for package generation yet.",
      currentAssemblyVersionId,
      packageSourceAssemblyVersionId: null,
      lastRefreshedAt,
    } satisfies PublishPackageSyncState;
  }

  if (!packageSourceAssemblyVersionId) {
    return {
      status: "stale",
      detail: "Publish package is missing source-manuscript provenance. Refresh the package before handoff.",
      currentAssemblyVersionId,
      packageSourceAssemblyVersionId,
      lastRefreshedAt,
    } satisfies PublishPackageSyncState;
  }

  if (currentAssemblyVersionId && packageSourceAssemblyVersionId !== currentAssemblyVersionId) {
    return {
      status: "stale",
      detail: "Manuscript has changed since the publish package was prepared. Refresh the package before handoff.",
      currentAssemblyVersionId,
      packageSourceAssemblyVersionId,
      lastRefreshedAt,
    } satisfies PublishPackageSyncState;
  }

  return {
    status: "synced",
    detail: "Publish package is synced to the latest manuscript assembly.",
    currentAssemblyVersionId,
    packageSourceAssemblyVersionId,
    lastRefreshedAt,
  } satisfies PublishPackageSyncState;
}
