import { Router } from "express";
import { getBudgets, getMetrics, getRules, getUsage, putBudgets, putRules } from "../router/store.js";
import { BudgetCaps, RouterRuleSet } from "../router/types.js";

export const routerAdminRouter = Router();

routerAdminRouter.get("/router/admin/rules", async (_req, res) => {
  res.json(await getRules());
});

routerAdminRouter.put("/router/admin/rules", async (req, res) => {
  try {
    const payload = req.body as RouterRuleSet;
    if (!payload?.default_model || !Array.isArray(payload.routes)) {
      return res.status(400).json({ error: "Invalid rules payload" });
    }
    return res.json(await putRules(payload));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

routerAdminRouter.get("/router/admin/usage", async (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  const rows = await getUsage({
    tenant_id: req.query.tenant_id as string | undefined,
    agent_id: req.query.agent_id as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    limit: Number.isNaN(limit) ? 100 : limit
  });
  res.json({ usage: rows });
});

routerAdminRouter.get("/router/admin/budgets", async (_req, res) => {
  res.json(await getBudgets());
});

routerAdminRouter.put("/router/admin/budgets", async (req, res) => {
  try {
    const payload = req.body as BudgetCaps;
    if (typeof payload?.global_daily_cost_cap_usd !== "number") {
      return res.status(400).json({ error: "Invalid budgets payload" });
    }
    return res.json(await putBudgets(payload));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

routerAdminRouter.get("/router/metrics", async (_req, res) => {
  res.json(await getMetrics());
});
