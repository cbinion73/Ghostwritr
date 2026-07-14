import { z } from "zod";

export const BookPromiseReportSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  conceptStatement: z.string(),
  corePromise: z.string(),
  targetAudience: z.string(),
  marketOpportunity: z.string(),
  authorCredibility: z.string(),
  executiveSummary: z.string(),
  recommendation: z.enum(["GO", "NO_GO", "CONDITIONAL_GO"]),
  rationale: z.string(),
  nextSteps: z.array(z.string()).default([]),
  documentMarkdown: z.string(),
  // OpenAI strict structured-output mode requires every property in every
  // nested object schema to appear in `required` — .optional() drops a key
  // from `required` and the API rejects the schema outright ("'required' is
  // required to be supplied and to be an array including every key in
  // properties"). .nullable() keeps the key required while still letting
  // the model return null when there's nothing to report.
  metadata: z.object({
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    model: z.string().nullable(),
    grounding: z.object({
      previousPhases: z.array(z.string()).nullable(),
      kbSources: z.array(z.string()).nullable(),
      audienceSignals: z.array(z.string()).nullable(),
    }).nullable(),
    tokenUsage: z.object({
      inputTokens: z.number().nullable(),
      outputTokens: z.number().nullable(),
      totalTokens: z.number().nullable(),
      cacheReadInputTokens: z.number().nullable(),
      cacheWriteInputTokens: z.number().nullable(),
      reasoningTokens: z.number().nullable(),
    }).nullable(),
  }).nullable(),
});

export function normalizeMarketDecision(
  value: unknown,
  fallback: "GO" | "NO_GO" | "CONDITIONAL_GO",
): "GO" | "NO_GO" | "CONDITIONAL_GO" {
  if (value === "GO" || value === "NO_GO" || value === "CONDITIONAL_GO") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (
      normalized === "GO" ||
      normalized === "NO_GO" ||
      normalized === "CONDITIONAL_GO"
    ) {
      return normalized;
    }
  }

  return fallback;
}
