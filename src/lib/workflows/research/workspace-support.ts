import type { ResearchSource } from "@prisma/client";

import type { ChapterResearchSource } from "../../research-types";

export type DossierStatus = "EMPTY" | "DRAFT" | "NEEDS_REVIEW" | "COMMITTED";

export function getDossierStatus(input: {
  versionNumber?: number;
  isCommitted?: boolean;
  verifiedItems?: number;
  needsCorroborationItems?: number;
}): DossierStatus {
  if (!input.versionNumber) {
    return "EMPTY";
  }

  if (input.isCommitted) {
    return "COMMITTED";
  }

  // Chapters with ANY verified items are ready to draft with.
  // The quality loop can continue improving them in the background.
  if ((input.verifiedItems ?? 0) > 0) {
    return "DRAFT";
  }

  // Only truly stuck chapters (0 verified items) need review.
  return "NEEDS_REVIEW";
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function normalizeWorkspaceResearchSource(source: ResearchSource): ChapterResearchSource {
  return {
    id: source.id,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    title: source.title,
    publisher: source.publisher,
    author: source.author,
    publishedAt: source.publishedAt?.toISOString() ?? null,
    accessedAt: source.accessedAt?.toISOString() ?? null,
    contentType: source.contentType,
    sourceTier: source.sourceTier as ChapterResearchSource["sourceTier"],
    tierWeight: Number(source.tierWeight),
    isVerified: source.isVerified,
    verificationStatus:
      source.verificationStatus as ChapterResearchSource["verificationStatus"],
    verificationNotes: source.verificationNotes,
    snapshotPath: source.snapshotPath,
    extractedTextPath: source.extractedTextPath,
    metadata: parseJson<Record<string, unknown>>(source.metadataJson, {}),
  };
}
