import { z } from "zod";

import type { BookSetupProfile } from "../../book-setup-types";
import type {
  AudienceResearchArtifact,
  BookPromiseReport,
  CoreTruthsArtifact,
  MarketReport,
  PersonaPack,
  PositioningRecommendations,
  PromiseBrief,
  PromiseMessage,
  PromiseScorecard,
  TitleSubtitleFinalization,
  TransformationArtifact,
} from "../../promise-types";
import {
  asRecord,
  coerceString,
  coerceStringArray,
} from "./market-analysis-support";
import { normalizeTokenUsageMetadata } from "./market-analysis-normalization";
import { normalizeMarketDecision, BookPromiseReportSchema } from "./report-schema";
import {
  buildBookPitchAudienceProfiles,
  getSelectedTitleSubtitle,
  type TruthPersonaContext,
} from "./report-presentation";
import { fallbackBookPromiseReport } from "./report-fallback";
import {
  buildLegacyBookPitchMarkdown,
  containsNamedAudienceReference,
  replaceBookPitchPersonaNames,
} from "./report-composition-helpers";

const TitleSubtitleFinalizationSchema = z.object({
  finalizedTitle: z.string(),
  finalizedSubtitle: z.string(),
  positioningHook: z.string(),
  titleRationale: z.string(),
  subtitleRationale: z.string(),
  audienceFit: z.string(),
  marketFit: z.string(),
  alternatives: z.array(
    z.object({
      title: z.string(),
      subtitle: z.string(),
      whyItCouldWork: z.string(),
    }),
  ).default([]),
  metadata: z.object({
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    model: z.string().nullable(),
    grounding: z.object({
      previousPhases: z.array(z.string()).nullable(),
      kbSources: z.array(z.string()).nullable(),
      audienceSignals: z.array(z.string()).nullable(),
    }).nullable(),
    tokenUsage: z.object({
      inputTokens: z.number().nullable(),
      outputTokens: z.number().nullable(),
      totalTokens: z.number().nullable(),
      cacheReadInputTokens: z.number().nullable(),
      cacheWriteInputTokens: z.number().nullable(),
      reasoningTokens: z.number().nullable(),
    }).nullable(),
  }).nullable(),
});

function slugToTitle(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toTitlePhrase(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9\s:&/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return fallback;
  }

  const words = cleaned
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .map((word) =>
      word.length <= 3 && word === word.toLowerCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    );

  return words.length >= 2 ? words.join(" ") : fallback;
}

export function fallbackPromiseExtraction(
  bookSlug: string,
  messages: PromiseMessage[],
  assistantReply: string,
  bookSetupProfile?: BookSetupProfile | null,
): PromiseBrief {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ");

  return {
    workingTitle: bookSetupProfile?.workingTitle || slugToTitle(bookSlug),
    audiencePrimary: "professional leaders responsible for measurable outcomes",
    audienceSecondary: ["department heads", "operations leaders"],
    category: "professional nonfiction",
    readerProblem:
      "leaders are overwhelmed by complexity, competing priorities, and unclear improvement paths",
    readerDesire:
      "clearer thinking, better systems, and more confident leadership under pressure",
    bigIdea: "focused clarity turns complexity into practical progress",
    coreTruth: "performance improves when leaders simplify what matters and act on it consistently",
    transformationBefore: "stretched, reactive, and uncertain about what to fix first",
    transformationAfter: "clear, disciplined, and confident about what to do next",
    differentiation:
      "a practical system for translating complexity into measurable improvement in real organizations",
    promiseStatement:
      "This book gives leaders a practical system to simplify complexity, improve results, and lead with clarity people can follow.",
    stakes:
      "without clarity, teams waste effort, miss outcomes, and lose confidence in the work",
    tone:
      bookSetupProfile?.voiceReferenceNotes?.length
        ? ["clear", "grounded", "practical", ...bookSetupProfile.voiceReferenceNotes.slice(0, 2)]
        : ["clear", "grounded", "practical", "credible"],
    openQuestions: [
      "Should the audience be narrowed further to a more specific operational role?",
      "What single measurable outcome should the promise emphasize most clearly?",
      `Latest refinement signal: ${assistantReply.slice(0, 120)}`,
      `User language to preserve: ${userText.slice(0, 120)}`,
    ],
  };
}

