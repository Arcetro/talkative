import assert from "node:assert/strict";
import test from "node:test";
import { validateSecurityConfig } from "./config.js";

const ORIGINAL_ENV = {
  AUTH_DISABLED: process.env.AUTH_DISABLED,
  NODE_ENV: process.env.NODE_ENV,
  AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET
};

test.afterEach(() => {
  process.env.AUTH_DISABLED = ORIGINAL_ENV.AUTH_DISABLED;
  process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  process.env.AUTH_JWT_SECRET = ORIGINAL_ENV.AUTH_JWT_SECRET;
});

test("validateSecurityConfig throws when secret is missing and auth is enabled", () => {
  process.env.NODE_ENV = "development";
  process.env.AUTH_DISABLED = "false";
  delete process.env.AUTH_JWT_SECRET;

  assert.throws(() => validateSecurityConfig(), /Missing AUTH_JWT_SECRET/);
});

test("validateSecurityConfig throws for short secrets", () => {
  process.env.NODE_ENV = "development";
  process.env.AUTH_DISABLED = "false";
  process.env.AUTH_JWT_SECRET = "short-secret";

  assert.throws(() => validateSecurityConfig(), /too short/);
});

test("validateSecurityConfig does not throw when auth is disabled", () => {
  process.env.NODE_ENV = "development";
  process.env.AUTH_DISABLED = "true";
  delete process.env.AUTH_JWT_SECRET;

  assert.doesNotThrow(() => validateSecurityConfig());
});

test("validateSecurityConfig does not throw with a valid secret", () => {
  process.env.NODE_ENV = "development";
  process.env.AUTH_DISABLED = "false";
  process.env.AUTH_JWT_SECRET = "this-is-a-very-strong-secret-with-at-least-32-chars";

  assert.doesNotThrow(() => validateSecurityConfig());
});
