import type { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { isAuthDisabled } from "./config.js";
import { AUTH_ROLES, type AuthRole } from "./types.js";

const PUBLIC_PATHS = new Set(["/health", "/metrics"]);
const AUTH_ALGORITHMS: jwt.Algorithm[] = ["HS256"];

function isPublicWebhookIngress(req: Request): boolean {
  return req.method === "POST" && req.path.startsWith("/webhooks/");
}

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path);
}

function parseBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function getSecret(): string {
  return process.env.AUTH_JWT_SECRET?.trim() ?? "";
}

function toRole(value: unknown): AuthRole | null {
  if (typeof value !== "string") return null;
  return AUTH_ROLES.find((role) => role === value) ?? null;
}

function buildLocalBypassPrincipal(req: Request) {
  const role = toRole(process.env.AUTH_DEV_ROLE) ?? "admin";
  const tenant_id = req.header("x-tenant-id") ?? undefined;
  return {
    subject: process.env.AUTH_DEV_SUBJECT ?? "local-dev-user",
    role,
    tenant_id
  };
}

function deny(res: Response, status: 401 | 403, code: string, message: string): void {
  res.status(status).json({ error: message, code });
}

export function authenticateRequest(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "OPTIONS" || isPublicPath(req.path) || isPublicWebhookIngress(req)) {
    next();
    return;
  }

  if (isAuthDisabled()) {
    req.auth = buildLocalBypassPrincipal(req);
    next();
    return;
  }

  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    deny(res, 401, "AUTH_MISSING_BEARER", "Missing Authorization Bearer token");
    return;
  }

  const secret = getSecret();
  if (!secret) {
    deny(res, 401, "AUTH_SECRET_MISCONFIGURED", "Auth secret is not configured");
    return;
  }

  try {
    const decoded = jwt.verify(token, secret, { algorithms: AUTH_ALGORITHMS }) as JwtPayload | string;
    if (typeof decoded !== "object" || decoded === null) {
      deny(res, 401, "AUTH_INVALID_PAYLOAD", "Invalid JWT payload");
      return;
    }

    const role = toRole(decoded.role);
    const subject = typeof decoded.sub === "string" ? decoded.sub : null;
    const tenant_id = typeof decoded.tenant_id === "string" ? decoded.tenant_id : undefined;

    if (!subject || !role) {
      deny(res, 401, "AUTH_MISSING_CLAIMS", "JWT must include sub and role claims");
      return;
    }

    req.auth = { subject, role, tenant_id };
    next();
  } catch {
    deny(res, 401, "AUTH_INVALID_TOKEN", "Invalid or expired JWT");
  }
}

function isFleetPath(path: string): boolean {
  return path === "/fleet/nodes" || path === "/fleet/agents" || path === "/fleet/agents/provision";
}

function isRouterMutation(req: Request): boolean {
  return req.method === "PUT" && (req.path === "/router/admin/rules" || req.path === "/router/admin/budgets");
}

function isWriteMethod(req: Request): boolean {
  return req.method !== "GET" && req.method !== "HEAD";
}

export function authorizeRoleForRequest(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "OPTIONS" || isPublicPath(req.path) || isPublicWebhookIngress(req)) {
    next();
    return;
  }

  const principal = req.auth;
  if (!principal) {
    deny(res, 401, "AUTH_REQUIRED", "Authentication required");
    return;
  }

  if (principal.role === "admin") {
    next();
    return;
  }

  if (principal.role === "operator") {
    if (isFleetPath(req.path) || isRouterMutation(req)) {
      deny(res, 403, "RBAC_FORBIDDEN", "Operator role is not allowed to perform this action");
      return;
    }
    next();
    return;
  }

  if (isFleetPath(req.path) || isWriteMethod(req) || isRouterMutation(req)) {
    deny(res, 403, "RBAC_FORBIDDEN", "Viewer role is read-only");
    return;
  }

  next();
}
