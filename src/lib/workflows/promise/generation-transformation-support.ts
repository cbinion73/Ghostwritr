import { z } from "zod";

import type {
  PromiseArtifactMetadata,
  PromiseBrief,
  TransformationArtifact,
} from "../../promise-types";
import type { TruthPersonaContext } from "./report-presentation";
import { normalizeTruthVoice } from "./report-persona-context";

const TransformationPersonaVoiceSchema = z.object({
  voice: z.enum(["Andy", "Drucker", "Jobs"]),
  why: z.string(),
});

const TransformationArcSchema = z.object({
  stage1Me: z.object({
    personalDilemma: z.string(),
    falseBelief: z.string(),
    manifestation: z.string(),
    cost: z.string(),
    authorityToTeach: z.string(),
    vulnerability: z.string(),
    voiceBlend: z.string(),
  }),
  stage2We: z.object({
    sharedProblem: z.string(),
    universalTension: z.string(),
    personaDilemmas: z.array(
      z.object({
        personaName: z.string(),
        recognizedDilemma: z.string(),
        whatMakesItSpecific: z.string(),
      }),
    ).length(3),
    readerQuestion: z.string(),
    emotionalBridgeStories: z.string(),
  }),
  stage3Truth: z.object({
    coreTruth: z.string(),
    reframe: z.string(),
    paradox: z.string(),
    proofMechanism: z.string(),
    personaAnswers: z.array(
      z.object({
        personaName: z.string(),
        dilemmaAnswer: z.string(),
        voiceBlendResonates: TransformationPersonaVoiceSchema,
      }),
    ).length(3),
    truthForm: z.string(),
    ifEmbraced: z.string(),
    ifIgnored: z.string(),
  }),
  stage4You: z.object({
    firstAction: z.string(),
    personaApplications: z.array(
      z.object({
        personaName: z.string(),
        nextStep: z.string(),
        obstacleOrRisk: z.string(),
      }),
    ).length(3),
    instructionStyle: z.string(),
    applicationResistance: z.string(),
    successVsFailure: z.string(),
  }),
  stage5FinalWe: z.object({
    transformedSuccess: z.string(),
    personaOutcomes: z.array(
      z.object({
        personaName: z.string(),
        breakthrough: z.string(),
        whatBecomesPossible: z.string(),
      }),
    ).length(3),
    collectiveVision: z.string(),
    identityShift: z.string(),
    irreversibility: z.string(),
  }),
  stage6Patterns: z.object({
    sharedThemes: z.array(z.string()).min(3),
    storyByStage: z.object({
      me: z.string(),
      we: z.string(),
      truth: z.string(),
      you: z.string(),
      finalWe: z.string(),
    }),
    voiceBlendMoments: z.object({
      andy: z.string(),
      drucker: z.string(),
      jobs: z.string(),
    }),
    implicitLessons: z.array(z.string()).min(3),
  }),
  stage7BookMap: z.object({
    openingStory: z.string(),
    sharedDilemmaReveal: z.string(),
    truthReveal: z.string(),
    applicationStart: z.string(),
    visionCasting: z.string(),
    implicitPersonaService: z.string(),
  }),
  completeTransformation: z.string(),
});

