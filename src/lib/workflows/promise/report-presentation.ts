import type { BookSetupProfile } from "../../book-setup-types";
import type {
  AudienceResearchArtifact,
  PersonaDeepProfile,
  PositioningRecommendations,
  PromiseBrief,
  TitleSubtitleFinalization,
} from "../../promise-types";

export type TruthPersonaContext = {
  name: string;
  context: string;
  dilemma: string;
  voiceHint: "Andy" | "Drucker" | "Jobs";
};

export type PitchAudienceProfile = {
  label: string;
  description: string;
  roleContext: string;
  primaryPainPoint: string;
  whyThisBook: string;
  keySignals: string[];
  voiceBlendResonance: string;
};

export function getSelectedTitleSubtitle(
  promise: PromiseBrief,
  bookSetupProfile?: BookSetupProfile | null,
  titleSubtitleFinalization?: TitleSubtitleFinalization,
) {
  const title =
    titleSubtitleFinalization?.finalizedTitle?.trim() ||
    bookSetupProfile?.workingTitle ||
    promise.workingTitle ||
    "Untitled Book";
  const subtitle =
    titleSubtitleFinalization?.finalizedSubtitle?.trim() ||
    bookSetupProfile?.subtitle ||
    `${promise.readerDesire || "A practical framework for better results"} for ${promise.audiencePrimary || "serious readers"}`;

  return {
    title,
    subtitle,
  };
}

export function summarizeVoiceBlendForPitch(bookSetupProfile?: BookSetupProfile | null): string {
  const blend = bookSetupProfile?.writerPersonaBlend ?? [];
  if (blend.length > 0) {
    return blend
      .slice(0, 3)
      .map((persona) => `${persona.personaName}: ${persona.percentInfluence}%`)
      .join(" | ");
  }

  if (bookSetupProfile?.writerPersona) {
    return bookSetupProfile.writerPersona;
  }

  return "Practical, strategic, and credible nonfiction voice";
}

function createRoleBasedAudienceLabel(
  persona: PersonaDeepProfile,
  fallbackIndex: number,
): string {
  const role = persona.demographics.role?.trim();
  const companyType = persona.demographics.companyType?.trim();

  if (role && companyType) {
    return `${role} in ${companyType}`;
  }

  if (role) {
    return role;
  }

  if (companyType) {
    return `Leader in ${companyType}`;
  }

  return `Audience Segment ${fallbackIndex + 1}`;
}

export function buildBookPitchAudienceProfiles(
  audienceResearch: AudienceResearchArtifact | undefined,
  deepProfiles: PersonaDeepProfile[] | undefined,
  personaContexts: TruthPersonaContext[],
  recommendations: PositioningRecommendations,
): PitchAudienceProfile[] {
  const userTypes = audienceResearch?.phase1.identifiedUserTypes ?? [];

  if ((deepProfiles ?? []).length > 0) {
    return (deepProfiles ?? []).slice(0, 3).map((persona, index) => ({
      label:
        userTypes[index]?.name?.trim() ||
        createRoleBasedAudienceLabel(persona, index),
      description:
        userTypes[index]?.description?.trim() ||
        `${persona.demographics.role} navigating ${persona.currentSituation.biggestFrustration.toLowerCase()}`,
      roleContext: [
        persona.demographics.role,
        persona.demographics.companyType,
        `${persona.demographics.yearsInRole} years in role`,
      ]
        .filter(Boolean)
        .join(" | "),
      primaryPainPoint:
        persona.currentSituation.biggestFrustration ||
        personaContexts[index]?.dilemma ||
        "They are facing a costly recurring leadership and execution problem.",
      whyThisBook:
        recommendations.personaStrategies[index]?.primaryPositioning ||
        personaContexts[index]?.dilemma ||
        "The book gives them a clearer operating model and a practical path forward.",
      keySignals: [
        ...(userTypes[index]?.details ?? []).slice(0, 2),
        ...persona.goals.slice(0, 2).map((goal) => goal.goal),
      ]
        .filter(Boolean)
        .slice(0, 4),
      voiceBlendResonance: [
        persona.voiceBlendFit.primary,
        persona.voiceBlendFit.secondary,
        persona.voiceBlendFit.reasoning,
      ]
        .filter(Boolean)
        .join(" | "),
    }));
  }

  if (userTypes.length > 0) {
    return userTypes.slice(0, 3).map((type, index) => ({
      label: type.name.trim() || `Audience Segment ${index + 1}`,
      description: type.description.trim(),
      roleContext: type.details.slice(0, 3).join(" | "),
      primaryPainPoint:
        type.details[0] ||
        personaContexts[index]?.dilemma ||
        "They know something is not working, but they do not yet have a better model.",
      whyThisBook:
        recommendations.personaStrategies[index]?.primaryPositioning ||
        personaContexts[index]?.dilemma ||
        "The book helps them diagnose the problem correctly and act with more confidence.",
      keySignals: type.details.slice(0, 4),
      voiceBlendResonance:
        recommendations.personaStrategies[index]?.keyMessage ||
        personaContexts[index]?.voiceHint ||
        "Practical and strategic guidance",
    }));
  }

  return personaContexts.slice(0, 3).map((persona, index) => ({
    label: promiseCaseLabel(persona.context, index),
    description: persona.context,
    roleContext: persona.context,
    primaryPainPoint: persona.dilemma,
    whyThisBook:
      recommendations.personaStrategies[index]?.primaryPositioning ||
      persona.dilemma,
    keySignals: [persona.dilemma],
    voiceBlendResonance: persona.voiceHint,
  }));
}

export function promiseCaseLabel(context: string, index: number): string {
  const clean = context
    .split(/[.;|]/)[0]
    ?.trim()
    .replace(/\s+/g, " ");

  return clean && clean.length > 0 ? clean : `Audience Segment ${index + 1}`;
}

export function summarizeBookPitchTargetAudience(
  audienceProfiles: PitchAudienceProfile[],
  promise: PromiseBrief,
): string {
  if (audienceProfiles.length === 0) {
    return promise.audiencePrimary || "Primary reader in progress";
  }

  const primary = audienceProfiles[0];
  const secondary = audienceProfiles.slice(1, 3).map((profile) => profile.label);

  if (secondary.length === 0) {
    return `${primary.label}: ${primary.description}`;
  }

  return `${primary.label}: ${primary.description}. Secondary audiences include ${secondary.join(" and ")}.`;
}

export function renderMarkdownBulletList(items: string[], fallback: string): string {
  const usable = items
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (usable.length === 0) {
    return `- ${fallback}`;
  }

  return usable.map((item) => `- ${item}`).join("\n");
}

export function renderMarkdownNumberedList(items: string[], fallback: string): string {
  const usable = items
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (usable.length === 0) {
    return `1. ${fallback}`;
  }

  return usable.map((item, index) => `${index + 1}. ${item}`).join("\n");
}
