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

  // Quill/drafting context — captured during setup, used by chapter draft agent
  voiceTone?: string;           // qualitative voice description: "warm, conversational, plainspoken with occasional wit"
  chapterFormat?: string[];     // ["reflection-questions", "exercises", "sidebars", "checklists", "case-studies", "callout-boxes"]
  readerLevel?: "casual" | "practitioner" | "professional" | "expert";

  /**
   * Research lens — genre profile that shapes Scout's search queries and
   * source-tier rules (and Chronicle's story sourcing). Keys defined in
   * src/lib/research-lenses.ts; "general" is the balanced default.
   */
  researchLens?: string;

  /**
   * Preferred Bible translation for the Biblical/Theological lens (e.g.
   * "ESV", "NIV", "NASB", "KJV", "NKJV", "CSB") — keeps Scout's citations
   * and Chronicle's scripture references consistent throughout the book.
   * Only meaningful when researchLens is "biblical".
   */
  preferredBibleTranslation?: string | null;
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
  researchLens: "general",
};

/**
 * Committed BOOK_SETUP_PROFILE artifacts come in two shapes: the structured
 * profile (settings form / seeded default) and a markdown {text} blob
 * (Blueprint chat commits). Shallow-merging over defaults gives consumers
 * the full profile shape either way, and backfills fields added after older
 * profiles were saved.
 */
export function normalizeBookSetupProfile(value: unknown): BookSetupProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return { ...DEFAULT_BOOK_SETUP_PROFILE, ...(value as Partial<BookSetupProfile>) };
}
