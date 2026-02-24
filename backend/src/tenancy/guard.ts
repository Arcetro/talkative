import type { NextFunction, Request, Response } from "express";

const PUBLIC_PATHS = new Set(["/health", "/metrics", "/events"]);

function isPublicWebhookIngress(req: Request): boolean {
  return req.method === "POST" && req.path.startsWith("/webhooks/");
}

export function getTenantIdOrThrow(req: Request): string {
  const contextTenant = req.context?.tenant_id;
  const tenant = contextTenant && contextTenant !== "unknown" ? contextTenant : req.auth?.tenant_id;
  if (!tenant || tenant === "unknown") {
    throw new Error("tenant_id is required");
  }
  return tenant;
}

export function ensureTenantMatch(req: Request, candidate: string | undefined, field = "tenant_id"): string {
  const tenant = getTenantIdOrThrow(req);
  if (candidate && candidate !== tenant) {
    throw new Error(`${field} does not match request tenant`);
  }
  return tenant;
}

export function enforceTenantContext(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "OPTIONS" || PUBLIC_PATHS.has(req.path) || isPublicWebhookIngress(req)) {
    next();
    return;
  }

  try {
    const tenant = getTenantIdOrThrow(req);
    const authTenant = req.auth?.tenant_id;
    if (authTenant && authTenant !== tenant) {
      return void res.status(403).json({ error: "tenant_id does not match authenticated principal" });
    }
    next();
  } catch (error) {
    return void res.status(400).json({ error: (error as Error).message });
  }
}
