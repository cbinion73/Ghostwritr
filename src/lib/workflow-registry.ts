import { ArtifactType, BookWorkflowType, StageKey } from "@prisma/client";
import type { StageRole } from "./llm/routing";

export type StageGroup = "setup" | "material" | "production" | "post-production" | "story-architecture";

export type WorkflowStageDefinition = {
  key: StageKey;
  number: number;
  label: string;
  href: (slug: string) => string;
  group: StageGroup;
  description: string;
};

export type StageApprovalMode = "none" | "stage" | "chapter" | "phase-1";

export type WorkflowStageOperationalMetadata = {
  primaryArtifactType?: ArtifactType;
  artifactTypes: readonly ArtifactType[];
  stageRoles: readonly StageRole[];
  approvalMode: StageApprovalMode;
  staleArtifactTypes: readonly ArtifactType[];
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
      number: 1,
      label: "Book Setup",
      href: (slug) => `/books/${slug}/setup`,
      group: "setup",
      description: "Voice, targets, guardrails, and publishing intent.",
    },
    {
      key: StageKey.PROMISE,
      number: 2,
      label: "Promise",
      href: (slug) => `/books/${slug}/promise`,
      group: "setup",
      description: "Refine the book promise, audience, truth, market, and pitch.",
    },
    {
      key: StageKey.OUTLINE,
      number: 3,
      label: "Outline",
      href: (slug) => `/books/${slug}/outline`,
      group: "material",
      description: "Build the section, chapter, and paragraph architecture.",
    },
    {
      key: StageKey.BASE_STORY,
      number: 4,
      label: "Base Story",
      href: (slug) => `/books/${slug}/base-story`,
      group: "material",
      description: "Establish the unifying narrative spine.",
    },
    {
      key: StageKey.RESEARCH,
      number: 5,
      label: "Research",
      href: (slug) => `/books/${slug}/research`,
      group: "material",
      description: "Gather verified facts, data, and citations chapter by chapter.",
    },
    {
      key: StageKey.EXTERNAL_STORIES,
      number: 6,
      label: "External Stories",
      href: (slug) => `/books/${slug}/external-stories`,
      group: "material",
      description: "Find case studies and examples chapter by chapter.",
    },
    {
      key: StageKey.PERSONAL_STORIES,
      number: 7,
      label: "Personal Stories",
      href: (slug) => `/books/${slug}/personal-stories`,
      group: "material",
      description: "Capture your lived stories chapter by chapter.",
    },
    {
      key: StageKey.MANIFEST,
      number: 8,
      label: "Chapter Manifest",
      href: (slug) => `/books/${slug}/manifest`,
      group: "production",
      description: "Assign source materials per chapter for targeted generation.",
    },
    {
      key: StageKey.CHAPTER_DRAFT,
      number: 9,
      label: "Chapter Draft",
      href: (slug) => `/books/${slug}/chapter-draft`,
      group: "production",
      description: "Synthesize all upstream artifacts into book chapters.",
    },
    {
      key: StageKey.EDITING,
      number: 10,
      label: "Editing",
      href: (slug) => `/books/${slug}/editing`,
      group: "production",
      description: "Review, revise, assemble, and export the manuscript.",
    },
    {
      key: StageKey.TYPESET,
      number: 11,
      label: "Typeset",
      href: (slug) => `/books/${slug}/typeset`,
      group: "production",
      description: "KDP and B&N Press formatting, ISBN, front matter, and cover brief.",
    },
    {
      key: StageKey.AUDIO_PREP,
      number: 12,
      label: "Audio Prep",
      href: (slug) => `/books/${slug}/audio-prep`,
      group: "post-production",
      description: "ACX audiobook package: checklist, recording notes, pronunciation guide.",
    },
    {
      key: StageKey.COURSE_DESIGN,
      number: 13,
      label: "Course Design",
      href: (slug) => `/books/${slug}/course-design`,
      group: "post-production",
      description: "Online course structure, modules, exercises, and platform selection.",
    },
  ],
};

