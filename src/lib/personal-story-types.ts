export type PersonalStoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PersonalStoryEntry = {
  id: string;
  title: string;
  summary: string;
  lesson: string;
  whyItMatters: string;
  storyType:
    | "origin"
    | "turning_point"
    | "failure"
    | "recovery"
    | "leadership"
    | "conflict"
    | "identity"
    | "moral"
    | "micro_story"
    | "observation";
  lifeArea: string;
  emotionalNotes: string[];
  chapterFitHints: string[];
  status: "candidate" | "strong" | "needs_detail" | "not_applicable";
  sourceQuote?: string | null;
  provenance?: PersonalStoryProvenance;
  permission?: PersonalStoryPermission;
  missingDetails?: string[];
  assignments?: PersonalStoryAssignment[];
  usageHistory?: PersonalStoryUsage[];
};

export type PersonalStoryProvenance = {
  rawNotes: string[];
  sourceMessageIds: string[];
  capturedAt?: string | null;
};

export type PersonalStoryPermission = {
  status: "granted" | "needs_review" | "restricted";
  notes?: string | null;
};

export type PersonalStoryAssignment = {
  chapterKey: string;
  chapterTitle?: string | null;
  relevance: string;
};

export type PersonalStoryUsage = {
  chapterKey: string;
  artifactVersionId?: string | null;
  usedAs: "draft" | "final_revision" | "marketing" | "unused";
  usedAt?: string | null;
};

export type PersonalStoryEncyclopedia = {
  interviewFocus: string;
  nextQuestion: string;
  entries: PersonalStoryEntry[];
  noStoryTopics: string[];
  coverageGaps: string[];
  interviewerNotes: string[];
};
