"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { HumanMessage } from "@langchain/core/messages";
import { readFileSync } from "fs";
import { resolve } from "path";

import type { BaseStoryFormatPreference, BookFormatTarget, WriterPersonaBlend, BookSetupProfile } from "@/lib/book-setup-types";
import { parseJsonFromText } from "@/lib/json-utils";
import { getWriterPersonaById, getActiveWriterPersonas } from "@/lib/repositories/writer-personas";
import { getBookBySlugOrThrow } from "@/lib/repositories/books";
import { saveBookSetupWorkflow, commitBookSetupWorkflow } from "@/lib/workflows/book-setup";
import { getBookSetupWorkspace } from "@/lib/workflows/book-setup";
import { getModelForRole } from "@/lib/llm/routing";
import { BookWorkflowType } from "@prisma/client";

/**
 * Ensure .env file is loaded into process.env
 * Workaround for Next.js 16 Turbopack not always loading .env in server actions
 */
function ensureEnvLoaded(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    return; // Already loaded
  }

  try {
    const envPath = resolve(process.cwd(), ".env");
    const envContent = readFileSync(envPath, "utf-8");
    const lines = envContent.split("\n");
    for (const line of lines) {
      if (line.startsWith("ANTHROPIC_API_KEY=")) {
        const value = line.slice("ANTHROPIC_API_KEY=".length).trim();
        process.env.ANTHROPIC_API_KEY = value.replace(/^["']|["']$/g, "");
      } else if (line.startsWith("OPENAI_API_KEY=")) {
        const value = line.slice("OPENAI_API_KEY=".length).trim();
        process.env.OPENAI_API_KEY = value.replace(/^["']|["']$/g, "");
      } else if (line.startsWith("GOOGLE_GENERATIVE_AI_API_KEY=")) {
        const value = line.slice("GOOGLE_GENERATIVE_AI_API_KEY=".length).trim();
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = value.replace(/^["']|["']$/g, "");
      }
    }
  } catch (err) {
    console.error("[ensureEnvLoaded] Failed to read .env file:", err);
  }
}

function normalizePersonaSuggestionConfidence(
  value: string,
): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return "medium";
}

/**
 * Get all available personas from the library for the dropdown selector
 */
export async function getAvailablePersonas() {
  "use server";

  try {
    const personas = await getActiveWriterPersonas();
    return personas.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      voiceTraits: p.voiceTraits,
    }));
  } catch (error) {
    console.error("[getAvailablePersonas] Error:", error);
    throw error;
  }
}

/**
 * Generate sample prose in the blended voice
 * Shows 2-3 paragraphs demonstrating the combined style
 * Uses routing system for cost-effective Sonnet model
 */
export async function generateVoiceBlendPreview(
  workingTitle: string,
  blend: Array<{
    personaId: string;
    personaName: string;
    percentInfluence: number;
    traits: string[];
    signaturePatterns: string[];
  }>
): Promise<string> {
  "use server";

  try {
    ensureEnvLoaded();

    const blendDescription = blend
      .map((p) => `${p.personaName} (${p.percentInfluence}%)`)
      .join(" + ");

    const traitsAndPatterns = blend
      .flatMap((p) => [
        `${p.personaName} traits: ${p.traits.join(", ")}`,
        `${p.personaName} patterns: ${p.signaturePatterns.join(", ")}`,
      ])
      .join("\n");

    // Identify the dominant persona (highest percentInfluence; deterministic tiebreak by personaId)
    // and structurally trace its framework flow in the preview prose.
    const dominant = [...blend].sort(
      (a, b) => b.percentInfluence - a.percentInfluence || a.personaId.localeCompare(b.personaId),
    )[0];
    const dominantPersona = dominant ? await getWriterPersonaById(dominant.personaId) : null;
    const flow = dominantPersona?.frameworkFlow ?? [];
    const frameworkBlock = flow.length
      ? `\n\nStructural framework to trace (from ${dominantPersona?.name}${
          dominantPersona?.frameworkName ? ` — ${dominantPersona.frameworkName}` : ""
        }):\n${flow
          .map((step, i) => `${i + 1}. [${step.slot}] ${step.prompt}`)
          .join("\n")}\n\nStructure the preview using this framework — walk through each step in order; do not just echo the vocabulary.`
      : "";

    // Get model from routing system (defaults to Sonnet, can be overridden via env var)
    const model = await getModelForRole("setup:voice-blending", {
      maxOutputTokens: 800,
    });

    if (!model) {
      console.error(
        "[generateVoiceBlendPreview] Model initialization failed",
        "ANTHROPIC_API_KEY available:",
        !!process.env.ANTHROPIC_API_KEY,
      );
      throw new Error(
        "Could not initialize model for voice preview generation. Check that ANTHROPIC_API_KEY is configured.",
      );
    }

    const message = await model.invoke([
      new HumanMessage(`Write 2-3 paragraphs of sample prose that demonstrates the blended writing voice of: ${blendDescription}

Book Title: "${workingTitle}"

Persona Characteristics:
${traitsAndPatterns}${frameworkBlock}

Write as if you're opening a book with this title, using the blended voice. Focus on demonstrating the combined style through the writing itself, not through meta-commentary. Write naturally flowing prose that shows how these voices work together.`),
    ]);

    const responseText = typeof message.content === "string" ? message.content : String(message.content);

    return responseText;
  } catch (error) {
    console.error("[generateVoiceBlendPreview] Error:", error);
    throw error;
  }
}

function toStringList(value: FormDataEntryValue | FormDataEntryValue[] | null) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (value == null) {
    return [];
  }

  return String(value)
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Shared utility to process and save book setup from form data
 * Extracted to allow both saveBookSetupAction and saveAndCommitSetupAction to use it
 */
async function processSaveBookSetup(slug: string, formData: FormData) {
  const outputFormats = formData.getAll("outputFormats").map((value) => String(value)) as BookFormatTarget[];
  const chapterFormat = formData.getAll("chapterFormat").map((v) => String(v)).filter(Boolean);
  const voiceTone = String(formData.get("voiceTone") ?? "").trim() || undefined;
  const readerLevelRaw = String(formData.get("readerLevel") ?? "").trim();
  const readerLevel = (["casual", "practitioner", "professional", "expert"].includes(readerLevelRaw)
    ? readerLevelRaw : undefined) as BookSetupProfile["readerLevel"];

  // Get current workspace to preserve voice blend if it exists
  const workspace = await getBookSetupWorkspace(slug);
  const currentBlend = workspace.profile.writerPersonaBlend;

  // Build writer persona context
  // If a voice blend exists, use it; otherwise fall back to single persona from form
  let writerPersonaName = "Default Ghostwriter";
  let writerPersonaGuidance: string[] = [];

  if (currentBlend && currentBlend.length > 0) {
    // Use existing voice blend
    writerPersonaName = currentBlend
      .filter((p) => p.percentInfluence > 0)
      .map((p) => `${p.personaName} (${p.percentInfluence}%)`)
      .join(" + ");
  } else {
    // Fall back to single persona selection (for backward compatibility)
    const requestedWriterPersonaId = String(formData.get("writerPersonaId") ?? "").trim();
    const customWriterPersona = String(formData.get("writerPersonaCustom") ?? "").trim();
    const selectedPersona =
      requestedWriterPersonaId && requestedWriterPersonaId !== "CUSTOM"
        ? await getWriterPersonaById(requestedWriterPersonaId)
        : null;
    writerPersonaName = selectedPersona?.name || customWriterPersona || "Default Ghostwriter";
    writerPersonaGuidance = selectedPersona
      ? [
          selectedPersona.description,
          selectedPersona.voiceTraits.length > 0
            ? `Voice traits: ${selectedPersona.voiceTraits.join(", ")}`
            : null,
          selectedPersona.signaturePatterns.length > 0
            ? `Signature patterns: ${selectedPersona.signaturePatterns.join(" | ")}`
            : null,
          selectedPersona.avoidPatterns.length > 0
            ? `Avoid patterns: ${selectedPersona.avoidPatterns.join(" | ")}`
            : null,
          selectedPersona.samples.filter((sample) => sample.useForInspiration).length > 0
            ? `Inspiration samples: ${selectedPersona.samples
                .filter((sample) => sample.useForInspiration)
                .map((sample) => sample.title)
                .join(" | ")}`
            : null,
          "Use persona materials for inspiration only. Do not copy phrases, structure, or distinctive passages.",
        ].filter((value): value is string => Boolean(value))
      : [];
  }

  await saveBookSetupWorkflow(slug, {
    // Preserve voice blend if it exists
    ...(currentBlend && currentBlend.length > 0 && { writerPersonaBlend: currentBlend }),
    writerPersonaId: currentBlend && currentBlend.length > 0 ? null : undefined,
    writerPersonaGuidance,
    workingTitle: String(formData.get("workingTitle") ?? "").trim(),
    subtitle: String(formData.get("subtitle") ?? "").trim() || null,
    writerPersona: writerPersonaName,
    baseStoryFormatPreference:
      (String(formData.get("baseStoryFormatPreference") ?? "AUTO").trim() ||
        "AUTO") as BaseStoryFormatPreference,
    voiceReferenceNotes: toStringList(formData.get("voiceReferenceNotes")),
    targetWordCount: Number(formData.get("targetWordCount") ?? 45000),
    wordCountTolerance: Number(formData.get("wordCountTolerance") ?? 2500),
    targetPageCount: Number(formData.get("targetPageCount") ?? 0) || null,
    trimSize: String(formData.get("trimSize") ?? "6 x 9 in").trim(),
    outputFormats: outputFormats.length > 0 ? outputFormats : ["PRINT", "EBOOK"],
    aiAuthorshipGuardEnabled: formData.get("aiAuthorshipGuardEnabled") === "on",
    provenanceTrackingEnabled: formData.get("provenanceTrackingEnabled") === "on",
    marketingHandoffEnabled: formData.get("marketingHandoffEnabled") === "on",
    notesToSystem: toStringList(formData.get("notesToSystem")),
    voiceTone,
    chapterFormat: chapterFormat.length > 0 ? chapterFormat : undefined,
    readerLevel,
    researchLens: String(formData.get("researchLens") ?? "general").trim() || "general",
    preferredBibleTranslation: String(formData.get("preferredBibleTranslation") ?? "ESV").trim() || "ESV",
  });
}

export async function saveBookSetupAction(slug: string, formData: FormData) {
  await processSaveBookSetup(slug, formData);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/promise`);
  revalidatePath(`/books/${slug}/story-setup`);
}

export async function commitBookSetupAction(slug: string) {
  await commitBookSetupWorkflow(slug);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/promise`);
  revalidatePath(`/books/${slug}/story-setup`);
}

