import type { PersonaDeepProfile, PersonaPack, PromiseBrief } from "../../promise-types";
import type { TruthPersonaContext } from "./report-presentation";

function coerceString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export function normalizeTruthVoice(value: unknown): "Andy" | "Drucker" | "Jobs" {
  const normalized = coerceString(value, "Drucker").toLowerCase();
  if (normalized.includes("andy")) {
    return "Andy";
  }
  if (normalized.includes("job")) {
    return "Jobs";
  }
  return "Drucker";
}

export function buildTruthPersonaContexts(
  promise: PromiseBrief,
  deepProfiles?: PersonaDeepProfile[],
  simplePersonas?: PersonaPack["personas"],
): TruthPersonaContext[] {
  const prioritizedDeepProfiles = [...(deepProfiles ?? [])].sort((left, right) => {
    const leftPriority = left.priority === "primary" ? 0 : 1;
    const rightPriority = right.priority === "primary" ? 0 : 1;
    return leftPriority - rightPriority;
  });

  const contextsFromDeepProfiles = prioritizedDeepProfiles.map((persona) => ({
    name: persona.name,
    context: `${persona.demographics.role} in ${persona.demographics.companyType}`,
    dilemma: `${persona.currentSituation.biggestFrustration} ${persona.painPoints
      .slice(0, 2)
      .map((point) => point.friction)
      .join(" ")}`.trim(),
    voiceHint: normalizeTruthVoice(persona.voiceBlendFit.primary),
  }));

  const contextsFromSimplePersonas = (simplePersonas ?? []).map((persona) => ({
    name: persona.name,
    context: persona.context,
    dilemma: `${persona.painPoints.slice(0, 2).join(" ")} ${persona.desiredOutcomes
      .slice(0, 1)
      .join(" ")}`.trim(),
    voiceHint: "Drucker" as const,
  }));

  const fallbacks = [
    {
      name: promise.audiencePrimary || "Primary Reader",
      context: `Reader seeking ${promise.readerDesire || "better results"}`,
      dilemma: promise.readerProblem || "They are stuck using a broken mental model.",
      voiceHint: "Drucker" as const,
    },
    ...(promise.audienceSecondary ?? []).slice(0, 2).map((audience, index) => ({
      name: audience,
      context: `Secondary audience ${index + 1}`,
      dilemma: promise.readerProblem || "They need a clearer path forward.",
      voiceHint: index % 2 === 0 ? ("Andy" as const) : ("Jobs" as const),
    })),
  ];

  const uniqueContexts: TruthPersonaContext[] = [];
  for (const candidate of [
    ...contextsFromDeepProfiles,
    ...contextsFromSimplePersonas,
    ...fallbacks,
  ]) {
    if (!candidate.name || uniqueContexts.some((existing) => existing.name === candidate.name)) {
      continue;
    }
    uniqueContexts.push(candidate);
    if (uniqueContexts.length === 3) {
      break;
    }
  }

  while (uniqueContexts.length < 3) {
    uniqueContexts.push({
      name: `Reader ${uniqueContexts.length + 1}`,
      context: `Reader drawn to ${promise.promiseStatement || promise.bigIdea || "the book promise"}`,
      dilemma: promise.readerProblem || "They need a better way to understand the problem.",
      voiceHint: "Drucker",
    });
  }

  return uniqueContexts;
}
