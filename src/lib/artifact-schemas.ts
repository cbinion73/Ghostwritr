import { z } from "zod";

const StringArraySchema = z.array(z.string()).default([]);
const BaseStoryFormatSchema = z.enum([
  "PARABLE",
  "HERO_JOURNEY",
  "GUIDE_JOURNEY",
  "COMPOSITE_CHARACTER",
  "CASE_JOURNEY",
  "MOSAIC_VIGNETTES",
  "QUEST",
  "RISE_FALL_REDEMPTION",
  "LETTER_FRAME",
  "FIELD_MANUAL_NARRATIVE",
]);
const BaseStoryFormatPreferenceSchema = z.union([
  BaseStoryFormatSchema,
  z.literal("AUTO"),
]);

export const WriterPersonaBlendSchema = z.object({
  personaId: z.string(),
  personaName: z.string(),
  personaSlug: z.string(),
  percentInfluence: z.number(),
  traits: StringArraySchema,
  signaturePatterns: StringArraySchema,
});

export const BookSetupProfileSchema = z.object({
  writerPersonaId: z.string().nullable().optional(),
  writerPersonaGuidance: StringArraySchema.optional(),
  workingTitle: z.string(),
  subtitle: z.string().nullable().optional(),
  writerPersona: z.string(),
  writerPersonaBlend: z.array(WriterPersonaBlendSchema).optional(),
  baseStoryFormatPreference: BaseStoryFormatPreferenceSchema,
  voiceReferenceNotes: StringArraySchema,
  targetWordCount: z.number(),
  wordCountTolerance: z.number(),
  targetPageCount: z.number().nullable().optional(),
  trimSize: z.string(),
  outputFormats: z.array(z.enum(["PRINT", "EBOOK", "AUDIO"])).default([]),
  aiAuthorshipGuardEnabled: z.boolean(),
  provenanceTrackingEnabled: z.boolean(),
  marketingHandoffEnabled: z.boolean(),
  notesToSystem: StringArraySchema,
  voiceTone: z.string().optional(),
  chapterFormat: StringArraySchema.optional(),
  readerLevel: z.enum(["casual", "practitioner", "professional", "expert"]).optional(),
  researchLens: z.string().optional(),
  preferredBibleTranslation: z.string().nullable().optional(),
});

export const PromiseBriefSchema = z.object({
  workingTitle: z.string(),
  audiencePrimary: z.string(),
  audienceSecondary: StringArraySchema,
  category: z.string(),
  readerProblem: z.string(),
  readerDesire: z.string(),
  bigIdea: z.string(),
  coreTruth: z.string(),
  transformationBefore: z.string(),
  transformationAfter: z.string(),
  differentiation: z.string(),
  promiseStatement: z.string(),
  stakes: z.string(),
  tone: StringArraySchema,
  openQuestions: StringArraySchema,
});

const ReaderJourneyPhaseSchema = z.enum([
  "Current Reality",
  "Disruption",
  "Revelation",
  "Application",
  "Transformation",
]);

const OutlineParagraphSchema = z.object({
  id: z.string(),
  number: z.number(),
  mainIdea: z.string(),
  whatGetsConveyed: z.string(),
  whyItExists: z.string(),
  wordCountTarget: z.number(),
  structuralElement: z.string(),
});

const OutlineStructureBlockSchema = z.object({
  label: z.string(),
  paragraphRange: z.string(),
  purpose: z.string(),
  wordCountTarget: z.number(),
});

const OutlinePersonaResonanceSchema = z.object({
  audienceSegment: z.string(),
  whyThisResonates: z.string(),
  priority: z.enum(["primary", "secondary"]).optional(),
});

const OutlineVoiceBlendSchema = z.object({
  primary: z.string(),
  secondary: z.string().optional(),
  tertiary: z.string().optional(),
  reasoning: z.string(),
});

