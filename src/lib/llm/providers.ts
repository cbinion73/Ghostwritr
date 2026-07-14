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
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";
import { getLLMCallContext } from "./call-context";
import { logLLMCall } from "./call-log";
import { getProviderMaxRetries } from "../retry-policy";

export type ProviderName = "anthropic" | "openai" | "google";

export type ModelOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  useBatch?: boolean; // Queue for async batch API (Anthropic) — 50% cost savings, higher latency
  /** Stage role for cost logging, e.g. "chapter-draft:author". Threaded by getModelForRole. */
  stageRole?: string;
};

export type ModelSpec = {
  provider: ProviderName;
  model: string;
};

function openAISupportsCustomTemperature(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return !normalized.startsWith("gpt-5");
}

// Confirmed in production 2026-07-08: claude-opus-4-8 rejects `temperature`
// outright ("`temperature` is deprecated for this model", 400
// invalid_request_error) on every call, which silently exhausted all
// retries and fell through to whatever fallback the caller had (or, for
// final-editor:polish with no fallback, just failed the whole editorial
// loop). Same shape as openAISupportsCustomTemperature above -- only pass
// temperature to Anthropic models confirmed to still accept it.
function anthropicSupportsCustomTemperature(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized !== "claude-opus-4-8";
}

/**
 * Constructor-level callback that auto-logs every LLM call to LLMCallLog —
 * but ONLY when an ambient LLM call context is present (i.e. inside a
 * workflow wrapped by runWithLLMContext). API routes that log manually set
 * no context and are therefore never double-logged.
 *
 * Constructor callbacks survive .withStructuredOutput() and .bind().
 */
class CostLoggingHandler extends BaseCallbackHandler {
  name = "ghostwritr-cost-logging";
  private startTimes = new Map<string, number>();

  constructor(
    private readonly provider: ProviderName,
    private readonly model: string,
    private readonly stageRole?: string,
  ) {
    super();
  }

  handleLLMStart(_llm: unknown, _prompts: string[], runId: string): void {
    this.startTimes.set(runId, Date.now());
  }

  handleChatModelStart(_llm: unknown, _messages: unknown, runId: string): void {
    this.startTimes.set(runId, Date.now());
  }

  handleLLMEnd(output: LLMResult, runId: string): void {
    const startedAt = this.startTimes.get(runId);
    this.startTimes.delete(runId);
    const context = getLLMCallContext();
    if (!context) return;

    try {
      const generation = output.generations?.[0]?.[0] as
        | { message?: { usage_metadata?: Record<string, unknown> } }
        | undefined;
      const usage = generation?.message?.usage_metadata as
        | {
            input_tokens?: number;
            output_tokens?: number;
            input_token_details?: { cache_creation?: number; cache_read?: number };
          }
        | undefined;
      const tokenUsage = (output.llmOutput?.tokenUsage ?? {}) as {
        promptTokens?: number;
        completionTokens?: number;
      };

      const promptTokens = usage?.input_tokens ?? tokenUsage.promptTokens ?? 0;
      const completionTokens = usage?.output_tokens ?? tokenUsage.completionTokens ?? 0;
      if (promptTokens === 0 && completionTokens === 0) {
        // Silent no-op cost logging for a real call (usage extraction failed)
        // is worse than a noisy console line — this is the exact shape of a
        // 2026-07-07 investigation where chapter-draft:author/revise calls
        // succeeded (real content saved) but never produced a cost row.
        console.warn(
          `[cost-logging] stageRole=${this.stageRole ?? "unknown"} model=${this.model} produced no extractable token usage — call was not logged. generation message present: ${Boolean(generation?.message)}, usage_metadata present: ${Boolean(generation?.message?.usage_metadata)}, llmOutput keys: ${Object.keys(output.llmOutput ?? {}).join(",") || "(none)"}`,
        );
        return;
      }

      void logLLMCall({
        bookId: context.bookId,
        bookSlug: context.bookSlug,
        bookTitle: context.bookTitle,
        stageKey: context.stageKey,
        workflowRunId: context.workflowRunId,
        chapterKey: context.chapterKey,
        stageRole: this.stageRole ?? "unknown",
        operation: "ambient-provider-callback",
        provider: this.provider,
        model: this.model,
        generationMode: "unknown",
        status: "SUCCEEDED",
        promptTokens,
        completionTokens,
        cacheCreationTokens: usage?.input_token_details?.cache_creation ?? 0,
        cacheReadTokens: usage?.input_token_details?.cache_read ?? 0,
        durationMs: startedAt ? Date.now() - startedAt : 0,
      }).catch((err) => {
        console.error(`[cost-logging] logLLMCall DB write failed for stageRole=${this.stageRole ?? "unknown"}:`, err);
      });
    } catch (err) {
      // Logging must never break a workflow, but a silent catch here is
      // exactly how the 2026-07-07 chapter-draft logging gap went
      // undetected — surface it instead of swallowing it.
      console.error(`[cost-logging] handleLLMEnd threw for stageRole=${this.stageRole ?? "unknown"}:`, err);
    }
  }

  handleLLMError(err: unknown, runId: string): void {
    this.startTimes.delete(runId);
    console.error(`[cost-logging] handleLLMError for stageRole=${this.stageRole ?? "unknown"}:`, err);
  }
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
  // All provider SDK retries go through the central policy so workflow-level
  // attempts cannot silently multiply by SDK retry defaults.
  const maxRetries = getProviderMaxRetries(options.maxRetries);
  const temperature = options.temperature;
  const callbacks = [new CostLoggingHandler(provider, model, options.stageRole)];

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
      ...(anthropicSupportsCustomTemperature(model) ? { temperature: temperature ?? 0.4 } : {}),
      maxTokens: options.maxOutputTokens ?? 8192,
      maxRetries,
      callbacks,
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
      callbacks,
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
      callbacks,
    }) as unknown as BaseChatModel;
  }

  return null;
}

// ── Prompt caching ───────────────────────────────────────────────────────────

export type CacheTtl = "5m" | "1h";

type CachedTextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl?: CacheTtl };
};

/**
 * Build system-message content blocks with an Anthropic prompt-cache
 * breakpoint after the shared context. Use as:
 *
 *   new SystemMessage({ content: buildCachedSystemBlocks(template, sharedJson, "1h") })
 *
 * The static template and the run-stable shared context become the cached
 * prefix (billed 1.25x on first write, 0.10x on every subsequent read within
 * the TTL); the varying per-item content stays in the HumanMessage.
 *
 * Anthropic ignores cache_control below the model's minimum cacheable prefix
 * (2,048 tokens for Sonnet, 4,096 for Opus/Haiku) — harmless, just uncached.
 * OpenAI/Google models ignore the field entirely.
 */
export function buildCachedSystemBlocks(
  staticPrompt: string,
  sharedContext?: string,
  ttl: CacheTtl = "5m",
): CachedTextBlock[] {
  const cacheControl: CachedTextBlock["cache_control"] =
    ttl === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" };

  if (sharedContext && sharedContext.trim().length > 0) {
    return [
      { type: "text", text: staticPrompt },
      { type: "text", text: sharedContext, cache_control: cacheControl },
    ];
  }
  return [{ type: "text", text: staticPrompt, cache_control: cacheControl }];
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