const FICTION_WORKFLOW: WorkflowDefinition = {
  type: BookWorkflowType.FICTION,
  label: "Fiction",
  stages: [
    {
      key: StageKey.BOOK_SETUP,
      number: 1,
      label: "Book Setup",
      href: (slug) => `/books/${slug}/setup`,
      group: "setup",
      description: "Voice, targets, guardrails, and publishing intent.",
    },
    {
      key: StageKey.PROMISE,
      number: 2,
      label: "Promise",
      href: (slug) => `/books/${slug}/promise`,
      group: "setup",
      description: "The story premise and reader promise.",
    },
    {
      key: StageKey.MARKET_ANALYSIS,
      number: 3,
      label: "Market Viability",
      href: (slug) => `/books/${slug}/market-analysis`,
      group: "setup",
      description: "11-dimension scoring, hard gate at 3.5/5.",
    },
    {
      key: StageKey.STORY_SETUP,
      number: 3.5,
      label: "Story Setup",
      href: (slug) => `/books/${slug}/story-setup`,
      group: "story-architecture",
      description: "Story question, voice, genre, and premise.",
    },
    {
      key: StageKey.STORY_CORE,
      number: 4,
      label: "Story Core",
      href: (slug) => `/books/${slug}/story-core`,
      group: "story-architecture",
      description: "Define theme, conflict, protagonist pressure, and story engine.",
    },
    {
      key: StageKey.WORLD_CAST,
      number: 5,
      label: "World & Cast",
      href: (slug) => `/books/${slug}/world-cast`,
      group: "story-architecture",
      description: "Build the story world, rules, cast, and relational tension.",
    },
    {
      key: StageKey.PLOT_BLUEPRINT,
      number: 6,
      label: "Plot Blueprint",
      href: (slug) => `/books/${slug}/plot-blueprint`,
      group: "story-architecture",
      description: "Shape acts, turning points, and chapter beats.",
    },
    {
      key: StageKey.SCENE_PLAN,
      number: 7,
      label: "Scene Plan",
      href: (slug) => `/books/${slug}/scene-plan`,
      group: "story-architecture",
      description: "Plan chapter-level and scene-level progression.",
    },
    {
      key: StageKey.FICTION_DRAFT,
      number: 8,
      label: "Draft",
      href: (slug) => `/books/${slug}/draft`,
      group: "production",
      description: "Draft chapter prose from the scene plan and story bible.",
    },
    {
      key: StageKey.EDITING,
      number: 9,
      label: "Editing",
      href: (slug) => `/books/${slug}/editing`,
      group: "production",
      description: "Review, revise, assemble, and export the manuscript.",
    },
    {
      key: StageKey.TYPESET,
      number: 10,
      label: "Typeset",
      href: (slug) => `/books/${slug}/typeset`,
      group: "production",
      description: "KDP and B&N Press formatting, ISBN, front matter, and cover brief.",
    },
    {
      key: StageKey.AUDIO_PREP,
      number: 11,
      label: "Audio Prep",
      href: (slug) => `/books/${slug}/audio-prep`,
      group: "post-production",
      description: "ACX audiobook package: checklist, recording notes, pronunciation guide.",
    },
    {
      key: StageKey.COURSE_DESIGN,
      number: 12,
      label: "Course Design",
      href: (slug) => `/books/${slug}/course-design`,
      group: "post-production",
      description: "Online course structure, modules, exercises, and platform selection.",
    },
  ],
};

const WORKBOOK_WORKFLOW: WorkflowDefinition = {
  type: BookWorkflowType.WORKBOOK,
  label: "Workbook",
  stages: [
    {
      key: StageKey.CHAPTER_DRAFT,
      number: 1,
      label: "Chapter Draft",
      href: (slug) => `/books/${slug}/chapter-draft`,
      group: "production",
      description: "Workbook exercises, checklists, and reflection questions extracted from the parent book.",
    },
    {
      key: "WORKBOOK_DESIGN" as StageKey,
      number: 2,
      label: "Workbook Design",
      href: (slug) => `/books/${slug}?stage=WORKBOOK_DESIGN`,
      group: "production",
      description: "Sage enriches raw exercises into a standalone learning companion with context, instructions, and reflection prompts.",
    },
    {
      key: StageKey.TYPESET,
      number: 3,
      label: "Typeset",
      href: (slug) => `/books/${slug}/typeset`,
      group: "production",
      description: "KDP and B&N Press formatting, ISBN, front matter, and cover brief.",
    },
    {
      key: StageKey.AUDIO_PREP,
      number: 4,
      label: "Audio Prep",
      href: (slug) => `/books/${slug}/audio-prep`,
      group: "post-production",
      description: "ACX audiobook package: checklist, recording notes, pronunciation guide.",
    },
  ],
};

export const WORKFLOW_REGISTRY: Record<BookWorkflowType, WorkflowDefinition> = {
  [BookWorkflowType.NONFICTION]: NONFICTION_WORKFLOW,
  [BookWorkflowType.FICTION]: FICTION_WORKFLOW,
  [BookWorkflowType.WORKBOOK]: WORKBOOK_WORKFLOW,
};

