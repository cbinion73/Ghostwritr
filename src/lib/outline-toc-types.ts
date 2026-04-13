export type OutlinePhaseApprovalState = "pending" | "approved";

export type OutlinePhaseApproval = {
  status: OutlinePhaseApprovalState;
  approvedAt?: string;
};

export type OutlineChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type OutlinePhaseChats = {
  sectionsChapters: OutlineChatMessage[];
  chapterBreakdowns: OutlineChatMessage[];
  fullToc: OutlineChatMessage[];
};

export type OutlinePhaseApprovals = {
  sectionsChapters: OutlinePhaseApproval;
  chapterBreakdowns: OutlinePhaseApproval;
  fullToc: OutlinePhaseApproval;
};

export type OutlineTocParagraph = {
  id: string;
  number: number;
  wordCountTarget: number;
  mainIdea: string;
  purpose: string;
  contentType: string;
  hook: string;
  structuralElement?: string;
};

export type OutlineTocChapter = {
  id: string;
  number: number;
  title: string;
  subtitle?: string;
  description: string;
  whyThisChapterExists: string;
  coreIdea: string;
  whatGetsConveyed: string[];
  wordCountTarget: number;
  paragraphWordCountTotal: number;
  paragraphs: OutlineTocParagraph[];
};

export type OutlineTocSection = {
  id: string;
  number: number;
  title: string;
  subtitle?: string;
  description: string;
  whyThisSectionExists: string;
  whatItCovers: string;
  howItServesTheStory: string;
  wordCountTarget: number;
  chapterWordCountTotal: number;
  chapters: OutlineTocChapter[];
};

export type OutlineTocVerificationReport = {
  ready: boolean;
  structureSummary: {
    sections: number;
    chapters: number;
    paragraphs: number;
  };
  wordCountChecks: string[];
  structuralIntegrityChecks: string[];
  dataCompletenessChecks: string[];
  issues: string[];
};

export type OutlineTocArtifact = {
  workingTitle: string;
  subtitle?: string;
  generatedAt: string;
  totalWordCount: number;
  executiveOverview: string;
  sections: OutlineTocSection[];
  verificationReport: OutlineTocVerificationReport;
  wordCountSummary: Array<{
    sectionTitle: string;
    sectionWordCount: number;
    percentOfBook: number;
    chapters: Array<{
      chapterTitle: string;
      chapterWordCount: number;
      percentOfSection: number;
    }>;
  }>;
  readerJourneyMapping: Array<{
    phase: string;
    sectionNumbers: number[];
    explanation: string;
    wordAllocation: number;
  }>;
};
