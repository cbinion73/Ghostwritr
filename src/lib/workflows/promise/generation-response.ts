function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function extractTextFromResponse(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }

  const raw = asRecord(response);
  const content = raw.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        const record = asRecord(part);
        return typeof record.text === "string" ? record.text : "";
      })
      .join("\n");
  }

  return JSON.stringify(response);
}

export class JsonExtractionError extends Error {
  code: "missing_json" | "incomplete_json";
  details: {
    candidateLength: number;
    startIndex: number;
    openBraceDepth: number;
    endedInString: boolean;
  };

  constructor(
    code: "missing_json" | "incomplete_json",
    message: string,
    details: {
      candidateLength: number;
      startIndex: number;
      openBraceDepth: number;
      endedInString: boolean;
    },
  ) {
    super(message);
    this.name = "JsonExtractionError";
    this.code = code;
    this.details = details;
  }
}

function extractBalancedJsonObject(candidate: string): {
  jsonText: string | null;
  startIndex: number;
  openBraceDepth: number;
  endedInString: boolean;
} {
  const start = candidate.indexOf("{");

  if (start === -1) {
    return {
      jsonText: null,
      startIndex: -1,
      openBraceDepth: 0,
      endedInString: false,
    };
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return {
          jsonText: candidate.slice(start, index + 1),
          startIndex: start,
          openBraceDepth: 0,
          endedInString: false,
        };
      }
    }
  }

  return {
    jsonText: null,
    startIndex: start,
    openBraceDepth: depth,
    endedInString: inString,
  };
}

export function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (codeBlockMatch?.[1] ?? trimmed).trim();

  const balanced = extractBalancedJsonObject(candidate);

  if (balanced.jsonText) {
    return balanced.jsonText.trim();
  }

  if (!candidate.includes("{")) {
    throw new JsonExtractionError("missing_json", "No JSON object found in LLM response", {
      candidateLength: candidate.length,
      startIndex: balanced.startIndex,
      openBraceDepth: balanced.openBraceDepth,
      endedInString: balanced.endedInString,
    });
  }

  throw new JsonExtractionError(
    "incomplete_json",
    "LLM response ended before the JSON object was complete",
    {
      candidateLength: candidate.length,
      startIndex: balanced.startIndex,
      openBraceDepth: balanced.openBraceDepth,
      endedInString: balanced.endedInString,
    },
  );
}

export function getResponseMetadata(response: unknown): Record<string, unknown> {
  const raw = asRecord(response);
  return asRecord(raw.response_metadata);
}

export function getUsageMetadata(response: unknown): Record<string, unknown> {
  const raw = asRecord(response);
  return asRecord(raw.usage_metadata);
}

export function getStopReason(response: unknown): string | undefined {
  const metadata = getResponseMetadata(response);
  const stopReason = metadata.stop_reason ?? metadata.stopReason;
  return typeof stopReason === "string" ? stopReason : undefined;
}

export function isLikelyTruncatedJson(
  jsonText: string,
  error: unknown,
  stopReason?: string,
): boolean {
  if (stopReason === "max_tokens") {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  if (error instanceof JsonExtractionError) {
    return error.code === "incomplete_json";
  }

  if (jsonText.trim().endsWith("}")) {
    return false;
  }

  return /Unexpected end|Unterminated|string at position|Expected ',' or '\]' after array element|ended before the JSON object was complete/i.test(
    error.message,
  );
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}
