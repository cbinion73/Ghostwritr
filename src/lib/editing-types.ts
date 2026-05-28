export type EditingChapterSnapshot = {
  chapterKey: string;
  chapterLabel: string;
  sectionTitle: string;
  wordCount: number;
  reviewSummary: string | null;
  chapterText: string;
  quality?: {
    score: number;
    readiness: "strong" | "watch" | "needs attention";
    needsRevision: boolean;
    revisionPasses: number;
    signals: Array<{
      label: string;
      state: "pass" | "warn" | "fail";
      detail: string;
    }>;
  } | null;
};

export type DraftQualityRollup = {
  averageScore: number;
  chaptersNeedingRevision: number;
  strongChapters: number;
  watchChapters: number;
  attentionChapters: number;
  totalRevisionPasses: number;
  weakestChapterLabel: string | null;
  headline: string;
  blockers: string[];
};

export type EditingMessage = {
  role: "user" | "assistant";
  content: string;
  chapterKey?: string | null;
  createdAt: string;
};

export type EditorialMode =
  | "structural-edit"
  | "clarity-pass"
  | "pacing-pass"
  | "continuity-pass"
  | "voice-consistency-pass"
  | "line-edit";

export type EditorialAssessmentChapterNote = {
  chapterKey: string;
  chapterLabel: string;
  observation: string;
  priority: "high" | "medium" | "low";
};

export type EditorialAssessment = {
  assessedAt: string;
  mode: EditorialMode;
  chapterKey?: string | null;
  assessmentSummary: string;
  strengths: string[];
  risks: string[];
  chapterNotes: EditorialAssessmentChapterNote[];
  nextActions: string[];
};

export type EditorialPreferenceProfile = {
  updatedAt: string;
  styleNotes: string;
  preserveVoice: boolean;
  preferTighterProse: boolean;
  preferBolderCuts: boolean;
  acceptedRevisionCount: number;
  rejectedRevisionCount: number;
  acceptedModes: EditorialMode[];
  rejectedModes: EditorialMode[];
};

export type EditorialRevisionPlanItem = {
  chapterKey: string;
  chapterLabel: string;
  priority: "high" | "medium" | "low";
  reason: string;
  targetOutcome: string;
  preserveNotes: string[];
  recommendedMode: EditorialMode;
};

export type EditorialRevisionPlan = {
  generatedAt: string;
  focus: "whole-book" | "chapter-specific";
  chapterKey?: string | null;
  summary: string;
  globalObjectives: string[];
  coherenceRisks: string[];
  passes: string[];
  chapterQueue: EditorialRevisionPlanItem[];
};

export type EditorialRevisionPlanExecution = {
  executedAt: string;
  generatedCount: number;
  autoAppliedCount: number;
  executedChapterKeys: string[];
  modes: EditorialMode[];
};

export type SuggestedEditorialRevisionTarget = {
  mode: EditorialMode;
  chapterKey?: string | null;
  selectedChapterKeys?: string[];
  brief: string;
  preserveNotes: string[];
};

export type EditorialReadinessGate = {
  evaluatedAt: string;
  score: number;
  recommendation: "ready_for_commit" | "needs_revision" | "blocked";
  strengths: string[];
  risks: string[];
  nextActions: string[];
};

export type ManuscriptRevisionChange = {
  chapterKey: string;
  chapterLabel: string;
  originalText: string;
  revisedText: string;
  changeSummary: string;
};

export type ManuscriptRevision = {
  revisedAt: string;
  mode: EditorialMode;
  chapterKey?: string | null;
  selectedChapterKeys?: string[];
  revisionSummary: string;
  rationale: string;
  changedChapters: ManuscriptRevisionChange[];
};

export type ManuscriptAssembly = {
  title: string;
  subtitle?: string | null;
  assembledAt: string;
  sourceDraftSignature: string;
  chapterCount: number;
  totalWords: number;
  editorialOverview: string;
  outstandingConcerns: string[];
  chapters: EditingChapterSnapshot[];
  fullText: string;
  chapterKeys: string[];
};

export type PublishingPackage = {
  title: string;
  subtitle?: string | null;
  preparedAt: string;
  totalWords: number;
  chapterCount: number;
  trimSize: string;
  targetPageCount?: number | null;
  outputFormats: Array<"PRINT" | "EBOOK" | "AUDIO">;
  exportFormats: Array<"docx" | "html" | "markdown" | "json">;
  frontMatter: string[];
  backMatter: string[];
  packageComponents: string[];
  exportProfiles: Array<{
    format: "PRINT" | "EBOOK" | "AUDIO";
    status: "ready" | "not_requested";
    notes: string[];
  }>;
  draftQualitySummary?: {
    averageScore: number;
    chaptersNeedingRevision: number;
    strongChapters: number;
    watchChapters: number;
    attentionChapters: number;
    totalRevisionPasses: number;
    weakestChapterLabel: string | null;
    headline: string;
    blockers: string[];
  } | null;
  typesettingPlan: {
    trimProfile: string;
    chapterOpenerStyle: string;
    runningHeads: string;
    tocIncluded: boolean;
    widowOrphanControl: boolean;
    sectionStartsOnRecto: boolean;
    signaturePageMultiple: number;
    estimatedSignatureCount: number;
    estimatedBlankPages: number;
    estimatedFrontMatterPages: number;
    estimatedBodyPages: number;
    estimatedBackMatterPages: number;
    estimatedTotalPages: number;
    notes: string[];
  };
  preflightChecks: Array<{
    name: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }>;
  notes: string[];
  packageStatus: "draft" | "prepared_needs_editorial_revision" | "ready_to_publish";
};

export type PublishPackageSyncState = {
  status: "missing" | "stale" | "synced";
  detail: string;
  currentAssemblyVersionId: string | null;
  packageSourceAssemblyVersionId: string | null;
  lastRefreshedAt: string | null;
};

export type ProvenanceReport = {
  generatedAt: string;
  workflowType: "NONFICTION" | "FICTION" | "WORKBOOK";
  title: string;
  artifactTrail: Array<{
    stage: string;
    status: string;
    source: string;
  }>;
  editorialActions: Array<{
    kind: string;
    detail: string;
  }>;
  packageReadiness: {
    packageStatus: "draft" | "prepared_needs_editorial_revision" | "ready_to_publish";
    totalWords: number;
    chapterCount: number;
  };
  notes: string[];
};

export type MarketingHandoffPackage = {
  generatedAt: string;
  title: string;
  subtitle?: string | null;
  audience: string[];
  positioning: string[];
  hooks: string[];
  synopsis: string;
  exportReadiness: string[];
};
