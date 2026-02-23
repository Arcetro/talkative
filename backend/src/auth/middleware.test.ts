import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { authenticateRequest, authorizeRoleForRequest } from "./middleware.js";

const ORIGINAL_ENV = {
  AUTH_DISABLED: process.env.AUTH_DISABLED,
  NODE_ENV: process.env.NODE_ENV,
  AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET
};

function makeToken(role: "admin" | "operator" | "viewer"): string {
  return jwt.sign(
    {
      sub: `user-${role}`,
      role,
      tenant_id: "tenant-default"
    },
    process.env.AUTH_JWT_SECRET!,
    { algorithm: "HS256", expiresIn: "5m" }
  );
}

function createReq(input: {
  method: string;
  path: string;
  authorization?: string;
  xTenantId?: string;
}): Request {
  const headers: Record<string, string | undefined> = {
    authorization: input.authorization,
    "x-tenant-id": input.xTenantId
  };

  const req = {
    method: input.method,
    path: input.path,
    header(name: string) {
      return headers[name.toLowerCase()];
    }
  } as unknown as Request;
  return req;
}

function createRes(): { res: Response; statusCode: number; body: unknown } {
  const state = { statusCode: 200, body: undefined as unknown };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    }
  } as unknown as Response;

  return {
    res,
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    }
  };
}

test.beforeEach(() => {
  process.env.NODE_ENV = "development";
  process.env.AUTH_DISABLED = "false";
  process.env.AUTH_JWT_SECRET = "this-is-a-very-strong-secret-with-at-least-32-chars";
});

test.afterEach(() => {
  process.env.AUTH_DISABLED = ORIGINAL_ENV.AUTH_DISABLED;
  process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  process.env.AUTH_JWT_SECRET = ORIGINAL_ENV.AUTH_JWT_SECRET;
});

test("rejects missing bearer token", () => {
  const req = createReq({ method: "GET", path: "/agents" });
  const state = createRes();
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };

  authenticateRequest(req, state.res, next);

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 401);
  assert.deepEqual(state.body, {
    code: "AUTH_MISSING_BEARER",
    error: "Missing Authorization Bearer token"
  });
});

test("allows public health without auth", () => {
  const req = createReq({ method: "GET", path: "/health" });
  const state = createRes();
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };

  authenticateRequest(req, state.res, next);

  assert.equal(nextCalled, true);
  assert.equal(state.statusCode, 200);
});

test("viewer is read-only", () => {
  const token = makeToken("viewer");
  const readReq = createReq({
    method: "GET",
    path: "/agents",
    authorization: `Bearer ${token}`
  });
  const readState = createRes();

  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };

  authenticateRequest(readReq, readState.res, next);
  assert.equal(nextCalled, true);

  authorizeRoleForRequest(readReq, readState.res, next);
  assert.equal(nextCalled, true);
  assert.equal(readState.statusCode, 200);

  const writeReq = createReq({
    method: "POST",
    path: "/agents",
    authorization: `Bearer ${token}`
  });
  const writeState = createRes();
  authenticateRequest(writeReq, writeState.res, () => {});
  authorizeRoleForRequest(writeReq, writeState.res, () => {});
  assert.equal(writeState.statusCode, 403);
});

test("operator cannot access fleet provisioning", () => {
  const token = makeToken("operator");
  const req = createReq({
    method: "POST",
    path: "/fleet/nodes",
    authorization: `Bearer ${token}`
  });
  const state = createRes();
  authenticateRequest(req, state.res, () => {});
  authorizeRoleForRequest(req, state.res, () => {});
  assert.equal(state.statusCode, 403);
});

test("admin can mutate router rules", () => {
  const token = makeToken("admin");
  const req = createReq({
    method: "PUT",
    path: "/router/admin/rules",
    authorization: `Bearer ${token}`
  });
  const state = createRes();
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };

  authenticateRequest(req, state.res, next);
  authorizeRoleForRequest(req, state.res, next);

  assert.equal(state.statusCode, 200);
  assert.equal(nextCalled, true);
});
