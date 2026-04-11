export type StorySourceTier = "A" | "B" | "C";

export type StoryVerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "NEEDS_CORROBORATION";

export type ExternalStoryType =
  | "ORIGIN"
  | "TURNING_POINT"
  | "FAILURE"
  | "RECOVERY"
  | "DECISION_UNDER_PRESSURE"
  | "INNOVATION"
  | "CULTURE"
  | "CREDIBILITY"
  | "CONTRADICTION"
  | "MORAL"
  | "LEGACY"
  | "MICRO_STORY";

export type ExternalStoryFit =
  | "OPENING_HOOK"
  | "CHAPTER_PIVOT"
  | "PROOF_POINT"
  | "EMOTIONAL_RELEASE"
  | "CLOSING_RESONANCE"
  | "MARKETING_REUSE";

export type ChapterExternalStorySource = {
  id: string;
  url: string;
  canonicalUrl?: string | null;
  title: string;
  publisher?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  accessedAt?: string | null;
  contentType?: string | null;
  sourceTier: StorySourceTier;
  tierWeight: number;
  isVerified: boolean;
  verificationStatus: StoryVerificationStatus;
  verificationNotes?: string | null;
  snapshotPath?: string | null;
  extractedTextPath?: string | null;
  metadata?: Record<string, unknown>;
};

export type ChapterExternalStoryItem = {
  id: string;
  sourceId: string;
  title: string;
  summary: string;
  whyItMatters: string;
  emotionalRole: string;
  storyType: ExternalStoryType;
  storyFit: ExternalStoryFit;
  leadershipTheme?: string | null;
  sourceTier: StorySourceTier;
  tierWeight: number;
  verificationStatus: StoryVerificationStatus;
  mappedSectionId?: string | null;
  mappedChapterId?: string | null;
  metadata?: Record<string, unknown>;
};

export type ChapterExternalStoryVerification = {
  id: string;
  sourceRecordId?: string | null;
  externalStoryId?: string | null;
  verifierType: "FETCH_VALIDATOR" | "LLM_VERIFIER" | "HUMAN_REVIEW";
  status: StoryVerificationStatus;
  titleMatch?: boolean | null;
  contentMatch?: boolean | null;
  claimSupported?: boolean | null;
  secondSourceRequired: boolean;
  secondSourceConfirmed: boolean;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export type ChapterExternalStoryDossier = {
  chapterKey: string;
  chapterTitle: string;
  chapterDescription: string;
  storyGoal: string;
  storyCandidates: ChapterExternalStoryItem[];
  sourceRegister: ChapterExternalStorySource[];
  storyTypesCovered: ExternalStoryType[];
  storyFitsCovered: ExternalStoryFit[];
  verificationSummary: {
    totalSources: number;
    verifiedSources: number;
    totalStories: number;
    verifiedStories: number;
    rejectedStories: number;
    needsCorroborationStories: number;
  };
  metadata?: {
    provisional?: boolean;
    retryRecommended?: boolean;
    warning?: string | null;
  };
};