export const TransformationArtifactSchema = z.object({
  arc: TransformationArcSchema,
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function coerceString(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceString(item, ""))
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function defaultedArtifactMetadata(raw: unknown): PromiseArtifactMetadata {
  const record = asRecord(raw);
  return {
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
    model: typeof record.model === "string" ? record.model : null,
    grounding: null,
    tokenUsage: null,
  };
}

export function createFallbackTransformationArtifact(
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
): TransformationArtifact {
  const sharedProblem =
    promise.readerProblem ||
    "They are operating inside a problem they can feel but do not yet know how to name correctly.";
  const coreTruth =
    promise.coreTruth ||
    `${promise.audiencePrimary || "The reader"} needs a new operating model, not more pressure.`;
  const firstAction =
    promise.bigIdea ||
    "Pause long enough to diagnose the real pattern before choosing the next action.";

  return {
    arc: {
      stage1Me: {
        personalDilemma:
          "The author hit a point where effort, expertise, and responsibility were no longer enough to solve the recurring problem.",
        falseBelief:
          "If I worked harder and stayed closer to every decision, I could force a better outcome.",
        manifestation:
          "That belief showed up as overfunctioning, reactive decision-making, and carrying too much of the burden personally.",
        cost:
          "The cost was slower progress, repeated frustration, and a system that depended too heavily on the author's own effort.",
        authorityToTeach:
          "The author has lived through the operating problem firsthand and built practical language and frameworks from solving it in the real world.",
        vulnerability:
          "Trust comes from admitting that competence alone did not fix the problem, and that the old identity was part of the trap.",
        voiceBlend:
          "The voice blends clarity, strategic diagnosis, and practical encouragement so the dilemma feels honest rather than theatrical.",
      },
      stage2We: {
        sharedProblem,
        universalTension:
          "All three personas are trying to get better outcomes while still leaning on a false belief that keeps recreating the problem.",
        personaDilemmas: personaContexts.map((persona) => ({
          personaName: persona.name,
          recognizedDilemma: `${persona.name} recognizes the problem in the tension between ${persona.context.toLowerCase()} and ${persona.dilemma.toLowerCase()}`,
          whatMakesItSpecific:
            "Their version of the dilemma is shaped by the pressure, role expectations, and constraints built into their day-to-day work.",
        })),
        readerQuestion:
          "What if the thing I think proves I am responsible or capable is actually the thing keeping me stuck?",
        emotionalBridgeStories:
          "Use stories that make the reader feel the exhaustion, the internal pressure, and the moment they realize the current approach is not sustainable.",
      },
      stage3Truth: {
        coreTruth,
        reframe:
          "The problem is not a lack of effort or care. The problem is the model they are using to interpret what is happening.",
        paradox:
          "Progress often starts when the reader stops doubling down on the instinct that used to make them feel competent.",
        proofMechanism:
          "Introduce the truth through a lived story, a practical framework, and a recognizable real-world example.",
        personaAnswers: personaContexts.map((persona) => ({
          personaName: persona.name,
          dilemmaAnswer: `${persona.name} sees that the truth addresses ${persona.dilemma.toLowerCase()} by giving them a more useful lens for deciding what to do next.`,
          voiceBlendResonates: {
            voice: persona.voiceHint,
            why: `${persona.voiceHint} resonates because this persona needs the truth delivered with practical credibility and emotional precision.`,
          },
        })),
        truthForm: "A principle supported by framework and paradox",
        ifEmbraced:
          promise.readerDesire ||
          "Readers gain a calmer, more repeatable way to act, decide, and lead.",
        ifIgnored:
          "They keep solving the visible symptom while the deeper pattern quietly reproduces the same pain.",
      },
      stage4You: {
        firstAction,
        personaApplications: personaContexts.map((persona) => ({
          personaName: persona.name,
          nextStep: `${persona.name} runs a first experiment that applies the truth to a live challenge in their own context.`,
          obstacleOrRisk:
            "The main difficulty is that the new approach initially feels slower, less familiar, or riskier than falling back to the old reflex.",
        })),
        instructionStyle:
          "Practical, sequential, and concrete enough that readers know exactly what to try next.",
        applicationResistance:
          "Resistance shows up as impatience, identity friction, and the temptation to return to what used to feel productive.",
        successVsFailure:
          "Success comes from applying the truth consistently in real situations; failure comes from treating it as an interesting idea without changing behavior.",
      },
      stage5FinalWe: {
        transformedSuccess:
          "Success looks like a reader who now interprets the problem differently, acts with more clarity, and gets better results without the old drag.",
        personaOutcomes: personaContexts.map((persona) => ({
          personaName: persona.name,
          breakthrough: `${persona.name} experiences a breakthrough when the new approach works under real pressure, not just in theory.`,
          whatBecomesPossible:
            "They can create better outcomes with less friction, more confidence, and more durable trust in the process.",
        })),
        collectiveVision:
          "If enough people embrace the truth, teams and organizations become calmer, sharper, and more capable of making meaningful progress.",
        identityShift:
          "Readers stop seeing themselves as people who survive by force of effort alone and start seeing themselves as people who can diagnose and lead with intention.",
        irreversibility:
          "Once the reader sees the old pattern clearly and feels the difference of the new one working, it becomes difficult to go back to the old belief without noticing the cost.",
      },
      stage6Patterns: {
        sharedThemes: [
          "Old competence can become the barrier to new growth.",
          "Clear diagnosis matters more than frantic activity.",
          "Practical change requires both emotional permission and structured action.",
        ],
        storyByStage: {
          me: "A personal story where the old belief clearly fails.",
          we: "A set of recognizable scenes that make the reader feel seen.",
          truth: "A turning-point story or framework reveal that changes interpretation.",
          you: "A practical implementation story with friction and correction.",
          finalWe: "A success story that shows what becomes possible when the truth takes root.",
        },
        voiceBlendMoments: {
          andy: "Andy matters most when the reader needs emotional clarity and direct, human explanation.",
          drucker: "Drucker matters most when the book names the strategic pattern and operational discipline required.",
          jobs: "Jobs matters most when the reader needs to feel the bigger future made possible by embracing the truth.",
        },
        implicitLessons: [
          "The book teaches readers how to reinterpret the problem before acting.",
          "The book teaches that behavior changes only when identity and structure shift together.",
          "The book teaches that practical transformation must be felt, understood, and tested in real situations.",
        ],
      },
      stage7BookMap: {
        openingStory:
          "Open with a concrete personal dilemma that captures the false belief in action and its hidden cost.",
        sharedDilemmaReveal:
          "Early chapters widen the frame so readers realize the author's dilemma is also their own.",
        truthReveal:
          "Reveal the core truth after the shared pain is fully felt, so the reframe lands with force.",
        applicationStart:
          "Application begins immediately after the truth is established, using experiments, frameworks, and concrete next steps.",
        visionCasting:
          "Vision casting happens after readers have seen the truth work in practice and can imagine the broader future it enables.",
        implicitPersonaService:
          "Serve all personas by using varied stories, examples, and stakes without explicitly labeling them in the manuscript.",
      },
      completeTransformation:
        `${coreTruth} The book moves from a personal dilemma, to shared recognition, to a core reframe, to practical application, and finally to a larger vision of what becomes possible when readers live by the new truth.`,
    },
  };
}

export function normalizeTransformationArtifact(
  raw: unknown,
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
): TransformationArtifact {
  const fallback = createFallbackTransformationArtifact(promise, personaContexts);
  const record = asRecord(raw);
  const arc = asRecord(record.arc && typeof record.arc === "object" ? record.arc : record);

  const mapByPersona = <T,>(
    values: unknown,
    mapper: (entry: Record<string, unknown>, persona: TruthPersonaContext, index: number) => T,
    fallbackMapper: (persona: TruthPersonaContext, index: number) => T,
  ): T[] => {
    const entries = Array.isArray(values) ? values : [];
    return personaContexts.map((persona, index) => {
      const entry = asRecord(entries[index]);
      return Object.keys(entry).length > 0
        ? mapper(entry, persona, index)
        : fallbackMapper(persona, index);
    });
  };

  return TransformationArtifactSchema.parse({
    arc: {
      stage1Me: {
        personalDilemma: coerceString(
          asRecord(arc.stage1Me).personalDilemma,
          fallback.arc.stage1Me.personalDilemma,
        ),
        falseBelief: coerceString(
          asRecord(arc.stage1Me).falseBelief,
          fallback.arc.stage1Me.falseBelief,
        ),
        manifestation: coerceString(
          asRecord(arc.stage1Me).manifestation,
          fallback.arc.stage1Me.manifestation,
        ),
        cost: coerceString(asRecord(arc.stage1Me).cost, fallback.arc.stage1Me.cost),
        authorityToTeach: coerceString(
          asRecord(arc.stage1Me).authorityToTeach,
          fallback.arc.stage1Me.authorityToTeach,
        ),
        vulnerability: coerceString(
          asRecord(arc.stage1Me).vulnerability,
          fallback.arc.stage1Me.vulnerability,
        ),
        voiceBlend: coerceString(
          asRecord(arc.stage1Me).voiceBlend,
          fallback.arc.stage1Me.voiceBlend,
        ),
      },
      stage2We: {
        sharedProblem: coerceString(
          asRecord(arc.stage2We).sharedProblem,
          fallback.arc.stage2We.sharedProblem,
        ),
        universalTension: coerceString(
          asRecord(arc.stage2We).universalTension,
          fallback.arc.stage2We.universalTension,
        ),
        personaDilemmas: mapByPersona(
          asRecord(arc.stage2We).personaDilemmas,
          (entry, persona, index) => ({
            personaName: coerceString(entry.personaName, persona.name),
            recognizedDilemma: coerceString(
              entry.recognizedDilemma,
              fallback.arc.stage2We.personaDilemmas[index]?.recognizedDilemma ||
                fallback.arc.stage2We.sharedProblem,
            ),
            whatMakesItSpecific: coerceString(
              entry.whatMakesItSpecific,
              fallback.arc.stage2We.personaDilemmas[index]?.whatMakesItSpecific ||
                persona.context,
            ),
          }),
          (_persona, index) => fallback.arc.stage2We.personaDilemmas[index],
        ),
        readerQuestion: coerceString(
          asRecord(arc.stage2We).readerQuestion,
          fallback.arc.stage2We.readerQuestion,
        ),
        emotionalBridgeStories: coerceString(
          asRecord(arc.stage2We).emotionalBridgeStories,
          fallback.arc.stage2We.emotionalBridgeStories,
        ),
      },
      stage3Truth: {
        coreTruth: coerceString(
          asRecord(arc.stage3Truth).coreTruth,
          fallback.arc.stage3Truth.coreTruth,
        ),
        reframe: coerceString(
          asRecord(arc.stage3Truth).reframe,
          fallback.arc.stage3Truth.reframe,
        ),
        paradox: coerceString(
          asRecord(arc.stage3Truth).paradox,
          fallback.arc.stage3Truth.paradox,
        ),
        proofMechanism: coerceString(
          asRecord(arc.stage3Truth).proofMechanism,
          fallback.arc.stage3Truth.proofMechanism,
        ),
        personaAnswers: mapByPersona(
          asRecord(arc.stage3Truth).personaAnswers,
          (entry, persona, index) => ({
            personaName: coerceString(entry.personaName, persona.name),
            dilemmaAnswer: coerceString(
              entry.dilemmaAnswer,
              fallback.arc.stage3Truth.personaAnswers[index]?.dilemmaAnswer ||
                fallback.arc.stage3Truth.coreTruth,
            ),
            voiceBlendResonates: {
              voice: normalizeTruthVoice(asRecord(entry.voiceBlendResonates).voice ?? persona.voiceHint),
              why: coerceString(
                asRecord(entry.voiceBlendResonates).why,
                fallback.arc.stage3Truth.personaAnswers[index]?.voiceBlendResonates.why ||
                  `${persona.voiceHint} is the best fit for this persona.`,
              ),
            },
          }),
          (_persona, index) => fallback.arc.stage3Truth.personaAnswers[index],
        ),
        truthForm: coerceString(
          asRecord(arc.stage3Truth).truthForm,
          fallback.arc.stage3Truth.truthForm,
        ),
        ifEmbraced: coerceString(
          asRecord(arc.stage3Truth).ifEmbraced,
          fallback.arc.stage3Truth.ifEmbraced,
        ),
        ifIgnored: coerceString(
          asRecord(arc.stage3Truth).ifIgnored,
          fallback.arc.stage3Truth.ifIgnored,
        ),
      },
      stage4You: {
        firstAction: coerceString(
          asRecord(arc.stage4You).firstAction,
          fallback.arc.stage4You.firstAction,
        ),
        personaApplications: mapByPersona(
          asRecord(arc.stage4You).personaApplications,
          (entry, persona, index) => ({
            personaName: coerceString(entry.personaName, persona.name),
            nextStep: coerceString(
              entry.nextStep,
              fallback.arc.stage4You.personaApplications[index]?.nextStep ||
                fallback.arc.stage4You.firstAction,
            ),
            obstacleOrRisk: coerceString(
              entry.obstacleOrRisk,
              fallback.arc.stage4You.personaApplications[index]?.obstacleOrRisk ||
                fallback.arc.stage4You.applicationResistance,
            ),
          }),
          (_persona, index) => fallback.arc.stage4You.personaApplications[index],
        ),
        instructionStyle: coerceString(
          asRecord(arc.stage4You).instructionStyle,
          fallback.arc.stage4You.instructionStyle,
        ),
        applicationResistance: coerceString(
          asRecord(arc.stage4You).applicationResistance,
          fallback.arc.stage4You.applicationResistance,
        ),
        successVsFailure: coerceString(
          asRecord(arc.stage4You).successVsFailure,
          fallback.arc.stage4You.successVsFailure,
        ),
      },
      stage5FinalWe: {
        transformedSuccess: coerceString(
          asRecord(arc.stage5FinalWe).transformedSuccess,
          fallback.arc.stage5FinalWe.transformedSuccess,
        ),
        personaOutcomes: mapByPersona(
          asRecord(arc.stage5FinalWe).personaOutcomes,
          (entry, persona, index) => ({
            personaName: coerceString(entry.personaName, persona.name),
            breakthrough: coerceString(
              entry.breakthrough,
              fallback.arc.stage5FinalWe.personaOutcomes[index]?.breakthrough ||
                fallback.arc.stage5FinalWe.transformedSuccess,
            ),
            whatBecomesPossible: coerceString(
              entry.whatBecomesPossible,
              fallback.arc.stage5FinalWe.personaOutcomes[index]?.whatBecomesPossible ||
                fallback.arc.stage5FinalWe.collectiveVision,
            ),
          }),
          (_persona, index) => fallback.arc.stage5FinalWe.personaOutcomes[index],
        ),
        collectiveVision: coerceString(
          asRecord(arc.stage5FinalWe).collectiveVision,
          fallback.arc.stage5FinalWe.collectiveVision,
        ),
        identityShift: coerceString(
          asRecord(arc.stage5FinalWe).identityShift,
          fallback.arc.stage5FinalWe.identityShift,
        ),
        irreversibility: coerceString(
          asRecord(arc.stage5FinalWe).irreversibility,
          fallback.arc.stage5FinalWe.irreversibility,
        ),
      },
      stage6Patterns: {
        sharedThemes:
          coerceStringArray(asRecord(arc.stage6Patterns).sharedThemes).slice(0, 6).filter(Boolean)
            .length > 0
            ? coerceStringArray(asRecord(arc.stage6Patterns).sharedThemes).slice(0, 6).filter(Boolean)
            : fallback.arc.stage6Patterns.sharedThemes,
        storyByStage: {
          me: coerceString(
            asRecord(asRecord(arc.stage6Patterns).storyByStage).me,
            fallback.arc.stage6Patterns.storyByStage.me,
          ),
          we: coerceString(
            asRecord(asRecord(arc.stage6Patterns).storyByStage).we,
            fallback.arc.stage6Patterns.storyByStage.we,
          ),
          truth: coerceString(
            asRecord(asRecord(arc.stage6Patterns).storyByStage).truth,
            fallback.arc.stage6Patterns.storyByStage.truth,
          ),
          you: coerceString(
            asRecord(asRecord(arc.stage6Patterns).storyByStage).you,
            fallback.arc.stage6Patterns.storyByStage.you,
          ),
          finalWe: coerceString(
            asRecord(asRecord(arc.stage6Patterns).storyByStage).finalWe,
            fallback.arc.stage6Patterns.storyByStage.finalWe,
          ),
        },
        voiceBlendMoments: {
          andy: coerceString(
            asRecord(asRecord(arc.stage6Patterns).voiceBlendMoments).andy,
            fallback.arc.stage6Patterns.voiceBlendMoments.andy,
          ),
          drucker: coerceString(
            asRecord(asRecord(arc.stage6Patterns).voiceBlendMoments).drucker,
            fallback.arc.stage6Patterns.voiceBlendMoments.drucker,
          ),
          jobs: coerceString(
            asRecord(asRecord(arc.stage6Patterns).voiceBlendMoments).jobs,
            fallback.arc.stage6Patterns.voiceBlendMoments.jobs,
          ),
        },
        implicitLessons:
          coerceStringArray(asRecord(arc.stage6Patterns).implicitLessons).slice(0, 6).filter(Boolean)
            .length > 0
            ? coerceStringArray(asRecord(arc.stage6Patterns).implicitLessons).slice(0, 6).filter(Boolean)
            : fallback.arc.stage6Patterns.implicitLessons,
      },
      stage7BookMap: {
        openingStory: coerceString(
          asRecord(arc.stage7BookMap).openingStory,
          fallback.arc.stage7BookMap.openingStory,
        ),
        sharedDilemmaReveal: coerceString(
          asRecord(arc.stage7BookMap).sharedDilemmaReveal,
          fallback.arc.stage7BookMap.sharedDilemmaReveal,
        ),
        truthReveal: coerceString(
          asRecord(arc.stage7BookMap).truthReveal,
          fallback.arc.stage7BookMap.truthReveal,
        ),
        applicationStart: coerceString(
          asRecord(arc.stage7BookMap).applicationStart,
          fallback.arc.stage7BookMap.applicationStart,
        ),
        visionCasting: coerceString(
          asRecord(arc.stage7BookMap).visionCasting,
          fallback.arc.stage7BookMap.visionCasting,
        ),
        implicitPersonaService: coerceString(
          asRecord(arc.stage7BookMap).implicitPersonaService,
          fallback.arc.stage7BookMap.implicitPersonaService,
        ),
      },
      completeTransformation: coerceString(
        arc.completeTransformation,
        fallback.arc.completeTransformation,
      ),
    },
    metadata: defaultedArtifactMetadata(record.metadata),
  });
}
