export class ClientRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = "ClientRequestError";
  }
}

type ErrorPayload = { error?: string; message?: string; code?: string };

async function readErrorPayload(response: Response): Promise<ErrorPayload | null> {
  try {
    return await response.clone().json() as ErrorPayload;
  } catch {
    return null;
  }
}

export async function getClientResponseError(response: Response): Promise<string> {
  const body = await readErrorPayload(response);
  if (body?.code === "budget_confirmation_required") {
    return body.error ?? body.message ?? "LLM budget confirmation required. Confirm the book budget in the cost panel, then try again.";
  }
  return body?.error ?? body?.message ?? `${response.status}`;
}

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await readErrorPayload(response);
    throw new ClientRequestError(
      body?.error ?? body?.message ?? `${response.status}`,
      response.status,
      body?.code,
      body,
    );
  }
  try {
    return await response.json() as T;
  } catch {
    throw new ClientRequestError("The server returned an invalid JSON response.", response.status);
  }
}

export async function fetchOk(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await readErrorPayload(response);
    throw new ClientRequestError(
      body?.error ?? body?.message ?? `${response.status}`,
      response.status,
      body?.code,
      body,
    );
  }
}