const OutlineChapterSchema = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  subtitle: z.string().optional(),
  bigIdea: z.string(),
  description: z.string(),
  whyThisChapterExists: z.string(),
  coreIdea: z.string(),
  whatGetsConveyed: StringArraySchema,
  storytellingTechnique: z.string(),
  personasThatResonate: z.array(OutlinePersonaResonanceSchema).default([]),
  voiceBlendEmphasis: OutlineVoiceBlendSchema,
  readerTransformationByEnd: z.string(),
  readerJourneyPhase: ReaderJourneyPhaseSchema,
  wordCountTarget: z.number(),
  calculationDisplay: z.string(),
  internalStructureLabel: z.string(),
  internalStructure: z.array(OutlineStructureBlockSchema).default([]),
  openingHook: z.string(),
  closingBridge: z.string(),
  paragraphs: z.array(OutlineParagraphSchema).default([]),
});

const OutlineSectionSchema = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  subtitle: z.string().optional(),
  bigIdea: z.string(),
  description: z.string(),
  whyThisSectionExists: z.string(),
  whatItCovers: z.string(),
  howItServesTheLargerStory: z.string(),
  readerJourneyPhases: z.array(ReaderJourneyPhaseSchema).default([]),
  wordCountTarget: z.number(),
  calculationDisplay: z.string(),
  chapters: z.array(OutlineChapterSchema).default([]),
});

export const BookOutlineSchema = z.object({
  workingTitle: z.string(),
  subtitle: z.string().optional(),
  overview: z.string(),
  structureRationale: z.string(),
  readerTransformation: z.string(),
  targetWordCount: z.number(),
  readerJourneyMapping: z
    .array(
      z.object({
        phase: ReaderJourneyPhaseSchema,
        sectionNumbers: z.array(z.number()).default([]),
        explanation: z.string(),
      }),
    )
    .default([]),
  wordCountVerification: z.object({
    bookTargetWordCount: z.number(),
    sectionWordCountTotal: z.number(),
    chapterWordCountTotal: z.number(),
    paragraphWordCountTotal: z.number(),
    verified: z.boolean(),
    notes: StringArraySchema,
  }),
  sections: z.array(OutlineSectionSchema).default([]),
  generationMeta: z
    .object({
      source: z.enum(["sonnet", "fallback", "unknown"]),
      model: z.string().optional(),
      reason: z.string().optional(),
      generatedAt: z.string().optional(),
    })
    .optional(),
});

const ParagraphPlanSchema = z.object({
  id: z.string(),
  number: z.number(),
  topicSentence: z.string(),
  mainIdea: z.string(),
  purpose: z.string(),
  contentType: z.string(),
  wordCountTarget: z.number(),
  hook: z.string().optional(),
  structuralElement: z.string().optional(),
});

const ChapterParagraphPlanSchema = z.object({
  chapterId: z.string(),
  chapterNumber: z.number(),
  chapterTitle: z.string(),
  chapterDescription: z.string(),
  chapterWordCountTarget: z.number(),
  calculationDisplay: z.string(),
  structureLabel: z.string().optional(),
  structureBlocks: z
    .array(
      z.object({
        label: z.string(),
        paragraphRange: z.string(),
        wordCountTarget: z.number(),
      }),
    )
    .default([]),
  paragraphs: z.array(ParagraphPlanSchema).default([]),
});

export const ParagraphOutlineSchema = z.object({
  workingTitle: z.string(),
  overview: z.string(),
  sections: z
    .array(
      z.object({
        sectionId: z.string(),
        sectionNumber: z.number(),
        sectionTitle: z.string(),
        sectionDescription: z.string(),
        chapters: z.array(ChapterParagraphPlanSchema).default([]),
      }),
    )
    .default([]),
});

const TensionReleaseMovementSchema = z.object({
  me: z.string(),
  we: z.string(),
  truth: z.string(),
  you: z.string(),
  weClosing: z.string(),
});

