import { BookWorkflowType } from "@prisma/client";
import type { StageKey, StageStatus } from "@prisma/client";
import { getWorkflowDefinition, type StageGroup } from "@/lib/workflow-registry";

/**
 * Stage token registry — single source of truth for stage display.
 * Order, labels, routes, and grouping live here.
 *
 * Per Sally's UX spec (04-ux-design.md):
 *  - Stages 1–4 = Setup (cool-grey gutter)
 *  - Stages 5–9 = Material (warm ochre gutter)
 *  - Stages 10–11 = Production (deep indigo gutter)
 *
 * Routes are the EXISTING per-stage pages in src/app/books/[slug]/*.
 */

export type StageToken = {
  key: StageKey;
  number: number;
  label: string;
  route: (slug: string) => string;
  group: StageGroup;
  description: string;
};

export type { StageGroup };

function stageTokensForWorkflow(workflowType: BookWorkflowType): readonly StageToken[] {
  return getWorkflowDefinition(workflowType).stages.map((stage) => ({
    key: stage.key,
    number: stage.number,
    label: stage.label,
    route: stage.href,
    group: stage.group,
    description: stage.description,
  }));
}

export const STAGE_TOKENS = stageTokensForWorkflow(BookWorkflowType.NONFICTION);

export const FICTION_STAGE_TOKENS = stageTokensForWorkflow(BookWorkflowType.FICTION);

export const WORKBOOK_STAGE_TOKENS = stageTokensForWorkflow(BookWorkflowType.WORKBOOK);

// Gutter tints chosen to sit on the dark bottle-green spine while remaining
// legible on parchment surfaces (publishing-house palette).
export const GROUP_COLORS: Record<StageGroup, { gutter: string; label: string }> = {
  setup: { gutter: "#8fa397", label: "Setup" },
  material: { gutter: "#c9a24b", label: "Material" },
  "story-architecture": { gutter: "#b08bd0", label: "Story Architecture" },
  production: { gutter: "#79b98a", label: "Production" },
  "post-production": { gutter: "#6fb3a8", label: "Post-Production" },
};

/**
 * Per Sally's UX spec §3.2: every state has shape + color + word.
 * No state is encoded by color alone.
 */
export type StageStateDisplay = {
  shape: string;       // Unicode glyph — readable in monochrome
  color: string;       // hex color
  label: string;       // human word (accessible text)
  ariaLabel: string;   // longer description for screen readers
};

export const STAGE_STATE_DISPLAY: Record<StageStatus, StageStateDisplay> = {
  NOT_STARTED: {
    shape: "—",
    color: "#8b8368",
    label: "LOCKED",
    ariaLabel: "Not yet started",
  },
  IN_PROGRESS: {
    shape: "◑",
    color: "#d9a441",
    label: "IN PROGRESS",
    ariaLabel: "Currently in progress",
  },
  READY_FOR_REVIEW: {
    shape: "●",
    color: "#c9a24b",
    label: "REVIEW READY",
    ariaLabel: "Awaiting your review",
  },
  COMMITTED: {
    shape: "◆",
    color: "#79b98a",
    label: "COMMITTED",
    ariaLabel: "Committed",
  },
  BLOCKED: {
    shape: "▲",
    color: "#c65b4e",
    label: "BLOCKED — SEE DIAGNOSIS",
    ariaLabel: "Blocked, see diagnosis",
  },
};
