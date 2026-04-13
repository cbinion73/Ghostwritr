import type { BaseStoryFormat } from "./base-story-types";

export type BookFormatTarget = "PRINT" | "EBOOK" | "AUDIO";
export type BaseStoryFormatPreference = BaseStoryFormat | "AUTO";

/**
 * Represents a single persona in a voice blend
 * Personas are core to the book's narrative arc - they define voice, style, and identity
 */
export type WriterPersonaBlend = {
  personaId: string;
  personaName: string;
  personaSlug: string;
  percentInfluence: number;  // 0-100, must sum to 100% across all personas in blend
  traits: string[];
  signaturePatterns: string[];
};

export type BookSetupProfile = {
  writerPersonaId?: string | null;
  writerPersonaGuidance?: string[];
  workingTitle: string;
  subtitle?: string | null;
  writerPersona: string;

  // NEW: Multiple personas with influence percentages (voice blending)
  writerPersonaBlend?: WriterPersonaBlend[];

  baseStoryFormatPreference: BaseStoryFormatPreference;
  voiceReferenceNotes: string[];
  targetWordCount: number;
  wordCountTolerance: number;
  targetPageCount?: number | null;
  trimSize: string;
  outputFormats: BookFormatTarget[];
  aiAuthorshipGuardEnabled: boolean;
  provenanceTrackingEnabled: boolean;
  marketingHandoffEnabled: boolean;
  notesToSystem: string[];
};

export const DEFAULT_BOOK_SETUP_PROFILE: BookSetupProfile = {
  writerPersonaId: null,
  writerPersonaGuidance: [],
  workingTitle: "",
  subtitle: null,
  writerPersona: "Default Ghostwriter",
  baseStoryFormatPreference: "AUTO",
  voiceReferenceNotes: [],
  targetWordCount: 45000,
  wordCountTolerance: 2500,
  targetPageCount: null,
  trimSize: "6 x 9 in",
  outputFormats: ["PRINT", "EBOOK"],
  aiAuthorshipGuardEnabled: true,
  provenanceTrackingEnabled: true,
  marketingHandoffEnabled: true,
  notesToSystem: [],
};