export const BaseStoryBundleSchema = z.object({
  workingTitle: z.string(),
  selectedFormat: BaseStoryFormatSchema,
  availableFormats: z
    .array(
      z.object({
        format: BaseStoryFormatSchema,
        label: z.string(),
        description: z.string(),
        bestFor: z.string(),
      }),
    )
    .default([]),
  storyPremise: z.string(),
  bookThread: z.string(),
  bookMovement: TensionReleaseMovementSchema,
  narrativeGuidance: z
    .object({
      premise: z.string(),
      throughLine: z.string(),
      movement: TensionReleaseMovementSchema,
      continuityRules: StringArraySchema,
      boundary: z.object({
        kind: z.literal("base_story_guidance"),
        personalStoryPolicy: z.string(),
      }),
    })
    .optional(),
  chapters: z
    .array(
      z.object({
        chapterKey: z.string(),
        chapterLabel: z.string(),
        chapterPurpose: z.string(),
        threadRole: z.string(),
        chapterStory: z.string(),
        movement: TensionReleaseMovementSchema,
        guidance: z
          .object({
            narrativeFunction: z.string(),
            continuityCue: z.string(),
            draftingInstruction: z.string(),
            movement: TensionReleaseMovementSchema,
            boundary: z.object({
              kind: z.literal("base_story_guidance"),
              personalStoryPolicy: z.string(),
            }),
          })
          .optional(),
      }),
    )
    .default([]),
});

