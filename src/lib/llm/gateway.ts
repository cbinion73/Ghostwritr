import crypto from "node:crypto";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";

import {
  logLLMCall,
  type LLMCallInput,
  type LLMCallStatus,
  type LLMGenerationMode,
} from "./call-log";
import {
  DEFAULT_LLM_BOOK_CONFIRMATION_USD,
  DEFAULT_LLM_BOOK_HARD_STOP_USD,
  DEFAULT_LLM_BOOK_WARNING_USD,
  getLLMBudgetStateForBook,
} from "./budgets";
import { estimateCostUsd } from "./pricing";
import {
  getModel,
  parseModelSpec,
  type ModelOptions,
  type ModelSpec,
} from "./providers";
import { getProviderMaxRetries } from "../retry-policy";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;
const DEFAULT_REQUEST_BUDGET_USD = 5;
const APPROX_CHARS_PER_TOKEN = 4;

export type LLMGatewayAttribution = {
  bookId?: string;
  bookSlug?: string;
  bookTitle?: string;
  stageKey?: string;
  workflowRunId?: string;
  chapterKey?: string | null;
  operation: string;
  stageRole: string;
  requestId?: string;
  providerRequestId?: string | null;
  attempt?: number;
  generationMode?: LLMGenerationMode;
  searchCostUsd?: number;
};

export type LLMGatewayPolicy = {
  timeoutMs?: number;
  maxRetries?: number;
  maxOutputTokens?: number;
  reasoningEffort?: ModelOptions["reasoningEffort"];
  requestBudgetUsd?: number;
  bookWarningUsd?: number;
  bookConfirmationUsd?: number;
  bookHardStopUsd?: number;
  cacheModel?: boolean;
};

export type LLMGatewayAcquireInput = {
  modelSpec: string;
  fallbackModelSpec?: string;
  attribution: LLMGatewayAttribution;
  options?: ModelOptions;
  policy?: LLMGatewayPolicy;
};

export type LLMGatewayCall = {
  requestId: string;
  attribution: LLMGatewayAttribution & { requestId: string };
  provider: ModelSpec["provider"];
  modelName: string;
  modelSpec: string;
  model: BaseChatModel;
  policy: Required<Pick<LLMGatewayPolicy, "timeoutMs" | "maxRetries" | "maxOutputTokens" | "requestBudgetUsd" | "bookWarningUsd" | "bookConfirmationUsd" | "bookHardStopUsd" | "cacheModel">> & {
    reasoningEffort?: ModelOptions["reasoningEffort"];
  };
  estimateCost(input: { promptChars?: number; promptTokens?: number; completionTokens?: number }): number;
  recordUsage(input: {
    promptTokens: number;
    completionTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    reasoningInputTokens?: number;
    reasoningOutputTokens?: number;
    durationMs: number;
    providerRequestId?: string | null;
    attempt?: number;
    generationMode?: LLMGenerationMode;
    searchCostUsd?: number;
  }): Promise<void>;
  recordFailure(input: {
    durationMs: number;
    error: unknown;
    promptTokens?: number;
    completionTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    reasoningInputTokens?: number;
    reasoningOutputTokens?: number;
    providerRequestId?: string | null;
    attempt?: number;
    generationMode?: LLMGenerationMode;
    searchCostUsd?: number;
  }): Promise<void>;
  recordCancellation(input: {
    durationMs: number;
    reason?: string;
    promptTokens?: number;
    completionTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    reasoningInputTokens?: number;
    reasoningOutputTokens?: number;
    providerRequestId?: string | null;
    attempt?: number;
    generationMode?: LLMGenerationMode;
    searchCostUsd?: number;
  }): Promise<void>;
};

export class LLMGatewayError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "missing_attribution"
      | "missing_model"
      | "budget_exceeded"
      | "budget_confirmation_required"
      | "validation_failed",
  ) {
    super(message);
    this.name = "LLMGatewayError";
  }
}

