import type { BookPromiseReport, PersonaDeepProfile } from "../../promise-types";
import { escapeMarkdownPattern } from "./report-markdown";
import type { PitchAudienceProfile } from "./report-presentation";

function coerceString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => coerceString(item, ""))
    .filter((item) => item.length > 0);
}

export function buildLegacyBookPitchMarkdown(
  legacy: Record<string, unknown>,
  fallback: BookPromiseReport,
): string {
  const finalPromise = coerceString(legacy.finalPromise, fallback.corePromise);
  const targetAudience = coerceString(legacy.targetAudience, fallback.targetAudience);
  const transformationNarrative = coerceString(
    legacy.transformationNarrative,
    fallback.executiveSummary,
  );
  const positioningStrategy = coerceStringArray(legacy.positioningStrategy);

  if (!finalPromise && !targetAudience && positioningStrategy.length === 0) {
    return fallback.documentMarkdown;
  }

  return `# EXECUTIVE SUMMARY

${coerceString(legacy.promiseStatement, fallback.corePromise)}

## Target Audience

${targetAudience}

## Transformation Narrative

${transformationNarrative}

## Positioning Strategy

${(positioningStrategy.length > 0 ? positioningStrategy : fallback.nextSteps)
  .map((item) => `- ${item}`)
  .join("\n")}

## Final Package Direction

${fallback.executiveSummary}`;
}

export function containsNamedAudienceReference(
  value: string,
  deepProfiles: PersonaDeepProfile[] | undefined,
): boolean {
  const normalized = value.toLowerCase();
  return (deepProfiles ?? []).some((persona) => {
    const name = persona.name?.trim();
    if (!name || !name.includes(" ")) {
      return false;
    }

    return normalized.includes(name.toLowerCase());
  });
}

export function replaceBookPitchPersonaNames(
  markdown: string,
  deepProfiles: PersonaDeepProfile[] | undefined,
  audienceProfiles: PitchAudienceProfile[],
): string {
  let next = markdown;

  (deepProfiles ?? []).slice(0, audienceProfiles.length).forEach((persona, index) => {
    const name = persona.name?.trim();
    const replacement = audienceProfiles[index]?.label?.trim();

    if (!name || !replacement || !name.includes(" ")) {
      return;
    }

    next = next.replace(new RegExp(escapeMarkdownPattern(name), "g"), replacement);
  });

  return next;
}
