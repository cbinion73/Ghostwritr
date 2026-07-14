import assert from "node:assert/strict";
import test from "node:test";

import { ClientRequestError, fetchJson, fetchOk, getClientResponseError } from "../src/lib/ui/client-request";

test("fetchJson returns typed JSON for successful responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ value: 42 }), { status: 200 });
  try {
    assert.deepEqual(await fetchJson<{ value: number }>("https://example.invalid"), { value: 42 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchJson preserves server status, code, message, and structured error context", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: "Confirm spend",
    code: "budget_confirmation_required",
    gate: { overridable: true },
  }), { status: 402 });
  try {
    await assert.rejects(
      fetchJson("https://example.invalid"),
      (error: unknown) =>
        error instanceof ClientRequestError &&
        error.status === 402 &&
        error.code === "budget_confirmation_required" &&
        error.message === "Confirm spend" &&
        (error.payload as { gate?: { overridable?: boolean } }).gate?.overridable === true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchOk accepts empty success responses and response errors stay readable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  try {
    await fetchOk("https://example.invalid");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const response = new Response("not-json", { status: 503 });
  assert.equal(await getClientResponseError(response), "503");
});
