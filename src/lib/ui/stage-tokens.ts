import type { StageKey, StageStatus } from "@prisma/client";

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

export type StageGroup = "setup" | "material" | "production" | "post-production" | "story-architecture";

export type StageToken = {
  key: StageKey;
  number: number;
  label: string;
  route: (slug: string) => string;
  group: StageGroup;
  description: string;
};

export const STAGE_TOKENS: readonly StageToken[] = [
  {
    key: "BOOK_SETUP",
    number: 1,
    label: "Book Setup",
    route: (slug) => `/books/${slug}/setup`,
    group: "setup",
    description: "Page count, promise, voice and persona blend",
  },
  {
    key: "PROMISE",
    number: 2,
    label: "Promise",
    route: (slug) => `/books/${slug}/promise`,
    group: "setup",
    description: "The reader-facing promise and transformation",
  },
  {
    key: "AUDIENCE",
    number: 3,
    label: "Audience",
    route: (slug) => `/books/${slug}/audience`,
    group: "setup",
    description: "Target reader: role, pain, and motivations",
  },
  {
    key: "MARKET_ANALYSIS",
    number: 4,
    label: "Market Viability",
    route: (slug) => `/books/${slug}/market-analysis`,
    group: "setup",
    description: "11-dimension scoring, hard gate at 3.5/5",
  },
  {
    key: "OUTLINE",
    number: 5,
    label: "Outline",
    route: (slug) => `/books/${slug}/outline`,
    group: "material",
    description: "Section + chapter structure, KB-grounded",
  },
  {
    key: "BASE_STORY",
    number: 6,
    label: "Base Story",
    route: (slug) => `/books/${slug}/base-story`,
    group: "material",
    description: "The narrative thread through the whole book",
  },
  {
    key: "RESEARCH",
    number: 7,
    label: "Research",
    route: (slug) => `/books/${slug}/research`,
    group: "material",
    description: "Verified facts, citations, and sources",
  },
  {
    key: "EXTERNAL_STORIES",
    number: 8,
    label: "External Stories",
    route: (slug) => `/books/${slug}/external-stories`,
    group: "material",
    description: "Real-world cases that illustrate each idea",
  },
  {
    key: "PERSONAL_STORIES",
    number: 9,
    label: "Personal Stories",
    route: (slug) => `/books/${slug}/personal-stories`,
    group: "material",
    description: "Your own experiences, captured through interview",
  },
  {
    key: "MANIFEST" as StageKey,
    number: 10,
    label: "Chapter Manifest",
    route: (slug) => `/books/${slug}/manifest`,
    group: "production" as StageGroup,
    description: "Assign source materials to chapters — cuts generation context by 85%",
  },
  {
    key: "CHAPTER_DRAFT",
    number: 11,
    label: "Chapter Draft",
    route: (slug) => `/books/${slug}/chapter-draft`,
    group: "production",
    description: "Framework-aware chapter drafting with voice critic",
  },
  {
    key: "WORKBOOK_DESIGN" as StageKey,
    number: 11.5,
    label: "Workbook Design",
    route: (slug) => `/books/${slug}/workbook-design`,
    group: "production",
    description: "Sage enriches chapters into a standalone learning companion",
  },
  {
    key: "EDITING",
    number: 12,
    label: "Editing & Typeset",
    route: (slug) => `/books/${slug}/editing`,
    group: "production",
    description: "Editorial pass and final manuscript output",
  },
  {
    key: "TYPESET" as StageKey,
    number: 13,
    label: "Typeset & Publish",
    route: (slug) => `/books/${slug}/typeset`,
    group: "production",
    description: "Platform specs, front matter, ISBN, and export package",
  },
  { key: "LAUNCH_LISTING" as StageKey, number: 14, label: "Launch Listing", route: (slug) => `/books/${slug}/launch-listing`, group: "post-production" as StageGroup, description: "Amazon/KDP retail copy, keywords, and categories" },
  { key: "PRESS_KIT" as StageKey, number: 15, label: "Press Kit", route: (slug) => `/books/${slug}/press-kit`, group: "post-production" as StageGroup, description: "Media kit, author bio, talking points, and interview Q&A" },
  { key: "SOCIAL_CAMPAIGN" as StageKey, number: 16, label: "Social Campaign", route: (slug) => `/books/${slug}/social-campaign`, group: "post-production" as StageGroup, description: "30-day launch content calendar across all platforms" },
  { key: "AUDIO_PREP" as StageKey, number: 17, label: "Audio Prep", route: (slug) => `/books/${slug}/audio-prep`, group: "post-production" as StageGroup, description: "ACX audiobook package: checklist, recording notes, pronunciation guide" },
  { key: "COURSE_DESIGN" as StageKey, number: 18, label: "Course Design", route: (slug) => `/books/${slug}/course-design`, group: "post-production" as StageGroup, description: "Online course structure, modules, exercises, and platform selection" },
  { key: "SPEAKING_KIT" as StageKey, number: 19, label: "Speaking Kit", route: (slug) => `/books/${slug}/speaking-kit`, group: "post-production" as StageGroup, description: "Keynote outline, speaker bio variants, one-sheet, and session descriptions" },
];

