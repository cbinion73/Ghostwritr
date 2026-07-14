export const APP_USER_EMAIL_HEADER = "x-ghostwritr-user-email";
export const APP_USER_NAME_HEADER = "x-ghostwritr-user-name";
export const APP_AUTH_MODE_HEADER = "x-ghostwritr-auth-mode";
export const INTERNAL_WORKFLOW_TOKEN_HEADER = "x-internal-workflow-token";
export const JARVIS_INTERNAL_TOKEN_HEADER = "x-ghostwritr-jarvis-token";

export type LocalAuthConfig =
  | {
      enabled: true;
      email: string;
      name: string;
      mode: "local-dev";
    }
  | {
      enabled: false;
      reason:
        | "disabled"
        | "missing-email"
        | "production";
    };

export function getLocalAuthConfig(env: NodeJS.ProcessEnv = process.env): LocalAuthConfig {
  if (env.NODE_ENV === "production") {
    return { enabled: false, reason: "production" };
  }

  if (env.GHOSTWRITR_LOCAL_AUTH !== "1") {
    return { enabled: false, reason: "disabled" };
  }

  const email = env.GHOSTWRITR_LOCAL_AUTH_EMAIL?.trim();
  if (!email) {
    return { enabled: false, reason: "missing-email" };
  }

  return {
    enabled: true,
    email,
    name: env.GHOSTWRITR_LOCAL_AUTH_NAME?.trim() || "Local Ghostwritr User",
    mode: "local-dev",
  };
}

export function buildAuthRequiredMessage(config: LocalAuthConfig): string {
  if (config.enabled) {
    return "Authentication is required.";
  }

  if (config.reason === "production") {
    return "Authentication is required. Production access must use a real authenticated user session.";
  }

  if (config.reason === "missing-email") {
    return "Authentication is required. Local auth is enabled, but GHOSTWRITR_LOCAL_AUTH_EMAIL is missing.";
  }

  return "Authentication is required. For local development, set GHOSTWRITR_LOCAL_AUTH=1 and GHOSTWRITR_LOCAL_AUTH_EMAIL in .env.";
}

export type InternalTokenAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function validateInternalTokenAuth(input: {
  headers: Headers;
  envVarName: string;
  headerName: string;
  serviceName: string;
  env?: Record<string, string | undefined>;
}): InternalTokenAuthResult {
  const env = input.env ?? process.env;
  const expectedToken = env[input.envVarName]?.trim();

  if (!expectedToken) {
    return {
      ok: false,
      status: 503,
      error: `${input.serviceName} authentication is not configured.`,
    };
  }

  const explicitHeader = input.headers.get(input.headerName)?.trim();
  const authorization = input.headers.get("authorization")?.trim();
  const bearerToken = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : null;
  const providedToken = explicitHeader || bearerToken;

  if (providedToken !== expectedToken) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  return { ok: true };
}
