import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthRequiredMessage,
  getBearerToken,
  getLocalAuthConfig,
  getNativeAuthConfig,
  validateInternalTokenAuth,
} from "@/lib/auth/shared";

test("native auth fails closed until token and user are both configured", () => {
  assert.deepEqual(getNativeAuthConfig({ GHOSTWRITR_NATIVE_TOKEN: "secret" }), { enabled: false });
  assert.deepEqual(getNativeAuthConfig({ GHOSTWRITR_NATIVE_USER_EMAIL: "chris@example.com" }), { enabled: false });
});

test("native auth binds a device token to an explicit Ghostwritr user", () => {
  assert.deepEqual(getNativeAuthConfig({
    GHOSTWRITR_NATIVE_TOKEN: " secret ",
    GHOSTWRITR_NATIVE_USER_EMAIL: " chris@example.com ",
    GHOSTWRITR_NATIVE_USER_NAME: "Chris",
  }), {
    enabled: true,
    token: "secret",
    email: "chris@example.com",
    name: "Chris",
    mode: "native-token",
  });
});

test("bearer token parsing is case insensitive and rejects other schemes", () => {
  assert.equal(getBearerToken(new Headers({ authorization: "bEaReR native-secret" })), "native-secret");
  assert.equal(getBearerToken(new Headers({ authorization: "Basic native-secret" })), null);
  assert.equal(getBearerToken(new Headers()), null);
});

test("local auth stays disabled in production", () => {
  const config = getLocalAuthConfig({
    NODE_ENV: "production",
    GHOSTWRITR_LOCAL_AUTH: "1",
    GHOSTWRITR_LOCAL_AUTH_EMAIL: "chris@example.com",
  });

  assert.deepEqual(config, {
    enabled: false,
    reason: "production",
  });
});

test("local auth requires explicit enable flag", () => {
  const config = getLocalAuthConfig({
    NODE_ENV: "development",
    GHOSTWRITR_LOCAL_AUTH_EMAIL: "chris@example.com",
  });

  assert.deepEqual(config, {
    enabled: false,
    reason: "disabled",
  });
});

test("local auth requires an email when enabled", () => {
  const config = getLocalAuthConfig({
    NODE_ENV: "development",
    GHOSTWRITR_LOCAL_AUTH: "1",
  });

  assert.deepEqual(config, {
    enabled: false,
    reason: "missing-email",
  });
});

test("local auth returns the configured local user", () => {
  const config = getLocalAuthConfig({
    NODE_ENV: "development",
    GHOSTWRITR_LOCAL_AUTH: "1",
    GHOSTWRITR_LOCAL_AUTH_EMAIL: "chris@example.com",
    GHOSTWRITR_LOCAL_AUTH_NAME: "Chris",
  });

  assert.deepEqual(config, {
    enabled: true,
    email: "chris@example.com",
    name: "Chris",
    mode: "local-dev",
  });
});

test("auth-required message explains missing local setup", () => {
  const message = buildAuthRequiredMessage({
    enabled: false,
    reason: "disabled",
  });

  assert.match(message, /GHOSTWRITR_LOCAL_AUTH=1/);
  assert.match(message, /GHOSTWRITR_LOCAL_AUTH_EMAIL/);
});

test("internal token auth fails closed when secret is missing", () => {
  const result = validateInternalTokenAuth({
    headers: new Headers({ "x-test-token": "provided" }),
    envVarName: "TEST_INTERNAL_TOKEN",
    headerName: "x-test-token",
    serviceName: "Test service",
    env: {},
  });

  assert.deepEqual(result, {
    ok: false,
    status: 503,
    error: "Test service authentication is not configured.",
  });
});

test("internal token auth rejects wrong token", () => {
  const result = validateInternalTokenAuth({
    headers: new Headers({ "x-test-token": "wrong" }),
    envVarName: "TEST_INTERNAL_TOKEN",
    headerName: "x-test-token",
    serviceName: "Test service",
    env: { TEST_INTERNAL_TOKEN: "correct" },
  });

  assert.deepEqual(result, { ok: false, status: 401, error: "Unauthorized" });
});

test("internal token auth accepts configured header token", () => {
  const result = validateInternalTokenAuth({
    headers: new Headers({ "x-test-token": "correct" }),
    envVarName: "TEST_INTERNAL_TOKEN",
    headerName: "x-test-token",
    serviceName: "Test service",
    env: { TEST_INTERNAL_TOKEN: " correct " },
  });

  assert.deepEqual(result, { ok: true });
});

test("internal token auth accepts bearer token fallback", () => {
  const result = validateInternalTokenAuth({
    headers: new Headers({ authorization: "Bearer correct" }),
    envVarName: "TEST_INTERNAL_TOKEN",
    headerName: "x-test-token",
    serviceName: "Test service",
    env: { TEST_INTERNAL_TOKEN: "correct" },
  });

  assert.deepEqual(result, { ok: true });
});
