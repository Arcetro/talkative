import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { resolveRequestContext } from "./requestContext.js";

function mockRequest(input: {
  headers?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  authTenant?: string;
}): Request {
  const headers = input.headers ?? {};
  return {
    body: input.body ?? {},
    query: input.query ?? {},
    params: input.params ?? {},
    auth: input.authTenant ? { subject: "user", role: "admin", tenant_id: input.authTenant } : undefined,
    header(name: string) {
      return headers[name.toLowerCase()];
    }
  } as unknown as Request;
}

test("resolveRequestContext prefers explicit headers", () => {
  const req = mockRequest({
    headers: {
      "x-request-id": "req-header",
      "x-tenant-id": "tenant-header",
      "x-agent-id": "agent-header",
      "x-run-id": "run-header"
    },
    body: {
      tenant_id: "tenant-body",
      agent_id: "agent-body",
      run_id: "run-body"
    }
  });

  const context = resolveRequestContext(req);
  assert.equal(context.request_id, "req-header");
  assert.equal(context.tenant_id, "tenant-header");
  assert.equal(context.agent_id, "agent-header");
  assert.equal(context.run_id, "run-header");
});

test("resolveRequestContext falls back to body/query/params/auth/default", () => {
  const req = mockRequest({
    body: { run_id: "run-body" },
    query: { tenant_id: "tenant-query" },
    params: { id: "agent-from-param" },
    authTenant: "tenant-auth"
  });

  const context = resolveRequestContext(req);
  assert.equal(context.tenant_id, "tenant-query");
  assert.equal(context.agent_id, "agent-from-param");
  assert.equal(context.run_id, "run-body");
  assert.ok(context.request_id.length > 0);
});