export function fallbackScorecard(promise: PromiseBrief): PromiseScorecard {
  const audiencePrimary = promise.audiencePrimary || "";
  const promiseStatement = promise.promiseStatement || "";

  const mentionsLeadership = audiencePrimary.toLowerCase().includes("leader");
  const mentionsPractical = promiseStatement.toLowerCase().includes("practical");

  return {
    scores: {
      clarity: 8.6,
      audienceFit: mentionsLeadership ? 8.3 : 7.6,
      distinctiveness: 7.2,
      commercialPull: mentionsPractical ? 7.8 : 7.1,
      credibility: 8.0,
    },
    strengths: [
      "Clear emotional payoff around calm and clarity",
      "Strong relevance to current leadership pressure",
    ],
    concerns: [
      "The audience could still feel broad without tighter positioning",
      "The concept risks blending into general leadership advice unless the operating context stays specific",
    ],
    nextBestRevisions: [
      "Name the primary reader more explicitly",
      "Keep the promise tied to decision-making under uncertainty",
    ],
  };
}

export function fallbackPersonaPack(promise: PromiseBrief): PersonaPack {
  return {
    personas: [
      {
        id: "enterprise_innovation_leader",
        name: "Innovation Leader",
        priority: "primary",
        context: "Owns emerging technology exploration inside a large enterprise",
        painPoints: [
          "too many vendor pitches",
          "unclear criteria for decision-making",
          "pressure to move faster than the organization can absorb change",
        ],
        desiredOutcomes: [
          "clear prioritization",
          "better executive alignment",
          "confidence under uncertainty",
        ],
        buyingMotivations: [
          "practical frameworks",
          "language for explaining decisions to stakeholders",
        ],
        languageCues: ["clarity", "signal", "alignment", "decision-making"],
      },
      {
        id: "digital_transformation_exec",
        name: "Digital Transformation Executive",
        priority: "secondary",
        context: "Needs to translate technical noise into strategic direction",
        painPoints: ["initiative overload", "organizational swirl", "hype fatigue"],
        desiredOutcomes: ["focus", "cross-functional alignment"],
        buyingMotivations: ["credible frameworks", "team confidence"],
        languageCues: ["focus", "calm", "execution", "discipline"],
      },
    ],
  };
}

export function createFallbackTitleSubtitleFinalization(
  promise: PromiseBrief,
  marketReport: MarketReport,
  recommendations: PositioningRecommendations,
  personaContexts: TruthPersonaContext[],
  audienceResearch?: AudienceResearchArtifact,
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
  bookSetupProfile?: BookSetupProfile | null,
): TitleSubtitleFinalization {
  const audienceProfiles = buildBookPitchAudienceProfiles(
    audienceResearch,
    audienceResearch?.phase2?.personas,
    personaContexts,
    recommendations,
  );
  const primaryAudienceLabel =
    audienceProfiles[0]?.label || promise.audiencePrimary || "the primary reader";
  const coreMechanism =
    coreTruths?.coreInsight.coreTruth ||
    transformationArc?.arc.stage3Truth.coreTruth ||
    promise.coreTruth ||
    promise.bigIdea ||
    "a better operating model";
  const { title: selectedTitle } = getSelectedTitleSubtitle(
    promise,
    bookSetupProfile,
    undefined,
  );
  const derivedSubtitle =
    bookSetupProfile?.subtitle?.trim() ||
    `A Practical Framework for ${primaryAudienceLabel} to ${(
      promise.readerDesire ||
      transformationArc?.arc.stage4You.firstAction ||
      "create better outcomes"
    )
      .replace(/\.$/, "")
      .trim()}`;

  const alternativeCoreTruthTitle = toTitlePhrase(coreMechanism, selectedTitle);
  const alternativeOutcomeTitle = toTitlePhrase(
    promise.transformationAfter || promise.readerDesire || selectedTitle,
    selectedTitle,
  );

  return TitleSubtitleFinalizationSchema.parse({
    finalizedTitle: selectedTitle,
    finalizedSubtitle: derivedSubtitle,
    positioningHook:
      recommendations.positioningAndMarketing.marketPositioningStatement ||
      recommendations.bookStrategy.coreMessagePositioning,
    titleRationale:
      selectedTitle === (bookSetupProfile?.workingTitle || promise.workingTitle)
        ? `Keep "${selectedTitle}" because it already carries recognition inside the project and can still work commercially when paired with a sharper subtitle and positioning hook.`
        : `Use "${selectedTitle}" because it is shorter, clearer, and better aligned with the book's central reframe around ${coreMechanism.toLowerCase()}.`,
    subtitleRationale: `Use the subtitle to name the audience (${primaryAudienceLabel}), the promise (${promise.readerDesire || promise.transformationAfter}), and the practical mechanism (${coreMechanism}).`,
    audienceFit: `The package should signal relevance to ${primaryAudienceLabel} while still leaving room for adjacent audiences identified in the Audience work.`,
    marketFit: `This direction fits the market white space around ${marketReport.competitiveLandscape.marketPositioning.whiteSpace.toLowerCase()} and supports the positioning recommendation to ${recommendations.bookStrategy.differentiationStrategy.toLowerCase()}.`,
    alternatives: [
      {
        title: selectedTitle,
        subtitle: derivedSubtitle,
        whyItCouldWork: "Keeps continuity with the current concept while making the commercial promise clearer.",
      },
      {
        title: alternativeCoreTruthTitle,
        subtitle: `Why ${primaryAudienceLabel} Need ${coreMechanism.replace(/\.$/, "")}`,
        whyItCouldWork: "Leans more heavily into the core reframe and may feel stronger if the market responds to the paradox itself.",
      },
      {
        title: alternativeOutcomeTitle,
        subtitle: `How ${primaryAudienceLabel} Can ${(
          promise.readerDesire ||
          promise.transformationAfter ||
          "produce better outcomes"
        ).replace(/\.$/, "")}`,
        whyItCouldWork: "Leads with the result, which can improve clarity if outcome-driven positioning proves more compelling than concept-led positioning.",
      },
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: "fallback",
    },
  });
}