const modelCache = new Map<string, BaseChatModel>();

export function createLLMRequestId() {
  return `llm_${crypto.randomUUID()}`;
}

export function getLLMGatewayPolicy(input: LLMGatewayPolicy = {}) {
  const requestedMaxRetries =
    input.maxRetries ?? Number(process.env.LLM_GATEWAY_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
  return {
    timeoutMs: input.timeoutMs ?? Number(process.env.LLM_GATEWAY_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    maxRetries: getProviderMaxRetries(requestedMaxRetries),
    maxOutputTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    reasoningEffort: input.reasoningEffort,
    requestBudgetUsd: input.requestBudgetUsd ?? Number(process.env.LLM_GATEWAY_REQUEST_BUDGET_USD ?? DEFAULT_REQUEST_BUDGET_USD),
    bookWarningUsd: input.bookWarningUsd ?? Number(process.env.LLM_BOOK_WARNING_USD ?? DEFAULT_LLM_BOOK_WARNING_USD),
    bookConfirmationUsd: input.bookConfirmationUsd ?? Number(process.env.LLM_BOOK_CONFIRMATION_USD ?? DEFAULT_LLM_BOOK_CONFIRMATION_USD),
    bookHardStopUsd: input.bookHardStopUsd ?? Number(process.env.LLM_BOOK_HARD_STOP_USD ?? DEFAULT_LLM_BOOK_HARD_STOP_USD),
    cacheModel: input.cacheModel ?? true,
  };
}

export function estimatePromptTokensFromChars(chars: number) {
  return Math.ceil(Math.max(0, chars) / APPROX_CHARS_PER_TOKEN);
}

export function estimateGatewayCost(input: {
  model: string;
  promptChars?: number;
  promptTokens?: number;
  completionTokens?: number;
}) {
  const promptTokens = input.promptTokens ?? estimatePromptTokensFromChars(input.promptChars ?? 0);
  return estimateCostUsd(input.model, promptTokens, input.completionTokens ?? 0);
}

export async function acquireLLMGatewayCall(input: LLMGatewayAcquireInput): Promise<LLMGatewayCall | null> {
  assertAttribution(input.attribution);

  const requestId = input.attribution.requestId ?? createLLMRequestId();
  const policy = getLLMGatewayPolicy({
    ...input.policy,
    timeoutMs: input.options?.timeoutMs ?? input.policy?.timeoutMs,
    maxRetries: input.options?.maxRetries ?? input.policy?.maxRetries,
    maxOutputTokens: input.options?.maxOutputTokens ?? input.policy?.maxOutputTokens,
    reasoningEffort: input.options?.reasoningEffort ?? input.policy?.reasoningEffort,
  });
  const primarySpec = parseModelSpec(input.modelSpec);
  const projectedRequestCostUsd = estimateGatewayCost({
    model: primarySpec.model,
    promptTokens: 0,
    completionTokens: policy.maxOutputTokens,
  });

  await assertBookBudget(input.attribution.bookId, {
    projectedRequestCostUsd,
    warningUsd: policy.bookWarningUsd,
    confirmationUsd: policy.bookConfirmationUsd,
    hardStopUsd: policy.bookHardStopUsd,
  });

  const resolvedOptions: ModelOptions = {
    ...input.options,
    timeoutMs: policy.timeoutMs,
    maxRetries: policy.maxRetries,
    maxOutputTokens: policy.maxOutputTokens,
    reasoningEffort: policy.reasoningEffort,
    stageRole: input.options?.stageRole ?? input.attribution.stageRole,
  };

  const cacheKey = makeModelCacheKey(input.modelSpec, resolvedOptions);
  let model = policy.cacheModel ? modelCache.get(cacheKey) ?? null : null;
  let activeModelSpec = input.modelSpec;
  let activeParsedSpec = primarySpec;

  if (!model) {
    model = await getModel(input.modelSpec, resolvedOptions);
    if (model && policy.cacheModel) modelCache.set(cacheKey, model);
  }

  if (!model && input.fallbackModelSpec) {
    const fallbackOptions = { ...resolvedOptions, stageRole: input.attribution.stageRole };
    const fallbackCacheKey = makeModelCacheKey(input.fallbackModelSpec, fallbackOptions);
    activeModelSpec = input.fallbackModelSpec;
    activeParsedSpec = parseModelSpec(input.fallbackModelSpec);
    model = policy.cacheModel ? modelCache.get(fallbackCacheKey) ?? null : null;
    if (!model) {
      model = await getModel(input.fallbackModelSpec, fallbackOptions);
      if (model && policy.cacheModel) modelCache.set(fallbackCacheKey, model);
    }
  }

  if (!model) return null;

  const attribution = { ...input.attribution, requestId };

  return {
    requestId,
    attribution,
    provider: activeParsedSpec.provider,
    modelName: activeParsedSpec.model,
    modelSpec: activeModelSpec,
    model,
    policy,
    estimateCost: (estimateInput) => estimateGatewayCost({
      model: activeParsedSpec.model,
      ...estimateInput,
    }),
    recordUsage: (usage) => recordGatewayUsage({
      attribution,
      provider: activeParsedSpec.provider,
      model: activeParsedSpec.model,
      status: "SUCCEEDED",
      usage,
    }),
    recordFailure: (failure) => recordGatewayUsage({
      attribution,
      provider: activeParsedSpec.provider,
      model: activeParsedSpec.model,
      status: "FAILED",
      usage: {
        promptTokens: failure.promptTokens ?? 0,
        completionTokens: failure.completionTokens ?? 0,
        cacheCreationTokens: failure.cacheCreationTokens,
        cacheReadTokens: failure.cacheReadTokens,
        reasoningInputTokens: failure.reasoningInputTokens,
        reasoningOutputTokens: failure.reasoningOutputTokens,
        durationMs: failure.durationMs,
        providerRequestId: failure.providerRequestId,
        attempt: failure.attempt,
        generationMode: failure.generationMode,
        searchCostUsd: failure.searchCostUsd,
        errorCode: errorCodeFromUnknown(failure.error),
        errorMessage: errorMessageFromUnknown(failure.error),
      },
    }),
    recordCancellation: (cancellation) => recordGatewayUsage({
      attribution,
      provider: activeParsedSpec.provider,
      model: activeParsedSpec.model,
      status: "CANCELED",
      usage: {
        promptTokens: cancellation.promptTokens ?? 0,
        completionTokens: cancellation.completionTokens ?? 0,
        cacheCreationTokens: cancellation.cacheCreationTokens,
        cacheReadTokens: cancellation.cacheReadTokens,
        reasoningInputTokens: cancellation.reasoningInputTokens,
        reasoningOutputTokens: cancellation.reasoningOutputTokens,
        durationMs: cancellation.durationMs,
        providerRequestId: cancellation.providerRequestId,
        attempt: cancellation.attempt,
        generationMode: cancellation.generationMode,
        searchCostUsd: cancellation.searchCostUsd,
        errorCode: "canceled",
        errorMessage: cancellation.reason ?? "LLM call canceled.",
      },
    }),
  };
}

export function assertGatewayRequestBudget(input: {
  estimatedCostUsd: number;
  requestBudgetUsd?: number;
}) {
  const budget = input.requestBudgetUsd ?? DEFAULT_REQUEST_BUDGET_USD;
  if (input.estimatedCostUsd > budget) {
    throw new LLMGatewayError(
      `Estimated LLM request cost $${input.estimatedCostUsd.toFixed(4)} exceeds request budget $${budget.toFixed(2)}.`,
      "budget_exceeded",
    );
  }
}

export function validateStructuredOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new LLMGatewayError(result.error.message, "validation_failed");
  }
  return result.data;
}

