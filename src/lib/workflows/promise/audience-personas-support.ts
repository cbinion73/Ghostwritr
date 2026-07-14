import { z } from "zod";

import type {
  AudienceResearchPhase1,
  PersonaComparisonAnalysis,
  PersonaDeepProfile,
} from "../../promise-types";

export const AudienceResearchPhase1Schema = z.object({
  researchQuestions: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    }),
  ),
  identifiedUserTypes: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      details: z.array(z.string()),
    }),
  ),
});

export const PersonaDeepProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.enum(["primary", "secondary"]).optional(),
  demographics: z.object({
    role: z.string(),
    companyType: z.string(),
    yearsInRole: z.number(),
    careerPath: z.string(),
    dayInTheLife: z.string(),
    reportsTo: z.string(),
    teamSize: z.number(),
  }),
  currentSituation: z.object({
    whatTheyDo: z.string(),
    whatWorks: z.array(z.string()),
    whatDoesntWork: z.array(z.string()),
    timeAllocation: z.string(),
    biggestFrustration: z.string(),
  }),
  goals: z.array(
    z.object({
      goal: z.string(),
      type: z.enum(["outcome", "feeling"]),
    }),
  ),
  painPoints: z.array(
    z.object({
      friction: z.string(),
      realCost: z.string(),
    }),
  ),
  objections: z.array(
    z.object({
      objection: z.string(),
      proofNeeded: z.string(),
    }),
  ),
  successMetrics: z.array(
    z.object({
      metric: z.string(),
      feeling: z.string().optional(),
    }),
  ),
  learningStyle: z.object({
    prefers: z.array(z.string()),
    hates: z.array(z.string()),
    bestFormat: z.string(),
  }),
  voiceBlendFit: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    tertiary: z.string().optional(),
    reasoning: z.string(),
  }),
});

export const PersonaPackDeepProfileSchema = z.object({
  personas: z.array(PersonaDeepProfileSchema),
});

export const PersonaComparisonAnalysisSchema = z.object({
  commonThemes: z.array(z.string()),
  differences: z.array(
    z.object({
      persona: z.string(),
      difference: z.string(),
    }),
  ),
  primaryPersona: z.object({
    name: z.string(),
    reasoning: z.string(),
  }),
  comparisonMatrix: z.array(
    z.object({
      dimension: z.string(),
      personas: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
        }),
      ),
    }),
  ),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function coerceString(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function coerceNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceString(item))
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function normalizeAudienceResearchQuestion(value: unknown): { question: string; answer: string } {
  const raw = asRecord(value);

  return {
    question: coerceString(raw.question, "Who specifically needs this book?"),
    answer: coerceString(raw.answer, "This book serves readers whose current situation maps to the core promise."),
  };
}

function normalizeAudienceResearchUserType(
  value: unknown,
  index: number,
): AudienceResearchPhase1["identifiedUserTypes"][number] {
  const raw = asRecord(value);
  const fallbackName = `Audience Segment ${index + 1}`;

  return {
    name: coerceString(raw.name, fallbackName),
    description: coerceString(
      raw.description,
      "A reader segment whose role and pain align with the promise of the book.",
    ),
    details: coerceStringArray(raw.details ?? raw.bullets ?? raw.situation ?? raw.painPoints).slice(0, 5),
  };
}

export function normalizeAudienceResearchPhase1(value: unknown): AudienceResearchPhase1 {
  const raw = asRecord(value);
  const normalized = {
    researchQuestions: Array.isArray(raw.researchQuestions)
      ? raw.researchQuestions.map((entry) => normalizeAudienceResearchQuestion(entry))
      : [],
    identifiedUserTypes: Array.isArray(raw.identifiedUserTypes)
      ? raw.identifiedUserTypes.map((entry, index) => normalizeAudienceResearchUserType(entry, index))
      : [],
  };

  return AudienceResearchPhase1Schema.parse(normalized);
}

