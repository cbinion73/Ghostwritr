import { readFileSync } from "fs";
import { resolve } from "path";

import { getModelForRole } from "../../llm/routing";

export type PromiseGenerationModelOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
};

export type StructuredPromiseGenerationModelOptions = PromiseGenerationModelOptions & {
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
};

/**
 * Ensure .env file is loaded into process.env
 * Workaround for Next.js 16 Turbopack not always loading .env in server actions
 */
export function ensurePromiseEnvLoaded(): void {
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

export async function getStructuredPromiseModel(
  overrides: StructuredPromiseGenerationModelOptions = {},
) {
  ensurePromiseEnvLoaded();
  return getModelForRole(
    "promise:structured",
    {
      temperature: overrides.temperature ?? 0.15,
      maxOutputTokens: overrides.maxOutputTokens ?? 4000,
      timeoutMs: overrides.timeoutMs ?? 90000,
      maxRetries: overrides.maxRetries ?? 1,
      reasoningEffort: overrides.reasoningEffort ?? "medium",
    },
    "promise:author",
  );
}

export async function getStructuredAudienceModel(
  overrides: StructuredPromiseGenerationModelOptions = {},
) {
  ensurePromiseEnvLoaded();
  return getModelForRole(
    "audience:structured",
    {
      temperature: overrides.temperature ?? 0.15,
      maxOutputTokens: overrides.maxOutputTokens ?? 4000,
      timeoutMs: overrides.timeoutMs ?? 90000,
      maxRetries: overrides.maxRetries ?? 1,
      reasoningEffort: overrides.reasoningEffort ?? "medium",
    },
    "audience:author",
  );
}

export async function getBookPitchModel(
  overrides: PromiseGenerationModelOptions = {},
) {
  ensurePromiseEnvLoaded();
  // Downgraded from "final-editor:polish" (Opus, $0.60/1K) to "promise:author" (Sonnet, $0.018/1K)
  // Book Pitch is synthesis + formatting of pre-synthesized work, not complex creation
  // Saves ~$9.31 per book; Opus reserved for chapter-level draft editing
  return getModelForRole("promise:author", {
    temperature: overrides.temperature ?? 0.25,
    maxOutputTokens: overrides.maxOutputTokens ?? 8000,
    timeoutMs: overrides.timeoutMs ?? 120000,
    maxRetries: overrides.maxRetries ?? 2,
  });
}
