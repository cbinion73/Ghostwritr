import { ArtifactStatus, ArtifactType, StageKey } from "@prisma/client";
import { z } from "zod";

import { BookSetupProfileSchema } from "./artifact-schemas";
import { db } from "./db";
import { getBookBySlugOrThrow } from "./repositories/books";

const StringArraySchema = z.array(z.string()).default([]);

const ComparableTitleSchema = z.object({
  title: z.string(),
  author: z.string(),
  whyRelevant: z.string(),
  differenceOpportunity: z.string(),
});

const ReaderPersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.enum(["primary", "secondary"]).default("secondary"),
  context: z.string(),
  painPoints: StringArraySchema,
  desiredOutcomes: StringArraySchema,
  buyingMotivations: StringArraySchema,
  languageCues: StringArraySchema,
});

export const Phase1StrategicBriefSchema = z.object({
  schemaVersion: z.literal(1),
  bookId: z.string(),
  bookSlug: z.string(),
  compiledAt: z.string(),
  sourceVersionIds: z.object({
    bookSetupProfile: z.string().nullable(),
    promiseBrief: z.string().nullable(),
    audienceResearch: z.string().nullable(),
    personaPack: z.string().nullable(),
    marketReport: z.string().nullable(),
    bookPromiseReport: z.string().nullable(),
  }),
  readiness: z.object({
    isComplete: z.boolean(),
    missing: StringArraySchema,
    warnings: StringArraySchema,
  }),
  book: z.object({
    workingTitle: z.string(),
    subtitle: z.string().nullable(),
    bookType: z.string(),
    category: z.string(),
    targetWordCount: z.number().nullable(),
    targetPageCount: z.number().nullable(),
    trimSize: z.string().nullable(),
    outputFormats: StringArraySchema,
    kdpChoices: z.object({
      trimSize: z.string().nullable(),
      outputFormats: StringArraySchema,
      aiAuthorshipGuardEnabled: z.boolean().nullable(),
      provenanceTrackingEnabled: z.boolean().nullable(),
      marketingHandoffEnabled: z.boolean().nullable(),
    }),
  }),
  promise: z.object({
    statement: z.string(),
    readerProblem: z.string(),
    readerDesire: z.string(),
    bigIdea: z.string(),
    coreTruth: z.string(),
    transformationBefore: z.string(),
    transformationAfter: z.string(),
    differentiation: z.string(),
    stakes: z.string(),
  }),
  audience: z.object({
    primary: z.string(),
    secondary: StringArraySchema,
    personas: z.array(ReaderPersonaSchema).default([]),
    researchQuestions: z
      .array(z.object({ question: z.string(), answer: z.string() }))
      .default([]),
    identifiedUserTypes: z
      .array(z.object({ name: z.string(), description: z.string(), details: StringArraySchema }))
      .default([]),
  }),
  market: z.object({
    category: z.string(),
    comparableTitles: z.array(ComparableTitleSchema),
    recommendation: z.enum(["GO", "NO_GO", "CONDITIONAL_GO"]).nullable(),
    strategicPriority: z.string(),
    risks: StringArraySchema,
    opportunities: StringArraySchema,
  }),
  voice: z.object({
    writerPersona: z.string(),
    writerPersonaBlend: z
      .array(
        z.object({
          personaName: z.string(),
          percentInfluence: z.number(),
          traits: StringArraySchema,
        }),
      )
      .default([]),
    voiceTone: z.string().nullable(),
    voiceReferenceNotes: StringArraySchema,
    readerLevel: z.string().nullable(),
    chapterFormat: StringArraySchema,
  }),
});

export type Phase1StrategicBrief = z.infer<typeof Phase1StrategicBriefSchema>;

