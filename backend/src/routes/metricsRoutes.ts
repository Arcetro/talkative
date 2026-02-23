import { Router } from "express";
import { renderPrometheusMetrics } from "../observability/metrics.js";

export const metricsRouter = Router();

metricsRouter.get("/metrics", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(renderPrometheusMetrics());
});
