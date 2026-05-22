/**
 * Provider abstraction for GHOSTWRITR LLM routing with batch API support.
 *
 * Wraps @langchain/anthropic, @langchain/openai, and @langchain/google-genai
 * behind a single `getModel(spec)` call so workflows never hard-code a provider.
 *
 * A spec is a string of the form "<provider>:<model-id>", e.g.:
 *   - "anthropic:claude-sonnet-4-6"
 *   - "anthropic:claude-opus-4-6"
 *   - "openai:gpt-5"
 *   - "google:gemini-2.5-pro"
 *
 * For cost-optimized workflows, call getAnthropicBatchClient() to use Anthropic's
 * Batch API (50% discount, async) for stages like:
 *   - research:questions, research:extract, research:verify, research:adjudicate
 *   - external-stories:extract, external-stories:enrich
 *
 * If the required API key is missing for the requested provider, returns null
 * so callers can fall back cleanly (matching existing workflow behavior).
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type ProviderName = "anthropic" | "openai" | "google";

export type ModelOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  useBatch?: boolean; // Queue for async batch API (Anthropic) — 50% cost savings, higher latency
};

export type ModelSpec = {
  provider: ProviderName;
  model: string;
};

function openAISupportsCustomTemperature(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return !normalized.startsWith("gpt-5");
}

export function parseModelSpec(spec: string): ModelSpec {
  const [providerRaw, ...rest] = spec.split(":");
  const provider = providerRaw?.trim().toLowerCase() as ProviderName;
  const model = rest.join(":").trim();

  if (provider !== "anthropic" && provider !== "openai" && provider !== "google") {
    throw new Error(
      `Invalid LLM spec "${spec}". Expected "<provider>:<model-id>" where provider is anthropic, openai, or google.`,
    );
  }

  if (!model) {
    throw new Error(`LLM spec "${spec}" is missing a model id after the provider.`);
  }

  return { provider, model };
}

export function hasApiKeyFor(provider: ProviderName): boolean {
  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    return Boolean(key && key !== "your-key-here");
  }

  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    return Boolean(key && key !== "your-key-here");
  }

  if (provider === "google") {
    const key = process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    return Boolean(key && key !== "your-key-here");
  }

  return false;
}

/**
 * Build a chat model for the given spec. Returns null if the API key is
 * missing so callers can fall back gracefully.
 *
 * Uses dynamic require() so that @langchain/anthropic and @langchain/google-genai
 * are only loaded when actually needed — the repo can still type-check and run
 * the OpenAI-only workflows if those packages are not yet installed.
 */
export async function getModel(
  spec: string,
  options: ModelOptions = {},
): Promise<BaseChatModel | null> {
  const { provider, model } = parseModelSpec(spec);

  if (!hasApiKeyFor(provider)) {
    return null;
  }

  const timeout = options.timeoutMs ?? 60000;
  const maxRetries = options.maxRetries ?? 0;
  const temperature = options.temperature;

  if (provider === "anthropic") {
    const mod = await import("@langchain/anthropic").catch(() => null);
    if (!mod) {
      throw new Error(
        `Requested Anthropic model "${model}" but @langchain/anthropic is not installed. Run: npm install @langchain/anthropic`,
      );
    }
    const { ChatAnthropic } = mod as typeof import("@langchain/anthropic");
    return new ChatAnthropic({
      model,
      temperature: temperature ?? 0.4,
      maxTokens: options.maxOutputTokens ?? 8192,
      maxRetries,
      // Anthropic SDK uses seconds for some fields and ms for others; LC normalizes.
      // timeout is on the underlying HTTP client.
      clientOptions: { timeout },
    }) as unknown as BaseChatModel;
  }

  if (provider === "openai") {
    const { ChatOpenAI } = await import("@langchain/openai");
    // Preserve existing OpenAI knob shape so we can keep reasoning effort.
    const init: Record<string, unknown> = {
      model,
      timeout,
      maxRetries,
    };
    if (openAISupportsCustomTemperature(model)) {
      init.temperature = temperature ?? 0.2;
    }
    if (options.reasoningEffort) {
      init.reasoning = { effort: options.reasoningEffort };
    }
    if (options.maxOutputTokens) {
      init.maxTokens = options.maxOutputTokens;
    }
    return new ChatOpenAI(init as ConstructorParameters<typeof ChatOpenAI>[0]) as unknown as BaseChatModel;
  }

  if (provider === "google") {
    const mod = await import("@langchain/google-genai").catch(() => null);
    if (!mod) {
      throw new Error(
        `Requested Google model "${model}" but @langchain/google-genai is not installed. Run: npm install @langchain/google-genai`,
      );
    }
    const { ChatGoogleGenerativeAI } = mod as typeof import("@langchain/google-genai");
    return new ChatGoogleGenerativeAI({
      model,
      temperature: temperature ?? 0.4,
      maxOutputTokens: options.maxOutputTokens ?? 8192,
      maxRetries,
    }) as unknown as BaseChatModel;
  }

  return null;
}

/**
 * Get a raw Anthropic SDK client for batch API requests (50% cost savings).
 * Batch API is async — useful for non-real-time workflows like research discovery
 * and external story extraction that can run overnight.
 *
 * Returns null if ANTHROPIC_API_KEY is missing.
 */
export async function getAnthropicBatchClient(): Promise<unknown | null> {
  if (!hasApiKeyFor("anthropic")) {
    return null;
  }

  try {
    const AnthropicModule = await import("@anthropic-ai/sdk");
    const Anthropic = AnthropicModule.default || AnthropicModule;
    return new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  } catch (err) {
    console.error("Failed to load Anthropic SDK for batch client:", err);
    return null;
  }
}