type SourceArtifact = {
  type: ArtifactType;
  versionId: string;
  contentJson: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readArtifact<T>(artifacts: Map<ArtifactType, SourceArtifact>, type: ArtifactType): T | null {
  const artifact = artifacts.get(type);
  return artifact?.contentJson && typeof artifact.contentJson === "object"
    ? artifact.contentJson as T
    : null;
}

function sourceVersionId(artifacts: Map<ArtifactType, SourceArtifact>, type: ArtifactType) {
  return artifacts.get(type)?.versionId ?? null;
}

function normalizeComparableTitles(rawMarket: Record<string, unknown>) {
  const rawTitles = Array.isArray(rawMarket.comparisonTitles)
    ? rawMarket.comparisonTitles
    : [];

  return rawTitles.map((title, index) => {
    const record = asRecord(title);
    return {
      title: asString(record.title, `Comparable Title ${index + 1}`),
      author: asString(record.author, "Unknown author"),
      whyRelevant: asString(record.whyRelevant),
      differenceOpportunity: asString(record.differenceOpportunity),
    };
  });
}

function normalizePersonas(rawPersonaPack: Record<string, unknown>) {
  const rawPersonas = Array.isArray(rawPersonaPack.personas) ? rawPersonaPack.personas : [];
  return rawPersonas.map((persona, index) => {
    const record = asRecord(persona);
    return {
      id: asString(record.id, `persona-${index + 1}`),
      name: asString(record.name, `Reader Persona ${index + 1}`),
      priority: record.priority === "primary" ? "primary" as const : "secondary" as const,
      context: asString(record.context),
      painPoints: asStringArray(record.painPoints),
      desiredOutcomes: asStringArray(record.desiredOutcomes),
      buyingMotivations: asStringArray(record.buyingMotivations),
      languageCues: asStringArray(record.languageCues),
    };
  });
}

function normalizeAudienceResearch(rawAudience: Record<string, unknown>) {
  const phase1 = asRecord(rawAudience.phase1);
  const rawQuestions = Array.isArray(phase1.researchQuestions) ? phase1.researchQuestions : [];
  const rawUserTypes = Array.isArray(phase1.identifiedUserTypes) ? phase1.identifiedUserTypes : [];

  return {
    researchQuestions: rawQuestions.map((question) => {
      const record = asRecord(question);
      return {
        question: asString(record.question),
        answer: asString(record.answer),
      };
    }),
    identifiedUserTypes: rawUserTypes.map((userType, index) => {
      const record = asRecord(userType);
      return {
        name: asString(record.name, `Audience Segment ${index + 1}`),
        description: asString(record.description),
        details: asStringArray(record.details),
      };
    }),
  };
}

export function compilePhase1StrategicBrief(input: {
  book: {
    id: string;
    slug: string;
    titleWorking?: string | null;
    subtitle?: string | null;
    workflowType?: string | null;
  };
  artifacts: SourceArtifact[];
  compiledAt?: Date;
}) {
  const artifacts = new Map(input.artifacts.map((artifact) => [artifact.type, artifact]));
  const setupRaw = readArtifact<unknown>(artifacts, ArtifactType.BOOK_SETUP_PROFILE);
  const setup = setupRaw ? BookSetupProfileSchema.partial().parse(setupRaw) : null;
  const promise = asRecord(readArtifact(artifacts, ArtifactType.PROMISE_BRIEF));
  const audience = asRecord(readArtifact(artifacts, ArtifactType.AUDIENCE_RESEARCH));
  const personaPack = asRecord(readArtifact(artifacts, ArtifactType.PERSONA_PACK));
  const market = asRecord(readArtifact(artifacts, ArtifactType.MARKET_REPORT));
  const bookPromiseReport = asRecord(readArtifact(artifacts, ArtifactType.BOOK_PROMISE_REPORT));
  const marketExecutiveSummary = asRecord(market.executiveSummary);
  const comparisonTitles = normalizeComparableTitles(market);
  const audienceResearch = normalizeAudienceResearch(audience);

  const missing: string[] = [];
  const warnings: string[] = [];
  if (!setup) missing.push("book setup profile");
  if (!artifacts.has(ArtifactType.PROMISE_BRIEF)) missing.push("promise brief");
  if (!artifacts.has(ArtifactType.PERSONA_PACK) && !artifacts.has(ArtifactType.AUDIENCE_RESEARCH)) {
    missing.push("reader personas or audience research");
  }
  if (!artifacts.has(ArtifactType.MARKET_REPORT)) missing.push("market report");
  if (comparisonTitles.length !== 3) {
    warnings.push(`Phase 1 requires exactly 3 comparable titles; found ${comparisonTitles.length}.`);
  }
  if (!setup?.targetWordCount) warnings.push("Target word count is not locked.");
  if (!setup?.trimSize) warnings.push("KDP trim size is not locked.");
  if (!setup?.outputFormats?.length) warnings.push("Output formats are not locked.");

  return Phase1StrategicBriefSchema.parse({
    schemaVersion: 1,
    bookId: input.book.id,
    bookSlug: input.book.slug,
    compiledAt: (input.compiledAt ?? new Date()).toISOString(),
    sourceVersionIds: {
      bookSetupProfile: sourceVersionId(artifacts, ArtifactType.BOOK_SETUP_PROFILE),
      promiseBrief: sourceVersionId(artifacts, ArtifactType.PROMISE_BRIEF),
      audienceResearch: sourceVersionId(artifacts, ArtifactType.AUDIENCE_RESEARCH),
      personaPack: sourceVersionId(artifacts, ArtifactType.PERSONA_PACK),
      marketReport: sourceVersionId(artifacts, ArtifactType.MARKET_REPORT),
      bookPromiseReport: sourceVersionId(artifacts, ArtifactType.BOOK_PROMISE_REPORT),
    },
    readiness: {
      isComplete: missing.length === 0 && warnings.length === 0,
      missing,
      warnings,
    },
    book: {
      workingTitle: setup?.workingTitle || asString(promise.workingTitle, input.book.titleWorking ?? ""),
      subtitle: setup?.subtitle ?? input.book.subtitle ?? null,
      bookType: input.book.workflowType ?? "NONFICTION",
      category: asString(promise.category),
      targetWordCount: setup?.targetWordCount ?? null,
      targetPageCount: setup?.targetPageCount ?? null,
      trimSize: setup?.trimSize ?? null,
      outputFormats: setup?.outputFormats ?? [],
      kdpChoices: {
        trimSize: setup?.trimSize ?? null,
        outputFormats: setup?.outputFormats ?? [],
        aiAuthorshipGuardEnabled: setup?.aiAuthorshipGuardEnabled ?? null,
        provenanceTrackingEnabled: setup?.provenanceTrackingEnabled ?? null,
        marketingHandoffEnabled: setup?.marketingHandoffEnabled ?? null,
      },
    },
    promise: {
      statement: asString(bookPromiseReport.corePromise) || asString(promise.promiseStatement),
      readerProblem: asString(promise.readerProblem),
      readerDesire: asString(promise.readerDesire),
      bigIdea: asString(promise.bigIdea),
      coreTruth: asString(promise.coreTruth),
      transformationBefore: asString(promise.transformationBefore),
      transformationAfter: asString(promise.transformationAfter),
      differentiation: asString(promise.differentiation),
      stakes: asString(promise.stakes),
    },
    audience: {
      primary: asString(bookPromiseReport.targetAudience) || asString(promise.audiencePrimary),
      secondary: asStringArray(promise.audienceSecondary),
      personas: normalizePersonas(personaPack),
      researchQuestions: audienceResearch.researchQuestions,
      identifiedUserTypes: audienceResearch.identifiedUserTypes,
    },
    market: {
      category: asString(market.marketCategory) || asString(promise.category),
      comparableTitles: comparisonTitles,
      recommendation:
        marketExecutiveSummary.overallRecommendation === "GO" ||
        marketExecutiveSummary.overallRecommendation === "NO_GO" ||
        marketExecutiveSummary.overallRecommendation === "CONDITIONAL_GO"
          ? marketExecutiveSummary.overallRecommendation
          : null,
      strategicPriority: asString(marketExecutiveSummary.strategicPriority),
      risks: asStringArray(market.commercialRisks),
      opportunities: asStringArray(market.attractionDrivers),
    },
    voice: {
      writerPersona: setup?.writerPersona ?? "",
      writerPersonaBlend:
        setup?.writerPersonaBlend?.map((persona) => ({
          personaName: persona.personaName,
          percentInfluence: persona.percentInfluence,
          traits: persona.traits,
        })) ?? [],
      voiceTone: setup?.voiceTone ?? null,
      voiceReferenceNotes: setup?.voiceReferenceNotes ?? [],
      readerLevel: setup?.readerLevel ?? null,
      chapterFormat: setup?.chapterFormat ?? [],
    },
  });
}

export async function compilePhase1StrategicBriefForBook(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const artifacts = await db.artifact.findMany({
    where: {
      bookId: book.id,
      artifactType: {
        in: [
          ArtifactType.BOOK_SETUP_PROFILE,
          ArtifactType.PROMISE_BRIEF,
          ArtifactType.AUDIENCE_RESEARCH,
          ArtifactType.PERSONA_PACK,
          ArtifactType.MARKET_REPORT,
          ArtifactType.BOOK_PROMISE_REPORT,
        ],
      },
      committedVersionId: { not: null },
      status: ArtifactStatus.COMMITTED,
      OR: [
        { stage: { stageKey: StageKey.BOOK_SETUP } },
        { stage: { stageKey: StageKey.PROMISE } },
        { stage: { stageKey: StageKey.MARKET_ANALYSIS } },
      ],
    },
    include: {
      versions: {
        where: { lifecycleState: ArtifactStatus.COMMITTED },
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  return compilePhase1StrategicBrief({
    book,
    artifacts: artifacts.flatMap((artifact) => {
      const version = artifact.versions[0];
      return version
        ? [{
            type: artifact.artifactType,
            versionId: version.id,
            contentJson: version.contentJson,
          }]
        : [];
    }),
  });
}
