import type { NextFunction, Request, Response } from "express";
import { recordHttpRequest } from "./metrics.js";

function endpointLabel(req: Request): string {
  const routePath = typeof req.route?.path === "string" ? req.route.path : req.path;
  const base = req.baseUrl ?? "";
  const merged = `${base}${routePath}` || req.path;
  return merged.replace(/\/{2,}/g, "/");
}

export function captureHttpMetrics(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on("finish", () => {
    recordHttpRequest({
      method: req.method,
      endpoint: endpointLabel(req),
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  next();
}
