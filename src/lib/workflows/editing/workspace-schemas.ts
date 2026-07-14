import { z } from "zod";

export const ManuscriptAssemblySchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  assembledAt: z.string(),
  sourceDraftSignature: z.string().default(""),
  chapterCount: z.number(),
  totalWords: z.number(),
  editorialOverview: z.string(),
  outstandingConcerns: z.array(z.string()).default([]),
  chapters: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      sectionTitle: z.string(),
      wordCount: z.number(),
      reviewSummary: z.string().nullable(),
      chapterText: z.string(),
      approvedDraftVersionId: z.string().nullable().optional(),
      paragraphOutline: z
        .array(
          z.object({
            id: z.string(),
            topicSentence: z.string(),
            purpose: z.string(),
          }),
        )
        .optional(),
      quality: z
        .object({
          score: z.number(),
          readiness: z.enum(["strong", "watch", "needs attention"]),
          needsRevision: z.boolean(),
          revisionPasses: z.number(),
          signals: z
            .array(
              z.object({
                label: z.string(),
                state: z.enum(["pass", "warn", "fail"]),
                detail: z.string(),
              }),
            )
            .default([]),
        })
        .nullable()
        .optional(),
    }),
  ),
  fullText: z.string(),
  chapterKeys: z.array(z.string()).default([]),
});

export const PublishingPackageSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  preparedAt: z.string(),
  totalWords: z.number(),
  chapterCount: z.number(),
  trimSize: z.string(),
  targetPageCount: z.number().nullable().optional(),
  outputFormats: z.array(z.enum(["PRINT", "EBOOK", "AUDIO"])).default([]),
  exportFormats: z.array(z.enum(["docx", "html", "markdown", "json"])).default([]),
  frontMatter: z.array(z.string()).default([]),
  backMatter: z.array(z.string()).default([]),
  packageComponents: z.array(z.string()).default([]),
  exportProfiles: z
    .array(
      z.object({
        format: z.enum(["PRINT", "EBOOK", "AUDIO"]),
        status: z.enum(["ready", "not_requested"]),
        notes: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  draftQualitySummary: z
    .object({
      averageScore: z.number(),
      chaptersNeedingRevision: z.number(),
      strongChapters: z.number(),
      watchChapters: z.number(),
      attentionChapters: z.number(),
      totalRevisionPasses: z.number(),
      weakestChapterLabel: z.string().nullable(),
      headline: z.string(),
      blockers: z.array(z.string()).default([]),
    })
    .nullable()
    .optional(),
  typesettingPlan: z
    .object({
      trimProfile: z.string().default("Trim profile pending refresh."),
      chapterOpenerStyle: z.string(),
      runningHeads: z.string(),
      tocIncluded: z.boolean(),
      widowOrphanControl: z.boolean(),
      sectionStartsOnRecto: z.boolean().default(true),
      signaturePageMultiple: z.number().default(16),
      estimatedSignatureCount: z.number().default(0),
      estimatedBlankPages: z.number().default(0),
      estimatedFrontMatterPages: z.number().default(0),
      estimatedBodyPages: z.number().default(0),
      estimatedBackMatterPages: z.number().default(0),
      estimatedTotalPages: z.number().default(0),
      notes: z.array(z.string()).default([]),
    })
    .default({
      trimProfile: "Trim profile pending refresh.",
      chapterOpenerStyle: "Chapter opener plan pending refresh.",
      runningHeads: "Running head plan pending refresh.",
      tocIncluded: true,
      widowOrphanControl: true,
      sectionStartsOnRecto: true,
      signaturePageMultiple: 16,
      estimatedSignatureCount: 0,
      estimatedBlankPages: 0,
      estimatedFrontMatterPages: 0,
      estimatedBodyPages: 0,
      estimatedBackMatterPages: 0,
      estimatedTotalPages: 0,
      notes: ["Refresh the publishing package to generate the full typesetting plan."],
    }),
  preflightChecks: z
    .array(
      z.object({
        name: z.string(),
        status: z.enum(["pass", "warn", "fail"]),
        detail: z.string(),
      }),
    )
    .default([]),
  notes: z.array(z.string()).default([]),
  packageStatus: z.enum(["draft", "prepared_needs_editorial_revision", "ready_to_publish"]),
});

export const ProvenanceReportSchema = z.object({
  generatedAt: z.string(),
  workflowType: z.enum(["NONFICTION", "FICTION", "WORKBOOK"]),
  title: z.string(),
  artifactTrail: z.array(
    z.object({
      stage: z.string(),
      status: z.string(),
      source: z.string(),
    }),
  ).default([]),
  editorialActions: z.array(
    z.object({
      kind: z.string(),
      detail: z.string(),
    }),
  ).default([]),
  packageReadiness: z.object({
    packageStatus: z.enum(["draft", "prepared_needs_editorial_revision", "ready_to_publish"]),
    totalWords: z.number(),
    chapterCount: z.number(),
  }),
  notes: z.array(z.string()).default([]),
});

export const MarketingHandoffPackageSchema = z.object({
  generatedAt: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  audience: z.array(z.string()).default([]),
  positioning: z.array(z.string()).default([]),
  hooks: z.array(z.string()).default([]),
  synopsis: z.string(),
  exportReadiness: z.array(z.string()).default([]),
});

export const EditorialAssessmentSchema = z.object({
  assessedAt: z.string(),
  mode: z.enum([
    "structural-edit",
    "clarity-pass",
    "pacing-pass",
    "continuity-pass",
    "voice-consistency-pass",
    "line-edit",
  ]),
  chapterKey: z.string().nullable().optional(),
  assessmentSummary: z.string(),
  bookWideFindings: z
    .object({
      duplication: z.array(z.string()).default([]),
      continuity: z.array(z.string()).default([]),
      structure: z.array(z.string()).default([]),
      voice: z.array(z.string()).default([]),
      aiArtifacts: z.array(z.string()).default([]),
      terminology: z.array(z.string()).default([]),
      citations: z.array(z.string()).default([]),
      preservation: z.array(z.string()).default([]),
      chapterInstructions: z.array(z.string()).default([]),
    })
    .optional(),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  chapterNotes: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      observation: z.string(),
      priority: z.enum(["high", "medium", "low"]),
    }),
  ).default([]),
  nextActions: z.array(z.string()).default([]),
  sourceDraftSignature: z.string().default(""),
});

