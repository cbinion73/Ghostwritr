import assert from "node:assert/strict";
import test from "node:test";

import {
  getCloudflareAccessConfig,
  verifyCloudflareAccessJWT,
} from "@/lib/auth/cloudflare-access";

const encoder = new TextEncoder();
const teamDomain = "https://delicate-firefly-73e8.cloudflareaccess.com";
const audience = "ghostwritr-audience";

function base64url(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return Buffer.from(bytes).toString("base64url");
}

async function fixtureToken(overrides: Record<string, unknown> = {}) {
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const kid = "test-signing-key";
  const header = base64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: teamDomain,
    aud: [audience],
    email: "chris@example.com",
    iat: 1_784_116_700,
    nbf: 1_784_116_700,
    exp: 1_784_120_400,
    ...overrides,
  }));
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keys.privateKey,
    encoder.encode(`${header}.${payload}`),
  );
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  return { token: `${header}.${payload}.${base64url(new Uint8Array(signature))}`, keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] };
}

test("Cloudflare Access config fails closed and maps valid identities to the existing owner", () => {
  assert.deepEqual(getCloudflareAccessConfig({}), { enabled: false });
  assert.deepEqual(getCloudflareAccessConfig({
    GHOSTWRITR_CLOUDFLARE_TEAM_DOMAIN: `${teamDomain}/`,
    GHOSTWRITR_CLOUDFLARE_AUD: audience,
    GHOSTWRITR_CLOUDFLARE_OWNER_EMAIL: "local@ghostwritr.app",
    GHOSTWRITR_CLOUDFLARE_OWNER_NAME: "Chris",
  }), {
    enabled: true,
    teamDomain,
    audience,
    ownerEmail: "local@ghostwritr.app",
    ownerName: "Chris",
  });
});

test("valid Cloudflare Access JWT verifies its signature and claims", async () => {
  const fixture = await fixtureToken();
  const claims = await verifyCloudflareAccessJWT({
    token: fixture.token,
    teamDomain,
    audience,
    keys: fixture.keys,
    now: new Date("2026-07-15T12:00:00.000Z"),
  });
  assert.equal(claims?.email, "chris@example.com");
});

test("Cloudflare Access JWT rejects tampering, wrong audience, and expiration", async () => {
  const fixture = await fixtureToken();
  const parts = fixture.token.split(".");
  assert.equal(await verifyCloudflareAccessJWT({
    token: `${parts[0]}.${base64url(JSON.stringify({ email: "attacker@example.com" }))}.${parts[2]}`,
    teamDomain, audience, keys: fixture.keys, now: new Date("2026-07-15T12:00:00.000Z"),
  }), null);
  assert.equal(await verifyCloudflareAccessJWT({
    token: fixture.token, teamDomain, audience: "wrong", keys: fixture.keys, now: new Date("2026-07-15T12:00:00.000Z"),
  }), null);
  const expired = await fixtureToken({ exp: 1_784_116_799 });
  assert.equal(await verifyCloudflareAccessJWT({
    token: expired.token, teamDomain, audience, keys: expired.keys, now: new Date("2026-07-15T12:00:00.000Z"),
  }), null);
});
