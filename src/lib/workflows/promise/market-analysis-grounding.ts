import type {
  AudienceResearchArtifact,
  CoreTruthsArtifact,
  PersonaDeepProfile,
  PersonaPack,
  PromiseBrief,
  TransformationArtifact,
} from "../../promise-types";
import type { TruthPersonaContext } from "./report-presentation";

export function buildMarketGroundingContext(
  promise: PromiseBrief,
  audienceResearch: AudienceResearchArtifact | undefined,
  deepProfiles: PersonaDeepProfile[] | undefined,
  simplePersonas: PersonaPack["personas"] | undefined,
  coreTruths: CoreTruthsArtifact | undefined,
  transformationArc: TransformationArtifact | undefined,
  personaContexts: TruthPersonaContext[],
) {
  const phase1Questions =
    audienceResearch?.phase1?.researchQuestions.slice(0, 5).map((entry) => ({
      question: entry.question,
      answer: entry.answer,
    })) ?? [];

  const identifiedUserTypes =
    audienceResearch?.phase1?.identifiedUserTypes.slice(0, 4).map((entry) => ({
      name: entry.name,
      description: entry.description,
      details: entry.details.slice(0, 3),
    })) ?? [];

  const deepPersonaSummaries =
    deepProfiles?.slice(0, 3).map((persona) => ({
      name: persona.name,
      role: persona.demographics.role,
      companyType: persona.demographics.companyType,
      biggestFrustration: persona.currentSituation.biggestFrustration,
      topPainPoints: persona.painPoints.slice(0, 2).map((point) => point.friction),
      topGoals: persona.goals.slice(0, 2).map((goal) => goal.goal),
      objections: persona.objections.slice(0, 2).map((item) => item.objection),
      voiceBlendFit: persona.voiceBlendFit.primary,
    })) ?? [];

  const simplePersonaSummaries =
    simplePersonas?.slice(0, 3).map((persona) => ({
      name: persona.name,
      context: persona.context,
      painPoints: persona.painPoints.slice(0, 2),
      desiredOutcomes: persona.desiredOutcomes.slice(0, 2),
      buyingMotivations: persona.buyingMotivations.slice(0, 2),
    })) ?? [];

  const phase3Comparison = audienceResearch?.phase3
    ? {
        commonThemes: audienceResearch.phase3.commonThemes.slice(0, 5),
        primaryPersona: audienceResearch.phase3.primaryPersona,
        differences: audienceResearch.phase3.differences.slice(0, 4),
      }
    : undefined;

  const truthSummary = coreTruths
    ? {
        falseBelief: coreTruths.coreInsight.falseBelief,
        coreTruth: coreTruths.coreInsight.coreTruth,
        whyNow: coreTruths.whyNow.whyUrgentNow,
        completeTruth: coreTruths.completeTruth,
        personaExperiences: coreTruths.personaExperiences.slice(0, 3).map((persona) => ({
          personaName: persona.personaName,
          theirVersionOfTruth: persona.theirVersionOfTruth,
          whatMakesItLand: persona.whatMakesItLand,
          voice: persona.voiceBlendResonates.voice,
        })),
      }
    : undefined;

  const transformationSummary = transformationArc?.arc
    ? {
        stage1Me: {
          personalDilemma: transformationArc.arc.stage1Me.personalDilemma,
          falseBelief: transformationArc.arc.stage1Me.falseBelief,
        },
        stage2We: {
          sharedProblem: transformationArc.arc.stage2We.sharedProblem,
          universalTension: transformationArc.arc.stage2We.universalTension,
        },
        stage3Truth: {
          coreTruth: transformationArc.arc.stage3Truth.coreTruth,
          paradox: transformationArc.arc.stage3Truth.paradox,
        },
        stage4You: {
          firstAction: transformationArc.arc.stage4You.firstAction,
          resistance: transformationArc.arc.stage4You.applicationResistance,
        },
        stage5FinalWe: {
          transformedSuccess: transformationArc.arc.stage5FinalWe.transformedSuccess,
          collectiveVision: transformationArc.arc.stage5FinalWe.collectiveVision,
        },
        completeTransformation: transformationArc.arc.completeTransformation,
      }
    : undefined;

  const previousPhases = [
    "Promise Statement",
    audienceResearch?.phase1 ? "Audience Research Phase 1" : null,
    audienceResearch?.phase2 ? "Audience Research Phase 2" : null,
    audienceResearch?.phase3 ? "Audience Research Phase 3" : null,
    coreTruths ? "Truth" : null,
    transformationArc ? "Transformation" : null,
  ].filter((value): value is string => Boolean(value));

  const audienceSignals = [
    ...phase1Questions.map((entry) => entry.answer),
    ...identifiedUserTypes.map((entry) => `${entry.name}: ${entry.description}`),
    ...(phase3Comparison?.commonThemes ?? []),
    ...personaContexts.map((persona) => `${persona.name}: ${persona.dilemma}`),
    truthSummary?.coreTruth ?? "",
    transformationSummary?.stage2We.sharedProblem ?? "",
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 10);

  return {
    previousPhases,
    audienceSignals,
    promptPayload: {
      promiseSummary: {
        workingTitle: promise.workingTitle,
        promiseStatement: promise.promiseStatement,
        audiencePrimary: promise.audiencePrimary,
        category: promise.category,
        readerProblem: promise.readerProblem,
        readerDesire: promise.readerDesire,
        bigIdea: promise.bigIdea,
        coreTruth: promise.coreTruth,
        differentiation: promise.differentiation,
        stakes: promise.stakes,
      },
      audienceResearch: {
        identifiedUserTypes,
        phase1Questions,
        phase2Personas:
          deepPersonaSummaries.length > 0
            ? deepPersonaSummaries
            : simplePersonaSummaries,
        phase3Analysis: phase3Comparison,
      },
      truthSummary,
      transformationSummary,
      selectedPersonas: personaContexts,
      instruction:
        "Use the previous phases as hard constraints. Market analysis must explain how the already-defined reader, truth, and transformation compete in the market, not invent a disconnected thesis.",
    },
  };
}