export const EditorialRevisionPlanSchema = z.object({
  generatedAt: z.string(),
  focus: z.enum(["whole-book", "chapter-specific"]),
  chapterKey: z.string().nullable().optional(),
  summary: z.string(),
  globalObjectives: z.array(z.string()).default([]),
  coherenceRisks: z.array(z.string()).default([]),
  passes: z.array(z.string()).default([]),
  chapterQueue: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      reason: z.string(),
      targetOutcome: z.string().default("Deliver a cleaner revision that resolves the highest-risk issue in this chapter."),
      preserveNotes: z.array(z.string()).default([]),
      recommendedMode: z.enum([
        "structural-edit",
        "clarity-pass",
        "pacing-pass",
        "continuity-pass",
        "voice-consistency-pass",
        "line-edit",
      ]),
    }),
  ),
});

export const EditorialRevisionPlanExecutionSchema = z.object({
  executedAt: z.string(),
  generatedCount: z.number().default(0),
  autoAppliedCount: z.number().default(0),
  executedChapterKeys: z.array(z.string()).default([]),
  modes: z
    .array(
      z.enum([
        "structural-edit",
        "clarity-pass",
        "pacing-pass",
        "continuity-pass",
        "voice-consistency-pass",
        "line-edit",
      ]),
    )
    .default([]),
});

export const SuggestedEditorialRevisionTargetSchema = z.object({
  mode: z.enum([
    "structural-edit",
    "clarity-pass",
    "pacing-pass",
    "continuity-pass",
    "voice-consistency-pass",
    "line-edit",
  ]),
  chapterKey: z.string().nullable().optional(),
  selectedChapterKeys: z.array(z.string()).default([]),
  brief: z.string(),
  preserveNotes: z.array(z.string()).default([]),
});

export const FinalHandoffStateSchema = z.object({
  finalizedAt: z.string(),
  archivedAt: z.string().nullable().optional(),
  packageVersionId: z.string().nullable().optional(),
  packagePreparedAt: z.string().nullable().optional(),
  notes: z.array(z.string()).default([]),
});

export const ManuscriptRevisionSchema = z.object({
  revisedAt: z.string(),
  mode: z.enum([
    "structural-edit",
    "clarity-pass",
    "pacing-pass",
    "continuity-pass",
    "voice-consistency-pass",
    "line-edit",
  ]),
  chapterKey: z.string().nullable().optional(),
  selectedChapterKeys: z.array(z.string()).default([]),
  revisionSummary: z.string(),
  rationale: z.string(),
  changedChapters: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      approvedDraftVersionId: z.string().nullable().optional(),
      originalText: z.string(),
      revisedText: z.string(),
      changeSummary: z.string(),
      assessmentInstructions: z.array(z.string()).default([]),
    }),
  ),
});
