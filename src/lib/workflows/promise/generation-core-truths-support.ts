import { z } from "zod";

import type {
  AudienceResearchArtifact,
  CoreTruthsArtifact,
  PersonaDeepProfile,
  PersonaPack,
  PromiseArtifactMetadata,
  PromiseBrief,
} from "../../promise-types";
import type { TruthPersonaContext } from "./report-presentation";
import { normalizeTruthVoice } from "./report-persona-context";

export const CoreTruthsArtifactSchema = z.object({
  coreInsight: z.object({
    falseBelief: z.string(),
    coreTruth: z.string(),
  }),
  paradox: z.object({
    whatMakesThisSurprising: z.string(),
    whyItFeelsBackwards: z.string(),
  }),
  stakes: z.object({
    ifEmbraced: z.string(),
    ifIgnored: z.string(),
  }),
  evidence: z.object({
    methods: z.array(
      z.enum([
        "Story/Narrative",
        "Framework/System/Model",
        "Research/Data/Studies",
        "Analogy/Metaphor",
        "Real example/Case study",
      ]),
    ),
    specificEvidence: z.string(),
  }),
  personaExperiences: z.array(
    z.object({
      personaName: z.string(),
      theirVersionOfTruth: z.string(),
      whatMakesItLand: z.string(),
      voiceBlendResonates: z.object({
        voice: z.enum(["Andy", "Drucker", "Jobs"]),
        why: z.string(),
      }),
    }),
  ).length(3),
  whyNow: z.object({
    whyUrgentNow: z.string(),
    escalatedProblem: z.string(),
  }),
  bridge: z.object({
    permissionNeeded: z.string(),
    transitionReframe: z.string(),
    whatStaysSame: z.string(),
  }),
  completeTruth: z.string(),
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
  legacyTruths: z.array(
    z.object({
      truth: z.string(),
      foundationalInsight: z.string(),
      bookRelevance: z.string(),
    }),
  ).optional(),
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

export function buildTruthGroundingContext(
  promise: PromiseBrief,
  audienceResearch: AudienceResearchArtifact | undefined,
  deepProfiles: PersonaDeepProfile[] | undefined,
  simplePersonas: PersonaPack["personas"] | undefined,
  personaContexts: TruthPersonaContext[],
) {
  const phase1Questions =
    audienceResearch?.phase1?.researchQuestions.slice(0, 4).map((entry) => ({
      question: entry.question,
      answer: entry.answer,
    })) ?? [];

  const identifiedUserTypes =
    audienceResearch?.phase1?.identifiedUserTypes.slice(0, 4).map((entry) => ({
      name: entry.name,
      description: entry.description,
      details: entry.details.slice(0, 2),
    })) ?? [];

  const deepPersonaSummaries =
    deepProfiles?.slice(0, 3).map((persona) => ({
      name: persona.name,
      role: persona.demographics.role,
      companyType: persona.demographics.companyType,
      biggestFrustration: persona.currentSituation.biggestFrustration,
      topPainPoints: persona.painPoints.slice(0, 2).map((point) => point.friction),
      topGoals: persona.goals.slice(0, 2).map((goal) => goal.goal),
      buyingObjections: persona.objections.slice(0, 2).map((item) => item.objection),
    })) ?? [];

  const simplePersonaSummaries =
    simplePersonas?.slice(0, 3).map((persona) => ({
      name: persona.name,
      context: persona.context,
      painPoints: persona.painPoints.slice(0, 2),
      desiredOutcomes: persona.desiredOutcomes.slice(0, 2),
    })) ?? [];

  const comparisonSummary = audienceResearch?.phase3
    ? {
        commonThemes: audienceResearch.phase3.commonThemes.slice(0, 5),
        primaryPersona: audienceResearch.phase3.primaryPersona,
        differences: audienceResearch.phase3.differences.slice(0, 3),
      }
    : undefined;

  const previousPhases = [
    "Promise Statement",
    audienceResearch?.phase1 ? "Audience Research Phase 1" : null,
    audienceResearch?.phase2 ? "Audience Research Phase 2" : null,
    audienceResearch?.phase3 ? "Audience Research Phase 3" : null,
  ].filter((value): value is string => Boolean(value));

  const audienceSignals = [
    ...phase1Questions.map((entry) => entry.answer),
    ...identifiedUserTypes.map((entry) => `${entry.name}: ${entry.description}`),
    ...(comparisonSummary?.commonThemes ?? []),
    ...personaContexts.map((persona) => `${persona.name}: ${persona.dilemma}`),
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 8);

  return {
    previousPhases,
    audienceSignals,
    promptPayload: {
      promiseSummary: {
        promiseStatement: promise.promiseStatement,
        readerProblem: promise.readerProblem,
        readerDesire: promise.readerDesire,
        bigIdea: promise.bigIdea,
        coreTruth: promise.coreTruth,
        stakes: promise.stakes,
      },
      audienceResearch: {
        identifiedUserTypes,
        phase1Questions,
        phase2Personas:
          deepPersonaSummaries.length > 0
            ? deepPersonaSummaries
            : simplePersonaSummaries,
        phase3Analysis: comparisonSummary,
      },
      selectedPersonas: personaContexts,
      instruction:
        "Use the prior-phase research as binding context. The TRUTH must clearly emerge from the promise, persona pain patterns, audience questions, and common themes already generated.",
    },
  };
}

export function createFallbackCoreTruthArtifact(
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
): CoreTruthsArtifact {
  const coreTruth =
    promise.coreTruth ||
    `${promise.audiencePrimary || "The reader"} needs a better operating model, not more generic advice.`;

  return {
    coreInsight: {
      falseBelief:
        promise.readerProblem ||
        "Working harder inside the current mental model will eventually fix the problem.",
      coreTruth,
    },
    paradox: {
      whatMakesThisSurprising:
        "The answer is not usually more effort, pressure, or urgency. It is a better way to see what is actually happening.",
      whyItFeelsBackwards:
        "Most readers assume progress comes from pushing harder, when the deeper issue is often misdiagnosis.",
    },
    stakes: {
      ifEmbraced:
        promise.readerDesire ||
        "Readers gain clarity, better decisions, and a practical path to durable improvement.",
      ifIgnored:
        "They keep repeating the same pattern, misreading the root problem, and burning time on fixes that never hold.",
    },
    evidence: {
      methods: ["Framework/System/Model", "Real example/Case study"],
      specificEvidence:
        "Use a practical framework, a recognizable story, and real operating examples that show why the old mental model keeps failing.",
    },
    personaExperiences: personaContexts.map((persona) => ({
      personaName: persona.name,
      theirVersionOfTruth: `${persona.name} needs this truth because ${persona.dilemma.toLowerCase()}`,
      whatMakesItLand: `${persona.context}. The truth lands because it explains the real pattern beneath the pressure they already feel.`,
      voiceBlendResonates: {
        voice: persona.voiceHint,
        why: `${persona.voiceHint} fits because this persona needs the truth delivered with clear strategic judgment and practical credibility.`,
      },
    })),
    whyNow: {
      whyUrgentNow:
        "The old way is failing faster because complexity, speed, and constant noise now punish misdiagnosis immediately.",
      escalatedProblem:
        "Readers are under more pressure to produce clarity and outcomes in less time, with less margin for trial-and-error.",
    },
    bridge: {
      permissionNeeded:
        "They need permission to stop treating the old belief as a badge of discipline or competence.",
      transitionReframe:
        "The shift is not abandoning what made them successful. It is upgrading how they interpret the problem so their effort finally compounds.",
      whatStaysSame:
        "Discipline, ambition, and responsibility still matter; the truth changes the lens, not the reader's commitment.",
    },
    completeTruth:
      `${coreTruth} The book teaches readers to replace an outdated explanation of the problem with a sharper one, so they can act with more clarity, better proof, and more durable results.`,
  };
}

export function normalizeCoreTruthsArtifact(
  raw: unknown,
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
): CoreTruthsArtifact {
  const fallback = createFallbackCoreTruthArtifact(promise, personaContexts);
  const record = asRecord(raw);

  const personaExperiencesRaw = Array.isArray(record.personaExperiences)
    ? record.personaExperiences
    : [];

  if (record.coreInsight && record.paradox && record.stakes) {
    const normalized: CoreTruthsArtifact = {
      coreInsight: {
        falseBelief: coerceString(asRecord(record.coreInsight).falseBelief, fallback.coreInsight.falseBelief),
        coreTruth: coerceString(asRecord(record.coreInsight).coreTruth, fallback.coreInsight.coreTruth),
      },
      paradox: {
        whatMakesThisSurprising: coerceString(
          asRecord(record.paradox).whatMakesThisSurprising,
          fallback.paradox.whatMakesThisSurprising,
        ),
        whyItFeelsBackwards: coerceString(
          asRecord(record.paradox).whyItFeelsBackwards,
          fallback.paradox.whyItFeelsBackwards,
        ),
      },
      stakes: {
        ifEmbraced: coerceString(asRecord(record.stakes).ifEmbraced, fallback.stakes.ifEmbraced),
        ifIgnored: coerceString(asRecord(record.stakes).ifIgnored, fallback.stakes.ifIgnored),
      },
      evidence: {
        methods: coerceStringArray(asRecord(record.evidence).methods).filter((method): method is CoreTruthsArtifact["evidence"]["methods"][number] =>
          [
            "Story/Narrative",
            "Framework/System/Model",
            "Research/Data/Studies",
            "Analogy/Metaphor",
            "Real example/Case study",
          ].includes(method),
        ),
        specificEvidence: coerceString(
          asRecord(record.evidence).specificEvidence,
          fallback.evidence.specificEvidence,
        ),
      },
      personaExperiences: personaContexts.map((persona, index) => {
        const entry = asRecord(personaExperiencesRaw[index]);
        const voiceRecord = asRecord(entry.voiceBlendResonates);
        return {
          personaName: coerceString(entry.personaName, persona.name),
          theirVersionOfTruth: coerceString(
            entry.theirVersionOfTruth,
            fallback.personaExperiences[index]?.theirVersionOfTruth || fallback.completeTruth,
          ),
          whatMakesItLand: coerceString(
            entry.whatMakesItLand,
            fallback.personaExperiences[index]?.whatMakesItLand || fallback.completeTruth,
          ),
          voiceBlendResonates: {
            voice: normalizeTruthVoice(voiceRecord.voice ?? persona.voiceHint),
            why: coerceString(
              voiceRecord.why,
              fallback.personaExperiences[index]?.voiceBlendResonates.why ||
                `${persona.voiceHint} is the best fit for this persona.`,
            ),
          },
        };
      }),
      whyNow: {
        whyUrgentNow: coerceString(asRecord(record.whyNow).whyUrgentNow, fallback.whyNow.whyUrgentNow),
        escalatedProblem: coerceString(
          asRecord(record.whyNow).escalatedProblem,
          fallback.whyNow.escalatedProblem,
        ),
      },
      bridge: {
        permissionNeeded: coerceString(
          asRecord(record.bridge).permissionNeeded,
          fallback.bridge.permissionNeeded,
        ),
        transitionReframe: coerceString(
          asRecord(record.bridge).transitionReframe,
          fallback.bridge.transitionReframe,
        ),
        whatStaysSame: coerceString(
          asRecord(record.bridge).whatStaysSame,
          fallback.bridge.whatStaysSame,
        ),
      },
      completeTruth: coerceString(record.completeTruth, fallback.completeTruth),
      metadata: defaultedArtifactMetadata(record.metadata),
    };

    return CoreTruthsArtifactSchema.parse({
      ...normalized,
      evidence: {
        ...normalized.evidence,
        methods:
          normalized.evidence.methods.length > 0
            ? normalized.evidence.methods
            : fallback.evidence.methods,
      },
    });
  }

  const legacyTruthsRaw = Array.isArray(record.truths) ? record.truths : [];
  if (legacyTruthsRaw.length > 0) {
    const legacyTruths = legacyTruthsRaw.map((truth) => {
      const truthRecord = asRecord(truth);
      return {
        truth: coerceString(truthRecord.truth, fallback.coreInsight.coreTruth),
        foundationalInsight: coerceString(
          truthRecord.foundationalInsight,
          fallback.paradox.whatMakesThisSurprising,
        ),
        bookRelevance: coerceString(truthRecord.bookRelevance, fallback.stakes.ifEmbraced),
      };
    });

    return {
      ...fallback,
      coreInsight: {
        falseBelief: fallback.coreInsight.falseBelief,
        coreTruth: legacyTruths[0].truth,
      },
      paradox: {
        whatMakesThisSurprising: legacyTruths[0].foundationalInsight,
        whyItFeelsBackwards: fallback.paradox.whyItFeelsBackwards,
      },
      stakes: {
        ifEmbraced: legacyTruths[0].bookRelevance,
        ifIgnored: fallback.stakes.ifIgnored,
      },
      legacyTruths,
      metadata: asRecord(record.metadata),
    };
  }

  return fallback;
}
