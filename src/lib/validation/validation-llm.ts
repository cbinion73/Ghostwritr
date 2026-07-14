import { HumanMessage } from "@langchain/core/messages";

import { acquireLLMGatewayCall } from "@/lib/llm/gateway";
import type { ModelOptions } from "@/lib/llm/providers";

export async function invokeValidationText(input: {
  modelSpec: string;
  stageRole: string;
  operation: string;
  prompt: string;
  options?: ModelOptions;
}) {
  const gatewayCall = await acquireLLMGatewayCall({
    modelSpec: input.modelSpec,
    attribution: {
      stageRole: input.stageRole,
      operation: input.operation,
    },
    options: input.options,
    policy: {
      bookHardStopUsd: 0,
      timeoutMs: input.options?.timeoutMs,
      maxRetries: input.options?.maxRetries,
      maxOutputTokens: input.options?.maxOutputTokens,
      reasoningEffort: input.options?.reasoningEffort,
    },
  });

  if (!gatewayCall) {
    throw new Error(`No gateway model available for ${input.operation}`);
  }

  const response = await gatewayCall.model.invoke([new HumanMessage(input.prompt)]);
  return messageContentToText(response.content);
}

function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("");
  }
  return String(content ?? "");
}
