/**
 * LLM pricing table — USD per 1M tokens.
 * Keys matched against the lowercase model name (longest match first).
 */

export interface ModelPricing {
  inputPer1M:  number;
  outputPer1M: number;
  /** Human-readable label, e.g. "Claude Sonnet 4.6" */
  label:       string;
  provider:    "anthropic" | "openai" | "google" | "other";
}

const PRICING_TABLE: { match: string; pricing: ModelPricing }[] = [
  // ── Anthropic ─────────────────────────────────────────────────────────
  { match: "claude-opus-4",       pricing: { inputPer1M: 15.00, outputPer1M: 75.00, label: "Claude Opus 4",       provider: "anthropic" } },
  { match: "claude-opus",         pricing: { inputPer1M: 15.00, outputPer1M: 75.00, label: "Claude Opus",         provider: "anthropic" } },
  { match: "claude-sonnet-4-5",   pricing: { inputPer1M:  3.00, outputPer1M: 15.00, label: "Claude Sonnet 4.5",   provider: "anthropic" } },
  { match: "claude-3-7-sonnet",   pricing: { inputPer1M:  3.00, outputPer1M: 15.00, label: "Claude 3.7 Sonnet",   provider: "anthropic" } },
  { match: "claude-3-5-sonnet",   pricing: { inputPer1M:  3.00, outputPer1M: 15.00, label: "Claude 3.5 Sonnet",   provider: "anthropic" } },
  { match: "claude-sonnet-4-6",   pricing: { inputPer1M:  3.00, outputPer1M: 15.00, label: "Claude Sonnet 4.6",   provider: "anthropic" } },
  { match: "claude-sonnet",       pricing: { inputPer1M:  3.00, outputPer1M: 15.00, label: "Claude Sonnet",       provider: "anthropic" } },
  { match: "claude-3-5-haiku",    pricing: { inputPer1M:  0.80, outputPer1M:  4.00, label: "Claude 3.5 Haiku",    provider: "anthropic" } },
  { match: "claude-haiku",        pricing: { inputPer1M:  0.80, outputPer1M:  4.00, label: "Claude Haiku",        provider: "anthropic" } },
  // ── OpenAI ────────────────────────────────────────────────────────────
  { match: "gpt-4o-mini",         pricing: { inputPer1M:  0.15, outputPer1M:  0.60, label: "GPT-4o mini",         provider: "openai" } },
  { match: "gpt-5.4-mini",        pricing: { inputPer1M:  0.15, outputPer1M:  0.60, label: "GPT-5.4 mini",        provider: "openai" } },
  { match: "gpt-4o",              pricing: { inputPer1M:  2.50, outputPer1M: 10.00, label: "GPT-4o",              provider: "openai" } },
  { match: "gpt-5.4",             pricing: { inputPer1M:  2.50, outputPer1M: 10.00, label: "GPT-5.4",             provider: "openai" } },
  { match: "gpt-5",               pricing: { inputPer1M: 10.00, outputPer1M: 40.00, label: "GPT-5",               provider: "openai" } },
  { match: "o3-mini",             pricing: { inputPer1M:  1.10, outputPer1M:  4.40, label: "o3-mini",             provider: "openai" } },
  { match: "o3",                  pricing: { inputPer1M: 10.00, outputPer1M: 40.00, label: "o3",                  provider: "openai" } },
  { match: "o1-mini",             pricing: { inputPer1M:  3.00, outputPer1M: 12.00, label: "o1-mini",             provider: "openai" } },
  { match: "o1",                  pricing: { inputPer1M: 15.00, outputPer1M: 60.00, label: "o1",                  provider: "openai" } },
  { match: "gpt-4-turbo",         pricing: { inputPer1M: 10.00, outputPer1M: 30.00, label: "GPT-4 Turbo",         provider: "openai" } },
  { match: "gpt-4",               pricing: { inputPer1M: 30.00, outputPer1M: 60.00, label: "GPT-4",               provider: "openai" } },
  { match: "gpt-3.5-turbo",       pricing: { inputPer1M:  0.50, outputPer1M:  1.50, label: "GPT-3.5 Turbo",       provider: "openai" } },
  // ── Google ────────────────────────────────────────────────────────────
  { match: "gemini-2.5-pro",      pricing: { inputPer1M:  1.25, outputPer1M: 10.00, label: "Gemini 2.5 Pro",      provider: "google" } },
  { match: "gemini-2.5-flash",    pricing: { inputPer1M:  0.15, outputPer1M:  0.60, label: "Gemini 2.5 Flash",    provider: "google" } },
  { match: "gemini-2.0-flash",    pricing: { inputPer1M:  0.10, outputPer1M:  0.40, label: "Gemini 2.0 Flash",    provider: "google" } },
  { match: "gemini",              pricing: { inputPer1M:  0.15, outputPer1M:  0.60, label: "Gemini",              provider: "google" } },
];

export function getModelPricing(modelSpec: string): ModelPricing {
  const key = modelSpec.toLowerCase();
  const entry = PRICING_TABLE.find((p) => key.includes(p.match));
  return entry?.pricing ?? {
    inputPer1M:  0,
    outputPer1M: 0,
    label:       modelSpec,
    provider:    "other",
  };
}

export function estimateCostUsd(
  modelSpec: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = getModelPricing(modelSpec);
  return (promptTokens / 1_000_000) * p.inputPer1M + (completionTokens / 1_000_000) * p.outputPer1M;
}
