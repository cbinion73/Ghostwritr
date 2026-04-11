export type ResearchSourceTier = "A" | "B" | "C";

export type ResearchVerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "NEEDS_CORROBORATION";

export type ResearchItemType =
  | "FACT"
  | "STATISTIC"
  | "QUOTE"
  | "EXAMPLE"
  | "CASE_STUDY"
  | "COUNTERPOINT"
  | "DEFINITION";

export type ChapterResearchQuestion = {
  id: string;
  question: string;
  priority: "primary" | "secondary";
};

export type ChapterResearchSource = {
  id: string;
  url: string;
  canonicalUrl?: string | null;
  title: string;
  publisher?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  accessedAt?: string | null;
  contentType?: string | null;
  sourceTier: ResearchSourceTier;
  tierWeight: number;
  isVerified: boolean;
  verificationStatus: ResearchVerificationStatus;
  verificationNotes?: string | null;
  snapshotPath?: string | null;
  extractedTextPath?: string | null;
  metadata?: Record<string, unknown>;
};

export type ChapterResearchItem = {
  id: string;
  itemType: ResearchItemType;
  claimText: string;
  evidenceExcerpt?: string | null;
  summary?: string | null;
  sourceId: string;
  sourceTier: ResearchSourceTier;
  tierWeight: number;
  verificationStatus: ResearchVerificationStatus;
  relevanceScore?: number | null;
  confidenceScore?: number | null;
  mappedSectionId?: string | null;
  mappedChapterId?: string | null;
  mappedParagraphId?: string | null;
  metadata?: Record<string, unknown>;
};

export type ChapterResearchVerification = {
  id: string;
  sourceRecordId?: string | null;
  researchItemId?: string | null;
  verifierType: "FETCH_VALIDATOR" | "LLM_VERIFIER" | "HUMAN_REVIEW";
  status: ResearchVerificationStatus;
  titleMatch?: boolean | null;
  contentMatch?: boolean | null;
  claimSupported?: boolean | null;
  tierConfirmed?: boolean | null;
  secondSourceRequired: boolean;
  secondSourceConfirmed: boolean;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export type ChapterResearchDossier = {
  chapterKey: string;
  chapterTitle: string;
  chapterDescription: string;
  researchGoal: string;
  researchQuestions: ChapterResearchQuestion[];
  factBank: ChapterResearchItem[];
  statistics: ChapterResearchItem[];
  quotes: ChapterResearchItem[];
  examples: ChapterResearchItem[];
  counterpoints: ChapterResearchItem[];
  definitions: ChapterResearchItem[];
  gaps: string[];
  sourceRegister: ChapterResearchSource[];
  verificationSummary: {
    totalSources: number;
    verifiedSources: number;
    totalItems: number;
    verifiedItems: number;
    rejectedItems: number;
    needsCorroborationItems: number;
  };
  metadata?: {
    provisional?: boolean;
    retryRecommended?: boolean;
    warning?: string | null;
    failureReason?: string | null;
    timeout?: boolean;
  };
};
