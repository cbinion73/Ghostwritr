const DEFAULT_PROVIDER_MAX_RETRIES = 1;
const DEFAULT_WORKFLOW_MAX_ATTEMPTS = 1;
const DEFAULT_ABSOLUTE_MAX = 2;

function readNonNegativeInteger(name: string): number | undefined {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.floor(parsed);
}

export function clampRetryCount(
  requested: number | undefined,
  options: {
    defaultValue: number;
    maxValue?: number;
  },
) {
  const maxValue = Math.max(0, options.maxValue ?? DEFAULT_ABSOLUTE_MAX);
  const value = requested ?? options.defaultValue;
  if (!Number.isFinite(value) || value < 0) return Math.min(options.defaultValue, maxValue);
  return Math.min(Math.floor(value), maxValue);
}

export function getProviderMaxRetries(requested?: number) {
  const envDefault = readNonNegativeInteger("LLM_PROVIDER_MAX_RETRIES");
  const envCap = readNonNegativeInteger("LLM_PROVIDER_RETRY_CAP");
  return clampRetryCount(requested ?? envDefault, {
    defaultValue: DEFAULT_PROVIDER_MAX_RETRIES,
    maxValue: envCap ?? DEFAULT_ABSOLUTE_MAX,
  });
}

export function getWorkflowAttemptLimit(envName: string, requested?: number) {
  const envDefault = readNonNegativeInteger(envName);
  const envCap = readNonNegativeInteger("LLM_WORKFLOW_ATTEMPT_CAP");
  const value = requested ?? envDefault ?? DEFAULT_WORKFLOW_MAX_ATTEMPTS;
  if (!Number.isFinite(value) || value < 1) return DEFAULT_WORKFLOW_MAX_ATTEMPTS;
  return Math.min(Math.floor(value), envCap ?? DEFAULT_ABSOLUTE_MAX);
}
