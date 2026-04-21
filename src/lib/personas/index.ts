// Canonical writer personas — source of truth in code, synced to DB as cache.

import type { CanonicalPersona } from "./types";

import { ANDY_GPT } from "./andygpt";
import { CAHN_GPT } from "./cahngpt";
import { DRUCKER_GPT } from "./druckergpt";
import { ELON_GPT } from "./elongpt";
import { JOBS_GPT } from "./jobsgpt";
export { ANDY_GPT } from "./andygpt";
export { CAHN_GPT } from "./cahngpt";
export { DRUCKER_GPT } from "./druckergpt";
export { ELON_GPT } from "./elongpt";
export { JOBS_GPT } from "./jobsgpt";
export type { CanonicalPersona, FrameworkStep } from "./types";

export const CANONICAL_PERSONAS: readonly CanonicalPersona[] = [
  ANDY_GPT,
  CAHN_GPT,
  DRUCKER_GPT,
  ELON_GPT,
  JOBS_GPT,
] as const;
