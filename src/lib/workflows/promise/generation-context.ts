import type { BookSetupProfile } from "../../book-setup-types";
import {
  formatKnowledgeForPrompt,
  getBookKnowledgeBase,
  searchKnowledgeBase,
} from "../../services/knowledge-base";

export function formatSetupContextForPrompt(profile?: BookSetupProfile | null) {
  if (!profile) {
    return "No committed book setup profile is available yet.";
  }

  const setupLines = [
    `Working title: ${profile.workingTitle || "Untitled Book"}`,
    `Writer persona: ${profile.writerPersona}`,
  ];

  if (profile.writerPersonaBlend && profile.writerPersonaBlend.length > 0) {
    const blendDetails = profile.writerPersonaBlend
      .filter((p) => p.percentInfluence > 0)
      .map((p) => {
        const traitsStr = p.traits.length > 0 ? `traits: ${p.traits.join(", ")}` : "";
        const patternsStr =
          p.signaturePatterns.length > 0 ? `patterns: ${p.signaturePatterns.join(" | ")}` : "";
        const details = [traitsStr, patternsStr].filter(Boolean).join("; ");
        return `  - ${p.personaName} (${p.percentInfluence}%): ${details}`;
      })
      .join("\n");

    setupLines.push(`Voice Blend Composition:\n${blendDetails}`);
    setupLines.push(
      `Blending Instructions: Weight each persona's influence by their percentage. The combined voice should balance all perspectives while maintaining coherent narrative identity.`,
    );
  }

  setupLines.push(
    `Writer persona guidance: ${profile.writerPersonaGuidance?.join(" | ") || "None provided"}`,
  );
  setupLines.push(`Target word count: ${profile.targetWordCount}`);
  setupLines.push(`Word-count tolerance: +/- ${profile.wordCountTolerance}`);
  setupLines.push(`Trim size: ${profile.trimSize}`);
  setupLines.push(`Output formats: ${profile.outputFormats.join(", ")}`);
  setupLines.push(`Voice references: ${profile.voiceReferenceNotes.join(" | ") || "None provided"}`);
  setupLines.push(`System notes: ${profile.notesToSystem.join(" | ") || "None provided"}`);

  return setupLines.join("\n");
}

export function formatReferenceMaterialsForPrompt(
  materials?: Array<{
    id: string;
    title: string;
    mimeType: string;
    note: string;
  }>,
) {
  if (!materials || materials.length === 0) {
    return "No uploaded reference materials are available for the Promise stage.";
  }

  return materials
    .map(
      (material, index) =>
        `${index + 1}. ${material.title} (${material.mimeType})${material.note ? ` - ${material.note}` : ""}`,
    )
    .join("\n");
}

export async function getKnowledgeContextForPrompt(
  bookId: string,
  query?: string,
  maxResults?: number,
): Promise<string> {
  const grounding = await getKnowledgeGroundingForPrompt(bookId, query, maxResults);
  return grounding.text;
}

export function deriveKnowledgeFallbackCharLimit(query?: string, maxResults?: number): number {
  if (query && query.trim().length > 0) {
    const requestedResults = Math.max(1, Math.min(maxResults ?? 4, 8));
    return Math.min(16000, Math.max(6000, requestedResults * 2500));
  }

  return 30000;
}

export async function getKnowledgeGroundingForPrompt(
  bookId: string,
  query?: string,
  maxResults?: number,
): Promise<{ text: string; sourceTitles: string[] }> {
  try {
    if (query && query.trim().length > 0) {
      const results = await searchKnowledgeBase({
        bookId,
        query,
        limit: maxResults ?? 4,
      });

      if (results.length > 0) {
        const formatted = formatKnowledgeForPrompt(results);
        console.log(
          `[getKnowledgeContextForPrompt] Loaded ${results.length} relevant search hits, ${formatted.length} characters`,
        );
        return {
          text: `\n\n=== RELEVANT BOOK MATERIALS ===\n${formatted}`,
          sourceTitles: results.map((result) => result.sourceTitle).filter(Boolean),
        };
      }
    }

    const fallbackCharLimit = deriveKnowledgeFallbackCharLimit(query, maxResults);
    const knowledge = await getBookKnowledgeBase(bookId, fallbackCharLimit);

    if (knowledge.content && knowledge.sourceCount > 0) {
      console.log(
        `[getKnowledgeContextForPrompt] Loaded ${knowledge.sourceCount} fallback sources, ${knowledge.content.length} characters (limit ${fallbackCharLimit})`,
      );
      const sourceTitles = knowledge.content
        .split("\n")
        .filter((line) => line.startsWith("Source: "))
        .map((line) => line.replace(/^Source:\s*/, "").trim())
        .filter(Boolean);

      return {
        text: `\n\n=== GROUNDED IN ACTUAL BOOK MATERIALS ===\n${knowledge.content}`,
        sourceTitles,
      };
    }
  } catch (error) {
    console.warn(
      "[getKnowledgeContextForPrompt] Knowledge base load failed:",
      error,
    );
  }

  return {
    text: "",
    sourceTitles: [],
  };
}