function toPersonaId(value: unknown, fallbackName: string, index: number): string {
  const source = coerceString(value, fallbackName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return source.length > 0 ? source : `persona-${index + 1}`;
}

function normalizeGoal(value: unknown): { goal: string; type: "outcome" | "feeling" } {
  if (typeof value === "string") {
    return { goal: value.trim(), type: "outcome" };
  }

  const raw = asRecord(value);
  const type = raw.type === "feeling" ? "feeling" : "outcome";

  return {
    goal: coerceString(raw.goal, "Reach a meaningful improvement"),
    type,
  };
}

function normalizePainPoint(value: unknown): { friction: string; realCost: string } {
  const raw = asRecord(value);

  return {
    friction: coerceString(raw.friction, "Current workflow friction"),
    realCost: coerceString(raw.realCost, "Lost time and momentum"),
  };
}

function normalizeObjection(value: unknown): { objection: string; proofNeeded: string } {
  const raw = asRecord(value);

  return {
    objection: coerceString(raw.objection, "Unsure this advice will fit their context"),
    proofNeeded: coerceString(raw.proofNeeded, "Examples from someone in a similar role"),
  };
}

function normalizeSuccessMetric(value: unknown): { metric: string; feeling?: string } {
  const raw = asRecord(value);
  const feeling = coerceString(raw.feeling, "");

  return {
    metric: coerceString(raw.metric, "Visible progress toward the desired outcome"),
    ...(feeling ? { feeling } : {}),
  };
}

export function normalizePersonaDeepProfile(value: unknown, index: number): PersonaDeepProfile {
  const raw = asRecord(value);
  const demographics = asRecord(raw.demographics);
  const currentSituation = asRecord(raw.currentSituation);
  const learningStyle = asRecord(raw.learningStyle);
  const voiceBlendFit = asRecord(raw.voiceBlendFit);
  const fallbackName = `Persona ${index + 1}`;

  return {
    id: toPersonaId(raw.id, coerceString(raw.name, fallbackName), index),
    name: coerceString(raw.name, fallbackName),
    priority: raw.priority === "primary" || raw.priority === "secondary" ? raw.priority : undefined,
    demographics: {
      role: coerceString(demographics.role, "Professional reader"),
      companyType: coerceString(demographics.companyType, "Mixed organizations"),
      yearsInRole: coerceNumber(demographics.yearsInRole, 5),
      careerPath: coerceString(demographics.careerPath, "Progressed into this role over time"),
      dayInTheLife: coerceString(
        demographics.dayInTheLife ?? demographics.dayToDay ?? demographics.daySummary,
        "Spends most of the day balancing urgent work with people and delivery demands.",
      ),
      reportsTo: coerceString(demographics.reportsTo, "Senior leader"),
      teamSize: coerceNumber(demographics.teamSize, 0),
    },
    currentSituation: {
      whatTheyDo: coerceString(currentSituation.whatTheyDo, "Owns meaningful work tied to the book promise."),
      whatWorks: coerceStringArray(currentSituation.whatWorks),
      whatDoesntWork: coerceStringArray(
        currentSituation.whatDoesntWork ?? currentSituation.whatDoesntWorkWell,
      ),
      timeAllocation: coerceString(
        currentSituation.timeAllocation ?? currentSituation.timeUse,
        "Time is split across execution, communication, and firefighting.",
      ),
      biggestFrustration: coerceString(
        currentSituation.biggestFrustration,
        "Their current approach is not producing consistent results.",
      ),
    },
    goals: Array.isArray(raw.goals) ? raw.goals.map(normalizeGoal) : [],
    painPoints: Array.isArray(raw.painPoints) ? raw.painPoints.map(normalizePainPoint) : [],
    objections: Array.isArray(raw.objections) ? raw.objections.map(normalizeObjection) : [],
    successMetrics: Array.isArray(raw.successMetrics)
      ? raw.successMetrics.map(normalizeSuccessMetric)
      : [],
    learningStyle: {
      prefers: coerceStringArray(learningStyle.prefers),
      hates: coerceStringArray(learningStyle.hates),
      bestFormat: coerceString(
        learningStyle.bestFormat,
        "Concrete examples paired with practical frameworks",
      ),
    },
    voiceBlendFit: {
      primary: coerceString(voiceBlendFit.primary, "Practical and direct"),
      ...(typeof voiceBlendFit.secondary === "string" && voiceBlendFit.secondary.trim().length > 0
        ? { secondary: voiceBlendFit.secondary.trim() }
        : {}),
      ...(typeof voiceBlendFit.tertiary === "string" && voiceBlendFit.tertiary.trim().length > 0
        ? { tertiary: voiceBlendFit.tertiary.trim() }
        : {}),
      reasoning: coerceString(
        voiceBlendFit.reasoning ?? voiceBlendFit.why,
        "This blend matches how the persona wants to learn and act.",
      ),
    },
  };
}

export function summarizePersonasForPrompt(personas: PersonaDeepProfile[]) {
  return personas.map((persona) => ({
    id: persona.id,
    name: persona.name,
    role: persona.demographics.role,
    companyType: persona.demographics.companyType,
    biggestFrustration: persona.currentSituation.biggestFrustration,
  }));
}

export function buildPersonaGenerationInstruction(requestedCount: number) {
  const countInstruction =
    requestedCount === 1
      ? "Generate exactly 1 reader persona that is materially distinct from any existing personas."
      : `Generate exactly ${requestedCount} reader personas that are materially distinct from any existing personas.`;

  return [
    countInstruction,
    "Match the schema exactly.",
    "Return a top-level object with a `personas` array only.",
    "For every persona include demographics.role, demographics.companyType, demographics.yearsInRole, demographics.careerPath, demographics.dayInTheLife, demographics.reportsTo, demographics.teamSize.",
    "Use `dayInTheLife` exactly. Do not use `dayToDay`, `daySummary`, or alternate keys.",
    "Use JSON numbers for `yearsInRole` and `teamSize`.",
    "Always include `reportsTo` as a concrete manager or executive title.",
    "Use only `outcome` or `feeling` for goal types.",
    "Keep each long-form field to 1-2 sentences so the full JSON fits in one response.",
  ].join(" ");
}

export function getPersonaDeepProfileBatchSize(_requestedPersonaCount: number): number {
  // Default to pairs for the happy path, then rely on truncation-aware retry
  // logic to split a batch down to a single persona only when needed.
  return _requestedPersonaCount <= 1 ? 1 : 2;
}

export function getPersonaDeepProfilePhaseBudgetMs(requestedPersonaCount: number): number {
  const boundedPersonaCount = Math.max(1, Math.min(requestedPersonaCount, 10));
  const estimatedBatches = Math.ceil(
    boundedPersonaCount / getPersonaDeepProfileBatchSize(boundedPersonaCount),
  );

  return Math.min(240000, Math.max(120000, estimatedBatches * 60000));
}

export function summarizePersonasForComparison(personas: PersonaDeepProfile[]) {
  return personas.map((persona) => ({
    name: persona.name,
    priority: persona.priority ?? "secondary",
    demographics: {
      role: persona.demographics.role,
      companyType: persona.demographics.companyType,
      yearsInRole: persona.demographics.yearsInRole,
      teamSize: persona.demographics.teamSize,
      reportsTo: persona.demographics.reportsTo,
    },
    currentSituation: {
      whatTheyDo: persona.currentSituation.whatTheyDo,
      biggestFrustration: persona.currentSituation.biggestFrustration,
      whatWorks: persona.currentSituation.whatWorks.slice(0, 3),
      whatDoesntWork: persona.currentSituation.whatDoesntWork.slice(0, 3),
    },
    goals: persona.goals.slice(0, 4),
    painPoints: persona.painPoints.slice(0, 4),
    successMetrics: persona.successMetrics.slice(0, 3),
    learningStyle: persona.learningStyle,
    voiceBlendFit: persona.voiceBlendFit,
  }));
}

export function buildFallbackPersonaComparisonAnalysis(
  personas: PersonaDeepProfile[],
): PersonaComparisonAnalysis {
  const primaryPersona =
    personas.find((persona) => persona.priority === "primary") ?? personas[0];

  return {
    commonThemes: [
      "All personas want a practical framework they can apply immediately instead of abstract leadership theory.",
      "Each persona is dealing with execution friction that creates drag across people, priorities, and accountability.",
      "They need language and structure that make difficult organizational problems easier to diagnose and discuss.",
    ],
    differences: personas.map((persona) => ({
      persona: persona.name,
      difference: `${persona.name} is a ${persona.demographics.role} in ${persona.demographics.companyType} and feels the problem most sharply as ${persona.currentSituation.biggestFrustration}`,
    })),
    primaryPersona: {
      name: primaryPersona?.name || "Primary Persona",
      reasoning: primaryPersona
        ? `${primaryPersona.name} appears to be the strongest primary persona because the pain is urgent, the role carries buying influence, and the problem is central to day-to-day execution.`
        : "This persona appears to combine the clearest pain, strongest business urgency, and most direct path to action.",
    },
    comparisonMatrix: [
      {
        dimension: "Role",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: persona.demographics.role,
        })),
      },
      {
        dimension: "Company Context",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: persona.demographics.companyType,
        })),
      },
      {
        dimension: "Team Size",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: String(persona.demographics.teamSize),
        })),
      },
      {
        dimension: "Primary Pain",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: persona.currentSituation.biggestFrustration,
        })),
      },
      {
        dimension: "Best Format",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: persona.learningStyle.bestFormat,
        })),
      },
      {
        dimension: "Voice Blend Match",
        personas: personas.map((persona) => ({
          name: persona.name,
          value: persona.voiceBlendFit.primary,
        })),
      },
    ],
  };
}

