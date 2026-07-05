/**
 * In-memory live buffer for the Promise chat's assistant reply, updated
 * chunk-by-chunk as the model streams its response — the same pattern as
 * outline-progress-tracker.ts. This is genuine token-by-token streaming
 * (the model call itself uses .stream(), not .invoke()), not a coarse
 * status poll, so the author can watch the reply being written the way
 * they'd watch ChatGPT type. Costs nothing extra: it's the same output
 * tokens the app already generates, just surfaced as they arrive instead
 * of only once the full reply is done.
 */

type ReplyStream = {
  text: string;
  done: boolean;
};

const streams = new Map<string, ReplyStream>();

export function startPromiseReplyStream(bookSlug: string) {
  streams.set(bookSlug, { text: "", done: false });
}

export function appendPromiseReplyChunk(bookSlug: string, chunk: string) {
  const existing = streams.get(bookSlug) ?? { text: "", done: false };
  streams.set(bookSlug, { text: existing.text + chunk, done: false });
}

export function finishPromiseReplyStream(bookSlug: string) {
  const existing = streams.get(bookSlug);
  if (existing) {
    streams.set(bookSlug, { ...existing, done: true });
  }
}

export function getPromiseReplyStream(bookSlug: string): ReplyStream | null {
  return streams.get(bookSlug) ?? null;
}

export function clearPromiseReplyStream(bookSlug: string) {
  streams.delete(bookSlug);
}
