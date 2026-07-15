export const CLOUDFLARE_ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

export type CloudflareAccessConfig =
  | {
      enabled: true;
      teamDomain: string;
      audience: string;
      ownerEmail: string;
      ownerName: string;
    }
  | { enabled: false };

type JWK = JsonWebKey & { kid?: string; alg?: string; use?: string };
type JWKSResponse = { keys?: JWK[] };
type AccessClaims = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
  sub?: string;
};

const textDecoder = new TextDecoder();
let cachedKeys: { url: string; expiresAt: number; keys: JWK[] } | null = null;

export function getCloudflareAccessConfig(
  env: Record<string, string | undefined> = process.env,
): CloudflareAccessConfig {
  const teamDomain = env.GHOSTWRITR_CLOUDFLARE_TEAM_DOMAIN?.trim().replace(/\/$/, "");
  const audience = env.GHOSTWRITR_CLOUDFLARE_AUD?.trim();
  const ownerEmail = env.GHOSTWRITR_CLOUDFLARE_OWNER_EMAIL?.trim();
  if (!teamDomain || !audience || !ownerEmail || !teamDomain.startsWith("https://")) {
    return { enabled: false };
  }
  return {
    enabled: true,
    teamDomain,
    audience,
    ownerEmail,
    ownerName: env.GHOSTWRITR_CLOUDFLARE_OWNER_NAME?.trim() || "Ghostwritr Author",
  };
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeJSON<T>(value: string): T | null {
  const bytes = decodeBase64Url(value);
  if (!bytes) return null;
  try { return JSON.parse(textDecoder.decode(bytes)) as T; }
  catch { return null; }
}

async function fetchKeys(
  teamDomain: string,
  fetcher: typeof fetch = fetch,
): Promise<JWK[]> {
  const url = `${teamDomain}/cdn-cgi/access/certs`;
  if (cachedKeys?.url === url && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;
  const response = await fetcher(url, { cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json() as JWKSResponse;
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  cachedKeys = { url, keys, expiresAt: Date.now() + 5 * 60 * 1000 };
  return keys;
}

function audienceMatches(claim: string | string[] | undefined, expected: string): boolean {
  return typeof claim === "string" ? claim === expected : Array.isArray(claim) && claim.includes(expected);
}

export async function verifyCloudflareAccessJWT(input: {
  token: string;
  teamDomain: string;
  audience: string;
  now?: Date;
  keys?: JWK[];
  fetcher?: typeof fetch;
}): Promise<AccessClaims | null> {
  const parts = input.token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJSON<{ alg?: string; kid?: string }>(encodedHeader);
  const claims = decodeJSON<AccessClaims>(encodedPayload);
  const signature = decodeBase64Url(encodedSignature);
  if (!header || !claims || !signature || header.alg !== "RS256" || !header.kid) return null;

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (
    claims.iss !== input.teamDomain ||
    !audienceMatches(claims.aud, input.audience) ||
    typeof claims.exp !== "number" || claims.exp <= nowSeconds ||
    (typeof claims.nbf === "number" && claims.nbf > nowSeconds) ||
    typeof claims.email !== "string" || !claims.email.trim()
  ) return null;

  const keys = input.keys ?? await fetchKeys(input.teamDomain, input.fetcher);
  const jwk = keys.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!jwk) return null;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      new Uint8Array(signature).buffer,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    return valid ? claims : null;
  } catch {
    return null;
  }
}
