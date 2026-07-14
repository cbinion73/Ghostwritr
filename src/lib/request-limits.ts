export const REQUEST_LIMITS = {
  jsonBytes: 1_000_000,
  chatJsonBytes: 750_000,
  chatMessages: 80,
  chatMessageChars: 40_000,
  chatTotalChars: 250_000,
  sourceDocumentBytes: 25_000_000,
  personaSampleBytes: 10_000_000,
  archiveBytes: 100_000_000,
  expandedArchiveBytes: 250_000_000,
  maxFilesPerUpload: 20,
  apiWindowMs: 60_000,
  apiRequestsPerWindow: 120,
  generationRequestsPerWindow: 20,
  perBookConcurrentOperations: 2,
} as const;

export class RequestLimitError extends Error {
  constructor(
    message: string,
    public readonly status = 413,
  ) {
    super(message);
    this.name = "RequestLimitError";
  }
}

type RateEntry = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateEntry>();
const activeBookOperations = new Map<string, number>();

export function requestLimitResponse(error: RequestLimitError): Response {
  return Response.json(
    { error: error.message },
    { status: error.status },
  );
}

export function assertContentLengthWithinLimit(
  request: Request,
  limitBytes: number,
  label: string,
) {
  const raw = request.headers.get("content-length");
  if (!raw) return;

  const contentLength = Number(raw);
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    throw new RequestLimitError(`${label} exceeds the ${formatBytes(limitBytes)} request limit.`);
  }
}

export async function parseLimitedJson<T>(
  request: Request,
  options: { limitBytes?: number; label?: string } = {},
): Promise<T> {
  const limitBytes = options.limitBytes ?? REQUEST_LIMITS.jsonBytes;
  const label = options.label ?? "JSON body";
  assertContentLengthWithinLimit(request, limitBytes, label);

  const text = await request.text();
  assertTextWithinLimit(text, limitBytes, label);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestLimitError(`${label} must be valid JSON.`, 400);
  }
}

export function assertTextWithinLimit(text: string, limitBytes: number, label: string) {
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > limitBytes) {
    throw new RequestLimitError(`${label} exceeds the ${formatBytes(limitBytes)} limit.`);
  }
}

export function assertFileWithinLimit(
  file: File,
  limitBytes: number,
  label: string,
) {
  if (file.size > limitBytes) {
    throw new RequestLimitError(`${label} exceeds the ${formatBytes(limitBytes)} file limit.`);
  }
}

export function assertFileCountWithinLimit(count: number, limit: number = REQUEST_LIMITS.maxFilesPerUpload) {
  if (count > limit) {
    throw new RequestLimitError(`Upload contains ${count} files; the limit is ${limit}.`);
  }
}

export function assertChatMessagesWithinLimit(
  messages: Array<{ content?: unknown }>,
  options: {
    maxMessages?: number;
    maxMessageChars?: number;
    maxTotalChars?: number;
  } = {},
) {
  const maxMessages = options.maxMessages ?? REQUEST_LIMITS.chatMessages;
  const maxMessageChars = options.maxMessageChars ?? REQUEST_LIMITS.chatMessageChars;
  const maxTotalChars = options.maxTotalChars ?? REQUEST_LIMITS.chatTotalChars;

  if (messages.length > maxMessages) {
    throw new RequestLimitError(`Chat request contains ${messages.length} messages; the limit is ${maxMessages}.`);
  }

  let totalChars = 0;
  for (const [index, message] of messages.entries()) {
    const content = typeof message.content === "string" ? message.content : "";
    if (content.length > maxMessageChars) {
      throw new RequestLimitError(`Chat message ${index + 1} exceeds the ${maxMessageChars.toLocaleString()} character limit.`);
    }
    totalChars += content.length;
  }

  if (totalChars > maxTotalChars) {
    throw new RequestLimitError(`Chat request exceeds the ${maxTotalChars.toLocaleString()} total character limit.`);
  }
}

export function checkRateLimit(input: {
  key: string;
  limit?: number;
  windowMs?: number;
  now?: number;
}) {
  const limit = input.limit ?? REQUEST_LIMITS.apiRequestsPerWindow;
  const windowMs = input.windowMs ?? REQUEST_LIMITS.apiWindowMs;
  const now = input.now ?? Date.now();
  const existing = rateBuckets.get(input.key);

  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(input.key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

export function assertRateLimit(input: {
  key: string;
  limit?: number;
  windowMs?: number;
}) {
  const result = checkRateLimit(input);
  if (!result.allowed) {
    const retrySeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    throw new RequestLimitError(`Rate limit exceeded. Try again in ${retrySeconds} seconds.`, 429);
  }
}

export function acquireBookOperationSlot(
  bookId: string,
  operation: string,
  limit: number = REQUEST_LIMITS.perBookConcurrentOperations,
): () => void {
  const key = `${bookId}:${operation}`;
  const active = activeBookOperations.get(key) ?? 0;

  if (active >= limit) {
    throw new RequestLimitError(
      `Too many concurrent ${operation} operations for this book. Wait for the current request to finish.`,
      429,
    );
  }

  activeBookOperations.set(key, active + 1);

  return () => {
    const current = activeBookOperations.get(key) ?? 0;
    if (current <= 1) {
      activeBookOperations.delete(key);
    } else {
      activeBookOperations.set(key, current - 1);
    }
  };
}

export function resetRequestLimitStateForTests() {
  rateBuckets.clear();
  activeBookOperations.clear();
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${bytes / 1_000_000} MB`;
  if (bytes >= 1_000) return `${bytes / 1_000} KB`;
  return `${bytes} bytes`;
}