export const ChapterDraftBundleSchema = z.object({
  chapterKey: z.string(),
  chapterTitle: z.string(),
  chapterDescription: z.string(),
  sectionTitle: z.string(),
  openingHook: z.string(),
  narrativeThread: z.string(),
  chapterText: z.string(),
  paragraphs: z
    .array(
      z.object({
        id: z.string(),
        topicSentence: z.string(),
        prose: z.string(),
        sourceNotes: StringArraySchema,
      }),
    )
    .default([]),
  sourceUsage: z.object({
    research: StringArraySchema,
    externalStories: StringArraySchema,
    personalStories: StringArraySchema,
    baseStory: StringArraySchema,
  }),
  quality: z
    .object({
      score: z.number().default(0),
      readiness: z.enum(["strong", "watch", "needs attention"]).default("needs attention"),
      needsRevision: z.boolean().default(true),
      revisionPasses: z.number().default(0),
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
    .default({
      score: 0,
      readiness: "needs attention",
      needsRevision: true,
      revisionPasses: 0,
      signals: [],
    }),
});

export const ChapterReviewBundleSchema = z.object({
  chapterKey: z.string(),
  overallAssessment: z.string(),
  strengths: StringArraySchema,
  concerns: StringArraySchema,
  revisionPriorities: StringArraySchema,
  aiAuthorshipFlags: StringArraySchema,
  verdict: z.enum(["ready_for_review", "needs_revision"]),
});

const RecordMetadataSchema = z.record(z.string(), z.unknown()).default({});

const ResearchSourceTierSchema = z.enum(["A", "B", "C"]);
const ResearchVerificationStatusSchema = z.enum([
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "NEEDS_CORROBORATION",
]);
const ResearchItemTypeSchema = z.enum([
  "FACT",
  "STATISTIC",
  "QUOTE",
  "EXAMPLE",
  "CASE_STUDY",
  "COUNTERPOINT",
  "DEFINITION",
]);

export const ChapterResearchDossierSchema = z.object({
  chapterKey: z.string(),
  chapterTitle: z.string(),
  chapterDescription: z.string(),
  researchGoal: z.string(),
  researchQuestions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        priority: z.enum(["primary", "secondary"]),
      }),
    )
    .default([]),
  factBank: z
    .array(
      z.object({
        id: z.string(),
        itemType: ResearchItemTypeSchema,
        claimText: z.string(),
        evidenceExcerpt: z.string().nullable().optional(),
        summary: z.string().nullable().optional(),
        sourceId: z.string(),
        sourceTier: ResearchSourceTierSchema,
        tierWeight: z.number(),
        verificationStatus: ResearchVerificationStatusSchema,
        relevanceScore: z.number().nullable().optional(),
        confidenceScore: z.number().nullable().optional(),
        mappedSectionId: z.string().nullable().optional(),
        mappedChapterId: z.string().nullable().optional(),
        mappedParagraphId: z.string().nullable().optional(),
        metadata: RecordMetadataSchema.optional(),
      }),
    )
    .default([]),
  statistics: z.array(z.unknown()).default([]),
  quotes: z.array(z.unknown()).default([]),
  examples: z.array(z.unknown()).default([]),
  counterpoints: z.array(z.unknown()).default([]),
  definitions: z.array(z.unknown()).default([]),
  gaps: StringArraySchema,
  sourceRegister: z
    .array(
      z.object({
        id: z.string(),
        url: z.string(),
        canonicalUrl: z.string().nullable().optional(),
        title: z.string(),
        publisher: z.string().nullable().optional(),
        author: z.string().nullable().optional(),
        publishedAt: z.string().nullable().optional(),
        accessedAt: z.string().nullable().optional(),
        contentType: z.string().nullable().optional(),
        sourceTier: ResearchSourceTierSchema,
        tierWeight: z.number(),
        isVerified: z.boolean(),
        verificationStatus: ResearchVerificationStatusSchema,
        verificationNotes: z.string().nullable().optional(),
        snapshotPath: z.string().nullable().optional(),
        extractedTextPath: z.string().nullable().optional(),
        metadata: RecordMetadataSchema.optional(),
      }),
    )
    .default([]),
  verificationSummary: z.object({
    totalSources: z.number(),
    verifiedSources: z.number(),
    totalItems: z.number(),
    verifiedItems: z.number(),
    rejectedItems: z.number(),
    needsCorroborationItems: z.number(),
  }),
  metadata: z
    .object({
      provisional: z.boolean().optional(),
      retryRecommended: z.boolean().optional(),
      warning: z.string().nullable().optional(),
      failureReason: z.string().nullable().optional(),
      timeout: z.boolean().optional(),
      evidenceContractSummary: z
        .object({
          totalRecords: z.number(),
          admissibleRecords: z.number(),
          needsCorroborationRecords: z.number(),
          excludedRecords: z.number(),
        })
        .optional(),
    })
    .optional(),
});

const StorySourceTierSchema = z.enum(["A", "B", "C"]);
const StoryVerificationStatusSchema = z.enum([
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "NEEDS_CORROBORATION",
]);
const ExternalStoryTypeSchema = z.enum([
  "ORIGIN",
  "TURNING_POINT",
  "FAILURE",
  "RECOVERY",
  "DECISION_UNDER_PRESSURE",
  "INNOVATION",
  "CULTURE",
  "CREDIBILITY",
  "CONTRADICTION",
  "MORAL",
  "LEGACY",
  "MICRO_STORY",
]);
const ExternalStoryFitSchema = z.enum([
  "OPENING_HOOK",
  "CHAPTER_PIVOT",
  "PROOF_POINT",
  "EMOTIONAL_RELEASE",
  "CLOSING_RESONANCE",
  "MARKETING_REUSE",
]);

