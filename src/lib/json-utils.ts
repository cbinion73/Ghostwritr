export function parseStoredJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

export function asObjectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function extractBalancedJson(text: string): string {
  let start = -1;
  let openChar = "";
  let closeChar = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
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

    if (start === -1) {
      if (char === "{") {
        start = i;
        openChar = "{";
        closeChar = "}";
        depth = 1;
      } else if (char === "[") {
        start = i;
        openChar = "[";
        closeChar = "]";
        depth = 1;
      }
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new Error("Model response ended before the JSON structure closed");
}

export function parseJsonFromText<T>(text: string): T {
  return JSON.parse(extractBalancedJson(text)) as T;
}
