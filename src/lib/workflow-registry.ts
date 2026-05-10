import { BookWorkflowType, StageKey } from "@prisma/client";

export type WorkflowStageDefinition = {
  key: StageKey;
  label: string;
  href: (slug: string) => string;
  description: string;
};

export type WorkflowDefinition = {
  type: BookWorkflowType;
  label: string;
  stages: WorkflowStageDefinition[];
};

const NONFICTION_WORKFLOW: WorkflowDefinition = {
  type: BookWorkflowType.NONFICTION,
  label: "Nonfiction",
  stages: [
    {
      key: StageKey.BOOK_SETUP,
      label: "Book Setup",
      href: (slug) => `/books/${slug}/setup`,
      description: "Voice, targets, guardrails, and publishing intent.",
    },
    {
      key: StageKey.PROMISE,
      label: "Promise",
      href: (slug) => `/books/${slug}/promise`,
      description: "Refine the book promise, audience, truth, market, and pitch.",
    },
    {
      key: StageKey.OUTLINE,
      label: "Outline",
      href: (slug) => `/books/${slug}/outline`,
      description: "Build the section, chapter, and paragraph architecture.",
    },
    {
      key: StageKey.BASE_STORY,
      label: "Base Story",
      href: (slug) => `/books/${slug}/base-story`,
      description: "Establish the unifying narrative spine.",
    },
    {
      key: StageKey.RESEARCH,
      label: "Research",
      href: (slug) => `/books/${slug}/research`,
      description: "Gather verified facts, data, and citations chapter by chapter.",
    },
    {
      key: StageKey.EXTERNAL_STORIES,
      label: "External Stories",
      href: (slug) => `/books/${slug}/external-stories`,
      description: "Find case studies and examples chapter by chapter.",
    },
    {
      key: StageKey.PERSONAL_STORIES,
      label: "Personal Stories",
      href: (slug) => `/books/${slug}/personal-stories`,
      description: "Capture your lived stories chapter by chapter.",
    },
    {
      key: StageKey.CHAPTER_DRAFT,
      label: "Chapter Draft",
      href: (slug) => `/books/${slug}/chapter-draft`,
      description: "Synthesize all upstream artifacts into book chapters.",
    },
    {
      key: StageKey.EDITING,
      label: "Editing",
      href: (slug) => `/books/${slug}/editing`,
      description: "Review, revise, assemble, and export the manuscript.",
    },
  ],
};

const FICTION_WORKFLOW: WorkflowDefinition = {
  type: BookWorkflowType.FICTION,
  label: "Fiction",
  stages: [
    {
      key: StageKey.BOOK_SETUP,
      label: "Book Setup",
      href: (slug) => `/books/${slug}/setup`,
      description: "Voice, targets, guardrails, and publishing intent.",
    },
    {
      key: StageKey.STORY_SETUP,
      label: "Story Setup",
      href: (slug) => `/books/${slug}/story-setup`,
      description: "Lock genre, tone, audience, POV, tense, and premise intent.",
    },
    {
      key: StageKey.STORY_CORE,
      label: "Story Core",
      href: (slug) => `/books/${slug}/story-core`,
      description: "Define theme, conflict, protagonist pressure, and story engine.",
    },
    {
      key: StageKey.WORLD_CAST,
      label: "World & Cast",
      href: (slug) => `/books/${slug}/world-cast`,
      description: "Build the story world, rules, cast, and relational tension.",
    },
    {
      key: StageKey.PLOT_BLUEPRINT,
      label: "Plot Blueprint",
      href: (slug) => `/books/${slug}/plot-blueprint`,
      description: "Shape acts, turning points, and chapter beats.",
    },
    {
      key: StageKey.SCENE_PLAN,
      label: "Scene Plan",
      href: (slug) => `/books/${slug}/scene-plan`,
      description: "Plan chapter-level and scene-level progression.",
    },
    {
      key: StageKey.FICTION_DRAFT,
      label: "Draft",
      href: (slug) => `/books/${slug}/draft`,
      description: "Draft chapter prose from the scene plan and story bible.",
    },
    {
      key: StageKey.EDITING,
      label: "Editing",
      href: (slug) => `/books/${slug}/editing`,
      description: "Review, revise, assemble, and export the manuscript.",
    },
  ],
};

export const WORKFLOW_REGISTRY: Record<BookWorkflowType, WorkflowDefinition> = {
  [BookWorkflowType.NONFICTION]: NONFICTION_WORKFLOW,
  [BookWorkflowType.FICTION]: FICTION_WORKFLOW,
};

export function getWorkflowDefinition(workflowType: BookWorkflowType) {
  return WORKFLOW_REGISTRY[workflowType];
}

export function getWorkflowStageKeys(workflowType: BookWorkflowType) {
  return getWorkflowDefinition(workflowType).stages.map((stage) => stage.key);
}

export function getStageLinksForWorkflow(workflowType: BookWorkflowType, slug: string) {
  return getWorkflowDefinition(workflowType).stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    href: stage.href(slug),
    description: stage.description,
  }));
}

export function getStageDefinitionForKey(workflowType: BookWorkflowType, stageKey: StageKey) {
  return getWorkflowDefinition(workflowType).stages.find((stage) => stage.key === stageKey) ?? null;
}

export function getFirstWorkflowHref(workflowType: BookWorkflowType, slug: string) {
  return getWorkflowDefinition(workflowType).stages[0]?.href(slug) ?? `/books/${slug}/setup`;
}

export function getNextWorkflowStage(workflowType: BookWorkflowType, stageKey: StageKey) {
  const stages = getWorkflowDefinition(workflowType).stages;
  const index = stages.findIndex((stage) => stage.key === stageKey);
  if (index === -1 || index === stages.length - 1) {
    return null;
  }

  return stages[index + 1] ?? null;
}

export function getDefaultBookWorkspaceHref(
  workflowType: BookWorkflowType,
  slug: string,
  activeStageKey?: StageKey | null,
) {
  if (activeStageKey) {
    const active = getStageDefinitionForKey(workflowType, activeStageKey);
    if (active) {
      return active.href(slug);
    }
  }

  return getFirstWorkflowHref(workflowType, slug);
}