export const FICTION_STAGE_TOKENS: readonly StageToken[] = [
  { key: "BOOK_SETUP", number: 1, label: "Book Setup", route: (slug) => `/books/${slug}/setup`, group: "setup", description: "Voice, targets, guardrails, and publishing intent." },
  { key: "PROMISE", number: 2, label: "Promise", route: (slug) => `/books/${slug}/promise`, group: "setup", description: "The story premise and reader promise." },
  { key: "AUDIENCE", number: 3, label: "Audience", route: (slug) => `/books/${slug}/audience`, group: "setup", description: "Target reader: role, pain, and motivations." },
  { key: "MARKET_ANALYSIS", number: 4, label: "Market Viability", route: (slug) => `/books/${slug}/market-analysis`, group: "setup", description: "11-dimension scoring, hard gate at 3.5/5." },
  { key: "STORY_CORE", number: 5, label: "Story Core", route: (slug) => `/books/${slug}/story-core`, group: "story-architecture", description: "Theme, conflict, protagonist pressure, and story engine." },
  { key: "WORLD_CAST", number: 6, label: "World & Cast", route: (slug) => `/books/${slug}/world-cast`, group: "story-architecture", description: "Story world, rules, cast, and relational tension." },
  { key: "PLOT_BLUEPRINT", number: 7, label: "Plot Blueprint", route: (slug) => `/books/${slug}/plot-blueprint`, group: "story-architecture", description: "Acts, turning points, and chapter beats." },
  { key: "SCENE_PLAN", number: 8, label: "Scene Plan", route: (slug) => `/books/${slug}/scene-plan`, group: "story-architecture", description: "Chapter-level and scene-level progression." },
  { key: "FICTION_DRAFT", number: 9, label: "Draft", route: (slug) => `/books/${slug}/fiction-draft`, group: "production", description: "Draft chapter prose from the scene plan." },
  { key: "EDITING", number: 10, label: "Editing & Typeset", route: (slug) => `/books/${slug}/editing`, group: "production", description: "Editorial pass and final manuscript output." },
  { key: "TYPESET" as StageKey, number: 11, label: "Typeset & Publish", route: (slug) => `/books/${slug}/typeset`, group: "production", description: "Platform specs, front matter, ISBN, and export package" },
];

export const GROUP_COLORS: Record<StageGroup, { gutter: string; label: string }> = {
  setup: { gutter: "#64748B", label: "Setup" },
  material: { gutter: "#B8793A", label: "Material" },
  "story-architecture": { gutter: "#7C3AED", label: "Story Architecture" },
  production: { gutter: "#3730A3", label: "Production" },
  "post-production": { gutter: "#0F766E", label: "Post-Production" },
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
    color: "#94A3B8",
    label: "LOCKED",
    ariaLabel: "Not yet started",
  },
  IN_PROGRESS: {
    shape: "◑",
    color: "#F59E0B",
    label: "IN PROGRESS",
    ariaLabel: "Currently in progress",
  },
  READY_FOR_REVIEW: {
    shape: "●",
    color: "#2563EB",
    label: "REVIEW READY",
    ariaLabel: "Awaiting your review",
  },
  COMMITTED: {
    shape: "◆",
    color: "#15803D",
    label: "COMMITTED",
    ariaLabel: "Committed",
  },
  BLOCKED: {
    shape: "▲",
    color: "#C026D3",
    label: "BLOCKED — SEE DIAGNOSIS",
    ariaLabel: "Blocked, see diagnosis",
  },
};