export async function saveAndCommitSetupAction(slug: string, formData: FormData) {
  // First process and save the setup
  await processSaveBookSetup(slug, formData);

  // Then commit it
  await commitBookSetupWorkflow(slug);

  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/story-setup`);

  const book = await getBookBySlugOrThrow(slug);
  redirect(
    book.workflowType === BookWorkflowType.FICTION
      ? `/books/${slug}/story-setup`
      : `/books/${slug}?stage=PROMISE`,
  );
}

/**
 * Suggests multiple Writer Personas based on the book's purpose
 * Writers are CORE to the book — they define narrative arc, voice, style, and identity
 * Uses routing system for cost-effective Sonnet model
 */
export async function suggestWriterPersonas(
  slug: string,
  workingTitle: string,
  category: string,
  description: string
): Promise<
  Array<{
    personaId: string;
    personaName: string;
    personaSlug: string;
    traits: string[];
    signaturePatterns: string[];
    reasoning: string;
    suggestedPercentage: number;
    confidence: "high" | "medium" | "low";
  }>
> {
  "use server";

  try {
    ensureEnvLoaded();

    // Get all active writer personas from library
    const personas = await getActiveWriterPersonas();

    // Build persona catalog for Claude — includes each persona's structural framework
    // so the model can weight framework fit, not just tone fit.
    const personaCatalog = personas
      .map((p) => {
        const flowLines = p.frameworkFlow.length
          ? p.frameworkFlow.map((step, i) => `  ${i + 1}. [${step.slot}] ${step.prompt}`).join("\n")
          : "  (no framework flow defined)";
        const frameworkLabel = p.frameworkName ?? "Unnamed";
        return `${p.name} (${p.slug}): ${p.description}
Traits: ${p.voiceTraits.join(", ")}
Patterns: ${p.signaturePatterns.join(" | ")}
Framework (${frameworkLabel}):
${flowLines}`;
      })
      .join("\n\n");

    // Get model from routing system (defaults to Sonnet, can be overridden via env var)
    const model = await getModelForRole("setup:voice-blending", {
      maxOutputTokens: 1024,
    });

    if (!model) {
      console.error(
        "[suggestWriterPersonas] Model initialization failed",
        "ANTHROPIC_API_KEY available:",
        !!process.env.ANTHROPIC_API_KEY,
      );
      throw new Error(
        "Could not initialize model for persona suggestion. Check that ANTHROPIC_API_KEY is configured.",
      );
    }

    const message = await model.invoke([
      new HumanMessage(`You are a literary analyst specializing in voice and narrative style.

A writer is creating a book with these details:
- Title: ${workingTitle}
- Category: ${category}
- Description: ${description}

Here are the available writer personas in our library. Each ships an explicit Framework — an ordered list of {slot, prompt} chapter-shaping steps. Weight framework-fit heavily when matching to the book's promise, not just tone:

${personaCatalog}

Based on the book's purpose and style needs — and especially the structural fit between each persona's framework and the chapter arc this book requires — suggest the top 3-5 most suitable personas as a JSON array. For each, provide:
1. personaSlug (must match exactly)
2. reasoning (why this persona fits, max 100 words)
3. suggestedPercentage (their suggested influence in blend, should total ~100% across suggestions)
4. confidence ("high", "medium", or "low")

Return ONLY valid JSON array, no other text. Example format:
[
  {
    "personaSlug": "andy-gpt",
    "reasoning": "Perfect for delivering practical, memorable frameworks with clear implementation paths",
    "suggestedPercentage": 60,
    "confidence": "high"
  },
  {
    "personaSlug": "drucker-gpt",
    "reasoning": "Adds strategic depth and business acumen to complement the practical approach",
    "suggestedPercentage": 25,
    "confidence": "high"
  }
]`),
    ]);

    // Parse model's response
    const responseText = typeof message.content === "string" ? message.content : String(message.content);
    let suggestions: Array<{
      personaSlug: string;
      reasoning: string;
      suggestedPercentage: number;
      confidence: string;
    }>;
    try {
      suggestions = parseJsonFromText(responseText);
    } catch {
      console.error("[suggestWriterPersonas] Could not parse model response:", responseText);
      throw new Error("Invalid response from persona suggestion");
    }

    // Enrich suggestions with full persona data
    const enrichedSuggestions = suggestions.map((suggestion) => {
        const persona = personas.find((p) => p.slug === suggestion.personaSlug);
        if (!persona) {
          throw new Error(`Persona not found: ${suggestion.personaSlug}`);
        }
        return {
          personaId: persona.id,
          personaName: persona.name,
          personaSlug: persona.slug,
          traits: persona.voiceTraits,
          signaturePatterns: persona.signaturePatterns,
          reasoning: suggestion.reasoning,
          suggestedPercentage: suggestion.suggestedPercentage,
          confidence: normalizePersonaSuggestionConfidence(suggestion.confidence),
        };
      });

    return enrichedSuggestions;
  } catch (error) {
    console.error("[suggestWriterPersonas] Error:", error);
    throw error;
  }
}

/**
 * Saves a blended writer persona configuration to the book setup
 * Validates that personas exist and percentages sum to 100%
 */
export async function saveWriterPersonaBlend(
  slug: string,
  blend: Array<{
    personaId: string;
    personaName: string;
    personaSlug: string;
    percentInfluence: number;
  }>
): Promise<void> {
  "use server";

  try {
    // Validation: Check that blend is valid
    if (!blend || blend.length === 0) {
      throw new Error("At least one persona must be selected");
    }

    if (blend.length > 5) {
      throw new Error("Maximum 5 personas allowed per blend");
    }

    // Validation: Percentages must sum to 100
    const totalPercent = blend.reduce((sum, p) => sum + p.percentInfluence, 0);
    if (Math.abs(totalPercent - 100) > 0.01) {
      // Allow 0.01% floating point tolerance
      throw new Error(`Persona percentages must sum to 100% (current: ${totalPercent}%)`);
    }

    // Validation: Each percentage must be 0-100
    for (const persona of blend) {
      if (persona.percentInfluence < 0 || persona.percentInfluence > 100) {
        throw new Error(`Invalid percentage for ${persona.personaName}: ${persona.percentInfluence}%`);
      }
    }

    // Validation: Verify all personas exist in library
    const allPersonas = await getActiveWriterPersonas();
    for (const blendItem of blend) {
      const exists = allPersonas.some((p) => p.id === blendItem.personaId);
      if (!exists) {
        throw new Error(`Persona not found: ${blendItem.personaName}`);
      }
    }

    // Get current setup
    const workspace = await getBookSetupWorkspace(slug);

    // Create enriched blend with additional persona data
    const enrichedBlend: WriterPersonaBlend[] = blend.map((item) => {
      const persona = allPersonas.find((p) => p.id === item.personaId);
      if (!persona) {
        throw new Error(`Persona not found: ${item.personaId}`);
      }
      return {
        personaId: item.personaId,
        personaName: item.personaName,
        personaSlug: item.personaSlug,
        percentInfluence: item.percentInfluence,
        traits: persona.voiceTraits,
        signaturePatterns: persona.signaturePatterns,
      };
    });

    // Compute blend label (e.g., "Andy (60%) + Drucker (25%) + Jobs (15%)")
    const blendLabel = enrichedBlend
      .filter((p) => p.percentInfluence > 0)
      .map((p) => `${p.personaName} (${p.percentInfluence}%)`)
      .join(" + ");

    // Save to workflow
    await saveBookSetupWorkflow(slug, {
      ...workspace.profile,
      writerPersonaBlend: enrichedBlend,
      writerPersona: blendLabel,
      writerPersonaId: null, // Clear single persona when using blend
    });

    revalidatePath(`/books/${slug}`);
    revalidatePath(`/books/${slug}/promise`);
  } catch (error) {
    console.error("[saveWriterPersonaBlend] Error:", error);
    throw error;
  }
}