export const STAGE_OPERATIONAL_METADATA: Partial<
  Record<StageKey, WorkflowStageOperationalMetadata>
> = {
  [StageKey.BOOK_SETUP]: {
    primaryArtifactType: ArtifactType.BOOK_SETUP_PROFILE,
    artifactTypes: [ArtifactType.BOOK_SETUP_PROFILE],
    stageRoles: ["setup:voice-blending"],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
  [StageKey.PROMISE]: {
    primaryArtifactType: ArtifactType.PROMISE_BRIEF,
    artifactTypes: [
      ArtifactType.PROMISE_BRIEF,
      ArtifactType.PERSONA_PACK,
      ArtifactType.AUDIENCE_RESEARCH,
      ArtifactType.MARKET_REPORT,
      ArtifactType.PHASE1_STRATEGIC_BRIEF,
    ],
    stageRoles: [
      "promise:author",
      "promise:structured",
      "audience:author",
      "audience:structured",
      "market-analysis:research",
    ],
    approvalMode: "phase-1",
    staleArtifactTypes: [],
  },
  [StageKey.MARKET_ANALYSIS]: {
    primaryArtifactType: ArtifactType.MARKET_REPORT,
    artifactTypes: [ArtifactType.MARKET_REPORT],
    stageRoles: ["market-analysis:research"],
    approvalMode: "phase-1",
    staleArtifactTypes: [],
  },
  [StageKey.OUTLINE]: {
    primaryArtifactType: ArtifactType.OUTLINE,
    artifactTypes: [ArtifactType.OUTLINE, ArtifactType.OUTLINE_EXPANSION, ArtifactType.CHAPTER_PARAGRAPH_PLAN],
    stageRoles: ["outline:phase-1", "outline:phase-2", "outline:phase-3"],
    approvalMode: "stage",
    staleArtifactTypes: [ArtifactType.CHAPTER_PARAGRAPH_PLAN],
  },
  [StageKey.BASE_STORY]: {
    primaryArtifactType: ArtifactType.BASE_STORY,
    artifactTypes: [ArtifactType.BASE_STORY],
    stageRoles: ["base-story:author"],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
  [StageKey.RESEARCH]: {
    primaryArtifactType: ArtifactType.RESEARCH_PACK,
    artifactTypes: [ArtifactType.RESEARCH_PACK],
    stageRoles: [
      "research:agent-1-researcher",
      "research:agent-2-extractor",
      "research:agent-3-verifier",
      "research:questions",
      "research:extract",
      "research:verify",
      "research:adjudicate",
    ],
    approvalMode: "stage",
    staleArtifactTypes: [ArtifactType.RESEARCH_PACK],
  },
  [StageKey.EXTERNAL_STORIES]: {
    primaryArtifactType: ArtifactType.EXTERNAL_STORY_PACK,
    artifactTypes: [ArtifactType.EXTERNAL_STORY_PACK],
    stageRoles: ["external-stories:extract"],
    approvalMode: "stage",
    staleArtifactTypes: [ArtifactType.EXTERNAL_STORY_PACK],
  },
  [StageKey.PERSONAL_STORIES]: {
    primaryArtifactType: ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
    artifactTypes: [ArtifactType.PERSONAL_STORY_CHAT, ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA],
    stageRoles: ["personal-stories:interview"],
    approvalMode: "stage",
    staleArtifactTypes: [ArtifactType.PERSONAL_STORY_CHAT, ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA],
  },
  [StageKey.MANIFEST]: {
    primaryArtifactType: ArtifactType.CHAPTER_MANIFEST,
    artifactTypes: [ArtifactType.CHAPTER_MANIFEST],
    stageRoles: ["manifest:generate"],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
  [StageKey.CHAPTER_DRAFT]: {
    primaryArtifactType: ArtifactType.CHAPTER_DRAFT,
    artifactTypes: [ArtifactType.CHAPTER_DRAFT],
    stageRoles: ["chapter-draft:author", "chapter-draft:revise", "voice-guard:critic"],
    approvalMode: "chapter",
    staleArtifactTypes: [ArtifactType.CHAPTER_DRAFT],
  },
  [StageKey.EDITING]: {
    primaryArtifactType: ArtifactType.EDITORIAL_ASSESSMENT,
    artifactTypes: [
      ArtifactType.EDITORIAL_ASSESSMENT,
      ArtifactType.EDITORIAL_REVIEW,
      ArtifactType.MANUSCRIPT_REVISION,
      ArtifactType.MANUSCRIPT_ASSEMBLY,
    ],
    stageRoles: ["final-editor:assess", "final-editor:polish"],
    approvalMode: "chapter",
    staleArtifactTypes: [ArtifactType.MANUSCRIPT_REVISION],
  },
  [StageKey.TYPESET]: {
    primaryArtifactType: ArtifactType.TYPESET_PACKAGE,
    artifactTypes: [ArtifactType.TYPESET_PACKAGE],
    stageRoles: ["typeset:plan"],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
  [StageKey.STORY_SETUP]: {
    primaryArtifactType: ArtifactType.STORY_SETUP_PROFILE,
    artifactTypes: [ArtifactType.STORY_SETUP_PROFILE],
    stageRoles: ["fiction:planner"],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
  [StageKey.STORY_CORE]: {
    primaryArtifactType: ArtifactType.STORY_CORE_BIBLE,
    artifactTypes: [ArtifactType.STORY_CORE_BIBLE],
    stageRoles: ["fiction:planner"],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
  [StageKey.WORLD_CAST]: {
    primaryArtifactType: ArtifactType.WORLD_CAST_BIBLE,
    artifactTypes: [ArtifactType.WORLD_CAST_BIBLE],
    stageRoles: ["fiction:planner"],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
  [StageKey.PLOT_BLUEPRINT]: {
    primaryArtifactType: ArtifactType.FICTION_PLOT_BLUEPRINT,
    artifactTypes: [ArtifactType.FICTION_PLOT_BLUEPRINT],
    stageRoles: ["fiction:planner"],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
  [StageKey.SCENE_PLAN]: {
    primaryArtifactType: ArtifactType.FICTION_SCENE_PLAN,
    artifactTypes: [ArtifactType.FICTION_SCENE_PLAN],
    stageRoles: ["fiction:planner"],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
  [StageKey.FICTION_DRAFT]: {
    primaryArtifactType: ArtifactType.FICTION_DRAFT_MANUSCRIPT,
    artifactTypes: [ArtifactType.FICTION_DRAFT_MANUSCRIPT],
    stageRoles: ["fiction:draft", "voice-guard:critic"],
    approvalMode: "chapter",
    staleArtifactTypes: [ArtifactType.FICTION_DRAFT_MANUSCRIPT],
  },
  [StageKey.AUDIO_PREP]: {
    primaryArtifactType: ArtifactType.AUDIO_PREP_PACKAGE,
    artifactTypes: [ArtifactType.AUDIO_PREP_PACKAGE],
    stageRoles: ["audio:prep"],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
  [StageKey.COURSE_DESIGN]: {
    primaryArtifactType: ArtifactType.COURSE_DESIGN_PACKAGE,
    artifactTypes: [ArtifactType.COURSE_DESIGN_PACKAGE],
    stageRoles: ["course:design"],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
  [StageKey.WORKBOOK_DESIGN]: {
    artifactTypes: [],
    stageRoles: [],
    approvalMode: "stage",
    staleArtifactTypes: [],
  },
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

export function getStageOperationalMetadata(stageKey: StageKey) {
  return STAGE_OPERATIONAL_METADATA[stageKey] ?? null;
}

export function getPrimaryArtifactTypeForStage(stageKey: StageKey) {
  return getStageOperationalMetadata(stageKey)?.primaryArtifactType ?? null;
}

export function getArtifactTypesForStage(stageKey: StageKey) {
  return [...(getStageOperationalMetadata(stageKey)?.artifactTypes ?? [])];
}

export function getStageRolesForStage(stageKey: StageKey) {
  return [...(getStageOperationalMetadata(stageKey)?.stageRoles ?? [])];
}

export function getStageApprovalMode(stageKey: StageKey): StageApprovalMode {
  return getStageOperationalMetadata(stageKey)?.approvalMode ?? "stage";
}

export function getStaleArtifactTypesForStage(stageKey: StageKey) {
  return [...(getStageOperationalMetadata(stageKey)?.staleArtifactTypes ?? [])];
}

export function getPrerequisiteStageKeys(workflowType: BookWorkflowType, stageKey: StageKey) {
  const stages = getWorkflowDefinition(workflowType).stages;
  const index = stages.findIndex((stage) => stage.key === stageKey);
  if (index <= 0) return [];
  return stages.slice(0, index).map((stage) => stage.key);
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
