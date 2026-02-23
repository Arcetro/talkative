import { nanoid } from "nanoid";
import type { NextFunction, Request, Response } from "express";
import type { LogContext } from "./logger.js";
import { logError, logInfo } from "./logger.js";

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractFromObject(source: unknown, key: string): string | undefined {
  if (!source || typeof source !== "object") return undefined;
  const value = (source as Record<string, unknown>)[key];
  return pickString(value);
}

export function resolveRequestContext(req: Request): Required<LogContext> & { request_id: string } {
  const request_id = pickString(req.header("x-request-id")) ?? nanoid(10);
  const tenant_id =
    pickString(req.header("x-tenant-id")) ??
    extractFromObject(req.body, "tenant_id") ??
    extractFromObject(req.query, "tenant_id") ??
    extractFromObject(req.params, "tenant_id") ??
    req.auth?.tenant_id ??
    "unknown";
  const agent_id =
    pickString(req.header("x-agent-id")) ??
    extractFromObject(req.body, "agent_id") ??
    extractFromObject(req.query, "agent_id") ??
    extractFromObject(req.params, "agent_id") ??
    extractFromObject(req.params, "id") ??
    "unknown";
  const run_id =
    pickString(req.header("x-run-id")) ??
    extractFromObject(req.body, "run_id") ??
    extractFromObject(req.query, "run_id") ??
    extractFromObject(req.params, "run_id") ??
    "unknown";

  return { request_id, tenant_id, agent_id, run_id };
}

export function attachRequestContext(req: Request, res: Response, next: NextFunction): void {
  req.context = resolveRequestContext(req);
  res.setHeader("x-request-id", req.context.request_id);
  next();
}

export function logRequestLifecycle(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on("finish", () => {
    const duration_ms = Date.now() - startedAt;
    const context = req.context;
    const data: Record<string, unknown> = {
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      duration_ms
    };
    if (res.statusCode >= 400) {
      logError("http.request.completed", { context, data });
    } else {
      logInfo("http.request.completed", { context, data });
    }
  });

  next();
}

export function logUnhandledError(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  void _next;
  logError("http.request.unhandled_error", {
    context: req.context,
    data: {
      method: req.method,
      path: req.path,
      status_code: 500,
      error: err instanceof Error ? err.message : "Unknown error"
    }
  });
  res.status(500).json({ error: "Internal server error" });
}
