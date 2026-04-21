// Auto-generated foundation types for canonical writer personas.
// The 5 canonical personas (Andy, Cahn, Drucker, Elon, Jobs) are defined
// as code constants in this folder and synced into the database as a
// cache via ensureCanonicalWriterPersonas() in writer-personas.ts.
// Edit the per-persona .ts files to change a persona.
// The DB will pick up changes on the next call to getActiveWriterPersonas().

export type FrameworkStep = {
  slot: string;
  prompt: string;
};

export type CanonicalPersona = {
  slug: string;
  name: string;
  description: string;
  voiceTraits: readonly string[];
  signaturePatterns: readonly string[];
  avoidPatterns: readonly string[];
  sampleExcerpt: string | null;
  frameworkName: string;
  frameworkFlow: readonly FrameworkStep[];
};