export function normalizePersonaComparisonAnalysis(
  value: unknown,
  personas: PersonaDeepProfile[],
): PersonaComparisonAnalysis {
  const fallback = buildFallbackPersonaComparisonAnalysis(personas);
  const raw = asRecord(value);
  const personaNames = new Set(personas.map((persona) => persona.name));

  const commonThemes =
    Array.isArray(raw.commonThemes) && raw.commonThemes.length > 0
      ? raw.commonThemes
          .map((theme) => coerceString(theme, ""))
          .filter((theme) => theme.length > 0)
      : fallback.commonThemes;

  const differences =
    Array.isArray(raw.differences) && raw.differences.length > 0
      ? raw.differences
          .map((entry, index) => {
            if (typeof entry === "string") {
              return {
                persona: personas[index]?.name || `Persona ${index + 1}`,
                difference: entry,
              };
            }

            const differenceRecord = asRecord(entry);
            const personaName = coerceString(
              differenceRecord.persona,
              personas[index]?.name || `Persona ${index + 1}`,
            );

            return {
              persona: personaNames.has(personaName)
                ? personaName
                : personas[index]?.name || personaName,
              difference: coerceString(
                differenceRecord.difference,
                fallback.differences[index]?.difference || "Distinct context and buying motivation.",
              ),
            };
          })
          .filter((entry) => entry.difference.length > 0)
      : fallback.differences;

  const primaryPersonaRecord = asRecord(raw.primaryPersona);
  const requestedPrimaryName = coerceString(primaryPersonaRecord.name, fallback.primaryPersona.name);
  const resolvedPrimaryName =
    personas.find((persona) => persona.name === requestedPrimaryName)?.name ||
    fallback.primaryPersona.name;

  const comparisonMatrix =
    Array.isArray(raw.comparisonMatrix) && raw.comparisonMatrix.length > 0
      ? raw.comparisonMatrix
          .map((row, rowIndex) => {
            const rowRecord = asRecord(row);
            const rowValuesRaw = Array.isArray(rowRecord.personas) ? rowRecord.personas : [];
            const rowValues = personas.map((persona, personaIndex) => {
              const valueRecord = asRecord(rowValuesRaw[personaIndex]);
              const name = coerceString(valueRecord.name, persona.name);
              const matchedPersonaName =
                personas.find((candidate) => candidate.name === name)?.name || persona.name;

              return {
                name: matchedPersonaName,
                value: coerceString(
                  valueRecord.value,
                  fallback.comparisonMatrix[rowIndex]?.personas[personaIndex]?.value || "N/A",
                ),
              };
            });

            return {
              dimension: coerceString(
                rowRecord.dimension,
                fallback.comparisonMatrix[rowIndex]?.dimension || `Dimension ${rowIndex + 1}`,
              ),
              personas: rowValues,
            };
          })
          .filter((row) => row.dimension.length > 0)
      : fallback.comparisonMatrix;

  return PersonaComparisonAnalysisSchema.parse({
    commonThemes,
    differences,
    primaryPersona: {
      name: resolvedPrimaryName,
      reasoning: coerceString(
        primaryPersonaRecord.reasoning,
        fallback.primaryPersona.reasoning,
      ),
    },
    comparisonMatrix,
  });
}