export function normalizeTitleSubtitleFinalization(
  raw: unknown,
  fallback: TitleSubtitleFinalization,
): TitleSubtitleFinalization {
  const record = asRecord(raw);
  const metadata = asRecord(record.metadata);
  const alternativesRaw = Array.isArray(record.alternatives) ? record.alternatives : [];

  return TitleSubtitleFinalizationSchema.parse({
    finalizedTitle: coerceString(record.finalizedTitle, fallback.finalizedTitle),
    finalizedSubtitle: coerceString(record.finalizedSubtitle, fallback.finalizedSubtitle),
    positioningHook: coerceString(record.positioningHook, fallback.positioningHook),
    titleRationale: coerceString(record.titleRationale, fallback.titleRationale),
    subtitleRationale: coerceString(record.subtitleRationale, fallback.subtitleRationale),
    audienceFit: coerceString(record.audienceFit, fallback.audienceFit),
    marketFit: coerceString(record.marketFit, fallback.marketFit),
    alternatives:
      alternativesRaw.length > 0
        ? alternativesRaw.map((item, index) => {
            const alternative = asRecord(item);
            return {
              title: coerceString(
                alternative.title,
                fallback.alternatives[index]?.title || fallback.finalizedTitle,
              ),
              subtitle: coerceString(
                alternative.subtitle,
                fallback.alternatives[index]?.subtitle || fallback.finalizedSubtitle,
              ),
              whyItCouldWork: coerceString(
                alternative.whyItCouldWork,
                fallback.alternatives[index]?.whyItCouldWork ||
                  "Provides a viable alternative positioning package.",
              ),
            };
          })
        : fallback.alternatives,
    metadata: {
      createdAt: coerceString(
        metadata.createdAt,
        fallback.metadata?.createdAt ?? new Date().toISOString(),
      ),
      updatedAt: coerceString(
        metadata.updatedAt,
        fallback.metadata?.updatedAt ?? new Date().toISOString(),
      ),
      model: coerceString(metadata.model, fallback.metadata?.model ?? "legacy"),
      grounding: {
        previousPhases:
          coerceStringArray(asRecord(metadata.grounding).previousPhases).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).previousPhases)
            : fallback.metadata?.grounding?.previousPhases ?? [],
        kbSources:
          coerceStringArray(asRecord(metadata.grounding).kbSources).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).kbSources)
            : fallback.metadata?.grounding?.kbSources ?? [],
        audienceSignals:
          coerceStringArray(asRecord(metadata.grounding).audienceSignals).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).audienceSignals)
            : fallback.metadata?.grounding?.audienceSignals ?? [],
      },
    },
  });
}

