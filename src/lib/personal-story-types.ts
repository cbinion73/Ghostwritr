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
};

export type PersonalStoryEncyclopedia = {
  interviewFocus: string;
  nextQuestion: string;
  entries: PersonalStoryEntry[];
  noStoryTopics: string[];
  coverageGaps: string[];
  interviewerNotes: string[];
};
