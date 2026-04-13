/**
 * Author Profile Repository
 *
 * Manages persistent author information across books:
 * - Background, expertise, target audience
 * - Writing preferences (tone, style, metaphors)
 * - Values & constraints (what to avoid, must include)
 * - Multi-book consistency (character names, terminology, metaphors)
 *
 * TODO: Implement these functions and integrate with book setup/generation
 */

import type { AuthorProfile } from "@prisma/client";

/**
 * Get or create default author profile for a user
 * If user has no profile yet, creates one
 * TODO: Implement
 */
export async function getOrCreateAuthorProfile(
  userId: string,
): Promise<AuthorProfile> {
  throw new Error("getOrCreateAuthorProfile not yet implemented - coming soon");
  // const profile = await prisma.authorProfile.findFirst({
  //   where: { userId, isDefault: true },
  // });
  // if (profile) return profile;
  // return prisma.authorProfile.create({
  //   data: {
  //     userId,
  //     displayName: "Author",
  //     isDefault: true,
  //   },
  // });
}

/**
 * Get all author profiles for a user
 * TODO: Implement
 */
export async function getAuthorProfiles(userId: string): Promise<AuthorProfile[]> {
  throw new Error("getAuthorProfiles not yet implemented - coming soon");
  // return prisma.authorProfile.findMany({
  //   where: { userId },
  //   orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  // });
}

/**
 * Get single author profile by ID
 * TODO: Implement
 */
export async function getAuthorProfileById(
  profileId: string,
): Promise<AuthorProfile | null> {
  throw new Error("getAuthorProfileById not yet implemented - coming soon");
  // return prisma.authorProfile.findUnique({
  //   where: { id: profileId },
  // });
}

/**
 * Create new author profile
 * TODO: Implement
 */
export async function createAuthorProfile(
  userId: string,
  data: {
    displayName: string;
    backgroundSummary?: string;
    expertise?: string[];
    targetAudience?: string;
    tonePreference?: string;
    proseStyle?: string;
    preferredMetaphors?: string[];
    avoidPatterns?: string[];
    mustInclude?: string[];
    brandVoice?: string;
    characterNames?: string[];
    terminology?: string[];
    recurringMetaphors?: string[];
    styleGuideNotes?: string;
  },
): Promise<AuthorProfile> {
  throw new Error("createAuthorProfile not yet implemented - coming soon");
  // return prisma.authorProfile.create({
  //   data: {
  //     userId,
  //     ...data,
  //     expertise: data.expertise || [],
  //     preferredMetaphors: data.preferredMetaphors || [],
  //     avoidPatterns: data.avoidPatterns || [],
  //     mustInclude: data.mustInclude || [],
  //     characterNames: data.characterNames || [],
  //     terminology: data.terminology || [],
  //     recurringMetaphors: data.recurringMetaphors || [],
  //   },
  // });
}

/**
 * Update author profile
 * TODO: Implement
 */
export async function updateAuthorProfile(
  profileId: string,
  data: Partial<Omit<AuthorProfile, "id" | "createdAt" | "updatedAt" | "userId">>,
): Promise<AuthorProfile> {
  throw new Error("updateAuthorProfile not yet implemented - coming soon");
  // return prisma.authorProfile.update({
  //   where: { id: profileId },
  //   data,
  // });
}

/**
 * Delete author profile
 * TODO: Implement
 */
export async function deleteAuthorProfile(profileId: string): Promise<void> {
  throw new Error("deleteAuthorProfile not yet implemented - coming soon");
  // await prisma.authorProfile.delete({
  //   where: { id: profileId },
  // });
}

/**
 * Set author profile as default (only one default per user)
 * TODO: Implement
 */
export async function setDefaultAuthorProfile(
  userId: string,
  profileId: string,
): Promise<AuthorProfile> {
  throw new Error("setDefaultAuthorProfile not yet implemented - coming soon");
  // // Unset all other profiles as default
  // await prisma.authorProfile.updateMany({
  //   where: { userId, isDefault: true },
  //   data: { isDefault: false },
  // });
  // // Set this one as default
  // return prisma.authorProfile.update({
  //   where: { id: profileId },
  //   data: { isDefault: true },
  // });
}

/**
 * Format author profile for AI prompt injection
 * Returns a string that can be inserted into system prompts
 * TODO: Implement
 */
export function formatAuthorContextForPrompt(profile: AuthorProfile | null): string {
  if (!profile) return "";

  const lines: string[] = [];

  if (profile.displayName) {
    lines.push(`Author: ${profile.displayName}`);
  }

  if (profile.backgroundSummary) {
    lines.push(`Background: ${profile.backgroundSummary}`);
  }

  if (profile.expertise && Array.isArray(profile.expertise) && profile.expertise.length > 0) {
    lines.push(`Expertise: ${(profile.expertise as string[]).join(", ")}`);
  }

  if (profile.targetAudience) {
    lines.push(`Target Audience: ${profile.targetAudience}`);
  }

  if (profile.tonePreference) {
    lines.push(`Tone Preference: ${profile.tonePreference}`);
  }

  if (profile.proseStyle) {
    lines.push(`Prose Style: ${profile.proseStyle}`);
  }

  if (
    profile.preferredMetaphors &&
    Array.isArray(profile.preferredMetaphors) &&
    (profile.preferredMetaphors as string[]).length > 0
  ) {
    lines.push(`Preferred Metaphors: ${(profile.preferredMetaphors as string[]).join(", ")}`);
  }

  if (profile.avoidPatterns && Array.isArray(profile.avoidPatterns) && (profile.avoidPatterns as string[]).length > 0) {
    lines.push(`Avoid: ${(profile.avoidPatterns as string[]).join(", ")}`);
  }

  if (profile.mustInclude && Array.isArray(profile.mustInclude) && (profile.mustInclude as string[]).length > 0) {
    lines.push(`Must Include: ${(profile.mustInclude as string[]).join(", ")}`);
  }

  if (profile.brandVoice) {
    lines.push(`Brand Voice: ${profile.brandVoice}`);
  }

  return lines.length > 0 ? `\nAuthor Profile:\n${lines.join("\n")}` : "";
}