export function normalizeBookPromiseReportArtifact(
  raw: unknown,
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
  marketReport: MarketReport,
  recommendations: PositioningRecommendations,
  audienceResearch?: AudienceResearchArtifact,
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
  bookSetupProfile?: BookSetupProfile | null,
  titleSubtitleFinalization?: TitleSubtitleFinalization,
): BookPromiseReport {
  const fallback = fallbackBookPromiseReport(
    promise,
    personaContexts,
    marketReport,
    recommendations,
    audienceResearch,
    coreTruths,
    transformationArc,
    bookSetupProfile,
    titleSubtitleFinalization,
  );
  const record = asRecord(raw);
  const metadata = asRecord(record.metadata);
  const modelName = coerceString(metadata.model, "");
  const audienceProfiles = buildBookPitchAudienceProfiles(
    audienceResearch,
    audienceResearch?.phase2?.personas,
    personaContexts,
    recommendations,
  );
  const targetAudienceCandidate = coerceString(record.targetAudience, fallback.targetAudience);
  const targetAudience = containsNamedAudienceReference(
    targetAudienceCandidate,
    audienceResearch?.phase2?.personas,
  )
    ? fallback.targetAudience
    : targetAudienceCandidate;
  const documentMarkdown = replaceBookPitchPersonaNames(
    modelName.startsWith("fallback")
      ? fallback.documentMarkdown
      : coerceString(record.documentMarkdown, buildLegacyBookPitchMarkdown(record, fallback)),
    audienceResearch?.phase2?.personas,
    audienceProfiles,
  );

  return BookPromiseReportSchema.parse({
    title: coerceString(record.title, fallback.title),
    subtitle: coerceString(record.subtitle, fallback.subtitle),
    conceptStatement: coerceString(
      record.conceptStatement ?? record.promiseStatement,
      fallback.conceptStatement,
    ),
    corePromise: coerceString(
      record.corePromise ?? record.finalPromise ?? record.promiseStatement,
      fallback.corePromise,
    ),
    targetAudience,
    marketOpportunity: coerceString(
      record.marketOpportunity ?? record.marketPosition,
      fallback.marketOpportunity,
    ),
    authorCredibility: coerceString(record.authorCredibility, fallback.authorCredibility),
    executiveSummary: modelName.startsWith("fallback")
      ? fallback.executiveSummary
      : coerceString(
          record.executiveSummary ?? record.audienceInsights ?? record.transformationNarrative,
          fallback.executiveSummary,
        ),
    recommendation: normalizeMarketDecision(
      record.recommendation,
      fallback.recommendation,
    ),
    rationale: coerceString(record.rationale, fallback.rationale),
    nextSteps:
      coerceStringArray(record.nextSteps).length > 0
        ? coerceStringArray(record.nextSteps)
        : fallback.nextSteps,
    documentMarkdown,
    metadata: {
      createdAt: coerceString(
        metadata.createdAt ?? record.compiledAt,
        fallback.metadata?.createdAt ?? new Date().toISOString(),
      ),
      updatedAt: coerceString(
        metadata.updatedAt ?? record.compiledAt,
        fallback.metadata?.updatedAt ?? new Date().toISOString(),
      ),
      model: coerceString(metadata.model, fallback.metadata?.model ?? "legacy"),
      tokenUsage:
        normalizeTokenUsageMetadata(metadata.tokenUsage) ??
        fallback.metadata?.tokenUsage ??
        null,
      grounding: {
        previousPhases:
          coerceStringArray(asRecord(metadata.grounding).previousPhases).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).previousPhases)
            : fallback.metadata?.grounding?.previousPhases ?? [],
        kbSources:
          coerceStringArray(asRecord(metadata.grounding).kbSources).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).kbSources)
            : fallback.metadata?.grounding?.kbSources ?? [],
        audienceSignals:
          coerceStringArray(asRecord(metadata.grounding).audienceSignals).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).audienceSignals)
            : fallback.metadata?.grounding?.audienceSignals ?? [],
      },
    },
  });
}
