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
      key: StageKey.AUDIENCE,
      label: "Audience",
      href: (slug) => `/books/${slug}/audience`,
      description: "Target reader: role, pain, and motivations.",
    },
    {
      key: StageKey.MARKET_ANALYSIS,
      label: "Market Viability",
      href: (slug) => `/books/${slug}/market-analysis`,
      description: "11-dimension scoring, hard gate at 3.5/5.",
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
      key: StageKey.MANIFEST,
      label: "Chapter Manifest",
      href: (slug) => `/books/${slug}/manifest`,
      description: "Assign source materials per chapter for targeted generation.",
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
    {
      key: StageKey.TYPESET,
      label: "Typeset",
      href: (slug) => `/books/${slug}/typeset`,
      description: "KDP and B&N Press formatting, ISBN, front matter, and cover brief.",
    },
    {
      key: StageKey.LAUNCH_LISTING,
      label: "Launch Listing",
      href: (slug) => `/books/${slug}/launch-listing`,
      description: "Amazon/KDP retail copy, keywords, and category strategy.",
    },
    {
      key: StageKey.PRESS_KIT,
      label: "Press Kit",
      href: (slug) => `/books/${slug}/press-kit`,
      description: "Media kit, author bio, talking points, and interview Q&A.",
    },
    {
      key: StageKey.SOCIAL_CAMPAIGN,
      label: "Social Campaign",
      href: (slug) => `/books/${slug}/social-campaign`,
      description: "30-day launch content calendar across all platforms.",
    },
    {
      key: StageKey.AUDIO_PREP,
      label: "Audio Prep",
      href: (slug) => `/books/${slug}/audio-prep`,
      description: "ACX audiobook package: checklist, recording notes, pronunciation guide.",
    },
    {
      key: StageKey.COURSE_DESIGN,
      label: "Course Design",
      href: (slug) => `/books/${slug}/course-design`,
      description: "Online course structure, modules, exercises, and platform selection.",
    },
    {
      key: StageKey.SPEAKING_KIT,
      label: "Speaking Kit",
      href: (slug) => `/books/${slug}/speaking-kit`,
      description: "Keynote outline, speaker bio variants, one-sheet, and session descriptions.",
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
      key: StageKey.PROMISE,
      label: "Promise",
      href: (slug) => `/books/${slug}/promise`,
      description: "The story premise and reader promise.",
    },
    {
      key: StageKey.AUDIENCE,
      label: "Audience",
      href: (slug) => `/books/${slug}/audience`,
      description: "Target reader: role, pain, and motivations.",
    },
    {
      key: StageKey.MARKET_ANALYSIS,
      label: "Market Viability",
      href: (slug) => `/books/${slug}/market-analysis`,
      description: "11-dimension scoring, hard gate at 3.5/5.",
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
      href: (slug) => `/books/${slug}/fiction-draft`,
      description: "Draft chapter prose from the scene plan and story bible.",
    },
    {
      key: StageKey.EDITING,
      label: "Editing",
      href: (slug) => `/books/${slug}/editing`,
      description: "Review, revise, assemble, and export the manuscript.",
    },
    {
      key: StageKey.TYPESET,
      label: "Typeset",
      href: (slug) => `/books/${slug}/typeset`,
      description: "KDP and B&N Press formatting, ISBN, front matter, and cover brief.",
    },
    {
      key: StageKey.LAUNCH_LISTING,
      label: "Launch Listing",
      href: (slug) => `/books/${slug}/launch-listing`,
      description: "Amazon/KDP retail copy, keywords, and category strategy.",
    },
    {
      key: StageKey.PRESS_KIT,
      label: "Press Kit",
      href: (slug) => `/books/${slug}/press-kit`,
      description: "Media kit, author bio, talking points, and interview Q&A.",
    },
    {
      key: StageKey.SOCIAL_CAMPAIGN,
      label: "Social Campaign",
      href: (slug) => `/books/${slug}/social-campaign`,
      description: "30-day launch content calendar across all platforms.",
    },
    {
      key: StageKey.AUDIO_PREP,
      label: "Audio Prep",
      href: (slug) => `/books/${slug}/audio-prep`,
      description: "ACX audiobook package: checklist, recording notes, pronunciation guide.",
    },
    {
      key: StageKey.COURSE_DESIGN,
      label: "Course Design",
      href: (slug) => `/books/${slug}/course-design`,
      description: "Online course structure, modules, exercises, and platform selection.",
    },
    {
      key: StageKey.SPEAKING_KIT,
      label: "Speaking Kit",
      href: (slug) => `/books/${slug}/speaking-kit`,
      description: "Keynote outline, speaker bio variants, one-sheet, and session descriptions.",
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