export const ChapterExternalStoryDossierSchema = z.object({
  chapterKey: z.string(),
  chapterTitle: z.string(),
  chapterDescription: z.string(),
  storyGoal: z.string(),
  storyCandidates: z
    .array(
      z.object({
        id: z.string(),
        sourceId: z.string(),
        title: z.string(),
        summary: z.string(),
        whyItMatters: z.string(),
        emotionalRole: z.string(),
        storyType: ExternalStoryTypeSchema,
        storyFit: ExternalStoryFitSchema,
        leadershipTheme: z.string().nullable().optional(),
        sourceTier: StorySourceTierSchema,
        tierWeight: z.number(),
        verificationStatus: StoryVerificationStatusSchema,
        mappedSectionId: z.string().nullable().optional(),
        mappedChapterId: z.string().nullable().optional(),
        metadata: RecordMetadataSchema.optional(),
      }),
    )
    .default([]),
  sourceRegister: z
    .array(
      z.object({
        id: z.string(),
        url: z.string(),
        canonicalUrl: z.string().nullable().optional(),
        title: z.string(),
        publisher: z.string().nullable().optional(),
        author: z.string().nullable().optional(),
        publishedAt: z.string().nullable().optional(),
        accessedAt: z.string().nullable().optional(),
        contentType: z.string().nullable().optional(),
        sourceTier: StorySourceTierSchema,
        tierWeight: z.number(),
        isVerified: z.boolean(),
        verificationStatus: StoryVerificationStatusSchema,
        verificationNotes: z.string().nullable().optional(),
        snapshotPath: z.string().nullable().optional(),
        extractedTextPath: z.string().nullable().optional(),
        metadata: RecordMetadataSchema.optional(),
      }),
    )
    .default([]),
  storyTypesCovered: z.array(ExternalStoryTypeSchema).default([]),
  storyFitsCovered: z.array(ExternalStoryFitSchema).default([]),
  verificationSummary: z.object({
    totalSources: z.number(),
    verifiedSources: z.number(),
    totalStories: z.number(),
    verifiedStories: z.number(),
    rejectedStories: z.number(),
    needsCorroborationStories: z.number(),
  }),
  metadata: z
    .object({
      provisional: z.boolean().optional(),
      retryRecommended: z.boolean().optional(),
      warning: z.string().nullable().optional(),
      evidenceContractSummary: z
        .object({
          totalRecords: z.number(),
          admissibleRecords: z.number(),
          needsCorroborationRecords: z.number(),
          excludedRecords: z.number(),
        })
        .optional(),
    })
    .optional(),
});

export const StorySetupArtifactSchema = z.object({
  summary: z.string(),
  premise: z.string(),
  genre: z.string(),
  subgenre: z.string().nullable().optional(),
  targetAudience: z.string(),
  tone: z.string(),
  pointOfView: z.string(),
  tense: z.string(),
  targetLength: z.string(),
  comparableTitles: StringArraySchema,
  storyQuestion: z.string(),
  authorIntent: z.string(),
});

export const StoryCoreArtifactSchema = z.object({
  summary: z.string(),
  theme: z.string(),
  controllingIdea: z.string(),
  protagonist: z.string(),
  protagonistNeed: z.string(),
  antagonistForce: z.string(),
  centralConflict: z.string(),
  stakes: z.string(),
  transformationArc: z.string(),
  storyPromise: z.string(),
});

export const WorldCastArtifactSchema = z.object({
  summary: z.string(),
  setting: z.string(),
  worldRules: StringArraySchema,
  atmosphere: z.string(),
  institutions: StringArraySchema,
  characters: z
    .array(
      z.object({
        name: z.string(),
        role: z.string(),
        desire: z.string(),
        flaw: z.string(),
        pressure: z.string(),
        relationshipNotes: z.string(),
      }),
    )
    .default([]),
});

export const PlotBlueprintArtifactSchema = z.object({
  summary: z.string(),
  structureModel: z.string(),
  actSummaries: StringArraySchema,
  turningPoints: StringArraySchema,
  chapterBeats: z
    .array(
      z.object({
        chapterNumber: z.number(),
        title: z.string(),
        beat: z.string(),
        pointOfView: z.string(),
        purpose: z.string(),
        conflict: z.string(),
        turn: z.string(),
        hook: z.string(),
        targetWords: z.number(),
      }),
    )
    .default([]),
});

