export type CompatibilitySeamKind = "route-alias" | "legacy-module" | "legacy-route-name";

export type CompatibilitySeam = {
  id: string;
  kind: CompatibilitySeamKind;
  legacyPath: string;
  canonicalOwner: string;
  status: "deprecated" | "compatibility-only";
  retirementCondition: string;
};

/**
 * Central inventory of compatibility seams that are intentionally retained.
 * A legacy path not listed here is not an approved second implementation.
 */
export const COMPATIBILITY_SEAMS = [
  {
    id: "chapter-draft-artifacts-route",
    kind: "route-alias",
    legacyPath: "/api/books/[slug]/agent-chat/chapter-draft",
    canonicalOwner: "/api/books/[slug]/chapter-draft/artifacts",
    status: "deprecated",
    retirementCondition: "All external clients have migrated to the canonical Chapter Draft artifact route.",
  },
  {
    id: "chapter-draft-approve-all-route",
    kind: "route-alias",
    legacyPath: "/api/books/[slug]/agent-chat/chapter-draft/approve-all",
    canonicalOwner: "/api/books/[slug]/chapter-draft/approve-all",
    status: "deprecated",
    retirementCondition: "All external clients have migrated to the canonical Chapter Draft approval route.",
  },
  {
    id: "stage-artifact-save-route-name",
    kind: "route-alias",
    legacyPath: "/api/books/[slug]/agent-chat/save-draft",
    canonicalOwner: "/api/books/[slug]/stage-artifacts/save-draft",
    status: "deprecated",
    retirementCondition: "External clients no longer call the legacy draft save route.",
  },
  {
    id: "stage-artifact-commit-route-name",
    kind: "route-alias",
    legacyPath: "/api/books/[slug]/agent-chat/commit",
    canonicalOwner: "/api/books/[slug]/stage-artifacts/commit",
    status: "deprecated",
    retirementCondition: "External clients no longer call the legacy artifact commit route.",
  },
  {
    id: "editing-artifact-route-name",
    kind: "route-alias",
    legacyPath: "/api/books/[slug]/agent-chat/editing",
    canonicalOwner: "/api/books/[slug]/editing/artifacts",
    status: "deprecated",
    retirementCondition: "External clients no longer call the legacy Editing artifact route.",
  },
  {
    id: "stage-artifact-approve-route",
    kind: "route-alias",
    legacyPath: "/api/books/[slug]/agent-chat/approve",
    canonicalOwner: "/api/books/[slug]/stage-artifacts/approve",
    status: "deprecated",
    retirementCondition: "External clients no longer call the legacy artifact approval route.",
  },
  {
    id: "stage-transition-commit-route",
    kind: "route-alias",
    legacyPath: "/api/books/[slug]/agent-chat/commit-stage",
    canonicalOwner: "/api/books/[slug]/stage-transition/commit",
    status: "deprecated",
    retirementCondition: "External clients no longer call the legacy stage transition route.",
  },
  {
    id: "stage-artifact-dossiers-route",
    kind: "route-alias",
    legacyPath: "/api/books/[slug]/agent-chat/dossiers",
    canonicalOwner: "/api/books/[slug]/stage-artifacts/dossiers",
    status: "deprecated",
    retirementCondition: "External clients no longer call the legacy dossier listing route.",
  },
  {
    id: "stage-artifact-save-dossier-route",
    kind: "route-alias",
    legacyPath: "/api/books/[slug]/agent-chat/save-dossier",
    canonicalOwner: "/api/books/[slug]/stage-artifacts/save-dossier",
    status: "deprecated",
    retirementCondition: "External clients no longer call the legacy dossier save route.",
  },
  {
    id: "editing-approve-all-route",
    kind: "route-alias",
    legacyPath: "/api/books/[slug]/agent-chat/editing/approve-all",
    canonicalOwner: "/api/books/[slug]/editing/approve-all",
    status: "deprecated",
    retirementCondition: "External clients no longer call the legacy Editing approval route.",
  },
  {
    id: "promise-root-module",
    kind: "legacy-module",
    legacyPath: "src/lib/workflows/promise.ts",
    canonicalOwner: "src/lib/workflows/promise-public.ts",
    status: "deprecated",
    retirementCondition: "Private generation copies are removed and all callers import focused Promise modules.",
  },
  {
    id: "editing-root-schema-module",
    kind: "legacy-module",
    legacyPath: "src/lib/workflows/editing.ts",
    canonicalOwner: "src/lib/workflows/editing/workspace-schemas.ts",
    status: "deprecated",
    retirementCondition: "All schema imports resolve through the canonical editing schema module.",
  },
] as const satisfies readonly CompatibilitySeam[];

export function getCompatibilitySeam(id: string): CompatibilitySeam | undefined {
  return COMPATIBILITY_SEAMS.find((seam) => seam.id === id);
}