export function resetLLMGatewayStateForTests() {
  modelCache.clear();
}

async function assertBookBudget(
  bookId: string | undefined,
  input: {
    projectedRequestCostUsd: number;
    warningUsd: number;
    confirmationUsd: number;
    hardStopUsd: number;
  },
) {
  if (!bookId || input.hardStopUsd <= 0) return;
  const budget = await getLLMBudgetStateForBook(bookId, input.projectedRequestCostUsd, {
    warningUsd: input.warningUsd,
    confirmationUsd: input.confirmationUsd,
    hardStopUsd: input.hardStopUsd,
  });
  if (budget.hardStopReached) {
    throw new LLMGatewayError(
      `Projected book LLM spend $${budget.projectedSpendUsd.toFixed(2)} would exceed the hard stop budget $${budget.hardStopUsd.toFixed(2)}.`,
      "budget_exceeded",
    );
  }
  if (budget.confirmationRequired) {
    throw new LLMGatewayError(
      `Projected book LLM spend $${budget.projectedSpendUsd.toFixed(2)} crosses the $${budget.confirmationUsd.toFixed(2)} confirmation gate. Confirm this book's LLM budget to continue generation.`,
      "budget_confirmation_required",
    );
  }
}

function assertAttribution(attribution: LLMGatewayAttribution) {
  if (!attribution.stageRole || !attribution.operation) {
    throw new LLMGatewayError("LLM gateway calls require stageRole and operation attribution.", "missing_attribution");
  }
}