export const ScenePlanArtifactSchema = z.object({
  summary: z.string(),
  continuityRules: StringArraySchema,
  chapters: z
    .array(
      z.object({
        chapterNumber: z.number(),
        title: z.string(),
        pointOfView: z.string(),
        purpose: z.string(),
        summary: z.string(),
        targetWords: z.number(),
        scenes: z
          .array(
            z.object({
              sceneNumber: z.number(),
              title: z.string(),
              location: z.string(),
              pointOfView: z.string(),
              objective: z.string(),
              conflict: z.string(),
              outcome: z.string(),
              reveal: z.string(),
              bridge: z.string(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export const FictionDraftArtifactSchema = z.object({
  summary: z.string(),
  totalWords: z.number(),
  chapterCount: z.number(),
  chapters: z
    .array(
      z.object({
        chapterKey: z.string(),
        chapterNumber: z.number(),
        title: z.string(),
        pointOfView: z.string(),
      summary: z.string(),
      text: z.string(),
      wordCount: z.number(),
      quality: z
        .object({
          score: z.number().default(0),
          readiness: z.enum(["strong", "watch", "needs attention"]).default("needs attention"),
          needsRevision: z.boolean().default(true),
          revisionPasses: z.number().default(0),
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
        .default({
          score: 0,
          readiness: "needs attention",
          needsRevision: true,
          revisionPasses: 0,
          signals: [],
        }),
    }),
    )
    .default([]),
  fullText: z.string(),
});

export const OutlineTocArtifactSchema = z.object({
  workingTitle: z.string(),
  subtitle: z.string().optional(),
  generatedAt: z.string(),
  totalWordCount: z.number(),
  executiveOverview: z.string(),
  sections: z
    .array(
      z.object({
        id: z.string(),
        number: z.number(),
        title: z.string(),
        subtitle: z.string().optional(),
        description: z.string(),
        whyThisSectionExists: z.string(),
        whatItCovers: z.string(),
        howItServesTheStory: z.string(),
        wordCountTarget: z.number(),
        chapterWordCountTotal: z.number(),
        chapters: z
          .array(
            z.object({
              id: z.string(),
              number: z.number(),
              title: z.string(),
              subtitle: z.string().optional(),
              description: z.string(),
              whyThisChapterExists: z.string(),
              coreIdea: z.string(),
              whatGetsConveyed: StringArraySchema,
              wordCountTarget: z.number(),
              paragraphWordCountTotal: z.number(),
              paragraphs: z
                .array(
                  z.object({
                    id: z.string(),
                    number: z.number(),
                    wordCountTarget: z.number(),
                    mainIdea: z.string(),
                    purpose: z.string(),
                    contentType: z.string(),
                    hook: z.string(),
                    structuralElement: z.string().optional(),
                  }),
                )
                .default([]),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  verificationReport: z.object({
    ready: z.boolean(),
    structureSummary: z.object({
      sections: z.number(),
      chapters: z.number(),
      paragraphs: z.number(),
    }),
    wordCountChecks: StringArraySchema,
    structuralIntegrityChecks: StringArraySchema,
    dataCompletenessChecks: StringArraySchema,
    issues: StringArraySchema,
  }),
  wordCountSummary: z
    .array(
      z.object({
        sectionTitle: z.string(),
        sectionWordCount: z.number(),
        percentOfBook: z.number(),
        chapters: z
          .array(
            z.object({
              chapterTitle: z.string(),
              chapterWordCount: z.number(),
              percentOfSection: z.number(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  readerJourneyMapping: z
    .array(
      z.object({
        phase: z.string(),
        sectionNumbers: z.array(z.number()).default([]),
        explanation: z.string(),
        wordAllocation: z.number(),
      }),
    )
    .default([]),
});

export function parseArtifactWithSchema<T>(
  value: unknown,
  schema: z.ZodType<T>,
  fallback: T | null = null,
): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export function parseMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