async function recordGatewayUsage(input: {
  attribution: LLMGatewayAttribution & { requestId: string };
  provider: string;
  model: string;
  status: LLMCallStatus;
  usage: {
    promptTokens: number;
    completionTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    reasoningInputTokens?: number;
    reasoningOutputTokens?: number;
    durationMs: number;
    providerRequestId?: string | null;
    attempt?: number;
    generationMode?: LLMGenerationMode;
    searchCostUsd?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
  };
}) {
  if (!input.attribution.bookId) return;

  const logInput: LLMCallInput = {
    requestId: input.attribution.requestId,
    providerRequestId: input.usage.providerRequestId ?? input.attribution.providerRequestId,
    bookId: input.attribution.bookId,
    bookSlug: input.attribution.bookSlug,
    bookTitle: input.attribution.bookTitle,
    stageKey: input.attribution.stageKey,
    workflowRunId: input.attribution.workflowRunId,
    chapterKey: input.attribution.chapterKey,
    stageRole: input.attribution.stageRole,
    operation: input.attribution.operation,
    attempt: input.usage.attempt ?? input.attribution.attempt,
    provider: input.provider,
    model: input.model,
    generationMode: input.usage.generationMode ?? input.attribution.generationMode,
    status: input.status,
    errorCode: input.usage.errorCode,
    errorMessage: input.usage.errorMessage,
    promptTokens: input.usage.promptTokens,
    completionTokens: input.usage.completionTokens,
    cacheCreationTokens: input.usage.cacheCreationTokens,
    cacheReadTokens: input.usage.cacheReadTokens,
    reasoningInputTokens: input.usage.reasoningInputTokens,
    reasoningOutputTokens: input.usage.reasoningOutputTokens,
    searchCostUsd: input.usage.searchCostUsd ?? input.attribution.searchCostUsd,
    durationMs: input.usage.durationMs,
  };

  await logLLMCall(logInput);
}

function errorCodeFromUnknown(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code ?? "llm_error");
  }
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name?: unknown }).name ?? "llm_error");
  }
  return "llm_error";
}

function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown LLM error.";
}

function makeModelCacheKey(spec: string, options: ModelOptions) {
  return JSON.stringify({
    spec,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    reasoningEffort: options.reasoningEffort,
    stageRole: options.stageRole,
  });
}
